import React, { useState, useEffect } from 'react';
import { X, Users, AlertCircle, CheckCircle2, Plus, Trash2, FolderPlus, HelpCircle } from 'lucide-react';
import { useGroup } from '../context/GroupContext.js';
import { api } from '../services/api.js';
import type { CustomFieldDefinition, Organization, StudyType, SubjectTerminology } from '../types/index.js';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
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

const TERMINOLOGIES: SubjectTerminology[] = ['Patient', 'Participant', 'Subject', 'Case', 'Record'];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { createGroup } = useGroup();
  const [name, setName] = useState('');
  const [studyTitle, setStudyTitle] = useState('');
  const [studyType, setStudyType] = useState<StudyType>('Clinical Pharmacy');
  const [subjectTerminology, setSubjectTerminology] = useState<SubjectTerminology>('Patient');
  const [targetSampleSize, setTargetSampleSize] = useState('100');
  const [institution, setInstitution] = useState('');
  const [description, setDescription] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  // Custom fields configuration
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean'>('text');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    api.getUserOrganizations().then((res) => {
      setOrganizations(res.organizations);
    }).catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddCustomField = () => {
    if (!newFieldName.trim()) return;
    const fieldId = newFieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (customFields.some((f) => f.id === fieldId)) {
      setError('A field with this name already exists.');
      return;
    }
    setCustomFields([
      ...customFields,
      {
        id: fieldId,
        name: newFieldName.trim(),
        type: newFieldType,
      },
    ]);
    setNewFieldName('');
    setError(null);
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields(customFields.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a Study / Research Group Name.');
      return;
    }
    if (!studyTitle.trim()) {
      setError('Please enter the Study / Thesis Title.');
      return;
    }
    const target = parseInt(targetSampleSize, 10);
    if (isNaN(target) || target <= 0) {
      setError('Target sample size must be a valid positive number.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await createGroup({
        name: name.trim(),
        studyTitle: studyTitle.trim(),
        studyType,
        subjectTerminology,
        targetSampleSize: target,
        institution: institution.trim() || undefined,
        description: description.trim() || undefined,
        organizationId: selectedOrgId || undefined,
        customFields: customFields.length > 0 ? customFields : undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create research study.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Create New Research Study</h3>
              <p className="text-xs text-slate-500">Configurable for any thesis, trial, survey, or research project</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Study / Group Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Post-MI Beta Blocker Trial"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Thesis / Study Title <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={studyTitle}
              onChange={(e) => setStudyTitle(e.target.value)}
              placeholder="e.g., Evaluating Long-Term Pharmacotherapeutic Adherence and Clinical Outcomes in Hospitalized Patients"
              required
              rows={2}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Study Methodology / Type
              </label>
              <select
                value={studyType}
                onChange={(e) => setStudyType(e.target.value as StudyType)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 transition-colors"
              >
                {STUDY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Subject Terminology
              </label>
              <select
                value={subjectTerminology}
                onChange={(e) => setSubjectTerminology(e.target.value as SubjectTerminology)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 transition-colors"
              >
                {TERMINOLOGIES.map((t) => (
                  <option key={t} value={t}>
                    {t} (e.g., &ldquo;{t} ID&rdquo;)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Target Sample Size <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="1000000"
                value={targetSampleSize}
                onChange={(e) => setTargetSampleSize(e.target.value)}
                placeholder="e.g. 50, 150, 220, 500, 1000"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors"
              />
              <p className="text-[11px] text-slate-400 mt-1">Accepts any positive sample size</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Institution / Department (Optional)
              </label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g., Department of Pharmacy / Medical College"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors"
              />
            </div>
          </div>

          {organizations.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Parent Organization (Optional)
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
              >
                <option value="">None / Standalone Study</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Description & Objectives (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief study aims, protocol notes, or ethical approval reference"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors"
            />
          </div>

          {/* Custom Fields Accordion */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">Study Custom Data Fields</p>
                <p className="text-[11px] text-slate-500">
                  Add custom parameters to collect (e.g., Age, Questionnaire Score, Dosage)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomFields(!showCustomFields)}
                className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
              >
                {showCustomFields ? 'Hide' : `Configure (${customFields.length})`}
              </button>
            </div>

            {showCustomFields && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="Field name (e.g. Survey Score)"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                  />
                  <select
                    value={newFieldType}
                    onChange={(e: any) => setNewFieldType(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="textarea">Long Text</option>
                    <option value="boolean">Yes / No</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {customFields.length > 0 && (
                  <div className="space-y-1.5">
                    {customFields.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-200 text-xs"
                      >
                        <span className="font-semibold text-slate-800">{f.name} <span className="text-slate-400 font-normal">({f.type})</span></span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomField(f.id)}
                          className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong>Open Research Collaboration:</strong> Study owners can invite any number of co-investigators without artificial member limits.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 cursor-pointer transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Study...' : 'Create Research Study'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
