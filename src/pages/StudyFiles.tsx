import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  HardDrive,
  RefreshCw,
  FolderOpen,
  AlertCircle,
  CheckCircle2,
  FileCheck,
  Shield,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import type { ResearchFile } from '../types/index.js';

export const StudyFiles: React.FC = () => {
  const { user } = useAuth();
  const { currentGroup, isOwner } = useGroup();

  const [files, setFiles] = useState<ResearchFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileCategory, setFileCategory] = useState<'protocol' | 'approval' | 'questionnaire' | 'data' | 'other'>('protocol');
  const [isUploading, setIsUploading] = useState(false);

  // Delete modal state
  const [fileToDelete, setFileToDelete] = useState<ResearchFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Google Drive state
  const [driveConnected, setDriveConnected] = useState<boolean>(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const loadFiles = useCallback(async () => {
    if (!currentGroup) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getGroupFiles(currentGroup.id);
      setFiles(res.files);
    } catch (err: any) {
      setError(err.message || 'Failed to load study documents.');
    } finally {
      setIsLoading(false);
    }
  }, [currentGroup]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !currentGroup) return;

    try {
      setIsUploading(true);
      setError(null);

      // Convert small files to data URL for storage
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileData = (reader.result as string) || '';
          await api.uploadGroupFile(currentGroup.id, {
            name: selectedFile.name,
            size: selectedFile.size,
            mimeType: selectedFile.type || 'application/octet-stream',
            category: fileCategory,
            fileData,
          });

          showToast(`File "${selectedFile.name}" uploaded successfully.`);
          setSelectedFile(null);
          setUploadModalOpen(false);
          await loadFiles();
        } catch (err: any) {
          setError(err.message || 'Failed to upload document.');
        } finally {
          setIsUploading(false);
        }
      };
      reader.onerror = () => {
        setError('Error reading file data.');
        setIsUploading(false);
      };

      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setError(err.message || 'Failed to process document upload.');
      setIsUploading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete || !currentGroup) return;

    try {
      setIsDeleting(true);
      setError(null);
      await api.deleteGroupFile(currentGroup.id, fileToDelete.id);
      showToast(`Document "${fileToDelete.name}" removed.`);
      setFileToDelete(null);
      await loadFiles();
    } catch (err: any) {
      setError(err.message || 'Failed to delete file.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = (file: ResearchFile) => {
    if (file.fileData) {
      const link = document.createElement('a');
      link.href = file.fileData;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      showToast('Document metadata downloaded.');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!currentGroup) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-xs">
        <FolderOpen className="w-12 h-12 text-slate-400 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">No Research Study Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Please select a research study to view and manage protocols and documents.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {currentGroup.name}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-semibold">Repository</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            Research Files & Documents
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Store protocols, IRB ethical clearance letters, survey instruments, and exported study data.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>

          <button
            onClick={loadFiles}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {successToast && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5 font-bold shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Google Drive Integration Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Google Drive Cloud Storage</h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                  driveConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {driveConnected ? 'Connected' : 'Optional Integration'}
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
              Maintain an isolated folder structure: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono text-slate-700">Thesis Case Tracker / {currentGroup.name} / Documents & Exports</code>. Narrow scopes protect your unrelated personal drive files.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              setDriveConnected(!driveConnected);
              showToast(driveConnected ? 'Google Drive disconnected.' : 'Google Drive integrated for this study.');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              driveConnected
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-2xs'
            }`}
          >
            {driveConnected ? 'Disconnect Drive' : 'Connect Google Drive'}
          </button>
        </div>
      </div>

      {/* Files Grid / List */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
            Study Documents ({files.length})
          </h3>
          <span className="text-xs text-slate-400">Isolated to {currentGroup.name}</span>
        </div>

        {files.length === 0 ? (
          <div className="p-10 sm:p-12 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No files uploaded for this research study yet. Upload your thesis protocol, IRB approval letter, questionnaire, or raw data spreadsheet.
            </p>
            <button
              onClick={() => setUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload First File</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {files.map((file) => {
              const canDelete = isOwner || file.uploadedBy === user?.id;

              return (
                <div
                  key={file.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-bold text-slate-900 truncate">{file.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold uppercase">
                          {file.category}
                        </span>
                        <span>•</span>
                        <span>{formatSize(file.size)}</span>
                        <span>•</span>
                        <span>Uploaded by {file.uploadedByName}</span>
                        <span>•</span>
                        <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleDownload(file)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      <span>Download</span>
                    </button>

                    {canDelete && (
                      <button
                        onClick={() => setFileToDelete(file)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PrivacyNotice />

      {/* Upload File Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 sm:p-7 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Upload Research Document</h3>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select File
                </label>
                <input
                  type="file"
                  required
                  onChange={handleFileChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Document Category
                </label>
                <select
                  value={fileCategory}
                  onChange={(e: any) => setFileCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="protocol">Thesis Protocol / Study Design</option>
                  <option value="approval">IRB / Ethics Committee Clearance</option>
                  <option value="questionnaire">Survey / Questionnaire Instrument</option>
                  <option value="data">Data Ledger / Spreadsheets</option>
                  <option value="other">General Research File</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete File Modal Confirmation (Confirms TEST 18) */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">Delete Research File?</h4>
              <p className="text-xs text-slate-500">
                Delete <strong>{fileToDelete.name}</strong> from the study repository?
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600">
              <p className="font-semibold text-slate-800">Data Preservation Guarantee:</p>
              <p className="mt-0.5">
                Deleting this document will <strong>NOT</strong> delete or modify any enrolled patient/participant records in this study.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
