import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  FolderOpen,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Shield,
  Layers,
  Target,
  Users,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import { Logo } from '../components/Logo.js';
import type { DashboardStats, CaseRecord } from '../types/index.js';

interface DashboardProps {
  onNavigate: (tab: 'my-groups' | 'add-patient' | 'all-cases' | 'my-cases' | 'team-summary') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { currentGroup, isOwner } = useGroup();

  const [stats, setStats] = useState<DashboardStats>({
    totalCases: 0,
    myCases: 0,
    inProgress: 0,
    completed: 0,
    excluded: 0,
    targetSampleSize: 220,
    remaining: 220,
    progressPercentage: 0,
  });
  const [recentCases, setRecentCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!currentGroup) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const [statsRes, casesRes] = await Promise.all([
        api.getStats(currentGroup.id),
        api.getAllCases({ groupId: currentGroup.id }),
      ]);
      setStats(statsRes.stats);
      setRecentCases(casesRes.cases.slice(0, 5));
    } catch (err: any) {
      setError(err.message || 'Failed to load case data from research group.');
    } finally {
      setIsLoading(false);
    }
  }, [currentGroup]);

  useEffect(() => {
    loadData();

    if (!currentGroup) return;

    // Subscribe to realtime database updates for this group
    const unsubscribe = api.subscribeToRealtime(
      currentGroup.id,
      (event) => {
        if (
          event === 'case_registered' ||
          event === 'case_status_updated' ||
          event === 'case_deleted' ||
          event === 'team_updated' ||
          event === 'group_updated'
        ) {
          loadData();
        }
      }
    );

    return () => unsubscribe();
  }, [loadData, currentGroup]);

  if (!currentGroup) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-xs">
        <FolderOpen className="w-12 h-12 text-slate-400 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">No Research Group Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Please select or create a research group to view study statistics and enroll patients.
        </p>
        <button
          onClick={() => onNavigate('my-groups')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
        >
          <span>Open My Groups</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const target = currentGroup.targetSampleSize || stats.targetSampleSize || 220;
  const progressPercent = Math.min(100, stats.progressPercentage || (target > 0 ? (stats.totalCases / target) * 100 : 0));

  return (
    <div className="space-y-6">
      {/* Top Group Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl shadow-xs">
        <div className="flex items-start gap-4">
          <Logo size="md" showText={false} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {isOwner ? 'Group Owner' : 'Researcher'}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 font-medium">
                {currentGroup.members.length} / 3 Researchers
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
              {currentGroup.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 italic mt-0.5 line-clamp-2">
              &ldquo;{currentGroup.studyTitle}&rdquo;
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap sm:flex-nowrap">
          <button
            onClick={() => onNavigate('add-patient')}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Patient</span>
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Target Sample Size & Progress Hero Card */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-6 sm:p-7 rounded-3xl shadow-lg shadow-blue-900/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center font-bold">
              <Target className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                Enrollment Progress
              </p>
              <h3 className="text-xl font-black">
                {stats.totalCases} of {target} Patients Registered
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:text-right">
            <div className="px-3.5 py-1.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-xs font-bold">
              <span>{stats.remaining} Remaining</span>
            </div>
            <div className="text-2xl font-black tracking-tight text-blue-100">
              {progressPercent.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden p-0.5">
          <div
            className="bg-white rounded-full h-full transition-all duration-500 shadow-sm"
            style={{ width: `${Math.max(2, progressPercent)}%` }}
          />
        </div>
      </div>

      {/* Stats Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Cases */}
        <div
          onClick={() => onNavigate('all-cases')}
          className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs hover:border-blue-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>Total Group Cases</span>
            <Layers className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {stats.totalCases}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 group-hover:text-blue-600">
            <span>View All Cases</span>
            <ChevronRight className="w-3 h-3" />
          </p>
        </div>

        {/* My Cases */}
        <div
          onClick={() => onNavigate('my-cases')}
          className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs hover:border-blue-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>My Registered</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-blue-600 tracking-tight">
            {stats.myCases}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 group-hover:text-blue-600">
            <span>Manage My Cases</span>
            <ChevronRight className="w-3 h-3" />
          </p>
        </div>

        {/* In Progress */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>In Progress</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700 tracking-tight">
            {stats.inProgress}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Active data collection</p>
        </div>

        {/* Completed */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 tracking-tight">
            {stats.completed}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Finished & verified</p>
        </div>

        {/* Excluded */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-500 uppercase font-semibold mb-1">
            <span>Excluded</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-700 tracking-tight">
            {stats.excluded}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Ineligible / dropped</p>
        </div>
      </div>

      {/* RECENT CASES */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Recently Registered in Group
          </h3>
          <button
            onClick={() => onNavigate('all-cases')}
            className="text-xs text-blue-600 font-bold hover:underline cursor-pointer flex items-center gap-1"
          >
            <span>View All ({stats.totalCases})</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {recentCases.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs space-y-2">
            <p>No patient cases registered in this research group yet.</p>
            <button
              onClick={() => onNavigate('add-patient')}
              className="text-blue-600 font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <span>Enroll first patient</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentCases.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-900 text-sm">
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
                    <span className="text-slate-600 font-medium hidden sm:inline">
                      {c.patient_name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-slate-500">
                  <span className="hidden sm:inline">
                    by <strong>{c.assigned_name || 'Researcher'}</strong>
                  </span>
                  <span className="text-slate-400">
                    {new Date(c.registered_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PrivacyNotice />
    </div>
  );
};
