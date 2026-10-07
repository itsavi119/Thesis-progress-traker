import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config.js';
import { firestoreService } from '../services/firestoreService.js';
import { api } from '../services/api.js';
import { offlineStorage } from '../services/offlineStorage.js';
import firebaseConfig from '../../firebase-applet-config.json';
import type { UserProfile } from '../types/index.js';

interface TeamCapacity {
  registeredMembers: number;
  maxMembers?: number;
  availableSeats: number;
  isFull: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  teamCapacity: TeamCapacity | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  refreshTeamCapacity: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    refreshTeamCapacity();
  }, [refreshUser, refreshTeamCapacity]);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setUser(res.user);
    await refreshTeamCapacity();
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await api.register({ email, password, displayName });
    setUser(res.user);
    await refreshTeamCapacity();
  };

  const signInWithGoogle = async (): Promise<boolean> => {
    // Strategy A: Direct Google Identity Services (GIS) flow (Works on all domains including *.ai.studio)
    const googleClientId = (firebaseConfig as any)?.oAuthClientId;
    const hasGIS = typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2 && googleClientId;

    if (hasGIS) {
      try {
        const gisSuccess = await new Promise<boolean>((resolve, reject) => {
          try {
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
                  reject(new Error(tokenResponse?.error_description || tokenResponse?.error || 'Google sign-in was not completed'));
                  return;
                }

                try {
                  // Retrieve verified profile directly from Google
                  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                  });
                  if (!userInfoRes.ok) {
                    throw new Error('Failed to retrieve user profile from Google');
                  }
                  const info = await userInfoRes.json();

                  // Synchronize server session token
                  const syncRes = await api.syncGoogleUser({
                    uid: info.sub,
                    email: info.email,
                    displayName: info.name || info.email.split('@')[0],
                  });

                  // Sync with Firestore profile non-blocking
                  try {
                    await firestoreService.syncUserProfile({
                      uid: info.sub,
                      email: info.email,
                      displayName: info.name || null,
                      photoURL: info.picture || null,
                    });
                  } catch (fsErr) {
                    console.warn('Firestore profile sync skipped or offline:', fsErr);
                  }

                  // Optional Firebase Auth credential linkage
                  try {
                    const cred = GoogleAuthProvider.credential(null, tokenResponse.access_token);
                    await signInWithCredential(auth, cred);
                  } catch {}

                  setUser(syncRes.user);
                  await refreshTeamCapacity();
                  resolve(true);
                } catch (apiErr) {
                  reject(apiErr);
                }
              },
            });

            tokenClient.requestAccessToken({ prompt: '' });
          } catch (initErr) {
            reject(initErr);
          }
        });

        if (gisSuccess) {
          return true;
        }
      } catch (gisError: any) {
        console.warn('GIS sign-in attempted, checking Firebase popup fallback:', gisError);
      }
    }

    // Strategy B: Firebase Auth popup flow
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (!credential || !credential.user) {
        return false;
      }

      // 1. Sync with Firestore users collection
      try {
        await firestoreService.syncUserProfile(credential.user);
      } catch (fsErr) {
        console.warn('Firestore profile sync skipped or offline:', fsErr);
      }

      // 2. Synchronize server session token
      const res = await api.syncGoogleUser({
        uid: credential.user.uid,
        email: credential.user.email || '',
        displayName: credential.user.displayName || credential.user.email?.split('@')[0] || 'Researcher',
      });

      setUser(res.user);
      await refreshTeamCapacity();
      return true;
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = String(err?.message || err || '').toLowerCase();
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        errCode === 'auth/user-cancelled' ||
        errMsg.includes('popup-closed-by-user') ||
        errMsg.includes('cancelled-popup-request')
      ) {
        // User closed or dismissed the popup window voluntarily; not an error
        return false;
      }
      throw err;
    }
  };

  const logout = () => {
    const uid = user?.id;
    fbSignOut(auth).catch(() => {});
    api.logout();
    if (uid) {
      offlineStorage.clearSession(uid).catch(() => {});
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        teamCapacity,
        login,
        register,
        signInWithGoogle,
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
