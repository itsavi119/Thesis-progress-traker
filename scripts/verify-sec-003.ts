import http from 'node:http';

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
  json: any;
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
          let parsedJson: any = null;
          try {
            parsedJson = JSON.parse(raw);
          } catch {}
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            data: raw,
            json: parsedJson,
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

async function runSec003Tests() {
  console.log('\n======================================================');
  console.log(' SEC-003 VERIFICATION TEST SUITE (AUTH RATE LIMITING)');
  console.log('======================================================\n');

  let passedTests = 0;
  const totalTests = 10;

  // Reset rate limits initially
  await makeRequest({
    path: '/api/dev/reset-auth-rate-limit',
    method: 'POST',
  });

  // SETUP: Create a real test user account
  const testEmail = `testuser_${Date.now()}@hospital.org`;
  const testPassword = 'Password123!Secure';
  const registerRes = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: testEmail,
      password: testPassword,
      displayName: 'Dr. Rate Limit Test',
    },
  });

  if (registerRes.statusCode !== 201) {
    throw new Error(`Failed to register test user: ${registerRes.data}`);
  }
  console.log(`[SETUP] Registered test account: ${testEmail}`);

  // TEST 1: Baseline valid authentication
  console.log('[TEST 1] Baseline valid authentication...');
  const validLoginRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.0.1' },
    body: { email: testEmail, password: testPassword },
  });

  if (validLoginRes.statusCode === 200 && validLoginRes.json?.token) {
    console.log('✅ TEST 1 PASSED: Valid credentials login successfully with HTTP 200.');
    passedTests++;
  } else {
    console.error('❌ TEST 1 FAILED:', validLoginRes.data);
  }

  // TEST 2: Enumeration Prevention / Non-Distinguishable Failed Logins
  console.log('[TEST 2] Enumeration resistance: comparing failure responses for real vs fake accounts...');
  const fakeEmail = `nonexistent_${Date.now()}@hospital.org`;

  const realFailRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.0.2' },
    body: { email: testEmail, password: 'WrongPassword1' },
  });

  const fakeFailRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.0.2' },
    body: { email: fakeEmail, password: 'WrongPassword1' },
  });

  if (
    realFailRes.statusCode === 401 &&
    fakeFailRes.statusCode === 401 &&
    realFailRes.json?.error === 'INVALID_CREDENTIALS' &&
    fakeFailRes.json?.error === 'INVALID_CREDENTIALS' &&
    realFailRes.json?.message === fakeFailRes.json?.message
  ) {
    console.log('✅ TEST 2 PASSED: Real and fake accounts produce identical HTTP 401 INVALID_CREDENTIALS responses.');
    passedTests++;
  } else {
    console.error('❌ TEST 2 FAILED: Distinction observed between real and fake accounts');
  }

  // TEST 3: Account-based Rate Limiting (5 failed attempts / 15 minutes) for real account
  console.log('[TEST 3] Account-based rate limiting threshold (5 failed attempts) on real account...');
  // We already did 1 failure on 10.0.0.2, let's do 4 more to reach 5 total failures
  for (let i = 2; i <= 5; i++) {
    const res = await makeRequest({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.0.1.${i}` }, // different IPs to isolate account limit
      body: { email: testEmail, password: `WrongPassword${i}` },
    });
    if (res.statusCode !== 401) {
      console.warn(`Attempt ${i} got unexpected code: ${res.statusCode}`);
    }
  }

  // 6th attempt: Must be throttled with HTTP 429
  const realThrottledRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.1.99' },
    body: { email: testEmail, password: 'WrongPassword6' },
  });

  const retryAfterHeader = realThrottledRes.headers['retry-after'];
  if (
    realThrottledRes.statusCode === 429 &&
    realThrottledRes.json?.error === 'TOO_MANY_REQUESTS' &&
    retryAfterHeader &&
    parseInt(retryAfterHeader as string, 10) > 0
  ) {
    console.log(`✅ TEST 3 PASSED: 6th failed attempt throttled with HTTP 429 and Retry-After: ${retryAfterHeader}s.`);
    passedTests++;
  } else {
    console.error('❌ TEST 3 FAILED:', realThrottledRes.statusCode, realThrottledRes.data);
  }

  // TEST 4: Account-based Rate Limiting on Non-Existent Account (Zero Enumeration Oracle)
  console.log('[TEST 4] Account-based rate limiting threshold on non-existent account...');
  const fakeAccount = `fake_${Date.now()}@nowhere.edu`;
  for (let i = 1; i <= 5; i++) {
    await makeRequest({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.0.2.${i}` },
      body: { email: fakeAccount, password: `WrongPassword${i}` },
    });
  }

  // 6th attempt on fake account must also return HTTP 429
  const fakeThrottledRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.2.99' },
    body: { email: fakeAccount, password: 'WrongPassword6' },
  });

  if (
    fakeThrottledRes.statusCode === 429 &&
    fakeThrottledRes.json?.error === 'TOO_MANY_REQUESTS' &&
    fakeThrottledRes.json?.message === realThrottledRes.json?.message
  ) {
    console.log('✅ TEST 4 PASSED: Non-existent account throttled identically with HTTP 429; no enumeration oracle.');
    passedTests++;
  } else {
    console.error('❌ TEST 4 FAILED:', fakeThrottledRes.statusCode, fakeThrottledRes.data);
  }

  // TEST 5: Email Normalization Consistency (case insensitivity & whitespace trimming)
  console.log('[TEST 5] Email normalization consistency in rate limit bucket...');
  const normalizedTestEmail = `norm_${Date.now()}@domain.org`;
  const regNorm = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: { email: normalizedTestEmail, password: testPassword, displayName: 'Norm User' },
  });
  if (regNorm.statusCode !== 201) throw new Error('Registration failed for norm test');

  // Send failed attempts with mixed case and whitespace
  const variations = [
    `  ${normalizedTestEmail} `,
    normalizedTestEmail.toUpperCase(),
    ` ${normalizedTestEmail.toUpperCase()}  `,
    normalizedTestEmail,
    normalizedTestEmail.replace('@', '@'),
  ];

  for (let i = 0; i < 5; i++) {
    await makeRequest({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.0.3.${i}` },
      body: { email: variations[i], password: 'Wrong' },
    });
  }

  // 6th attempt with standard casing should be throttled
  const normThrottledRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.3.99' },
    body: { email: normalizedTestEmail.toLowerCase(), password: 'Wrong' },
  });

  if (normThrottledRes.statusCode === 429) {
    console.log('✅ TEST 5 PASSED: Normalization correctly collates mixed casing and whitespace into single bucket.');
    passedTests++;
  } else {
    console.error('❌ TEST 5 FAILED:', normThrottledRes.statusCode, normThrottledRes.data);
  }

  // TEST 6: Successful Login Resets Failed Attempts Counter
  console.log('[TEST 6] Successful login clears accumulated failed attempts...');
  const resetTestEmail = `reset_${Date.now()}@domain.org`;
  await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: { email: resetTestEmail, password: testPassword, displayName: 'Reset Test' },
  });

  // Make 4 failed attempts (1 shy of lockout)
  for (let i = 1; i <= 4; i++) {
    await makeRequest({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.0.4.${i}` },
      body: { email: resetTestEmail, password: 'Wrong' },
    });
  }

  // Successful login with correct credentials
  const successRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.4.50' },
    body: { email: resetTestEmail, password: testPassword },
  });

  if (successRes.statusCode !== 200) {
    console.error('❌ TEST 6 FAILED: Login failed with correct password');
  } else {
    // Now make 4 more failed attempts - should NOT be locked out because counter was reset!
    let lockedOutPrematurely = false;
    for (let i = 1; i <= 4; i++) {
      const failRes = await makeRequest({
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'X-Forwarded-For': `10.0.4.6${i}` },
        body: { email: resetTestEmail, password: 'Wrong' },
      });
      if (failRes.statusCode === 429) {
        lockedOutPrematurely = true;
        break;
      }
    }

    if (!lockedOutPrematurely) {
      console.log('✅ TEST 6 PASSED: Successful authentication cleared failed attempts; legitimate user preserved.');
      passedTests++;
    } else {
      console.error('❌ TEST 6 FAILED: Account was locked out prematurely after successful login reset.');
    }
  }

  // TEST 7: IP-based Rate Limiting (20 requests / minute)
  console.log('[TEST 7] IP-based rate limiting threshold (20 requests / min per IP)...');
  const attackIp = '192.168.100.50';

  // Make 20 authentication requests from attackIp with rotating emails (credential stuffing simulation)
  let ipThrottledEarly = false;
  for (let i = 1; i <= 20; i++) {
    const res = await makeRequest({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'X-Forwarded-For': attackIp },
      body: { email: `victim_${i}_${Date.now()}@hospital.org`, password: 'Password123!' },
    });
    if (res.statusCode === 429) {
      ipThrottledEarly = true;
      break;
    }
  }

  // 21st request from same IP must be throttled with HTTP 429
  const ipThrottledRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': attackIp },
    body: { email: `another_user_${Date.now()}@hospital.org`, password: 'Password123!' },
  });

  const ipRetryAfter = ipThrottledRes.headers['retry-after'];
  if (
    !ipThrottledEarly &&
    ipThrottledRes.statusCode === 429 &&
    ipThrottledRes.json?.error === 'TOO_MANY_REQUESTS' &&
    ipRetryAfter
  ) {
    console.log(`✅ TEST 7 PASSED: IP exceeded 20 req/min and throttled with HTTP 429 (Retry-After: ${ipRetryAfter}s).`);
    passedTests++;
  } else {
    console.error('❌ TEST 7 FAILED:', ipThrottledRes.statusCode, ipThrottledRes.data);
  }

  // TEST 8: Organization Login Endpoint Rate Limiting
  console.log('[TEST 8] Organization login endpoint layered rate limiting...');
  const orgAttackIp = '192.168.100.99';
  const orgTestAccount = `org_admin_${Date.now()}@hospital.org`;

  for (let i = 1; i <= 5; i++) {
    await makeRequest({
      path: '/api/auth/organization-login',
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.0.5.${i}` },
      body: { email: orgTestAccount, password: 'WrongPassword' },
    });
  }

  const orgThrottledRes = await makeRequest({
    path: '/api/auth/organization-login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.5.99' },
    body: { email: orgTestAccount, password: 'WrongPassword' },
  });

  if (orgThrottledRes.statusCode === 429 && orgThrottledRes.json?.error === 'TOO_MANY_REQUESTS') {
    console.log('✅ TEST 8 PASSED: /api/auth/organization-login enforces account rate limiting.');
    passedTests++;
  } else {
    console.error('❌ TEST 8 FAILED:', orgThrottledRes.statusCode, orgThrottledRes.data);
  }

  // TEST 9: Security Audit Logging for Exceeded Rate Limits
  console.log('[TEST 9] Security audit logging verification...');
  // Inspect database file for audit logs of type AUTH_RATE_LIMIT_EXCEEDED
  const fs = await import('node:fs');
  const dbData = JSON.parse(fs.readFileSync('data/thesis_tracker_db.json', 'utf8'));
  const authRateLimitLogs = (dbData.audit_logs || []).filter(
    (log: any) => log.action === 'AUTH_RATE_LIMIT_EXCEEDED'
  );

  if (authRateLimitLogs.length > 0) {
    // Verify no passwords are in any audit log
    const passwordsLeaked = authRateLimitLogs.some((l: any) =>
      JSON.stringify(l).includes('Password123!') || JSON.stringify(l).includes('WrongPassword')
    );
    if (!passwordsLeaked) {
      console.log(`✅ TEST 9 PASSED: Found ${authRateLimitLogs.length} AUTH_RATE_LIMIT_EXCEEDED audit logs. Zero credentials leaked.`);
      passedTests++;
    } else {
      console.error('❌ TEST 9 FAILED: Passwords leaked in audit logs!');
    }
  } else {
    console.error('❌ TEST 9 FAILED: No audit logs found for AUTH_RATE_LIMIT_EXCEEDED');
  }

  // TEST 10: Dev Reset Endpoint
  console.log('[TEST 10] Dev reset endpoint functionality...');
  const resetRes = await makeRequest({
    path: '/api/dev/reset-auth-rate-limit',
    method: 'POST',
  });

  // Now the previously throttled IP should be able to make a request again
  const unthrottledRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': attackIp },
    body: { email: testEmail, password: testPassword },
  });

  if (resetRes.statusCode === 200 && unthrottledRes.statusCode === 200) {
    console.log('✅ TEST 10 PASSED: Dev reset successfully cleared rate limits for testing.');
    passedTests++;
  } else {
    console.error('❌ TEST 10 FAILED:', resetRes.statusCode, unthrottledRes.statusCode);
  }

  console.log('\n======================================================');
  console.log(` FINAL RESULTS: ${passedTests}/${totalTests} SCENARIOS PASSED`);
  console.log('======================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSec003Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
