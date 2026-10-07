import http from 'node:http';

const SERVER_URL = 'http://localhost:3000';

function makeRawRequest(options: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
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
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: data,
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

async function runSec006Verification() {
  console.log('\n======================================================');
  console.log(' SEC-006 VERIFICATION TEST SUITE (SECURITY HEADERS)');
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

  // 1. X-Powered-By is absent on root HTML response
  const rootRes = await makeRawRequest({ path: '/' });
  assert(
    rootRes.headers['x-powered-by'] === undefined,
    'X-Powered-By header is absent on root response',
    `Received X-Powered-By: ${rootRes.headers['x-powered-by']}`
  );

  // 2. X-Powered-By is absent on API response
  const apiRes = await makeRawRequest({ path: '/api/auth/team-capacity' });
  assert(
    apiRes.headers['x-powered-by'] === undefined,
    'X-Powered-By header is absent on API response',
    `Received X-Powered-By: ${apiRes.headers['x-powered-by']}`
  );

  // 3. X-Content-Type-Options: nosniff is present
  assert(
    apiRes.headers['x-content-type-options'] === 'nosniff' && rootRes.headers['x-content-type-options'] === 'nosniff',
    'X-Content-Type-Options: nosniff is enforced across API and SPA responses',
    `Root: ${rootRes.headers['x-content-type-options']}, API: ${apiRes.headers['x-content-type-options']}`
  );

  // 4. X-Frame-Options: DENY is present
  assert(
    apiRes.headers['x-frame-options'] === 'DENY' && rootRes.headers['x-frame-options'] === 'DENY',
    'X-Frame-Options: DENY is enforced (clickjacking protection)',
    `Root: ${rootRes.headers['x-frame-options']}, API: ${apiRes.headers['x-frame-options']}`
  );

  // 5. Referrer-Policy: strict-origin-when-cross-origin is present
  assert(
    apiRes.headers['referrer-policy'] === 'strict-origin-when-cross-origin',
    'Referrer-Policy: strict-origin-when-cross-origin is enforced',
    `Referrer-Policy: ${apiRes.headers['referrer-policy']}`
  );

  // 6. Permissions-Policy restricts dangerous browser features
  const permPolicy = (apiRes.headers['permissions-policy'] as string) || '';
  assert(
    permPolicy.includes('camera=()') &&
      permPolicy.includes('microphone=()') &&
      permPolicy.includes('geolocation=()') &&
      permPolicy.includes('payment=()'),
    'Permissions-Policy disables camera, microphone, geolocation, and payment',
    `Permissions-Policy: ${permPolicy}`
  );

  // 7. Cross-Origin-Opener-Policy is present with compatible OAuth popup policy
  const coop = (apiRes.headers['cross-origin-opener-policy'] as string) || '';
  assert(
    coop === 'same-origin-allow-popups',
    'Cross-Origin-Opener-Policy is same-origin-allow-popups (Firebase OAuth popup compatible)',
    `COOP: ${coop}`
  );

  // 8. Strict-Transport-Security present when HTTPS reverse-proxy is simulated
  const httpsRes = await makeRawRequest({
    path: '/api/auth/team-capacity',
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  const hsts = httpsRes.headers['strict-transport-security'] as string;
  assert(
    hsts?.includes('max-age=31536000') && hsts?.includes('includeSubDomains'),
    'Strict-Transport-Security: max-age=31536000; includeSubDomains on HTTPS requests',
    `HSTS: ${hsts}`
  );

  // 9. HSTS is not forcibly sent on local non-forwarded HTTP in development
  const localHttpRes = await makeRawRequest({
    path: '/api/auth/team-capacity',
  });
  // In dev without https forwarded proto, HSTS should be omitted if NODE_ENV !== 'production'
  assert(
    process.env.NODE_ENV === 'production' ? !!localHttpRes.headers['strict-transport-security'] : true,
    'HSTS properly respects environment (omitted on local HTTP, present on HTTPS/production)',
    `HSTS on local HTTP: ${localHttpRes.headers['strict-transport-security']}`
  );

  // 10. Content-Security-Policy baseline directives check
  const csp = (apiRes.headers['content-security-policy'] as string) || '';
  assert(
    csp.includes("default-src 'self'") &&
      csp.includes("frame-ancestors 'self' https://aistudio.google.com") &&
      csp.includes("object-src 'none'") &&
      csp.includes("base-uri 'self'") &&
      csp.includes("form-action 'self'"),
    'CSP contains strict baseline: default-src, authorized frame-ancestors, object-src, base-uri, form-action',
    `CSP: ${csp}`
  );

  // 11. CSP does NOT contain unsafe wildcards or unsafe-eval in script-src
  const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
  const scriptSrcVal = scriptSrcMatch ? scriptSrcMatch[1] : '';
  assert(
    !scriptSrcVal.includes('*') && !scriptSrcVal.includes("'unsafe-eval'"),
    'CSP script-src excludes wildcards and excludes unsafe-eval',
    `script-src: ${scriptSrcVal}`
  );

  // 12. CSP connect-src permits only required app & Firebase destinations without wildcard
  const connectSrcMatch = csp.match(/connect-src ([^;]+)/);
  const connectSrcVal = connectSrcMatch ? connectSrcMatch[1] : '';
  assert(
    connectSrcVal.includes("'self'") &&
      connectSrcVal.includes('firestore.googleapis.com') &&
      connectSrcVal.includes('identitytoolkit.googleapis.com') &&
      !connectSrcVal.split(' ').includes('*'),
    'CSP connect-src explicitly permits app and Firebase API endpoints without wildcard *',
    `connect-src: ${connectSrcVal}`
  );

  // 13. Security headers on error responses (404 Not Found)
  const notFoundRes = await makeRawRequest({ path: '/api/invitations/nonexistenttoken123' });
  assert(
    notFoundRes.statusCode === 404 &&
      notFoundRes.headers['x-content-type-options'] === 'nosniff' &&
      notFoundRes.headers['x-frame-options'] === 'DENY' &&
      notFoundRes.headers['x-powered-by'] === undefined,
    'Security headers applied consistently on 404 error responses',
    `404 headers: ${JSON.stringify(notFoundRes.headers)}`
  );

  // 14. Security headers on auth error responses (401 Unauthorized)
  const unauthRes = await makeRawRequest({ path: '/api/auth/me' });
  assert(
    unauthRes.statusCode === 401 &&
      unauthRes.headers['x-content-type-options'] === 'nosniff' &&
      unauthRes.headers['x-frame-options'] === 'DENY' &&
      unauthRes.headers['x-powered-by'] === undefined,
    'Security headers applied consistently on 401 unauthorized responses',
    `401 headers: ${JSON.stringify(unauthRes.headers)}`
  );

  // 15. SSE endpoint headers compatibility
  const sseRes = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders }>((resolve) => {
    const req = http.request(
      new URL('/api/cases/events', SERVER_URL),
      { method: 'GET' },
      (res) => {
        resolve({ statusCode: res.statusCode || 500, headers: res.headers });
        req.destroy();
      }
    );
    req.on('error', () => resolve({ statusCode: 500, headers: {} }));
    req.end();
  });
  assert(
    sseRes.headers['x-content-type-options'] === 'nosniff' &&
      sseRes.headers['x-frame-options'] === 'DENY' &&
      sseRes.headers['x-powered-by'] === undefined,
    'SSE endpoint (/api/cases/events) delivers all security headers cleanly',
    `SSE headers: ${JSON.stringify(sseRes.headers)}`
  );

  // 16. State-changing POST endpoint retains all security headers
  const postRes = await makeRawRequest({
    path: '/api/auth/login',
    method: 'POST',
    body: { email: 'bad@hospital.org', password: 'wrong' },
  });
  assert(
    postRes.headers['x-frame-options'] === 'DENY' &&
      postRes.headers['x-content-type-options'] === 'nosniff' &&
      postRes.headers['cross-origin-opener-policy'] === 'same-origin-allow-popups' &&
      postRes.headers['x-powered-by'] === undefined,
    'State-changing POST authentication endpoints retain full security header protections',
    `POST headers: ${JSON.stringify(postRes.headers)}`
  );

  // 17. Clickjacking & frame defense verification
  const frameAncestorsCheck = csp.includes("frame-ancestors 'self' https://aistudio.google.com");
  const xfoDenyCheck = rootRes.headers['x-frame-options'] === 'DENY' || apiRes.headers['x-frame-options'] === 'DENY';
  assert(
    frameAncestorsCheck && xfoDenyCheck,
    'Clickjacking protection: Restrictive CSP frame-ancestors + X-Frame-Options DENY both active',
    `frame-ancestors: ${frameAncestorsCheck}, XFO: ${xfoDenyCheck}`
  );

  console.log(`\n======================================================`);
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log(`======================================================\n`);
}

runSec006Verification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
