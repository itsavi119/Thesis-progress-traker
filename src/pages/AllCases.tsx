import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  Stethoscope,
  Pill,
  CheckCircle2,
  Download,
  X,
  User,
  Building2,
  MapPin,
  Clock,
  Calendar,
  FileText,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import { downloadCasesCsv } from '../utils/exportCsv.js';
import type { CaseRecord, UserProfile } from '../types/index.js';

export const AllCases: React.FC = () => {
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedMember, setSelectedMember] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Delete modal state
  const [caseToDelete, setCaseToDelete] = useState<CaseRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!currentGroup) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const [casesRes, teamRes] = await Promise.all([
        api.getAllCases({
          groupId: currentGroup.id,
          search: search.trim() || undefined,
          memberId: selectedMember,
          status: selectedStatus,
        }),
        api.getTeamSummary(currentGroup.id),
      ]);

      setCases(casesRes.cases);
      const profileList = teamRes.summary.members.map((m) => ({
        id: m.profileId,
        email: m.email,
        display_name: m.displayName,
        role: 'member' as const,
        created_at: '',
        updated_at: '',
      }));
      setMembers(profileList);
    } catch (err: any) {
      setError(err.message || 'Failed to load case records.');
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedMember, selectedStatus, currentGroup]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Real-time synchronization
  useEffect(() => {
    if (!currentGroup) return;

    const unsubscribe = api.subscribeToRealtime(currentGroup.id, (event) => {
      if (event === 'case_registered' || event === 'case_status_updated' || event === 'case_deleted') {
        loadData();
      }
    });
    return () => unsubscribe();
  }, [loadData, currentGroup]);

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

  if (!currentGroup) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-slate-900">No Research Group Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Please select a research group to view patient cases.
        </p>
      </div>
    );
  }

  const exportFileName = `${currentGroup.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_cases`;

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
            <span className="text-xs text-slate-500 font-medium">Study Register</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">All Cases</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Complete register of all patient cases enrolled across the researchers in this study.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap sm:flex-nowrap">
          <button
            onClick={() => downloadCasesCsv(cases, exportFileName)}
            disabled={cases.length === 0}
            title={cases.length === 0 ? 'No cases to export' : 'Download displayed patient case records as CSV'}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {successToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
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

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Patient ID or Name */}
          <div className="md:col-span-6 relative">
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

          {/* Filter by Member */}
          <div className="md:col-span-3">
            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 transition-colors cursor-pointer font-medium"
            >
              <option value="ALL">All Members (Team)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div className="md:col-span-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 transition-colors cursor-pointer font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Excluded">Excluded</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span>Found {cases.length} authoritative case{cases.length === 1 ? '' : 's'}</span>
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
          {(search || selectedMember !== 'ALL' || selectedStatus !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedMember('ALL');
                setSelectedStatus('ALL');
              }}
              className="text-blue-600 hover:underline cursor-pointer font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* CASES DISPLAY */}
      {cases.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <p className="text-slate-800 font-bold text-base">
            {search
              ? `No cases match "${search}".`
              : selectedMember !== 'ALL' || selectedStatus !== 'ALL'
              ? 'No cases match your filter criteria.'
              : 'No cases registered yet.'}
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search
              ? 'Try searching by full or partial Patient ID, or patient name.'
              : selectedMember !== 'ALL' || selectedStatus !== 'ALL'
              ? 'Try adjusting your search terms or filters.'
              : 'No patient cases have been enrolled in this study group yet.'}
          </p>
          {(search || selectedMember !== 'ALL' || selectedStatus !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedMember('ALL');
                setSelectedStatus('ALL');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 cursor-pointer transition-colors mt-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Search & Filters</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW (Visible on sm and up) */}
          <div className="hidden sm:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Patient ID</th>
                  <th className="py-3.5 px-4">Clinical Notes (Optional)</th>
                  <th className="py-3.5 px-4">Assigned To</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Registered Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => {
                  const isOwner = user?.id === c.assigned_to;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-sm whitespace-nowrap">
                        {c.patient_id}
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        {c.patient_name || c.diagnosis || c.drug_names || c.department || c.location || c.age !== undefined || c.gender || c.length_of_stay !== undefined ? (
                          <div className="space-y-1">
                            {c.patient_name && (
                              <p className="font-semibold text-slate-800 truncate">{c.patient_name}</p>
                            )}
                            {(c.age !== undefined || c.gender || c.department || c.location || c.length_of_stay !== undefined) && (
                              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                                {(c.age !== undefined || c.gender) && (
                                  <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-medium">
                                    {c.age !== undefined ? `${c.age}y` : ''} {c.gender || ''}
                                  </span>
                                )}
                                {c.department && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-medium truncate max-w-[100px]">
                                    {c.department}
                                  </span>
                                )}
                                {c.location && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-medium truncate max-w-[90px]">
                                    {c.location}
                                  </span>
                                )}
                                {c.length_of_stay !== undefined && c.length_of_stay !== null && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-bold">
                                    Stay: {c.length_of_stay}d
                                  </span>
                                )}
                              </div>
                            )}
                            {c.diagnosis && (
                              <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                                <Stethoscope className="w-3 h-3 text-blue-600 shrink-0" />
                                {c.diagnosis}
                              </p>
                            )}
                            {c.drug_names && (
                              <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                                <Pill className="w-3 h-3 text-teal-600 shrink-0" />
                                {c.drug_names}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No notes</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                            {c.assigned_name ? c.assigned_name.charAt(0).toUpperCase() : 'R'}
                          </div>
                          <span className="font-semibold text-slate-800">{c.assigned_name}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            c.status === 'Completed'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : c.status === 'Excluded'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 font-medium whitespace-nowrap">
                        {new Date(c.registered_at).toLocaleString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isOwner ? (
                          <button
                            onClick={() => setCaseToDelete(c)}
                            title="Remove Incorrect Patient ID"
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span className="text-[11px]">Remove</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARD VIEW (Specifically designed for Android 360px - 430px) */}
          <div className="sm:hidden space-y-3">
            {cases.map((c) => {
              const isOwner = user?.id === c.assigned_to;
              return (
                <div
                  key={c.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
                        Patient ID
                      </span>
                      <p className="font-mono font-bold text-lg text-slate-900 tracking-wide">
                        {c.patient_id}
                      </p>
                      {c.patient_name && (
                        <p className="text-xs font-semibold text-slate-800 mt-0.5">
                          {c.patient_name}
                        </p>
                      )}
                    </div>

                    {isOwner && (
                      <button
                        onClick={() => setCaseToDelete(c)}
                        title="Remove Incorrect Patient ID"
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-[10px]">Remove</span>
                      </button>
                    )}
                  </div>

                  {/* Optional Clinical & Demographic Details in Mobile Card */}
                  {(c.diagnosis || c.drug_names || c.department || c.location || c.age !== undefined || c.gender || c.length_of_stay !== undefined) && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
                      {(c.age !== undefined || c.gender || c.department || c.location || c.length_of_stay !== undefined) && (
                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          {(c.age !== undefined || c.gender) && (
                            <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-medium">
                              {c.age !== undefined ? `${c.age}y` : ''} {c.gender || ''}
                            </span>
                          )}
                          {c.department && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-medium">
                              {c.department}
                            </span>
                          )}
                          {c.location && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-medium">
                              {c.location}
                            </span>
                          )}
                          {c.length_of_stay !== undefined && c.length_of_stay !== null && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-bold">
                              Stay: {c.length_of_stay}d
                            </span>
                          )}
                        </div>
                      )}
                      {c.diagnosis && (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Stethoscope className="w-3 h-3 text-blue-600 shrink-0" />
                          <span className="font-semibold text-slate-500">Dx:</span>
                          <span className="font-medium truncate">{c.diagnosis}</span>
                        </div>
                      )}
                      {c.drug_names && (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Pill className="w-3 h-3 text-teal-600 shrink-0" />
                          <span className="font-semibold text-slate-500">Rx:</span>
                          <span className="font-medium truncate">{c.drug_names}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Assigned To
                      </span>
                      <p className="font-bold text-blue-700 truncate">
                        {c.assigned_name}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Status
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.status === 'Completed'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : c.status === 'Excluded'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Registered:</span>
                    <span className="font-medium text-slate-700">
                      {new Date(c.registered_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
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
                <span className="font-medium text-slate-800">{caseToDelete.assigned_name}</span>
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

      <PrivacyNotice />
    </div>
  );
};
