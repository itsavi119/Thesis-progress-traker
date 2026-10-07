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
  StoredGroup,
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

export interface GroupAuthorizedRequest extends AuthenticatedRequest {
  targetGroupId?: string;
  group?: StoredGroup;
}

// Authentication Middleware - verifies JWT from header or query token parameter
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

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

// Strict Group Membership Authorization Middleware
// Enforces mandatory server-side security boundary before any group resource or event stream is accessed
const requireGroupMembership = async (
  req: GroupAuthorizedRequest,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
    return;
  }

  const rawHeader = req.headers['x-group-id'];
  const rawQuery = req.query.groupId;
  const rawBody = req.body?.groupId;

  // Defend against HTTP parameter pollution
  if (Array.isArray(rawHeader) || Array.isArray(rawQuery)) {
    res.status(400).json({ error: 'INVALID_GROUP', message: 'Multiple group identifiers are not allowed.' });
    return;
  }

  const headerGroup = typeof rawHeader === 'string' && rawHeader.trim() ? rawHeader.trim() : null;
  const queryGroup = typeof rawQuery === 'string' && rawQuery.trim() ? rawQuery.trim() : null;
  const bodyGroup = typeof rawBody === 'string' && rawBody.trim() ? rawBody.trim() : null;

  // Conflict detection: prevent attacker attempting to bypass authorization with conflicting IDs
  if (headerGroup && queryGroup && headerGroup !== queryGroup) {
    res.status(400).json({ error: 'CONFLICTING_GROUP_INPUT', message: 'Conflicting group identifiers.' });
    return;
  }
  if (headerGroup && bodyGroup && headerGroup !== bodyGroup) {
    res.status(400).json({ error: 'CONFLICTING_GROUP_INPUT', message: 'Conflicting group identifiers.' });
    return;
  }
  if (queryGroup && bodyGroup && queryGroup !== bodyGroup) {
    res.status(400).json({ error: 'CONFLICTING_GROUP_INPUT', message: 'Conflicting group identifiers.' });
    return;
  }

  const targetGroupId = headerGroup || queryGroup || bodyGroup;

  if (!targetGroupId) {
    res.status(400).json({ error: 'MISSING_GROUP', message: 'Research group ID is required.' });
    return;
  }

  // Group ID format validation
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(targetGroupId)) {
    res.status(400).json({ error: 'INVALID_GROUP', message: 'Invalid research group ID format.' });
    return;
  }

  try {
    const group = db.verifyUserGroupMembership(targetGroupId, user.id);
    req.targetGroupId = targetGroupId;
    req.group = group;
    next();
  } catch (err: any) {
    if (err instanceof GroupNotFoundError) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Research study/group not found.' });
      return;
    }
    if (err instanceof UnauthorizedGroupActionError) {
      // Record security audit log (strictly non-PHI metadata)
      await db
        .recordAuditLog({
          action: 'UNAUTHORIZED_CROSS_STUDY_ACCESS_ATTEMPT',
          entityType: 'security',
          entityId: targetGroupId,
          details: `Unauthorized attempt by user ${user.id} (${user.email}) to access group ${targetGroupId}.`,
          performedBy: user.id,
          performedByEmail: user.email,
        })
        .catch((logErr) => console.error('Failed to write security audit log:', logErr));

      console.warn(
        `[SECURITY ALERT] Unauthorized cross-study access attempt: user "${user.id}" (${user.email}) requested group "${targetGroupId}". Access denied.`
      );
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied: You are not a member of this research study.' });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal error occurred.' });
  }
};

// Invitation Rate Limiter - layered IP & User throttling to eliminate high-speed enumeration
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export class InvitationRateLimiter {
  private ipBuckets = new Map<string, RateLimitBucket>();
  private userBuckets = new Map<string, RateLimitBucket>();
  private windowMs: number;
  private maxPerIp: number;
  private maxPerUser: number;

  constructor(options: { windowMs?: number; maxPerIp?: number; maxPerUser?: number } = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute window
    this.maxPerIp = options.maxPerIp || 15;        // 15 attempts per minute per IP
    this.maxPerUser = options.maxPerUser || 15;    // 15 attempts per minute per user
  }

  public check(ip: string, userId?: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();

    // Check IP bucket
    let ipBucket = this.ipBuckets.get(ip);
    if (!ipBucket || now > ipBucket.resetAt) {
      ipBucket = { count: 0, resetAt: now + this.windowMs };
      this.ipBuckets.set(ip, ipBucket);
    }
    if (ipBucket.count >= this.maxPerIp) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((ipBucket.resetAt - now) / 1000)) };
    }

    // Check User bucket if authenticated
    if (userId) {
      let userBucket = this.userBuckets.get(userId);
      if (!userBucket || now > userBucket.resetAt) {
        userBucket = { count: 0, resetAt: now + this.windowMs };
        this.userBuckets.set(userId, userBucket);
      }
      if (userBucket.count >= this.maxPerUser) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((userBucket.resetAt - now) / 1000)) };
      }
    }

    // Increment counters
    ipBucket.count++;
    if (userId) {
      const userBucket = this.userBuckets.get(userId);
      if (userBucket) userBucket.count++;
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  public reset(): void {
    this.ipBuckets.clear();
    this.userBuckets.clear();
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

export const invitationRateLimiter = new InvitationRateLimiter();

// Authentication Rate Limiter - layered IP & Account throttling (SEC-003)
export class AuthRateLimiter {
  private ipBuckets = new Map<string, RateLimitBucket>();
  private accountBuckets = new Map<string, RateLimitBucket>();
  private ipWindowMs: number;
  private maxRequestsPerIp: number;
  private accountWindowMs: number;
  private maxFailedPerAccount: number;

  constructor(options: {
    ipWindowMs?: number;
    maxRequestsPerIp?: number;
    accountWindowMs?: number;
    maxFailedPerAccount?: number;
  } = {}) {
    this.ipWindowMs = options.ipWindowMs || 60 * 1000; // 1 minute window
    this.maxRequestsPerIp = options.maxRequestsPerIp || 20; // 20 requests / min per IP
    this.accountWindowMs = options.accountWindowMs || 15 * 60 * 1000; // 15 minutes window
    this.maxFailedPerAccount = options.maxFailedPerAccount || 5; // 5 failed attempts / 15 min per account
  }

  public checkIp(ip: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    let bucket = this.ipBuckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.ipWindowMs };
      this.ipBuckets.set(ip, bucket);
    }
    if (bucket.count >= this.maxRequestsPerIp) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    bucket.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public checkAccount(normalizedEmail: string): { allowed: boolean; retryAfterSeconds: number } {
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
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public recordFailedAttempt(normalizedEmail: string): void {
    const now = Date.now();
    let bucket = this.accountBuckets.get(normalizedEmail);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.accountWindowMs };
      this.accountBuckets.set(normalizedEmail, bucket);
    }
    bucket.count++;
  }

  public recordSuccessfulAttempt(normalizedEmail: string): void {
    this.accountBuckets.delete(normalizedEmail);
  }

  public reset(): void {
    this.ipBuckets.clear();
    this.accountBuckets.clear();
  }

  public cleanupExpired(): void {
    const now = Date.now();
    for (const [key, bucket] of this.ipBuckets.entries()) {
      if (now > bucket.resetAt) this.ipBuckets.delete(key);
    }
    for (const [key, bucket] of this.accountBuckets.entries()) {
      if (now > bucket.resetAt) this.accountBuckets.delete(key);
    }
  }
}

export const authRateLimiter = new AuthRateLimiter();

const rateLimitInvitations = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  const userId = req.user?.id;

  const result = invitationRateLimiter.check(ip, userId);
  if (!result.allowed) {
    db.recordAuditLog({
      action: 'INVITATION_RATE_LIMIT_EXCEEDED',
      entityType: 'security',
      details: `Rate limit exceeded for invitation operations from IP ${ip}${userId ? ` (user ${userId})` : ''}.`,
      performedBy: userId || 'anonymous',
      performedByEmail: req.user?.email || 'anonymous',
    }).catch(() => {});

    res.setHeader('Retry-After', result.retryAfterSeconds.toString());
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many invitation attempts. Please wait before trying again.',
    });
    return;
  }
  next();
};

if (!isProd) {
  app.post('/api/dev/reset-invitation-rate-limit', (_req, res) => {
    invitationRateLimiter.reset();
    res.json({ reset: true });
  });

  app.post('/api/dev/reset-auth-rate-limit', (_req, res) => {
    authRateLimiter.reset();
    res.json({ reset: true });
  });
}

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
  const headerId = typeof req.headers['x-group-id'] === 'string' && req.headers['x-group-id'].trim() ? req.headers['x-group-id'].trim() : null;
  const queryId = typeof req.query.groupId === 'string' && req.query.groupId.trim() ? req.query.groupId.trim() : null;
  const bodyId = typeof req.body?.groupId === 'string' && req.body.groupId.trim() ? req.body.groupId.trim() : null;

  if (headerId && queryId && headerId !== queryId) return null;
  if (headerId && bodyId && headerId !== bodyId) return null;
  if (queryId && bodyId && queryId !== bodyId) return null;

  return headerId || queryId || bodyId;
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
  const ip = getClientIp(req);

  // Layer A: IP-based rate limiting (20 requests / min)
  const ipResult = authRateLimiter.checkIp(ip);
  if (!ipResult.allowed) {
    db.recordAuditLog({
      action: 'AUTH_RATE_LIMIT_EXCEEDED',
      entityType: 'security',
      details: `Authentication rate limit exceeded for IP ${ip}.`,
      performedBy: 'anonymous',
      performedByEmail: 'anonymous',
    }).catch(() => {});

    res.setHeader('Retry-After', ipResult.retryAfterSeconds.toString());
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication requests from this IP address. Please wait before trying again.',
    });
    return;
  }

  try {
    const { email, password } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Layer B: Account-identifier-based rate limiting (5 failed attempts / 15 min)
    const accountResult = authRateLimiter.checkAccount(normalizedEmail);
    if (!accountResult.allowed) {
      db.recordAuditLog({
        action: 'AUTH_RATE_LIMIT_EXCEEDED',
        entityType: 'security',
        details: `Account login rate limit exceeded for ${normalizedEmail} from IP ${ip}.`,
        performedBy: 'anonymous',
        performedByEmail: normalizedEmail,
      }).catch(() => {});

      res.setHeader('Retry-After', accountResult.retryAfterSeconds.toString());
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many failed login attempts. Please wait before trying again.',
      });
      return;
    }

    const user = await db.verifyUserCredentials({ email: normalizedEmail, password });
    if (!user) {
      // Record failed attempt for this account key (uniform for existing and non-existing accounts)
      authRateLimiter.recordFailedAttempt(normalizedEmail);
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      return;
    }

    // Reset failed counter on successful authentication
    authRateLimiter.recordSuccessfulAttempt(normalizedEmail);

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
  const ip = getClientIp(req);

  // Layer A: IP-based rate limiting
  const ipResult = authRateLimiter.checkIp(ip);
  if (!ipResult.allowed) {
    db.recordAuditLog({
      action: 'AUTH_RATE_LIMIT_EXCEEDED',
      entityType: 'security',
      details: `Authentication rate limit exceeded for organization login from IP ${ip}.`,
      performedBy: 'anonymous',
      performedByEmail: 'anonymous',
    }).catch(() => {});

    res.setHeader('Retry-After', ipResult.retryAfterSeconds.toString());
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication requests from this IP address. Please wait before trying again.',
    });
    return;
  }

  try {
    const { email, password, uid, displayName } = req.body;
    let user: UserProfile | null = null;

    if (email && password) {
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Email and password must be strings.' });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const accountResult = authRateLimiter.checkAccount(normalizedEmail);
      if (!accountResult.allowed) {
        db.recordAuditLog({
          action: 'AUTH_RATE_LIMIT_EXCEEDED',
          entityType: 'security',
          details: `Organization login rate limit exceeded for ${normalizedEmail} from IP ${ip}.`,
          performedBy: 'anonymous',
          performedByEmail: normalizedEmail,
        }).catch(() => {});

        res.setHeader('Retry-After', accountResult.retryAfterSeconds.toString());
        res.status(429).json({
          error: 'TOO_MANY_REQUESTS',
          message: 'Too many failed login attempts. Please wait before trying again.',
        });
        return;
      }

      user = await db.verifyUserCredentials({ email: normalizedEmail, password });
      if (!user) {
        authRateLimiter.recordFailedAttempt(normalizedEmail);
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' });
        return;
      }
      authRateLimiter.recordSuccessfulAttempt(normalizedEmail);
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

// Inspect invitation code details before joining (rate-limited, minimal public preview, uniform error)
app.get('/api/invitations/:code', rateLimitInvitations, async (req, res) => {
  try {
    const details = await db.getInvitationDetails(req.params.code);
    res.json(details);
  } catch {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.socket.remoteAddress || '127.0.0.1';
    db.recordAuditLog({
      action: 'INVALID_INVITATION_LOOKUP_ATTEMPT',
      entityType: 'security',
      details: `Invalid or expired invitation lookup attempt from IP ${ip}.`,
      performedBy: 'anonymous',
      performedByEmail: 'anonymous',
    }).catch(() => {});

    // Uniform generic error response prevents token/study enumeration
    res.status(404).json({ error: 'INVALID_INVITATION', message: 'Invalid or expired invitation code.' });
  }
});

// Accept invitation code (authenticated, rate-limited, single-use, atomic)
app.post(
  '/api/invitations/:code/accept',
  authenticateToken,
  rateLimitInvitations,
  async (req: AuthenticatedRequest, res) => {
    try {
      const group = await db.acceptInvitation(req.params.code, req.user!);
      res.json({ success: true, group });
    } catch {
      db.recordAuditLog({
        action: 'INVALID_INVITATION_ACCEPT_ATTEMPT',
        entityType: 'security',
        details: `Invalid or expired invitation acceptance attempt by user ${req.user!.id} (${req.user!.email}).`,
        performedBy: req.user!.id,
        performedByEmail: req.user!.email,
      }).catch(() => {});

      // Uniform generic error response
      res.status(400).json({ error: 'INVALID_INVITATION', message: 'Invalid or expired invitation code.' });
    }
  }
);

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

// --- REAL-TIME SSE STREAM (Group-Scoped with strict BOLA authorization boundary) ---

app.get(
  '/api/cases/events',
  authenticateToken,
  requireGroupMembership,
  (req: GroupAuthorizedRequest, res: Response) => {
    const targetGroupId = req.targetGroupId!;

    // Set SSE headers ONLY after authentication and study membership authorization have completed successfully
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send initial connected confirmation event scoped strictly to authorized group
    res.write(`data: ${JSON.stringify({ type: 'connected', groupId: targetGroupId })}\n\n`);

    // Subscribe to events strictly scoped to this authorized research study
    const unsubscribe = db.subscribe((event, eventGroupId, payload) => {
      if (eventGroupId === targetGroupId) {
        res.write(`data: ${JSON.stringify({ type: event, groupId: eventGroupId, payload })}\n\n`);
      }
    });

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
);

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
