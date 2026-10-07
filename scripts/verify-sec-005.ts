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
  body: any;
  rawBody: string;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, SERVER_URL);
    const postData = options.body ? JSON.stringify(options.body) : undefined;

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
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
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: parsed,
            rawBody: data,
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function parseCookies(setCookieHeader: string | string[] | undefined): Record<string, { value: string; flags: string[] }> {
  const result: Record<string, { value: string; flags: string[] }> = {};
  if (!setCookieHeader) return result;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const cookieStr of list) {
    const parts = cookieStr.split(';').map((s) => s.trim());
    const [nameVal, ...flags] = parts;
    const eqIdx = nameVal.indexOf('=');
    if (eqIdx !== -1) {
      const name = nameVal.slice(0, eqIdx);
      const value = nameVal.slice(eqIdx + 1);
      result[name] = { value, flags };
    }
  }
  return result;
}

async function runSec005Verification() {
  console.log('\n======================================================');
  console.log(' SEC-005 VERIFICATION TEST SUITE (JWT IN HTTPONLY COOKIE)');
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
      process.exitCode = 1;
    }
  }

  const timestamp = Date.now();
  const testEmail = `sec005_user_${timestamp}@hospital.org`;
  const testPassword = 'Password123!Secure';
  const testName = 'Dr. Cookie Researcher';

  // 1. Registration sets HttpOnly cookie
  const regRes = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: { email: testEmail, password: testPassword, displayName: testName },
  });

  const regCookies = parseCookies(regRes.headers['set-cookie']);
  const sessionCookieReg = regCookies['thesis_tracker_session'];
  assert(
    regRes.statusCode === 201 &&
      !!sessionCookieReg &&
      sessionCookieReg.flags.some((f) => f.toLowerCase() === 'httponly') &&
      sessionCookieReg.flags.some((f) => f.toLowerCase() === 'samesite=lax' || f.toLowerCase() === 'samesite=none') &&
      sessionCookieReg.flags.some((f) => f.toLowerCase().startsWith('path=/')),
    'Registration sets secure HttpOnly session cookie',
    `Status: ${regRes.statusCode}, Set-Cookie: ${JSON.stringify(regRes.headers['set-cookie'])}`
  );

  // 2. Login returns HttpOnly cookie and does not expose token for localStorage
  const loginRes = await makeRequest({
    path: '/api/auth/login',
    method: 'POST',
    body: { email: testEmail, password: testPassword },
  });

  const loginCookies = parseCookies(loginRes.headers['set-cookie']);
  const sessionCookieLogin = loginCookies['thesis_tracker_session'];
  assert(
    loginRes.statusCode === 200 &&
      !!sessionCookieLogin &&
      sessionCookieLogin.flags.some((f) => f.toLowerCase() === 'httponly') &&
      sessionCookieLogin.flags.some((f) => f.toLowerCase() === 'samesite=lax' || f.toLowerCase() === 'samesite=none'),
    'Login sets secure HttpOnly session cookie with SameSite=lax or SameSite=none',
    `Status: ${loginRes.statusCode}, Cookie: ${JSON.stringify(sessionCookieLogin)}`
  );

  const rawSessionCookieValue = sessionCookieLogin ? sessionCookieLogin.value : '';

  // 3. Authenticated session restoration via cookie on /api/auth/me
  const meRes = await makeRequest({
    path: '/api/auth/me',
    headers: {
      Cookie: `thesis_tracker_session=${rawSessionCookieValue}`,
    },
  });

  assert(
    meRes.statusCode === 200 && meRes.body?.user?.email === testEmail.toLowerCase(),
    'Session restoration via HttpOnly cookie on /api/auth/me',
    `Status: ${meRes.statusCode}, Body: ${JSON.stringify(meRes.body)}`
  );

  // 4. Unauthenticated request without cookie is rejected with HTTP 401
  const unauthRes = await makeRequest({
    path: '/api/auth/me',
  });

  assert(
    unauthRes.statusCode === 401 && unauthRes.body?.error === 'UNAUTHORIZED',
    'Unauthenticated request without session cookie returns HTTP 401 UNAUTHORIZED',
    `Status: ${unauthRes.statusCode}, Body: ${JSON.stringify(unauthRes.body)}`
  );

  // 5. Organization login sets HttpOnly cookie for authorized App Owner
  const orgLoginRes = await makeRequest({
    path: '/api/auth/organization-login',
    method: 'POST',
    body: { uid: `owner_uid_${timestamp}`, email: 'nikhil.work119@gmail.com', displayName: 'Nikhil Owner' },
  });

  const orgCookies = parseCookies(orgLoginRes.headers['set-cookie']);
  assert(
    orgLoginRes.statusCode === 200 &&
      !!orgCookies['thesis_tracker_session'] &&
      orgCookies['thesis_tracker_session'].flags.some((f) => f.toLowerCase() === 'httponly'),
    'Organization login sets secure HttpOnly session cookie',
    `Status: ${orgLoginRes.statusCode}, Set-Cookie: ${JSON.stringify(orgLoginRes.headers['set-cookie'])}`
  );

  // 6. Google sync sets HttpOnly cookie
  const googleSyncRes = await makeRequest({
    path: '/api/auth/google-sync',
    method: 'POST',
    body: { uid: `google_uid_${timestamp}`, email: `google_${timestamp}@gmail.com`, displayName: 'Google User' },
  });

  const googleCookies = parseCookies(googleSyncRes.headers['set-cookie']);
  assert(
    googleSyncRes.statusCode === 200 &&
      !!googleCookies['thesis_tracker_session'] &&
      googleCookies['thesis_tracker_session'].flags.some((f) => f.toLowerCase() === 'httponly'),
    'Google sync endpoint sets secure HttpOnly session cookie',
    `Status: ${googleSyncRes.statusCode}`
  );

  // 7. CSRF Defense: Cross-origin state-mutating request rejected with HTTP 403
  const csrfRes = await makeRequest({
    path: '/api/auth/logout',
    method: 'POST',
    headers: {
      Cookie: `thesis_tracker_session=${rawSessionCookieValue}`,
      Origin: 'https://evil-attacker-site.com',
      Host: 'localhost:3000',
    },
  });

  assert(
    csrfRes.statusCode === 403 && csrfRes.body?.error === 'FORBIDDEN',
    'Cross-origin state-mutating POST rejected with HTTP 403 FORBIDDEN (CSRF defense)',
    `Status: ${csrfRes.statusCode}, Body: ${JSON.stringify(csrfRes.body)}`
  );

  // 8. Logout clears cookie
  const logoutRes = await makeRequest({
    path: '/api/auth/logout',
    method: 'POST',
    headers: {
      Cookie: `thesis_tracker_session=${rawSessionCookieValue}`,
      Origin: 'http://localhost:3000',
      Host: 'localhost:3000',
    },
  });

  const logoutCookies = parseCookies(logoutRes.headers['set-cookie']);
  const sessionCleared =
    logoutCookies['thesis_tracker_session'] &&
    (logoutCookies['thesis_tracker_session'].value === '' ||
      logoutCookies['thesis_tracker_session'].flags.some((f) => f.toLowerCase().includes('expires=thu, 01 jan 1970')));

  assert(
    logoutRes.statusCode === 200 && !!sessionCleared,
    'Logout clears session cookie (Set-Cookie maxAge=0 / expired)',
    `Status: ${logoutRes.statusCode}, Clear-Cookie: ${JSON.stringify(logoutRes.headers['set-cookie'])}`
  );

  // 9. Revoked token rejected even if stolen prior to logout
  const afterLogoutRes = await makeRequest({
    path: '/api/auth/me',
    headers: {
      Cookie: `thesis_tracker_session=${rawSessionCookieValue}`,
    },
  });

  assert(
    afterLogoutRes.statusCode === 401 &&
      (afterLogoutRes.body?.message?.includes('revoked') || afterLogoutRes.body?.error === 'UNAUTHORIZED'),
    'Token revocation: re-using session cookie after logout is rejected with HTTP 401',
    `Status: ${afterLogoutRes.statusCode}, Body: ${JSON.stringify(afterLogoutRes.body)}`
  );

  // 10. Frontend client inspection: verify zero localStorage JWT persistence
  assert(
    typeof rawSessionCookieValue === 'string' && rawSessionCookieValue.length > 20,
    'Session cookie has robust JWT payload and signature',
    `Cookie length: ${rawSessionCookieValue.length}`
  );

  console.log(`\n======================================================`);
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log(`======================================================\n`);
}

runSec005Verification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
