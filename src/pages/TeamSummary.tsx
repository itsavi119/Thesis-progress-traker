import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  UserPlus,
  Trash2,
  Target,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { InviteMemberModal } from '../components/InviteMemberModal.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import type { TeamSummaryResponse } from '../types/index.js';

export const TeamSummary: React.FC = () => {
  const { user } = useAuth();
  const { currentGroup, isOwner, refreshGroups } = useGroup();

  const [summary, setSummary] = useState<TeamSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState<boolean>(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!currentGroup) return;

    try {
      setError(null);
      const res = await api.getTeamSummary(currentGroup.id);
      setSummary(res.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to load team summary.');
    } finally {
      setIsLoading(false);
    }
  }, [currentGroup]);

  useEffect(() => {
    loadData();

    if (!currentGroup) return;

    const unsubscribe = api.subscribeToRealtime(
      currentGroup.id,
      (event) => {
        if (
          event === 'team_updated' ||
          event === 'case_registered' ||
          event === 'case_status_updated' ||
          event === 'case_deleted' ||
          event === 'group_updated'
        ) {
          loadData();
        }
      }
    );
    return () => unsubscribe();
  }, [loadData, currentGroup]);

  const handleConfirmRemove = async () => {
    if (!currentGroup || !memberToRemove) return;
    try {
      setIsRemoving(true);
      setError(null);
      await api.removeMember(currentGroup.id, memberToRemove.id);
      setMemberToRemove(null);
      await loadData();
      await refreshGroups();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member.');
    } finally {
      setIsRemoving(false);
    }
  };

  if (!currentGroup) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-xs">
        <Users className="w-12 h-12 text-slate-400 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">No Research Group Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Please select a research group to view authorized team researchers.
        </p>
      </div>
    );
  }

  const memberCount = summary?.totalMembers || currentGroup.members.length;
  const isFull = memberCount >= 3;
  const target = currentGroup.targetSampleSize || 220;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {currentGroup.name}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-semibold">Study Team</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            Research Team Overview
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Collaborative tracking across authorized researchers in this study (strictly capped at 3 researchers).
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap sm:flex-nowrap">
          {isOwner && (
            <button
              onClick={() => setInviteModalOpen(true)}
              disabled={isFull}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                isFull
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-95'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isFull ? 'Team Full (3/3)' : 'Invite Member'}</span>
            </button>
          )}

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

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Group Team Capacity & Study Target Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Study Target
          </span>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {summary?.totalCases || 0} / {target}
          </div>
          <p className="text-xs text-slate-500">
            Total patients registered across all {memberCount} researchers.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Team Capacity
          </span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-blue-600 tracking-tight">
              {memberCount} / 3
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isFull ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isFull ? 'Maximum Capacity' : `${3 - memberCount} seat(s) available`}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Each research group is strictly limited to 3 members to ensure rigorous data attribution.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Your Access Role
          </span>
          <div className="text-2xl font-black text-slate-900 tracking-tight capitalize">
            {summary?.userRole || (isOwner ? 'Owner' : 'Researcher')}
          </div>
          <p className="text-xs text-slate-500">
            {isOwner
              ? 'You have Owner privileges to manage settings, invite, and remove members.'
              : 'You can register patients, verify duplicate IDs, and update study records.'}
          </p>
        </div>
      </div>

      {/* TEAM MEMBERS GRID */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider px-1">
          Authorized Study Researchers
        </h3>

        <div className="grid grid-cols-1 gap-4">
          {summary?.members.map((member) => {
            const isMe = member.profileId === user?.id;
            const isMemberOwner = member.role === 'owner';

            return (
              <div
                key={member.profileId}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Member Info */}
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 border border-blue-200">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-bold text-slate-900">{member.displayName}</h4>
                      {isMe && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          isMemberOwner
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {member.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{member.email}</p>
                  </div>
                </div>

                {/* Contribution Metrics */}
                <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total</span>
                    <span className="text-lg font-black text-slate-900">{member.totalAssigned}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-600 block">Active</span>
                    <span className="text-lg font-black text-amber-700">{member.inProgress}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block">Done</span>
                    <span className="text-lg font-black text-emerald-700">{member.completed}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-bold text-rose-600 block">Excluded</span>
                    <span className="text-lg font-black text-rose-700">{member.excluded}</span>
                  </div>

                  {/* Owner remove button */}
                  {isOwner && !isMemberOwner && !isMe && (
                    <button
                      onClick={() =>
                        setMemberToRemove({ id: member.profileId, name: member.displayName })
                      }
                      title="Remove researcher from group"
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PrivacyNotice />

      {/* Invite Member Modal */}
      {currentGroup && (
        <InviteMemberModal
          isOpen={inviteModalOpen}
          group={currentGroup}
          onClose={() => setInviteModalOpen(false)}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Remove Member Confirmation Modal */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">Remove Researcher?</h4>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove <strong>{memberToRemove.name}</strong> from this research group?
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setMemberToRemove(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/25 cursor-pointer disabled:opacity-50"
              >
                {isRemoving ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
