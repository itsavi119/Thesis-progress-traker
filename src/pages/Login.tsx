import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  User,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { Logo } from '../components/Logo.js';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordBasic,
  validatePasswordConfirmation,
} from '../utils/passwordPolicy.js';

interface LoginProps {
  onSuccessfulLogin?: () => void;
  onNavigateHome?: () => void;
  onSwitchMode?: (mode: 'login' | 'register') => void;
  initialMode?: 'login' | 'register';
}

export const Login: React.FC<LoginProps> = ({
  onSuccessfulLogin,
  onNavigateHome,
  onSwitchMode,
  initialMode = 'login',
}) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(false);

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Forgot Password modal state
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Restore remembered email
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('thesis_tracker_remembered_email');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch {
      // Ignore localStorage access failures
    }
  }, []);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode]);

  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError(null);
    setPassword('');
    setConfirmPassword('');
    onSwitchMode?.(newMode);
  };

  const isRegistering = mode === 'register';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isRegistering) {
        if (!displayName.trim()) {
          throw new Error('Please enter your full name.');
        }

        const basicVal = validatePasswordBasic(password);
        if (!basicVal.isValid) {
          throw new Error(basicVal.message || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        }

        const matchVal = validatePasswordConfirmation(password, confirmPassword);
        if (!matchVal.isValid) {
          throw new Error(matchVal.message || 'Passwords do not match.');
        }

        await register(email.trim(), password, displayName.trim());
        onSuccessfulLogin?.();
      } else {
        // Sign In
        if (rememberMe) {
          try {
            localStorage.setItem('thesis_tracker_remembered_email', email.trim());
          } catch {
            // Ignore storage failure
          }
        } else {
          try {
            localStorage.removeItem('thesis_tracker_remembered_email');
          } catch {
            // Ignore storage failure
          }
        }

        await login(email.trim(), password);
        onSuccessfulLogin?.();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.');
      return;
    }

    setForgotStatus('submitting');
    try {
      await api.forgotPassword({ email: forgotEmail.trim() });
      setForgotStatus('success');
    } catch (err: any) {
      console.warn('Password reset notice:', err);
      // For privacy/security, indicate success
      setForgotStatus('success');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 antialiased selection:bg-blue-100 selection:text-blue-900">
      <div className="w-full max-w-md space-y-5">
        {/* Navigation link back to overview */}
        {onNavigateHome && (
          <div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer py-1 group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Overview</span>
            </button>
          </div>
        )}

        {/* Brand Header */}
        <div className="text-center space-y-1">
          <Logo size="md" variant="vertical" showText={true} />
        </div>

        {/* Main Card */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-5">
          {/* Segmented Switch: [ Sign In ] [ Sign Up ] */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold border border-slate-200/60">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                !isRegistering
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                isRegistering
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Title & Description */}
          <div className="text-center space-y-1 pb-1">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {isRegistering ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isRegistering
                ? 'Sign up to coordinate research milestones and track clinical cases.'
                : 'Sign in to access your thesis and clinical workspaces.'}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name (Sign Up only) */}
            {isRegistering && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    autoFocus={isRegistering}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Dr. Alex Morgan"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoFocus={!isRegistering}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                {isRegistering && (
                  <span className="text-[11px] text-slate-400">Min. 10 characters</span>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password (Sign Up only) */}
            {isRegistering && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password && (
                  <p
                    className={`text-[11px] mt-1 font-medium ${
                      confirmPassword === password ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {confirmPassword === password ? '✓ Passwords match' : '✕ Passwords do not match'}
                  </p>
                )}
              </div>
            )}

            {/* Sign In Options: Remember Me & Forgot Password */}
            {!isRegistering && (
              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  />
                  <span className="font-medium">Remember me</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotStatus('idle');
                    setForgotError(null);
                    setShowForgotPassword(true);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Primary Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{isRegistering ? 'Creating account...' : 'Signing in...'}</span>
                </span>
              ) : (
                <span>{isRegistering ? 'Create Account' : 'Sign In'}</span>
              )}
            </button>
          </form>

          {/* Mode Switch Footer */}
          <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-600">
            {isRegistering ? (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  Sign Up
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Reset Password</h3>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotStatus === 'success' ? (
              <div className="space-y-4 py-2">
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    If an account is associated with <span className="font-semibold">{forgotEmail}</span>,
                    password reset instructions have been sent. Please check your inbox.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3.5">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enter your email address and we will send instructions to reset your password.
                </p>

                {forgotError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {forgotError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="w-1/2 py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotStatus === 'submitting'}
                    className="w-1/2 py-2 px-3 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {forgotStatus === 'submitting' ? 'Sending...' : 'Send Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
