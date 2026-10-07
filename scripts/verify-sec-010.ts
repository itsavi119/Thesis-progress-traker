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

async function runSec010Verification() {
  console.log('\n======================================================');
  console.log(' SEC-010 VERIFICATION TEST SUITE');
  console.log(' (UNKNOWN API ROUTES 404 VS SPA FALLBACK SEPARATION)');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: any, testName: string, detail?: string) {
    total++;
    if (Boolean(condition)) {
      console.log(`✅ TEST ${total} PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`❌ TEST ${total} FAILED: ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
    }
  }

  // TEST 1: Unknown API GET
  console.log('[TEST 1] Testing unknown API route GET /api/nonexistent-security-test-route...');
  const resUnknownGet = await makeRawRequest({
    path: '/api/nonexistent-security-test-route',
    method: 'GET',
  });
  const isJson1 = resUnknownGet.headers['content-type']?.includes('application/json');
  const hasHtml1 = resUnknownGet.body.includes('<!doctype html>') || resUnknownGet.body.includes('<html');
  const hasStack1 = resUnknownGet.body.includes('stack') || resUnknownGet.body.includes('node_modules');
  assert(
    resUnknownGet.statusCode === 404 &&
      isJson1 &&
      !hasHtml1 &&
      !hasStack1 &&
      resUnknownGet.json?.error === 'NOT_FOUND',
    'Unknown API GET returns HTTP 404 with JSON error and NO SPA HTML shell or stack trace',
    `status: ${resUnknownGet.statusCode}, type: ${resUnknownGet.headers['content-type']}, body: ${resUnknownGet.body.slice(0, 150)}`
  );

  // TEST 2: Unknown API POST
  console.log('[TEST 2] Testing unknown API route POST /api/nonexistent-security-test-route...');
  const resUnknownPost = await makeRawRequest({
    path: '/api/nonexistent-security-test-route',
    method: 'POST',
    body: { test: true },
  });
  const isJson2 = resUnknownPost.headers['content-type']?.includes('application/json');
  const hasHtml2 = resUnknownPost.body.includes('<!doctype html>') || resUnknownPost.body.includes('<html');
  assert(
    resUnknownPost.statusCode === 404 &&
      isJson2 &&
      !hasHtml2 &&
      resUnknownPost.json?.error === 'NOT_FOUND',
    'Unknown API POST returns HTTP 404 with JSON error and NO SPA HTML shell',
    `status: ${resUnknownPost.statusCode}, type: ${resUnknownPost.headers['content-type']}`
  );

  // TEST 2B: Unknown API other HTTP methods (PUT, PATCH, DELETE)
  console.log('[TEST 2B] Testing unknown API route across PUT, PATCH, DELETE methods...');
  const resUnknownPut = await makeRawRequest({ path: '/api/nonexistent-put-route', method: 'PUT', body: {} });
  const resUnknownPatch = await makeRawRequest({ path: '/api/nonexistent-patch-route', method: 'PATCH', body: {} });
  const resUnknownDelete = await makeRawRequest({ path: '/api/nonexistent-delete-route', method: 'DELETE' });
  assert(
    resUnknownPut.statusCode === 404 &&
      resUnknownPatch.statusCode === 404 &&
      resUnknownDelete.statusCode === 404 &&
      resUnknownPut.json?.error === 'NOT_FOUND' &&
      resUnknownPatch.json?.error === 'NOT_FOUND' &&
      resUnknownDelete.json?.error === 'NOT_FOUND',
    'Unknown API routes for PUT, PATCH, and DELETE consistently return HTTP 404 JSON'
  );

  // TEST 3: Valid API route
  console.log('[TEST 3] Testing valid registered API route GET /api/auth/team-capacity...');
  const resValidApi = await makeRawRequest({
    path: '/api/auth/team-capacity',
    method: 'GET',
  });
  assert(
    resValidApi.statusCode === 200 &&
      resValidApi.headers['content-type']?.includes('application/json') &&
      typeof resValidApi.json?.availableSeats === 'number',
    'Valid API route GET /api/auth/team-capacity continues to function normally with HTTP 200 JSON'
  );

  // TEST 4: Valid frontend root route (GET /)
  console.log('[TEST 4] Testing valid frontend SPA root route GET /...');
  const resFrontendRoot = await makeRawRequest({
    path: '/',
    method: 'GET',
  });
  const isHtmlRoot = resFrontendRoot.headers['content-type']?.includes('text/html');
  const hasDocTypeRoot = resFrontendRoot.body.includes('<!doctype html>') || resFrontendRoot.body.includes('<div id="root">');
  assert(
    resFrontendRoot.statusCode === 200 && isHtmlRoot && hasDocTypeRoot,
    'Valid frontend route GET / correctly returns HTTP 200 OK with SPA HTML shell'
  );

  // TEST 5: Legitimate frontend client-side routes (e.g. /login, /dashboard)
  console.log('[TEST 5] Testing valid frontend client-side routes (/login, /dashboard)...');
  const resLogin = await makeRawRequest({ path: '/login', method: 'GET' });
  const resDashboard = await makeRawRequest({ path: '/dashboard', method: 'GET' });
  const isHtmlLogin = resLogin.headers['content-type']?.includes('text/html');
  const isHtmlDashboard = resDashboard.headers['content-type']?.includes('text/html');
  assert(
    resLogin.statusCode === 200 &&
      resDashboard.statusCode === 200 &&
      isHtmlLogin &&
      isHtmlDashboard,
    'Client-side SPA routes (/login, /dashboard) continue to serve SPA HTML shell with HTTP 200'
  );

  // TEST 6: Root /api path without trailing segment
  console.log('[TEST 6] Testing root /api endpoint...');
  const resRootApi = await makeRawRequest({ path: '/api', method: 'GET' });
  assert(
    resRootApi.statusCode === 404 &&
      resRootApi.headers['content-type']?.includes('application/json') &&
      resRootApi.json?.error === 'NOT_FOUND',
    'Root /api path returns clean HTTP 404 JSON NOT_FOUND without falling back to SPA shell'
  );

  // TEST 7: Deeply nested nonexistent API path
  console.log('[TEST 7] Testing deeply nested nonexistent API route...');
  const resDeepApi = await makeRawRequest({ path: '/api/v1/clinical/audit/deep/nonexistent', method: 'GET' });
  assert(
    resDeepApi.statusCode === 404 &&
      resDeepApi.headers['content-type']?.includes('application/json') &&
      resDeepApi.json?.error === 'NOT_FOUND',
    'Deeply nested unknown API route returns HTTP 404 JSON NOT_FOUND'
  );

  // TEST 8: Preserved security headers on 404 API response
  console.log('[TEST 8] Checking security headers on API 404 response...');
  assert(
    resUnknownGet.headers['x-powered-by'] === undefined &&
      resUnknownGet.headers['x-content-type-options'] === 'nosniff' &&
      resUnknownGet.headers['x-frame-options'] === 'DENY',
    'Security headers (SEC-006, SEC-009) properly applied to API 404 responses'
  );

  console.log('\n======================================================');
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSec010Verification().catch((err) => {
  console.error('Fatal error during SEC-010 verification:', err);
  process.exit(1);
});
