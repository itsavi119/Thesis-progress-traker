import React, { useState } from 'react';
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
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { normalizePatientId, validatePatientId } from '../utils/normalizePatientId.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import type { CaseRecord } from '../types/index.js';

type PageState = 'INPUT' | 'CHECKING' | 'AVAILABLE' | 'REGISTERING' | 'SUCCESS' | 'DUPLICATE';

interface AddPatientProps {
  onNavigateToMyCases: () => void;
}

export const AddPatient: React.FC<AddPatientProps> = ({ onNavigateToMyCases }) => {
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const [patientIdInput, setPatientIdInput] = useState<string>('');
  const [patientName, setPatientName] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [drugNames, setDrugNames] = useState<string>('');
  const [pageState, setPageState] = useState<PageState>('INPUT');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateCase, setDuplicateCase] = useState<CaseRecord | null>(null);
  const [registeredCase, setRegisteredCase] = useState<CaseRecord | null>(null);
  const [checkedNormalizedId, setCheckedNormalizedId] = useState<string>('');

  const handleReset = () => {
    setPageState('INPUT');
    setPatientIdInput('');
    setPatientName('');
    setDiagnosis('');
    setDrugNames('');
    setErrorMessage(null);
    setDuplicateCase(null);
    setRegisteredCase(null);
    setCheckedNormalizedId('');
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
      setErrorMessage(validation.errorMessage || 'Please enter a valid Patient ID.');
      return;
    }

    setPageState('CHECKING');

    try {
      const result = await api.checkPatientId(patientIdInput, currentGroup.id);
      setCheckedNormalizedId(result.normalizedId);

      if (result.exists && result.case) {
        setDuplicateCase(result.case);
        setPageState('DUPLICATE');
      } else {
        setPageState('AVAILABLE');
      }
    } catch (err: any) {
      setPageState('INPUT');
      setErrorMessage(err.message || 'Unable to verify Patient ID. Please check connection and try again.');
    }
  };

  const handleRegister = async () => {
    if (!currentGroup) {
      setErrorMessage('Please select or join a research group first.');
      return;
    }

    setErrorMessage(null);
    setPageState('REGISTERING');

    try {
      const res = await api.registerCase({
        groupId: currentGroup.id,
        patientId: patientIdInput,
        patientName: patientName.trim() || undefined,
        diagnosis: diagnosis.trim() || undefined,
        drugNames: drugNames.trim() || undefined,
      });
      setRegisteredCase(res.case);
      setPageState('SUCCESS');
    } catch (err: any) {
      // Check if duplicate race condition happened at the authoritative database level
      if (err.data?.error === 'DUPLICATE_CASE' && err.data?.case) {
        setDuplicateCase(err.data.case);
        setPageState('DUPLICATE');
      } else {
        setPageState('AVAILABLE');
        setErrorMessage(
          err.message || 'Failed to register case. Database error or connection interruption.'
        );
      }
    }
  };

  if (!currentGroup) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-slate-900">No Research Group Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          You must be inside an active research group to check and register patient cases.
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
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Add Patient</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Enter the Patient ID to verify it is unique within <strong>{currentGroup.name}</strong> before registering.
        </p>
      </div>

      {/* STATE 1: INITIAL INPUT OR CHECKING */}
      {(pageState === 'INPUT' || pageState === 'CHECKING') && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs space-y-5">
          <form onSubmit={handleCheck} className="space-y-4">
            <div>
              <label
                htmlFor="patientIdInput"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2"
              >
                Patient ID
              </label>

              <div className="relative">
                <input
                  id="patientIdInput"
                  type="text"
                  autoFocus
                  disabled={pageState === 'CHECKING'}
                  value={patientIdInput}
                  onChange={(e) => {
                    setPatientIdInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="e.g. PSH-2024-001 or 10423"
                  className="w-full px-4 py-3.5 sm:py-4 bg-slate-50 border-2 border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-base sm:text-lg font-mono font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all uppercase shadow-2xs"
                />
                {patientIdInput.trim() && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-blue-700 font-mono font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {normalizePatientId(patientIdInput)}
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Normalization: Case-insensitive, trimmed, internal spaces collapsed</span>
                <span>Max 64 chars</span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{errorMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={pageState === 'CHECKING' || !patientIdInput.trim()}
              className="w-full py-4 px-6 rounded-xl font-bold text-base bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {pageState === 'CHECKING' ? (
                <span className="flex items-center gap-2.5">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Checking Patient ID...</span>
                </span>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Check Patient ID</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* STATE 2: PATIENT ID AVAILABLE */}
      {(pageState === 'AVAILABLE' || pageState === 'REGISTERING') && (
        <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl p-6 sm:p-8 shadow-md space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                Verified Available
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                ✓ Patient ID Available
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                This Patient ID has not been registered yet in this study.
              </p>
            </div>
          </div>

          {/* Core Case Details */}
          <div className="p-4 bg-white rounded-xl border border-emerald-200 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-500 font-medium">Patient ID:</span>
              <span className="font-mono font-bold text-slate-900 text-base sm:text-lg">
                {patientIdInput.trim()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Normalized Key:</span>
              <span className="font-mono text-blue-700 font-semibold">{checkedNormalizedId}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Will Be Assigned To:</span>
              <span className="font-bold text-slate-800">{user?.display_name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Default Status:</span>
              <span className="font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                In Progress
              </span>
            </div>
          </div>

          {/* Optional Clinical Fields Section */}
          <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-blue-600" />
                Optional Clinical Details
              </span>
              <span className="text-[11px] text-slate-400">Optional / Can edit later</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Patient Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Patient full name or initials"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Diagnosis <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="e.g. Hypertension, Diabetes Type 2"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Drug Names / Regimen <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={drugNames}
                    onChange={(e) => setDrugNames(e.target.value)}
                    placeholder="e.g. Metformin 500mg, Amlodipine"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium">{errorMessage}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleRegister}
              disabled={pageState === 'REGISTERING'}
              className="flex-1 py-4 px-6 rounded-xl font-bold text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {pageState === 'REGISTERING' ? (
                <span className="flex items-center gap-2.5">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Registering Case...</span>
                </span>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  <span>Register This Case</span>
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              disabled={pageState === 'REGISTERING'}
              className="py-3 px-5 rounded-xl font-semibold text-xs sm:text-sm bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Cancel / Check Another</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: ALREADY REGISTERED / DUPLICATE WARNING */}
      {pageState === 'DUPLICATE' && duplicateCase && (
        <div className="bg-rose-50/80 border-2 border-rose-400 rounded-2xl p-6 sm:p-8 shadow-lg space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300">
                Duplicate Detected
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-rose-950 mt-1">
                ⚠️ Patient Already Registered
              </h3>
              <p className="text-xs sm:text-sm text-rose-800 font-medium">
                This Patient ID is already being handled by another team member.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 bg-white rounded-xl border border-rose-200 divide-y divide-slate-100 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs sm:text-sm pb-2">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-400" />
                Patient ID:
              </span>
              <span className="font-mono font-bold text-slate-900 text-base sm:text-lg">
                {duplicateCase.patient_id}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm py-2">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                Assigned To:
              </span>
              <span className="font-bold text-blue-700 text-sm sm:text-base">
                {duplicateCase.assigned_name || 'Team Member'}
              </span>
            </div>

            {duplicateCase.patient_name && (
              <div className="flex items-center justify-between text-xs sm:text-sm py-2">
                <span className="text-slate-500 font-medium">Patient Name:</span>
                <span className="font-semibold text-slate-800">{duplicateCase.patient_name}</span>
              </div>
            )}

            {duplicateCase.diagnosis && (
              <div className="flex items-center justify-between text-xs sm:text-sm py-2">
                <span className="text-slate-500 font-medium">Diagnosis:</span>
                <span className="font-medium text-slate-700">{duplicateCase.diagnosis}</span>
              </div>
            )}

            {duplicateCase.drug_names && (
              <div className="flex items-center justify-between text-xs sm:text-sm py-2">
                <span className="text-slate-500 font-medium">Drug Names:</span>
                <span className="font-medium text-slate-700">{duplicateCase.drug_names}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs sm:text-sm py-2">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                Registered:
              </span>
              <span className="font-medium text-slate-800">
                {new Date(duplicateCase.registered_at).toLocaleString([], {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm pt-2">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                Status:
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  duplicateCase.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : duplicateCase.status === 'Excluded'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {duplicateCase.status}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-rose-100/70 rounded-xl border border-rose-200 text-xs text-rose-900 leading-relaxed font-medium">
            <strong>Protection Notice:</strong> To ensure research integrity and avoid duplicate case collection, DO NOT collect thesis data from this patient. It has already been assigned.
          </div>

          <button
            onClick={handleReset}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back / Check Another Patient</span>
          </button>
        </div>
      )}

      {/* STATE 4: SUCCESS REGISTRATION CARD */}
      {pageState === 'SUCCESS' && registeredCase && (
        <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl p-6 sm:p-8 shadow-lg space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                Confirmed In Cloud Database
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                ✓ Patient Registered Successfully
              </h3>
              <p className="text-xs sm:text-sm text-emerald-800 font-medium">
                You are now the authoritative researcher assigned to this patient case.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 bg-white rounded-xl border border-emerald-200 divide-y divide-slate-100 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs sm:text-sm pb-2">
              <span className="text-slate-500 font-medium">Patient ID:</span>
              <span className="font-mono font-bold text-slate-900 text-base sm:text-lg">
                {registeredCase.patient_id}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm py-2">
              <span className="text-slate-500 font-medium">Assigned To:</span>
              <span className="font-bold text-blue-700">
                {registeredCase.assigned_name || user?.display_name}
              </span>
            </div>

            {registeredCase.patient_name && (
              <div className="flex items-center justify-between text-xs sm:text-sm py-2">
                <span className="text-slate-500 font-medium">Patient Name:</span>
                <span className="font-semibold text-slate-800">{registeredCase.patient_name}</span>
              </div>
            )}

            {registeredCase.diagnosis && (
              <div className="flex items-center justify-between text-xs sm:text-sm py-2">
                <span className="text-slate-500 font-medium">Diagnosis:</span>
                <span className="font-medium text-slate-700">{registeredCase.diagnosis}</span>
              </div>
            )}

            {registeredCase.drug_names && (
              <div className="flex items-center justify-between text-xs sm:text-sm py-2">
                <span className="text-slate-500 font-medium">Drug Names:</span>
                <span className="font-medium text-slate-700">{registeredCase.drug_names}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs sm:text-sm py-2">
              <span className="text-slate-500 font-medium">Status:</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                {registeredCase.status}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm pt-2">
              <span className="text-slate-500 font-medium">Registered:</span>
              <span className="font-medium text-slate-800">
                {new Date(registeredCase.registered_at).toLocaleString([], {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleReset}
              className="flex-1 py-3.5 px-6 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Another Patient</span>
            </button>

            <button
              onClick={onNavigateToMyCases}
              className="py-3.5 px-6 rounded-xl font-semibold text-sm bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>View My Cases</span>
            </button>
          </div>
        </div>
      )}

      <PrivacyNotice />
    </div>
  );
};
