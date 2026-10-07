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
  rawHeaders: string[];
  body: string;
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
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            rawHeaders: res.rawHeaders,
            body: data,
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

function verifyNoTechnologyDisclosure(
  headers: http.IncomingHttpHeaders,
  rawHeaders: string[],
  endpointLabel: string
): { passed: boolean; message: string } {
  // 1. Strict check for x-powered-by
  if (headers['x-powered-by'] !== undefined) {
    return {
      passed: false,
      message: `X-Powered-By header found in ${endpointLabel}: "${headers['x-powered-by']}"`,
    };
  }

  // 2. Case-insensitive raw header inspection
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const headerName = rawHeaders[i]?.toLowerCase();
    const headerValue = rawHeaders[i + 1];

    if (headerName === 'x-powered-by') {
      return {
        passed: false,
        message: `X-Powered-By raw header found in ${endpointLabel}: "${headerValue}"`,
      };
    }

    // Ensure no replacement technology disclosure headers (e.g. Server: Express, X-Framework: Express)
    if (headerName === 'x-framework' || (headerName === 'server' && /express|node/i.test(headerValue || ''))) {
      return {
        passed: false,
        message: `Alternative technology disclosure header found in ${endpointLabel}: ${headerName}: "${headerValue}"`,
      };
    }
  }

  return { passed: true, message: 'Clean - No technology disclosure' };
}

async function runSec009Verification() {
  console.log('\n======================================================');
  console.log(' SEC-009 VERIFICATION TEST SUITE');
  console.log(' (EXPRESS TECHNOLOGY DISCLOSURE REMEDIATION)');
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

  // 1. GET / (Root SPA / Static Response)
  console.log('[TEST 1] Testing Root GET / response...');
  const resRoot = await makeRawRequest({ path: '/', method: 'GET' });
  const checkRoot = verifyNoTechnologyDisclosure(resRoot.headers, resRoot.rawHeaders, 'GET /');
  assert(
    checkRoot.passed && resRoot.headers['x-powered-by'] === undefined,
    'Root path (GET /) does NOT expose X-Powered-By header',
    checkRoot.message
  );

  // 2. Representative unauthenticated API endpoint
  console.log('[TEST 2] Testing API GET /api/auth/team-capacity response...');
  const resApi = await makeRawRequest({ path: '/api/auth/team-capacity', method: 'GET' });
  const checkApi = verifyNoTechnologyDisclosure(resApi.headers, resApi.rawHeaders, 'GET /api/auth/team-capacity');
  assert(
    checkApi.passed && resApi.headers['x-powered-by'] === undefined,
    'Standard API endpoint does NOT expose X-Powered-By header',
    checkApi.message
  );

  // 3. HTTP 404 Not Found response
  console.log('[TEST 3] Testing 404 Not Found route...');
  const res404 = await makeRawRequest({ path: '/api/nonexistent-route-for-testing-404', method: 'GET' });
  const check404 = verifyNoTechnologyDisclosure(res404.headers, res404.rawHeaders, '404 Response');
  assert(
    check404.passed && res404.headers['x-powered-by'] === undefined,
    'HTTP 404 Not Found response does NOT expose X-Powered-By header',
    check404.message
  );

  // 4. HTTP 400 Bad Request error response
  console.log('[TEST 4] Testing 400 Bad Request error response...');
  const res400 = await makeRawRequest({
    path: '/api/auth/login',
    method: 'POST',
    body: { invalid: 'payload' },
  });
  const check400 = verifyNoTechnologyDisclosure(res400.headers, res400.rawHeaders, '400 Bad Request');
  assert(
    check400.passed && res400.statusCode === 400 && res400.headers['x-powered-by'] === undefined,
    'HTTP 400 Bad Request response does NOT expose X-Powered-By header',
    check400.message
  );

  // 5. HTTP 401 Unauthorized response
  console.log('[TEST 5] Testing 401 Unauthorized response...');
  const res401 = await makeRawRequest({
    path: '/api/auth/me',
    method: 'GET',
    headers: { Authorization: 'Bearer invalid.token' },
  });
  const check401 = verifyNoTechnologyDisclosure(res401.headers, res401.rawHeaders, '401 Unauthorized');
  assert(
    check401.passed && res401.statusCode === 401 && res401.headers['x-powered-by'] === undefined,
    'HTTP 401 Unauthorized response does NOT expose X-Powered-By header',
    check401.message
  );

  // 6. HTTP 500 Unexpected Server Error response
  console.log('[TEST 6] Testing 500 Server Error response...');
  const res500 = await makeRawRequest({ path: '/api/dev/force-error', method: 'GET' });
  const check500 = verifyNoTechnologyDisclosure(res500.headers, res500.rawHeaders, '500 Server Error');
  assert(
    check500.passed && res500.statusCode === 500 && res500.headers['x-powered-by'] === undefined,
    'HTTP 500 Server Error response does NOT expose X-Powered-By header',
    check500.message
  );

  // 7. Authenticated API response
  console.log('[TEST 7] Testing authenticated API response...');
  const timestamp = Date.now();
  const regUser = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `sec009_user_${timestamp}@hospital.org`,
      password: 'StrongPassword123!',
      displayName: 'SEC009 Tester',
    },
  });
  const authCookie = regUser.headers['set-cookie']?.[0]?.split(';')[0];
  const resAuth = await makeRawRequest({
    path: '/api/auth/me',
    method: 'GET',
    headers: { Cookie: authCookie || '' },
  });
  const checkAuth = verifyNoTechnologyDisclosure(resAuth.headers, resAuth.rawHeaders, 'Authenticated GET /api/auth/me');
  assert(
    checkAuth.passed && resAuth.statusCode === 200 && resAuth.headers['x-powered-by'] === undefined,
    'Authenticated API response does NOT expose X-Powered-By header',
    checkAuth.message
  );

  // 8. Real-time SSE Endpoint (/api/cases/events)
  console.log('[TEST 8] Testing real-time SSE endpoint response headers...');
  const sseTest = await new Promise<{ headers: http.IncomingHttpHeaders; rawHeaders: string[] }>((resolve, reject) => {
    const url = new URL('/api/cases/events', SERVER_URL);
    const req = http.request(
      url,
      {
        method: 'GET',
        headers: { Cookie: authCookie || '' },
      },
      (res) => {
        req.destroy();
        resolve({ headers: res.headers, rawHeaders: res.rawHeaders });
      }
    );
    req.on('error', (err: any) => {
      if (err.code === 'ECONNRESET') return;
      reject(err);
    });
    req.end();
  });
  const checkSSE = verifyNoTechnologyDisclosure(sseTest.headers, sseTest.rawHeaders, 'SSE /api/cases/events');
  assert(
    checkSSE.passed && sseTest.headers['x-powered-by'] === undefined,
    'SSE Real-time events stream does NOT expose X-Powered-By header',
    checkSSE.message
  );

  // 9. Multiple HTTP methods (HEAD, OPTIONS, POST)
  console.log('[TEST 9] Testing HEAD, OPTIONS, and state-mutating requests...');
  const resHead = await makeRawRequest({ path: '/', method: 'HEAD' });
  const checkHead = verifyNoTechnologyDisclosure(resHead.headers, resHead.rawHeaders, 'HEAD /');

  const resOptions = await makeRawRequest({ path: '/api/auth/login', method: 'OPTIONS' });
  const checkOptions = verifyNoTechnologyDisclosure(resOptions.headers, resOptions.rawHeaders, 'OPTIONS /api/auth/login');

  assert(
    checkHead.passed && checkOptions.passed && resHead.headers['x-powered-by'] === undefined,
    'Alternative HTTP methods (HEAD, OPTIONS) do NOT expose X-Powered-By or replacement headers'
  );

  // 10. Verify no replacement technology headers
  console.log('[TEST 10] Checking for absent replacement technology disclosure headers...');
  const suspiciousHeaders = ['x-powered-by', 'x-framework', 'x-runtime'];
  let noSuspicious = true;
  for (const h of suspiciousHeaders) {
    if (resRoot.headers[h] !== undefined || resApi.headers[h] !== undefined || res404.headers[h] !== undefined) {
      noSuspicious = false;
      break;
    }
  }
  assert(
    noSuspicious,
    'No replacement framework-identifying headers (e.g. Server: Express, X-Framework) were introduced'
  );

  console.log('\n======================================================');
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSec009Verification().catch((err) => {
  console.error('Fatal error during SEC-009 verification:', err);
  process.exit(1);
});
