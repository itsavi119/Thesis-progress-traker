import React, { useState } from 'react';
import { X, UserPlus, Copy, Check, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../services/api.js';
import type { GroupInvitation, ResearchGroup } from '../types/index.js';

interface InviteMemberModalProps {
  isOpen: boolean;
  group: ResearchGroup;
  onClose: () => void;
  onSuccess?: () => void;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  group,
  onClose,
  onSuccess,
}) => {
  const [intendedEmail, setIntendedEmail] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invitation, setInvitation] = useState<GroupInvitation | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentMembersCount = group.members.length;

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsGenerating(true);
      setError(null);
      const res = await api.createInvitation(group.id, intendedEmail.trim() || undefined);
      setInvitation(res.invitation);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to generate invitation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (!invitation) return;
    navigator.clipboard.writeText(invitation.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
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
              <h3 className="text-base font-bold text-slate-900">Invite Co-Investigator</h3>
              <p className="text-xs text-slate-500">{group.name}</p>
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

        {!invitation ? (
          <form onSubmit={handleGenerateInvite} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Active Research Team</span>
                <span className="text-blue-600">{currentMembersCount} Members</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Generate a secure invitation code to onboard research collaborators.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Researcher Email (Optional)
              </label>
              <input
                type="email"
                value={intendedEmail}
                onChange={(e) => setIntendedEmail(e.target.value)}
                placeholder="colleague@hospital.org"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 transition-colors"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Optional note to designate who this invitation is intended for.
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
                disabled={isGenerating}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 cursor-pointer transition-all disabled:opacity-50"
              >
                {isGenerating ? 'Generating...' : 'Generate Invite Code'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-200 text-center space-y-3">
              <p className="text-xs text-blue-700 font-bold uppercase tracking-wider">
                Invitation Code Generated
              </p>
              <div className="text-2xl font-black font-mono tracking-widest text-slate-900 bg-white py-3 px-4 rounded-xl border border-blue-200 select-all">
                {invitation.code}
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95"
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Code'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Expires in 7 days ({new Date(invitation.expiresAt).toLocaleDateString()})</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  The researcher can sign in and enter this code under <strong>Join a Study</strong>.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
