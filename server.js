// server.ts
import express from "express";
import path2 from "node:path";
import fs2 from "node:fs";
import crypto3 from "node:crypto";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

// src/server/db.ts
import fs from "node:fs";
import path from "node:path";
import crypto2 from "node:crypto";
import bcrypt from "bcryptjs";

// src/utils/normalizePatientId.ts
function normalizePatientId(rawInput) {
  if (!rawInput) return "";
  return rawInput.trim().toUpperCase().replace(/[\s\-_]+/g, "");
}
function validatePatientId(rawInput) {
  if (!rawInput || typeof rawInput !== "string") {
    return {
      isValid: false,
      normalizedId: "",
      errorMessage: "Patient ID cannot be empty."
    };
  }
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      normalizedId: "",
      errorMessage: "Patient ID cannot be empty or only whitespace."
    };
  }
  if (trimmed.length > 64) {
    return {
      isValid: false,
      normalizedId: "",
      errorMessage: "Patient ID exceeds maximum allowed length of 64 characters."
    };
  }
  const validPattern = /^[A-Za-z0-9\-_./ ]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      isValid: false,
      normalizedId: "",
      errorMessage: "Patient ID contains invalid characters. Use letters, numbers, hyphens, slashes, or dots only."
    };
  }
  const normalized = normalizePatientId(trimmed);
  return {
    isValid: true,
    normalizedId: normalized
  };
}

// src/server/passwordSecurity.ts
import crypto from "node:crypto";

// src/utils/passwordPolicy.ts
var MIN_PASSWORD_LENGTH = 10;
var MAX_PASSWORD_LENGTH = 128;
var COMMON_PASSWORDS = [
  "12345678",
  "123456789",
  "1234567890",
  "123456789012",
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "password12345",
  "qwertyuiop",
  "asdfghjkl;",
  "admin12345",
  "admin123456",
  "administrator",
  "welcome123",
  "welcome1234",
  "welcome12345",
  "iloveyou123",
  "passphrase1",
  "thesis1234",
  "thesis2024",
  "thesis2025",
  "thesis2026",
  "hospital123",
  "hospital1234",
  "doctor12345",
  "medicine123",
  "clinical123",
  "research123",
  "sunshine123",
  "princess123",
  "football123",
  "monkey12345",
  "shadow12345",
  "master12345",
  "dragon12345",
  "superman123",
  "trustno1111",
  "charlie1234",
  "letmein1234",
  "0000000000",
  "1111111111",
  "2222222222",
  "3333333333",
  "4444444444",
  "5555555555",
  "6666666666",
  "7777777777",
  "8888888888",
  "9999999999"
];
var COMMON_SET = new Set(COMMON_PASSWORDS.map((p) => p.toLowerCase()));
function isSequential(str) {
  if (str.length < 6) return false;
  let ascending = 0;
  let descending = 0;
  for (let i = 1; i < str.length; i++) {
    const diff = str.charCodeAt(i) - str.charCodeAt(i - 1);
    if (diff === 1) ascending++;
    else ascending = 0;
    if (diff === -1) descending++;
    else descending = 0;
    if (ascending >= 5 || descending >= 5) return true;
  }
  return false;
}
function validatePasswordBasic(password) {
  if (typeof password !== "string") {
    return {
      isValid: false,
      errorCode: "INVALID_TYPE",
      message: "Password must be a valid string."
    };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      errorCode: "TOO_SHORT",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters. (Password must be at least 6 characters is no longer permitted; minimum ${MIN_PASSWORD_LENGTH} characters required).`
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      errorCode: "TOO_LONG",
      message: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`
    };
  }
  const normalized = password.toLowerCase();
  if (COMMON_SET.has(normalized)) {
    return {
      isValid: false,
      errorCode: "WEAK_PASSWORD",
      message: "Choose a stronger password that is not commonly used or known to be compromised."
    };
  }
  if (/^(.)\1+$/.test(password)) {
    return {
      isValid: false,
      errorCode: "WEAK_PASSWORD",
      message: "Choose a stronger password that is not commonly used or known to be compromised."
    };
  }
  if (isSequential(normalized)) {
    return {
      isValid: false,
      errorCode: "WEAK_PASSWORD",
      message: "Choose a stronger password that is not commonly used or known to be compromised."
    };
  }
  return { isValid: true };
}

// src/server/passwordSecurity.ts
async function checkHaveIBeenPwned(password) {
  try {
    const hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ThesisTracker-Security/1.0",
        "Add-Padding": "true"
      }
    });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const body = await res.text();
    const lines = body.split("\r\n");
    for (const line of lines) {
      const [entrySuffix, countStr] = line.split(":");
      if (entrySuffix && entrySuffix.trim().toUpperCase() === suffix) {
        const count = parseInt(countStr || "0", 10);
        return count >= 500;
      }
    }
    return false;
  } catch {
    return false;
  }
}
async function validateServerPassword(password) {
  const basic = validatePasswordBasic(password);
  if (!basic.isValid) return basic;
  const isBreached = await checkHaveIBeenPwned(password);
  if (isBreached) {
    return {
      isValid: false,
      errorCode: "WEAK_PASSWORD",
      message: "Choose a stronger password that is not commonly used or known to be compromised.",
      isBreached: true
    };
  }
  return { isValid: true };
}

// src/server/db.ts
var PRIMARY_APP_OWNER = "avishah.as118@gmail.com";
function hashInvitationToken(token) {
  return crypto2.createHash("sha256").update(token.trim()).digest("hex");
}
var ValidationError = class extends Error {
  constructor(message, code = "VALIDATION_ERROR") {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
};
var WeakPasswordError = class extends ValidationError {
  constructor(message = "Choose a stronger password that is not commonly used or known to be compromised.") {
    super(message, "WEAK_PASSWORD");
    this.name = "WeakPasswordError";
  }
};
var DuplicateCaseError = class extends Error {
  constructor(message, existingCase) {
    super(message);
    this.name = "DuplicateCaseError";
    this.existingCase = existingCase;
  }
};
var UnauthorizedCaseActionError = class extends Error {
  constructor(message = "Unauthorized: You can only modify cases assigned to you.") {
    super(message);
    this.name = "UnauthorizedCaseActionError";
  }
};
var UnauthorizedGroupActionError = class extends Error {
  constructor(message = "Unauthorized: You do not have permission for this research study/group.") {
    super(message);
    this.name = "UnauthorizedGroupActionError";
  }
};
var GroupNotFoundError = class extends Error {
  constructor(message = "Research study/group not found.") {
    super(message);
    this.name = "GroupNotFoundError";
  }
};
var AccountSuspendedError = class extends Error {
  constructor(message = "Your account has been deactivated. Please contact support.") {
    super(message);
    this.name = "AccountSuspendedError";
  }
};
var AsyncMutex = class {
  constructor() {
    this.queue = Promise.resolve();
  }
  async runExclusive(callback) {
    const result = this.queue.then(() => callback());
    this.queue = result.then(() => {
    }, () => {
    });
    return result;
  }
};
var DEFAULT_LEGAL_DOCS = [
  {
    id: "privacy-policy",
    title: "Privacy & Data Protection Policy",
    category: "privacy",
    last_updated: "2026-10-06T00:00:00.000Z",
    content: `Thesis Case Tracker ("Platform") is committed to safeguarding the privacy and confidentiality of clinical research data, healthcare investigators, and study participants. This Privacy Policy governs all data processing and protection practices within the application.

1. Information We Collect
We collect institutional investigator profile information (name, professional email address) and study administrative parameters (study titles, target enrollment sizes, research group membership). Patient records entered for enrollment coordination and duplicate prevention are restricted to study-specific case identifiers, anonymized clinical notes, and treatment regimen metadata.

2. Study-Level Data Isolation & Strict Access Boundary
All patient records, duplicate detection indices, and case progress updates are strictly partitioned within each research group workspace. Data entered by researchers in one study group is strictly inaccessible to other study teams. System administrators do not access, browse, or disclose confidential patient study records.

3. Data Minimization & Privacy Protection
Researchers are instructed to enter only the minimum data necessary for duplicate patient prevention and study coordination. Direct patient contact details (such as home addresses, phone numbers, or national identification numbers) must never be entered into the platform.

4. Infrastructure Security & Confidentiality
All network transmissions are protected using TLS encryption. Data is stored in secure encrypted environments with role-based access controls and audit logging. Data is never shared with third-party advertisers, commercial data brokers, or unapproved external services.`
  },
  {
    id: "terms-of-use",
    title: "Terms of Academic & Clinical Use",
    category: "terms",
    last_updated: "2026-10-06T00:00:00.000Z",
    content: `By accessing or using Thesis Case Tracker, you agree to comply with these Terms of Academic & Clinical Use.

1. Authorized Clinical & Academic Use
This platform is intended exclusively for authorized hospital researchers, postgraduate medical students, academic investigators, and thesis research teams. Access is granted for lawful, ethics-approved clinical data collection and study coordination.

2. Ethics Approval & Institutional Oversight
Investigators and their affiliated academic institutions remain solely responsible for securing and maintaining all mandatory approvals from their Institutional Review Board (IRB) or Independent Ethics Committee (IEC) prior to entering research study cases.

3. Credential Security & Account Integrity
Users are responsible for safeguarding their login credentials and session tokens. Sharing accounts or attempting unauthorized access to research groups to which you have not been invited is strictly prohibited.

4. Research Integrity & Record Accuracy
Investigators must ensure the integrity and accuracy of entered study records, including verification of assigned patient codes and diagnosis details.`
  },
  {
    id: "research-responsibility",
    title: "Research Data Integrity & De-Identification Guidelines",
    category: "responsibility",
    last_updated: "2026-10-06T00:00:00.000Z",
    content: `Notice Regarding Research Data Integrity and Institutional Responsibility:

1. De-Identification Recommendations
In accordance with international healthcare research standards, researchers are strongly advised to utilize pseudo-anonymized study codes, hospital research accession numbers, or masked identifiers rather than direct patient names or sensitive personal details.

2. Duplicate Prevention Protocol
The primary function of the platform is to alert research collaborators when a patient has already been enrolled in the study. In the event of a duplicate alert, researchers must verify with their study team before proceeding to prevent skewed sample sizes or double-counting.

3. Principal Investigator & Institutional Governance
The platform serves as an operational coordination tool for case assignment and duplicate prevention. Ultimate legal, clinical, and ethical responsibility for trial conduct, patient safety, and regulatory compliance resides with the Principal Investigator and the sponsoring healthcare institution.`
  },
  {
    id: "storage-drive-notice",
    title: "Data Storage, Security & Retention Policy",
    category: "storage",
    last_updated: "2026-10-06T00:00:00.000Z",
    content: `Data Storage, Security and Retention Disclosures:

1. Secure Storage
All research study data, case assignment records, and audit logs are stored in secure, encrypted cloud repositories with automated integrity verification and backup redundancy.

2. Data Export & Institutional Archiving
Authorized study team members may export their research group's full case ledger in standard comma-separated format (CSV) at any time. Exported records include enrollment timestamps, assigned researchers, and case status for local institutional statistical analysis and archival compliance.

3. Study Lifecycle & Retention
Study records remain active and queryable for the duration of the research group's data collection phase. Completed or published studies may be formally archived by the group owner.`
  },
  {
    id: "account-deletion-info",
    title: "Data Deletion, Erasure & Group Closure Policy",
    category: "deletion",
    last_updated: "2026-10-06T00:00:00.000Z",
    content: `Procedures for Record Correction, Study Group Closure, and Account Erasure:

1. Case Record Removal & Correction
Researchers can immediately delete an incorrectly entered patient record from their study workspace. Deletion instantly updates enrollment counts, removes the patient ID from duplicate prevention indices, and records an administrative audit entry.

2. Study Group Deletion & Closure
A research group owner or authorized administrator may formally delete or archive a study group upon thesis defense or project conclusion. Deleting a study permanently purges all active case records, pending invitations, and membership associations for that group.

3. Account Deactivation & Profile Erasure
Users may request complete account erasure and revocation of credentials. Upon deactivation, login access is immediately revoked, and profile associations are anonymized in accordance with institutional study retention guidelines.`
  },
  {
    id: "disclaimer",
    title: "Clinical & Regulatory Disclaimer",
    category: "disclaimer",
    last_updated: "2026-10-06T00:00:00.000Z",
    content: `Clinical, Diagnostic & Legal Disclaimer:

1. Academic & Workflow Coordination Purpose
Thesis Case Tracker is an academic research workflow coordination and duplicate prevention tool designed to assist hospital thesis teams in collaborative case management. It is NOT a medical device, diagnostic tool, clinical decision support system, or hospital Electronic Health Record (EHR) replacement.

2. No Medical Advice or Diagnostic Reliance
The platform does not provide medical diagnoses, treatment recommendations, or prescription validation. Healthcare decisions regarding patient care must always be made by qualified medical practitioners based on direct clinical evaluation and primary hospital health records.

3. Regulatory Compliance
No representation of universal regulatory certification (such as HIPAA, GDPR, or DPDP) is made without specific institutional deployment agreements. Investigators and healthcare institutions must verify that their use of this software complies with all applicable local, regional, and national laws governing human subject research and health data protection.`
  }
];
var RelationalDatabase = class {
  constructor(storageDir) {
    this.mutex = new AsyncMutex();
    this.changeListeners = [];
    // --- SESSION TOKEN REVOCATION (SEC-005) ---
    this.revokedTokens = /* @__PURE__ */ new Set();
    const dir = storageDir || path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "thesis_tracker_db.json");
    this.data = {
      version: 3,
      profiles: [],
      organizations: [],
      groups: [],
      invitations: [],
      cases: [],
      files: [],
      audit_logs: [],
      app_settings: {
        authorized_app_owners: [PRIMARY_APP_OWNER],
        maintenance_mode: false,
        allow_registration: true,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      legal_docs: DEFAULT_LEGAL_DOCS
    };
    this.loadFromDisk();
  }
  loadFromDisk() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf-8");
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
          app_settings: parsed.app_settings || {
            authorized_app_owners: [PRIMARY_APP_OWNER],
            maintenance_mode: false,
            allow_registration: true,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          },
          legal_docs: Array.isArray(parsed.legal_docs) && parsed.legal_docs.length > 0 ? parsed.legal_docs : DEFAULT_LEGAL_DOCS
        };
        const bootstrapOwners = [PRIMARY_APP_OWNER, "nikhil.work119@gmail.com"];
        for (const bo of bootstrapOwners) {
          if (!this.data.app_settings.authorized_app_owners.map((e) => e.toLowerCase()).includes(bo.toLowerCase())) {
            this.data.app_settings.authorized_app_owners.push(bo);
          }
        }
        for (const inv of this.data.invitations) {
          if (!inv.token_hash && inv.code) {
            inv.token_hash = hashInvitationToken(inv.code.trim().toUpperCase());
          }
        }
        if (this.data.groups.length === 0 && (this.data.profiles.length > 0 || this.data.cases.length > 0)) {
          const ownerProfile = this.data.profiles[0];
          const initialGroupId = "general-thesis-group";
          const now = (/* @__PURE__ */ new Date()).toISOString();
          const initialMembers = this.data.profiles.map((p, idx) => ({
            user_id: p.id,
            email: p.email,
            display_name: p.display_name,
            role: idx === 0 ? "owner" : "researcher",
            joined_at: p.created_at || now
          }));
          const migratedGroup = {
            id: initialGroupId,
            name: "Clinical Research Study Team",
            study_title: "Clinical Research & Patient Case Coordination Study",
            study_type: "Clinical Pharmacy",
            subject_terminology: "Patient",
            target_sample_size: 150,
            description: "Collaborative academic clinical thesis study and patient case tracker.",
            institution: "Hospital Department of Clinical Research",
            owner_id: ownerProfile ? ownerProfile.id : "default-owner",
            status: "active",
            members: initialMembers,
            created_at: now,
            updated_at: now
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
        console.error("Failed to parse database file, initializing fresh state:", err);
      }
    } else {
      this.saveToDiskSync();
    }
  }
  saveToDiskSync() {
    const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf-8");
    fs.renameSync(tmpPath, this.filePath);
  }
  async persist() {
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(this.data, null, 2), "utf-8");
    await fs.promises.rename(tmpPath, this.filePath);
  }
  subscribe(listener) {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }
  getSubscriberCount() {
    return this.changeListeners.length;
  }
  revokeSessionToken(token) {
    if (token) {
      this.revokedTokens.add(token);
    }
  }
  isTokenRevoked(token) {
    if (!token) return true;
    return this.revokedTokens.has(token);
  }
  broadcast(event, groupId, payload) {
    for (const listener of this.changeListeners) {
      try {
        listener(event, groupId, payload);
      } catch (err) {
        console.error("Error broadcasting change event:", err);
      }
    }
  }
  // --- APP OWNER AUTHORIZATION ---
  isAppOwner(email) {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    if (normalized === PRIMARY_APP_OWNER.toLowerCase() || normalized === "avishah.as118@gmail.com" || normalized === "avishah.as119@gmail.com" || normalized === "nikhil.work119@gmail.com") {
      return true;
    }
    const authorized = this.data.app_settings?.authorized_app_owners || [
      PRIMARY_APP_OWNER,
      "avishah.as118@gmail.com",
      "avishah.as119@gmail.com",
      "nikhil.work119@gmail.com"
    ];
    return authorized.map((e) => e.toLowerCase()).includes(normalized);
  }
  resolveUserProfile(p) {
    const { password_hash, ...safeProfile } = p;
    const hasPassword = Boolean(password_hash && password_hash.trim().length > 0);
    return {
      ...safeProfile,
      status: p.status || "active",
      is_app_owner: this.isAppOwner(p.email),
      has_password: hasPassword,
      auth_provider: hasPassword ? "password" : "google"
    };
  }
  resolveCaseRecord(c) {
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
      custom_values: c.custom_values,
      registered_at: c.registered_at,
      updated_at: c.updated_at,
      assigned_name: profile ? profile.display_name : "Unknown Researcher",
      assigned_email: profile ? profile.email : ""
    };
  }
  mapGroupToPublic(g) {
    let orgName;
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
      studyType: g.study_type || "Clinical Pharmacy",
      subjectTerminology: g.subject_terminology || "Patient",
      targetSampleSize: g.target_sample_size,
      description: g.description,
      institution: g.institution,
      ownerId: g.owner_id,
      status: g.status || "active",
      customFields: g.custom_fields || [],
      members: g.members.map((m) => ({
        userId: m.user_id,
        email: m.email,
        displayName: m.display_name,
        role: m.role,
        joinedAt: m.joined_at
      })),
      createdAt: g.created_at,
      updatedAt: g.updated_at
    };
  }
  // --- AUDIT LOGS ---
  async recordAuditLog(entry) {
    const newLog = {
      id: crypto2.randomUUID(),
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_name: entry.entityName,
      details: entry.details,
      performed_by: entry.performedBy,
      performed_by_email: entry.performedByEmail,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (!this.data.audit_logs) this.data.audit_logs = [];
    this.data.audit_logs.unshift(newLog);
    if (this.data.audit_logs.length > 2e3) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 2e3);
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
      createdAt: newLog.created_at
    };
  }
  getAuditLogs(options) {
    let logs = this.data.audit_logs || [];
    if (options?.action) {
      logs = logs.filter((l) => l.action.toLowerCase().includes(options.action.toLowerCase()));
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
      createdAt: l.created_at
    }));
  }
  // --- AUTHENTICATION & PROFILES ---
  async getProfileCount() {
    return this.data.profiles.length;
  }
  async findProfileByEmail(email) {
    if (typeof email !== "string") return null;
    const normalizedEmail = email.trim().toLowerCase();
    const profile = this.data.profiles.find((p) => p.email.toLowerCase() === normalizedEmail);
    return profile || null;
  }
  async findProfileById(id) {
    const profile = this.data.profiles.find((p) => p.id === id);
    if (!profile) return null;
    return this.resolveUserProfile(profile);
  }
  async registerUser(params) {
    return this.mutex.runExclusive(async () => {
      if (this.data.app_settings && !this.data.app_settings.allow_registration) {
        throw new ValidationError("New researcher registration is temporarily paused by the organization administrator.");
      }
      if (!params || typeof params.email !== "string" || typeof params.password !== "string" || typeof params.displayName !== "string") {
        throw new ValidationError("Email, password, and display name must be valid strings.");
      }
      const email = params.email.trim().toLowerCase();
      const displayName = params.displayName.trim();
      if (!email || !displayName) {
        throw new ValidationError("Email and display name are required.");
      }
      const passwordCheck = await validateServerPassword(params.password);
      if (!passwordCheck.isValid) {
        if (passwordCheck.errorCode === "WEAK_PASSWORD") {
          throw new WeakPasswordError(passwordCheck.message);
        }
        throw new ValidationError(passwordCheck.message || "Password does not meet the security requirements.");
      }
      const existing = this.data.profiles.find((p) => p.email.toLowerCase() === email);
      if (existing) {
        if (!existing.password_hash || existing.password_hash.trim() === "") {
          const salt2 = await bcrypt.genSalt(10);
          existing.password_hash = await bcrypt.hash(params.password, salt2);
          if (displayName) existing.display_name = displayName;
          existing.updated_at = (/* @__PURE__ */ new Date()).toISOString();
          await this.persist();
          return this.resolveUserProfile(existing);
        }
        throw new ValidationError("An account with this email address is already registered. Please sign in with your password.");
      }
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(params.password, salt);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const newProfile = {
        id: crypto2.randomUUID(),
        email,
        password_hash,
        display_name: displayName,
        role: "member",
        status: "active",
        created_at: now,
        updated_at: now
      };
      this.data.profiles.push(newProfile);
      await this.persist();
      return this.resolveUserProfile(newProfile);
    });
  }
  async syncGoogleProfile(params) {
    return this.mutex.runExclusive(async () => {
      if (!params || typeof params.uid !== "string" || typeof params.email !== "string") {
        throw new ValidationError("UID and email must be valid strings.");
      }
      const email = params.email.trim().toLowerCase();
      let profile = this.data.profiles.find((p) => p.id === params.uid || p.email.toLowerCase() === email);
      if (profile) {
        if (profile.status === "suspended") {
          throw new AccountSuspendedError();
        }
        profile.display_name = typeof params.displayName === "string" && params.displayName.trim() ? params.displayName.trim() : profile.display_name;
        profile.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        await this.persist();
        return this.resolveUserProfile(profile);
      }
      if (this.data.app_settings && !this.data.app_settings.allow_registration) {
        throw new ValidationError("New researcher registration is temporarily paused by the organization administrator.");
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const newProfile = {
        id: params.uid,
        email,
        password_hash: "",
        display_name: typeof params.displayName === "string" && params.displayName.trim() ? params.displayName.trim() : email.split("@")[0],
        role: "member",
        status: "active",
        created_at: now,
        updated_at: now
      };
      this.data.profiles.push(newProfile);
      await this.persist();
      return this.resolveUserProfile(newProfile);
    });
  }
  async verifyUserCredentials(params) {
    if (!params || typeof params.email !== "string" || typeof params.password !== "string") {
      return null;
    }
    const email = params.email.trim().toLowerCase();
    const profile = this.data.profiles.find((p) => p.email.toLowerCase() === email);
    if (!profile) return null;
    if (profile.status === "suspended") {
      throw new AccountSuspendedError();
    }
    const matches = await bcrypt.compare(params.password, profile.password_hash);
    if (!matches) return null;
    return this.resolveUserProfile(profile);
  }
  async updateUserPassword(params) {
    return this.mutex.runExclusive(async () => {
      const profile = this.data.profiles.find((p) => p.id === params.userId);
      if (!profile) {
        throw new ValidationError("User not found.");
      }
      if (typeof params.currentPassword !== "string" || typeof params.newPassword !== "string") {
        throw new ValidationError("Current password and new password must be valid strings.");
      }
      const matches = await bcrypt.compare(params.currentPassword, profile.password_hash);
      if (!matches) {
        throw new ValidationError("Current password is incorrect.", "INVALID_CREDENTIALS");
      }
      const passwordCheck = await validateServerPassword(params.newPassword);
      if (!passwordCheck.isValid) {
        if (passwordCheck.errorCode === "WEAK_PASSWORD") {
          throw new WeakPasswordError(passwordCheck.message);
        }
        throw new ValidationError(passwordCheck.message || "Password does not meet the security requirements.");
      }
      const salt = await bcrypt.genSalt(10);
      profile.password_hash = await bcrypt.hash(params.newPassword, salt);
      profile.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      await this.recordAuditLog({
        action: "PASSWORD_CHANGED",
        entityType: "user",
        entityId: profile.id,
        details: `Password changed for user ${profile.email}.`,
        performedBy: profile.id,
        performedByEmail: profile.email
      });
    });
  }
  async adminResetUserPassword(params) {
    return this.mutex.runExclusive(async () => {
      const admin = this.data.profiles.find((p) => p.id === params.adminUserId);
      if (!admin || !this.isAppOwner(admin.email)) {
        throw new UnauthorizedGroupActionError("Access denied: Administrator authorization required.");
      }
      const target = this.data.profiles.find((p) => p.id === params.targetUserId);
      if (!target) {
        throw new ValidationError("Target user account not found.");
      }
      const passwordCheck = await validateServerPassword(params.newPassword);
      if (!passwordCheck.isValid) {
        if (passwordCheck.errorCode === "WEAK_PASSWORD") {
          throw new WeakPasswordError(passwordCheck.message);
        }
        throw new ValidationError(passwordCheck.message || "Password does not meet the security requirements.");
      }
      const salt = await bcrypt.genSalt(10);
      target.password_hash = await bcrypt.hash(params.newPassword, salt);
      target.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      await this.recordAuditLog({
        action: "ADMIN_PASSWORD_RESET",
        entityType: "user",
        entityId: target.id,
        details: `Password reset by administrator ${admin.email} for user ${target.email}.`,
        performedBy: admin.id,
        performedByEmail: admin.email
      });
    });
  }
  async resetPasswordWithToken(params) {
    return this.mutex.runExclusive(async () => {
      if (typeof params.email !== "string" || typeof params.newPassword !== "string") {
        throw new ValidationError("Email and new password must be valid strings.");
      }
      const email = params.email.trim().toLowerCase();
      const profile = this.data.profiles.find((p) => p.email.toLowerCase() === email);
      if (!profile) {
        throw new ValidationError("User account not found.");
      }
      const passwordCheck = await validateServerPassword(params.newPassword);
      if (!passwordCheck.isValid) {
        if (passwordCheck.errorCode === "WEAK_PASSWORD") {
          throw new WeakPasswordError(passwordCheck.message);
        }
        throw new ValidationError(passwordCheck.message || "Password does not meet the security requirements.");
      }
      const salt = await bcrypt.genSalt(10);
      profile.password_hash = await bcrypt.hash(params.newPassword, salt);
      profile.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      await this.recordAuditLog({
        action: "PASSWORD_RESET",
        entityType: "user",
        entityId: profile.id,
        details: `Password reset with token for user ${profile.email}.`,
        performedBy: profile.id,
        performedByEmail: profile.email
      });
    });
  }
  // --- ORGANIZATIONS MANAGEMENT ---
  async getUserOrganizations(userId) {
    if (!this.data.organizations) this.data.organizations = [];
    const list = this.data.organizations.filter((o) => {
      const ownsOrg = o.owner_id === userId;
      const inOrgStudy = this.data.groups.some(
        (g) => g.organization_id === o.id && g.members.some((m) => m.user_id === userId)
      );
      return ownsOrg || inOrgStudy;
    });
    return list.map((o) => {
      const studies = this.data.groups.filter((g) => g.organization_id === o.id);
      const uniqueMembers = /* @__PURE__ */ new Set();
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
        updatedAt: o.updated_at
      };
    });
  }
  async createOrganization(userId, params) {
    return this.mutex.runExclusive(async () => {
      if (!params || typeof params.name !== "string" || !params.name.trim()) {
        throw new ValidationError("Organization name is required.");
      }
      const name = params.name.trim();
      if (!this.data.organizations) this.data.organizations = [];
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const newOrg = {
        id: crypto2.randomUUID(),
        name,
        description: typeof params.description === "string" && params.description.trim() ? params.description.trim() : void 0,
        institution: typeof params.institution === "string" && params.institution.trim() ? params.institution.trim() : void 0,
        contact_email: typeof params.contactEmail === "string" && params.contactEmail.trim() ? params.contactEmail.trim() : void 0,
        owner_id: userId,
        created_at: now,
        updated_at: now
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
        updatedAt: newOrg.updated_at
      };
    });
  }
  async getOrganizationById(orgId) {
    if (!this.data.organizations) return null;
    const org = this.data.organizations.find((o) => o.id === orgId);
    if (!org) return null;
    const studies = this.data.groups.filter((g) => g.organization_id === org.id);
    const uniqueMembers = /* @__PURE__ */ new Set();
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
      updatedAt: org.updated_at
    };
  }
  // --- RESEARCH GROUPS / STUDIES MANAGEMENT ---
  async getUserGroups(userId) {
    const userGroups = this.data.groups.filter(
      (g) => (g.status || "active") !== "archived" && g.members.some((m) => m.user_id === userId)
    );
    return userGroups.map((g) => this.mapGroupToPublic(g));
  }
  async getGroupById(groupId, userId) {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (!group) {
      throw new GroupNotFoundError();
    }
    const isMember = group.members.some((m) => m.user_id === userId);
    if (!isMember) {
      throw new UnauthorizedGroupActionError("Access denied: You are not a member of this research study.");
    }
    return this.mapGroupToPublic(group);
  }
  async createGroup(userId, params) {
    return this.mutex.runExclusive(async () => {
      const user = this.data.profiles.find((p) => p.id === userId);
      if (!user) {
        throw new Error("User profile not found.");
      }
      if (user.status === "suspended") {
        throw new AccountSuspendedError();
      }
      if (!params || typeof params.name !== "string" || typeof params.studyTitle !== "string") {
        throw new ValidationError("Research study / group name and study title are required strings.");
      }
      const name = params.name.trim();
      const studyTitle = params.studyTitle.trim();
      const targetSampleSize = Number(params.targetSampleSize);
      if (!name) throw new ValidationError("Research study / group name is required.");
      if (!studyTitle) throw new ValidationError("Study / Thesis title is required.");
      if (isNaN(targetSampleSize) || targetSampleSize <= 0) {
        throw new ValidationError("Please enter a valid target sample size (positive number).");
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const newGroupId = crypto2.randomUUID();
      const ownerMember = {
        user_id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: "owner",
        joined_at: now
      };
      const newGroup = {
        id: newGroupId,
        organization_id: typeof params.organizationId === "string" && params.organizationId.trim() ? params.organizationId.trim() : void 0,
        name,
        study_title: studyTitle,
        study_type: params.studyType || "Clinical Pharmacy",
        subject_terminology: params.subjectTerminology || "Patient",
        target_sample_size: targetSampleSize,
        description: typeof params.description === "string" && params.description.trim() ? params.description.trim() : void 0,
        institution: typeof params.institution === "string" && params.institution.trim() ? params.institution.trim() : void 0,
        custom_fields: Array.isArray(params.customFields) ? params.customFields : [],
        owner_id: user.id,
        status: "active",
        members: [ownerMember],
        created_at: now,
        updated_at: now
      };
      this.data.groups.push(newGroup);
      await this.persist();
      return this.mapGroupToPublic(newGroup);
    });
  }
  async updateGroupSettings(groupId, userId, updates) {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();
      const member = group.members.find((m) => m.user_id === userId);
      if (!member || member.role !== "owner") {
        throw new UnauthorizedGroupActionError("Only the study owner can edit study settings.");
      }
      if (updates.name !== void 0) {
        if (typeof updates.name !== "string") throw new ValidationError("Study name must be a string.");
        const trimmed = updates.name.trim();
        if (!trimmed) throw new ValidationError("Study name cannot be empty.");
        group.name = trimmed;
      }
      if (updates.studyTitle !== void 0) {
        if (typeof updates.studyTitle !== "string") throw new ValidationError("Study title must be a string.");
        const trimmed = updates.studyTitle.trim();
        if (!trimmed) throw new ValidationError("Study title cannot be empty.");
        group.study_title = trimmed;
      }
      if (updates.studyType !== void 0) {
        group.study_type = updates.studyType;
      }
      if (updates.subjectTerminology !== void 0) {
        group.subject_terminology = updates.subjectTerminology;
      }
      if (updates.targetSampleSize !== void 0) {
        const size = Number(updates.targetSampleSize);
        if (isNaN(size) || size <= 0) throw new ValidationError("Target sample size must be a positive number.");
        group.target_sample_size = size;
      }
      if (updates.description !== void 0) {
        if (typeof updates.description !== "string") throw new ValidationError("Description must be a string.");
        group.description = updates.description.trim() || void 0;
      }
      if (updates.institution !== void 0) {
        if (typeof updates.institution !== "string") throw new ValidationError("Institution must be a string.");
        group.institution = updates.institution.trim() || void 0;
      }
      if (updates.organizationId !== void 0) {
        if (typeof updates.organizationId !== "string") throw new ValidationError("Organization ID must be a string.");
        group.organization_id = updates.organizationId.trim() || void 0;
      }
      if (updates.customFields !== void 0) {
        if (!Array.isArray(updates.customFields)) throw new ValidationError("Custom fields must be an array.");
        group.custom_fields = updates.customFields;
      }
      group.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      const resolved = this.mapGroupToPublic(group);
      this.broadcast("group_updated", groupId, resolved);
      return resolved;
    });
  }
  // --- RESEARCH FILES MANAGEMENT ---
  async getGroupFiles(groupId, userId) {
    this.verifyUserGroupMembership(groupId, userId);
    if (!this.data.files) this.data.files = [];
    return this.data.files.filter((f) => f.group_id === groupId).map((f) => ({
      id: f.id,
      groupId: f.group_id,
      name: f.name,
      size: f.size,
      mimeType: f.mime_type,
      category: f.category,
      uploadedBy: f.uploaded_by,
      uploadedByName: f.uploaded_by_name,
      uploadedAt: f.created_at,
      fileData: f.file_data
    }));
  }
  async uploadGroupFile(params) {
    return this.mutex.runExclusive(async () => {
      this.verifyUserGroupMembership(params.groupId, params.userId);
      if (!params || typeof params.name !== "string" || !params.name.trim()) {
        throw new ValidationError("File name is required.");
      }
      const user = this.data.profiles.find((p) => p.id === params.userId);
      if (!this.data.files) this.data.files = [];
      const newFile = {
        id: crypto2.randomUUID(),
        group_id: params.groupId,
        name: params.name.trim(),
        size: typeof params.size === "number" ? params.size : 0,
        mime_type: typeof params.mimeType === "string" ? params.mimeType : "application/octet-stream",
        category: params.category || "other",
        uploaded_by: params.userId,
        uploaded_by_name: user ? user.display_name : "Researcher",
        file_data: params.fileData,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
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
        fileData: newFile.file_data
      };
    });
  }
  async deleteGroupFile(groupId, fileId, userId) {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(groupId, userId);
      if (!this.data.files) this.data.files = [];
      const idx = this.data.files.findIndex((f) => f.id === fileId && f.group_id === groupId);
      if (idx === -1) {
        throw new ValidationError("File not found in this research group.");
      }
      const target = this.data.files[idx];
      const member = group.members.find((m) => m.user_id === userId);
      const isOwner = member?.role === "owner";
      const isUploader = target.uploaded_by === userId;
      if (!isOwner && !isUploader) {
        throw new UnauthorizedGroupActionError("Only the study owner or file uploader can delete files.");
      }
      const [removed] = this.data.files.splice(idx, 1);
      await this.persist();
      return { success: true, fileName: removed.name };
    });
  }
  // --- GROUP INVITATIONS (CRYPTOGRAPHICALLY RANDOM BEARER TOKENS & SINGLE-USE) ---
  async createInvitation(groupId, userId, intendedEmail) {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();
      const member = group.members.find((m) => m.user_id === userId);
      if (!member || member.role !== "owner") {
        throw new UnauthorizedGroupActionError("Only the study owner can invite new researchers.");
      }
      const rawToken = crypto2.randomBytes(24).toString("base64url");
      const tokenHash = hashInvitationToken(rawToken);
      const now = /* @__PURE__ */ new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3).toISOString();
      const invite = {
        id: crypto2.randomUUID(),
        group_id: groupId,
        group_name: group.name,
        token_hash: tokenHash,
        created_by: userId,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        status: "pending",
        intended_email: typeof intendedEmail === "string" && intendedEmail.trim() ? intendedEmail.trim().toLowerCase() : void 0
      };
      this.data.invitations.push(invite);
      await this.persist();
      return {
        id: invite.id,
        groupId: invite.group_id,
        groupName: invite.group_name,
        code: rawToken,
        createdBy: invite.created_by,
        createdAt: invite.created_at,
        expiresAt: invite.expires_at,
        status: invite.status,
        intendedEmail: invite.intended_email
      };
    });
  }
  async getInvitationDetails(rawToken) {
    if (!rawToken || typeof rawToken !== "string") {
      throw new ValidationError("Invalid or expired invitation code.");
    }
    const trimmed = rawToken.trim();
    const tokenHash = hashInvitationToken(trimmed);
    const legacyHash = hashInvitationToken(trimmed.toUpperCase());
    const invite = this.data.invitations.find(
      (i) => i.token_hash === tokenHash || i.token_hash === legacyHash || i.code && i.code.toUpperCase() === trimmed.toUpperCase()
    );
    if (!invite) {
      throw new ValidationError("Invalid or expired invitation code.");
    }
    if (invite.status === "pending" && new Date(invite.expires_at) < /* @__PURE__ */ new Date()) {
      invite.status = "expired";
      await this.persist();
      throw new ValidationError("Invalid or expired invitation code.");
    }
    if (invite.status !== "pending") {
      throw new ValidationError("Invalid or expired invitation code.");
    }
    const group = this.data.groups.find((g) => g.id === invite.group_id);
    if (!group || group.status === "suspended") {
      throw new ValidationError("Invalid or expired invitation code.");
    }
    return {
      group: {
        name: group.name,
        studyTitle: group.study_title,
        targetSampleSize: group.target_sample_size,
        memberCount: group.members.length,
        isFull: false
      }
    };
  }
  async acceptInvitation(rawToken, user) {
    return this.mutex.runExclusive(async () => {
      if (!rawToken || typeof rawToken !== "string") {
        throw new ValidationError("Invalid or expired invitation code.");
      }
      const trimmed = rawToken.trim();
      const tokenHash = hashInvitationToken(trimmed);
      const legacyHash = hashInvitationToken(trimmed.toUpperCase());
      const invite = this.data.invitations.find(
        (i) => i.token_hash === tokenHash || i.token_hash === legacyHash || i.code && i.code.toUpperCase() === trimmed.toUpperCase()
      );
      if (!invite) {
        throw new ValidationError("Invalid or expired invitation code.");
      }
      if (invite.status !== "pending") {
        throw new ValidationError("Invalid or expired invitation code.");
      }
      if (new Date(invite.expires_at) < /* @__PURE__ */ new Date()) {
        invite.status = "expired";
        await this.persist();
        throw new ValidationError("Invalid or expired invitation code.");
      }
      const group = this.data.groups.find((g) => g.id === invite.group_id);
      if (!group || group.status === "suspended") {
        throw new ValidationError("Invalid or expired invitation code.");
      }
      const existingMember = group.members.find((m) => m.user_id === user.id);
      if (existingMember) {
        return this.mapGroupToPublic(group);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const newMember = {
        user_id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: "researcher",
        joined_at: now
      };
      group.members.push(newMember);
      group.updated_at = now;
      invite.status = "accepted";
      invite.accepted_by = user.id;
      invite.accepted_at = now;
      await this.persist();
      const resolved = this.mapGroupToPublic(group);
      this.broadcast("team_updated", group.id, {
        groupId: group.id,
        totalMembers: group.members.length
      });
      return resolved;
    });
  }
  async removeMember(groupId, requesterUserId, targetUserId) {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();
      const requester = group.members.find((m) => m.user_id === requesterUserId);
      if (!requester || requester.role !== "owner") {
        throw new UnauthorizedGroupActionError("Only the study owner can remove members.");
      }
      if (requesterUserId === targetUserId) {
        throw new ValidationError("The study owner cannot remove themselves from the study.");
      }
      const memberIndex = group.members.findIndex((m) => m.user_id === targetUserId);
      if (memberIndex === -1) {
        throw new ValidationError("Member not found in this study.");
      }
      group.members.splice(memberIndex, 1);
      group.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      const resolved = this.mapGroupToPublic(group);
      this.broadcast("team_updated", groupId, {
        groupId,
        totalMembers: group.members.length
      });
      return resolved;
    });
  }
  // --- GROUP-SCOPED RESEARCH RECORDS OPERATIONS ---
  verifyUserGroupMembership(groupId, userId) {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (!group) throw new GroupNotFoundError();
    if (group.status === "suspended") {
      throw new UnauthorizedGroupActionError("Access denied: This research study has been suspended.");
    }
    const isMember = group.members.some((m) => m.user_id === userId);
    if (!isMember) {
      throw new UnauthorizedGroupActionError("Access denied: You are not a member of this research study.");
    }
    return group;
  }
  async checkPatientId(groupId, rawId, userId) {
    this.verifyUserGroupMembership(groupId, userId);
    const val = validatePatientId(rawId);
    if (!val.isValid) {
      throw new ValidationError(val.errorMessage || "Invalid patient ID format.");
    }
    const normalized = val.normalizedId;
    const existing = this.data.cases.find(
      (c) => c.group_id === groupId && c.normalized_patient_id === normalized
    );
    if (existing) {
      return {
        exists: true,
        normalizedId: normalized,
        case: this.resolveCaseRecord(existing)
      };
    }
    return {
      exists: false,
      normalizedId: normalized
    };
  }
  async registerCase(params) {
    return this.mutex.runExclusive(async () => {
      if (!params || typeof params.groupId !== "string" || typeof params.patientId !== "string") {
        throw new ValidationError("Group ID and Patient ID are required strings.");
      }
      const group = this.verifyUserGroupMembership(params.groupId, params.assignedToUserId);
      const val = validatePatientId(params.patientId);
      if (!val.isValid) {
        throw new ValidationError(val.errorMessage || "Invalid patient ID format.");
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
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const newCase = {
        id: crypto2.randomUUID(),
        group_id: params.groupId,
        patient_id: originalPatientId,
        normalized_patient_id: normalized,
        assigned_to: params.assignedToUserId,
        status: "In Progress",
        patient_name: params.patientName?.trim() || void 0,
        diagnosis: params.diagnosis?.trim() || void 0,
        drug_names: params.drugNames?.trim() || void 0,
        custom_values: params.customValues,
        registered_at: now,
        updated_at: now
      };
      this.data.cases.push(newCase);
      await this.persist();
      const resolved = this.resolveCaseRecord(newCase);
      this.broadcast("case_registered", params.groupId, {
        groupId: params.groupId,
        case: resolved
      });
      return resolved;
    });
  }
  async getAllCases(groupId, userId, filters) {
    this.verifyUserGroupMembership(groupId, userId);
    let list = this.data.cases.filter((c) => c.group_id === groupId);
    if (filters?.search) {
      const q = normalizePatientId(filters.search);
      const rawLower = filters.search.trim().toLowerCase();
      list = list.filter((c) => {
        const matchesId = q && c.normalized_patient_id.includes(q) || c.patient_id.toLowerCase().includes(rawLower);
        const matchesName = c.patient_name ? c.patient_name.toLowerCase().includes(rawLower) : false;
        return matchesId || matchesName;
      });
    }
    if (filters?.memberId && filters.memberId !== "ALL") {
      list = list.filter((c) => c.assigned_to === filters.memberId);
    }
    if (filters?.status && filters.status !== "ALL") {
      list = list.filter((c) => c.status === filters.status);
    }
    list.sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());
    return list.map((c) => this.resolveCaseRecord(c));
  }
  async getMyCases(groupId, userId, search) {
    this.verifyUserGroupMembership(groupId, userId);
    let list = this.data.cases.filter(
      (c) => c.group_id === groupId && c.assigned_to === userId
    );
    if (search) {
      const q = normalizePatientId(search);
      const rawLower = search.trim().toLowerCase();
      list = list.filter((c) => {
        const matchesId = q && c.normalized_patient_id.includes(q) || c.patient_id.toLowerCase().includes(rawLower);
        const matchesName = c.patient_name ? c.patient_name.toLowerCase().includes(rawLower) : false;
        return matchesId || matchesName;
      });
    }
    list.sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());
    return list.map((c) => this.resolveCaseRecord(c));
  }
  async updateCaseStatus(params) {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.userId);
      const validStatuses = ["In Progress", "Completed", "Excluded"];
      if (!params || typeof params.newStatus !== "string" || !validStatuses.includes(params.newStatus)) {
        throw new ValidationError(`Invalid status: ${params?.newStatus}`);
      }
      const target = this.data.cases.find(
        (c) => c.id === params.caseId && c.group_id === params.groupId
      );
      if (!target) {
        throw new ValidationError("Record not found in this research study.");
      }
      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === "owner";
      const isAssigned = target.assigned_to === params.userId;
      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          "Permission denied. You can only update the status of records assigned to you."
        );
      }
      target.status = params.newStatus;
      target.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      const resolved = this.resolveCaseRecord(target);
      this.broadcast("case_status_updated", params.groupId, {
        groupId: params.groupId,
        case: resolved
      });
      return resolved;
    });
  }
  async updateCaseDetails(params) {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.userId);
      const target = this.data.cases.find(
        (c) => c.id === params.caseId && c.group_id === params.groupId
      );
      if (!target) {
        throw new ValidationError("Record not found in this research study.");
      }
      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === "owner";
      const isAssigned = target.assigned_to === params.userId;
      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          "Permission denied. You can only modify details for records assigned to you."
        );
      }
      if (params.patientName !== void 0) {
        if (typeof params.patientName !== "string") throw new ValidationError("Participant name must be a string.");
        target.patient_name = params.patientName.trim() || void 0;
      }
      if (params.diagnosis !== void 0) {
        if (typeof params.diagnosis !== "string") throw new ValidationError("Condition / diagnosis must be a string.");
        target.diagnosis = params.diagnosis.trim() || void 0;
      }
      if (params.drugNames !== void 0) {
        if (typeof params.drugNames !== "string") throw new ValidationError("Medication / intervention details must be a string.");
        target.drug_names = params.drugNames.trim() || void 0;
      }
      if (params.customValues !== void 0) {
        if (typeof params.customValues !== "object" || params.customValues === null || Array.isArray(params.customValues)) {
          throw new ValidationError("Custom values must be an object.");
        }
        target.custom_values = { ...target.custom_values || {}, ...params.customValues };
      }
      target.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      const resolved = this.resolveCaseRecord(target);
      this.broadcast("case_status_updated", params.groupId, {
        groupId: params.groupId,
        case: resolved
      });
      return resolved;
    });
  }
  async deleteCase(params) {
    return this.mutex.runExclusive(async () => {
      const group = this.verifyUserGroupMembership(params.groupId, params.userId);
      const index = this.data.cases.findIndex(
        (c) => c.id === params.caseId && c.group_id === params.groupId
      );
      if (index === -1) {
        throw new ValidationError("Record not found in this research study.");
      }
      const target = this.data.cases[index];
      const userMember = group.members.find((m) => m.user_id === params.userId);
      const isOwner = userMember?.role === "owner";
      const isAssigned = target.assigned_to === params.userId;
      if (!isAssigned && !isOwner) {
        throw new UnauthorizedCaseActionError(
          "Permission denied. You can only remove records registered by you."
        );
      }
      const [removed] = this.data.cases.splice(index, 1);
      await this.persist();
      this.broadcast("case_deleted", params.groupId, {
        groupId: params.groupId,
        caseId: removed.id,
        patientId: removed.patient_id
      });
      return { success: true, patientId: removed.patient_id };
    });
  }
  async getDashboardStats(groupId, userId) {
    const group = this.verifyUserGroupMembership(groupId, userId);
    const groupCases = this.data.cases.filter((c) => c.group_id === groupId);
    const totalCases = groupCases.length;
    const myCases = groupCases.filter((c) => c.assigned_to === userId).length;
    const inProgress = groupCases.filter((c) => c.status === "In Progress").length;
    const completed = groupCases.filter((c) => c.status === "Completed").length;
    const excluded = groupCases.filter((c) => c.status === "Excluded").length;
    const targetSampleSize = group.target_sample_size || 100;
    const remaining = Math.max(0, targetSampleSize - totalCases);
    const progressPercentage = targetSampleSize > 0 ? Number((totalCases / targetSampleSize * 100).toFixed(1)) : 0;
    return {
      totalCases,
      myCases,
      inProgress,
      completed,
      excluded,
      targetSampleSize,
      remaining,
      progressPercentage
    };
  }
  async getTeamSummary(groupId, userId) {
    const group = this.verifyUserGroupMembership(groupId, userId);
    const groupCases = this.data.cases.filter((c) => c.group_id === groupId);
    const membersSummary = group.members.map((m) => {
      const userCases = groupCases.filter((c) => c.assigned_to === m.user_id);
      return {
        profileId: m.user_id,
        displayName: m.display_name,
        email: m.email,
        role: m.role,
        totalAssigned: userCases.length,
        inProgress: userCases.filter((c) => c.status === "In Progress").length,
        completed: userCases.filter((c) => c.status === "Completed").length,
        excluded: userCases.filter((c) => c.status === "Excluded").length
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
      userRole: userMember?.role || "researcher",
      members: membersSummary
    };
  }
  // =========================================================================
  // --- APP OWNER / ORGANIZATION ADMINISTRATION METHODS ---
  // =========================================================================
  async getAppOwnerOverview() {
    const totalUsers = this.data.profiles.length;
    const totalOrganizations = this.data.organizations?.length || 0;
    const totalGroups = this.data.groups.length;
    const activeGroups = this.data.groups.filter((g) => (g.status || "active") === "active").length;
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
      totalFiles
    };
  }
  async getAppOwnerOrganizations() {
    if (!this.data.organizations) this.data.organizations = [];
    return this.data.organizations.map((o) => {
      const studies = this.data.groups.filter((g) => g.organization_id === o.id);
      const uniqueMembers = /* @__PURE__ */ new Set();
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
        updatedAt: o.updated_at
      };
    });
  }
  async getAppOwnerUsers(options) {
    let list = this.data.profiles;
    if (options?.search) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (p) => p.display_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
      );
    }
    if (options?.status && options.status !== "ALL") {
      list = list.filter((p) => (p.status || "active") === options.status);
    }
    return list.map((p) => {
      const userGroups = this.data.groups.filter((g) => g.members.some((m) => m.user_id === p.id)).map((g) => {
        const m = g.members.find((mem) => mem.user_id === p.id);
        return {
          groupId: g.id,
          groupName: g.name,
          role: m.role,
          joinedAt: m.joined_at
        };
      });
      return {
        id: p.id,
        email: p.email,
        displayName: p.display_name,
        status: p.status || "active",
        createdAt: p.created_at,
        isAppOwner: this.isAppOwner(p.email),
        groups: userGroups
      };
    });
  }
  async setAppOwnerUserStatus(userId, newStatus, adminEmail) {
    return this.mutex.runExclusive(async () => {
      const profile = this.data.profiles.find((p) => p.id === userId);
      if (!profile) throw new ValidationError("User profile not found.");
      if (this.isAppOwner(profile.email)) {
        throw new ValidationError("Action rejected: Cannot modify status of an authorized App Owner account.");
      }
      profile.status = newStatus;
      profile.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      await this.recordAuditLog({
        action: newStatus === "suspended" ? "USER_SUSPENDED" : "USER_REACTIVATED",
        entityType: "user",
        entityId: profile.id,
        entityName: profile.display_name,
        details: `Account status for "${profile.email}" changed to ${newStatus}.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail
      });
      const userGroups = this.data.groups.filter((g) => g.members.some((m) => m.user_id === profile.id)).map((g) => {
        const m = g.members.find((mem) => mem.user_id === profile.id);
        return {
          groupId: g.id,
          groupName: g.name,
          role: m.role,
          joinedAt: m.joined_at
        };
      });
      return {
        id: profile.id,
        email: profile.email,
        displayName: profile.display_name,
        status: profile.status,
        createdAt: profile.created_at,
        isAppOwner: false,
        groups: userGroups
      };
    });
  }
  async getAppOwnerGroups(options) {
    let list = this.data.groups;
    if (options?.search) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (g) => g.name.toLowerCase().includes(q) || g.study_title.toLowerCase().includes(q) || g.institution && g.institution.toLowerCase().includes(q)
      );
    }
    if (options?.status && options.status !== "ALL") {
      list = list.filter((g) => (g.status || "active") === options.status);
    }
    return list.map((g) => {
      const owner = this.data.profiles.find((p) => p.id === g.owner_id);
      const caseCount = this.data.cases.filter((c) => c.group_id === g.id).length;
      const invitationsCount = this.data.invitations.filter((i) => i.group_id === g.id).length;
      let orgName;
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
        ownerName: owner ? owner.display_name : "Unknown Owner",
        ownerEmail: owner ? owner.email : "",
        memberCount: g.members.length,
        targetSampleSize: g.target_sample_size,
        caseCount,
        description: g.description,
        institution: g.institution,
        status: g.status || "active",
        createdAt: g.created_at,
        updatedAt: g.updated_at,
        members: g.members.map((m) => ({
          userId: m.user_id,
          displayName: m.display_name,
          email: m.email,
          role: m.role,
          joinedAt: m.joined_at
        })),
        invitationsCount
      };
    });
  }
  async setAppOwnerGroupStatus(groupId, newStatus, adminEmail) {
    return this.mutex.runExclusive(async () => {
      const group = this.data.groups.find((g) => g.id === groupId);
      if (!group) throw new GroupNotFoundError();
      group.status = newStatus;
      group.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      await this.recordAuditLog({
        action: "GROUP_STATUS_CHANGED",
        entityType: "group",
        entityId: group.id,
        entityName: group.name,
        details: `Research study "${group.name}" status changed to ${newStatus}.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail
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
        ownerName: owner ? owner.display_name : "Unknown Owner",
        ownerEmail: owner ? owner.email : "",
        memberCount: group.members.length,
        targetSampleSize: group.target_sample_size,
        caseCount,
        description: group.description,
        institution: group.institution,
        status: group.status || "active",
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        members: group.members.map((m) => ({
          userId: m.user_id,
          displayName: m.display_name,
          email: m.email,
          role: m.role,
          joinedAt: m.joined_at
        })),
        invitationsCount
      };
    });
  }
  async deleteAppOwnerGroup(groupId, adminEmail) {
    return this.mutex.runExclusive(async () => {
      const idx = this.data.groups.findIndex((g) => g.id === groupId);
      if (idx === -1) throw new GroupNotFoundError();
      const [removed] = this.data.groups.splice(idx, 1);
      const caseCountBefore = this.data.cases.length;
      this.data.cases = this.data.cases.filter((c) => c.group_id !== groupId);
      const casesPurged = caseCountBefore - this.data.cases.length;
      this.data.invitations = this.data.invitations.filter((i) => i.group_id !== groupId);
      if (this.data.files) {
        this.data.files = this.data.files.filter((f) => f.group_id !== groupId);
      }
      await this.persist();
      await this.recordAuditLog({
        action: "GROUP_DELETED",
        entityType: "group",
        entityId: removed.id,
        entityName: removed.name,
        details: `Research study "${removed.name}" deleted (${casesPurged} case records purged).`,
        performedBy: adminEmail,
        performedByEmail: adminEmail
      });
      return { success: true, groupName: removed.name };
    });
  }
  getAppSettings() {
    const settings = this.data.app_settings || {
      authorized_app_owners: [PRIMARY_APP_OWNER],
      maintenance_mode: false,
      allow_registration: true,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    return {
      authorizedAppOwners: settings.authorized_app_owners,
      maintenanceMode: settings.maintenance_mode,
      allowRegistration: settings.allow_registration,
      updatedAt: settings.updated_at
    };
  }
  async updateAppSettings(updates, adminEmail) {
    return this.mutex.runExclusive(async () => {
      if (!this.data.app_settings) {
        this.data.app_settings = {
          authorized_app_owners: [PRIMARY_APP_OWNER],
          maintenance_mode: false,
          allow_registration: true,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
      if (updates.authorizedAppOwners !== void 0) {
        const unique = Array.from(
          new Set(
            updates.authorizedAppOwners.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@") && e.includes("."))
          )
        );
        if (!unique.includes(PRIMARY_APP_OWNER.toLowerCase())) {
          unique.unshift(PRIMARY_APP_OWNER.toLowerCase());
        }
        this.data.app_settings.authorized_app_owners = unique;
      }
      if (updates.maintenanceMode !== void 0) {
        this.data.app_settings.maintenance_mode = updates.maintenanceMode;
      }
      if (updates.allowRegistration !== void 0) {
        this.data.app_settings.allow_registration = updates.allowRegistration;
      }
      this.data.app_settings.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      await this.recordAuditLog({
        action: "APP_SETTINGS_UPDATED",
        entityType: "settings",
        details: `Application settings updated by ${adminEmail}. Authorized owners count: ${this.data.app_settings.authorized_app_owners.length}.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail
      });
      return {
        authorizedAppOwners: this.data.app_settings.authorized_app_owners,
        maintenanceMode: this.data.app_settings.maintenance_mode,
        allowRegistration: this.data.app_settings.allow_registration,
        updatedAt: this.data.app_settings.updated_at
      };
    });
  }
  getLegalPolicies() {
    const docs = this.data.legal_docs || DEFAULT_LEGAL_DOCS;
    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      content: doc.content,
      lastUpdated: doc.last_updated
    }));
  }
  async updateLegalPolicy(id, content, adminEmail) {
    return this.mutex.runExclusive(async () => {
      if (!this.data.legal_docs) this.data.legal_docs = [...DEFAULT_LEGAL_DOCS];
      if (typeof content !== "string") {
        throw new ValidationError("Policy content must be a string.");
      }
      const doc = this.data.legal_docs.find((d) => d.id === id);
      if (!doc) throw new ValidationError("Policy document not found.");
      doc.content = content.trim();
      doc.last_updated = (/* @__PURE__ */ new Date()).toISOString();
      await this.persist();
      await this.recordAuditLog({
        action: "LEGAL_POLICY_UPDATED",
        entityType: "legal",
        entityId: doc.id,
        entityName: doc.title,
        details: `Legal policy "${doc.title}" content updated.`,
        performedBy: adminEmail,
        performedByEmail: adminEmail
      });
      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        lastUpdated: doc.last_updated
      };
    });
  }
};
var db = new RelationalDatabase();

// server.ts
dotenv.config();
var app = express();
var PORT = parseInt(process.env.PORT || "3000", 10);
var isProd = process.env.NODE_ENV === "production";
var JWT_SECRET = process.env.JWT_SECRET || "thesis-tracker-secure-secret-token-key-2026";
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  const incoming = req.headers["x-request-id"];
  const requestId = typeof incoming === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming.trim()) ? incoming.trim() : crypto3.randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});
function logServerError(err, req, context) {
  const requestId = req.id || "unknown";
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const errorInfo = {
    timestamp,
    requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    context: context || "Unhandled Server Error",
    errorName: err?.name || "Error",
    errorMessage: err?.message || String(err),
    stack: err?.stack || void 0
  };
  console.error(`[SERVER_ERROR][${requestId}]`, JSON.stringify(errorInfo));
}
function sendSafeErrorResponse(err, req, res, defaultAction = "REQUEST_FAILED") {
  const requestId = req.id || crypto3.randomUUID();
  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: err.code || defaultAction || "VALIDATION_ERROR",
      message: err.message
    });
  }
  if (err instanceof DuplicateCaseError) {
    return res.status(409).json({
      error: "DUPLICATE_CASE",
      message: "Record Already Registered",
      case: err.existingCase
    });
  }
  if (err instanceof UnauthorizedGroupActionError) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Access denied: You are not a member of this research study."
    });
  }
  if (err instanceof UnauthorizedCaseActionError) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Unauthorized: You can only modify cases assigned to you."
    });
  }
  if (err instanceof AccountSuspendedError) {
    return res.status(403).json({
      error: "ACCOUNT_SUSPENDED",
      message: "Your account has been deactivated. Please contact support."
    });
  }
  if (err instanceof GroupNotFoundError) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Research study/group not found."
    });
  }
  if (err instanceof SyntaxError && "status" in err && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Invalid request."
    });
  }
  const isInternalJsError = err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError || err instanceof SyntaxError || typeof err?.message === "string" && (err.message.includes("is not a function") || err.message.includes("Cannot read properties") || err.message.includes("is undefined") || err.message.includes("is null") || err.message.includes("at "));
  if (!isInternalJsError && err?.isClientError && typeof err.message === "string") {
    return res.status(err.status || 400).json({
      error: err.code || defaultAction,
      message: err.message
    });
  }
  logServerError(err, req, defaultAction);
  return res.status(500).json({
    error: "SERVER_ERROR",
    message: "An unexpected error occurred.",
    requestId
  });
}
var AUTH_COOKIE_NAME = "thesis_tracker_session";
var COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
var getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: true,
  sameSite: "none",
  path: "/",
  maxAge: COOKIE_MAX_AGE_MS
});
var securityHeadersMiddleware = (req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.removeHeader("x-powered-by");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https" || isProd;
  if (isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://*.run.app https://*.ai.studio",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://*.google.com https://*.run.app https://*.ai.studio",
    "frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.run.app https://*.googleusercontent.com https://*.ai.studio",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'"
  ];
  res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
  next();
};
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());
var csrfProtection = (req, res, next) => {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return next();
  }
  if (req.headers["x-requested-with"] === "XMLHttpRequest") {
    return next();
  }
  const origin = req.headers["origin"];
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  if (origin && host) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const currentHost = host.toLowerCase();
      const forwardedHost = req.headers["x-forwarded-host"]?.toLowerCase();
      const rawHost = req.headers["host"]?.toLowerCase();
      const validHosts = [currentHost, forwardedHost, rawHost].filter(Boolean);
      const isMatch = validHosts.some(
        (h) => h === originHost || originHost === h.split(":")[0] || h === originHost.split(":")[0]
      ) || originHost.endsWith(".run.app") || originHost.endsWith(".ai.studio") || originHost.endsWith(".google.com") || originHost === "localhost" || originHost.startsWith("localhost:");
      if (!isMatch) {
        res.status(403).json({ error: "FORBIDDEN", message: "Cross-origin request rejected." });
        return;
      }
    } catch {
      res.status(403).json({ error: "FORBIDDEN", message: "Malformed origin header." });
      return;
    }
  }
  next();
};
app.use(csrfProtection);
var authenticateToken = async (req, res, next) => {
  let token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (typeof req.query.token === "string" && req.query.token.trim()) {
      token = req.query.token.trim();
    }
  }
  if (!token) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required. Please log in." });
    return;
  }
  if (db.isTokenRevoked(token)) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Session has been revoked. Please log in again." });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.findProfileById(payload.userId);
    if (!user) {
      res.status(401).json({ error: "INVALID_TOKEN", message: "User profile not found." });
      return;
    }
    if (user.status === "suspended") {
      res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been deactivated. Please contact support." });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired session token." });
    return;
  }
};
var requireGroupMembership = async (req, res, next) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    return;
  }
  const rawHeader = req.headers["x-group-id"];
  const rawQuery = req.query.groupId;
  const rawBody = req.body?.groupId;
  if (Array.isArray(rawHeader) || Array.isArray(rawQuery)) {
    res.status(400).json({ error: "INVALID_GROUP", message: "Multiple group identifiers are not allowed." });
    return;
  }
  const headerGroup = typeof rawHeader === "string" && rawHeader.trim() ? rawHeader.trim() : null;
  const queryGroup = typeof rawQuery === "string" && rawQuery.trim() ? rawQuery.trim() : null;
  const bodyGroup = typeof rawBody === "string" && rawBody.trim() ? rawBody.trim() : null;
  if (headerGroup && queryGroup && headerGroup !== queryGroup) {
    res.status(400).json({ error: "CONFLICTING_GROUP_INPUT", message: "Conflicting group identifiers." });
    return;
  }
  if (headerGroup && bodyGroup && headerGroup !== bodyGroup) {
    res.status(400).json({ error: "CONFLICTING_GROUP_INPUT", message: "Conflicting group identifiers." });
    return;
  }
  if (queryGroup && bodyGroup && queryGroup !== bodyGroup) {
    res.status(400).json({ error: "CONFLICTING_GROUP_INPUT", message: "Conflicting group identifiers." });
    return;
  }
  const targetGroupId = headerGroup || queryGroup || bodyGroup;
  if (!targetGroupId) {
    res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
    return;
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(targetGroupId)) {
    res.status(400).json({ error: "INVALID_GROUP", message: "Invalid research group ID format." });
    return;
  }
  try {
    const group = db.verifyUserGroupMembership(targetGroupId, user.id);
    req.targetGroupId = targetGroupId;
    req.group = group;
    next();
  } catch (err) {
    if (err instanceof GroupNotFoundError) {
      res.status(404).json({ error: "NOT_FOUND", message: "Research study/group not found." });
      return;
    }
    if (err instanceof UnauthorizedGroupActionError) {
      await db.recordAuditLog({
        action: "UNAUTHORIZED_CROSS_STUDY_ACCESS_ATTEMPT",
        entityType: "security",
        entityId: targetGroupId,
        details: `Unauthorized attempt by user ${user.id} (${user.email}) to access group ${targetGroupId}.`,
        performedBy: user.id,
        performedByEmail: user.email
      }).catch((logErr) => console.error("Failed to write security audit log:", logErr));
      console.warn(
        `[SECURITY ALERT] Unauthorized cross-study access attempt: user "${user.id}" (${user.email}) requested group "${targetGroupId}". Access denied.`
      );
      res.status(403).json({ error: "FORBIDDEN", message: "Access denied: You are not a member of this research study." });
      return;
    }
    sendSafeErrorResponse(err, req, res, "AUTH_ERROR");
  }
};
var InvitationRateLimiter = class {
  constructor(options = {}) {
    this.ipBuckets = /* @__PURE__ */ new Map();
    this.userBuckets = /* @__PURE__ */ new Map();
    this.windowMs = options.windowMs || 60 * 1e3;
    this.maxPerIp = options.maxPerIp || 15;
    this.maxPerUser = options.maxPerUser || 15;
  }
  check(ip, userId) {
    const now = Date.now();
    let ipBucket = this.ipBuckets.get(ip);
    if (!ipBucket || now > ipBucket.resetAt) {
      ipBucket = { count: 0, resetAt: now + this.windowMs };
      this.ipBuckets.set(ip, ipBucket);
    }
    if (ipBucket.count >= this.maxPerIp) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((ipBucket.resetAt - now) / 1e3)) };
    }
    if (userId) {
      let userBucket = this.userBuckets.get(userId);
      if (!userBucket || now > userBucket.resetAt) {
        userBucket = { count: 0, resetAt: now + this.windowMs };
        this.userBuckets.set(userId, userBucket);
      }
      if (userBucket.count >= this.maxPerUser) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((userBucket.resetAt - now) / 1e3)) };
      }
    }
    ipBucket.count++;
    if (userId) {
      const userBucket = this.userBuckets.get(userId);
      if (userBucket) userBucket.count++;
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  reset() {
    this.ipBuckets.clear();
    this.userBuckets.clear();
  }
};
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "127.0.0.1";
}
var invitationRateLimiter = new InvitationRateLimiter();
var AuthRateLimiter = class {
  constructor(options = {}) {
    this.ipBuckets = /* @__PURE__ */ new Map();
    this.accountBuckets = /* @__PURE__ */ new Map();
    this.ipWindowMs = options.ipWindowMs || 60 * 1e3;
    this.maxRequestsPerIp = options.maxRequestsPerIp || 20;
    this.accountWindowMs = options.accountWindowMs || 15 * 60 * 1e3;
    this.maxFailedPerAccount = options.maxFailedPerAccount || 5;
  }
  checkIp(ip) {
    const now = Date.now();
    let bucket = this.ipBuckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.ipWindowMs };
      this.ipBuckets.set(ip, bucket);
    }
    if (bucket.count >= this.maxRequestsPerIp) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1e3))
      };
    }
    bucket.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  checkAccount(normalizedEmail) {
    const now = Date.now();
    const bucket = this.accountBuckets.get(normalizedEmail);
    if (!bucket) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (now > bucket.resetAt) {
      this.accountBuckets.delete(normalizedEmail);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (bucket.count >= this.maxFailedPerAccount) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1e3))
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  recordFailedAttempt(normalizedEmail) {
    const now = Date.now();
    let bucket = this.accountBuckets.get(normalizedEmail);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.accountWindowMs };
      this.accountBuckets.set(normalizedEmail, bucket);
    }
    bucket.count++;
  }
  recordSuccessfulAttempt(normalizedEmail) {
    this.accountBuckets.delete(normalizedEmail);
  }
  reset() {
    this.ipBuckets.clear();
    this.accountBuckets.clear();
  }
  cleanupExpired() {
    const now = Date.now();
    for (const [key, bucket] of this.ipBuckets.entries()) {
      if (now > bucket.resetAt) this.ipBuckets.delete(key);
    }
    for (const [key, bucket] of this.accountBuckets.entries()) {
      if (now > bucket.resetAt) this.accountBuckets.delete(key);
    }
  }
};
var authRateLimiter = new AuthRateLimiter();
var rateLimitInvitations = (req, res, next) => {
  const ip = getClientIp(req);
  const userId = req.user?.id;
  const result = invitationRateLimiter.check(ip, userId);
  if (!result.allowed) {
    db.recordAuditLog({
      action: "INVITATION_RATE_LIMIT_EXCEEDED",
      entityType: "security",
      details: `Rate limit exceeded for invitation operations from IP ${ip}${userId ? ` (user ${userId})` : ""}.`,
      performedBy: userId || "anonymous",
      performedByEmail: req.user?.email || "anonymous"
    }).catch(() => {
    });
    res.setHeader("Retry-After", result.retryAfterSeconds.toString());
    res.status(429).json({
      error: "TOO_MANY_REQUESTS",
      message: "Too many invitation attempts. Please wait before trying again."
    });
    return;
  }
  next();
};
if (!isProd) {
  app.post("/api/dev/reset-invitation-rate-limit", (_req, res) => {
    invitationRateLimiter.reset();
    res.json({ reset: true });
  });
  app.post("/api/dev/reset-auth-rate-limit", (_req, res) => {
    authRateLimiter.reset();
    res.json({ reset: true });
  });
}
var authenticateAppOwner = async (req, res, next) => {
  await authenticateToken(req, res, () => {
    if (!req.user || !db.isAppOwner(req.user.email)) {
      res.status(403).json({ error: "FORBIDDEN", message: "Access denied." });
      return;
    }
    next();
  });
};
function getGroupId(req) {
  const headerId = typeof req.headers["x-group-id"] === "string" && req.headers["x-group-id"].trim() ? req.headers["x-group-id"].trim() : null;
  const queryId = typeof req.query.groupId === "string" && req.query.groupId.trim() ? req.query.groupId.trim() : null;
  const bodyId = typeof req.body?.groupId === "string" && req.body.groupId.trim() ? req.body.groupId.trim() : null;
  if (headerId && queryId && headerId !== queryId) return null;
  if (headerId && bodyId && headerId !== bodyId) return null;
  if (queryId && bodyId && queryId !== bodyId) return null;
  return headerId || queryId || bodyId;
}
app.get("/api/legal/policies", (req, res) => {
  res.json({ policies: db.getLegalPolicies() });
});
app.get("/api/auth/team-capacity", async (req, res) => {
  res.json({
    registeredMembers: 0,
    availableSeats: 9999,
    isFull: false,
    note: "Flexible multi-member research teams supported with no arbitrary capacity limits."
  });
});
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || typeof displayName !== "string") {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Invalid request: email, password, and display name must be valid strings."
      });
      return;
    }
    const user = await db.registerUser({ email, password, displayName });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    const isBrowserClient = req.headers["x-requested-with"] === "XMLHttpRequest";
    res.status(201).json({ token, user, isBrowserClient: !!isBrowserClient });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "REGISTRATION_FAILED");
  }
});
app.post("/api/auth/login", async (req, res) => {
  const ip = getClientIp(req);
  const ipResult = authRateLimiter.checkIp(ip);
  if (!ipResult.allowed) {
    db.recordAuditLog({
      action: "AUTH_RATE_LIMIT_EXCEEDED",
      entityType: "security",
      details: `Authentication rate limit exceeded for IP ${ip}.`,
      performedBy: "anonymous",
      performedByEmail: "anonymous"
    }).catch(() => {
    });
    res.setHeader("Retry-After", ipResult.retryAfterSeconds.toString());
    res.status(429).json({
      error: "TOO_MANY_REQUESTS",
      message: "Too many authentication requests from this IP address. Please wait before trying again."
    });
    return;
  }
  try {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Email and password are required strings." });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const accountResult = authRateLimiter.checkAccount(normalizedEmail);
    if (!accountResult.allowed) {
      db.recordAuditLog({
        action: "AUTH_RATE_LIMIT_EXCEEDED",
        entityType: "security",
        details: `Account login rate limit exceeded for ${normalizedEmail} from IP ${ip}.`,
        performedBy: "anonymous",
        performedByEmail: normalizedEmail
      }).catch(() => {
      });
      res.setHeader("Retry-After", accountResult.retryAfterSeconds.toString());
      res.status(429).json({
        error: "TOO_MANY_REQUESTS",
        message: "Too many failed login attempts. Please wait before trying again."
      });
      return;
    }
    const user = await db.verifyUserCredentials({ email: normalizedEmail, password });
    if (!user) {
      authRateLimiter.recordFailedAttempt(normalizedEmail);
      res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
      return;
    }
    authRateLimiter.recordSuccessfulAttempt(normalizedEmail);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    const isBrowserClient = req.headers["x-requested-with"] === "XMLHttpRequest";
    res.json({ token, user, isBrowserClient: !!isBrowserClient });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "LOGIN_FAILED");
  }
});
app.post("/api/auth/google-sync", async (req, res) => {
  try {
    const { uid, email, displayName } = req.body || {};
    if (!uid || !email || typeof uid !== "string" || typeof email !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "UID and email are required as strings." });
      return;
    }
    if (displayName !== void 0 && typeof displayName !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Display name must be a string." });
      return;
    }
    const user = await db.syncGoogleProfile({
      uid,
      email,
      displayName: displayName || email.split("@")[0]
    });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    const isBrowserClient = req.headers["x-requested-with"] === "XMLHttpRequest";
    res.json({ token, user, isBrowserClient: !!isBrowserClient });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "GOOGLE_SYNC_FAILED");
  }
});
app.post("/api/auth/organization-login", async (req, res) => {
  const ip = getClientIp(req);
  const ipResult = authRateLimiter.checkIp(ip);
  if (!ipResult.allowed) {
    db.recordAuditLog({
      action: "AUTH_RATE_LIMIT_EXCEEDED",
      entityType: "security",
      details: `Authentication rate limit exceeded for organization login from IP ${ip}.`,
      performedBy: "anonymous",
      performedByEmail: "anonymous"
    }).catch(() => {
    });
    res.setHeader("Retry-After", ipResult.retryAfterSeconds.toString());
    res.status(429).json({
      error: "TOO_MANY_REQUESTS",
      message: "Too many authentication requests from this IP address. Please wait before trying again."
    });
    return;
  }
  try {
    const { email, password, uid, displayName } = req.body;
    let user = null;
    if (email && password) {
      if (typeof email !== "string" || typeof password !== "string") {
        res.status(400).json({ error: "BAD_REQUEST", message: "Email and password must be strings." });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const accountResult = authRateLimiter.checkAccount(normalizedEmail);
      if (!accountResult.allowed) {
        db.recordAuditLog({
          action: "AUTH_RATE_LIMIT_EXCEEDED",
          entityType: "security",
          details: `Organization login rate limit exceeded for ${normalizedEmail} from IP ${ip}.`,
          performedBy: "anonymous",
          performedByEmail: normalizedEmail
        }).catch(() => {
        });
        res.setHeader("Retry-After", accountResult.retryAfterSeconds.toString());
        res.status(429).json({
          error: "TOO_MANY_REQUESTS",
          message: "Too many failed login attempts. Please wait before trying again."
        });
        return;
      }
      user = await db.verifyUserCredentials({ email: normalizedEmail, password });
      if (!user) {
        authRateLimiter.recordFailedAttempt(normalizedEmail);
        res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials." });
        return;
      }
      authRateLimiter.recordSuccessfulAttempt(normalizedEmail);
    } else if (uid && email) {
      user = await db.syncGoogleProfile({
        uid,
        email,
        displayName: displayName || email.split("@")[0]
      });
    }
    if (!user) {
      res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials." });
      return;
    }
    if (!db.isAppOwner(user.email)) {
      res.status(403).json({ error: "FORBIDDEN", message: "Access denied." });
      return;
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    const isBrowserClient = req.headers["x-requested-with"] === "XMLHttpRequest";
    res.json({ token, user, isBrowserClient: !!isBrowserClient });
  } catch (err) {
    if (err instanceof AccountSuspendedError) {
      res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: err.message });
      return;
    }
    sendSafeErrorResponse(err, req, res, "LOGIN_FAILED");
  }
});
app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME] || req.headers["authorization"]?.split(" ")[1];
  if (token) {
    db.revokeSessionToken(token);
  }
  res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
  res.json({ success: true, message: "Logged out successfully." });
});
app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Current password and new password are required strings."
      });
      return;
    }
    if (confirmPassword !== void 0 && typeof confirmPassword === "string") {
      if (confirmPassword !== newPassword) {
        res.status(400).json({
          error: "MISMATCH",
          message: "Passwords do not match."
        });
        return;
      }
    }
    await db.updateUserPassword({
      userId: req.user.id,
      currentPassword,
      newPassword
    });
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "PASSWORD_CHANGE_FAILED");
  }
});
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, resetToken, newPassword, confirmPassword } = req.body || {};
    if (typeof email !== "string" || typeof resetToken !== "string" || typeof newPassword !== "string") {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Email, reset token, and new password are required strings."
      });
      return;
    }
    if (confirmPassword !== void 0 && typeof confirmPassword === "string") {
      if (confirmPassword !== newPassword) {
        res.status(400).json({
          error: "MISMATCH",
          message: "Passwords do not match."
        });
        return;
      }
    }
    await db.resetPasswordWithToken({
      email,
      resetToken,
      newPassword
    });
    res.json({ success: true, message: "Password reset successfully." });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "PASSWORD_RESET_FAILED");
  }
});
app.post("/api/auth/admin/set-user-password", authenticateToken, async (req, res) => {
  try {
    if (!db.isAppOwner(req.user.email)) {
      res.status(403).json({ error: "FORBIDDEN", message: "Access denied." });
      return;
    }
    const { targetUserId, newPassword } = req.body || {};
    if (typeof targetUserId !== "string" || typeof newPassword !== "string") {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "targetUserId and newPassword are required strings."
      });
      return;
    }
    await db.adminResetUserPassword({
      adminUserId: req.user.id,
      targetUserId,
      newPassword
    });
    res.json({ success: true, message: "User password reset successfully." });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "ADMIN_PASSWORD_RESET_FAILED");
  }
});
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});
app.get("/api/organizations", authenticateToken, async (req, res) => {
  try {
    const organizations = await db.getUserOrganizations(req.user.id);
    res.json({ organizations });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.post("/api/organizations", authenticateToken, async (req, res) => {
  try {
    const { name, description, institution, contactEmail } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Organization name is required." });
      return;
    }
    if (description !== void 0 && typeof description !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Description must be a string." });
      return;
    }
    if (institution !== void 0 && typeof institution !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Institution must be a string." });
      return;
    }
    if (contactEmail !== void 0 && typeof contactEmail !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Contact email must be a string." });
      return;
    }
    const organization = await db.createOrganization(req.user.id, req.body);
    res.status(201).json({ organization });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "CREATE_ORG_FAILED");
  }
});
app.get("/api/organizations/:id", authenticateToken, async (req, res) => {
  try {
    if (!req.params.id || typeof req.params.id !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Organization ID is required." });
      return;
    }
    const organization = await db.getOrganizationById(req.params.id);
    if (!organization) {
      res.status(404).json({ error: "NOT_FOUND", message: "Organization not found." });
      return;
    }
    res.json({ organization });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/groups", authenticateToken, async (req, res) => {
  try {
    const groups = await db.getUserGroups(req.user.id);
    res.json({ groups });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.post("/api/groups", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      studyTitle,
      studyType,
      subjectTerminology,
      targetSampleSize,
      description,
      institution,
      organizationId,
      customFields
    } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Research study / group name is required." });
      return;
    }
    if (!studyTitle || typeof studyTitle !== "string" || !studyTitle.trim()) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Study / Thesis title is required." });
      return;
    }
    if (description !== void 0 && typeof description !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Description must be a string." });
      return;
    }
    if (institution !== void 0 && typeof institution !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Institution must be a string." });
      return;
    }
    if (organizationId !== void 0 && typeof organizationId !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Organization ID must be a string." });
      return;
    }
    if (customFields !== void 0 && !Array.isArray(customFields)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Custom fields must be an array." });
      return;
    }
    const group = await db.createGroup(req.user.id, {
      name,
      studyTitle,
      studyType,
      subjectTerminology,
      targetSampleSize,
      description,
      institution,
      organizationId,
      customFields
    });
    res.status(201).json({ group });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "CREATE_GROUP_FAILED");
  }
});
app.get("/api/groups/:groupId", authenticateToken, async (req, res) => {
  try {
    const group = await db.getGroupById(req.params.groupId, req.user.id);
    res.json({ group });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.patch("/api/groups/:groupId/settings", authenticateToken, async (req, res) => {
  try {
    const { name, studyTitle, description, institution, organizationId, customFields } = req.body || {};
    if (name !== void 0 && (typeof name !== "string" || !name.trim())) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Study name must be a non-empty string." });
      return;
    }
    if (studyTitle !== void 0 && (typeof studyTitle !== "string" || !studyTitle.trim())) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Study title must be a non-empty string." });
      return;
    }
    if (description !== void 0 && typeof description !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Description must be a string." });
      return;
    }
    if (institution !== void 0 && typeof institution !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Institution must be a string." });
      return;
    }
    if (organizationId !== void 0 && typeof organizationId !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Organization ID must be a string." });
      return;
    }
    if (customFields !== void 0 && !Array.isArray(customFields)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Custom fields must be an array." });
      return;
    }
    const group = await db.updateGroupSettings(req.params.groupId, req.user.id, req.body || {});
    res.json({ group });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "UPDATE_FAILED");
  }
});
app.post("/api/groups/:groupId/invitations", authenticateToken, async (req, res) => {
  try {
    const { intendedEmail } = req.body || {};
    if (intendedEmail !== void 0 && typeof intendedEmail !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Intended email must be a string." });
      return;
    }
    const invitation = await db.createInvitation(
      req.params.groupId,
      req.user.id,
      intendedEmail
    );
    res.status(201).json({ invitation });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "INVITATION_FAILED");
  }
});
app.get("/api/invitations/:code", rateLimitInvitations, async (req, res) => {
  try {
    const details = await db.getInvitationDetails(req.params.code);
    res.json(details);
  } catch {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) || req.socket.remoteAddress || "127.0.0.1";
    db.recordAuditLog({
      action: "INVALID_INVITATION_LOOKUP_ATTEMPT",
      entityType: "security",
      details: `Invalid or expired invitation lookup attempt from IP ${ip}.`,
      performedBy: "anonymous",
      performedByEmail: "anonymous"
    }).catch(() => {
    });
    res.status(404).json({ error: "INVALID_INVITATION", message: "Invalid or expired invitation code." });
  }
});
app.post(
  "/api/invitations/:code/accept",
  authenticateToken,
  rateLimitInvitations,
  async (req, res) => {
    try {
      const group = await db.acceptInvitation(req.params.code, req.user);
      res.json({ success: true, group });
    } catch {
      db.recordAuditLog({
        action: "INVALID_INVITATION_ACCEPT_ATTEMPT",
        entityType: "security",
        details: `Invalid or expired invitation acceptance attempt by user ${req.user.id} (${req.user.email}).`,
        performedBy: req.user.id,
        performedByEmail: req.user.email
      }).catch(() => {
      });
      res.status(400).json({ error: "INVALID_INVITATION", message: "Invalid or expired invitation code." });
    }
  }
);
app.delete("/api/groups/:groupId/members/:targetUserId", authenticateToken, async (req, res) => {
  try {
    const group = await db.removeMember(req.params.groupId, req.user.id, req.params.targetUserId);
    res.json({ success: true, group });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "REMOVE_FAILED");
  }
});
app.get("/api/groups/:groupId/files", authenticateToken, async (req, res) => {
  try {
    const files = await db.getGroupFiles(req.params.groupId, req.user.id);
    res.json({ files });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.post("/api/groups/:groupId/files", authenticateToken, async (req, res) => {
  try {
    const { name, size, mimeType, category, fileData } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "BAD_REQUEST", message: "File name is required." });
      return;
    }
    if (mimeType !== void 0 && typeof mimeType !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "MIME type must be a string." });
      return;
    }
    const file = await db.uploadGroupFile({
      groupId: req.params.groupId,
      userId: req.user.id,
      name,
      size: typeof size === "number" ? size : 0,
      mimeType: mimeType || "application/octet-stream",
      category,
      fileData
    });
    res.status(201).json({ file });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "UPLOAD_FAILED");
  }
});
app.delete("/api/groups/:groupId/files/:fileId", authenticateToken, async (req, res) => {
  try {
    const result = await db.deleteGroupFile(req.params.groupId, req.params.fileId, req.user.id);
    res.json(result);
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "DELETE_FILE_FAILED");
  }
});
app.get("/api/cases/check/:patientId", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const patientId = req.params.patientId;
    if (!patientId || typeof patientId !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Patient ID is required." });
      return;
    }
    const result = await db.checkPatientId(groupId, patientId, req.user.id);
    res.json(result);
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "VALIDATION_ERROR");
  }
});
app.post("/api/cases/register", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const { patientId, patientName, diagnosis, drugNames, customValues } = req.body || {};
    if (!patientId || typeof patientId !== "string" || !patientId.trim()) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Participant / Patient ID is required." });
      return;
    }
    if (patientName !== void 0 && typeof patientName !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Participant name must be a string." });
      return;
    }
    if (diagnosis !== void 0 && typeof diagnosis !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Condition / diagnosis must be a string." });
      return;
    }
    if (drugNames !== void 0 && typeof drugNames !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Medication / intervention details must be a string." });
      return;
    }
    if (customValues !== void 0 && (typeof customValues !== "object" || customValues === null || Array.isArray(customValues))) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Custom field values must be an object." });
      return;
    }
    const newCase = await db.registerCase({
      groupId,
      patientId,
      assignedToUserId: req.user.id,
      patientName,
      diagnosis,
      drugNames,
      customValues
    });
    res.status(201).json({ success: true, case: newCase });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "REGISTRATION_ERROR");
  }
});
app.get("/api/cases", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const { search, memberId, status } = req.query;
    const cases = await db.getAllCases(groupId, req.user.id, {
      search: typeof search === "string" ? search : void 0,
      memberId: typeof memberId === "string" ? memberId : void 0,
      status: typeof status === "string" ? status : void 0
    });
    res.json({ cases });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/cases/export/csv", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const group = await db.getGroupById(groupId, req.user.id);
    const cases = await db.getAllCases(groupId, req.user.id);
    const headers = [
      "Research Study",
      "Thesis Title",
      "Record ID",
      "Status",
      "Assigned Researcher",
      "Researcher Email",
      "Subject / Participant Name",
      "Condition / Diagnosis",
      "Intervention / Details",
      "Enrollment Date (Local)",
      "Registration Timestamp (ISO)",
      "Last Updated (ISO)"
    ];
    const escapeVal = (v) => {
      if (v === null || v === void 0) return '""';
      const s = String(v).trim();
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return `"${s}"`;
    };
    const rows = cases.map(
      (c) => [
        escapeVal(group.name),
        escapeVal(group.studyTitle),
        escapeVal(c.patient_id),
        escapeVal(c.status),
        escapeVal(c.assigned_name || "Unassigned"),
        escapeVal(c.assigned_email || ""),
        escapeVal(c.patient_name || ""),
        escapeVal(c.diagnosis || ""),
        escapeVal(c.drug_names || ""),
        escapeVal(new Date(c.registered_at).toLocaleString()),
        escapeVal(c.registered_at),
        escapeVal(c.updated_at)
      ].join(",")
    );
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const safeGroupName = group.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeGroupName}_records_export_${dateStr}.csv"`
    );
    res.send(csvContent);
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/cases/my", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const search = typeof req.query.search === "string" ? req.query.search : void 0;
    const cases = await db.getMyCases(groupId, req.user.id, search);
    res.json({ cases });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.patch("/api/cases/:id/status", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const { status } = req.body || {};
    if (!status || typeof status !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Status is required as a string." });
      return;
    }
    const updated = await db.updateCaseStatus({
      groupId,
      caseId: req.params.id,
      userId: req.user.id,
      newStatus: status
    });
    res.json({ success: true, case: updated });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "UPDATE_ERROR");
  }
});
app.patch("/api/cases/:id/details", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const { patientName, diagnosis, drugNames, customValues } = req.body || {};
    if (patientName !== void 0 && typeof patientName !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Participant name must be a string." });
      return;
    }
    if (diagnosis !== void 0 && typeof diagnosis !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Condition / diagnosis must be a string." });
      return;
    }
    if (drugNames !== void 0 && typeof drugNames !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Medication / intervention details must be a string." });
      return;
    }
    if (customValues !== void 0 && (typeof customValues !== "object" || customValues === null || Array.isArray(customValues))) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Custom field values must be an object." });
      return;
    }
    const updated = await db.updateCaseDetails({
      groupId,
      caseId: req.params.id,
      userId: req.user.id,
      patientName,
      diagnosis,
      drugNames,
      customValues
    });
    res.json({ success: true, case: updated });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "UPDATE_ERROR");
  }
});
app.delete("/api/cases/:id", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const result = await db.deleteCase({
      groupId,
      caseId: req.params.id,
      userId: req.user.id
    });
    res.json({ success: true, message: `Record ID ${result.patientId} removed successfully.`, result });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "DELETE_ERROR");
  }
});
app.get("/api/cases/stats", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const stats = await db.getDashboardStats(groupId, req.user.id);
    res.json({ stats });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/cases/team-summary", authenticateToken, async (req, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: "MISSING_GROUP", message: "Research group ID is required." });
      return;
    }
    const summary = await db.getTeamSummary(groupId, req.user.id);
    res.json({ summary });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/app-owner/overview", authenticateAppOwner, async (req, res) => {
  try {
    const stats = await db.getAppOwnerOverview();
    res.json({ stats });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/app-owner/organizations", authenticateAppOwner, async (req, res) => {
  try {
    const organizations = await db.getAppOwnerOrganizations();
    res.json({ organizations });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/app-owner/users", authenticateAppOwner, async (req, res) => {
  try {
    const { search, status } = req.query;
    const users = await db.getAppOwnerUsers({
      search: typeof search === "string" ? search : void 0,
      status: typeof status === "string" ? status : void 0
    });
    res.json({ users });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.patch("/api/app-owner/users/:id/status", authenticateAppOwner, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status || typeof status !== "string" || !["active", "suspended"].includes(status)) {
      res.status(400).json({ error: "BAD_REQUEST", message: 'Valid status ("active" or "suspended") is required.' });
      return;
    }
    const updated = await db.setAppOwnerUserStatus(req.params.id, status, req.user.email);
    res.json({ success: true, user: updated });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "ACTION_FAILED");
  }
});
app.get("/api/app-owner/groups", authenticateAppOwner, async (req, res) => {
  try {
    const { search, status } = req.query;
    const groups = await db.getAppOwnerGroups({
      search: typeof search === "string" ? search : void 0,
      status: typeof status === "string" ? status : void 0
    });
    res.json({ groups });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.patch("/api/app-owner/groups/:id/status", authenticateAppOwner, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status || typeof status !== "string" || !["active", "archived", "suspended"].includes(status)) {
      res.status(400).json({ error: "BAD_REQUEST", message: 'Valid status ("active", "archived", or "suspended") is required.' });
      return;
    }
    const updated = await db.setAppOwnerGroupStatus(req.params.id, status, req.user.email);
    res.json({ success: true, group: updated });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "ACTION_FAILED");
  }
});
app.delete("/api/app-owner/groups/:id", authenticateAppOwner, async (req, res) => {
  try {
    const result = await db.deleteAppOwnerGroup(req.params.id, req.user.email);
    res.json(result);
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "DELETE_FAILED");
  }
});
app.get("/api/app-owner/audit-logs", authenticateAppOwner, async (req, res) => {
  try {
    const { limit, action, entityType } = req.query;
    const logs = db.getAuditLogs({
      limit: limit && !isNaN(parseInt(limit, 10)) ? parseInt(limit, 10) : 100,
      action: typeof action === "string" ? action : void 0,
      entityType: typeof entityType === "string" ? entityType : void 0
    });
    res.json({ logs });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.get("/api/app-owner/settings", authenticateAppOwner, (req, res) => {
  try {
    const settings = db.getAppSettings();
    res.json({ settings });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "SERVER_ERROR");
  }
});
app.patch("/api/app-owner/settings", authenticateAppOwner, async (req, res) => {
  try {
    const updated = await db.updateAppSettings(req.body || {}, req.user.email);
    res.json({ settings: updated });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "UPDATE_FAILED");
  }
});
app.patch("/api/app-owner/legal-policies/:id", authenticateAppOwner, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Policy content is required as a string." });
      return;
    }
    const updated = await db.updateLegalPolicy(req.params.id, content, req.user.email);
    res.json({ policy: updated });
  } catch (err) {
    sendSafeErrorResponse(err, req, res, "UPDATE_FAILED");
  }
});
app.get(
  "/api/cases/events",
  authenticateToken,
  requireGroupMembership,
  (req, res) => {
    const targetGroupId = req.targetGroupId;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: "connected", groupId: targetGroupId })}

`);
    const unsubscribe = db.subscribe((event, eventGroupId, payload) => {
      try {
        if (eventGroupId === targetGroupId) {
          res.write(`data: ${JSON.stringify({ type: event, groupId: eventGroupId, payload })}

`);
        }
      } catch (sseErr) {
        logServerError(sseErr, req, "SSE Event Dispatch Error");
      }
    });
    const heartbeat = setInterval(() => {
      try {
        if (!res.writableEnded) {
          res.write(": heartbeat\n\n");
        }
      } catch (hbErr) {
        logServerError(hbErr, req, "SSE Heartbeat Error");
      }
    }, 2e4);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
);
if (!isProd) {
  app.get("/api/dev/force-error", (req, _res) => {
    throw new Error("Controlled test server error for SEC-007 verification");
  });
  app.get("/api/dev/force-type-error", (_req, _res) => {
    const obj = void 0;
    return obj.trim();
  });
}
app.all(["/api", "/api/*"], (req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "API endpoint not found."
  });
});
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  sendSafeErrorResponse(err, req, res);
});
async function startServer() {
  const distPath = path2.resolve(process.cwd(), "dist");
  const indexPath = path2.join(distPath, "index.html");
  const hasDist = fs2.existsSync(indexPath);
  if (isProd && hasDist) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(indexPath);
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Thesis Progress Tracker] Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Fatal server start error:", err);
  process.exit(1);
});
export {
  AUTH_COOKIE_NAME,
  AuthRateLimiter,
  COOKIE_MAX_AGE_MS,
  InvitationRateLimiter,
  authRateLimiter,
  getAuthCookieOptions,
  getClientIp,
  invitationRateLimiter,
  logServerError,
  securityHeadersMiddleware,
  sendSafeErrorResponse
};
