import React, { useState, useEffect } from 'react';
import { Lock, Mail, User, AlertCircle, Building2, ArrowLeft, Shield, UserPlus, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { Logo } from '../components/Logo.js';
import { api } from '../services/api.js';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordBasic,
  validatePasswordConfirmation,
} from '../utils/passwordPolicy.js';

interface LoginProps {
  onSuccessfulLogin?: (isAppOwner: boolean) => void;
  onNavigateHome?: () => void;
  onSwitchMode?: (mode: 'login' | 'register' | 'organization-login') => void;
  initialMode?: 'login' | 'register' | 'organization-login';
}

export const Login: React.FC<LoginProps> = ({
  onSuccessfulLogin,
  onNavigateHome,
  onSwitchMode,
  initialMode = 'login',
}) => {
  const { login, register, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'organization-login'>(initialMode);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode]);

  const switchMode = (newMode: 'login' | 'register' | 'organization-login') => {
    setMode(newMode);
    setError(null);
    onSwitchMode?.(newMode);
  };

  const isOrgMode = mode === 'organization-login';
  const isRegistering = mode === 'register';

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSubmitting(true);
    try {
      if (isOrgMode) {
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
          throw new Error('Access denied: User is not an authorized organization administrator.');
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
      // User closed or dismissed the Google popup window; cleanly abort without error banner
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('popup-closed-by-user') ||
        err?.message?.includes('cancelled-popup-request')
      ) {
        return;
      }

      console.error('Sign-In error:', err);
      if (isOrgMode) {
        setError('Access denied: User is not an authorized organization administrator.');
      } else if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup-blocked')) {
        setError('The sign-in popup was blocked by your browser. Please allow popups or use email credentials.');
      } else if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setError(
          `Google Sign-In is unavailable because "${domain}" is not in the Firebase Authorized Domains list. Please sign in or register with email and password below.`
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
      if (isOrgMode) {
        const authRes = await api.organizationLogin({
          email: email.trim(),
          password,
        });

        if (!authRes.user.is_app_owner) {
          api.logout();
          throw new Error('Access denied: You are not authorized as an organization administrator.');
        }

        if (onSuccessfulLogin) {
          onSuccessfulLogin(true);
        } else {
          window.location.hash = '#app-owner';
          window.location.reload();
        }
      } else if (isRegistering) {
        if (!displayName.trim()) {
          throw new Error('Please enter your full name or research investigator title.');
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
      if (isOrgMode) {
        setError(err.message || 'Access denied.');
      } else {
        setError(err.message || 'Authentication failed. Please verify your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 antialiased">
      <div className="w-full max-w-md space-y-6">
        {/* Navigation Link back to Public Website */}
        {onNavigateHome && (
          <div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer py-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Platform Overview</span>
            </button>
          </div>
        )}

        {/* Brand & App Title Header */}
        <div className="text-center space-y-2">
          <Logo
            size="md"
            variant="vertical"
            showText={true}
          />
        </div>

        {/* ========================================================================= */}
        {/* VIEW A: ORGANIZATION LOGIN (Clearly Separated)                           */}
        {/* ========================================================================= */}
        {isOrgMode ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-5">
            <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs font-bold">Organization Administration Access</p>
                <p className="text-[11px] text-slate-400">
                  Restricted access for authorized institutional & application administrators.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {/* Google Sign In for Organization */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSubmitting || isSubmitting}
              className="w-full min-h-[48px] flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 hover:border-slate-300 rounded-2xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isGoogleSubmitting ? (
                <span className="w-4 h-4 border-2 border-slate-700/30 border-t-slate-700 rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
              <span>Organization Sign-In with Google</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[11px] text-slate-400 font-medium shrink-0">
                or administrator credentials
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@hospital.org"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-slate-800 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/10 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Administrator Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-slate-800 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isGoogleSubmitting}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Verifying...' : 'Sign In to Organization Workspace'}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                ← Back to Researcher Workspace Sign In
              </button>
            </div>
          </div>
        ) : isRegistering ? (
          /* ========================================================================= */
          /* VIEW B: GET STARTED / CREATE RESEARCH ACCOUNT (/register)                */
          /* ========================================================================= */
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-5 animate-in fade-in duration-150">
            {/* Distinct Header for Registration */}
            <div className="text-center space-y-1 pb-1 border-b border-slate-100">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                <UserPlus className="w-3.5 h-3.5" />
                <span>Get Started — New Account</span>
              </div>
              <h2 className="text-lg font-extrabold text-slate-900">Create Research Account</h2>
              <p className="text-xs text-slate-500">
                Register to coordinate thesis studies, track milestones, and manage clinical cases.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name / Investigator Title
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institutional Email Address
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Create Password</label>
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
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                  Minimum {MIN_PASSWORD_LENGTH} characters. Common or breached passwords will be rejected.
                </p>
              </div>

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

              <button
                type="submit"
                disabled={isSubmitting || isGoogleSubmitting}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Create Research Account'
                )}
              </button>
            </form>

            <div className="relative flex items-center justify-center pt-1">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-xs text-slate-400 font-medium shrink-0">
                or sign up with Google
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            {/* Google Sign-Up */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSubmitting || isSubmitting}
              className="w-full min-h-[44px] flex items-center justify-center gap-3 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl font-semibold text-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isGoogleSubmitting ? (
                <span className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
              <span>Continue with Google</span>
            </button>

            {/* Toggle to Sign In */}
            <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-600">
              <p>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer underline"
                >
                  Sign In to your workspace →
                </button>
              </p>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* VIEW C: SIGN IN TO RESEARCH WORKSPACE (/login)                           */
          /* ========================================================================= */
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-5 animate-in fade-in duration-150">
            {/* Distinct Header for Sign In */}
            <div className="text-center space-y-1 pb-1 border-b border-slate-100">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                <LogIn className="w-3.5 h-3.5" />
                <span>Existing Researcher Sign In</span>
              </div>
              <h2 className="text-lg font-extrabold text-slate-900">Sign In to Research Workspace</h2>
              <p className="text-xs text-slate-500">
                Access your clinical cases, milestones, and active research groups.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {/* Primary Action: Google Sign-In */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleSubmitting || isSubmitting}
                className="w-full min-h-[48px] flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 hover:border-slate-300 rounded-2xl font-bold text-sm shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer touch-manipulation"
              >
                {isGoogleSubmitting ? (
                  <span className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
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
                <span>Continue with Google</span>
              </button>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-xs text-slate-400 font-medium shrink-0">
                or institutional credentials
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institutional Email
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
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isGoogleSubmitting}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Sign In to Research Workspace'
                )}
              </button>
            </form>

            {/* Toggle to Register / Get Started */}
            <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-600">
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer underline"
                >
                  Get Started / Create Account →
                </button>
              </p>
            </div>

            {/* Visually Separated Organization Login Entry Point */}
            <div className="pt-4 border-t border-slate-100 text-center space-y-1">
              <button
                type="button"
                onClick={() => switchMode('organization-login')}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Organization Login</span>
              </button>
              <p className="text-[10px] text-slate-400">
                Restricted access for authorized institutional and application administrators.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
