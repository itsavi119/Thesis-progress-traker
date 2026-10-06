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
  BackupManifest,
  CaseRecord,
  CaseStatus,
  CustomFieldDefinition,
  DashboardStats,
  GroupInvitation,
  GroupMember,
  GroupMemberRole,
  LegalPolicyDoc,
  Organization,
  ResearchFile,
  ResearchGroup,
  StudyType,
  SubjectTerminology,
  TeamMemberSummary,
  TeamSummaryResponse,
  UserProfile,
} from '../types/index.js';

export const PRIMARY_APP_OWNER = 'avishah.as119@gmail.com';

export function computeLengthOfStay(admission?: string, discharge?: string): number | undefined {
  if (!admission || !discharge) return undefined;
  const a = new Date(admission);
  const d = new Date(discharge);
  if (isNaN(a.getTime()) || isNaN(d.getTime())) return undefined;
  const diffTime = d.getTime() - a.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : undefined;
}

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

interface StoredOrganization {
  id: string;
  name: string;
  description?: string;
  institution?: string;
  contact_email?: string;
  owner_id: string;
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
  organization_id?: string;
  name: string;
  study_title: string;
  study_type?: StudyType;
  subject_terminology?: SubjectTerminology;
  target_sample_size: number;
  description?: string;
  institution?: string;
  owner_id: string;
  status?: 'active' | 'archived' | 'suspended';
  custom_fields?: CustomFieldDefinition[];
  members: StoredGroupMember[];
  created_at: string;
  updated_at: string;
}

interface StoredFile {
  id: string;
  group_id: string;
  name: string;
  size: number;
  mime_type: string;
  category: 'protocol' | 'approval' | 'questionnaire' | 'data' | 'other';
  uploaded_by: string;
  uploaded_by_name: string;
  file_data?: string;
  created_at: string;
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
  age?: number;
  gender?: string;
  department?: string;
  location?: string;
  diagnosis?: string;
  drug_names?: string;
  admission_date?: string;
  discharge_date?: string;
  length_of_stay?: number;
  notes?: string;
  custom_values?: Record<string, any>;
  registered_at: string;
  updated_at: string;
  last_modified_by?: string;
  version?: number;
}

interface StoredAuditLog {
  id: string;
  action: string;
  entity_type: 'user' | 'group' | 'organization' | 'settings' | 'security' | 'legal' | 'file';
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

export interface StoredCaseHistory {
  id: string;
  group_id: string;
  action: 'CASE_REGISTERED' | 'CASE_UPDATED' | 'CASE_STATUS_UPDATED' | 'CASE_DELETED' | 'BACKUP_RESTORED' | string;
  case_id?: string;
  patient_id: string;
  patient_name?: string;
  details: string;
  performed_by: string;
  performed_by_email: string;
  created_at: string;
}

export interface StoredContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'reviewed' | 'resolved';
  created_at: string;
}

interface DatabaseSchema {
  version: number;
  profiles: StoredProfile[];
  organizations?: StoredOrganization[];
  groups: StoredGroup[];
  invitations: StoredInvitation[];
  cases: StoredCase[];
  files?: StoredFile[];
  audit_logs?: StoredAuditLog[];
  case_history?: StoredCaseHistory[];
  contact_messages?: StoredContactMessage[];
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
  constructor(message = 'Unauthorized: You do not have permission for this research study/group.') {
    super(message);
    this.name = 'UnauthorizedGroupActionError';
  }
}

export class GroupNotFoundError extends Error {
  constructor(message = 'Research study/group not found.') {
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

export class AccountLockedError extends Error {
  constructor(message = 'Account temporarily locked due to multiple failed login attempts. Please wait 15 minutes.') {
    super(message);
    this.name = 'AccountLockedError';
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
    title: 'Privacy & Data Protection Policy',
    category: 'privacy',
    last_updated: '2026-10-06T00:00:00.000Z',
    content: `Thesis Case Tracker ("Platform") is committed to safeguarding the privacy and confidentiality of clinical research data, healthcare investigators, and study participants. This Privacy Policy governs all data processing and protection practices within the application.

1. Information We Collect
We collect institutional investigator profile information (name, professional email address) and study administrative parameters (study titles, target enrollment sizes, research group membership). Patient records entered for enrollment coordination and duplicate prevention are restricted to study-specific case identifiers, anonymized clinical notes, and treatment regimen metadata.

2. Study-Level Data Isolation & Strict Access Boundary
All patient records, duplicate detection indices, and case progress updates are strictly partitioned within each research group workspace. Data entered by researchers in one study group is strictly inaccessible to other study teams. System administrators do not access, browse, or disclose confidential patient study records.

3. Data Minimization & Privacy Protection
Researchers are instructed to enter only the minimum data necessary for duplicate patient prevention and study coordination. Direct patient contact details (such as home addresses, phone numbers, or national identification numbers) must never be entered into the platform.

4. Infrastructure Security & Confidentiality
All network transmissions are protected using TLS encryption. Data is stored in secure encrypted environments with role-based access controls and audit logging. Data is never shared with third-party advertisers, commercial data brokers, or unapproved external services.`,
  },
  {
    id: 'terms-of-use',
    title: 'Terms of Academic & Clinical Use',
    category: 'terms',
    last_updated: '2026-10-06T00:00:00.000Z',
    content: `By accessing or using Thesis Case Tracker, you agree to comply with these Terms of Academic & Clinical Use.

1. Authorized Clinical & Academic Use
This platform is intended exclusively for authorized hospital researchers, postgraduate medical students, academic investigators, and thesis research teams. Access is granted for lawful, ethics-approved clinical data collection and study coordination.

2. Ethics Approval & Institutional Oversight
Investigators and their affiliated academic institutions remain solely responsible for securing and maintaining all mandatory approvals from their Institutional Review Board (IRB) or Independent Ethics Committee (IEC) prior to entering research study cases.

3. Credential Security & Account Integrity
Users are responsible for safeguarding their login credentials and session tokens. Sharing accounts or attempting unauthorized access to research groups to which you have not been invited is strictly prohibited.

4. Research Integrity & Record Accuracy
Investigators must ensure the integrity and accuracy of entered study records, including verification of assigned patient codes and diagnosis details.`,
  },
  {
    id: 'research-responsibility',
    title: 'Research Data Integrity & De-Identification Guidelines',
    category: 'responsibility',
    last_updated: '2026-10-06T00:00:00.000Z',
    content: `Notice Regarding Research Data Integrity and Institutional Responsibility:

1. De-Identification Recommendations
In accordance with international healthcare research standards, researchers are strongly advised to utilize pseudo-anonymized study codes, hospital research accession numbers, or masked identifiers rather than direct patient names or sensitive personal details.

2. Duplicate Prevention Protocol
The primary function of the platform is to alert research collaborators when a patient has already been enrolled in the study. In the event of a duplicate alert, researchers must verify with their study team before proceeding to prevent skewed sample sizes or double-counting.

3. Principal Investigator & Institutional Governance
The platform serves as an operational coordination tool for case assignment and duplicate prevention. Ultimate legal, clinical, and ethical responsibility for trial conduct, patient safety, and regulatory compliance resides with the Principal Investigator and the sponsoring healthcare institution.`,
  },
  {
    id: 'storage-drive-notice',
    title: 'Data Storage, Security & Retention Policy',
    category: 'storage',
    last_updated: '2026-10-06T00:00:00.000Z',
    content: `Data Storage, Security and Retention Disclosures:

1. Secure Storage
All research study data, case assignment records, and audit logs are stored in secure, encrypted cloud repositories with automated integrity verification and backup redundancy.

2. Data Export & Institutional Archiving
Authorized study team members may export their research group's full case ledger in standard comma-separated format (CSV) at any time. Exported records include enrollment timestamps, assigned researchers, and case status for local institutional statistical analysis and archival compliance.

3. Study Lifecycle & Retention
Study records remain active and queryable for the duration of the research group's data collection phase. Completed or published studies may be formally archived by the group owner.`,
  },
  {
    id: 'account-deletion-info',
    title: 'Data Deletion, Erasure & Group Closure Policy',
    category: 'deletion',
    last_updated: '2026-10-06T00:00:00.000Z',
    content: `Procedures for Record Correction, Study Group Closure, and Account Erasure:

1. Case Record Removal & Correction
Researchers can immediately delete an incorrectly entered patient record from their study workspace. Deletion instantly updates enrollment counts, removes the patient ID from duplicate prevention indices, and records an administrative audit entry.

2. Study Group Deletion & Closure
A research group owner or authorized administrator may formally delete or archive a study group upon thesis defense or project conclusion. Deleting a study permanently purges all active case records, pending invitations, and membership associations for that group.

3. Account Deactivation & Profile Erasure
Users may request complete account erasure and revocation of credentials. Upon deactivation, login access is immediately revoked, and profile associations are anonymized in accordance with institutional study retention guidelines.`,
  },
  {
    id: 'disclaimer',
    title: 'Clinical & Regulatory Disclaimer',
    category: 'disclaimer',
    last_updated: '2026-10-06T00:00:00.000Z',
    content: `Clinical, Diagnostic & Legal Disclaimer:

1. Academic & Workflow Coordination Purpose
Thesis Case Tracker is an academic research workflow coordination and duplicate prevention tool designed to assist hospital thesis teams in collaborative case management. It is NOT a medical device, diagnostic tool, clinical decision support system, or hospital Electronic Health Record (EHR) replacement.

2. No Medical Advice or Diagnostic Reliance
The platform does not provide medical diagnoses, treatment recommendations, or prescription validation. Healthcare decisions regarding patient care must always be made by qualified medical practitioners based on direct clinical evaluation and primary hospital health records.

3. Regulatory Compliance
No representation of universal regulatory certification (such as HIPAA, GDPR, or DPDP) is made without specific institutional deployment agreements. Investigators and healthcare institutions must verify that their use of this software complies with all applicable local, regional, and national laws governing human subject research and health data protection.`,
  },
];

export class RelationalDatabase {
  private filePath: string;
  private mutex = new AsyncMutex();
  private data: DatabaseSchema;
  private changeListeners: Array<(event: string, groupId: string, payload: any) => void> = [];
  private failedLogins: Map<string, { count: number; lockedUntil: number }> = new Map();

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, 'thesis_tracker_db.json');

    this.data = {
      version: 3,
      profiles: [],
      organizations: [],
      groups: [],
      invitations: [],
      cases: [],
      files: [],
      audit_logs: [],
      case_history: [],
      contact_messages: [],
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
          version: parsed.version || 3,
          profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
          organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
          invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
          cases: Array.isArray(parsed.cases) ? parsed.cases : [],
          files: Array.isArray(parsed.files) ? parsed.files : [],
          audit_logs: Array.isArray(parsed.audit_logs) ? parsed.audit_logs : [],
          case_history: Array.isArray(parsed.case_history) ? parsed.case_history : [],
          contact_messages: Array.isArray(parsed.contact_messages) ? parsed.contact_messages : [],
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
          const initialGroupId = 'general-thesis-group';
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
            name: 'Clinical Research Study Team',
            study_title: 'Clinical Research & Patient Case Coordination Study',
            study_type: 'Clinical Pharmacy',
            subject_terminology: 'Patient',
            target_sample_size: 150,
            description: 'Collaborative academic clinical thesis study and patient case tracker.',
            institution: 'Hospital Department of Clinical Research',
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
    const modifier = c.last_modified_by ? this.data.profiles.find((p) => p.id === c.last_modified_by) : undefined;
    return {
      id: c.id,
      group_id: c.group_id,
      patient_id: c.patient_id,
      normalized_patient_id: c.normalized_patient_id,
      assigned_to: c.assigned_to,
      status: c.status,
      patient_name: c.patient_name,
      age: c.age,
      gender: c.gender,
      department: c.department,
      location: c.location,
      diagnosis: c.diagnosis,
      drug_names: c.drug_names,
      admission_date: c.admission_date,
      discharge_date: c.discharge_date,
      length_of_stay: c.length_of_stay !== undefined ? c.length_of_stay : computeLengthOfStay(c.admission_date, c.discharge_date),
      notes: c.notes,
      custom_values: c.custom_values,
      registered_at: c.registered_at,
      updated_at: c.updated_at,
      assigned_name: profile ? profile.display_name : 'Unknown Researcher',
      assigned_email: profile ? profile.email : '',
      last_modified_by: c.last_modified_by,
      last_modified_by_name: modifier ? modifier.display_name : (profile ? profile.display_name : undefined),
      version: c.version || 1,
      sync_status: 'synced',
    };
  }

  private mapGroupToPublic(g: StoredGroup): ResearchGroup {
    let orgName: string | undefined;
    if (g.organization_id && this.data.organizations) {
      const org = this.data.organizations.find((o) => o.id === g.organization_id);
      if (org) orgName = org.name;
    }

    return {
      id: g.id,
      organizationId: g.organization_id,
      organizationName: orgName,
      name: g.name,
      studyTitle: g.study_title,
      studyType: g.study_type || 'Clinical Pharmacy',
      subjectTerminology: g.subject_terminology || 'Patient',
      targetSampleSize: g.target_sample_size,
      description: g.description,
      institution: g.institution,
      ownerId: g.owner_id,
      status: g.status || 'active',
      customFields: g.custom_fields || [],
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
    entityType: 'user' | 'group' | 'organization' | 'settings' | 'security' | 'legal' | 'file';
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

  private recordFailedLogin(email: string): void {
    const now = Date.now();
    const entry = this.failedLogins.get(email) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= 5) {
      entry.lockedUntil = now + 15 * 60 * 1000; // 15 minute temporary lock
    }
    this.failedLogins.set(email, entry);
  }

  public async verifyUserCredentials(params: {
    email: string;
    password: string;
  }): Promise<UserProfile | null> {
    const email = params.email.trim().toLowerCase();
    const now = Date.now();
    const lockInfo = this.failedLogins.get(email);
    if (lockInfo && lockInfo.lockedUntil > now) {
      const minutesRemaining = Math.max(1, Math.ceil((lockInfo.lockedUntil - now) / (60 * 1000)));
      throw new AccountLockedError(`Account temporarily locked due to 5 consecutive failed login attempts. Please wait ${minutesRemaining} minute(s) before trying again.`);
    }

    const profile = this.data.profiles.find((p) => p.email.toLowerCase() === email);
    if (!profile) {
      this.recordFailedLogin(email);
      return null;
    }

    if (profile.status === 'suspended') {
      throw new AccountSuspendedError();
    }

    const matches = await bcrypt.compare(params.password, profile.password_hash);
    if (!matches) {
      this.recordFailedLogin(email);
      return null;
    }

    // Successful authentication: clear failure count
    this.failedLogins.delete(email);
    return this.resolveUserProfile(profile);
  }

  public async resetUserPassword(params: {
    email: string;
    newPassword: string;
  }): Promise<boolean> {
    return this.mutex.runExclusive(async () => {
      const email = params.email.trim().toLowerCase();
      const profile = this.data.profiles.find((p) => p.email.toLowerCase() === email);
      if (!profile) {
        throw new Error('No registered account was found with this email address.');
      }
      if (profile.status === 'suspended') {
        throw new AccountSuspendedError();
      }

      const salt = await bcrypt.genSalt(10);
      profile.password_hash = await bcrypt.hash(params.newPassword, salt);
      profile.updated_at = new Date().toISOString();
      this.failedLogins.delete(email);
      await this.persist();

      await this.recordAuditLog({
        action: 'PASSWORD_RESET',
        entityType: 'user',
        entityId: profile.id,
        entityName: profile.display_name,
        details: `Password was successfully updated for researcher ${profile.email}.`,
        performedBy: profile.display_name,
        performedByEmail: profile.email,
      });

      return true;
    });
  }

  // --- ORGANIZATIONS MANAGEMENT ---

  public async getUserOrganizations(userId: string): Promise<Organization[]> {
    if (!this.data.organizations) this.data.organizations = [];
    const list = this.data.organizations.filter((o) => {
      // User owns the organization OR is a member of studies inside this organization
      const ownsOrg = o.owner_id === userId;
      const inOrgStudy = this.data.groups.some(
        (g) => g.organization_id === o.id && g.members.some((m) => m.user_id === userId)
      );
      return ownsOrg || inOrgStudy;
    });

    return list.map((o) => {
      const studies = this.data.groups.filter((g) => g.organization_id === o.id);
      const uniqueMembers = new Set<string>();
      studies.forEach((s) => s.members.forEach((m) => uniqueMembers.add(m.user_id)));
      return {
        id: o.id,
        name: o.name,
        description: o.description,
        institution: o.institution,
        contactEmail: o.contact_email,
        ownerId: o.owner_id,
        studiesCount: studies.length,
        membersCount: uniqueMembers.size,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      };
    });
  }

  public async createOrganization(
    userId: string,
    params: {
      name: string;
      description?: string;
      institution?: string;
      contactEmail?: string;
    }
  ): Promise<Organization> {
    return this.mutex.runExclusive(async () => {
      const name = params.name.trim();
      if (!name) throw new Error('Organization name is required.');

      if (!this.data.organizations) this.data.organizations = [];
      const now = new Date().toISOString();
      const newOrg: StoredOrganization = {
        id: crypto.randomUUID(),
        name,
        description: params.description?.trim() || undefined,
        institution: params.institution?.trim() || undefined,
        contact_email: params.contactEmail?.trim() || undefined,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      this.data.organizations.push(newOrg);
      await this.persist();

      return {
        id: newOrg.id,
        name: newOrg.name,
        description: newOrg.description,
        institution: newOrg.institution,
        contactEmail: newOrg.contact_email,
        ownerId: newOrg.owner_id,
        studiesCount: 0,
        membersCount: 1,
        createdAt: newOrg.created_at,
        updatedAt: newOrg.updated_at,
      };
    });
  }

  public async getOrganizationById(orgId: string): Promise<Organization | null> {
    if (!this.data.organizations) return null;
    const org = this.data.organizations.find((o) => o.id === orgId);
    if (!org) return null;

    const studies = this.data.groups.filter((g) => g.organization_id === org.id);
    const uniqueMembers = new Set<string>();
    studies.forEach((s) => s.members.forEach((m) => uniqueMembers.add(m.user_id)));

    return {
      id: org.id,
      name: org.name,
      description: org.description,
      institution: org.institution,
      contactEmail: org.contact_email,
      ownerId: org.owner_id,
      studiesCount: studies.length,
      membersCount: uniqueMembers.size,
      createdAt: org.created_at,
      updatedAt: org.updated_at,
    };
  }

  // --- RESEARCH GROUPS / STUDIES MANAGEMENT ---

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
      throw new UnauthorizedGroupActionError('Access denied: You are not a member of this research study.');
    }
    return this.mapGroupToPublic(group);
  }

  public async createGroup(
    userId: string,
    params: {
      name: string;
      studyTitle: string;
      studyType?: StudyType;
      subjectTerminology?: SubjectTerminology;
      targetSampleSize: number;
      description?: string;
      institution?: string;
      organizationId?: string;
      customFields?: CustomFieldDefinition[];
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

      if (!name) throw new Error('Research study / group name is required.');
      if (!studyTitle) throw new Error('Study / Thesis title is required.');
      if (isNaN(targetSampleSize) || targetSampleSize <= 0) {
        throw new Error('Please enter a valid target sample size (positive number).');
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
        organization_id: params.organizationId?.trim() || undefined,
        name,
        study_title: studyTitle,
        study_type: params.studyType || 'Clinical Pharmacy',
        subject_terminology: params.subjectTerminology || 'Patient',
        target_sample_size: targetSampleSize,
        description: params.description?.trim() || undefined,
        institution: params.institution?.trim() || undefined,
        custom_fields: params.customFields || [],
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
      studyType?: StudyType;
      subjectTerminology?: SubjectTerminology;
      targetSampleSize?: number;
      description?: string;
      institution?: string;
      organizationId?: string;
      customFields?: CustomFieldDefinition[];
    }
  ): Promise<ResearchGroup> {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();

      const member = group.members.find((m) => m.user_id === userId);
      if (!member || member.role !== 'owner') {
        throw new UnauthorizedGroupActionError('Only the study owner can edit study settings.');
      }

      if (updates.name !== undefined) {
        const trimmed = updates.name.trim();
        if (!trimmed) throw new Error('Study name cannot be empty.');
        group.name = trimmed;
      }
      if (updates.studyTitle !== undefined) {
        const trimmed = updates.studyTitle.trim();
        if (!trimmed) throw new Error('Study title cannot be empty.');
        group.study_title = trimmed;
      }
      if (updates.studyType !== undefined) {
        group.study_type = updates.studyType;
      }
      if (updates.subjectTerminology !== undefined) {
        group.subject_terminology = updates.subjectTerminology;
      }
      if (updates.targetSampleSize !== undefined) {
        const size = Number(updates.targetSampleSize);
        if (isNaN(size) || size <= 0) throw new Error('Target sample size must be a positive number.');
        group.target_sample_size = size;
      }
      if (updates.description !== undefined) {
        group.description = updates.description.trim() || undefined;
      }
      if (updates.institution !== undefined) {
        group.institution = updates.institution.trim() || undefined;
      }
      if (updates.organizationId !== undefined) {
        group.organization_id = updates.organizationId.trim() || undefined;
      }
      if (updates.customFields !== undefined) {
        group.custom_fields = updates.customFields;
      }

      group.updated_at = new Date().toISOString();
      await this.persist();

      const resolved = this.mapGroupToPublic(group);
      this.broadcast('group_updated', groupId, resolved);
      return resolved;
    });
  }

  // --- RESEARCH FILES MANAGEMENT ---

  public async getGroupFiles(groupId: string, userId: string): Promise<ResearchFile[]> {
    this.verifyUserGroupMembership(groupId, userId);
    if (!this.data.files) this.data.files = [];
    return this.data.files
      .filter((f) => f.group_id === groupId)
      .map((f) => ({
        id: f.id,
        groupId: f.group_id,
        name: f.name,
        size: f.size,
        mimeType: f.mime_type,
        category: f.category,
        uploadedBy: f.uploaded_by,
        uploadedByName: f.uploaded_by_name,
        uploadedAt: f.created_at,
        fileData: f.file_data,
      }));
  }

  public async uploadGroupFile(params: {
    groupId: string;
    userId: string;
    name: string;
    size: number;
    mimeType: string;
    category?: 'protocol' | 'approval' | 'questionnaire' | 'data' | 'other';
    fileData?: string;
  }): Promise<ResearchFile> {
    return this.mutex.runExclusive(async () => {
      this.verifyUserGroupMembership(params.groupId, params.userId);
      const user = this.data.profiles.find((p) => p.id === params.userId);

      if (!this.data.files) this.data.files = [];
      const newFile: StoredFile = {
        id: crypto.randomUUID(),
        group_id: params.groupId,
        name: params.name.trim(),
        size: params.size,
        mime_type: params.mimeType,
        category: params.category || 'other',
        uploaded_by: params.userId,
        uploaded_by_name: user ? user.display_name : 'Researcher',
        file_data: params.fileData,
        created_at: new Date().toISOString(),
      };

      this.data.files.push(newFile);
      await this.persist();

      return {
        id: newFile.id,
        groupId: newFile.group_id,
        name: newFile.name,
        size: newFile.size,
        mimeType: newFile.mime_type,
        category: newFile.category,
        uploadedBy: newFile.uploaded_by,
        uploadedByName: newFile.uploaded_by_name,
        uploadedAt: newFile.created_at,
        fileData: newFile.file_data,
      };
    });
  }

  public async deleteGroupFile(
    groupId: string,
    fileId: string,
    userId: string
  ): Promise<{ success: boolean; fileName: string }> {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(groupId, userId);
      if (!this.data.files) this.data.files = [];

      const idx = this.data.files.findIndex((f) => f.id === fileId && f.group_id === groupId);
      if (idx === -1) {
        throw new Error('File not found in this research group.');
      }

      const target = this.data.files[idx];
      const member = group.members.find((m) => m.user_id === userId);
      const isOwner = member?.role === 'owner';
      const isUploader = target.uploaded_by === userId;

      if (!isOwner && !isUploader) {
        throw new UnauthorizedGroupActionError('Only the study owner or file uploader can delete files.');
      }

      const [removed] = this.data.files.splice(idx, 1);
      await this.persist();

      // TEST 18: File deletion must NOT delete the associated research cases
      return { success: true, fileName: removed.name };
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
        throw new UnauthorizedGroupActionError('Only the study owner can invite new researchers.');
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
      throw new GroupNotFoundError('The research study associated with this invite no longer exists.');
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
        throw new UnauthorizedGroupActionError('Only the study owner can remove members.');
      }

      if (requesterUserId === targetUserId) {
        throw new Error('The study owner cannot remove themselves from the study.');
      }

      const memberIndex = group.members.findIndex((m) => m.user_id === targetUserId);
      if (memberIndex === -1) {
        throw new Error('Member not found in this study.');
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

  public async deleteGroup(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean; groupName: string }> {
    return this.mutex.runExclusive(async () => {
      const idx = this.data.groups.findIndex((g) => g.id === groupId);
      if (idx === -1) throw new GroupNotFoundError();

      const group = this.data.groups[idx];
      const member = group.members.find((m) => m.user_id === userId);
      const isOwner = member?.role === 'owner' || group.owner_id === userId;
      const userProfile = await this.findProfileById(userId);
      const isAppAdmin = this.isAppOwner(userProfile?.email || '');

      if (!isOwner && !isAppAdmin) {
        throw new UnauthorizedGroupActionError('Only the research study owner can delete this study.');
      }

      const [removed] = this.data.groups.splice(idx, 1);

      // Purge only this group's cases, invitations, and files
      this.data.cases = this.data.cases.filter((c) => c.group_id !== groupId);
      this.data.invitations = this.data.invitations.filter((i) => i.group_id !== groupId);
      if (this.data.files) {
        this.data.files = this.data.files.filter((f) => f.group_id !== groupId);
      }

      await this.persist();

      await this.recordAuditLog({
        action: 'GROUP_DELETED',
        entityType: 'group',
        entityId: removed.id,
        entityName: removed.name,
        details: `Study "${removed.name}" deleted by ${userProfile?.display_name || userId}.`,
        performedBy: userProfile?.display_name || userId,
        performedByEmail: userProfile?.email || '',
      });

      this.broadcast('group_deleted', groupId, { groupId });

      return { success: true, groupName: removed.name };
    });
  }

  public async getGroupBackupPackage(
    groupId: string,
    userId: string
  ): Promise<{
    manifest: BackupManifest;
    group: StoredGroup;
    cases: StoredCase[];
    files: StoredFile[];
    members: StoredGroupMember[];
  }> {
    const group = this.verifyUserGroupMembership(groupId, userId);
    const userProfile = await this.findProfileById(userId);
    const cases = this.data.cases.filter((c) => c.group_id === groupId);
    const files = (this.data.files || []).filter((f) => f.group_id === groupId);

    const manifest: BackupManifest = {
      formatVersion: '1.0',
      appVersion: '2.0.0',
      createdAt: new Date().toISOString(),
      createdByEmail: userProfile?.email || '',
      createdByName: userProfile?.display_name || 'Study Investigator',
      scope: 'study',
      studyId: group.id,
      studyName: group.name,
      studyTitle: group.study_title,
      targetSampleSize: group.target_sample_size,
      caseCount: cases.length,
      fileCount: files.length,
    };

    return {
      manifest,
      group,
      cases,
      files,
      members: group.members,
    };
  }

  public async restoreGroupBackup(
    userId: string,
    backupData: {
      manifest?: BackupManifest;
      group?: Partial<StoredGroup>;
      cases?: Partial<StoredCase>[];
      files?: Partial<StoredFile>[];
      mode?: 'new' | 'merge' | 'replace';
      targetGroupId?: string;
    }
  ): Promise<{ success: boolean; group: ResearchGroup; casesRestored: number; filesRestored: number }> {
    return this.mutex.runExclusive(async () => {
      const userProfile = await this.findProfileById(userId);
      if (!userProfile) throw new Error('User not found.');

      const now = new Date().toISOString();
      const mode = backupData.mode || 'new';

      let targetGroup: StoredGroup;
      let casesRestored = 0;
      let filesRestored = 0;

      if (mode === 'new' || !backupData.targetGroupId) {
        const newGroupId = crypto.randomUUID();
        const baseName = backupData.group?.name || backupData.manifest?.studyName || 'Restored Study';
        const uniqueName = mode === 'new' ? `${baseName} (Restored)` : baseName;

        targetGroup = {
          id: newGroupId,
          organization_id: backupData.group?.organization_id,
          name: uniqueName,
          study_title: backupData.group?.study_title || backupData.manifest?.studyTitle || 'Restored Study Title',
          study_type: backupData.group?.study_type || 'Clinical Pharmacy',
          subject_terminology: backupData.group?.subject_terminology || 'Patient',
          target_sample_size: backupData.group?.target_sample_size || backupData.manifest?.targetSampleSize || 100,
          description: backupData.group?.description || 'Restored from full backup archive.',
          institution: backupData.group?.institution,
          owner_id: userId,
          status: 'active',
          custom_fields: backupData.group?.custom_fields || [],
          members: [
            {
              user_id: userId,
              email: userProfile.email,
              display_name: userProfile.display_name,
              role: 'owner',
              joined_at: now,
            },
          ],
          created_at: now,
          updated_at: now,
        };

        this.data.groups.push(targetGroup);

        if (Array.isArray(backupData.cases)) {
          for (const c of backupData.cases) {
            if (!c.patient_id) continue;
            const newCase: StoredCase = {
              id: crypto.randomUUID(),
              group_id: newGroupId,
              patient_id: c.patient_id,
              normalized_patient_id: c.normalized_patient_id || normalizePatientId(c.patient_id),
              assigned_to: userId,
              status: c.status || 'In Progress',
              patient_name: c.patient_name,
              age: c.age,
              gender: c.gender,
              department: c.department,
              location: c.location,
              diagnosis: c.diagnosis,
              drug_names: c.drug_names,
              admission_date: c.admission_date,
              discharge_date: c.discharge_date,
              length_of_stay: c.length_of_stay !== undefined ? c.length_of_stay : computeLengthOfStay(c.admission_date, c.discharge_date),
              notes: c.notes,
              custom_values: c.custom_values,
              registered_at: c.registered_at || now,
              updated_at: c.updated_at || now,
              last_modified_by: userId,
              version: 1,
            };
            this.data.cases.push(newCase);
            casesRestored++;
          }
        }

        if (Array.isArray(backupData.files)) {
          if (!this.data.files) this.data.files = [];
          for (const f of backupData.files) {
            if (!f.name) continue;
            const newFile: StoredFile = {
              id: crypto.randomUUID(),
              group_id: newGroupId,
              name: f.name,
              size: f.size || 0,
              mime_type: f.mime_type || 'application/octet-stream',
              category: f.category || 'other',
              uploaded_by: userId,
              uploaded_by_name: userProfile.display_name,
              file_data: f.file_data,
              created_at: f.created_at || now,
            };
            this.data.files.push(newFile);
            filesRestored++;
          }
        }
      } else {
        const existingGroup = this.verifyUserGroupMembership(backupData.targetGroupId, userId);
        targetGroup = existingGroup;

        if (mode === 'replace') {
          this.data.cases = this.data.cases.filter((c) => c.group_id !== targetGroup.id);
          if (this.data.files) {
            this.data.files = this.data.files.filter((f) => f.group_id !== targetGroup.id);
          }
        }

        if (Array.isArray(backupData.cases)) {
          for (const c of backupData.cases) {
            if (!c.patient_id) continue;
            const norm = c.normalized_patient_id || normalizePatientId(c.patient_id);
            const exists = this.data.cases.some((existing) => existing.group_id === targetGroup.id && existing.normalized_patient_id === norm);
            if (exists && mode === 'merge') {
              continue;
            }

            const newCase: StoredCase = {
              id: crypto.randomUUID(),
              group_id: targetGroup.id,
              patient_id: c.patient_id,
              normalized_patient_id: norm,
              assigned_to: userId,
              status: c.status || 'In Progress',
              patient_name: c.patient_name,
              age: c.age,
              gender: c.gender,
              department: c.department,
              location: c.location,
              diagnosis: c.diagnosis,
              drug_names: c.drug_names,
              admission_date: c.admission_date,
              discharge_date: c.discharge_date,
              length_of_stay: c.length_of_stay !== undefined ? c.length_of_stay : computeLengthOfStay(c.admission_date, c.discharge_date),
              notes: c.notes,
              custom_values: c.custom_values,
              registered_at: c.registered_at || now,
              updated_at: c.updated_at || now,
              last_modified_by: userId,
              version: 1,
            };
            this.data.cases.push(newCase);
            casesRestored++;
          }
        }

        if (Array.isArray(backupData.files)) {
          if (!this.data.files) this.data.files = [];
          for (const f of backupData.files) {
            if (!f.name) continue;
            const newFile: StoredFile = {
              id: crypto.randomUUID(),
              group_id: targetGroup.id,
              name: f.name,
              size: f.size || 0,
              mime_type: f.mime_type || 'application/octet-stream',
              category: f.category || 'other',
              uploaded_by: userId,
              uploaded_by_name: userProfile.display_name,
              file_data: f.file_data,
              created_at: f.created_at || now,
            };
            this.data.files.push(newFile);
            filesRestored++;
          }
        }
      }

      await this.persist();

      await this.recordAuditLog({
        action: 'BACKUP_RESTORED',
        entityType: 'group',
        entityId: targetGroup.id,
        entityName: targetGroup.name,
        details: `Study "${targetGroup.name}" restored (mode: ${mode}). Cases: ${casesRestored}, Files: ${filesRestored}.`,
        performedBy: userProfile.display_name,
        performedByEmail: userProfile.email,
      });

      return {
        success: true,
        group: this.mapGroupToPublic(targetGroup),
        casesRestored,
        filesRestored,
      };
    });
  }

  // --- GROUP-SCOPED RESEARCH RECORDS OPERATIONS ---

  private verifyUserGroupMembership(groupId: string, userId: string): StoredGroup {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (!group) throw new GroupNotFoundError();
    const isMember = group.members.some((m) => m.user_id === userId);
    if (!isMember) {
      throw new UnauthorizedGroupActionError('Access denied: You are not a member of this research study.');
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
    age?: number;
    gender?: string;
    department?: string;
    location?: string;
    diagnosis?: string;
    drugNames?: string;
    admissionDate?: string;
    dischargeDate?: string;
    notes?: string;
    customValues?: Record<string, any>;
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
          `Record ID "${originalPatientId}" is already registered in ${group.name}.`,
          this.resolveCaseRecord(existing)
        );
      }

      const now = new Date().toISOString();
      const length_of_stay = computeLengthOfStay(params.admissionDate, params.dischargeDate);
      const newCase: StoredCase = {
        id: crypto.randomUUID(),
        group_id: params.groupId,
        patient_id: originalPatientId,
        normalized_patient_id: normalized,
        assigned_to: params.assignedToUserId,
        status: 'In Progress',
        patient_name: params.patientName?.trim() || undefined,
        age: typeof params.age === 'number' && !isNaN(params.age) ? params.age : undefined,
        gender: params.gender?.trim() || undefined,
        department: params.department?.trim() || undefined,
        location: params.location?.trim() || undefined,
        diagnosis: params.diagnosis?.trim() || undefined,
        drug_names: params.drugNames?.trim() || undefined,
        admission_date: params.admissionDate?.trim() || undefined,
        discharge_date: params.dischargeDate?.trim() || undefined,
        length_of_stay,
        notes: params.notes?.trim() || undefined,
        custom_values: params.customValues,
        registered_at: now,
        updated_at: now,
        last_modified_by: params.assignedToUserId,
        version: 1,
      };

      this.data.cases.push(newCase);

      const assignedMember = group.members.find((m) => m.user_id === params.assignedToUserId);
      this.recordCaseHistory({
        groupId: params.groupId,
        action: 'CASE_REGISTERED',
        caseId: newCase.id,
        patientId: newCase.patient_id,
        patientName: newCase.patient_name,
        details: `Case "${newCase.patient_id}" registered by ${assignedMember?.display_name || params.assignedToUserId}.`,
        performedBy: assignedMember?.display_name || params.assignedToUserId,
        performedByEmail: assignedMember?.email || '',
      });

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
        throw new Error('Record not found in this research study.');
      }

      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === 'owner';
      const isAssigned = target.assigned_to === params.userId;

      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          'Permission denied. You can only update the status of records assigned to you.'
        );
      }

      const oldStatus = target.status;
      target.status = params.newStatus;
      target.updated_at = new Date().toISOString();

      this.recordCaseHistory({
        groupId: params.groupId,
        action: 'CASE_STATUS_UPDATED',
        caseId: target.id,
        patientId: target.patient_id,
        patientName: target.patient_name,
        details: `Status updated from "${oldStatus}" to "${params.newStatus}".`,
        performedBy: userMember?.display_name || params.userId,
        performedByEmail: userMember?.email || '',
      });

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
    age?: number;
    gender?: string;
    department?: string;
    location?: string;
    diagnosis?: string;
    drugNames?: string;
    admissionDate?: string;
    dischargeDate?: string;
    notes?: string;
    customValues?: Record<string, any>;
    status?: CaseStatus;
  }): Promise<CaseRecord> {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.userId);

      const target = this.data.cases.find(
        (c) => c.id === params.caseId && c.group_id === params.groupId
      );
      if (!target) {
        throw new Error('Record not found in this research study.');
      }

      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === 'owner';
      const isAssigned = target.assigned_to === params.userId;

      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          'Permission denied. You can only modify details for records assigned to you.'
        );
      }

      if (params.patientName !== undefined) {
        target.patient_name = params.patientName.trim() || undefined;
      }
      if (params.age !== undefined) {
        target.age = typeof params.age === 'number' && !isNaN(params.age) ? params.age : undefined;
      }
      if (params.gender !== undefined) {
        target.gender = params.gender.trim() || undefined;
      }
      if (params.department !== undefined) {
        target.department = params.department.trim() || undefined;
      }
      if (params.location !== undefined) {
        target.location = params.location.trim() || undefined;
      }
      if (params.diagnosis !== undefined) {
        target.diagnosis = params.diagnosis.trim() || undefined;
      }
      if (params.drugNames !== undefined) {
        target.drug_names = params.drugNames.trim() || undefined;
      }
      if (params.admissionDate !== undefined) {
        target.admission_date = params.admissionDate.trim() || undefined;
      }
      if (params.dischargeDate !== undefined) {
        target.discharge_date = params.dischargeDate.trim() || undefined;
      }
      if (params.admissionDate !== undefined || params.dischargeDate !== undefined) {
        target.length_of_stay = computeLengthOfStay(target.admission_date, target.discharge_date);
      }
      if (params.notes !== undefined) {
        target.notes = params.notes.trim() || undefined;
      }
      if (params.customValues !== undefined) {
        target.custom_values = { ...(target.custom_values || {}), ...params.customValues };
      }
      if (params.status !== undefined) {
        const validStatuses: CaseStatus[] = ['In Progress', 'Completed', 'Excluded'];
        if (validStatuses.includes(params.status)) {
          target.status = params.status;
        }
      }

      target.updated_at = new Date().toISOString();
      target.last_modified_by = params.userId;
      target.version = (target.version || 1) + 1;

      this.recordCaseHistory({
        groupId: params.groupId,
        action: 'CASE_UPDATED',
        caseId: target.id,
        patientId: target.patient_id,
        patientName: target.patient_name,
        details: `Details updated (v${target.version}).`,
        performedBy: userMember?.display_name || params.userId,
        performedByEmail: userMember?.email || '',
      });

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
        throw new Error('Record not found in this research study.');
      }

      const target = this.data.cases[index];
      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === 'owner';
      const isAssigned = target.assigned_to === params.userId;

      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          'Permission denied. You can only remove records registered by you.'
        );
      }

      const [removed] = this.data.cases.splice(index, 1);

      this.recordCaseHistory({
        groupId: params.groupId,
        action: 'CASE_DELETED',
        caseId: removed.id,
        patientId: removed.patient_id,
        patientName: removed.patient_name,
        details: `Case "${removed.patient_id}" permanently deleted from study.`,
        performedBy: userMember?.display_name || params.userId,
        performedByEmail: userMember?.email || '',
      });

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

    const targetSampleSize = group.target_sample_size || 100;
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
    const totalOrganizations = this.data.organizations?.length || 0;
    const totalGroups = this.data.groups.length;
    const activeGroups = this.data.groups.filter((g) => (g.status || 'active') === 'active').length;
    const totalMemberships = this.data.groups.reduce((acc, g) => acc + g.members.length, 0);
    const totalCases = this.data.cases.length;
    const totalFiles = this.data.files?.length || 0;

    return {
      totalUsers,
      totalOrganizations,
      totalGroups,
      activeGroups,
      totalMemberships,
      totalCases,
      totalFiles,
    };
  }

  public async getAppOwnerOrganizations(): Promise<Organization[]> {
    if (!this.data.organizations) this.data.organizations = [];
    return this.data.organizations.map((o) => {
      const studies = this.data.groups.filter((g) => g.organization_id === o.id);
      const uniqueMembers = new Set<string>();
      studies.forEach((s) => s.members.forEach((m) => uniqueMembers.add(m.user_id)));
      return {
        id: o.id,
        name: o.name,
        description: o.description,
        institution: o.institution,
        contactEmail: o.contact_email,
        ownerId: o.owner_id,
        studiesCount: studies.length,
        membersCount: uniqueMembers.size,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      };
    });
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
      let orgName: string | undefined;
      if (g.organization_id && this.data.organizations) {
        const org = this.data.organizations.find((o) => o.id === g.organization_id);
        if (org) orgName = org.name;
      }

      return {
        id: g.id,
        organizationId: g.organization_id,
        organizationName: orgName,
        name: g.name,
        studyTitle: g.study_title,
        studyType: g.study_type,
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
        details: `Research study "${group.name}" status changed to ${newStatus}.`,
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
        studyType: group.study_type,
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

      // Purge group cases, invitations, and files
      const caseCountBefore = this.data.cases.length;
      this.data.cases = this.data.cases.filter((c) => c.group_id !== groupId);
      const casesPurged = caseCountBefore - this.data.cases.length;

      this.data.invitations = this.data.invitations.filter((i) => i.group_id !== groupId);
      if (this.data.files) {
        this.data.files = this.data.files.filter((f) => f.group_id !== groupId);
      }

      await this.persist();

      await this.recordAuditLog({
        action: 'GROUP_DELETED',
        entityType: 'group',
        entityId: removed.id,
        entityName: removed.name,
        details: `Research study "${removed.name}" deleted (${casesPurged} case records purged).`,
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

  // --- CASE HISTORY & AUDIT TRAIL FOR NORMAL USERS ---

  private recordCaseHistory(entry: {
    groupId: string;
    action: string;
    caseId?: string;
    patientId: string;
    patientName?: string;
    details: string;
    performedBy: string;
    performedByEmail: string;
  }): void {
    if (!this.data.case_history) this.data.case_history = [];
    this.data.case_history.push({
      id: crypto.randomUUID(),
      group_id: entry.groupId,
      action: entry.action,
      case_id: entry.caseId,
      patient_id: entry.patientId,
      patient_name: entry.patientName,
      details: entry.details,
      performed_by: entry.performedBy,
      performed_by_email: entry.performedByEmail,
      created_at: new Date().toISOString(),
    });
  }

  public async getGroupCaseHistory(
    groupId: string,
    userId: string
  ): Promise<any[]> {
    this.verifyUserGroupMembership(groupId, userId);
    const list = (this.data.case_history || []).filter((h) => h.group_id === groupId);
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list.map((h) => ({
      id: h.id,
      action: h.action,
      caseId: h.case_id,
      patientId: h.patient_id,
      patientName: h.patient_name,
      details: h.details,
      performedBy: h.performed_by,
      performedByEmail: h.performed_by_email,
      timestamp: h.created_at,
    }));
  }

  // --- CONTACT MESSAGES & SUPPORT ---

  public async saveContactMessage(params: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<StoredContactMessage> {
    return this.mutex.runExclusive(async () => {
      if (!this.data.contact_messages) this.data.contact_messages = [];
      const entry: StoredContactMessage = {
        id: crypto.randomUUID(),
        name: params.name.trim(),
        email: params.email.trim().toLowerCase(),
        subject: params.subject.trim(),
        message: params.message.trim(),
        status: 'new',
        created_at: new Date().toISOString(),
      };
      this.data.contact_messages.push(entry);
      await this.persist();
      return entry;
    });
  }

  public async getContactMessages(): Promise<StoredContactMessage[]> {
    const list = this.data.contact_messages || [];
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public async updateContactMessageStatus(
    id: string,
    status: 'new' | 'reviewed' | 'resolved'
  ): Promise<StoredContactMessage> {
    return this.mutex.runExclusive(async () => {
      if (!this.data.contact_messages) this.data.contact_messages = [];
      const item = this.data.contact_messages.find((m) => m.id === id);
      if (!item) throw new Error('Contact message not found.');
      item.status = status;
      await this.persist();
      return item;
    });
  }
}

export const db = new RelationalDatabase();
