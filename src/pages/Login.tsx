import React, { useState } from 'react';
import { Lock, Mail, User, ShieldCheck, AlertCircle, Building2, ArrowLeft, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import { Logo } from '../components/Logo.js';
import { api } from '../services/api.js';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordBasic,
  validatePasswordConfirmation,
} from '../utils/passwordPolicy.js';

interface LoginProps {
  onSuccessfulLogin?: (isAppOwner: boolean) => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccessfulLogin }) => {
  const { login, register, signInWithGoogle } = useAuth();
  const [isOrgLoginMode, setIsOrgLoginMode] = useState<boolean>(false);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSubmitting(true);
    try {
      if (isOrgLoginMode) {
        // Sign in via Firebase Google then verify with server-side organization-login endpoint
        const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
        const { auth } = await import('../firebase/config.js');
        const provider = new GoogleAuthProvider();
        const userCred = await signInWithPopup(auth, provider);
        const gUser = userCred.user;

        const authRes = await api.organizationLogin({
          uid: gUser.uid,
          email: gUser.email || '',
          displayName: gUser.displayName || undefined,
        });

        if (!authRes.user.is_app_owner) {
          api.logout();
          throw new Error('Access denied.');
        }

        if (onSuccessfulLogin) {
          onSuccessfulLogin(true);
        } else {
          window.location.hash = '#app-owner';
          window.location.reload();
        }
      } else {
        await signInWithGoogle();
        onSuccessfulLogin?.(false);
      }
    } catch (err: any) {
      console.error('Sign-In error:', err);
      // Strictly generic message for organization login rejections
      if (isOrgLoginMode) {
        setError('Access denied.');
      } else if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setError(
          `Google Sign-In is unavailable because "${domain}" is not in the Firebase Authorized Domains list. Please sign in or register with your email and password below, or add this domain in your Firebase Authentication Console.`
        );
      } else {
        setError(err.message || 'Google Sign-In failed. Please try again or use email credentials.');
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isOrgLoginMode) {
        // Organization administration login
        const authRes = await api.organizationLogin({
          email: email.trim(),
          password,
        });

        if (!authRes.user.is_app_owner) {
          api.logout();
          throw new Error('Access denied.');
        }

        if (onSuccessfulLogin) {
          onSuccessfulLogin(true);
        } else {
          window.location.hash = '#app-owner';
          window.location.reload();
        }
      } else if (isRegistering) {
        if (!displayName.trim()) {
          throw new Error('Please enter your full name or research team display name.');
        }

        const basicVal = validatePasswordBasic(password);
        if (!basicVal.isValid) {
          throw new Error(basicVal.message || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        }

        const matchVal = validatePasswordConfirmation(password, confirmPassword);
        if (!matchVal.isValid) {
          throw new Error(matchVal.message || 'Passwords do not match.');
        }

        await register(email, password, displayName);
        onSuccessfulLogin?.(false);
      } else {
        await login(email, password);
        onSuccessfulLogin?.(false);
      }
    } catch (err: any) {
      if (isOrgLoginMode) {
        setError('Access denied.');
      } else {
        setError(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 antialiased">
      <div className="w-full max-w-md space-y-6">
        {/* Brand & App Title */}
        <Logo
          size="lg"
          variant="vertical"
          showText={true}
          subtitle="General-Purpose Thesis & Clinical Research Coordination Platform"
        />

        {/* General Research Platform Announcement */}
        {!isOrgLoginMode ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <span className="text-slate-800 font-bold block">Academic & Clinical Research Studies</span>
                <span className="text-slate-500 text-[11px]">
                  Configurable for Pharm.D, hospital trials, surveys, and multi-investigator projects.
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200 shrink-0">
              Open Access
            </span>
          </div>
        ) : (
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between text-xs shadow-md">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold block">Organization Administration Portal</span>
                <span className="text-slate-400 text-[11px]">
                  Restricted authentication area for authorized platform administrators.
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold border border-amber-400/30 shrink-0">
              Restricted
            </span>
          </div>
        )}

        {/* Auth Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-5">
          {/* Organization Login Back Button or Header */}
          {isOrgLoginMode && (
            <button
              type="button"
              onClick={() => {
                setIsOrgLoginMode(false);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Researcher Workspace</span>
            </button>
          )}

          {/* Primary Action: Google Sign-In */}
          <div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSubmitting || isSubmitting}
              className="w-full min-h-[50px] flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 hover:border-slate-300 rounded-2xl font-bold text-sm shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer touch-manipulation"
            >
              {isGoogleSubmitting ? (
                <span className="w-5 h-5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>
                {isGoogleSubmitting
                  ? 'Authenticating...'
                  : isOrgLoginMode
                  ? 'Organization Sign-In with Google'
                  : 'Continue with Google'}
              </span>
            </button>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              {isOrgLoginMode
                ? 'Only verified organization administrators are authorized.'
                : 'Secure Single Sign-On for Investigators and Study Teams'}
            </p>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-xs text-slate-400 font-medium shrink-0">
              {isOrgLoginMode ? 'or administrator credentials' : 'or institutional credentials'}
            </span>
            <div className="border-t border-slate-200 w-full" />
          </div>

          {/* Normal Mode: Sign In vs Create Account Tabs */}
          {!isOrgLoginMode && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(false);
                  setConfirmPassword('');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  !isRegistering
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(true);
                  setConfirmPassword('');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  isRegistering
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isOrgLoginMode && isRegistering && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Researcher Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Dr. Sarah Jenkins"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isOrgLoginMode ? 'Administrator Email' : 'Institutional Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="investigator@hospital.org"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              {isRegistering && (
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                  Minimum {MIN_PASSWORD_LENGTH} characters. Strong passphrases recommended; common or breached passwords are prohibited.
                </p>
              )}
            </div>

            {isRegistering && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className={`w-full min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer ${
                isOrgLoginMode
                  ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25'
              }`}
            >
              {isSubmitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isOrgLoginMode ? (
                'Sign In to Organization Admin'
              ) : isRegistering ? (
                'Create Researcher Account'
              ) : (
                'Sign In to Research Workspace'
              )}
            </button>
          </form>

          {/* Section 16 Requirement: Visible Organization Login Access Point */}
          {!isOrgLoginMode && (
            <div className="pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsOrgLoginMode(true);
                  setError(null);
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Organization Login</span>
              </button>
              <p className="text-[10px] text-slate-400 mt-1">
                Restricted access for authorized institutional & application administrators
              </p>
            </div>
          )}
        </div>

        <PrivacyNotice />
      </div>
    </div>
  );
};
