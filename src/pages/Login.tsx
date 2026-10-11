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
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth();
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
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

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
      // Ignore storage access issues
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

  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    if (isSubmitting || isGoogleSubmitting) return;
    setError(null);
    setIsGoogleSubmitting(true);

    try {
      const success = await signInWithGoogle();
      if (success) {
        onSuccessfulLogin?.();
      }
    } catch (err: any) {
      console.warn('Google sign-in notice:', err?.message || err);
      setError(err?.message || 'Google authentication was not completed. Please try again.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  // Instant login for Anil Shah (Admin / App Owner)
  const handleQuickLoginAnil = async () => {
    if (isSubmitting || isGoogleSubmitting) return;
    setEmail('anilshah.as118@gmail.com');
    setPassword('Research2026!');
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmail('anilshah.as118@gmail.com', 'Research2026!');
      onSuccessfulLogin?.();
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isGoogleSubmitting) return;
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
        if (rememberMe) {
          try {
            localStorage.setItem('thesis_tracker_remembered_email', email.trim());
          } catch {}
        } else {
          try {
            localStorage.removeItem('thesis_tracker_remembered_email');
          } catch {}
        }

        await signInWithEmail(email.trim(), password);
        onSuccessfulLogin?.();
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Forgot Password Handler
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.');
      return;
    }

    setForgotStatus('submitting');
    try {
      await sendPasswordReset(forgotEmail.trim());
      setForgotStatus('success');
    } catch (err: any) {
      console.warn('Password reset notice:', err);
      setForgotStatus('success');
    }
  };

  const isActionDisabled = isSubmitting || isGoogleSubmitting;

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
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/90 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* =========================================================================
              SIGN-IN VIEW
              Order:
              1. Primary: Continue with Google
              2. OR
              3. Form (Email, Password, Forgot Password?, Sign In)
              4. Bottom: Don't have an account? Create account
             ========================================================================= */}
          {!isRegistering && (
            <div className="space-y-4">
              {/* Primary Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isActionDisabled}
                className="w-full min-h-[46px] flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 rounded-xl font-semibold text-sm shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer touch-manipulation"
              >
                {isGoogleSubmitting ? (
                  <span className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                ) : (
                  <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24">
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

              {/* Divider: OR */}
              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  OR
                </span>
                <div className="border-t border-slate-200 w-full" />
              </div>

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
                        setForgotStatus('idle');
                        setForgotError(null);
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

                {/* Remember Me */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      disabled={isActionDisabled}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    />
                    <span className="font-medium">Remember me</span>
                  </label>
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

              {/* Instant Access for Anil Shah (Admin) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Workspace Administrator</span>
                  <span className="text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider bg-blue-100 text-blue-700 rounded-md">
                    Admin
                  </span>
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Direct access for <span className="font-mono text-slate-700 font-medium">anilshah.as118@gmail.com</span>
                </p>
                <button
                  type="button"
                  onClick={handleQuickLoginAnil}
                  disabled={isActionDisabled}
                  className="w-full mt-1 py-2 px-3 bg-white hover:bg-blue-50 text-blue-600 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Instant Sign-In as Anil Shah</span>
                </button>
              </div>

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
              3. Divider: OR
              4. Continue with Google
              5. Bottom: Already have an account? Sign in
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

              {/* Divider: OR */}
              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  OR
                </span>
                <div className="border-t border-slate-200 w-full" />
              </div>

              {/* Continue with Google */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isActionDisabled}
                className="w-full min-h-[46px] flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 rounded-xl font-semibold text-sm shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer touch-manipulation"
              >
                {isGoogleSubmitting ? (
                  <span className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                ) : (
                  <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24">
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
              <div className="space-y-4">
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
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
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
