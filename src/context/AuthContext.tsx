import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config.js';
import { firestoreService } from '../services/firestoreService.js';
import { api } from '../services/api.js';
import { offlineStorage } from '../services/offlineStorage.js';
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
  signInWithGoogle: () => Promise<void>;
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
    } catch (err) {
      console.error('Failed to load team capacity:', err);
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

  const signInWithGoogle = async () => {
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (!credential.user) {
        return;
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
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('popup-closed-by-user') ||
        err?.message?.includes('cancelled-popup-request')
      ) {
        // User closed or dismissed the popup window voluntarily; not an error
        return;
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
