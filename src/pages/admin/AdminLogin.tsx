import React, { useState } from 'react';
import { ShieldAlert, Lock, Mail, ArrowRight, ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api.js';
import { auth, googleProvider } from '../../firebase/config.js';
import { signInWithPopup, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';
import type { UserProfile } from '../../types/index.js';

interface AdminLoginProps {
  onLoginSuccess: (user: UserProfile) => void;
  onNavigateHome: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onNavigateHome }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Administrator email and password are required.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await api.adminLogin({ email: email.trim(), password });
      onLoginSuccess(res.user);
    } catch (err: any) {
      const msg = err?.message || 'Authentication rejected. Verify your administrator credentials.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSubmitting(true);

    try {
      // 1. Check GIS flow
      const googleClientId = (firebaseConfig as any)?.oAuthClientId;
      const hasGIS = typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2 && googleClientId;

      if (hasGIS) {
        try {
          const gisSuccess = await new Promise<boolean>((resolve, reject) => {
            const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
              client_id: googleClientId,
              scope: 'email profile openid',
              error_callback: (err: any) => {
                if (err?.type === 'popup_closed' || err?.type === 'popup_failed_to_open') {
                  resolve(false);
                } else {
                  reject(err);
                }
              },
              callback: async (tokenResponse: any) => {
                if (!tokenResponse || tokenResponse.error) {
                  if (tokenResponse?.error === 'popup_closed_by_user') {
                    resolve(false);
                    return;
                  }
                  reject(new Error(tokenResponse?.error_description || tokenResponse?.error || 'Google sign-in incomplete'));
                  return;
                }

                try {
                  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                  });
                  if (!userInfoRes.ok) throw new Error('Failed to retrieve verified profile');
                  const info = await userInfoRes.json();

                  const res = await api.adminGoogleSync({
                    uid: info.sub,
                    email: info.email,
                    displayName: info.name || info.email.split('@')[0],
                  });

                  try {
                    const cred = GoogleAuthProvider.credential(null, tokenResponse.access_token);
                    await signInWithCredential(auth, cred);
                  } catch {}

                  onLoginSuccess(res.user);
                  resolve(true);
                } catch (apiErr) {
                  reject(apiErr);
                }
              },
            });
            tokenClient.requestAccessToken({ prompt: '' });
          });

          if (gisSuccess) return;
        } catch (gisErr: any) {
          console.warn('GIS admin sign-in notice, attempting popup:', gisErr);
        }
      }

      // 2. Fallback to Firebase popup
      const credential = await signInWithPopup(auth, googleProvider);
      if (!credential?.user?.email) {
        throw new Error('Google sign-in did not return a valid email address.');
      }

      const res = await api.adminGoogleSync({
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName || credential.user.email.split('@')[0],
      });

      onLoginSuccess(res.user);
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = String(err?.message || err || '').toLowerCase();
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        errMsg.includes('popup-closed-by-user')
      ) {
        return;
      }
      setError(err?.message || 'Administrator Google authentication failed. Ensure this account has admin role.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-rose-500/30 selection:text-rose-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center shadow-lg shadow-rose-900/40 border border-rose-500/30">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
        </div>

        <h2 className="text-center text-2xl font-bold tracking-tight text-white">
          Security Administration Portal
        </h2>
        <p className="mt-2 text-center text-xs text-slate-400">
          Thesis Progress Tracker • Private Authorization Boundary
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900/90 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 backdrop-blur-sm">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-300">Access Denied</p>
                <p className="text-xs text-rose-300/90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Administrator Email
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hospital.org"
                  required
                  autoComplete="email"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Administrator Password
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-sm font-semibold shadow-md shadow-rose-950/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying Authorization...
                </>
              ) : (
                <>
                  <span>Authenticate to Admin Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-slate-900 px-3 text-slate-500 font-medium">Or Verified Identity</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting || isGoogleSubmitting}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGoogleSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                Verifying Google Identity...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                <span>Sign in with Google Admin</span>
              </>
            )}
          </button>

          <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <button
              type="button"
              onClick={onNavigateHome}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
            <div className="flex items-center gap-1 text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Audit Logging Active</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 leading-relaxed px-4">
          Notice: Unauthorized access attempts are actively logged, rate-limited, and recorded with origin metadata.
          Normal researchers should access the standard study dashboard.
        </p>
      </div>
    </div>
  );
};
