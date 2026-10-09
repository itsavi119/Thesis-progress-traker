import firebaseConfig from '../../firebase-applet-config.json';
import { auth, googleProvider } from '../firebase/config.js';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// In-memory token cache (never stored in localStorage or sessionStorage per security guidelines)
let cachedDriveAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface DriveFolderResult {
  rootFolderId: string;
  studyFolderId: string;
  studyFolderLink: string;
}

export const googleDriveService = {
  // Check if token is available in memory and still valid
  isConnected(): boolean {
    return !!cachedDriveAccessToken && Date.now() < tokenExpiresAt - 60000;
  },

  getAccessToken(): string | null {
    if (this.isConnected()) {
      return cachedDriveAccessToken;
    }
    return null;
  },

  disconnect() {
    cachedDriveAccessToken = null;
    tokenExpiresAt = 0;
  },

  // Authorize Google Drive access directly in the user's browser
  async connectDrive(): Promise<string> {
    if (this.isConnected()) {
      return cachedDriveAccessToken!;
    }

    // Strategy 1: Google Identity Services (GIS) token client if available in browser
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2 && firebaseConfig.oAuthClientId) {
      try {
        const token = await new Promise<string>((resolve, reject) => {
          try {
            const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
              client_id: firebaseConfig.oAuthClientId,
              scope: SCOPES.join(' '),
              callback: (response: any) => {
                if (response.error) {
                  reject(new Error(response.error_description || response.error));
                  return;
                }
                const expiresInSec = parseInt(response.expires_in, 10) || 3600;
                cachedDriveAccessToken = response.access_token;
                tokenExpiresAt = Date.now() + expiresInSec * 1000;
                resolve(response.access_token);
              },
            });
            tokenClient.requestAccessToken({ prompt: '' });
          } catch (gisInitErr) {
            reject(gisInitErr);
          }
        });

        if (token) return token;
      } catch (gisErr) {
        console.warn('GIS drive token request fallback to Firebase Auth:', gisErr);
      }
    }

    // Strategy 2: Firebase Auth signInWithPopup with drive.file scope
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.setCustomParameters({ prompt: 'consent' });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Google Drive authorization did not return an access token.');
      }

      cachedDriveAccessToken = credential.accessToken;
      tokenExpiresAt = Date.now() + 3600 * 1000;
      return cachedDriveAccessToken;
    } catch (err: any) {
      console.error('Failed to connect Google Drive:', err);
      throw new Error(err.message || 'Failed to authenticate with Google Drive.');
    }
  },

  // Ensure root "Thesis Progress Tracker" and study folder exist in user's Drive
  async getOrCreateStudyFolder(studyName: string): Promise<DriveFolderResult> {
    const token = await this.connectDrive();
    const sanitizedStudyName = studyName.trim() || 'General Research Study';

    // 1. Locate or create root folder "Thesis Progress Tracker"
    const rootQuery = encodeURIComponent(
      "mimeType = 'application/vnd.google-apps.folder' and name = 'Thesis Progress Tracker' and trashed = false"
    );
    const rootRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${rootQuery}&fields=files(id,name,webViewLink)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const rootData = await rootRes.json();
    let rootFolderId = rootData.files?.[0]?.id;

    if (!rootFolderId) {
      const createRootRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Thesis Progress Tracker',
          mimeType: 'application/vnd.google-apps.folder',
          description: 'Root folder for Thesis Case Tracker study documents and exports',
        }),
      });
      const newRoot = await createRootRes.json();
      rootFolderId = newRoot.id;
    }

    // 2. Locate or create study subfolder
    const studyQuery = encodeURIComponent(
      `mimeType = 'application/vnd.google-apps.folder' and name = '${sanitizedStudyName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and trashed = false`
    );
    const studyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${studyQuery}&fields=files(id,name,webViewLink)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const studyData = await studyRes.json();
    let studyFolderId = studyData.files?.[0]?.id;
    let studyFolderLink = studyData.files?.[0]?.webViewLink;

    if (!studyFolderId) {
      const createStudyRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: sanitizedStudyName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
          description: `Research study folder for ${sanitizedStudyName}`,
        }),
      });
      const newStudy = await createStudyRes.json();
      studyFolderId = newStudy.id;
      studyFolderLink = newStudy.webViewLink;
    }

    return {
      rootFolderId,
      studyFolderId,
      studyFolderLink: studyFolderLink || `https://drive.google.com/drive/folders/${studyFolderId}`,
    };
  },

  // Upload file directly from browser to user's Google Drive (server is completely bypassed)
  async uploadFileDirectToDrive(params: {
    studyName: string;
    file: File | Blob;
    fileName: string;
    mimeType?: string;
  }): Promise<{ fileId: string; name: string; webViewLink: string; size: number }> {
    const token = await this.connectDrive();
    const folder = await this.getOrCreateStudyFolder(params.studyName);

    const metadata = {
      name: params.fileName,
      parents: [folder.studyFolderId],
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const fileBuffer = await params.file.arrayBuffer();
    const contentType = params.mimeType || (params.file as File).type || 'application/octet-stream';

    // Construct multipart payload
    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const fileHeaderPart = `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;

    const enc = new TextEncoder();
    const part1 = enc.encode(metadataPart);
    const part2 = enc.encode(fileHeaderPart);
    const part3 = new Uint8Array(fileBuffer);
    const part4 = enc.encode(closeDelimiter);

    const fullPayload = new Uint8Array(part1.length + part2.length + part3.length + part4.length);
    fullPayload.set(part1, 0);
    fullPayload.set(part2, part1.length);
    fullPayload.set(part3, part1.length + part2.length);
    fullPayload.set(part4, part1.length + part2.length + part3.length);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: fullPayload,
      }
    );

    if (!uploadRes.ok) {
      const errJson = await uploadRes.json().catch(() => ({}));
      throw new Error(errJson.error?.message || 'Direct upload to Google Drive failed.');
    }

    const uploaded = await uploadRes.json();
    return {
      fileId: uploaded.id,
      name: uploaded.name,
      webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      size: parseInt(uploaded.size, 10) || fullPayload.length,
    };
  },

  // Save CSV Case Ledger export directly into user's Google Drive
  async saveCsvExportToDrive(params: {
    studyName: string;
    csvContent: string;
    fileName: string;
  }): Promise<{ fileId: string; webViewLink: string; name: string }> {
    const blob = new Blob([params.csvContent], { type: 'text/csv;charset=utf-8;' });
    const result = await this.uploadFileDirectToDrive({
      studyName: params.studyName,
      file: blob,
      fileName: params.fileName,
      mimeType: 'text/csv',
    });

    return {
      fileId: result.fileId,
      name: result.name,
      webViewLink: result.webViewLink,
    };
  },

  // List files residing in the study's Google Drive folder
  async listStudyFilesFromDrive(studyName: string): Promise<{ folderLink: string; files: DriveFileItem[] }> {
    const token = await this.connectDrive();
    const folder = await this.getOrCreateStudyFolder(studyName);

    const query = encodeURIComponent(`'${folder.studyFolderId}' in parents and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      throw new Error('Failed to retrieve files from Google Drive.');
    }

    const data = await res.json();
    return {
      folderLink: folder.studyFolderLink,
      files: data.files || [],
    };
  },

  // Delete file from Google Drive (Mandatory user confirmation enforced at component level)
  async deleteFile(fileId: string): Promise<void> {
    const token = await this.connectDrive();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to remove file from Google Drive.');
    }
  },
};
