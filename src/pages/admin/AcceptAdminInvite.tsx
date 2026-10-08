import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, CheckCircle2, Lock, User, ArrowRight, AlertTriangle, KeyRound } from 'lucide-react';
import { api } from '../../services/api.js';
import type { AdminInvitation, UserProfile } from '../../types/index.js';

interface AcceptAdminInviteProps {
  token: string;
  onAcceptSuccess: (user: UserProfile) => void;
  onNavigateHome: () => void;
  onNavigateAdminLogin: () => void;
}

export const AcceptAdminInvite: React.FC<AcceptAdminInviteProps> = ({
  token,
  onAcceptSuccess,
  onNavigateHome,
  onNavigateAdminLogin,
}) => {
  const [verifying, setVerifying] = useState<boolean>(true);
  const [invitation, setInvitation] = useState<AdminInvitation | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function checkToken() {
      if (!token) {
        setVerifyError('No invitation token was provided in the URL.');
        setVerifying(false);
        return;
      }

      try {
        const res = await api.verifyAdminInvitation(token);
        if (isMounted) {
          if (res.valid && res.invitation) {
            setInvitation(res.invitation);
            setDisplayName(res.invitation.email.split('@')[0]);
          } else {
            setVerifyError('This administrator invitation is invalid or has expired.');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setVerifyError(err?.message || 'Failed to verify administrator invitation link.');
        }
      } finally {
        if (isMounted) setVerifying(false);
      }
    }

    checkToken();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!displayName.trim()) {
      setFormError('Please enter your full name or display name.');
      return;
    }

    if (password.length < 8) {
      setFormError('Administrator password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.acceptAdminInvitation({
        token,
        displayName: displayName.trim(),
        password,
      });

      if (res.user) {
        onAcceptSuccess(res.user);
      } else {
        throw new Error('Failed to retrieve user profile after invitation acceptance.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Could not accept invitation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-2 border-slate-700 border-t-rose-500 rounded-full animate-spin mb-4" />
        <h2 className="text-base font-semibold text-white">Verifying Administrator Invitation...</h2>
        <p className="text-xs text-slate-400 mt-1">Checking cryptographic authorization token</p>
      </div>
    );
  }

  if (verifyError || !invitation) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/80 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Invitation Invalid or Expired</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {verifyError || 'This administrator invitation token is not valid. It may have already been accepted, revoked, or expired.'}
          </p>
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-left text-xs text-slate-400 mb-6 space-y-1">
            <p className="font-semibold text-slate-300">Need Administrator Access?</p>
            <p>
              Please contact the Super Administrator (<span className="text-rose-300">avishah.as118@gmail.com</span>) to request a fresh invitation link.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onNavigateHome}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
            >
              Return Home
            </button>
            <button
              type="button"
              onClick={onNavigateAdminLogin}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Admin Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center shadow-lg shadow-rose-900/40 border border-rose-500/30">
            <Shield className="w-6 h-6 text-white" />
          </div>
        </div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-white">
          Administrator Invitation
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Thesis Progress Tracker • Official Administrative Access
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 backdrop-blur-sm">
          {/* Inviter Badge */}
          <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-rose-400 font-semibold mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Verified Super Administrator Invitation</span>
            </div>
            <p className="text-xs text-slate-300">
              <strong className="text-white">{invitation.invitedByEmail || 'avishah.as118@gmail.com'}</strong> has invited you to join as an{' '}
              <span className="uppercase font-bold text-rose-300 px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-[10px]">
                {invitation.role === 'super_admin' ? 'Super Administrator' : 'Administrator'}
              </span>
            </p>
            {invitation.note && (
              <p className="mt-2 text-[11px] text-slate-400 italic bg-slate-900/80 p-2 rounded border border-slate-800/80">
                "{invitation.note}"
              </p>
            )}
          </div>

          {formError && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Designated Email
              </label>
              <input
                type="email"
                value={invitation.email}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 text-xs font-medium cursor-not-allowed"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                This invitation is strictly bound to this email address.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Your Full Name / Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Dr. John Doe"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Set Administrator Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Granting Administrative Privileges...
                </span>
              ) : (
                <>
                  <span>Accept Invitation & Open Admin Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={onNavigateAdminLogin}
              className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Already have credentials? Sign in to Admin Portal →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
