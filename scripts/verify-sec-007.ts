import http from 'node:http';

const SERVER_URL = 'http://localhost:3000';

function makeRawRequest(options: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  rawBody?: string;
  body?: any;
}): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json: any;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, SERVER_URL);
    const postData =
      options.rawBody !== undefined
        ? options.rawBody
        : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined;

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (postData !== undefined) {
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = null;
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: data,
            json: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    if (postData !== undefined) {
      req.write(postData);
    }
    req.end();
  });
}

// Leakage detector per SEC-007 Section 19
const LEAKAGE_PATTERNS = [
  /TypeError/i,
  /ReferenceError/i,
  /SyntaxError/i,
  /Cannot read properties/i,
  /\.trim is not a function/i,
  /is not a function/i,
  /at\s+[\w$./\\-]+\s+\(/i,
  /at\s+\//i,
  /node_modules/i,
  /\.js:\d+:\d+/i,
  /"stack":\s*"/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /JWT_SECRET/i,
  /secret-token-key/i,
  /process\.env/i,
];

function checkNoLeakage(body: string, label: string): boolean {
  for (const pattern of LEAKAGE_PATTERNS) {
    if (pattern.test(body)) {
      console.error(`❌ LEAKAGE DETECTED in ${label}: matches pattern ${pattern}`);
      console.error(`   Body was: ${body.substring(0, 300)}`);
      return false;
    }
  }
  return true;
}

async function runSec007Verification() {
  console.log('\n======================================================');
  console.log(' SEC-007 VERIFICATION TEST SUITE');
  console.log(' (INTERNAL ERROR INFORMATION DISCLOSURE REMEDIATION)');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ TEST ${total} PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`❌ TEST ${total} FAILED: ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
    }
  }

  // --- A. INVALID STRING TYPE (number instead of string) ---
  const resInvalidType = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: { email: 12345, password: 'password123', displayName: 'Test User' },
  });
  assert(
    resInvalidType.statusCode === 400 &&
      resInvalidType.json?.error === 'INVALID_REQUEST' &&
      checkNoLeakage(resInvalidType.body, 'TEST A'),
    'Invalid string type (number) produces safe HTTP 400 without internal TypeError'
  );

  // --- B. NULL VALUE ---
  const resNull = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: { email: null, password: 'password123', displayName: 'Test User' },
  });
  assert(
    resNull.statusCode === 400 &&
      resNull.json?.error === 'INVALID_REQUEST' &&
      checkNoLeakage(resNull.body, 'TEST B'),
    'Null email value produces safe HTTP 400 without TypeError or undefined reading'
  );

  // --- C. OBJECT INSTEAD OF STRING ---
  const resObj = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: { email: { nested: 'evil' }, password: 'password123', displayName: 'Test User' },
  });
  assert(
    resObj.statusCode === 400 &&
      resObj.json?.error === 'INVALID_REQUEST' &&
      checkNoLeakage(resObj.body, 'TEST C'),
    'Object instead of string produces safe HTTP 400 without params.email.trim error'
  );

  // --- D. ARRAY INSTEAD OF STRING ---
  const resArray = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: { email: ['test@example.com'], password: 'password123', displayName: 'Test User' },
  });
  assert(
    resArray.statusCode === 400 &&
      resArray.json?.error === 'INVALID_REQUEST' &&
      checkNoLeakage(resArray.body, 'TEST D'),
    'Array instead of string produces safe HTTP 400 without internal error'
  );

  // --- E. MALFORMED JSON ---
  const resBadJson = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    rawBody: '{"email": "unclosed_string, password: ',
  });
  assert(
    resBadJson.statusCode === 400 &&
      resBadJson.json?.error === 'INVALID_REQUEST' &&
      resBadJson.json?.message === 'Invalid request.' &&
      checkNoLeakage(resBadJson.body, 'TEST E (Malformed JSON)'),
    'Malformed JSON returns controlled HTTP 400 INVALID_REQUEST without parser stack trace'
  );

  // --- F. UNEXPECTED SERVER ERROR (Controlled test error) ---
  const resServerError = await makeRawRequest({
    path: '/api/dev/force-error',
    method: 'GET',
  });
  assert(
    resServerError.statusCode === 500 &&
      resServerError.json?.error === 'SERVER_ERROR' &&
      resServerError.json?.message === 'An unexpected error occurred.' &&
      typeof resServerError.json?.requestId === 'string' &&
      resServerError.json?.requestId.length > 0 &&
      !('stack' in (resServerError.json || {})) &&
      checkNoLeakage(resServerError.body, 'TEST F (Server Error)'),
    'Unexpected server error returns generic 500 SERVER_ERROR with requestId and no stack trace'
  );

  // --- F2. UNEXPECTED RUNTIME TYPE ERROR ---
  const resTypeError = await makeRawRequest({
    path: '/api/dev/force-type-error',
    method: 'GET',
  });
  assert(
    resTypeError.statusCode === 500 &&
      resTypeError.json?.error === 'SERVER_ERROR' &&
      resTypeError.json?.message === 'An unexpected error occurred.' &&
      typeof resTypeError.json?.requestId === 'string' &&
      checkNoLeakage(resTypeError.body, 'TEST F2 (Type Error)'),
    'Internal runtime TypeError returns generic 500 SERVER_ERROR with requestId and no TypeError details'
  );

  // --- G. REQUEST ID PROPAGATION & HEADERS ---
  const customReqId = 'audit-trace-test-12345';
  const resTraced = await makeRawRequest({
    path: '/api/auth/team-capacity',
    method: 'GET',
    headers: { 'X-Request-Id': customReqId },
  });
  assert(
    resTraced.headers['x-request-id'] === customReqId,
    'Client-supplied X-Request-Id is properly honored and echoed in response header'
  );

  // --- H. AUTHENTICATION ERROR (Invalid/corrupted JWT) ---
  const resBadToken = await makeRawRequest({
    path: '/api/auth/me',
    method: 'GET',
    headers: { Authorization: 'Bearer totally.invalid.corrupted.jwt.token' },
  });
  assert(
    resBadToken.statusCode === 401 &&
      resBadToken.json?.error === 'UNAUTHORIZED' &&
      checkNoLeakage(resBadToken.body, 'TEST H (Auth Error)'),
    'Invalid authentication token returns generic HTTP 401 without JWT parser internals'
  );

  // --- I. AUTHORIZATION ERROR (Cross-study group access) ---
  // Create test user 1
  const uniqueId = Date.now();
  const reg1 = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `researcher1_${uniqueId}@hospital.org`,
      password: 'StrongPassword123!',
      displayName: 'Lead Researcher 1',
    },
  });
  const cookie1 = reg1.headers['set-cookie']?.[0]?.split(';')[0];

  // User 1 creates Group A
  const group1Res = await makeRawRequest({
    path: '/api/groups',
    method: 'POST',
    headers: { Cookie: cookie1 || '' },
    body: {
      name: `Cardiology Study ${uniqueId}`,
      studyTitle: 'Beta-Blocker Thesis Study',
      targetSampleSize: 50,
    },
  });
  const group1Id = group1Res.json?.group?.id;

  // Create test user 2
  const reg2 = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `researcher2_${uniqueId}@hospital.org`,
      password: 'StrongPassword123!',
      displayName: 'Researcher 2',
    },
  });
  const cookie2 = reg2.headers['set-cookie']?.[0]?.split(';')[0];

  // User 2 attempts to access Group A cases without membership
  const crossGroupRes = await makeRawRequest({
    path: '/api/cases',
    method: 'GET',
    headers: {
      Cookie: cookie2 || '',
      'X-Group-Id': group1Id,
    },
  });
  assert(
    crossGroupRes.statusCode === 403 &&
      crossGroupRes.json?.error === 'FORBIDDEN' &&
      checkNoLeakage(crossGroupRes.body, 'TEST I (Authorization Error)'),
    'Cross-study access attempt returns generic HTTP 403 FORBIDDEN without database schema details'
  );

  // --- J. SSE ENDPOINT SAFE DISPATCH ---
  const sseTestPromise = new Promise<{ statusCode: number; headers: any; data: string }>((resolve, reject) => {
    const url = new URL(`/api/cases/events?groupId=${group1Id}`, SERVER_URL);
    const req = http.request(
      url,
      {
        method: 'GET',
        headers: { Cookie: cookie1 || '' },
      },
      (res) => {
        let chunkData = '';
        res.on('data', (chunk) => {
          chunkData += chunk.toString();
          req.destroy();
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            data: chunkData,
          });
        });
      }
    );
    req.on('error', (err: any) => {
      // Abort is expected when calling req.destroy()
      if (err.code === 'ECONNRESET') return;
      reject(err);
    });
    req.end();
  });

  const sseRes = await sseTestPromise;
  assert(
    sseRes.headers['content-type']?.includes('text/event-stream') &&
      !sseRes.data.includes('Error:') &&
      !sseRes.data.includes('stack') &&
      checkNoLeakage(sseRes.data, 'TEST J (SSE Stream)'),
    'SSE stream connects with authorized headers and emits safe structured events without stack traces'
  );

  // --- K. PRESERVE LEGITIMATE CONTROLLED VALIDATION ERRORS ---
  // 1. Password length validation
  const shortPassRes = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `shortpass_${uniqueId}@hospital.org`,
      password: '123',
      displayName: 'Short Password User',
    },
  });
  assert(
    shortPassRes.statusCode === 400 &&
      (shortPassRes.json?.error === 'REGISTRATION_FAILED' || shortPassRes.json?.error === 'VALIDATION_ERROR') &&
      shortPassRes.json?.message?.includes('Password must be at least 6 characters') &&
      checkNoLeakage(shortPassRes.body, 'TEST K1'),
    'Legitimate validation errors (e.g. short password) return user-friendly messages',
    `status: ${shortPassRes.statusCode}, body: ${shortPassRes.body}`
  );

  // 2. Duplicate case validation
  const case1 = await makeRawRequest({
    path: '/api/cases/register',
    method: 'POST',
    headers: { Cookie: cookie1 || '', 'X-Group-Id': group1Id },
    body: { patientId: 'CARDIO-101', patientName: 'Participant One' },
  });
  const case1Dup = await makeRawRequest({
    path: '/api/cases/register',
    method: 'POST',
    headers: { Cookie: cookie1 || '', 'X-Group-Id': group1Id },
    body: { patientId: 'cardio 101', patientName: 'Participant Duplicate' },
  });
  assert(
    case1Dup.statusCode === 409 &&
      case1Dup.json?.error === 'DUPLICATE_CASE' &&
      case1Dup.json?.message === 'Record Already Registered' &&
      (case1Dup.json?.case?.patientId === 'CARDIO-101' || case1Dup.json?.case?.patient_id === 'CARDIO-101') &&
      checkNoLeakage(case1Dup.body, 'TEST K2'),
    'Duplicate case prevention returns structured HTTP 409 DUPLICATE_CASE with existing case record',
    `case1: ${case1.statusCode} ${case1.body}, case1Dup: ${case1Dup.statusCode} ${case1Dup.body}`
  );

  // --- L. MALFORMED PATCH / CASE DETAILS INPUT ---
  const malformedPatch = await makeRawRequest({
    path: `/api/cases/${case1.json?.case?.id}/details`,
    method: 'PATCH',
    headers: { Cookie: cookie1 || '', 'X-Group-Id': group1Id },
    body: { patientName: { evil: true }, customValues: 'not-an-object' },
  });
  assert(
    malformedPatch.statusCode === 400 &&
      malformedPatch.json?.error === 'BAD_REQUEST' &&
      checkNoLeakage(malformedPatch.body, 'TEST L'),
    'Malformed non-string fields in PATCH /api/cases/:id/details rejected safely with HTTP 400'
  );

  // --- M. NON-EXISTENT RESOURCE (404) ---
  const notFoundRes = await makeRawRequest({
    path: '/api/groups/non-existent-group-99999',
    method: 'GET',
    headers: { Cookie: cookie1 || '' },
  });
  assert(
    notFoundRes.statusCode === 404 &&
      notFoundRes.json?.error === 'NOT_FOUND' &&
      checkNoLeakage(notFoundRes.body, 'TEST M'),
    'Non-existent resource returns clean HTTP 404 NOT_FOUND without database lookup trace'
  );

  console.log('\n======================================================');
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSec007Verification().catch((err) => {
  console.error('Fatal error during verification test suite:', err);
  process.exit(1);
});
