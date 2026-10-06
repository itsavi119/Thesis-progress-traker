import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import { useAuth } from './AuthContext.js';
import type { GroupMemberRole, ResearchGroup, StudyType, SubjectTerminology, CustomFieldDefinition } from '../types/index.js';

interface GroupContextType {
  currentGroup: ResearchGroup | null;
  userGroups: ResearchGroup[];
  isLoadingGroups: boolean;
  isOwner: boolean;
  myRole: GroupMemberRole | null;
  selectGroup: (groupId: string | null) => void;
  createGroup: (params: {
    name: string;
    studyTitle: string;
    studyType?: StudyType;
    subjectTerminology?: SubjectTerminology;
    targetSampleSize: number;
    description?: string;
    institution?: string;
    organizationId?: string;
    customFields?: CustomFieldDefinition[];
  }) => Promise<ResearchGroup>;
  joinGroup: (code: string) => Promise<ResearchGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  refreshGroups: () => Promise<void>;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export const GroupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [userGroups, setUserGroups] = useState<ResearchGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<ResearchGroup | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(true);

  const refreshGroups = useCallback(async () => {
    if (!isAuthenticated) {
      setUserGroups([]);
      setCurrentGroup(null);
      setIsLoadingGroups(false);
      return;
    }

    try {
      setIsLoadingGroups(true);
      const res = await api.getUserGroups();
      setUserGroups(res.groups);

      // Restore active group or default to first group
      const savedGroupId = api.getActiveGroupId();
      if (savedGroupId && res.groups.some((g) => g.id === savedGroupId)) {
        const found = res.groups.find((g) => g.id === savedGroupId)!;
        setCurrentGroup(found);
      } else if (res.groups.length > 0) {
        // Default to first group if currentGroup is not set or invalid
        setCurrentGroup((prev) => {
          if (prev && res.groups.some((g) => g.id === prev.id)) {
            return res.groups.find((g) => g.id === prev.id)!;
          }
          api.setActiveGroupId(res.groups[0].id);
          return res.groups[0];
        });
      } else {
        setCurrentGroup(null);
        api.setActiveGroupId(null);
      }
    } catch (err) {
      console.error('Failed to load user research groups:', err);
    } finally {
      setIsLoadingGroups(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshGroups();
  }, [refreshGroups]);

  const selectGroup = useCallback(
    (groupId: string | null) => {
      if (!groupId) {
        setCurrentGroup(null);
        api.setActiveGroupId(null);
        return;
      }

      const match = userGroups.find((g) => g.id === groupId);
      if (match) {
        setCurrentGroup(match);
        api.setActiveGroupId(match.id);
      }
    },
    [userGroups]
  );

  const createGroup = async (params: {
    name: string;
    studyTitle: string;
    studyType?: StudyType;
    subjectTerminology?: SubjectTerminology;
    targetSampleSize: number;
    description?: string;
    institution?: string;
    organizationId?: string;
    customFields?: CustomFieldDefinition[];
  }): Promise<ResearchGroup> => {
    const res = await api.createGroup(params);
    setUserGroups((prev) => [...prev, res.group]);
    setCurrentGroup(res.group);
    api.setActiveGroupId(res.group.id);
    return res.group;
  };

  const joinGroup = async (code: string): Promise<ResearchGroup> => {
    const res = await api.acceptInvitation(code);
    setUserGroups((prev) => {
      const exists = prev.some((g) => g.id === res.group.id);
      return exists ? prev.map((g) => (g.id === res.group.id ? res.group : g)) : [...prev, res.group];
    });
    setCurrentGroup(res.group);
    api.setActiveGroupId(res.group.id);
    return res.group;
  };

  const deleteGroup = async (groupId: string): Promise<void> => {
    await api.deleteGroup(groupId);
    setUserGroups((prev) => prev.filter((g) => g.id !== groupId));
    if (currentGroup?.id === groupId) {
      setCurrentGroup(null);
      api.setActiveGroupId(null);
    }
  };

  const currentMember = user && currentGroup ? currentGroup.members.find((m) => m.userId === user.id) : null;
  const isOwner = currentMember?.role === 'owner' || currentGroup?.ownerId === user?.id;
  const myRole: GroupMemberRole | null = currentMember ? currentMember.role : null;

  return (
    <GroupContext.Provider
      value={{
        currentGroup,
        userGroups,
        isLoadingGroups,
        isOwner,
        myRole,
        selectGroup,
        createGroup,
        joinGroup,
        deleteGroup,
        refreshGroups,
      }}
    >
      {children}
    </GroupContext.Provider>
  );
};

export const useGroup = (): GroupContextType => {
  const context = useContext(GroupContext);
  if (!context) {
    throw new Error('useGroup must be used within a GroupProvider');
  }
  return context;
};
