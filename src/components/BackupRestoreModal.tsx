import React, { useState } from 'react';
import {
  X,
  Archive,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  FolderPlus,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { backupService } from '../services/backupService.js';
import { useGroup } from '../context/GroupContext.js';
import type { BackupSummaryPreview, ResearchGroup } from '../types/index.js';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentGroup, refreshGroups, selectGroup } = useGroup();

  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Restore states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [preview, setPreview] = useState<BackupSummaryPreview | null>(null);
  const [parsedPayload, setParsedPayload] = useState<any>(null);
  const [restoreMode, setRestoreMode] = useState<'new' | 'merge' | 'replace'>('new');
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportZip = async () => {
    if (!currentGroup) {
      setError('Please select an active research study first.');
      return;
    }

    try {
      setIsExporting(true);
      setError(null);
      setExportSuccess(null);

      const { blob, filename } = await backupService.exportFullStudyZip(currentGroup.id);
      backupService.downloadBlob(blob, filename);

      setExportSuccess(`Backup downloaded successfully as "${filename}".`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate study backup ZIP archive.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setSelectedFile(file);
    setError(null);
    setPreview(null);
    setParsedPayload(null);

    try {
      setIsValidating(true);
      const res = await backupService.inspectAndValidateZip(file);
      setPreview(res.preview);
      setParsedPayload(res.parsedPayload);
    } catch (err: any) {
      setError(err.message || 'Selected file is not a valid Thesis Case Tracker backup archive.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!parsedPayload) return;

    try {
      setIsRestoring(true);
      setError(null);

      const res = await backupService.executeRestore(
        parsedPayload,
        restoreMode,
        currentGroup?.id
      );

      setRestoreSuccess(
        `Restored successfully! "${res.group.name}" with ${res.casesRestored} records and ${res.filesRestored} documents.`
      );
      await refreshGroups();
      selectGroup(res.group.id);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to restore study from backup.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Backup & Restore</h3>
              <p className="text-xs text-slate-500">
                Safeguard, export, or reconstruct study data as structured ZIP archives.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => {
              setActiveTab('backup');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'backup'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Backup (ZIP)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('restore');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'restore'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore from Backup</span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* BACKUP TAB */}
        {activeTab === 'backup' && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
              <span className="font-bold text-slate-900 block">Complete Study Archive Package</span>
              <p className="text-slate-600 leading-relaxed">
                Generates an encrypted/structured ZIP archive containing:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-500 text-[11px]">
                <li><strong>backup-manifest.json</strong> — Integrity and format verification metadata</li>
                <li><strong>study.json</strong> — Study protocol definitions, settings, and institutions</li>
                <li><strong>cases.json</strong> — All registered participant records and status values</li>
                <li><strong>demographics.json</strong> — Ages, genders, departments, and custom study dates</li>
                <li><strong>files/</strong> — Attached protocol documents, surveys, and ethical clearance files</li>
              </ul>
            </div>

            {currentGroup ? (
              <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-2xl text-xs text-blue-900">
                <span className="font-bold">Active Study:</span> {currentGroup.name} (
                {currentGroup.targetSampleSize} target cases)
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800">
                No active study selected. Please select a study from your workspace before exporting.
              </div>
            )}

            {exportSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{exportSuccess}</span>
              </div>
            )}

            <button
              onClick={handleExportZip}
              disabled={isExporting || !currentGroup}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Packaging ZIP Archive...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Full Backup (ZIP)</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* RESTORE TAB */}
        {activeTab === 'restore' && (
          <div className="space-y-4">
            {/* File Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Select Backup Archive (.zip)
              </label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={handleFileSelected}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>

            {isValidating && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Validating archive integrity and manifest...</span>
              </div>
            )}

            {/* Preview Box */}
            {preview && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-900">Valid Backup Archive</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block font-semibold">Study Name</span>
                    <span className="font-bold text-slate-900 truncate block">{preview.studyName}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block font-semibold">Thesis Title</span>
                    <span className="font-bold text-slate-900 truncate block">{preview.studyTitle}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block font-semibold">Cases / Participants</span>
                    <span className="font-bold text-blue-600 text-sm">{preview.casesCount}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block font-semibold">Documents & Files</span>
                    <span className="font-bold text-purple-600 text-sm">{preview.filesCount}</span>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400">
                  Backup created on {new Date(preview.createdDate).toLocaleDateString()} by{' '}
                  {preview.manifest.createdByName}
                </p>

                {/* Restore Mode Selector */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Restoration Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setRestoreMode('new')}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        restoreMode === 'new'
                          ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <span className="block font-bold">Restore as New</span>
                      <span className="text-[10px] text-slate-500 block">Safest: creates new study</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestoreMode('merge')}
                      disabled={!currentGroup}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer disabled:opacity-40 ${
                        restoreMode === 'merge'
                          ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <span className="block font-bold">Merge</span>
                      <span className="text-[10px] text-slate-500 block">Add to active study</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestoreMode('replace')}
                      disabled={!currentGroup}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer disabled:opacity-40 ${
                        restoreMode === 'replace'
                          ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <span className="block font-bold">Replace</span>
                      <span className="text-[10px] text-slate-500 block">Overwrite active data</span>
                    </button>
                  </div>
                </div>

                {restoreMode === 'replace' && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Warning:</strong> Replacing will purge the current study cases and replace them with this backup archive.
                    </span>
                  </div>
                )}
              </div>
            )}

            {restoreSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{restoreSuccess}</span>
              </div>
            )}

            {preview && (
              <button
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Restoring Study Data...</span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-4 h-4" />
                    <span>Confirm and Restore Study</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
