import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../firebase/config.js';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors.js';
import { api } from '../services/api.js';
import { offlineStorage } from '../services/offlineStorage.js';
import type { UserProfile } from '../types/index.js';

interface TeamCapacity {
  registeredMembers: number;
  maxMembers?: number;
  availableSeats: number;
  isFull: boolean;
}

export type AuthStatus = 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

export type AuthLogEvent =
  | 'AUTH_STARTED'
  | 'GOOGLE_ACCOUNT_SELECTED'
  | 'AUTH_RESULT_RECEIVED'
  | 'FIREBASE_USER_CREATED'
  | 'AUTH_STATE_CHANGED'
  | 'PROFILE_LOAD_STARTED'
  | 'PROFILE_LOAD_SUCCESS'
  | 'PROFILE_LOAD_FAILED'
  | 'REDIRECT_STARTED'
  | 'REDIRECT_RESULT_RECEIVED'
  | 'AUTH_ERROR'
  | 'ROUTE_REDIRECT';

export function logAuthEvent(event: AuthLogEvent, details?: Record<string, any>) {
  const sanitized: Record<string, any> = {};
  if (details) {
    for (const [k, v] of Object.entries(details)) {
      if (/token|password|secret|credential|cookie|key/i.test(k)) continue;
      if (typeof v === 'string' && v.length > 200) continue;
      sanitized[k] = v;
    }
  }
  console.info(`[Auth][${event}]`, Object.keys(sanitized).length > 0 ? sanitized : '');
}

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
  isProfileLoading: boolean;
  teamCapacity: TeamCapacity | null;
  isFirebaseReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  refreshTeamCapacity: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('INITIALIZING');
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(false);
  const [teamCapacity, setTeamCapacity] = useState<TeamCapacity | null>(null);

  const refreshTeamCapacity = useCallback(async () => {
    try {
      const cap = await api.getTeamCapacity();
      setTeamCapacity(cap);
    } catch (err: any) {
      console.warn('Notice loading team capacity:', err?.message || err);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: profile } = await api.getMe();
      setUser(profile);
    } catch {
      setUser((current) => current);
    }
  }, []);

  // Helper to build immediate authenticated profile from Firebase user
  const buildImmediateProfile = (fbUser: FirebaseUser, provider = 'google'): UserProfile => ({
    id: fbUser.uid,
    email: fbUser.email || '',
    display_name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Researcher',
    role: 'member',
    status: 'active',
    photo_url: fbUser.photoURL || null,
    auth_provider: provider.includes('google') ? 'google' : 'password',
    created_at: fbUser.metadata.creationTime || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Centralized Firebase Authentication Session Listener with Redirect Resolution
  useEffect(() => {
    let isMounted = true;
    let authUnsubscribe: (() => void) | null = null;

    const initializeAuth = async () => {
      // 1. Process any returning OAuth redirect result FIRST
      const isRedirectInProgress =
        typeof window !== 'undefined' &&
        sessionStorage.getItem('thesis_tracker_auth_redirect_in_progress') === 'true';

      if (isFirebaseConfigured) {
        try {
          const cred = await getRedirectResult(auth);
          logAuthEvent('REDIRECT_RESULT_RECEIVED', { hasResult: !!cred?.user });

          if (isRedirectInProgress && typeof window !== 'undefined') {
            sessionStorage.removeItem('thesis_tracker_auth_redirect_in_progress');
          }

          if (isMounted && cred && cred.user) {
            logAuthEvent('GOOGLE_ACCOUNT_SELECTED', { uid: cred.user.uid, email: cred.user.email });
            logAuthEvent('AUTH_RESULT_RECEIVED', { uid: cred.user.uid });

            // Establish authenticated state immediately
            setFirebaseUser(cred.user);
            setAuthStatus('AUTHENTICATED');
            const fallbackProfile = buildImmediateProfile(cred.user, 'google');
            setUser(fallbackProfile);

            // Synchronize with database in background
            try {
              logAuthEvent('PROFILE_LOAD_STARTED', { uid: cred.user.uid });
              setIsProfileLoading(true);
              const idToken = await cred.user.getIdToken();
              const res = await api.syncFirebaseUser({
                uid: cred.user.uid,
                email: cred.user.email || '',
                displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'Researcher',
                photoUrl: cred.user.photoURL || null,
                idToken,
                provider: 'google',
              });
              if (isMounted) {
                setUser(res.user);
                logAuthEvent('PROFILE_LOAD_SUCCESS', { uid: res.user.id });
                await refreshTeamCapacity();
              }
            } catch (syncErr: any) {
              logAuthEvent('PROFILE_LOAD_FAILED', { error: syncErr?.message });
            } finally {
              if (isMounted) setIsProfileLoading(false);
            }
          }
        } catch (redirectErr: any) {
          logAuthEvent('AUTH_ERROR', { stage: 'getRedirectResult', code: redirectErr?.code });
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('thesis_tracker_auth_redirect_in_progress');
          }
        }
      }

      // 2. Register authoritative onAuthStateChanged listener
      authUnsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (!isMounted) return;

        if (fbUser) {
          logAuthEvent('AUTH_STATE_CHANGED', { uid: fbUser.uid, email: fbUser.email });
          setFirebaseUser(fbUser);
          setAuthStatus('AUTHENTICATED');

          const providerId = fbUser.providerData?.[0]?.providerId || 'google';
          const immediateProfile = buildImmediateProfile(fbUser, providerId);
          setUser((current) => current || immediateProfile);

          // Synchronize backend profile in background without blocking authenticated status
          try {
            logAuthEvent('PROFILE_LOAD_STARTED', { uid: fbUser.uid });
            setIsProfileLoading(true);
            const idToken = await fbUser.getIdToken();
            const syncRes = await api.syncFirebaseUser({
              uid: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Researcher',
              photoUrl: fbUser.photoURL || null,
              idToken,
              provider: providerId.includes('google') ? 'google' : 'password',
            });

            if (isMounted) {
              setUser(syncRes.user);
              logAuthEvent('PROFILE_LOAD_SUCCESS', { uid: syncRes.user.id });
              await refreshTeamCapacity();
            }
          } catch (syncErr: any) {
            logAuthEvent('PROFILE_LOAD_FAILED', { error: syncErr?.message });
            // Never revoke authenticated state if backend sync has transient delay
            if (isMounted) {
              setUser((current) => current || immediateProfile);
            }
          } finally {
            if (isMounted) setIsProfileLoading(false);
          }
        } else {
          // Firebase reports unauthenticated; check if a server session cookie is present
          setFirebaseUser(null);
          try {
            const { user: profile } = await api.getMe();
            if (isMounted && profile?.id) {
              setUser(profile);
              setAuthStatus('AUTHENTICATED');
              logAuthEvent('AUTH_STATE_CHANGED', { restoredViaCookie: true, uid: profile.id });
            } else if (isMounted) {
              setUser(null);
              setAuthStatus('UNAUTHENTICATED');
            }
          } catch {
            if (isMounted) {
              setUser(null);
              setAuthStatus('UNAUTHENTICATED');
            }
          }
        }
      });
    };

    initializeAuth();

    return () => {
      isMounted = false;
      if (authUnsubscribe) authUnsubscribe();
    };
  }, [refreshTeamCapacity]);

  // Google Sign-In via Official Firebase Google Provider with Popup + Redirect resilience
  const signInWithGoogle = async (): Promise<boolean> => {
    logAuthEvent('AUTH_STARTED', { method: 'google' });

    if (!isFirebaseConfigured) {
      const err = new Error(
        'Firebase Authentication is not yet configured. Please set your VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID environment variables.'
      );
      logAuthEvent('AUTH_ERROR', { message: err.message });
      throw err;
    }

    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // On mobile devices, browsers restrict cross-window postMessage popup channels, so use redirect flow directly
    if (isMobile) {
      try {
        logAuthEvent('REDIRECT_STARTED', { reason: 'mobile-browser' });
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('thesis_tracker_auth_redirect_in_progress', 'true');
        }
        await signInWithRedirect(auth, googleProvider);
        return true;
      } catch (redirErr: any) {
        logAuthEvent('AUTH_ERROR', { code: (redirErr as any)?.code, stage: 'mobile-redirect' });
        throw new Error(getFirebaseErrorMessage(redirErr));
      }
    }

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!cred || !cred.user) {
        return false;
      }

      logAuthEvent('GOOGLE_ACCOUNT_SELECTED', { uid: cred.user.uid, email: cred.user.email });
      logAuthEvent('AUTH_RESULT_RECEIVED', { uid: cred.user.uid });

      // Establish authenticated state immediately so UI opens without delay
      setFirebaseUser(cred.user);
      setAuthStatus('AUTHENTICATED');
      const immediateProfile = buildImmediateProfile(cred.user, 'google');
      setUser(immediateProfile);

      // Background profile sync
      try {
        logAuthEvent('PROFILE_LOAD_STARTED', { uid: cred.user.uid });
        setIsProfileLoading(true);
        const idToken = await cred.user.getIdToken();
        const res = await api.syncFirebaseUser({
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'Researcher',
          photoUrl: cred.user.photoURL || null,
          idToken,
          provider: 'google',
        });
        setUser(res.user);
        logAuthEvent('PROFILE_LOAD_SUCCESS', { uid: res.user.id });
        await refreshTeamCapacity();
      } catch (syncErr: any) {
        logAuthEvent('PROFILE_LOAD_FAILED', { error: syncErr?.message });
      } finally {
        setIsProfileLoading(false);
      }

      return true;
    } catch (err: any) {
      const code = err?.code || '';
      logAuthEvent('AUTH_ERROR', { code, message: err?.message });

      // User closed or canceled the popup window
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/user-cancelled'
      ) {
        return false;
      }

      // If popup is blocked or fails due to cross-origin/cookie restrictions, fall back to redirect flow
      if (code === 'auth/popup-blocked' || code === 'auth/internal-error') {
        try {
          logAuthEvent('REDIRECT_STARTED', { reason: code });
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('thesis_tracker_auth_redirect_in_progress', 'true');
          }
          await signInWithRedirect(auth, googleProvider);
          return true;
        } catch (redirErr: any) {
          logAuthEvent('AUTH_ERROR', { code: (redirErr as any)?.code, stage: 'redirect-fallback' });
          throw new Error(getFirebaseErrorMessage(redirErr));
        }
      }

      throw new Error(getFirebaseErrorMessage(err));
    }
  };

  // Email + Password Sign-In with resilient dual-layer authentication
  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    const trimmedEmail = email.trim();

    if (isFirebaseConfigured) {
      try {
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        const idToken = await cred.user.getIdToken();
        const res = await api.syncFirebaseUser({
          uid: cred.user.uid,
          email: cred.user.email || trimmedEmail,
          displayName: cred.user.displayName || trimmedEmail.split('@')[0],
          photoUrl: cred.user.photoURL || null,
          idToken,
          provider: 'password',
        });

        setUser(res.user);
        setFirebaseUser(cred.user);
        await refreshTeamCapacity();
        return;
      } catch (err: any) {
        const errCode = (err?.code || '').toLowerCase();
        // If account is not in Firebase yet, or Firebase email/password provider returned an internal or config error,
        // seamlessly attempt backend database verification for existing research accounts
        if (
          errCode === 'auth/user-not-found' ||
          errCode === 'auth/invalid-credential' ||
          errCode === 'auth/invalid-login-credentials' ||
          errCode === 'auth/internal-error' ||
          errCode === 'auth/operation-not-allowed' ||
          errCode === 'auth/configuration-not-found'
        ) {
          try {
            const res = await api.login({ email: trimmedEmail, password });
            setUser(res.user);
            await refreshTeamCapacity();
            return;
          } catch (backendErr: any) {
            // Both Firebase and backend login failed
            throw new Error('Invalid email address or password. Please verify your credentials and try again.');
          }
        }

        throw new Error(getFirebaseErrorMessage(err));
      }
    }

    // Direct backend authentication fallback
    try {
      const res = await api.login({ email: trimmedEmail, password });
      setUser(res.user);
      await refreshTeamCapacity();
    } catch (err: any) {
      throw new Error(err?.message || 'Invalid email address or password. Please verify your credentials.');
    }
  };

  // Email + Password Sign-Up with resilient dual-layer account registration
  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<void> => {
    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();

    if (isFirebaseConfigured) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        if (trimmedName && cred.user) {
          try {
            await updateProfile(cred.user, { displayName: trimmedName });
          } catch (profErr) {
            console.warn('Firebase profile displayName update notice:', profErr);
          }
        }

        const idToken = await cred.user.getIdToken();
        const res = await api.syncFirebaseUser({
          uid: cred.user.uid,
          email: cred.user.email || trimmedEmail,
          displayName: trimmedName,
          photoUrl: cred.user.photoURL || null,
          idToken,
          provider: 'password',
        });

        setUser(res.user);
        setFirebaseUser(cred.user);
        await refreshTeamCapacity();
        return;
      } catch (err: any) {
        const errCode = (err?.code || '').toLowerCase();
        // If Firebase Auth has email/password disabled in console (operation-not-allowed, internal-error),
        // fallback to backend registration so the user is never blocked from creating their workspace
        if (
          errCode === 'auth/operation-not-allowed' ||
          errCode === 'auth/internal-error' ||
          errCode === 'auth/configuration-not-found'
        ) {
          try {
            const res = await api.register({ email: trimmedEmail, password, displayName: trimmedName });
            setUser(res.user);
            await refreshTeamCapacity();
            return;
          } catch (backendErr: any) {
            throw new Error(backendErr?.message || 'Registration could not be completed. Please verify your details.');
          }
        }

        throw new Error(getFirebaseErrorMessage(err));
      }
    }

    // Direct backend registration fallback
    try {
      const res = await api.register({ email: trimmedEmail, password, displayName: trimmedName });
      setUser(res.user);
      await refreshTeamCapacity();
    } catch (err: any) {
      throw new Error(err?.message || 'Registration failed. Please try again.');
    }
  };

  // Password Reset via Firebase Authentication
  const sendPasswordReset = async (email: string): Promise<void> => {
    if (!email || !email.trim()) {
      throw new Error('Please enter your email address.');
    }

    if (isFirebaseConfigured) {
      try {
        await sendPasswordResetEmail(auth, email.trim());
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          // Privacy protection: do not reveal non-existence
          return;
        }
        throw new Error(getFirebaseErrorMessage(err));
      }
    }

    // Also trigger server-side token reset dispatch
    try {
      await api.forgotPassword({ email: email.trim() });
    } catch {}
  };

  // Sign-Out
  const logout = () => {
    const uid = user?.id;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('thesis_tracker_auth_mode');
      } catch {}
    }

    if (isFirebaseConfigured) {
      fbSignOut(auth).catch((err) => console.warn('Firebase signout notice:', err));
    }

    api.logout();
    if (uid) {
      offlineStorage.clearSession(uid).catch(() => {});
    }

    setUser(null);
    setFirebaseUser(null);
  };

  const isLoading = authStatus === 'INITIALIZING';

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isLoading,
        isAuthenticated: !!user,
        authStatus,
        isProfileLoading,
        teamCapacity,
        isFirebaseReady: isFirebaseConfigured,
        login: signInWithEmail,
        register: signUpWithEmail,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        logout,
        refreshUser,
        refreshTeamCapacity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
