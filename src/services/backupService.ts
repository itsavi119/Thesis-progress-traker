import JSZip from 'jszip';
import { api } from './api.js';
import type { BackupManifest, BackupSummaryPreview, ResearchGroup } from '../types/index.js';

export class BackupService {
  /**
   * Generates a complete ZIP archive for the active research study.
   */
  public async exportFullStudyZip(groupId: string): Promise<{ blob: Blob; filename: string }> {
    const data = await api.getGroupBackup(groupId);
    const zip = new JSZip();

    // 1. Manifest
    zip.file('backup-manifest.json', JSON.stringify(data.manifest, null, 2));

    // 2. Study details
    zip.file('study.json', JSON.stringify(data.group, null, 2));

    // 3. Complete case records
    zip.file('cases.json', JSON.stringify(data.cases, null, 2));

    // 4. Demographics export
    const demographics = data.cases.map((c) => ({
      caseId: c.id,
      patientId: c.patient_id,
      name: c.patient_name || '',
      age: c.age,
      gender: c.gender || '',
      department: c.department || '',
      location: c.location || '',
      admissionDate: c.admission_date || '',
      dischargeDate: c.discharge_date || '',
      lengthOfStay: c.length_of_stay,
    }));
    zip.file('demographics.json', JSON.stringify(demographics, null, 2));

    // 5. Research team members
    zip.file('members.json', JSON.stringify(data.members, null, 2));

    // 6. Files metadata and raw binary files
    const filesMeta = data.files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      category: f.category,
      uploadedBy: f.uploadedByName,
      uploadedAt: f.uploadedAt,
    }));
    zip.file('files-metadata.json', JSON.stringify(filesMeta, null, 2));

    const filesFolder = zip.folder('files');
    if (filesFolder) {
      for (const f of data.files) {
        if (f.fileData && f.fileData.includes(',')) {
          // Extract base64 payload from data URL
          const base64Content = f.fileData.split(',')[1];
          filesFolder.file(f.name, base64Content, { base64: true });
        }
      }
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeTitle = (data.group.name || 'study').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `THESIS-CASE-TRACKER-BACKUP-${safeTitle}-${dateStr}.zip`;

    return { blob: zipBlob, filename };
  }

  /**
   * Reads, parses, and validates an uploaded backup ZIP archive.
   */
  public async inspectAndValidateZip(file: File): Promise<{
    preview: BackupSummaryPreview;
    parsedPayload: any;
  }> {
    const zip = await JSZip.loadAsync(file);

    const manifestFile = zip.file('backup-manifest.json');
    if (!manifestFile) {
      throw new Error('Invalid backup archive: "backup-manifest.json" not found.');
    }

    const manifestRaw = await manifestFile.async('text');
    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      throw new Error('Backup validation failed: Corrupted manifest JSON.');
    }

    if (!manifest.formatVersion) {
      throw new Error('Unsupported backup archive format version.');
    }

    // Read study definition
    const studyFile = zip.file('study.json');
    let studyData: any = {};
    if (studyFile) {
      try {
        studyData = JSON.parse(await studyFile.async('text'));
      } catch {
        console.warn('Could not parse study.json');
      }
    }

    // Read cases
    const casesFile = zip.file('cases.json');
    let cases: any[] = [];
    if (casesFile) {
      try {
        cases = JSON.parse(await casesFile.async('text'));
      } catch {
        throw new Error('Backup validation failed: Corrupted cases JSON.');
      }
    }

    // Read files metadata
    const filesMetaFile = zip.file('files-metadata.json');
    let filesMeta: any[] = [];
    if (filesMetaFile) {
      try {
        filesMeta = JSON.parse(await filesMetaFile.async('text'));
      } catch {
        console.warn('Could not parse files-metadata.json');
      }
    }

    // Reconstruct files with data URLs if present in files/ folder
    const filesToRestore: any[] = [];
    const filesFolder = zip.folder('files');
    for (const fm of filesMeta) {
      let fileData: string | undefined;
      if (filesFolder) {
        const fileInZip = filesFolder.file(fm.name);
        if (fileInZip) {
          const base64 = await fileInZip.async('base64');
          fileData = `data:${fm.mimeType || 'application/octet-stream'};base64,${base64}`;
        }
      }
      filesToRestore.push({
        name: fm.name,
        size: fm.size || 0,
        mime_type: fm.mimeType || 'application/octet-stream',
        category: fm.category || 'other',
        file_data: fileData,
        created_at: fm.uploadedAt || new Date().toISOString(),
      });
    }

    const preview: BackupSummaryPreview = {
      manifest,
      casesCount: cases.length,
      filesCount: filesToRestore.length,
      studyTitle: studyData.studyTitle || manifest.studyTitle || 'Untitled Study',
      studyName: studyData.name || manifest.studyName || 'Restored Study',
      createdDate: manifest.createdAt || new Date().toISOString(),
    };

    const parsedPayload = {
      manifest,
      group: studyData,
      cases,
      files: filesToRestore,
    };

    return { preview, parsedPayload };
  }

  /**
   * Triggers restoration on the server.
   */
  public async executeRestore(
    parsedPayload: any,
    mode: 'new' | 'merge' | 'replace',
    targetGroupId?: string
  ): Promise<{ success: boolean; group: ResearchGroup; casesRestored: number; filesRestored: number }> {
    return api.restoreGroupBackup({
      manifest: parsedPayload.manifest,
      group: parsedPayload.group,
      cases: parsedPayload.cases,
      files: parsedPayload.files,
      mode,
      targetGroupId,
    });
  }

  /**
   * Helper to trigger download in browser.
   */
  public downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const backupService = new BackupService();
