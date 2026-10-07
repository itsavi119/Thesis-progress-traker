export type CaseStatus = 'In Progress' | 'Completed' | 'Excluded';

export type UserRole = 'member' | 'admin';

export type GroupMemberRole = 'owner' | 'researcher';

export type StudyType =
  | 'Observational'
  | 'Prospective'
  | 'Retrospective'
  | 'Interventional'
  | 'Survey'
  | 'Clinical Pharmacy'
  | 'Pharmacoeconomic'
  | 'Epidemiological'
  | 'Custom';

export type SubjectTerminology = 'Patient' | 'Participant' | 'Subject' | 'Case' | 'Record';

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

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

export interface Organization {
  id: string;
  name: string;
  description?: string;
  institution?: string;
  contactEmail?: string;
  ownerId: string;
  studiesCount?: number;
  membersCount?: number;
  createdAt: string;
  updatedAt: string;
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
  organizationId?: string;
  organizationName?: string;
  name: string;
  studyTitle: string;
  studyType?: StudyType;
  subjectTerminology?: SubjectTerminology;
  targetSampleSize: number;
  description?: string;
  institution?: string;
  ownerId: string;
  status?: 'active' | 'archived' | 'suspended';
  customFields?: CustomFieldDefinition[];
  members: GroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchFile {
  id: string;
  groupId: string;
  name: string;
  size: number;
  mimeType: string;
  category: 'protocol' | 'approval' | 'questionnaire' | 'data' | 'other';
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  fileData?: string;
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
  patient_name?: string; // Optional name / participant alias
  diagnosis?: string; // Optional clinical condition / indication / topic
  drug_names?: string; // Optional intervention / regimen / response
  custom_values?: Record<string, any>; // Flexible study-specific custom field values
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
  token?: string;
  user: UserProfile;
}

// --- APP OWNER & ORGANIZATION TYPES ---

export interface AppOwnerStats {
  totalUsers: number;
  totalOrganizations: number;
  totalGroups: number;
  activeGroups: number;
  totalMemberships: number;
  totalCases: number;
  totalFiles: number;
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
  organizationId?: string;
  organizationName?: string;
  name: string;
  studyTitle: string;
  studyType?: StudyType;
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
  entityType: 'user' | 'group' | 'organization' | 'settings' | 'security' | 'legal' | 'file';
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
