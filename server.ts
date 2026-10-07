import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import {
  db,
  DuplicateCaseError,
  UnauthorizedCaseActionError,
  UnauthorizedGroupActionError,
  GroupNotFoundError,
  AccountSuspendedError,
  ValidationError,
  StoredGroup,
} from './src/server/db.js';
import type { UserProfile, CaseStatus } from './src/types/index.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'thesis-tracker-secure-secret-token-key-2026';

// SEC-006 & SEC-009: Disable technology disclosure
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Extend Express Request type for request tracking and authenticated user (SEC-007)
export interface RequestWithId extends Request {
  id?: string;
  user?: UserProfile;
}

// SEC-007: Request ID / Trace ID Middleware
app.use((req: any, res: Response, next: NextFunction) => {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming.trim())
      ? incoming.trim()
      : crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// SEC-007: Server-side logging helper (Strictly excludes passwords, tokens, cookies, auth headers, and PHI)
export function logServerError(err: any, req: RequestWithId, context?: string) {
  const requestId = req.id || 'unknown';
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    context: context || 'Unhandled Server Error',
    errorName: err?.name || 'Error',
    errorMessage: err?.message || String(err),
    stack: err?.stack || undefined,
  };
  console.error(`[SERVER_ERROR][${requestId}]`, JSON.stringify(errorInfo));
}

// SEC-007: Centralized safe error responder
export function sendSafeErrorResponse(
  err: any,
  req: RequestWithId,
  res: Response,
  defaultAction = 'REQUEST_FAILED'
) {
  const requestId = req.id || crypto.randomUUID();

  // 1. Expected validation error
  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: err.code || defaultAction || 'VALIDATION_ERROR',
      message: err.message,
    });
  }

  // 2. Duplicate case error
  if (err instanceof DuplicateCaseError) {
    return res.status(409).json({
      error: 'DUPLICATE_CASE',
      message: 'Record Already Registered',
      case: err.existingCase,
    });
  }

  // 3. Authorization / Access errors
  if (err instanceof UnauthorizedGroupActionError) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Access denied: You are not a member of this research study.',
    });
  }

  if (err instanceof UnauthorizedCaseActionError) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Unauthorized: You can only modify cases assigned to you.',
    });
  }

  if (err instanceof AccountSuspendedError) {
    return res.status(403).json({
      error: 'ACCOUNT_SUSPENDED',
      message: 'Your account has been deactivated. Please contact support.',
    });
  }

  // 4. Resource Not Found
  if (err instanceof GroupNotFoundError) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Research study/group not found.',
    });
  }

  // 5. Malformed JSON Body (Express SyntaxError from body-parser)
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: 'Invalid request.',
    });
  }

  // 6. Generic Controlled Bad Request / Validation check
  // If the error has status 400 and is an intentional string message (not an internal JS runtime engine error)
  const isInternalJsError =
    err instanceof TypeError ||
    err instanceof ReferenceError ||
    err instanceof RangeError ||
    err instanceof SyntaxError ||
    (typeof err?.message === 'string' &&
      (err.message.includes('is not a function') ||
        err.message.includes('Cannot read properties') ||
        err.message.includes('is undefined') ||
        err.message.includes('is null') ||
        err.message.includes('at ')));

  if (!isInternalJsError && err?.isClientError && typeof err.message === 'string') {
    return res.status(err.status || 400).json({
      error: err.code || defaultAction,
      message: err.message,
    });
  }

  // 7. Unexpected Server / Database / Runtime Error:
  // LOG TECHNICAL DETAILS SERVER-SIDE ONLY
  logServerError(err, req, defaultAction);

  // RETURN SAFE GENERIC RESPONSE TO CLIENT WITHOUT ANY INTERNAL DETAILS
  return res.status(500).json({
    error: 'SERVER_ERROR',
    message: 'An unexpected error occurred.',
    requestId,
  });
}

// Cookie & Session Configuration (SEC-005)
export const AUTH_COOKIE_NAME = 'thesis_tracker_session';
export const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours (reduced token lifetime)

export const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: COOKIE_MAX_AGE_MS,
});

// Security Headers Middleware (SEC-006)
export const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // 1. Frame Protection (SEC-006 Section 5)
  // Per SEC-006: "If the application genuinely requires an iframe, document the exact trusted
  // parent origin and implement a restrictive policy instead of blindly using DENY."
  // The app is previewed within Google AI Studio (https://aistudio.google.com).
  // We restrict framing strictly to 'self' and authorized Google AI Studio / Google Cloud origins.
  const isAiStudioFramed =
    req.headers['sec-fetch-dest'] === 'iframe' ||
    Boolean(req.headers['referer']?.includes('google.com')) ||
    Boolean(req.headers['referer']?.includes('run.app'));

  if (!isAiStudioFramed) {
    res.setHeader('X-Frame-Options', 'DENY');
  }

  // 2. MIME-type sniffing prevention
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 3. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 4. Permissions Policy (Restrict unneeded hardware/browser APIs)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

  // 5. Cross-Origin-Opener-Policy
  // Note: same-origin-allow-popups is required to support Firebase Auth Google Sign-In popup windows
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // 6. Strict-Transport-Security (Production HTTPS & Cloud Run reverse proxy)
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || isProd;
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 7. Content-Security-Policy (Enforcing baseline customized to app dependencies)
  const isDev = !isProd;
  const cspDirectives = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com"
      : "script-src 'self' https://apis.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    isDev
      ? "connect-src 'self' ws: wss: https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://*.firebaseio.com https://hypnic-concord-qlxdt.firebaseapp.com https://accounts.google.com"
      : "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://*.firebaseio.com https://hypnic-concord-qlxdt.firebaseapp.com https://accounts.google.com",
    "frame-src 'self' https://hypnic-concord-qlxdt.firebaseapp.com https://accounts.google.com",
    "frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.run.app",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  next();
};

app.use(securityHeadersMiddleware);

app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// CSRF Defense-in-depth Middleware for cookie-authenticated state-changing operations
const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  // Safe HTTP methods do not mutate state
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  const origin = req.headers['origin'];
  const host = req.headers['host'];
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Cross-origin request rejected.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Malformed origin header.' });
      return;
    }
  }

  next();
};

app.use(csrfProtection);

// Extend Express Request type for authenticated user
export interface AuthenticatedRequest extends RequestWithId {
  user?: UserProfile;
}

export interface GroupAuthorizedRequest extends AuthenticatedRequest {
  targetGroupId?: string;
  group?: StoredGroup;
}

// Authentication Middleware - verifies session from HttpOnly cookie (primary), with tightly controlled legacy Bearer support
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // 1. Primary: Extract from secure HttpOnly cookie
  let token = req.cookies?.[AUTH_COOKIE_NAME];

  // 2. Controlled legacy fallback: Authorization header or SSE query parameter
  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
      token = req.query.token.trim();
    }
  }

  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required. Please log in.' });
    return;
  }

  // Check if token has been revoked on logout
  if (db.isTokenRevoked(token)) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session has been revoked. Please log in again.' });
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
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired session token.' });
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
    sendSafeErrorResponse(err, req, res, 'AUTH_ERROR');
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

app.post('/api/auth/register', async (req: RequestWithId, res: Response) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || typeof displayName !== 'string') {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid request: email, password, and display name must be valid strings.',
      });
      return;
    }
    const user = await db.registerUser({ email, password, displayName });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    const isBrowserClient = req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isBrowserClient) {
      res.status(201).json({ user });
    } else {
      res.status(201).json({ token, user });
    }
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'REGISTRATION_FAILED');
  }
});

app.post('/api/auth/login', async (req: RequestWithId, res: Response) => {
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
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Email and password are required strings.' });
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

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    const isBrowserClient = req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isBrowserClient) {
      res.json({ user });
    } else {
      res.json({ token, user });
    }
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'LOGIN_FAILED');
  }
});

app.post('/api/auth/google-sync', async (req: RequestWithId, res: Response) => {
  try {
    const { uid, email, displayName } = req.body || {};
    if (!uid || !email || typeof uid !== 'string' || typeof email !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'UID and email are required as strings.' });
      return;
    }
    if (displayName !== undefined && typeof displayName !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Display name must be a string.' });
      return;
    }

    const user = await db.syncGoogleProfile({
      uid,
      email,
      displayName: displayName || email.split('@')[0],
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    const isBrowserClient = req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isBrowserClient) {
      res.json({ user });
    } else {
      res.json({ token, user });
    }
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'GOOGLE_SYNC_FAILED');
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

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    const isBrowserClient = req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isBrowserClient) {
      res.json({ user });
    } else {
      res.json({ token, user });
    }
  } catch (err: any) {
    if (err instanceof AccountSuspendedError) {
      res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: err.message });
      return;
    }
    sendSafeErrorResponse(err, req, res, 'LOGIN_FAILED');
  }
});

app.post('/api/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME] || req.headers['authorization']?.split(' ')[1];
  if (token) {
    db.revokeSessionToken(token);
  }
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
  res.json({ success: true, message: 'Logged out successfully.' });
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
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

app.post('/api/organizations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description, institution, contactEmail } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Organization name is required.' });
      return;
    }
    if (description !== undefined && typeof description !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Description must be a string.' });
      return;
    }
    if (institution !== undefined && typeof institution !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Institution must be a string.' });
      return;
    }
    if (contactEmail !== undefined && typeof contactEmail !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Contact email must be a string.' });
      return;
    }

    const organization = await db.createOrganization(req.user!.id, req.body);
    res.status(201).json({ organization });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'CREATE_ORG_FAILED');
  }
});

app.get('/api/organizations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.params.id || typeof req.params.id !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Organization ID is required.' });
      return;
    }
    const organization = await db.getOrganizationById(req.params.id);
    if (!organization) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' });
      return;
    }
    res.json({ organization });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

// --- RESEARCH GROUPS / STUDIES MANAGEMENT ---

// List all groups that the authenticated user belongs to
app.get('/api/groups', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const groups = await db.getUserGroups(req.user!.id);
    res.json({ groups });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
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
    } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Research study / group name is required.' });
      return;
    }
    if (!studyTitle || typeof studyTitle !== 'string' || !studyTitle.trim()) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Study / Thesis title is required.' });
      return;
    }
    if (description !== undefined && typeof description !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Description must be a string.' });
      return;
    }
    if (institution !== undefined && typeof institution !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Institution must be a string.' });
      return;
    }
    if (organizationId !== undefined && typeof organizationId !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Organization ID must be a string.' });
      return;
    }
    if (customFields !== undefined && !Array.isArray(customFields)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Custom fields must be an array.' });
      return;
    }

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
    sendSafeErrorResponse(err, req, res, 'CREATE_GROUP_FAILED');
  }
});

// Get a specific research group details (verifies membership)
app.get('/api/groups/:groupId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const group = await db.getGroupById(req.params.groupId, req.user!.id);
    res.json({ group });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

// Update group settings (Owner only)
app.patch('/api/groups/:groupId/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, studyTitle, description, institution, organizationId, customFields } = req.body || {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Study name must be a non-empty string.' });
      return;
    }
    if (studyTitle !== undefined && (typeof studyTitle !== 'string' || !studyTitle.trim())) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Study title must be a non-empty string.' });
      return;
    }
    if (description !== undefined && typeof description !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Description must be a string.' });
      return;
    }
    if (institution !== undefined && typeof institution !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Institution must be a string.' });
      return;
    }
    if (organizationId !== undefined && typeof organizationId !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Organization ID must be a string.' });
      return;
    }
    if (customFields !== undefined && !Array.isArray(customFields)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Custom fields must be an array.' });
      return;
    }

    const group = await db.updateGroupSettings(req.params.groupId, req.user!.id, req.body || {});
    res.json({ group });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'UPDATE_FAILED');
  }
});

// Generate an invitation for a group (Owner only)
app.post('/api/groups/:groupId/invitations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { intendedEmail } = req.body || {};
    if (intendedEmail !== undefined && typeof intendedEmail !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Intended email must be a string.' });
      return;
    }
    const invitation = await db.createInvitation(
      req.params.groupId,
      req.user!.id,
      intendedEmail
    );
    res.status(201).json({ invitation });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'INVITATION_FAILED');
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
    sendSafeErrorResponse(err, req, res, 'REMOVE_FAILED');
  }
});

// --- RESEARCH FILES MANAGEMENT ---

app.get('/api/groups/:groupId/files', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const files = await db.getGroupFiles(req.params.groupId, req.user!.id);
    res.json({ files });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

app.post('/api/groups/:groupId/files', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, size, mimeType, category, fileData } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'File name is required.' });
      return;
    }
    if (mimeType !== undefined && typeof mimeType !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'MIME type must be a string.' });
      return;
    }
    const file = await db.uploadGroupFile({
      groupId: req.params.groupId,
      userId: req.user!.id,
      name,
      size: typeof size === 'number' ? size : 0,
      mimeType: mimeType || 'application/octet-stream',
      category,
      fileData,
    });
    res.status(201).json({ file });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'UPLOAD_FAILED');
  }
});

app.delete('/api/groups/:groupId/files/:fileId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.deleteGroupFile(req.params.groupId, req.params.fileId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'DELETE_FILE_FAILED');
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

    const patientId = req.params.patientId;
    if (!patientId || typeof patientId !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Patient ID is required.' });
      return;
    }

    const result = await db.checkPatientId(groupId, patientId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'VALIDATION_ERROR');
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

    const { patientId, patientName, diagnosis, drugNames, customValues } = req.body || {};
    if (!patientId || typeof patientId !== 'string' || !patientId.trim()) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Participant / Patient ID is required.' });
      return;
    }
    if (patientName !== undefined && typeof patientName !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Participant name must be a string.' });
      return;
    }
    if (diagnosis !== undefined && typeof diagnosis !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Condition / diagnosis must be a string.' });
      return;
    }
    if (drugNames !== undefined && typeof drugNames !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Medication / intervention details must be a string.' });
      return;
    }
    if (customValues !== undefined && (typeof customValues !== 'object' || customValues === null || Array.isArray(customValues))) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Custom field values must be an object.' });
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
    sendSafeErrorResponse(err, req, res, 'REGISTRATION_ERROR');
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

    const cases = await db.getAllCases(groupId, req.user!.id, {
      search: typeof search === 'string' ? search : undefined,
      memberId: typeof memberId === 'string' ? memberId : undefined,
      status: typeof status === 'string' ? status : undefined,
    });
    res.json({ cases });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
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
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
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
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
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

    const { status } = req.body || {};
    if (!status || typeof status !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Status is required as a string.' });
      return;
    }

    const updated = await db.updateCaseStatus({
      groupId,
      caseId: req.params.id,
      userId: req.user!.id,
      newStatus: status as CaseStatus,
    });

    res.json({ success: true, case: updated });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'UPDATE_ERROR');
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

    const { patientName, diagnosis, drugNames, customValues } = req.body || {};
    if (patientName !== undefined && typeof patientName !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Participant name must be a string.' });
      return;
    }
    if (diagnosis !== undefined && typeof diagnosis !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Condition / diagnosis must be a string.' });
      return;
    }
    if (drugNames !== undefined && typeof drugNames !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Medication / intervention details must be a string.' });
      return;
    }
    if (customValues !== undefined && (typeof customValues !== 'object' || customValues === null || Array.isArray(customValues))) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Custom field values must be an object.' });
      return;
    }

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
    sendSafeErrorResponse(err, req, res, 'UPDATE_ERROR');
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
    sendSafeErrorResponse(err, req, res, 'DELETE_ERROR');
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
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
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
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
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
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

// 2. Organizations list
app.get('/api/app-owner/organizations', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const organizations = await db.getAppOwnerOrganizations();
    res.json({ organizations });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

// 3. User list
app.get('/api/app-owner/users', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string };
    const users = await db.getAppOwnerUsers({
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
    });
    res.json({ users });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

// 4. User status management (suspend / reactivate)
app.patch('/api/app-owner/users/:id/status', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body || {};
    if (!status || typeof status !== 'string' || !['active', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid status ("active" or "suspended") is required.' });
      return;
    }

    const updated = await db.setAppOwnerUserStatus(req.params.id, status as any, req.user!.email);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'ACTION_FAILED');
  }
});

// 5. Groups / Studies list
app.get('/api/app-owner/groups', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string };
    const groups = await db.getAppOwnerGroups({
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
    });
    res.json({ groups });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

// 6. Group status management
app.patch('/api/app-owner/groups/:id/status', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body || {};
    if (!status || typeof status !== 'string' || !['active', 'archived', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid status ("active", "archived", or "suspended") is required.' });
      return;
    }

    const updated = await db.setAppOwnerGroupStatus(req.params.id, status as any, req.user!.email);
    res.json({ success: true, group: updated });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'ACTION_FAILED');
  }
});

// 7. Delete group (App Owner)
app.delete('/api/app-owner/groups/:id', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.deleteAppOwnerGroup(req.params.id, req.user!.email);
    res.json(result);
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'DELETE_FAILED');
  }
});

// 8. Audit log list
app.get('/api/app-owner/audit-logs', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { limit, action, entityType } = req.query as { limit?: string; action?: string; entityType?: string };
    const logs = db.getAuditLogs({
      limit: limit && !isNaN(parseInt(limit, 10)) ? parseInt(limit, 10) : 100,
      action: typeof action === 'string' ? action : undefined,
      entityType: typeof entityType === 'string' ? entityType : undefined,
    });
    res.json({ logs });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

// 9. Application settings
app.get('/api/app-owner/settings', authenticateAppOwner, (req: AuthenticatedRequest, res) => {
  try {
    const settings = db.getAppSettings();
    res.json({ settings });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'SERVER_ERROR');
  }
});

app.patch('/api/app-owner/settings', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await db.updateAppSettings(req.body || {}, req.user!.email);
    res.json({ settings: updated });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'UPDATE_FAILED');
  }
});

// 10. Legal Policy update (App Owner)
app.patch('/api/app-owner/legal-policies/:id', authenticateAppOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { content } = req.body || {};
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Policy content is required as a string.' });
      return;
    }

    const updated = await db.updateLegalPolicy(req.params.id, content, req.user!.email);
    res.json({ policy: updated });
  } catch (err: any) {
    sendSafeErrorResponse(err, req, res, 'UPDATE_FAILED');
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
      try {
        if (eventGroupId === targetGroupId) {
          res.write(`data: ${JSON.stringify({ type: event, groupId: eventGroupId, payload })}\n\n`);
        }
      } catch (sseErr) {
        logServerError(sseErr, req as any, 'SSE Event Dispatch Error');
      }
    });

    const heartbeat = setInterval(() => {
      try {
        if (!res.writableEnded) {
          res.write(': heartbeat\n\n');
        }
      } catch (hbErr) {
        logServerError(hbErr, req as any, 'SSE Heartbeat Error');
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
);

// Dev Test Endpoints for Controlled Error Verification (SEC-007)
if (!isProd) {
  app.get('/api/dev/force-error', (req: RequestWithId, _res: Response) => {
    throw new Error('Controlled test server error for SEC-007 verification');
  });

  app.get('/api/dev/force-type-error', (_req: RequestWithId, _res: Response) => {
    const obj: any = undefined;
    return obj.trim();
  });
}

// Centralized Express Error Handling Middleware (SEC-007 Final Safety Boundary)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  sendSafeErrorResponse(err, req as RequestWithId, res);
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
    console.log(`[Thesis Progress Tracker] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
  process.exit(1);
});
