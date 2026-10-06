import React, { useState } from 'react';
import { X, UserPlus, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../services/api.js';
import { useGroup } from '../context/GroupContext.js';

interface JoinGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const JoinGroupModal: React.FC<JoinGroupModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { joinGroup } = useGroup();
  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [preview, setPreview] = useState<{
    groupName: string;
    studyTitle: string;
    targetSampleSize: number;
    memberCount: number;
    maxMembers?: number;
    isFull: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    try {
      setIsChecking(true);
      setError(null);
      const res = await api.getInvitationDetails(code.trim());
      setPreview({
        groupName: res.group.name,
        studyTitle: res.group.studyTitle,
        targetSampleSize: res.group.targetSampleSize,
        memberCount: res.group.memberCount,
        maxMembers: res.group.maxMembers,
        isFull: res.group.isFull,
      });
    } catch (err: any) {
      setError(err.message || 'Invalid or expired invitation code.');
      setPreview(null);
    } finally {
      setIsChecking(false);
    }
  };

  const handleAccept = async () => {
    if (!code.trim()) return;

    try {
      setIsJoining(true);
      setError(null);
      await joinGroup(code.trim());
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Join a Research Group</h3>
              <p className="text-xs text-slate-500">Enter your invitation code</p>
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

        {!preview ? (
          <form onSubmit={handleCheckCode} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Invitation Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="e.g., IVOS-X7K2"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 tracking-wider placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors uppercase text-center"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                Ask your research group owner for an invitation code.
              </p>
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
                disabled={isChecking || !code.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 cursor-pointer transition-all disabled:opacity-50"
              >
                {isChecking ? 'Verifying...' : 'Look Up Code'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-2">
              <p className="text-xs text-blue-700 font-bold uppercase tracking-wider">
                You have been invited to join:
              </p>
              <h4 className="text-base font-extrabold text-slate-900">{preview.groupName}</h4>
              <p className="text-xs text-slate-600 italic">&ldquo;{preview.studyTitle}&rdquo;</p>

              <div className="pt-2 flex items-center justify-between text-xs border-t border-blue-200/60 font-semibold text-slate-700">
                <span>Target: {preview.targetSampleSize} cases</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] ${
                    preview.isFull
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {preview.memberCount} {preview.maxMembers ? `/ ${preview.maxMembers}` : ''} Researchers
                </span>
              </div>
            </div>

            {preview.isFull ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                This research group has reached its maximum capacity of 3 researchers.
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600">
                Upon accepting, you will join as a <strong>Researcher</strong>. You can register patient cases, verify duplicate IDs, and update study records.
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Back
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-slate-500 text-xs font-semibold hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isJoining || preview.isFull}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 cursor-pointer transition-all disabled:opacity-50"
                >
                  <span>{isJoining ? 'Joining Group...' : 'Accept Invitation'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
