import React, { useState } from 'react';
import { Lock, X, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordBasic,
  validatePasswordConfirmation,
} from '../utils/passwordPolicy.js';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isGoogleAccount = user?.auth_provider === 'google' || user?.has_password === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError('Please enter your current password.');
      return;
    }

    const basicVal = validatePasswordBasic(newPassword);
    if (!basicVal.isValid) {
      setError(basicVal.message || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    const matchVal = validatePasswordConfirmation(newPassword, confirmPassword);
    if (!matchVal.isValid) {
      setError(matchVal.message || 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setSuccess(res.message || 'Password changed successfully!');
      setTimeout(() => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccess(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Change Account Password</h3>
              <p className="text-xs text-slate-500">Update your researcher login credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isGoogleAccount ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2 text-xs text-blue-900">
              <div className="flex items-center gap-2 font-bold text-sm text-blue-800">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Google Single Sign-On Active</span>
              </div>
              <p className="leading-relaxed">
                You are signed in with your <strong>Google Account</strong> ({user?.email}). Because your authentication is managed securely by Google, you do not have a separate local password for this application.
              </p>
              <p className="leading-relaxed text-blue-700">
                To update your password or two-factor authentication, please visit your Google Account Security settings.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-medium">{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Minimum {MIN_PASSWORD_LENGTH} characters. Common or breached passwords will be rejected.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
