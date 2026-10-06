import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizePatientId, validatePatientId } from '../utils/normalizePatientId.js';
import type {
  AppOwnerGroup,
  AppOwnerSettings,
  AppOwnerStats,
  AppOwnerUser,
  AuditLogEntry,
  CaseRecord,
  CaseStatus,
  DashboardStats,
  GroupInvitation,
  GroupMember,
  GroupMemberRole,
  LegalPolicyDoc,
  ResearchGroup,
  TeamMemberSummary,
  TeamSummaryResponse,
  UserProfile,
} from '../types/index.js';

export const PRIMARY_APP_OWNER = 'avishah.as119@gmail.com';

interface StoredProfile {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: 'member' | 'admin';
  status?: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
}

interface StoredGroupMember {
  user_id: string;
  email: string;
  display_name: string;
  role: GroupMemberRole;
  joined_at: string;
}

interface StoredGroup {
  id: string;
  name: string;
  study_title: string;
  target_sample_size: number;
  description?: string;
  institution?: string;
  owner_id: string;
  status?: 'active' | 'archived' | 'suspended';
  members: StoredGroupMember[];
  created_at: string;
  updated_at: string;
}

interface StoredInvitation {
  id: string;
  group_id: string;
  group_name: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  intended_email?: string;
}

interface StoredCase {
  id: string;
  group_id: string;
  patient_id: string;
  normalized_patient_id: string;
  assigned_to: string;
  status: CaseStatus;
  patient_name?: string;
  diagnosis?: string;
  drug_names?: string;
  registered_at: string;
  updated_at: string;
}

interface StoredAuditLog {
  id: string;
  action: string;
  entity_type: 'user' | 'group' | 'settings' | 'security' | 'legal';
  entity_id?: string;
  entity_name?: string;
  details: string;
  performed_by: string;
  performed_by_email: string;
  created_at: string;
}

interface StoredAppSettings {
  authorized_app_owners: string[];
  maintenance_mode: boolean;
  allow_registration: boolean;
  updated_at: string;
}

interface StoredLegalDoc {
  id: string;
  title: string;
  category: 'privacy' | 'terms' | 'responsibility' | 'storage' | 'deletion' | 'disclaimer';
  content: string;
  last_updated: string;
}

interface DatabaseSchema {
  version: number;
  profiles: StoredProfile[];
  groups: StoredGroup[];
  invitations: StoredInvitation[];
  cases: StoredCase[];
  audit_logs?: StoredAuditLog[];
  app_settings?: StoredAppSettings;
  legal_docs?: StoredLegalDoc[];
}

export class DuplicateCaseError extends Error {
  public existingCase: CaseRecord;
  constructor(message: string, existingCase: CaseRecord) {
    super(message);
    this.name = 'DuplicateCaseError';
    this.existingCase = existingCase;
  }
}

export class UnauthorizedCaseActionError extends Error {
  constructor(message = 'Unauthorized: You can only modify cases assigned to you.') {
    super(message);
    this.name = 'UnauthorizedCaseActionError';
  }
}

export class UnauthorizedGroupActionError extends Error {
  constructor(message = 'Unauthorized: You do not have permission for this research group.') {
    super(message);
    this.name = 'UnauthorizedGroupActionError';
  }
}

export class GroupNotFoundError extends Error {
  constructor(message = 'Research group not found.') {
    super(message);
    this.name = 'GroupNotFoundError';
  }
}

export class AccountSuspendedError extends Error {
  constructor(message = 'Your account has been deactivated. Please contact support.') {
    super(message);
    this.name = 'AccountSuspendedError';
  }
}

class AsyncMutex {
  private queue = Promise.resolve();

  async runExclusive<T>(callback: () => Promise<T> | T): Promise<T> {
    const result = this.queue.then(() => callback());
    this.queue = result.then(() => {}, () => {});
    return result;
  }
}

const DEFAULT_LEGAL_DOCS: StoredLegalDoc[] = [
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    category: 'privacy',
    last_updated: '2026-10-05T00:00:00.000Z',
    content: `Thesis Case Tracker ("Platform") is committed to protecting the privacy of healthcare researchers and medical data. This Privacy Policy outlines our data handling and collection practices.

1. Information We Collect
We collect institutional contact information (name, Google account email) and study metadata (study titles, target sample sizes, group affiliations). Patient identifiers entered for duplicate-checking are processed within isolated research group scopes.

2. Group-Scoped Data Isolation
Patient records and case details entered by researchers are accessible strictly to authorized members of that specific research group. The application-level App Owner manages user accounts and group administration without browsing confidential clinical records.

3. External Services & Cloud Security
Data is processed using secure cloud infrastructure. Patient-identifiable information is never shared with third-party advertising networks or unapproved external artificial intelligence providers.`,
  },
  {
    id: 'terms-of-use',
    title: 'Terms of Use',
    category: 'terms',
    last_updated: '2026-10-05T00:00:00.000Z',
    content: `By accessing or using Thesis Case Tracker, you agree to comply with these Terms of Use.

1. Authorized Institutional Use
This platform is intended exclusively for authorized academic, clinical, and hospital thesis researchers. You must maintain the confidentiality of your authentication credentials.

2. Research Compliance & Ethical Approvals
Researchers and their respective healthcare institutions remain solely responsible for obtaining all mandatory Institutional Review Board (IRB) or Independent Ethics Committee (IEC) approvals prior to entering patient data.

3. Acceptable Use
Users shall not attempt unauthorized access to other research groups, interfere with system availability, or manipulate identity parameters.`,
  },
  {
    id: 'research-responsibility',
    title: 'Research Data Responsibility Notice',
    category: 'responsibility',
    last_updated: '2026-10-05T00:00:00.000Z',
    content: `Notice Regarding Research Data Integrity and Institutional Responsibility:

1. De-Identification Recommendations
Researchers are strongly advised to utilize pseudo-anonymized hospital study numbers or masked Medical Record Numbers rather than direct patient identifiers wherever feasible.

2. Institutional Governance
The Platform provides coordination tools for case assignment and duplicate prevention. Ultimate responsibility for clinical research accuracy, regulatory adherence, and protocol execution resides with the Principal Investigator and Study Team.`,
  },
  {
    id: 'storage-drive-notice',
    title: 'Google Drive Data & Permissions Notice',
    category: 'storage',
    last_updated: '2026-10-05T00:00:00.000Z',
    content: `Google Drive Integration & Storage Permissions:

1. Application-Specific Folders
If Google Drive synchronization is enabled, the platform utilizes an application-specific folder structure (e.g., Thesis Case Tracker / Study Name / Exports) under your direct control.

2. Minimal Scopes
The platform does not request or access unrelated files or personal documents stored in your Google Drive account. You may disconnect cloud storage integration at any time through account settings.`,
  },
  {
    id: 'account-deletion-info',
    title: 'Account & Data Deletion Information',
    category: 'deletion',
    last_updated: '2026-10-05T00:00:00.000Z',
    content: `Account and Data Removal Procedures:

1. Case Removal
Researchers and Group Owners may delete incorrectly entered patient IDs directly within their research group. Deletion permanently removes the record from active tracking and duplicate prevention indexes.

2. Group Deletion
Group Owners or the App Owner may delete a research group with formal confirmation, purging associated cases and invitations.

3. Account Deactivation
To request complete profile erasure, contact your institutional research administrator or the application operator.`,
  },
  {
    id: 'disclaimer',
    title: 'Clinical & Legal Disclaimer',
    category: 'disclaimer',
    last_updated: '2026-10-05T00:00:00.000Z',
    content: `Legal and Clinical Disclaimer:

Thesis Case Tracker is an academic research workflow coordination platform. It is not a diagnostic device, electronic health record (EHR) replacement, or medical decision support tool.

No claims of universal regulatory certifications (such as HIPAA, GDPR, or DPDP) are made absent specific formal institutional compliance agreements. Researchers must comply with local institutional and national laws governing human subject research.`,
  },
];

export class RelationalDatabase {
  private filePath: string;
  private mutex = new AsyncMutex();
  private data: DatabaseSchema;
  private changeListeners: Array<(event: string, groupId: string, payload: any) => void> = [];

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, 'thesis_tracker_db.json');

    this.data = {
      version: 2,
      profiles: [],
      groups: [],
      invitations: [],
      cases: [],
      audit_logs: [],
      app_settings: {
        authorized_app_owners: [PRIMARY_APP_OWNER],
        maintenance_mode: false,
        allow_registration: true,
        updated_at: new Date().toISOString(),
      },
      legal_docs: DEFAULT_LEGAL_DOCS,
    };

    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          version: parsed.version || 2,
          profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
          invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
          cases: Array.isArray(parsed.cases) ? parsed.cases : [],
          audit_logs: Array.isArray(parsed.audit_logs) ? parsed.audit_logs : [],
          app_settings: parsed.app_settings || {
            authorized_app_owners: [PRIMARY_APP_OWNER],
            maintenance_mode: false,
            allow_registration: true,
            updated_at: new Date().toISOString(),
          },
          legal_docs: Array.isArray(parsed.legal_docs) && parsed.legal_docs.length > 0
            ? parsed.legal_docs
            : DEFAULT_LEGAL_DOCS,
        };

        // Ensure PRIMARY_APP_OWNER is always in authorized_app_owners
        if (!this.data.app_settings!.authorized_app_owners.includes(PRIMARY_APP_OWNER)) {
          this.data.app_settings!.authorized_app_owners.unshift(PRIMARY_APP_OWNER);
        }

        // Automatic migration if initial data exists
        if (this.data.groups.length === 0 && (this.data.profiles.length > 0 || this.data.cases.length > 0)) {
          const ownerProfile = this.data.profiles[0];
          const initialGroupId = 'ivos-research-group';
          const now = new Date().toISOString();

          const initialMembers: StoredGroupMember[] = this.data.profiles.map((p, idx) => ({
            user_id: p.id,
            email: p.email,
            display_name: p.display_name,
            role: idx === 0 ? 'owner' : 'researcher',
            joined_at: p.created_at || now,
          }));

          const migratedGroup: StoredGroup = {
            id: initialGroupId,
            name: 'IVOS Research Team',
            study_title: 'Assessing the Feasibility and Pharmacoeconomic Impact of Early Intravenous-to-Oral Switch Therapy',
            target_sample_size: 220,
            description: 'Prospective hospital thesis study evaluating criteria and outcomes of early IVOS therapy.',
            institution: 'Hospital Department of Clinical Pharmacy',
            owner_id: ownerProfile ? ownerProfile.id : 'default-owner',
            status: 'active',
            members: initialMembers,
            created_at: now,
            updated_at: now,
          };

          this.data.groups.push(migratedGroup);

          for (const c of this.data.cases) {
            if (!c.group_id) {
              c.group_id = initialGroupId;
            }
          }

          this.saveToDiskSync();
        }
      } catch (err) {
        console.error('Failed to parse database file, initializing fresh state:', err);
      }
    } else {
      this.saveToDiskSync();
    }
  }

  private saveToDiskSync(): void {
    const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }

  private async persist(): Promise<void> {
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8');
    await fs.promises.rename(tmpPath, this.filePath);
  }

  public subscribe(listener: (event: string, groupId: string, payload: any) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private broadcast(event: string, groupId: string, payload: any) {
    for (const listener of this.changeListeners) {
      try {
        listener(event, groupId, payload);
      } catch (err) {
        console.error('Error broadcasting change event:', err);
      }
    }
  }

  // --- APP OWNER AUTHORIZATION ---

  public isAppOwner(email: string | null | undefined): boolean {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    if (normalized === PRIMARY_APP_OWNER.toLowerCase()) return true;
    const authorized = this.data.app_settings?.authorized_app_owners || [PRIMARY_APP_OWNER];
    return authorized.map((e) => e.toLowerCase()).includes(normalized);
  }

  private resolveUserProfile(p: StoredProfile): UserProfile {
    const { password_hash, ...safeProfile } = p;
    return {
      ...safeProfile,
      status: p.status || 'active',
      is_app_owner: this.isAppOwner(p.email),
    };
  }

  private resolveCaseRecord(c: StoredCase): CaseRecord {
    const profile = this.data.profiles.find((p) => p.id === c.assigned_to);
    return {
      id: c.id,
      group_id: c.group_id,
      patient_id: c.patient_id,
      normalized_patient_id: c.normalized_patient_id,
      assigned_to: c.assigned_to,
      status: c.status,
      patient_name: c.patient_name,
      diagnosis: c.diagnosis,
      drug_names: c.drug_names,
      registered_at: c.registered_at,
      updated_at: c.updated_at,
      assigned_name: profile ? profile.display_name : 'Unknown Researcher',
      assigned_email: profile ? profile.email : '',
    };
  }

  private mapGroupToPublic(g: StoredGroup): ResearchGroup {
    return {
      id: g.id,
      name: g.name,
      studyTitle: g.study_title,
      targetSampleSize: g.target_sample_size,
      description: g.description,
      institution: g.institution,
      ownerId: g.owner_id,
      status: g.status || 'active',
      members: g.members.map((m) => ({
        userId: m.user_id,
        email: m.email,
        displayName: m.display_name,
        role: m.role,
        joinedAt: m.joined_at,
      })),
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    };
  }

  // --- AUDIT LOGS ---

  public async recordAuditLog(entry: {
    action: string;
    entityType: 'user' | 'group' | 'settings' | 'security' | 'legal';
    entityId?: string;
    entityName?: string;
    details: string;
    performedBy: string;
    performedByEmail: string;
  }): Promise<AuditLogEntry> {
    const newLog: StoredAuditLog = {
      id: crypto.randomUUID(),
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_name: entry.entityName,
      details: entry.details,
      performed_by: entry.performedBy,
      performed_by_email: entry.performedByEmail,
      created_at: new Date().toISOString(),
    };

    if (!this.data.audit_logs) this.data.audit_logs = [];
    this.data.audit_logs.unshift(newLog);

    // Keep up to 2000 log entries
    if (this.data.audit_logs.length > 2000) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 2000);
    }

    await this.persist();

    return {
      id: newLog.id,
      action: newLog.action,
      entityType: newLog.entity_type,
      entityId: newLog.entity_id,
      entityName: newLog.entity_name,
      details: newLog.details,
      performedBy: newLog.performed_by,
      performedByEmail: newLog.performed_by_email,
      createdAt: newLog.created_at,
    };
  }

  public getAuditLogs(options?: {
    limit?: number;
    action?: string;
    entityType?: string;
  }): AuditLogEntry[] {
    let logs = this.data.audit_logs || [];
    if (options?.action) {
      logs = logs.filter((l) => l.action.toLowerCase().includes(options.action!.toLowerCase()));
    }
    if (options?.entityType) {
      logs = logs.filter((l) => l.entity_type === options.entityType);
    }

    const limit = options?.limit || 100;
    return logs.slice(0, limit).map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entity_type,
      entityId: l.entity_id,
      entityName: l.entity_name,
      details: l.details,
      performedBy: l.performed_by,
      performedByEmail: l.performed_by_email,
      createdAt: l.created_at,
    }));
  }

  // --- AUTHENTICATION & PROFILES ---

  public async getProfileCount(): Promise<number> {
    return this.data.profiles.length;
  }

  public async findProfileByEmail(email: string): Promise<StoredProfile | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const profile = this.data.profiles.find((p) => p.email.toLowerCase() === normalizedEmail);
    return profile || null;
  }

  public async findProfileById(id: string): Promise<UserProfile | null> {
    const profile = this.data.profiles.find((p) => p.id === id);
    if (!profile) return null;
    return this.resolveUserProfile(profile);
  }

  public async registerUser(params: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<UserProfile> {
    return this.mutex.runExclusive(async () => {
      if (this.data.app_settings && !this.data.app_settings.allow_registration) {
        throw new Error('New researcher registration is temporarily paused by the organization administrator.');
      }

      const email = params.email.trim().toLowerCase();
      const displayName = params.displayName.trim();

      if (!email || !params.password || !displayName) {
        throw new Error('Email, password, and display name are required.');
      }

      if (params.password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const existing = this.data.profiles.find((p) => p.email.toLowerCase() === email);
      if (existing) {
        throw new Error('An account with this email address is already registered.');
      }

      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(params.password, salt);
      const now = new Date().toISOString();

      const newProfile: StoredProfile = {
        id: crypto.randomUUID(),
        email,
        password_hash,
        display_name: displayName,
        role: 'member',
        status: 'active',
        created_at: now,
        updated_at: now,
      };

      this.data.profiles.push(newProfile);
      await this.persist();

      return this.resolveUserProfile(newProfile);
    });
  }

  public async syncGoogleProfile(params: {
    uid: string;
    email: string;
    displayName: string;
  }): Promise<UserProfile> {
    return this.mutex.runExclusive(async () => {
      const email = params.email.trim().toLowerCase();
      let profile = this.data.profiles.find((p) => p.id === params.uid || p.email.toLowerCase() === email);

      if (profile) {
        if (profile.status === 'suspended') {
          throw new AccountSuspendedError();
        }
        profile.display_name = params.displayName || profile.display_name;
        profile.updated_at = new Date().toISOString();
        await this.persist();
        return this.resolveUserProfile(profile);
      }

      if (this.data.app_settings && !this.data.app_settings.allow_registration) {
        throw new Error('New researcher registration is temporarily paused by the organization administrator.');
      }

      const now = new Date().toISOString();
      const newProfile: StoredProfile = {
        id: params.uid,
        email,
        password_hash: '',
        display_name: params.displayName || email.split('@')[0],
        role: 'member',
        status: 'active',
        created_at: now,
        updated_at: now,
      };

      this.data.profiles.push(newProfile);
      await this.persist();

      return this.resolveUserProfile(newProfile);
    });
  }

  public async verifyUserCredentials(params: {
    email: string;
    password: string;
  }): Promise<UserProfile | null> {
    const email = params.email.trim().toLowerCase();
    const profile = this.data.profiles.find((p) => p.email.toLowerCase() === email);
    if (!profile) return null;

    if (profile.status === 'suspended') {
      throw new AccountSuspendedError();
    }

    const matches = await bcrypt.compare(params.password, profile.password_hash);
    if (!matches) return null;

    return this.resolveUserProfile(profile);
  }

  // --- RESEARCH GROUPS MANAGEMENT ---

  public async getUserGroups(userId: string): Promise<ResearchGroup[]> {
    const userGroups = this.data.groups.filter((g) =>
      (g.status || 'active') !== 'archived' &&
      g.members.some((m) => m.user_id === userId)
    );
    return userGroups.map((g) => this.mapGroupToPublic(g));
  }

  public async getGroupById(groupId: string, userId: string): Promise<ResearchGroup> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (!group) {
      throw new GroupNotFoundError();
    }
    const isMember = group.members.some((m) => m.user_id === userId);
    if (!isMember) {
      throw new UnauthorizedGroupActionError('Access denied: You are not a member of this research group.');
    }
    return this.mapGroupToPublic(group);
  }

  public async createGroup(
    userId: string,
    params: {
      name: string;
      studyTitle: string;
      targetSampleSize: number;
      description?: string;
      institution?: string;
    }
  ): Promise<ResearchGroup> {
    return this.mutex.runExclusive(async () => {
      const user = this.data.profiles.find((p) => p.id === userId);
      if (!user) {
        throw new Error('User profile not found.');
      }
      if (user.status === 'suspended') {
        throw new AccountSuspendedError();
      }

      const name = params.name.trim();
      const studyTitle = params.studyTitle.trim();
      const targetSampleSize = Number(params.targetSampleSize);

      if (!name) throw new Error('Group name is required.');
      if (!studyTitle) throw new Error('Study / Thesis title is required.');
      if (isNaN(targetSampleSize) || targetSampleSize <= 0) {
        throw new Error('Target sample size must be a positive number.');
      }

      const now = new Date().toISOString();
      const newGroupId = crypto.randomUUID();

      const ownerMember: StoredGroupMember = {
        user_id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: 'owner',
        joined_at: now,
      };

      const newGroup: StoredGroup = {
        id: newGroupId,
        name,
        study_title: studyTitle,
        target_sample_size: targetSampleSize,
        description: params.description?.trim() || undefined,
        institution: params.institution?.trim() || undefined,
        owner_id: user.id,
        status: 'active',
        members: [ownerMember],
        created_at: now,
        updated_at: now,
      };

      this.data.groups.push(newGroup);
      await this.persist();

      return this.mapGroupToPublic(newGroup);
    });
  }

  public async updateGroupSettings(
    groupId: string,
    userId: string,
    updates: {
      name?: string;
      studyTitle?: string;
      targetSampleSize?: number;
      description?: string;
      institution?: string;
    }
  ): Promise<ResearchGroup> {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();

      const member = group.members.find((m) => m.user_id === userId);
      if (!member || member.role !== 'owner') {
        throw new UnauthorizedGroupActionError('Only the research group owner can edit group settings.');
      }

      if (updates.name !== undefined) {
        const trimmed = updates.name.trim();
        if (!trimmed) throw new Error('Group name cannot be empty.');
        group.name = trimmed;
      }
      if (updates.studyTitle !== undefined) {
        const trimmed = updates.studyTitle.trim();
        if (!trimmed) throw new Error('Study title cannot be empty.');
        group.study_title = trimmed;
      }
      if (updates.targetSampleSize !== undefined) {
        const size = Number(updates.targetSampleSize);
        if (isNaN(size) || size <= 0) throw new Error('Target sample size must be positive.');
        group.target_sample_size = size;
      }
      if (updates.description !== undefined) {
        group.description = updates.description.trim() || undefined;
      }
      if (updates.institution !== undefined) {
        group.institution = updates.institution.trim() || undefined;
      }

      group.updated_at = new Date().toISOString();
      await this.persist();

      const resolved = this.mapGroupToPublic(group);
      this.broadcast('group_updated', groupId, resolved);
      return resolved;
    });
  }

  // --- GROUP INVITATIONS (NO ARBITRARY MEMBER LIMITS) ---

  public async createInvitation(
    groupId: string,
    userId: string,
    intendedEmail?: string
  ): Promise<GroupInvitation> {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();

      const member = group.members.find((m) => m.user_id === userId);
      if (!member || member.role !== 'owner') {
        throw new UnauthorizedGroupActionError('Only the group owner can invite new researchers.');
      }

      const prefix = group.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'GRP';
      const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${prefix}-${randomSuffix}`;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const invite: StoredInvitation = {
        id: crypto.randomUUID(),
        group_id: groupId,
        group_name: group.name,
        code,
        created_by: userId,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        status: 'pending',
        intended_email: intendedEmail?.trim().toLowerCase() || undefined,
      };

      this.data.invitations.push(invite);
      await this.persist();

      return {
        id: invite.id,
        groupId: invite.group_id,
        groupName: invite.group_name,
        code: invite.code,
        createdBy: invite.created_by,
        createdAt: invite.created_at,
        expiresAt: invite.expires_at,
        status: invite.status,
        intendedEmail: invite.intended_email,
      };
    });
  }

  public async getInvitationDetails(code: string): Promise<{
    invitation: GroupInvitation;
    group: {
      id: string;
      name: string;
      studyTitle: string;
      targetSampleSize: number;
      memberCount: number;
      isFull: boolean;
    };
  }> {
    const normalizedCode = code.trim().toUpperCase();
    const invite = this.data.invitations.find((i) => i.code.toUpperCase() === normalizedCode);
    if (!invite) {
      throw new Error('Invalid invitation code.');
    }

    if (invite.status === 'pending' && new Date(invite.expires_at) < new Date()) {
      invite.status = 'expired';
      await this.persist();
    }

    const group = this.data.groups.find((g) => g.id === invite.group_id);
    if (!group) {
      throw new GroupNotFoundError('The research group associated with this invite no longer exists.');
    }

    return {
      invitation: {
        id: invite.id,
        groupId: invite.group_id,
        groupName: invite.group_name,
        code: invite.code,
        createdBy: invite.created_by,
        createdAt: invite.created_at,
        expiresAt: invite.expires_at,
        status: invite.status,
        intendedEmail: invite.intended_email,
      },
      group: {
        id: group.id,
        name: group.name,
        studyTitle: group.study_title,
        targetSampleSize: group.target_sample_size,
        memberCount: group.members.length,
        isFull: false,
      },
    };
  }

  public async acceptInvitation(code: string, user: UserProfile): Promise<ResearchGroup> {
    return this.mutex.runExclusive(async () => {
      const normalizedCode = code.trim().toUpperCase();
      const invite = this.data.invitations.find((i) => i.code.toUpperCase() === normalizedCode);
      if (!invite) {
        throw new Error('Invalid invitation code.');
      }

      if (invite.status !== 'pending') {
        throw new Error(`This invitation is no longer active (status: ${invite.status}).`);
      }

      if (new Date(invite.expires_at) < new Date()) {
        invite.status = 'expired';
        await this.persist();
        throw new Error('This invitation has expired.');
      }

      const group = this.data.groups.find((g) => g.id === invite.group_id);
      if (!group) {
        throw new GroupNotFoundError();
      }

      const existingMember = group.members.find((m) => m.user_id === user.id);
      if (existingMember) {
        return this.mapGroupToPublic(group);
      }

      const now = new Date().toISOString();
      const newMember: StoredGroupMember = {
        user_id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: 'researcher',
        joined_at: now,
      };

      group.members.push(newMember);
      group.updated_at = now;
      invite.status = 'accepted';

      await this.persist();

      const resolved = this.mapGroupToPublic(group);
      this.broadcast('team_updated', group.id, {
        groupId: group.id,
        totalMembers: group.members.length,
      });
      return resolved;
    });
  }

  public async removeMember(
    groupId: string,
    requesterUserId: string,
    targetUserId: string
  ): Promise<ResearchGroup> {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();

      const requester = group.members.find((m) => m.user_id === requesterUserId);
      if (!requester || requester.role !== 'owner') {
        throw new UnauthorizedGroupActionError('Only the research group owner can remove members.');
      }

      if (requesterUserId === targetUserId) {
        throw new Error('The group owner cannot remove themselves from the group.');
      }

      const memberIndex = group.members.findIndex((m) => m.user_id === targetUserId);
      if (memberIndex === -1) {
        throw new Error('Member not found in this group.');
      }

      group.members.splice(memberIndex, 1);
      group.updated_at = new Date().toISOString();

      await this.persist();

      const resolved = this.mapGroupToPublic(group);
      this.broadcast('team_updated', groupId, {
        groupId,
        totalMembers: group.members.length,
      });
      return resolved;
    });
  }

  // --- GROUP-SCOPED PATIENT CASE OPERATIONS ---

  private verifyUserGroupMembership(groupId: string, userId: string): StoredGroup {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (!group) throw new GroupNotFoundError();
    const isMember = group.members.some((m) => m.user_id === userId);
    if (!isMember) {
      throw new UnauthorizedGroupActionError('Access denied: You are not a member of this research group.');
    }
    return group;
  }

  public async checkPatientId(
    groupId: string,
    rawId: string,
    userId: string
  ): Promise<{
    exists: boolean;
    normalizedId: string;
    case?: CaseRecord;
  }> {
    this.verifyUserGroupMembership(groupId, userId);

    const val = validatePatientId(rawId);
    if (!val.isValid) {
      throw new Error(val.errorMessage);
    }

    const normalized = val.normalizedId;
    const existing = this.data.cases.find(
      (c) => c.group_id === groupId && c.normalized_patient_id === normalized
    );

    if (existing) {
      return {
        exists: true,
        normalizedId: normalized,
        case: this.resolveCaseRecord(existing),
      };
    }

    return {
      exists: false,
      normalizedId: normalized,
    };
  }

  public async registerCase(params: {
    groupId: string;
    patientId: string;
    assignedToUserId: string;
    patientName?: string;
    diagnosis?: string;
    drugNames?: string;
  }): Promise<CaseRecord> {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.assignedToUserId);

      const val = validatePatientId(params.patientId);
      if (!val.isValid) {
        throw new Error(val.errorMessage);
      }

      const normalized = val.normalizedId;
      const originalPatientId = params.patientId.trim();

      const existing = this.data.cases.find(
        (c) => c.group_id === params.groupId && c.normalized_patient_id === normalized
      );
      if (existing) {
        throw new DuplicateCaseError(
          `Patient ID "${originalPatientId}" is already registered in ${group.name}.`,
          this.resolveCaseRecord(existing)
        );
      }

      const now = new Date().toISOString();
      const newCase: StoredCase = {
        id: crypto.randomUUID(),
        group_id: params.groupId,
        patient_id: originalPatientId,
        normalized_patient_id: normalized,
        assigned_to: params.assignedToUserId,
        status: 'In Progress',
        patient_name: params.patientName?.trim() || undefined,
        diagnosis: params.diagnosis?.trim() || undefined,
        drug_names: params.drugNames?.trim() || undefined,
        registered_at: now,
        updated_at: now,
      };

      this.data.cases.push(newCase);
      await this.persist();

      const resolved = this.resolveCaseRecord(newCase);
      this.broadcast('case_registered', params.groupId, {
        groupId: params.groupId,
        case: resolved,
      });
      return resolved;
    });
  }

  public async getAllCases(
    groupId: string,
    userId: string,
    filters?: {
      search?: string;
      memberId?: string;
      status?: string;
    }
  ): Promise<CaseRecord[]> {
    this.verifyUserGroupMembership(groupId, userId);

    let list = this.data.cases.filter((c) => c.group_id === groupId);

    if (filters?.search) {
      const q = normalizePatientId(filters.search);
      const rawLower = filters.search.trim().toLowerCase();
      list = list.filter((c) => {
        const matchesId =
          (q && c.normalized_patient_id.includes(q)) ||
          c.patient_id.toLowerCase().includes(rawLower);
        const matchesName = c.patient_name
          ? c.patient_name.toLowerCase().includes(rawLower)
          : false;
        return matchesId || matchesName;
      });
    }

    if (filters?.memberId && filters.memberId !== 'ALL') {
      list = list.filter((c) => c.assigned_to === filters.memberId);
    }

    if (filters?.status && filters.status !== 'ALL') {
      list = list.filter((c) => c.status === filters.status);
    }

    list.sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());
    return list.map((c) => this.resolveCaseRecord(c));
  }

  public async getMyCases(
    groupId: string,
    userId: string,
    search?: string
  ): Promise<CaseRecord[]> {
    this.verifyUserGroupMembership(groupId, userId);

    let list = this.data.cases.filter(
      (c) => c.group_id === groupId && c.assigned_to === userId
    );

    if (search) {
      const q = normalizePatientId(search);
      const rawLower = search.trim().toLowerCase();
      list = list.filter((c) => {
        const matchesId =
          (q && c.normalized_patient_id.includes(q)) ||
          c.patient_id.toLowerCase().includes(rawLower);
        const matchesName = c.patient_name
          ? c.patient_name.toLowerCase().includes(rawLower)
          : false;
        return matchesId || matchesName;
      });
    }

    list.sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());
    return list.map((c) => this.resolveCaseRecord(c));
  }

  public async updateCaseStatus(params: {
    groupId: string;
    caseId: string;
    userId: string;
    newStatus: CaseStatus;
  }): Promise<CaseRecord> {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.userId);

      const validStatuses: CaseStatus[] = ['In Progress', 'Completed', 'Excluded'];
      if (!validStatuses.includes(params.newStatus)) {
        throw new Error(`Invalid status: ${params.newStatus}`);
      }

      const target = this.data.cases.find(
        (c) => c.id === params.caseId && c.group_id === params.groupId
      );
      if (!target) {
        throw new Error('Case not found in this research group.');
      }

      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === 'owner';
      const isAssigned = target.assigned_to === params.userId;

      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          'Permission denied. You can only update the status of cases assigned to you.'
        );
      }

      target.status = params.newStatus;
      target.updated_at = new Date().toISOString();

      await this.persist();

      const resolved = this.resolveCaseRecord(target);
      this.broadcast('case_status_updated', params.groupId, {
        groupId: params.groupId,
        case: resolved,
      });
      return resolved;
    });
  }

  public async updateCaseDetails(params: {
    groupId: string;
    caseId: string;
    userId: string;
    patientName?: string;
    diagnosis?: string;
    drugNames?: string;
  }): Promise<CaseRecord> {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.userId);

      const target = this.data.cases.find(
        (c) => c.id === params.caseId && c.group_id === params.groupId
      );
      if (!target) {
        throw new Error('Case not found in this research group.');
      }

      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === 'owner';
      const isAssigned = target.assigned_to === params.userId;

      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          'Permission denied. You can only modify clinical details for cases assigned to you.'
        );
      }

      if (params.patientName !== undefined) {
        target.patient_name = params.patientName.trim() || undefined;
      }
      if (params.diagnosis !== undefined) {
        target.diagnosis = params.diagnosis.trim() || undefined;
      }
      if (params.drugNames !== undefined) {
        target.drug_names = params.drugNames.trim() || undefined;
      }
      target.updated_at = new Date().toISOString();

      await this.persist();

      const resolved = this.resolveCaseRecord(target);
      this.broadcast('case_status_updated', params.groupId, {
        groupId: params.groupId,
        case: resolved,
      });
      return resolved;
    });
  }

  public async deleteCase(params: {
    groupId: string;
    caseId: string;
    userId: string;
  }): Promise<{ success: boolean; patientId: string }> {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.userId);

      const index = this.data.cases.findIndex(
        (c) => c.id === params.caseId && c.group_id === params.groupId
      );
      if (index === -1) {
        throw new Error('Case not found in this research group.');
      }

      const target = this.data.cases[index];
      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === 'owner';
      const isAssigned = target.assigned_to === params.userId;

      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          'Permission denied. You can only remove cases registered by you.'
        );
      }

      const [removed] = this.data.cases.splice(index, 1);
      await this.persist();

      this.broadcast('case_deleted', params.groupId, {
        groupId: params.groupId,
        caseId: removed.id,
        patientId: removed.patient_id,
      });

      return { success: true, patientId: removed.patient_id };
    });
  }

  public async getDashboardStats(
    groupId: string,
    userId: string
  ): Promise<DashboardStats> {
    const group = this.verifyUserGroupMembership(groupId, userId);
    const groupCases = this.data.cases.filter((c) => c.group_id === groupId);

    const totalCases = groupCases.length;
    const myCases = groupCases.filter((c) => c.assigned_to === userId).length;
    const inProgress = groupCases.filter((c) => c.status === 'In Progress').length;
    const completed = groupCases.filter((c) => c.status === 'Completed').length;
    const excluded = groupCases.filter((c) => c.status === 'Excluded').length;

    const targetSampleSize = group.target_sample_size || 220;
    const remaining = Math.max(0, targetSampleSize - totalCases);
    const progressPercentage =
      targetSampleSize > 0 ? Number(((totalCases / targetSampleSize) * 100).toFixed(1)) : 0;

    return {
      totalCases,
      myCases,
      inProgress,
      completed,
      excluded,
      targetSampleSize,
      remaining,
      progressPercentage,
    };
  }

  public async getTeamSummary(
    groupId: string,
    userId: string
  ): Promise<TeamSummaryResponse> {
    const group = this.verifyUserGroupMembership(groupId, userId);
    const groupCases = this.data.cases.filter((c) => c.group_id === groupId);

    const membersSummary: TeamMemberSummary[] = group.members.map((m) => {
      const userCases = groupCases.filter((c) => c.assigned_to === m.user_id);
      return {
        profileId: m.user_id,
        displayName: m.display_name,
        email: m.email,
        role: m.role,
        totalAssigned: userCases.length,
        inProgress: userCases.filter((c) => c.status === 'In Progress').length,
        completed: userCases.filter((c) => c.status === 'Completed').length,
        excluded: userCases.filter((c) => c.status === 'Excluded').length,
      };
    });

    const userMember = group.members.find((m) => m.user_id === userId);

    return {
      groupId: group.id,
      groupName: group.name,
      studyTitle: group.study_title,
      totalCases: groupCases.length,
      totalMembers: group.members.length,
      isFull: false,
      userRole: userMember?.role || 'researcher',
      members: membersSummary,
    };
  }

  // =========================================================================
  // --- APP OWNER / ORGANIZATION ADMINISTRATION METHODS ---
  // =========================================================================

  public async getAppOwnerOverview(): Promise<AppOwnerStats> {
    const totalUsers = this.data.profiles.length;
    const totalGroups = this.data.groups.length;
    const activeGroups = this.data.groups.filter((g) => (g.status || 'active') === 'active').length;
    const totalMemberships = this.data.groups.reduce((acc, g) => acc + g.members.length, 0);
    const totalCases = this.data.cases.length;

    return {
      totalUsers,
      totalGroups,
      activeGroups,
      totalMemberships,
      totalCases,
    };
  }

  public async getAppOwnerUsers(options?: {
    search?: string;
    status?: string;
  }): Promise<AppOwnerUser[]> {
    let list = this.data.profiles;

    if (options?.search) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.display_name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
      );
    }

    if (options?.status && options.status !== 'ALL') {
      list = list.filter((p) => (p.status || 'active') === options.status);
    }

    return list.map((p) => {
      // Find all groups this user belongs to
      const userGroups = this.data.groups
        .filter((g) => g.members.some((m) => m.user_id === p.id))
        .map((g) => {
          const m = g.members.find((mem) => mem.user_id === p.id)!;
          return {
            groupId: g.id,
            groupName: g.name,
            role: m.role,
            joinedAt: m.joined_at,
          };
        });

      return {
        id: p.id,
        email: p.email,
        displayName: p.display_name,
        status: p.status || 'active',
        createdAt: p.created_at,
        isAppOwner: this.isAppOwner(p.email),
        groups: userGroups,
      };
    });
  }

  public async setAppOwnerUserStatus(
    userId: string,
    newStatus: 'active' | 'suspended',
    adminEmail: string
  ): Promise<AppOwnerUser> {
    return this.mutex.runExclusive(async () => {
      const profile = this.data.profiles.find((p) => p.id === userId);
      if (!profile) throw new Error('User profile not found.');

      if (this.isAppOwner(profile.email)) {
        throw new Error('Action rejected: Cannot modify status of an authorized App Owner account.');
      }

      profile.status = newStatus;
      profile.updated_at = new Date().toISOString();
      await this.persist();

      await this.recordAuditLog({
        action: newStatus === 'suspended' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
        entityType: 'user',
        entityId: profile.id,
        entityName: profile.display_name,
        details: `Account status for "${profile.email}" changed to ${newStatus}.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail,
      });

      const userGroups = this.data.groups
        .filter((g) => g.members.some((m) => m.user_id === profile.id))
        .map((g) => {
          const m = g.members.find((mem) => mem.user_id === profile.id)!;
          return {
            groupId: g.id,
            groupName: g.name,
            role: m.role,
            joinedAt: m.joined_at,
          };
        });

      return {
        id: profile.id,
        email: profile.email,
        displayName: profile.display_name,
        status: profile.status,
        createdAt: profile.created_at,
        isAppOwner: false,
        groups: userGroups,
      };
    });
  }

  public async getAppOwnerGroups(options?: {
    search?: string;
    status?: string;
  }): Promise<AppOwnerGroup[]> {
    let list = this.data.groups;

    if (options?.search) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.study_title.toLowerCase().includes(q) ||
          (g.institution && g.institution.toLowerCase().includes(q))
      );
    }

    if (options?.status && options.status !== 'ALL') {
      list = list.filter((g) => (g.status || 'active') === options.status);
    }

    return list.map((g) => {
      const owner = this.data.profiles.find((p) => p.id === g.owner_id);
      const caseCount = this.data.cases.filter((c) => c.group_id === g.id).length;
      const invitationsCount = this.data.invitations.filter((i) => i.group_id === g.id).length;

      return {
        id: g.id,
        name: g.name,
        studyTitle: g.study_title,
        ownerId: g.owner_id,
        ownerName: owner ? owner.display_name : 'Unknown Owner',
        ownerEmail: owner ? owner.email : '',
        memberCount: g.members.length,
        targetSampleSize: g.target_sample_size,
        caseCount,
        description: g.description,
        institution: g.institution,
        status: g.status || 'active',
        createdAt: g.created_at,
        updatedAt: g.updated_at,
        members: g.members.map((m) => ({
          userId: m.user_id,
          displayName: m.display_name,
          email: m.email,
          role: m.role,
          joinedAt: m.joined_at,
        })),
        invitationsCount,
      };
    });
  }

  public async setAppOwnerGroupStatus(
    groupId: string,
    newStatus: 'active' | 'archived' | 'suspended',
    adminEmail: string
  ): Promise<AppOwnerGroup> {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();

      group.status = newStatus;
      group.updated_at = new Date().toISOString();
      await this.persist();

      await this.recordAuditLog({
        action: 'GROUP_STATUS_CHANGED',
        entityType: 'group',
        entityId: group.id,
        entityName: group.name,
        details: `Research group "${group.name}" status changed to ${newStatus}.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail,
      });

      const owner = this.data.profiles.find((p) => p.id === group.owner_id);
      const caseCount = this.data.cases.filter((c) => c.group_id === group.id).length;
      const invitationsCount = this.data.invitations.filter((i) => i.group_id === group.id).length;

      return {
        id: group.id,
        name: group.name,
        studyTitle: group.study_title,
        ownerId: group.owner_id,
        ownerName: owner ? owner.display_name : 'Unknown Owner',
        ownerEmail: owner ? owner.email : '',
        memberCount: group.members.length,
        targetSampleSize: group.target_sample_size,
        caseCount,
        description: group.description,
        institution: group.institution,
        status: group.status || 'active',
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        members: group.members.map((m) => ({
          userId: m.user_id,
          displayName: m.display_name,
          email: m.email,
          role: m.role,
          joinedAt: m.joined_at,
        })),
        invitationsCount,
      };
    });
  }

  public async deleteAppOwnerGroup(
    groupId: string,
    adminEmail: string
  ): Promise<{ success: boolean; groupName: string }> {
    return this.mutex.runExclusive(async () => {
      const idx = this.data.groups.findIndex((g) => g.id === groupId);
      if (idx === -1) throw new GroupNotFoundError();

      const [removed] = this.data.groups.splice(idx, 1);

      // Purge group cases and invitations
      const caseCountBefore = this.data.cases.length;
      this.data.cases = this.data.cases.filter((c) => c.group_id !== groupId);
      const casesPurged = caseCountBefore - this.data.cases.length;

      this.data.invitations = this.data.invitations.filter((i) => i.group_id !== groupId);

      await this.persist();

      await this.recordAuditLog({
        action: 'GROUP_DELETED',
        entityType: 'group',
        entityId: removed.id,
        entityName: removed.name,
        details: `Research group "${removed.name}" deleted (${casesPurged} case records purged).`,
        performedBy: adminEmail,
        performedByEmail: adminEmail,
      });

      return { success: true, groupName: removed.name };
    });
  }

  public getAppSettings(): AppOwnerSettings {
    const settings = this.data.app_settings || {
      authorized_app_owners: [PRIMARY_APP_OWNER],
      maintenance_mode: false,
      allow_registration: true,
      updated_at: new Date().toISOString(),
    };

    return {
      authorizedAppOwners: settings.authorized_app_owners,
      maintenanceMode: settings.maintenance_mode,
      allowRegistration: settings.allow_registration,
      updatedAt: settings.updated_at,
    };
  }

  public async updateAppSettings(
    updates: {
      authorizedAppOwners?: string[];
      maintenanceMode?: boolean;
      allowRegistration?: boolean;
    },
    adminEmail: string
  ): Promise<AppOwnerSettings> {
    return this.mutex.runExclusive(async () => {
      if (!this.data.app_settings) {
        this.data.app_settings = {
          authorized_app_owners: [PRIMARY_APP_OWNER],
          maintenance_mode: false,
          allow_registration: true,
          updated_at: new Date().toISOString(),
        };
      }

      if (updates.authorizedAppOwners !== undefined) {
        // Normalize emails and ensure PRIMARY_APP_OWNER is ALWAYS present and protected
        const unique = Array.from(
          new Set(
            updates.authorizedAppOwners
              .map((e) => e.trim().toLowerCase())
              .filter((e) => e.includes('@') && e.includes('.'))
          )
        );

        if (!unique.includes(PRIMARY_APP_OWNER.toLowerCase())) {
          unique.unshift(PRIMARY_APP_OWNER.toLowerCase());
        }

        this.data.app_settings.authorized_app_owners = unique;
      }

      if (updates.maintenanceMode !== undefined) {
        this.data.app_settings.maintenance_mode = updates.maintenanceMode;
      }

      if (updates.allowRegistration !== undefined) {
        this.data.app_settings.allow_registration = updates.allowRegistration;
      }

      this.data.app_settings.updated_at = new Date().toISOString();
      await this.persist();

      await this.recordAuditLog({
        action: 'APP_SETTINGS_UPDATED',
        entityType: 'settings',
        details: `Application settings updated by ${adminEmail}. Authorized owners count: ${this.data.app_settings.authorized_app_owners.length}.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail,
      });

      return {
        authorizedAppOwners: this.data.app_settings.authorized_app_owners,
        maintenanceMode: this.data.app_settings.maintenance_mode,
        allowRegistration: this.data.app_settings.allow_registration,
        updatedAt: this.data.app_settings.updated_at,
      };
    });
  }

  public getLegalPolicies(): LegalPolicyDoc[] {
    const docs = this.data.legal_docs || DEFAULT_LEGAL_DOCS;
    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      content: doc.content,
      lastUpdated: doc.last_updated,
    }));
  }

  public async updateLegalPolicy(
    id: string,
    content: string,
    adminEmail: string
  ): Promise<LegalPolicyDoc> {
    return this.mutex.runExclusive(async () => {
      if (!this.data.legal_docs) this.data.legal_docs = [...DEFAULT_LEGAL_DOCS];

      const doc = this.data.legal_docs.find((d) => d.id === id);
      if (!doc) throw new Error('Policy document not found.');

      doc.content = content.trim();
      doc.last_updated = new Date().toISOString();
      await this.persist();

      await this.recordAuditLog({
        action: 'LEGAL_POLICY_UPDATED',
        entityType: 'legal',
        entityId: doc.id,
        entityName: doc.title,
        details: `Legal policy "${doc.title}" content updated.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail,
      });

      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        lastUpdated: doc.last_updated,
      };
    });
  }
}

export const db = new RelationalDatabase();
