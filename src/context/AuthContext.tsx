import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import { offlineStorage } from '../services/offlineStorage.js';
import { triggerGoogleOAuth } from '../services/googleAuth.js';
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
  | 'AUTH_SUCCESS'
  | 'AUTH_ERROR'
  | 'AUTH_STATE_CHANGED'
  | 'PROFILE_LOAD_STARTED'
  | 'PROFILE_LOAD_SUCCESS'
  | 'PROFILE_LOAD_FAILED';

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
  isLoading: boolean;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
  isProfileLoading: boolean;
  teamCapacity: TeamCapacity | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; devResetToken?: string; message: string }>;
  resetPassword: (params: {
    email: string;
    resetToken: string;
    newPassword: string;
    confirmPassword?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  refreshTeamCapacity: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
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

  // Initialize native server session on load
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        setIsProfileLoading(true);
        const { user: profile } = await api.getMe();
        if (isMounted && profile?.id) {
          setUser(profile);
          setAuthStatus('AUTHENTICATED');
          await refreshTeamCapacity();
        } else if (isMounted) {
          setUser(null);
          setAuthStatus('UNAUTHENTICATED');
        }
      } catch {
        // Fallback for static hosts (e.g. Netlify)
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('thesis_tracker_static_user');
            if (raw) {
              const staticUser = JSON.parse(raw);
              if (staticUser?.id && isMounted) {
                setUser(staticUser);
                setAuthStatus('AUTHENTICATED');
                return;
              }
            }
          } catch {}
        }
        if (isMounted) {
          setUser(null);
          setAuthStatus('UNAUTHENTICATED');
        }
      } finally {
        if (isMounted) setIsProfileLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, [refreshTeamCapacity]);

  // Email + Password Sign-In
  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    const trimmedEmail = email.trim();
    try {
      const res = await api.login({ email: trimmedEmail, password });
      setUser(res.user);
      setAuthStatus('AUTHENTICATED');
      await refreshTeamCapacity();
    } catch (err: any) {
      throw new Error(err?.message || 'Invalid email address or password. Please verify your credentials.');
    }
  };

  // Email Registration
  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<void> => {
    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();
    try {
      const res = await api.register({ email: trimmedEmail, password, displayName: trimmedName });
      setUser(res.user);
      setAuthStatus('AUTHENTICATED');
      await refreshTeamCapacity();
    } catch (err: any) {
      throw new Error(err?.message || 'Registration failed. Please try again.');
    }
  };

  // Password Reset Dispatch
  const sendPasswordReset = async (email: string): Promise<{ success: boolean; devResetToken?: string; message: string }> => {
    if (!email || !email.trim()) {
      throw new Error('Please enter your email address.');
    }
    const trimmed = email.trim();
    try {
      return await api.forgotPassword({ email: trimmed });
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to dispatch password reset request.');
    }
  };

  // Password Reset Confirmation with Token
  const resetPassword = async (params: {
    email: string;
    resetToken: string;
    newPassword: string;
    confirmPassword?: string;
  }): Promise<void> => {
    await api.resetPassword(params);
  };

  // Google Sign-In via Google Identity Services (Zero API keys in URLs or bundles)
  const signInWithGoogle = async (): Promise<void> => {
    try {
      const userProfile = await triggerGoogleOAuth();
      setUser(userProfile);
      setAuthStatus('AUTHENTICATED');
      await refreshTeamCapacity();
    } catch (err: any) {
      const error = new Error(err?.message || 'Google sign-in failed. Please try again.');
      (error as any).code = err?.code;
      throw error;
    }
  };

  // Sign-Out
  const logout = () => {
    const uid = user?.id;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('thesis_tracker_auth_mode');
        localStorage.removeItem('thesis_tracker_static_user');
      } catch {}
    }

    api.logout();
    if (uid) {
      offlineStorage.clearSession(uid).catch(() => {});
    }

    setUser(null);
    setAuthStatus('UNAUTHENTICATED');
  };

  const isLoading = authStatus === 'INITIALIZING';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        authStatus,
        isProfileLoading,
        teamCapacity,
        login: signInWithEmail,
        register: signUpWithEmail,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        sendPasswordReset,
        resetPassword,
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
