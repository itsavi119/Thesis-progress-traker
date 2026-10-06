import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Layers,
  ArrowRight,
  Trash2,
  Edit3,
  Stethoscope,
  Pill,
  User,
  X,
  AlertTriangle,
  Search,
  FileSpreadsheet,
  Building2,
  MapPin,
  Calendar,
  FileText,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import type { CaseRecord, CaseStatus } from '../types/index.js';

interface MyCasesProps {
  onNavigateToAddPatient: () => void;
}

export const MyCases: React.FC<MyCasesProps> = ({ onNavigateToAddPatient }) => {
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Delete modal state
  const [caseToDelete, setCaseToDelete] = useState<CaseRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Edit details modal state
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [editPatientName, setEditPatientName] = useState<string>('');
  const [editDiagnosis, setEditDiagnosis] = useState<string>('');
  const [editDrugNames, setEditDrugNames] = useState<string>('');
  const [editAge, setEditAge] = useState<string>('');
  const [editGender, setEditGender] = useState<string>('Male');
  const [editDepartment, setEditDepartment] = useState<string>('');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editAdmissionDate, setEditAdmissionDate] = useState<string>('');
  const [editDischargeDate, setEditDischargeDate] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSavingDetails, setIsSavingDetails] = useState<boolean>(false);

  const editDerivedStay = useMemo(() => {
    if (!editAdmissionDate || !editDischargeDate) return null;
    const a = new Date(editAdmissionDate);
    const d = new Date(editDischargeDate);
    if (isNaN(a.getTime()) || isNaN(d.getTime())) return null;
    const diff = Math.round((d.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : null;
  }, [editAdmissionDate, editDischargeDate]);

  const loadData = useCallback(async () => {
    if (!currentGroup) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await api.getMyCases({ groupId: currentGroup.id });
      setCases(res.cases);
    } catch (err: any) {
      setError(err.message || 'Failed to load your assigned cases.');
    } finally {
      setIsLoading(false);
    }
  }, [currentGroup]);

  useEffect(() => {
    loadData();

    if (!currentGroup) return;

    // Subscribe to realtime database updates for active group
    const unsubscribe = api.subscribeToRealtime(currentGroup.id, (event) => {
      if (event === 'case_registered' || event === 'case_status_updated' || event === 'case_deleted') {
        loadData();
      }
    });

    return () => unsubscribe();
  }, [loadData, currentGroup]);

  const handleStatusChange = async (caseId: string, newStatus: CaseStatus) => {
    if (!currentGroup) return;
    setIsUpdatingId(caseId);
    setError(null);
    try {
      await api.updateCaseStatus(caseId, newStatus, currentGroup.id);
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, status: newStatus } : c))
      );
      setSuccessToast(`Case status updated to "${newStatus}"`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update case status.');
    } finally {
      setIsUpdatingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!caseToDelete || !currentGroup) return;
    setIsDeleting(true);
    setError(null);

    try {
      await api.deleteCase(caseToDelete.id, currentGroup.id);
      setCases((prev) => prev.filter((c) => c.id !== caseToDelete.id));
      setSuccessToast(`Incorrect Patient ID "${caseToDelete.patient_id}" removed successfully.`);
      setCaseToDelete(null);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to remove case record.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenEdit = (c: CaseRecord) => {
    setEditingCase(c);
    setEditPatientName(c.patient_name || '');
    setEditDiagnosis(c.diagnosis || '');
    setEditDrugNames(c.drug_names || '');
    setEditAge(c.age !== undefined && c.age !== null ? String(c.age) : '');
    setEditGender(c.gender || 'Male');
    setEditDepartment(c.department || '');
    setEditLocation(c.location || '');
    setEditAdmissionDate(c.admission_date ? c.admission_date.split('T')[0] : '');
    setEditDischargeDate(c.discharge_date ? c.discharge_date.split('T')[0] : '');
    setEditNotes(c.notes || '');
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCase || !currentGroup) return;
    setIsSavingDetails(true);
    setError(null);

    try {
      const parsedAge = editAge.trim() ? parseInt(editAge.trim(), 10) : undefined;
      const res = await api.updateCaseDetails(
        editingCase.id,
        {
          patientName: editPatientName.trim() || undefined,
          diagnosis: editDiagnosis.trim() || undefined,
          drugNames: editDrugNames.trim() || undefined,
          age: !isNaN(parsedAge as any) ? parsedAge : undefined,
          gender: editGender || undefined,
          department: editDepartment.trim() || undefined,
          location: editLocation.trim() || undefined,
          admissionDate: editAdmissionDate || undefined,
          dischargeDate: editDischargeDate || undefined,
          notes: editNotes.trim() || undefined,
        },
        currentGroup.id
      );

      setCases((prev) =>
        prev.map((c) => (c.id === editingCase.id ? res.case : c))
      );
      setSuccessToast(`Clinical details saved for Patient ID "${editingCase.patient_id}".`);
      setEditingCase(null);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save clinical details.');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const total = cases.length;
  const inProgress = cases.filter((c) => c.status === 'In Progress').length;
  const completed = cases.filter((c) => c.status === 'Completed').length;
  const excluded = cases.filter((c) => c.status === 'Excluded').length;

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (selectedStatus !== 'ALL' && c.status !== selectedStatus) {
        return false;
      }
      if (!search.trim()) {
        return true;
      }
      const q = search.trim().toLowerCase();
      const normalizedQ = q.replace(/\s+/g, '');
      const matchesId =
        c.patient_id.toLowerCase().includes(q) ||
        c.normalized_patient_id.toLowerCase().includes(normalizedQ);
      const matchesName = c.patient_name
        ? c.patient_name.toLowerCase().includes(q)
        : false;
      return matchesId || matchesName;
    });
  }, [cases, search, selectedStatus]);

  if (!currentGroup) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-slate-900">No Research Group Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Please select a research group to view and manage your registered patient cases.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {currentGroup.name}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-medium">My Cases</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">My Cases</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Cases registered by you ({user?.display_name}) in {currentGroup.name}. You can update statuses, add clinical details, or remove incorrect IDs.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="self-start sm:self-center flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Dynamic Counts Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>Total Assigned</span>
            <Layers className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{total}</div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>In Progress</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700 tracking-tight">{inProgress}</div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 tracking-tight">{completed}</div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>Excluded</span>
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-700 tracking-tight">{excluded}</div>
        </div>
      </div>

      {successToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SEARCH & FILTER BAR */}
      {cases.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="md:col-span-8 relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Patient ID or Name..."
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status Dropdown */}
            <div className="md:col-span-4">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 transition-colors cursor-pointer font-medium"
              >
                <option value="ALL">All Statuses ({total})</option>
                <option value="In Progress">In Progress ({inProgress})</option>
                <option value="Completed">Completed ({completed})</option>
                <option value="Excluded">Excluded ({excluded})</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span>Showing {filteredCases.length} of {total} case{total === 1 ? '' : 's'}</span>
              {search && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium text-[11px] border border-blue-200">
                  <span>Matching &ldquo;{search}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="hover:text-blue-900 cursor-pointer"
                    title="Clear search query"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
            {(search || selectedStatus !== 'ALL') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedStatus('ALL');
                }}
                className="text-blue-600 hover:underline cursor-pointer font-semibold"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* CASES LIST */}
      {cases.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <UserCheck className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">You have not registered any cases yet.</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              When you check and register a Patient ID at the hospital, it will appear here under your ownership.
            </p>
          </div>
          <button
            onClick={onNavigateToAddPatient}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 cursor-pointer transition-colors"
          >
            <span>Register a Patient ID</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {search ? `No cases match "${search}"` : 'No cases match the selected status filter.'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {search
                ? 'Try searching by a different Patient ID or patient name.'
                : 'Try changing or clearing your status filter.'}
            </p>
          </div>
          <button
            onClick={() => {
              setSearch('');
              setSelectedStatus('ALL');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Search & Filters</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCases.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col gap-3 hover:border-slate-300 transition-all shadow-xs"
            >
              {/* Top Row: Patient ID, Status Pill, and Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-bold text-lg text-slate-900 tracking-wide">
                    {c.patient_id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      c.status === 'Completed'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : c.status === 'Excluded'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.patient_name && (
                    <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {c.patient_name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {/* Status Dropdown */}
                  <select
                    disabled={isUpdatingId === c.id}
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value as CaseStatus)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 cursor-pointer disabled:opacity-50"
                  >
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Excluded">Excluded</option>
                  </select>

                  {/* Edit Clinical Notes Button */}
                  <button
                    onClick={() => handleOpenEdit(c)}
                    title="Edit Patient Name, Diagnosis, or Drugs"
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Details</span>
                  </button>

                  {/* Remove Incorrect ID Button */}
                  <button
                    onClick={() => setCaseToDelete(c)}
                    title="Remove Incorrect Patient ID"
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span className="hidden sm:inline">Remove Incorrect ID</span>
                  </button>
                </div>
              </div>

              {/* Optional Clinical Details Row (if present) */}
              {(c.diagnosis || c.drug_names || c.department || c.location || c.age !== undefined || c.gender || c.admission_date || c.discharge_date || c.length_of_stay !== undefined || c.notes) && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                  {/* Demographics & Location Badges */}
                  {(c.age !== undefined || c.gender || c.department || c.location || c.length_of_stay !== undefined) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {(c.age !== undefined || c.gender) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-semibold">
                          <User className="w-3 h-3 text-blue-600" />
                          <span>
                            {c.age !== undefined ? `${c.age} yrs` : ''}
                            {c.age !== undefined && c.gender ? ' • ' : ''}
                            {c.gender || ''}
                          </span>
                        </span>
                      )}
                      {c.department && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-medium">
                          <Building2 className="w-3 h-3 text-purple-600" />
                          <span>Dept: {c.department}</span>
                        </span>
                      )}
                      {c.location && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                          <MapPin className="w-3 h-3 text-amber-600" />
                          <span>Loc: {c.location}</span>
                        </span>
                      )}
                      {c.length_of_stay !== undefined && c.length_of_stay !== null && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          <span>Stay: {c.length_of_stay} {c.length_of_stay === 1 ? 'day' : 'days'}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Diagnosis and Drugs */}
                  {(c.diagnosis || c.drug_names) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                      {c.diagnosis && (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Stethoscope className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="font-semibold text-slate-500">Diagnosis:</span>
                          <span className="font-medium truncate">{c.diagnosis}</span>
                        </div>
                      )}
                      {c.drug_names && (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Pill className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span className="font-semibold text-slate-500">Drugs:</span>
                          <span className="font-medium truncate">{c.drug_names}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Study Dates & Notes */}
                  {(c.admission_date || c.discharge_date || c.notes) && (
                    <div className="space-y-1 pt-1 border-t border-slate-200/60 text-[11px] text-slate-600">
                      {(c.admission_date || c.discharge_date) && (
                        <div className="flex items-center gap-2 flex-wrap text-slate-500">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          {c.admission_date && (
                            <span>Admitted: {new Date(c.admission_date).toLocaleDateString()}</span>
                          )}
                          {c.discharge_date && (
                            <span>Discharged: {new Date(c.discharge_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      )}
                      {c.notes && (
                        <div className="flex items-start gap-1.5 text-slate-600">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <span className="italic line-clamp-2">{c.notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Metadata */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>
                  Registered:{' '}
                  {new Date(c.registered_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-slate-300">•</span>
                <span>Owner: You ({user?.display_name})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONFIRM DELETE MODAL (Remove Incorrect ID) */}
      {caseToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-300 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Remove Incorrect Patient ID?</h3>
                <p className="text-xs text-rose-700 font-medium">Delete accidental entry or typo</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient ID to delete:</span>
                <span className="font-mono font-bold text-slate-900">{caseToDelete.patient_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned To:</span>
                <span className="font-medium text-slate-800">{user?.display_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold text-slate-800">{caseToDelete.status}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will remove this case record so the correct Patient ID can be registered without collision.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setCaseToDelete(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <span>Removing...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Remove ID</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CLINICAL & DEMOGRAPHIC DETAILS MODAL */}
      {editingCase && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Case Details & Demographics
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Patient ID: <span className="font-bold text-slate-800">{editingCase.patient_id}</span>
                </p>
              </div>
              <button
                onClick={() => setEditingCase(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={editPatientName}
                  onChange={(e) => setEditPatientName(e.target.value)}
                  placeholder="e.g. Patient full name or initials"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Demographics: Age & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Age <span className="text-slate-400 font-normal">(Years)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="130"
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Department & Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    placeholder="e.g. Cardiology, ICU"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Location / Ward <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="e.g. Ward 4B, Bed 12"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Diagnosis <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={editDiagnosis}
                  onChange={(e) => setEditDiagnosis(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes, Acute Coronary Syndrome"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Drug Names / Regimen <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={editDrugNames}
                  onChange={(e) => setEditDrugNames(e.target.value)}
                  placeholder="e.g. Metformin 500mg, Atorvastatin 20mg"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Study Dates & Length of Stay */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Admission Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={editAdmissionDate}
                    onChange={(e) => setEditAdmissionDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Discharge Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={editDischargeDate}
                    onChange={(e) => setEditDischargeDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {editDerivedStay !== null && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    Calculated Length of Stay:
                  </span>
                  <span className="font-bold text-emerald-900">
                    {editDerivedStay} {editDerivedStay === 1 ? 'day' : 'days'}
                  </span>
                </div>
              )}

              {/* Research Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical / Research Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Patient consented, lab panel collected, baseline CBC normal"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSavingDetails}
                  onClick={() => setEditingCase(null)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDetails}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingDetails ? (
                    <span>Saving...</span>
                  ) : (
                    <span>Save Details</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrivacyNotice />
    </div>
  );
};
