export type CaseStatus = 'In Progress' | 'Completed' | 'Excluded';

export type UserRole = 'member' | 'admin';

export type GroupMemberRole = 'owner' | 'researcher';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_app_owner?: boolean;
  status?: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  userId: string;
  email: string;
  displayName: string;
  role: GroupMemberRole;
  joinedAt: string;
}

export interface ResearchGroup {
  id: string;
  name: string;
  studyTitle: string;
  targetSampleSize: number;
  description?: string;
  institution?: string;
  ownerId: string;
  status?: 'active' | 'archived' | 'suspended';
  members: GroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  intendedEmail?: string;
}

export interface CaseRecord {
  id: string;
  group_id: string;
  patient_id: string;
  normalized_patient_id: string;
  assigned_to: string; // references profile.id
  assigned_name?: string; // resolved display name
  assigned_email?: string;
  status: CaseStatus;
  patient_name?: string; // Optional
  diagnosis?: string; // Optional
  drug_names?: string; // Optional
  registered_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalCases: number;
  myCases: number;
  inProgress: number;
  completed: number;
  excluded: number;
  targetSampleSize: number;
  remaining: number;
  progressPercentage: number;
}

export interface TeamMemberSummary {
  profileId: string;
  displayName: string;
  email: string;
  role: GroupMemberRole;
  totalAssigned: number;
  inProgress: number;
  completed: number;
  excluded: number;
}

export interface TeamSummaryResponse {
  groupId: string;
  groupName: string;
  studyTitle: string;
  totalCases: number;
  totalMembers: number;
  maxMembers?: number;
  isFull: boolean;
  userRole: GroupMemberRole;
  members: TeamMemberSummary[];
}

export interface DuplicateCheckResult {
  exists: boolean;
  normalizedId: string;
  case?: CaseRecord;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

// --- APP OWNER & ORGANIZATION TYPES ---

export interface AppOwnerStats {
  totalUsers: number;
  totalGroups: number;
  activeGroups: number;
  totalMemberships: number;
  totalCases: number;
}

export interface AppOwnerUser {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended';
  createdAt: string;
  isAppOwner: boolean;
  groups: Array<{
    groupId: string;
    groupName: string;
    role: GroupMemberRole;
    joinedAt: string;
  }>;
}

export interface AppOwnerGroup {
  id: string;
  name: string;
  studyTitle: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  targetSampleSize: number;
  caseCount: number;
  description?: string;
  institution?: string;
  status: 'active' | 'archived' | 'suspended';
  createdAt: string;
  updatedAt: string;
  members: Array<{
    userId: string;
    displayName: string;
    email: string;
    role: GroupMemberRole;
    joinedAt: string;
  }>;
  invitationsCount: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: 'user' | 'group' | 'settings' | 'security' | 'legal';
  entityId?: string;
  entityName?: string;
  details: string;
  performedBy: string;
  performedByEmail: string;
  createdAt: string;
}

export interface AppOwnerSettings {
  authorizedAppOwners: string[];
  maintenanceMode: boolean;
  allowRegistration: boolean;
  updatedAt: string;
}

export interface LegalPolicyDoc {
  id: string;
  title: string;
  category: 'privacy' | 'terms' | 'responsibility' | 'storage' | 'deletion' | 'disclaimer';
  content: string;
  lastUpdated: string;
}
