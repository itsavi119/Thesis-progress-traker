import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import {
  db,
  DuplicateCaseError,
  UnauthorizedCaseActionError,
  UnauthorizedGroupActionError,
  GroupNotFoundError,
  AccountSuspendedError,
} from './src/server/db.js';
import type { UserProfile } from './src/types/index.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'thesis-tracker-secure-secret-token-key-2026';

app.use(express.json({ limit: '25mb' }));

// Extend Express Request type for authenticated user
export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

// Authentication Middleware
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await db.findProfileById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'INVALID_TOKEN', message: 'User profile not found.' });
      return;
    }

    if (user.status === 'suspended') {
      res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Your account has been deactivated. Please contact support.' });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid or expired session token.' });
    return;
  }
};

// Strict App Owner Authorization Middleware
const authenticateAppOwner = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  await authenticateToken(req, res, () => {
    if (!req.user || !db.isAppOwner(req.user.email)) {
      // Generic access denied - NEVER reveal App Owner identity or technical internals
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' });
      return;
    }
    next();
  });
};

// Helper to extract and validate required groupId from request
function getGroupId(req: AuthenticatedRequest): string | null {
  const headerId = req.headers['x-group-id'];
  if (typeof headerId === 'string' && headerId.trim()) return headerId.trim();
  const queryId = req.query.groupId;
  if (typeof queryId === 'string' && queryId.trim()) return queryId.trim();
  const bodyId = req.body?.groupId;
  if (typeof bodyId === 'string' && bodyId.trim()) return bodyId.trim();
  return null;
}

// --- PUBLIC & AUTHENTICATED LEGAL POLICIES ---

app.get('/api/legal/policies', (req, res) => {
  res.json({ policies: db.getLegalPolicies() });
});

// --- AUTHENTICATION ROUTES ---

app.get('/api/auth/team-capacity', async (req, res) => {
  res.json({
    registeredMembers: 0,
    availableSeats: 9999,
    isFull: false,
    note: 'Flexible multi-member research teams supported with no arbitrary capacity limits.',
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    const user = await db.registerUser({ email, password, displayName });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err: any) {
    res.status(400).json({ error: 'REGISTRATION_FAILED', message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Email and password are required.' });
      return;
    }
    const user = await db.verifyUserCredentials({ email, password });
    if (!user) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      return;
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err: any) {
    if (err instanceof AccountSuspendedError) {
      res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: err.message });
      return;
    }
    console.error('[Auth Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

app.post('/api/auth/google-sync', async (req, res) => {
  try {
    const { uid, email, displayName } = req.body;
    if (!uid || !email) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'UID and email are required.' });
      return;
    }

    const user = await db.syncGoogleProfile({
      uid,
      email,
      displayName: displayName || email.split('@')[0],
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err: any) {
    if (err instanceof AccountSuspendedError) {
      res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: err.message });
      return;
    }
    console.error('[Google Sync Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// Organization Login entrypoint: Validates credentials and verifies App Owner / Org Admin authorization
app.post('/api/auth/organization-login', async (req, res) => {
  try {
    const { email, password, uid, displayName } = req.body;
    let user: UserProfile | null = null;

    if (email && password) {
      user = await db.verifyUserCredentials({ email, password });
    } else if (uid && email) {
      user = await db.syncGoogleProfile({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
      });
    }

    if (!user) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' });
      return;
    }

    // Server-side App Owner check
    if (!db.isAppOwner(user.email)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' });
      return;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err: any) {
    if (err instanceof AccountSuspendedError) {
      res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: err.message });
      return;
    }
    res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// --- ORGANIZATIONS MANAGEMENT ---

app.get('/api/organizations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const organizations = await db.getUserOrganizations(req.user!.id);
    res.json({ organizations });
  } catch (err: any) {
    console.error('[Get Orgs Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

app.post('/api/organizations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const organization = await db.createOrganization(req.user!.id, req.body);
    res.status(201).json({ organization });
  } catch (err: any) {
    res.status(400).json({ error: 'CREATE_ORG_FAILED', message: err.message });
  }
});

app.get('/api/organizations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const organization = await db.getOrganizationById(req.params.id);
    if (!organization) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' });
      return;
    }
    res.json({ organization });
  } catch (err: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// --- RESEARCH GROUPS / STUDIES MANAGEMENT ---

// List all groups that the authenticated user belongs to
app.get('/api/groups', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groups = await db.getUserGroups(req.user!.id);
    res.json({ groups });
  } catch (err: any) {
    console.error('[Get Groups Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// Create a new research study/group (creator becomes Owner)
app.post('/api/groups', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
      customFields,
    } = req.body;

    const group = await db.createGroup(req.user!.id, {
      name,
      studyTitle,
      studyType,
      subjectTerminology,
      targetSampleSize,
      description,
      institution,
      organizationId,
      customFields,
    });
    res.status(201).json({ group });
  } catch (err: any) {
    res.status(400).json({ error: 'CREATE_GROUP_FAILED', message: err.message });
  }
});

// Get a specific research group details (verifies membership)
app.get('/api/groups/:groupId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.getGroupById(req.params.groupId, req.user!.id);
    res.json({ group });
  } catch (err: any) {
    if (err instanceof GroupNotFoundError) {
      res.status(404).json({ error: 'NOT_FOUND', message: err.message });
      return;
    }
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[Get Group Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// Update group settings (Owner only)
app.patch('/api/groups/:groupId/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.updateGroupSettings(req.params.groupId, req.user!.id, req.body);
    res.json({ group });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

// Generate an invitation for a group (Owner only)
app.post('/api/groups/:groupId/invitations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const invitation = await db.createInvitation(
      req.params.groupId,
      req.user!.id,
      req.body.intendedEmail
    );
    res.status(201).json({ invitation });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'INVITATION_FAILED', message: err.message });
  }
});

// Inspect invitation code details before joining
app.get('/api/invitations/:code', async (req, res) => {
  try {
    const details = await db.getInvitationDetails(req.params.code);
    res.json(details);
  } catch (err: any) {
    res.status(404).json({ error: 'INVALID_INVITE', message: err.message });
  }
});

// Accept invitation code
app.post('/api/invitations/:code/accept', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.acceptInvitation(req.params.code, req.user!);
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: 'ACCEPT_FAILED', message: err.message });
  }
});

// Remove a member from a group (Owner only)
app.delete('/api/groups/:groupId/members/:targetUserId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.removeMember(req.params.groupId, req.user!.id, req.params.targetUserId);
    res.json({ success: true, group });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'REMOVE_FAILED', message: err.message });
  }
});

// --- RESEARCH FILES MANAGEMENT ---

app.get('/api/groups/:groupId/files', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const files = await db.getGroupFiles(req.params.groupId, req.user!.id);
    res.json({ files });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

app.post('/api/groups/:groupId/files', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, size, mimeType, category, fileData } = req.body;
    if (!name) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'File name is required.' });
      return;
    }
    const file = await db.uploadGroupFile({
      groupId: req.params.groupId,
      userId: req.user!.id,
      name,
      size: size || 0,
      mimeType: mimeType || 'application/octet-stream',
      category,
      fileData,
    });
    res.status(201).json({ file });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'UPLOAD_FAILED', message: err.message });
  }
});

app.delete('/api/groups/:groupId/files/:fileId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.deleteGroupFile(req.params.groupId, req.params.fileId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'DELETE_FILE_FAILED', message: err.message });
  }
});

// --- GROUP-SCOPED RESEARCH RECORDS OPERATIONS ---

// Check Record ID within group
app.get('/api/cases/check/:patientId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const result = await db.checkPatientId(groupId, req.params.patientId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message });
  }
});

// Register Case/Record (Atomic with strict group-scoped duplicate guard)
app.post('/api/cases/register', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const { patientId, patientName, diagnosis, drugNames, customValues } = req.body;
    if (!patientId) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Participant / Patient ID is required.' });
      return;
    }

    const newCase = await db.registerCase({
      groupId,
      patientId,
      assignedToUserId: req.user!.id,
      patientName,
      diagnosis,
      drugNames,
      customValues,
    });

    res.status(201).json({ success: true, case: newCase });
  } catch (err: any) {
    if (err instanceof DuplicateCaseError) {
      res.status(409).json({
        error: 'DUPLICATE_CASE',
        message: 'Record Already Registered',
        case: err.existingCase,
      });
      return;
    }
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'REGISTRATION_ERROR', message: err.message });
  }
});

// Get All Cases in group
app.get('/api/cases', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const { search, memberId, status } = req.query as {
      search?: string;
      memberId?: string;
      status?: string;
    };

    const cases = await db.getAllCases(groupId, req.user!.id, { search, memberId, status });
    res.json({ cases });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[Get Cases Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// CSV Export Endpoint (scoped strictly to group)
app.get('/api/cases/export/csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const group = await db.getGroupById(groupId, req.user!.id);
    const cases = await db.getAllCases(groupId, req.user!.id);

    const headers = [
      'Research Study',
      'Thesis Title',
      'Record ID',
      'Status',
      'Assigned Researcher',
      'Researcher Email',
      'Subject / Participant Name',
      'Condition / Diagnosis',
      'Intervention / Details',
      'Enrollment Date (Local)',
      'Registration Timestamp (ISO)',
      'Last Updated (ISO)',
    ];

    const escapeVal = (v: any) => {
      if (v === null || v === undefined) return '""';
      const s = String(v).trim();
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return `"${s}"`;
    };

    const rows = cases.map((c) =>
      [
        escapeVal(group.name),
        escapeVal(group.studyTitle),
        escapeVal(c.patient_id),
        escapeVal(c.status),
        escapeVal(c.assigned_name || 'Unassigned'),
        escapeVal(c.assigned_email || ''),
        escapeVal(c.patient_name || ''),
        escapeVal(c.diagnosis || ''),
        escapeVal(c.drug_names || ''),
        escapeVal(new Date(c.registered_at).toLocaleString()),
        escapeVal(c.registered_at),
        escapeVal(c.updated_at),
      ].join(',')
    );

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const safeGroupName = group.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeGroupName}_records_export_${dateStr}.csv"`
    );
    res.send(csvContent);
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[Export CSV Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// Get My Cases in group
app.get('/api/cases/my', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const cases = await db.getMyCases(groupId, req.user!.id, search);
    res.json({ cases });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[My Cases Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// Update Case Status
app.patch('/api/cases/:id/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Status is required.' });
      return;
    }

    const updated = await db.updateCaseStatus({
      groupId,
      caseId: req.params.id,
      userId: req.user!.id,
      newStatus: status,
    });

    res.json({ success: true, case: updated });
  } catch (err: any) {
    if (err instanceof UnauthorizedCaseActionError || err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'UPDATE_ERROR', message: err.message });
  }
});

// Update Case Details
app.patch('/api/cases/:id/details', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const { patientName, diagnosis, drugNames, customValues } = req.body;
    const updated = await db.updateCaseDetails({
      groupId,
      caseId: req.params.id,
      userId: req.user!.id,
      patientName,
      diagnosis,
      drugNames,
      customValues,
    });

    res.json({ success: true, case: updated });
  } catch (err: any) {
    if (err instanceof UnauthorizedCaseActionError || err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'UPDATE_ERROR', message: err.message });
  }
});

// Delete Case record
app.delete('/api/cases/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const result = await db.deleteCase({
      groupId,
      caseId: req.params.id,
      userId: req.user!.id,
    });

    res.json({ success: true, message: `Record ID ${result.patientId} removed successfully.`, result });
  } catch (err: any) {
    if (err instanceof UnauthorizedCaseActionError || err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    res.status(400).json({ error: 'DELETE_ERROR', message: err.message });
  }
});

// Dashboard Stats for group
app.get('/api/cases/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const stats = await db.getDashboardStats(groupId, req.user!.id);
    res.json({ stats });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[Dashboard Stats Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// Team Summary for group
app.get('/api/cases/team-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groupId = getGroupId(req);
    if (!groupId) {
      res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
      return;
    }

    const summary = await db.getTeamSummary(groupId, req.user!.id);
    res.json({ summary });
  } catch (err: any) {
    if (err instanceof UnauthorizedGroupActionError) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[Team Summary Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// =========================================================================
// --- APP OWNER / ORGANIZATION ADMINISTRATION ENDPOINTS ---
// (Protected strictly with authenticateAppOwner middleware)
// =========================================================================

// 1. Overview statistics
app.get('/api/app-owner/overview', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await db.getAppOwnerOverview();
    res.json({ stats });
  } catch (err: any) {
    console.error('[App Owner Overview Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// 2. Organizations list
app.get('/api/app-owner/organizations', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const organizations = await db.getAppOwnerOrganizations();
    res.json({ organizations });
  } catch (err: any) {
    console.error('[App Owner Orgs Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// 3. User list
app.get('/api/app-owner/users', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string };
    const users = await db.getAppOwnerUsers({ search, status });
    res.json({ users });
  } catch (err: any) {
    console.error('[App Owner Users Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// 4. User status management (suspend / reactivate)
app.patch('/api/app-owner/users/:id/status', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body;
    if (!status || !['active', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid status ("active" or "suspended") is required.' });
      return;
    }

    const updated = await db.setAppOwnerUserStatus(req.params.id, status, req.user!.email);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'ACTION_FAILED', message: err.message });
  }
});

// 5. Groups / Studies list
app.get('/api/app-owner/groups', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string };
    const groups = await db.getAppOwnerGroups({ search, status });
    res.json({ groups });
  } catch (err: any) {
    console.error('[App Owner Groups Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// 6. Group status management
app.patch('/api/app-owner/groups/:id/status', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body;
    if (!status || !['active', 'archived', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid status ("active", "archived", or "suspended") is required.' });
      return;
    }

    const updated = await db.setAppOwnerGroupStatus(req.params.id, status, req.user!.email);
    res.json({ success: true, group: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'ACTION_FAILED', message: err.message });
  }
});

// 7. Delete group (App Owner)
app.delete('/api/app-owner/groups/:id', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.deleteAppOwnerGroup(req.params.id, req.user!.email);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'DELETE_FAILED', message: err.message });
  }
});

// 8. Audit log list
app.get('/api/app-owner/audit-logs', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { limit, action, entityType } = req.query as { limit?: string; action?: string; entityType?: string };
    const logs = db.getAuditLogs({
      limit: limit ? parseInt(limit, 10) : 100,
      action,
      entityType,
    });
    res.json({ logs });
  } catch (err: any) {
    console.error('[Audit Logs Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

// 9. Application settings
app.get('/api/app-owner/settings', authenticateAppOwner, (req: AuthenticatedRequest, res) => {
  try {
    const settings = db.getAppSettings();
    res.json({ settings });
  } catch (err: any) {
    console.error('[App Settings Error]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred. Please try again.' });
  }
});

app.patch('/api/app-owner/settings', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await db.updateAppSettings(req.body, req.user!.email);
    res.json({ settings: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

// 10. Legal Policy update (App Owner)
app.patch('/api/app-owner/legal-policies/:id', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Policy content is required.' });
      return;
    }

    const updated = await db.updateLegalPolicy(req.params.id, content, req.user!.email);
    res.json({ policy: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

// --- REAL-TIME SSE STREAM (Group-Scoped) ---

app.get('/api/cases/events', async (req, res) => {
  const token = (req.query.token as string) || (req.headers['authorization']?.split(' ')[1] as string);
  const targetGroupId = req.query.groupId as string;

  if (!token) {
    res.status(401).send('Authentication token required.');
    return;
  }

  let verifiedUser: UserProfile | null = null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    verifiedUser = await db.findProfileById(payload.userId);
  } catch {
    res.status(403).send('Invalid token.');
    return;
  }

  if (!verifiedUser || verifiedUser.status === 'suspended') {
    res.status(401).send('User not found or suspended.');
    return;
  }

  if (targetGroupId) {
    try {
      await db.getGroupById(targetGroupId, verifiedUser.id);
    } catch {
      res.status(403).send('Unauthorized for requested group events.');
      return;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', groupId: targetGroupId })}\n\n`);

  const unsubscribe = db.subscribe((event, eventGroupId, payload) => {
    if (!targetGroupId || targetGroupId === eventGroupId) {
      res.write(`data: ${JSON.stringify({ type: event, groupId: eventGroupId, payload })}\n\n`);
    }
  });

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// Frontend Serving
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Thesis Case Tracker] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
  process.exit(1);
});
