import React, { useState } from 'react';
import {
  X,
  Settings,
  Trash2,
  AlertTriangle,
  Save,
  Archive,
  HardDrive,
  CheckCircle2,
  Building2,
  BookOpen,
  Target,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useGroup } from '../context/GroupContext.js';
import { BackupRestoreModal } from './BackupRestoreModal.js';
import type { StudyType, SubjectTerminology } from '../types/index.js';

interface StudySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

const STUDY_TYPES: StudyType[] = [
  'Clinical Pharmacy',
  'Observational',
  'Prospective',
  'Retrospective',
  'Interventional',
  'Survey',
  'Pharmacoeconomic',
  'Epidemiological',
  'Custom',
];

const TERMINOLOGIES: SubjectTerminology[] = [
  'Patient',
  'Participant',
  'Subject',
  'Case',
  'Record',
];

export const StudySettingsModal: React.FC<StudySettingsModalProps> = ({
  isOpen,
  onClose,
  onDeleted,
}) => {
  const { currentGroup, isOwner, refreshGroups, deleteGroup } = useGroup();

  const [name, setName] = useState<string>(currentGroup?.name || '');
  const [studyTitle, setStudyTitle] = useState<string>(currentGroup?.studyTitle || '');
  const [description, setDescription] = useState<string>(currentGroup?.description || '');
  const [institution, setInstitution] = useState<string>(currentGroup?.institution || '');
  const [targetSampleSize, setTargetSampleSize] = useState<string>(
    String(currentGroup?.targetSampleSize || 100)
  );
  const [studyType, setStudyType] = useState<StudyType>(
    currentGroup?.studyType || 'Clinical Pharmacy'
  );
  const [subjectTerminology, setSubjectTerminology] = useState<SubjectTerminology>(
    currentGroup?.subjectTerminology || 'Patient'
  );

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Danger zone: Delete Study
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Backup modal
  const [backupModalOpen, setBackupModalOpen] = useState<boolean>(false);

  if (!isOpen || !currentGroup) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Study / Group Name is required.');
      return;
    }
    if (!studyTitle.trim()) {
      setError('Study / Thesis Title is required.');
      return;
    }
    const target = parseInt(targetSampleSize, 10);
    if (isNaN(target) || target <= 0) {
      setError('Target sample size must be a valid positive number.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await api.updateGroupSettings(currentGroup.id, {
        name: name.trim(),
        studyTitle: studyTitle.trim(),
        description: description.trim() || undefined,
        institution: institution.trim() || undefined,
        targetSampleSize: target,
        studyType,
        subjectTerminology,
      });

      setSuccessToast('Study settings updated successfully.');
      await refreshGroups();
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update study settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (confirmInput.trim() !== currentGroup.name.trim()) {
      setError('Confirmation name does not match.');
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      await deleteGroup(currentGroup.id);
      setDeleteConfirmOpen(false);
      onClose();
      onDeleted?.();
    } catch (err: any) {
      setError(err.message || 'Failed to delete study.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
        <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Study Settings</h3>
                <p className="text-xs text-slate-500">
                  Manage configuration, sample size, backups, and study lifecycle.
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

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successToast && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* Settings Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Study / Group Name *
              </label>
              <input
                type="text"
                required
                disabled={!isOwner}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Thesis / Study Title *
              </label>
              <textarea
                required
                rows={2}
                disabled={!isOwner}
                value={studyTitle}
                onChange={(e) => setStudyTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Study Methodology Type
                </label>
                <select
                  disabled={!isOwner}
                  value={studyType}
                  onChange={(e) => setStudyType(e.target.value as StudyType)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-60 cursor-pointer"
                >
                  {STUDY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subject Terminology
                </label>
                <select
                  disabled={!isOwner}
                  value={subjectTerminology}
                  onChange={(e) => setSubjectTerminology(e.target.value as SubjectTerminology)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-60 cursor-pointer"
                >
                  {TERMINOLOGIES.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Sample Size *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  disabled={!isOwner}
                  value={targetSampleSize}
                  onChange={(e) => setTargetSampleSize(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Hospital / Institution (Optional)
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Description / Objectives (Optional)
              </label>
              <textarea
                rows={2}
                disabled={!isOwner}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional study protocol background..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-60"
              />
            </div>

            {isOwner && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            )}
          </form>

          {/* Backup & Export quick link */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Backup & Archival</h4>
              <p className="text-[11px] text-slate-500">
                Download a complete ZIP package with all study cases, demographics, and files.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBackupModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5 text-blue-600" />
              <span>Open Backup & Restore</span>
            </button>
          </div>

          {/* DANGER ZONE: Delete Study (Owner Only) */}
          {isOwner && (
            <div className="pt-4 border-t border-rose-100 space-y-3">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="w-4 h-4" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Danger Zone</h4>
              </div>

              <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-rose-900 block">Delete Study / Group</span>
                  <p className="text-[11px] text-rose-700 leading-relaxed max-w-sm">
                    Permanently delete this study and its associated records. This action cannot be undone. Download a backup first if you may need this data.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmOpen(true);
                    setConfirmInput('');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-rose-500/20 cursor-pointer self-start sm:self-auto shrink-0"
                >
                  Delete Study
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Delete Group (Double Confirmation by typing group name) */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h4 className="text-base font-bold text-slate-900">
                Delete &ldquo;{currentGroup.name}&rdquo;?
              </h4>
              <p className="text-xs text-rose-700">
                This is a destructive action. All cases and files associated with this study will be permanently deleted. Other research studies in the platform will remain completely untouched.
              </p>
            </div>

            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
              <span className="block font-semibold">
                Please type the exact study name to confirm:
              </span>
              <span className="font-mono text-slate-900 font-bold select-all bg-white px-2 py-0.5 rounded border border-slate-300 block">
                {currentGroup.name}
              </span>
            </div>

            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="Type study name to confirm..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-rose-600 rounded-xl text-xs font-medium text-slate-900 focus:outline-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmInput.trim() !== currentGroup.name.trim() || isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Modal */}
      <BackupRestoreModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        onSuccess={() => {
          setBackupModalOpen(false);
          refreshGroups();
        }}
      />
    </>
  );
};
