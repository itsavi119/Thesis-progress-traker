import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  UserPlus,
  Clock,
  User,
  Calendar,
  Layers,
  ExternalLink,
  Pill,
  Stethoscope,
  Building2,
  MapPin,
  FileText,
  Cloud,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { normalizePatientId, validatePatientId } from '../utils/normalizePatientId.js';
import { offlineStorage } from '../services/offlineStorage.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import type { CaseRecord } from '../types/index.js';

type PageState = 'INPUT' | 'CHECKING' | 'AVAILABLE' | 'REGISTERING' | 'SUCCESS' | 'DUPLICATE';

interface AddPatientProps {
  onNavigateToMyCases: () => void;
}

export const AddPatient: React.FC<AddPatientProps> = ({ onNavigateToMyCases }) => {
  const { user } = useAuth();
  const { currentGroup } = useGroup();

  const terminology = currentGroup?.subjectTerminology || 'Participant';

  // Primary fields
  const [patientIdInput, setPatientIdInput] = useState<string>('');
  const [patientName, setPatientName] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [drugNames, setDrugNames] = useState<string>('');

  // Demographic Details (Sections 10 & 11)
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<string>('Male');
  const [department, setDepartment] = useState<string>('');
  const [location, setLocation] = useState<string>('');

  // Custom / Study Dates (Sections 12 & 13)
  const [admissionDate, setAdmissionDate] = useState<string>('');
  const [dischargeDate, setDischargeDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  const [pageState, setPageState] = useState<PageState>('INPUT');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateCase, setDuplicateCase] = useState<CaseRecord | null>(null);
  const [registeredCase, setRegisteredCase] = useState<CaseRecord | null>(null);
  const [checkedNormalizedId, setCheckedNormalizedId] = useState<string>('');
  const [isOfflineSaved, setIsOfflineSaved] = useState<boolean>(false);

  // Derived Length of Stay (Section 13 & 14)
  const derivedLengthOfStay = useMemo(() => {
    if (!admissionDate || !dischargeDate) return null;
    const a = new Date(admissionDate);
    const d = new Date(dischargeDate);
    if (isNaN(a.getTime()) || isNaN(d.getTime())) return null;
    const diff = Math.round((d.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : null;
  }, [admissionDate, dischargeDate]);

  const handleReset = () => {
    setPageState('INPUT');
    setPatientIdInput('');
    setPatientName('');
    setAge('');
    setGender('Male');
    setDepartment('');
    setLocation('');
    setDiagnosis('');
    setDrugNames('');
    setAdmissionDate('');
    setDischargeDate('');
    setNotes('');
    setCustomValues({});
    setErrorMessage(null);
    setDuplicateCase(null);
    setRegisteredCase(null);
    setCheckedNormalizedId('');
    setIsOfflineSaved(false);
  };

  const handleCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!currentGroup) {
      setErrorMessage('Please select or join a research group first.');
      return;
    }

    const validation = validatePatientId(patientIdInput);
    if (!validation.isValid) {
      setErrorMessage(validation.errorMessage || `Please enter a valid ${terminology} ID.`);
      return;
    }

    setPageState('CHECKING');

    try {
      // Check offline store first
      const cached = await offlineStorage.getCachedCases(currentGroup.id);
      const offlineMatch = cached.find((c) => c.normalized_patient_id === validation.normalizedId);
      if (offlineMatch) {
        setCheckedNormalizedId(validation.normalizedId);
        setDuplicateCase(offlineMatch);
        setPageState('DUPLICATE');
        return;
      }

      const result = await api.checkPatientId(patientIdInput, currentGroup.id);
      setCheckedNormalizedId(result.normalizedId);

      if (result.exists && result.case) {
        setDuplicateCase(result.case);
        setPageState('DUPLICATE');
      } else {
        setPageState('AVAILABLE');
      }
    } catch (err: any) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Allow proceeding offline if local store verified no conflict
        setCheckedNormalizedId(validation.normalizedId);
        setPageState('AVAILABLE');
      } else {
        setPageState('INPUT');
        setErrorMessage(err.message || `Unable to verify ${terminology} ID.`);
      }
    }
  };

  const handleRegister = async () => {
    if (!currentGroup || !user) {
      setErrorMessage('Please select or join a research group first.');
      return;
    }

    setErrorMessage(null);
    setPageState('REGISTERING');

    const parsedAge = age ? parseInt(age, 10) : undefined;
    const payload = {
      groupId: currentGroup.id,
      patientId: patientIdInput.trim(),
      patientName: patientName.trim() || undefined,
      age: parsedAge && !isNaN(parsedAge) ? parsedAge : undefined,
      gender: gender.trim() || undefined,
      department: department.trim() || undefined,
      location: location.trim() || undefined,
      diagnosis: diagnosis.trim() || undefined,
      drugNames: drugNames.trim() || undefined,
      admissionDate: admissionDate || undefined,
      dischargeDate: dischargeDate || undefined,
      notes: notes.trim() || undefined,
      customValues: Object.keys(customValues).length > 0 ? customValues : undefined,
    };

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Offline persistent save to IndexedDB
        const now = new Date().toISOString();
        const localCase: CaseRecord = {
          id: crypto.randomUUID(),
          group_id: currentGroup.id,
          patient_id: patientIdInput.trim(),
          normalized_patient_id: checkedNormalizedId,
          assigned_to: user.id,
          assigned_name: user.display_name,
          assigned_email: user.email,
          status: 'In Progress',
          patient_name: payload.patientName,
          age: payload.age,
          gender: payload.gender,
          department: payload.department,
          location: payload.location,
          diagnosis: payload.diagnosis,
          drug_names: payload.drugNames,
          admission_date: payload.admissionDate,
          discharge_date: payload.dischargeDate,
          length_of_stay: derivedLengthOfStay !== null ? derivedLengthOfStay : undefined,
          notes: payload.notes,
          custom_values: payload.customValues,
          registered_at: now,
          updated_at: now,
          sync_status: 'pending',
        };

        await offlineStorage.putLocalCase(localCase);
        await offlineStorage.enqueue('CREATE_CASE', currentGroup.id, localCase.id, payload);
        setRegisteredCase(localCase);
        setIsOfflineSaved(true);
        setPageState('SUCCESS');
        return;
      }

      const res = await api.registerCase(payload);
      await offlineStorage.putLocalCase(res.case);
      setRegisteredCase(res.case);
      setIsOfflineSaved(false);
      setPageState('SUCCESS');
    } catch (err: any) {
      if (err.data?.error === 'DUPLICATE_CASE' && err.data?.case) {
        setDuplicateCase(err.data.case);
        setPageState('DUPLICATE');
      } else {
        setPageState('AVAILABLE');
        setErrorMessage(
          err.message || 'Failed to register record. Please check connection and try again.'
        );
      }
    }
  };

  if (!currentGroup) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-slate-900">No Research Study Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          You must be inside an active research study to check and enroll {terminology.toLowerCase()} records.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Title & Instructions */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {currentGroup.name}
          </span>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-500 font-medium">Duplicate Guard</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Add {terminology}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Enter the {terminology} ID to verify uniqueness within{' '}
          <strong>{currentGroup.name}</strong> before registering.
        </p>
      </div>

      {/* STATE 1: ID INPUT & CHECK FORM */}
      {(pageState === 'INPUT' || pageState === 'CHECKING') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <form onSubmit={handleCheck} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                {terminology} ID / Study Code *
              </label>
              <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  disabled={pageState === 'CHECKING'}
                  value={patientIdInput}
                  onChange={(e) => setPatientIdInput(e.target.value)}
                  placeholder={`e.g. ${terminology.charAt(0)}-1001, 2026-042`}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Smart Normalization: Automatically strips spaces, hyphens, and casing to prevent duplicates.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-medium">{errorMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={pageState === 'CHECKING' || !patientIdInput.trim()}
              className="w-full min-h-[48px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 active:scale-98 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {pageState === 'CHECKING' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Uniqueness...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Verify {terminology} ID</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* STATE 2: AVAILABLE - SHOW DETAILED DEMOGRAPHIC & STUDY DATES FORM */}
      {(pageState === 'AVAILABLE' || pageState === 'REGISTERING') && (
        <div className="bg-white border-2 border-emerald-400/80 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 animate-in fade-in">
          {/* Uniqueness Confirmation Banner */}
          <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <span className="text-xs font-bold text-emerald-900 block">
                ID is Available & Unique in This Study
              </span>
              <span className="text-[11px] text-emerald-700">
                &ldquo;{patientIdInput.trim()}&rdquo; (Key: {checkedNormalizedId})
              </span>
            </div>
          </div>

          {/* SECTION A: DEMOGRAPHIC DETAILS (Requirement 11) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" />
                Demographic Details
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Configurable per study</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Participant Alias / Name (Optional)
                </label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Subject initials or alias"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    min="0"
                    max="150"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sex / Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Unspecified</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department / Unit
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. General Medicine, Cardiology, ICU"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Location / Ward / Clinic
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Ward 4B, OPD Room 12"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {/* SECTION B: STUDY DATES & DERIVED LENGTH OF STAY (Requirements 12, 13, 14) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-purple-600" />
                Custom Study Dates
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Manually editable</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admission / Start / Visit Date
                </label>
                <input
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Discharge / End / Follow-up Date
                </label>
                <input
                  type="date"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {derivedLengthOfStay !== null && (
              <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center justify-between">
                <span className="font-semibold">Derived Duration / Length of Stay:</span>
                <span className="font-bold text-sm bg-purple-200/60 px-2.5 py-0.5 rounded-lg">
                  {derivedLengthOfStay} day{derivedLengthOfStay === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </div>

          {/* SECTION C: CLINICAL & STUDY DETAILS */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-emerald-600" />
                Study Clinical & Topic Details
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Optional</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primary Condition / Indication / Diagnosis
                </label>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes, Bacterial Pneumonia"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Intervention / Regimen / Drug Names
                </label>
                <input
                  type="text"
                  value={drugNames}
                  onChange={(e) => setDrugNames(e.target.value)}
                  placeholder="e.g. Ceftriaxone 1g IV, Metformin 500mg"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Study Notes / Research Observations
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional observations, ethics notes, or study parameters..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleRegister}
              disabled={pageState === 'REGISTERING'}
              className="flex-1 py-3.5 px-6 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 active:scale-98 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {pageState === 'REGISTERING' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Enrolling {terminology}...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Register This {terminology}</span>
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              disabled={pageState === 'REGISTERING'}
              className="py-3 px-5 rounded-xl font-semibold text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Cancel / Check Another</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: DUPLICATE ALERT */}
      {pageState === 'DUPLICATE' && duplicateCase && (
        <div className="bg-rose-50/80 border-2 border-rose-400 rounded-3xl p-6 sm:p-8 shadow-lg space-y-6 animate-in fade-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300">
                Duplicate Detected in This Study
              </span>
              <h3 className="text-lg font-bold text-rose-950 mt-1">
                &ldquo;{patientIdInput}&rdquo; is already registered
              </h3>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-rose-200 p-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Record ID:</span>
              <span className="font-mono font-bold text-rose-900">{duplicateCase.patient_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Assigned Investigator:</span>
              <span className="font-bold text-slate-800">
                {duplicateCase.assigned_name || 'Team Colleague'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Enrolled Date:</span>
              <span className="text-slate-700">
                {new Date(duplicateCase.registered_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Current Status:</span>
              <span className="font-bold text-slate-800">{duplicateCase.status}</span>
            </div>
          </div>

          <p className="text-xs text-rose-800">
            To prevent skewed study sample sizes, duplicate enrollments within the same research study are blocked.
          </p>

          <button
            onClick={handleReset}
            className="w-full py-3 bg-white border border-rose-300 hover:bg-rose-50 text-rose-900 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Check Another {terminology} ID</span>
          </button>
        </div>
      )}

      {/* STATE 4: SUCCESS */}
      {pageState === 'SUCCESS' && registeredCase && (
        <div className="bg-emerald-50/80 border-2 border-emerald-400 rounded-3xl p-6 sm:p-8 shadow-lg space-y-6 animate-in fade-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                {isOfflineSaved ? 'Saved Locally (Offline)' : 'Successfully Enrolled'}
              </span>
              <h3 className="text-lg font-bold text-emerald-950 mt-1">
                {terminology} {registeredCase.patient_id} Registered
              </h3>
            </div>
          </div>

          {isOfflineSaved && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Saved locally in browser storage. Will automatically upload to the cloud when internet connection is restored.
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleReset}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Another {terminology}</span>
            </button>
            <button
              onClick={onNavigateToMyCases}
              className="py-3 px-5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-900 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <span>View My Records</span>
            </button>
          </div>
        </div>
      )}

      <PrivacyNotice />
    </div>
  );
};
