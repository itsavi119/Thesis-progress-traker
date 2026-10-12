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
  Check,
  KeyRound,
} from 'lucide-react';
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
  const { signInWithEmail, signUpWithEmail, sendPasswordReset, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Forgot & Reset Password modal state
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'reset' | 'done'>('request');
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotToken, setForgotToken] = useState<string>('');
  const [forgotNewPassword, setForgotNewPassword] = useState<string>('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState<string>('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState<boolean>(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState<boolean>(false);
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'submitting'>('idle');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);

  // Check URL parameters for password reset link (e.g. ?token=...)
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const tokenParam = searchParams.get('reset_token') || searchParams.get('token');
      const emailParam = searchParams.get('email');
      if (tokenParam) {
        setForgotToken(tokenParam);
        if (emailParam) setForgotEmail(emailParam);
        setForgotStep('reset');
        setShowForgotPassword(true);
      }
    } catch {}
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

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    // Basic Client Validations
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

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

        await signUpWithEmail(email.trim(), password, displayName.trim());
        onSuccessfulLogin?.();
      } else {
        // Sign In
        await signInWithEmail(email.trim(), password);
        onSuccessfulLogin?.();
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Forgot Password (Request Token) Handler
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotNotice(null);
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.');
      return;
    }

    setForgotStatus('submitting');
    try {
      const res = await sendPasswordReset(forgotEmail.trim());
      setForgotStatus('idle');
      if (res?.devResetToken) {
        setForgotToken(res.devResetToken);
        setForgotNotice('Security reset token generated successfully. You can now set your new password below.');
      } else {
        setForgotNotice('Reset instructions generated. Enter your reset token below to complete.');
      }
      setForgotStep('reset');
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to dispatch password reset request.');
      setForgotStatus('idle');
    }
  };

  // Reset Password Confirmation Handler
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.');
      return;
    }

    if (!forgotToken.trim()) {
      setForgotError('Please enter the password reset token.');
      return;
    }

    const valResult = validatePasswordBasic(forgotNewPassword);
    if (!valResult.isValid) {
      setForgotError(valResult.message || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    const matchResult = validatePasswordConfirmation(forgotNewPassword, forgotConfirmPassword);
    if (!matchResult.isValid) {
      setForgotError(matchResult.message || 'Passwords do not match.');
      return;
    }

    setForgotStatus('submitting');
    try {
      await resetPassword({
        email: forgotEmail.trim(),
        resetToken: forgotToken.trim(),
        newPassword: forgotNewPassword,
        confirmPassword: forgotConfirmPassword,
      });
      setForgotStatus('idle');
      setForgotStep('done');
      setEmail(forgotEmail.trim());
      setPassword('');
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to reset password. Please check your reset token.');
      setForgotStatus('idle');
    }
  };

  const isActionDisabled = isSubmitting;

  return (
    <div className="min-h-screen bg-slate-50/90 text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 antialiased selection:bg-blue-100 selection:text-blue-900">
      <div className="w-full max-w-md space-y-4 sm:space-y-5">
        {/* Navigation link back to public overview */}
        {onNavigateHome && (
          <div className="flex items-center justify-between">
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

        {/* Main Card */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-5 transition-all">
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <Logo size="md" variant="horizontal" showText={false} />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Thesis Progress Tracker
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {isRegistering ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {isRegistering
                ? 'Create an account to start managing your thesis research.'
                : 'Sign in to continue to your research workspace.'}
            </p>
          </div>

          {/* Segmented Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-100/90 rounded-2xl text-xs font-bold border border-slate-200/60">
            <button
              type="button"
              onClick={() => switchMode('login')}
              disabled={isActionDisabled}
              className={`py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
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
              disabled={isActionDisabled}
              className={`py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                isRegistering
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50/95 border border-rose-200/90 shadow-xs text-xs text-rose-900 animate-in fade-in duration-150 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-rose-700 uppercase tracking-wider text-[10px]">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  Authentication Notice
                </span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  aria-label="Dismiss notice"
                  className="p-1 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-100/60 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="font-semibold leading-relaxed text-rose-900 text-xs break-words">
                {error}
              </p>
            </div>
          )}

          {/* =========================================================================
              SIGN-IN VIEW
              Order:
              1. Email & Password Form (Email, Password, Forgot Password?, Sign In)
              2. Bottom: Don't have an account? Create account
             ========================================================================= */}
          {!isRegistering && (
            <div className="space-y-3.5">
              {/* Email + Password Sign-In Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      disabled={isActionDisabled}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotStep('request');
                        setForgotToken('');
                        setForgotNewPassword('');
                        setForgotConfirmPassword('');
                        setForgotStatus('idle');
                        setForgotError(null);
                        setForgotNotice(null);
                        setShowForgotPassword(true);
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      disabled={isActionDisabled}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors disabled:opacity-60"
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

                {/* Primary Email Submit Button: Sign In */}
                <button
                  type="submit"
                  disabled={isActionDisabled}
                  className="w-full min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </span>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>

              {/* Bottom Switcher: Don't have an account? Create account */}
              <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-600">
                <p>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    disabled={isActionDisabled}
                    className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer underline-offset-2 hover:underline"
                  >
                    Create account
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* =========================================================================
              SIGN-UP VIEW
              Order:
              1. Form Fields (Full Name, Email Address, Password, Confirm Password)
              2. Primary: Create Account
              3. Bottom: Already have an account? Sign in
             ========================================================================= */}
          {isRegistering && (
            <div className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      autoFocus
                      disabled={isActionDisabled}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Dr. Alex Morgan"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      disabled={isActionDisabled}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Password
                    </label>
                    <span className="text-[11px] text-slate-400">Min. 10 characters</span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      disabled={isActionDisabled}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors disabled:opacity-60"
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

                {/* Confirm Password */}
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
                      disabled={isActionDisabled}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-colors disabled:opacity-60"
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
                      className={`text-[11px] mt-1 font-medium flex items-center gap-1 ${
                        confirmPassword === password ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {confirmPassword === password ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Passwords match</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3" />
                          <span>Passwords do not match</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {/* Primary Button: Create Account */}
                <button
                  type="submit"
                  disabled={isActionDisabled}
                  className="w-full min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Creating Account...</span>
                    </span>
                  ) : (
                    <span>Create Account</span>
                  )}
                </button>
              </form>



              {/* Bottom Switcher: Already have an account? Sign in */}
              <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-600">
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    disabled={isActionDisabled}
                    className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer underline-offset-2 hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Forgot & Reset Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {forgotStep === 'request'
                      ? 'Reset Password'
                      : forgotStep === 'reset'
                      ? 'Set New Password'
                      : 'Password Reset'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {forgotStep === 'request'
                      ? 'Step 1: Request verification token'
                      : forgotStep === 'reset'
                      ? 'Step 2: Enter token & new password'
                      : 'Success'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ERROR BANNER */}
            {forgotError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{forgotError}</p>
              </div>
            )}

            {/* NOTICE BANNER */}
            {forgotNotice && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{forgotNotice}</p>
              </div>
            )}

            {/* STEP 1: REQUEST TOKEN */}
            {forgotStep === 'request' && (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter your registered email address. We will verify your account and provide a single-use security token to reset your password.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Account Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="w-1/2 py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotStatus === 'submitting'}
                    className="w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {forgotStatus === 'submitting' ? 'Generating...' : 'Continue'}
                  </button>
                </div>

                <div className="text-center pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotError(null);
                      setForgotStep('reset');
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer hover:underline"
                  >
                    Already have a reset token? Enter token directly
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: ENTER TOKEN & NEW PASSWORD */}
            {forgotStep === 'reset' && (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
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

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Reset Token
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">15-min validity</span>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={forgotToken}
                      onChange={(e) => setForgotToken(e.target.value)}
                      placeholder="Paste your reset token here"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showForgotNewPassword ? 'text' : 'password'}
                      required
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="At least 10 characters"
                      className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showForgotNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showForgotConfirmPassword ? 'text' : 'password'}
                      required
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotConfirmPassword(!showForgotConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showForgotConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotError(null);
                      setForgotNotice(null);
                      setForgotStep('request');
                    }}
                    className="w-1/3 py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotStatus === 'submitting'}
                    className="w-2/3 py-2 px-3 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {forgotStatus === 'submitting' ? 'Updating...' : 'Set New Password'}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: DONE */}
            {forgotStep === 'done' && (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-xs text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-emerald-900">Password successfully updated!</p>
                    <p className="text-emerald-700 leading-relaxed">
                      Your password for <span className="font-semibold">{forgotEmail}</span> has been updated. You can now sign in using your new credentials.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer shadow-xs"
                >
                  Proceed to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
