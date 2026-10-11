import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  const logout = () => {
    const uid = user?.id;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('thesis_tracker_auth_mode');
      } catch {}
    }
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
