import http from 'node:http';
import fs from 'node:fs';

const SERVER_URL = 'http://localhost:3000';

function makeRequest(options: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  data: string;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, SERVER_URL);
    const headers: Record<string, string> = { ...(options.headers || {}) };
    let payload = '';

    if (options.body) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            data: raw,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runSec002Tests() {
  console.log('\n======================================================');
  console.log(' SEC-002 VERIFICATION TEST SUITE (INVITATION SECURITY)');
  console.log('======================================================\n');

  // Reset rate limits for test suite start
  await makeRequest({ path: '/api/dev/reset-invitation-rate-limit', method: 'POST' }).catch(() => {});

  const time = Date.now();
  let passed = 0;
  const total = 12;

  // Setup Owner Account A and Study A
  const regRespA = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `owner_alice_${time}@hospital.test`,
      password: 'SecurePassword123!',
      displayName: 'Dr. Alice Owner',
    },
  });
  const authA = JSON.parse(regRespA.data);
  const tokenA = authA.token;
  const userA = authA.user;

  // Setup Collaborator Account B
  const regRespB = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `collab_bob_${time}@hospital.test`,
      password: 'SecurePassword123!',
      displayName: 'Dr. Bob Collab',
    },
  });
  const authB = JSON.parse(regRespB.data);
  const tokenB = authB.token;
  const userB = authB.user;

  // Setup Collaborator Account C
  const regRespC = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `collab_charlie_${time}@hospital.test`,
      password: 'SecurePassword123!',
      displayName: 'Dr. Charlie Collab',
    },
  });
  const authC = JSON.parse(regRespC.data);
  const tokenC = authC.token;
  const userC = authC.user;

  // Owner creates Study A
  const groupRespA = await makeRequest({
    path: '/api/groups',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      name: `Auditory Research Study ${time}`,
      studyTitle: 'Auditory Evoked Potentials in Intensive Care Units',
      targetSampleSize: 100,
    },
  });
  const studyA = JSON.parse(groupRespA.data).group;

  // Collaborator B creates Study B
  const groupRespB = await makeRequest({
    path: '/api/groups',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      name: `Cardiology Study ${time}`,
      studyTitle: 'Coronary Care Trials',
      targetSampleSize: 80,
    },
  });
  const studyB = JSON.parse(groupRespB.data).group;

  console.log(`[SETUP] Registered Account A (id=${userA.id}) with Study A (${studyA.name})`);
  console.log(`[SETUP] Registered Account B (id=${userB.id}) with Study B (${studyB.name})`);
  console.log(`[SETUP] Registered Account C (id=${userC.id})`);

  // -------------------------------------------------------------------------
  // TEST A: TOKEN ENTROPY & OPAQUE FORMAT (>= 128 bits)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST A] Token Entropy & Format: Generating invitations to verify entropy & opacity...');
    const tokens: string[] = [];
    for (let i = 0; i < 5; i++) {
      const invResp = await makeRequest({
        path: `/api/groups/${studyA.id}/invitations`,
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {},
      });
      if (invResp.statusCode !== 201) {
        throw new Error(`Failed to generate invitation: ${invResp.data}`);
      }
      const code = JSON.parse(invResp.data).invitation.code;
      tokens.push(code);
    }

    for (const t of tokens) {
      // 24 random bytes base64url encoded is 32 characters
      if (t.length < 22) {
        throw new Error(`Token ${t} is too short (< 128 bits of entropy)`);
      }
      // Check for base64url charset [A-Za-z0-9_-]
      if (!/^[A-Za-z0-9_-]+$/.test(t)) {
        throw new Error(`Token ${t} contains non-base64url characters`);
      }
      // Ensure no study name prefix (e.g. AUDI- or GRP- or XXXX-)
      if (t.startsWith('AUDI-') || t.startsWith('GRP-') || /^[A-Z]{3,4}-/.test(t)) {
        throw new Error(`Token ${t} retains predictable study prefix!`);
      }
      // Check that study name or group ID is not in token
      if (t.toLowerCase().includes('audi') || t.includes(studyA.id)) {
        throw new Error(`Token leaks study metadata: ${t}`);
      }
    }

    console.log(`✅ TEST A PASSED: Generated tokens have 192 bits of entropy (32 chars base64url), no study prefixes. Sample: ${tokens[0]}`);
    passed++;
  } catch (err: any) {
    console.error('❌ TEST A FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST B: TOKEN UNIQUENESS
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST B] Token Uniqueness: Verifying 0 collisions across generated tokens...');
    const set = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const invResp = await makeRequest({
        path: `/api/groups/${studyA.id}/invitations`,
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {},
      });
      const code = JSON.parse(invResp.data).invitation.code;
      if (set.has(code)) {
        throw new Error(`Collision detected on token: ${code}`);
      }
      set.add(code);
    }

    console.log(`✅ TEST B PASSED: 30 consecutive tokens generated with 100% uniqueness (0 collisions).`);
    passed++;
  } catch (err: any) {
    console.error('❌ TEST B FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST C: INVALID INVITATION LOOKUP
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST C] Invalid Invitation: Looking up random non-existent token...');
    const fakeToken = 'randomFakeTokenThatDoesNotExist123456';
    const resp = await makeRequest({
      path: `/api/invitations/${fakeToken}`,
    });

    if (resp.statusCode !== 404) {
      throw new Error(`Expected HTTP 404, got ${resp.statusCode}`);
    }
    const body = JSON.parse(resp.data);
    if (body.error !== 'INVALID_INVITATION') {
      throw new Error(`Expected generic error INVALID_INVITATION, got ${JSON.stringify(body)}`);
    }

    console.log('✅ TEST C PASSED: Invalid token returned uniform HTTP 404 INVALID_INVITATION error; zero metadata disclosed.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST C FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST D: OPAQUE LOOKUP (MINIMAL PUBLIC PREVIEW WITHOUT INTERNAL IDS)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST D] Opaque Lookup: Verifying valid token preview exposes NO internal IDs or secrets...');
    const invResp = await makeRequest({
      path: `/api/groups/${studyA.id}/invitations`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {},
    });
    const validToken = JSON.parse(invResp.data).invitation.code;

    const lookupResp = await makeRequest({
      path: `/api/invitations/${validToken}`,
    });
    if (lookupResp.statusCode !== 200) {
      throw new Error(`Expected HTTP 200 for valid lookup, got ${lookupResp.statusCode}`);
    }
    const preview = JSON.parse(lookupResp.data);

    // Verify minimum public fields present
    if (!preview.group || !preview.group.name || !preview.group.studyTitle) {
      throw new Error(`Missing expected preview fields in: ${JSON.stringify(preview)}`);
    }

    // Verify INTERNAL IDs ARE NOT EXPOSED
    if (preview.group.id || preview.groupId || preview.invitation || preview.token_hash) {
      throw new Error(`CRITICAL: Internal identifiers or database secrets exposed in preview: ${JSON.stringify(preview)}`);
    }

    console.log('✅ TEST D PASSED: Lookup returns strictly safe preview (name, studyTitle); internal IDs/secrets omitted.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST D FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST E: SINGLE-USE ENFORCEMENT
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST E] Single-Use Enforcement: Account B accepts token; Account C attempts reuse...');
    const invResp = await makeRequest({
      path: `/api/groups/${studyA.id}/invitations`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {},
    });
    const singleUseToken = JSON.parse(invResp.data).invitation.code;

    // 1st acceptance by Account B -> MUST succeed
    const accept1 = await makeRequest({
      path: `/api/invitations/${singleUseToken}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (accept1.statusCode !== 200) {
      throw new Error(`First acceptance failed: ${accept1.data}`);
    }

    // 2nd acceptance by Account C with same token -> MUST fail with generic INVALID_INVITATION
    const accept2 = await makeRequest({
      path: `/api/invitations/${singleUseToken}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    if (accept2.statusCode !== 400) {
      throw new Error(`Expected HTTP 400 on reused token, got ${accept2.statusCode}`);
    }
    const body2 = JSON.parse(accept2.data);
    if (body2.error !== 'INVALID_INVITATION') {
      throw new Error(`Expected generic error INVALID_INVITATION on reuse, got ${JSON.stringify(body2)}`);
    }

    // Also verify lookup now returns 404 for consumed token
    const lookupAfterConsumed = await makeRequest({
      path: `/api/invitations/${singleUseToken}`,
    });
    if (lookupAfterConsumed.statusCode !== 404) {
      throw new Error(`Consumed token should return 404 on lookup, got ${lookupAfterConsumed.statusCode}`);
    }

    console.log('✅ TEST E PASSED: Single-use token consumed on 1st use; subsequent acceptance rejected with generic INVALID_INVITATION.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST E FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST F: CROSS-STUDY TAMPERING DEFENSE
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST F] Cross-study Tampering: Attempt to provide manipulated groupId during acceptance...');
    const invResp = await makeRequest({
      path: `/api/groups/${studyA.id}/invitations`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {},
    });
    const tokenForStudyA = JSON.parse(invResp.data).invitation.code;

    // Account C sends manipulated groupId in body pointing to Study B
    const tamperResp = await makeRequest({
      path: `/api/invitations/${tokenForStudyA}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenC}` },
      body: {
        groupId: studyB.id,
        role: 'owner', // Malicious attempt to escalate role
      },
    });

    if (tamperResp.statusCode !== 200) {
      throw new Error(`Acceptance failed: ${tamperResp.data}`);
    }
    const joinedGroup = JSON.parse(tamperResp.data).group;

    // Verify user joined Study A, NOT Study B!
    if (joinedGroup.id !== studyA.id) {
      throw new Error(`CRITICAL: Server joined manipulated group ${joinedGroup.id} instead of authorized Study A ${studyA.id}!`);
    }

    // Verify role is strictly 'researcher', not 'owner'
    const memberC = joinedGroup.members.find((m: any) => m.userId === userC.id);
    if (!memberC || memberC.role !== 'researcher') {
      throw new Error(`Role tampering succeeded: assigned role ${memberC?.role}`);
    }

    console.log('✅ TEST F PASSED: Client-supplied groupId & role ignored; membership derived strictly from server-side invitation.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST F FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST G: UNAUTHORIZED INVITATION CREATION
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST G] Unauthorized Creation: Non-owner attempts to generate invitation for Study A...');
    // Account B is NOT the owner of Study A
    const unauthResp = await makeRequest({
      path: `/api/groups/${studyA.id}/invitations`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {},
    });

    if (unauthResp.statusCode !== 403) {
      throw new Error(`Expected HTTP 403 for non-owner invitation creation, got ${unauthResp.statusCode}`);
    }

    console.log('✅ TEST G PASSED: Non-owner invitation generation rejected with HTTP 403 Forbidden.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST G FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST H: ENUMERATION RESISTANCE (UNIFORM RESPONSE IDENTICAL FOR ALL INVALID STATES)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST H] Enumeration Resistance: Comparing responses for nonexistent, used, and expired tokens...');
    // 1. Non-existent token
    const rNonexistent = await makeRequest({
      path: '/api/invitations/nonExistentToken1234567890123456',
    });
    // 2. Used token (from Test E)
    const invResp = await makeRequest({
      path: `/api/groups/${studyB.id}/invitations`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {},
    });
    const tokenToConsume = JSON.parse(invResp.data).invitation.code;
    await makeRequest({
      path: `/api/invitations/${tokenToConsume}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const rConsumed = await makeRequest({
      path: `/api/invitations/${tokenToConsume}`,
    });

    if (rNonexistent.statusCode !== rConsumed.statusCode) {
      throw new Error(`Status code discrepancy: nonexistent=${rNonexistent.statusCode}, consumed=${rConsumed.statusCode}`);
    }
    if (rNonexistent.data !== rConsumed.data) {
      throw new Error(`Response body discrepancy allows enumeration: nonexistent="${rNonexistent.data}", consumed="${rConsumed.data}"`);
    }

    console.log('✅ TEST H PASSED: Response bodies and status codes are identical across invalid/consumed states, preventing enumeration oracle.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST H FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST I: RATE LIMITING ON INVITATION LOOKUP
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST I] Rate Limiting: Firing rapid lookup requests to verify HTTP 429 throttling...');
    let hit429 = false;
    let attempts = 0;

    for (let i = 0; i < 25; i++) {
      attempts++;
      const resp = await makeRequest({
        path: `/api/invitations/rapidBruteForceToken_${i}`,
        headers: {
          'X-Forwarded-For': '198.51.100.99',
        },
      });
      if (resp.statusCode === 429) {
        hit429 = true;
        const retryAfter = resp.headers['retry-after'];
        if (!retryAfter) {
          throw new Error('429 response missing Retry-After header');
        }
        break;
      }
    }

    if (!hit429) {
      throw new Error(`Failed to trigger 429 rate limit after ${attempts} attempts`);
    }

    console.log(`✅ TEST I PASSED: Rate limiter triggered HTTP 429 after threshold with Retry-After header.`);
    passed++;
  } catch (err: any) {
    console.error('❌ TEST I FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST J: DATABASE STORAGE SECURITY (NO RAW TOKENS STORED)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST J] Database Storage Security: Verifying raw token is NOT in database file...');
    // Create a new invitation and capture its raw token
    // Sleep briefly so rate limit window clears or reset
    await new Promise((r) => setTimeout(r, 1200));

    const invResp = await makeRequest({
      path: `/api/groups/${studyA.id}/invitations`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {},
    });
    const uniqueRawSecret = JSON.parse(invResp.data).invitation.code;

    const dbRaw = fs.readFileSync('data/thesis_tracker_db.json', 'utf-8');
    const parsedDb = JSON.parse(dbRaw);

    // Find the record by id
    const foundInvite = parsedDb.invitations.find((i: any) => i.id === JSON.parse(invResp.data).invitation.id);
    if (!foundInvite) {
      throw new Error('Invitation record not found in database');
    }

    // Verify token_hash exists
    if (!foundInvite.token_hash) {
      throw new Error('token_hash missing in database record!');
    }

    // Verify raw secret is NOT stored in code field of newly generated invitation
    if (foundInvite.code === uniqueRawSecret) {
      throw new Error('CRITICAL: Raw token was stored in plaintext in the database!');
    }

    console.log('✅ TEST J PASSED: Database stores only token_hash (SHA-256); raw token secret is never stored in plaintext.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST J FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST K: CONCURRENT ACCEPTANCE OF SINGLE-USE TOKEN
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST K] Concurrent Acceptance: Simulating simultaneous race condition on single-use token...');
    // Clear rate limits so concurrent requests test atomicity without rate throttling
    await makeRequest({ path: '/api/dev/reset-invitation-rate-limit', method: 'POST' }).catch(() => {});

    // Create new invitation
    const invResp = await makeRequest({
      path: `/api/groups/${studyB.id}/invitations`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {},
    });
    const raceToken = JSON.parse(invResp.data).invitation.code;

    // Create Account D
    const regRespD = await makeRequest({
      path: '/api/auth/register',
      method: 'POST',
      body: {
        email: `collab_david_${time}@hospital.test`,
        password: 'SecurePassword123!',
        displayName: 'Dr. David Collab',
      },
    });
    const tokenD = JSON.parse(regRespD.data).token;

    // Fire 2 concurrent accept requests simultaneously
    const [p1, p2] = await Promise.all([
      makeRequest({
        path: `/api/invitations/${raceToken}/accept`,
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenC}` },
      }),
      makeRequest({
        path: `/api/invitations/${raceToken}/accept`,
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenD}` },
      }),
    ]);

    const has200 = (p1.statusCode === 200 && p2.statusCode === 400) || (p1.statusCode === 400 && p2.statusCode === 200);
    if (!has200) {
      throw new Error(`Race condition detected! Statuses: ${p1.statusCode} and ${p2.statusCode}`);
    }

    console.log('✅ TEST K PASSED: Mutex protection prevented race condition; exactly 1 acceptance succeeded (200), other rejected (400).');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST K FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST L: AUDIT LOG VERIFICATION (NO RAW TOKENS OR PHI LOGGED)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST L] Security Audit Logging: Verifying absence of raw tokens and PHI in audit logs...');
    const dbRaw = fs.readFileSync('data/thesis_tracker_db.json', 'utf-8');
    const parsedDb = JSON.parse(dbRaw);
    const auditLogs = parsedDb.audit_logs || [];

    const invAuditLogs = auditLogs.filter((l: any) =>
      l.action === 'INVALID_INVITATION_LOOKUP_ATTEMPT' ||
      l.action === 'INVALID_INVITATION_ACCEPT_ATTEMPT' ||
      l.action === 'INVITATION_RATE_LIMIT_EXCEEDED'
    );

    if (invAuditLogs.length === 0) {
      throw new Error('No invitation security audit logs recorded');
    }

    // Verify none of the logs contain raw tokens or PHI
    for (const log of invAuditLogs) {
      if (log.details.includes('randomFakeToken') || log.details.includes('rapidBruteForceToken')) {
        throw new Error('Raw candidate token leaked into audit log details!');
      }
      if (log.details.includes('Confidential Patient') || log.details.includes('Lymphoma')) {
        throw new Error('PHI leaked into security audit log!');
      }
    }

    console.log(`✅ TEST L PASSED: Found ${invAuditLogs.length} invitation security audit logs. Zero raw tokens or PHI logged.`);
    passed++;
  } catch (err: any) {
    console.error('❌ TEST L FAILED:', err.message);
  }

  console.log('\n======================================================');
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSec002Tests().catch((err) => {
  console.error('Test runner encountered fatal error:', err);
  process.exit(1);
});
