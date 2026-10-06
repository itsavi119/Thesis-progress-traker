import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Tag,
  CheckCircle2,
  AlertCircle,
  FileEdit,
  Trash2,
  PlusCircle,
  Archive,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useGroup } from '../context/GroupContext.js';
import type { CaseHistoryEvent } from '../types/index.js';

export const CaseHistory: React.FC = () => {
  const { currentGroup } = useGroup();
  const [historyEvents, setHistoryEvents] = useState<CaseHistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const fetchHistory = useCallback(async () => {
    if (!currentGroup?.id) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getCaseHistory(currentGroup.id);
      setHistoryEvents(res.history || []);
    } catch (err: any) {
      console.error('Failed to load case history:', err);
      setError(err.message || 'Failed to load case history.');
    } finally {
      setIsLoading(false);
    }
  }, [currentGroup?.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredEvents = historyEvents.filter((event) => {
    const matchesAction =
      actionFilter === 'ALL' || event.action === actionFilter;

    const term = searchTerm.trim().toLowerCase();
    if (!term) return matchesAction;

    const matchesTerm =
      (event.patientId && event.patientId.toLowerCase().includes(term)) ||
      (event.patientName && event.patientName.toLowerCase().includes(term)) ||
      (event.performedBy && event.performedBy.toLowerCase().includes(term)) ||
      (event.details && event.details.toLowerCase().includes(term));

    return matchesAction && matchesTerm;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CASE_REGISTERED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <PlusCircle className="w-3 h-3" />
            Registered
          </span>
        );
      case 'CASE_UPDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <FileEdit className="w-3 h-3" />
            Updated
          </span>
        );
      case 'CASE_STATUS_UPDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <CheckCircle2 className="w-3 h-3" />
            Status Changed
          </span>
        );
      case 'CASE_DELETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <Trash2 className="w-3 h-3" />
            Deleted
          </span>
        );
      case 'BACKUP_RESTORED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Archive className="w-3 h-3" />
            Restored
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
            <Tag className="w-3 h-3" />
            {action.replace(/_/g, ' ')}
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return {
        date: d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        time: d.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
    } catch {
      return { date: dateStr, time: '' };
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Case History & Event Trail</h1>
              <p className="text-xs text-slate-500">
                Immutable, chronological activity trail for study:{' '}
                <span className="font-semibold text-slate-700">{currentGroup?.name || 'Active Study'}</span>
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchHistory}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh History</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by case ID, participant alias, investigator, or action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All Actions</option>
            <option value="CASE_REGISTERED">Case Registered</option>
            <option value="CASE_UPDATED">Case Details Updated</option>
            <option value="CASE_STATUS_UPDATED">Status Changed</option>
            <option value="CASE_DELETED">Case Deleted</option>
            <option value="BACKUP_RESTORED">Backup Restored</option>
          </select>
        </div>
      </div>

      {/* History Event List */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-medium text-slate-500">Loading audit history events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 mb-1">No History Events Recorded</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm || actionFilter !== 'ALL'
              ? 'No events matched your current search or action filter.'
              : 'As your research team registers, updates, and reviews cases, all key milestones will be recorded here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredEvents.map((event) => {
              const { date, time } = formatDate(event.timestamp);
              return (
                <div
                  key={event.id}
                  className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {getActionBadge(event.action)}
                      {event.patientId && (
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          ID: {event.patientId}
                        </span>
                      )}
                      {event.patientName && (
                        <span className="text-slate-600 italic">
                          ({event.patientName})
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 font-medium break-words">{event.details}</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1 font-semibold text-slate-600">
                        <User className="w-3 h-3 text-slate-400" />
                        {event.performedBy}
                      </span>
                      <span>•</span>
                      <span className="truncate">{event.performedByEmail}</span>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 text-slate-500 text-[11px]">
                      <span className="font-semibold text-slate-700">{date}</span>
                      <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                        <Clock className="w-2.5 h-2.5" />
                        {time}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 text-center">
            Showing {filteredEvents.length} recorded events • History is read-only for study integrity
          </div>
        </div>
      )}
    </div>
  );
};
