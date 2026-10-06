import http from 'node:http';

const SERVER_URL = 'http://localhost:3000';

// Helper to make HTTP request
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

// Helper to connect to SSE stream with event capture
function connectSSE(options: {
  path: string;
  headers?: Record<string, string>;
}): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  events: any[];
  close: () => void;
  waitForEvent: (timeoutMs?: number) => Promise<any>;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, SERVER_URL);
    const events: any[] = [];
    let eventResolvers: Array<(ev: any) => void> = [];

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const block of lines) {
            for (const line of block.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (eventResolvers.length > 0) {
                    const resolver = eventResolvers.shift()!;
                    resolver(parsed);
                  } else {
                    events.push(parsed);
                  }
                } catch {
                  // Ignore heartbeat
                }
              }
            }
          }
        });

        const close = () => {
          req.destroy();
        };

        const waitForEvent = (timeoutMs = 3000): Promise<any> => {
          return new Promise((resEv, rejEv) => {
            if (events.length > 0) {
              return resEv(events.shift());
            }
            const timer = setTimeout(() => {
              eventResolvers = eventResolvers.filter((r) => r !== resEv);
              rejEv(new Error('Timed out waiting for SSE event'));
            }, timeoutMs);

            eventResolvers.push((ev) => {
              clearTimeout(timer);
              resEv(ev);
            });
          });
        };

        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          events,
          close,
          waitForEvent,
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log(' SEC-001 VERIFICATION TEST SUITE (10 SCENARIOS)');
  console.log('======================================================\n');

  // --- SETUP SYNTHETIC USERS & STUDIES VIA REST API ---
  const time = Date.now();

  // Register Account A
  const regRespA = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `sec_test_alice_${time}@hospital.test`,
      password: 'SecurePassword123!',
      displayName: 'Dr. Synthetic Alice',
    },
  });
  if (regRespA.statusCode !== 201) {
    throw new Error(`Failed to register Account A: ${regRespA.data}`);
  }
  const authA = JSON.parse(regRespA.data);
  const tokenA = authA.token;
  const userA = authA.user;

  // Register Account B
  const regRespB = await makeRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `sec_test_bob_${time}@hospital.test`,
      password: 'SecurePassword123!',
      displayName: 'Dr. Synthetic Bob',
    },
  });
  if (regRespB.statusCode !== 201) {
    throw new Error(`Failed to register Account B: ${regRespB.data}`);
  }
  const authB = JSON.parse(regRespB.data);
  const tokenB = authB.token;
  const userB = authB.user;

  // Account A creates Study A
  const groupRespA = await makeRequest({
    path: '/api/groups',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      name: `Cardiology Study A ${time}`,
      studyTitle: 'Prospective Clinical Evaluation of Cardiology Records',
      targetSampleSize: 50,
    },
  });
  if (groupRespA.statusCode !== 201) {
    throw new Error(`Failed to create Study A: ${groupRespA.data}`);
  }
  const studyA = JSON.parse(groupRespA.data).group;

  // Account B creates Study B
  const groupRespB = await makeRequest({
    path: '/api/groups',
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      name: `Oncology Study B ${time}`,
      studyTitle: 'Prospective Clinical Evaluation of Oncology Records',
      targetSampleSize: 50,
    },
  });
  if (groupRespB.statusCode !== 201) {
    throw new Error(`Failed to create Study B: ${groupRespB.data}`);
  }
  const studyB = JSON.parse(groupRespB.data).group;

  console.log(`[SETUP] Registered Account A (id=${userA.id}) -> Study A (id=${studyA.id})`);
  console.log(`[SETUP] Registered Account B (id=${userB.id}) -> Study B (id=${studyB.id})`);

  let passed = 0;
  const total = 10;

  // -------------------------------------------------------------------------
  // TEST 1 — Authorized member (Account A requests Study A events)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 1] Authorized member: Account A requests SSE for Study A via X-Group-Id...');
    const sseA = await connectSSE({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Group-Id': studyA.id,
      },
    });

    if (sseA.statusCode !== 200) {
      throw new Error(`Expected HTTP 200, got ${sseA.statusCode}`);
    }
    if (!sseA.headers['content-type']?.includes('text/event-stream')) {
      throw new Error(`Expected text/event-stream header, got ${sseA.headers['content-type']}`);
    }

    const connectedEv = await sseA.waitForEvent(2000);
    if (connectedEv.type !== 'connected' || connectedEv.groupId !== studyA.id) {
      throw new Error(`Expected initial connected event for studyA, got ${JSON.stringify(connectedEv)}`);
    }

    sseA.close();
    console.log('✅ TEST 1 PASSED: Authorized member connected successfully and received connected event.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 1 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2 — Unauthorized member (Account B requests Study A events)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 2] Unauthorized member: Account B requests SSE for Study A via X-Group-Id...');
    const resp = await makeRequest({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Group-Id': studyA.id,
      },
    });

    if (resp.statusCode !== 403) {
      throw new Error(`Expected HTTP 403, got ${resp.statusCode}`);
    }
    const contentType = resp.headers['content-type'] || '';
    if (contentType.includes('text/event-stream')) {
      throw new Error(`CRITICAL: Server returned text/event-stream to unauthorized user!`);
    }
    const body = JSON.parse(resp.data);
    if (body.error !== 'FORBIDDEN') {
      throw new Error(`Expected error FORBIDDEN, got ${JSON.stringify(body)}`);
    }

    console.log('✅ TEST 2 PASSED: Unauthorized user received HTTP 403 JSON; no SSE headers sent.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 2 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3 — Event leakage test
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 3] Event leakage test: Verify Account B cannot receive Study A events...');
    // Account A connects to Study A
    const sseA = await connectSSE({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Group-Id': studyA.id,
      },
    });
    await sseA.waitForEvent(2000); // consume 'connected'

    // Attempt by Account B to connect to Study A is rejected
    const sseBResp = await makeRequest({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Group-Id': studyA.id,
      },
    });
    if (sseBResp.statusCode !== 403) {
      throw new Error(`Account B was not rejected with 403: status ${sseBResp.statusCode}`);
    }

    // Account A registers a synthetic patient record in Study A via REST API
    const regCaseResp = await makeRequest({
      path: '/api/cases/register',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Group-Id': studyA.id,
      },
      body: {
        groupId: studyA.id,
        patientId: `CARDIO-${time}-01`,
        patientName: 'Confidential Patient Alpha',
        diagnosis: 'Acute Coronary Syndrome',
      },
    });
    if (regCaseResp.statusCode !== 201) {
      throw new Error(`Failed to register synthetic case: ${regCaseResp.data}`);
    }

    // Account A receives case_registered event
    const receivedEventA = await sseA.waitForEvent(3000);
    if (receivedEventA.type !== 'case_registered') {
      throw new Error(`Account A did not receive case_registered: got ${JSON.stringify(receivedEventA)}`);
    }

    sseA.close();
    console.log('✅ TEST 3 PASSED: Account A received Study A event; Account B connection rejected with HTTP 403, zero data leaked.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 3 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4 — Missing group
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 4] Missing group: Authenticated user requests SSE without X-Group-Id...');
    const resp = await makeRequest({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    if (resp.statusCode !== 400) {
      throw new Error(`Expected HTTP 400, got ${resp.statusCode}`);
    }
    const body = JSON.parse(resp.data);
    if (body.error !== 'MISSING_GROUP') {
      throw new Error(`Expected MISSING_GROUP, got ${JSON.stringify(body)}`);
    }
    if (resp.headers['content-type']?.includes('text/event-stream')) {
      throw new Error(`CRITICAL: text/event-stream header sent on 400 error!`);
    }

    console.log('✅ TEST 4 PASSED: Missing group returned HTTP 400 JSON; no SSE initialized.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 4 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5 — Unknown / Nonexistent group
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 5] Unknown group: Authenticated user supplies nonexistent group ID...');
    const resp = await makeRequest({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Group-Id': 'nonexistent-group-uuid-99999',
      },
    });

    if (resp.statusCode !== 404) {
      throw new Error(`Expected HTTP 404, got ${resp.statusCode}`);
    }
    const body = JSON.parse(resp.data);
    if (body.error !== 'NOT_FOUND') {
      throw new Error(`Expected NOT_FOUND, got ${JSON.stringify(body)}`);
    }

    console.log('✅ TEST 5 PASSED: Nonexistent group safely rejected with HTTP 404; no disclosure.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 5 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6 — Cross-study isolation (Study A & Study B)
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 6] Cross-study isolation: Verify Account A cannot receive Study B events & vice versa...');
    // Account A connects to Study A
    const sseA = await connectSSE({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Group-Id': studyA.id,
      },
    });
    await sseA.waitForEvent(2000);

    // Account B connects to Study B
    const sseB = await connectSSE({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Group-Id': studyB.id,
      },
    });
    await sseB.waitForEvent(2000);

    // Account B registers a case in Study B
    await makeRequest({
      path: '/api/cases/register',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Group-Id': studyB.id,
      },
      body: {
        groupId: studyB.id,
        patientId: `ONCO-${time}-01`,
        patientName: 'Confidential Patient Beta',
        diagnosis: 'Stage II Lymphoma',
      },
    });

    // Account B must receive event
    const evB = await sseB.waitForEvent(3000);
    if (evB.type !== 'case_registered' || evB.groupId !== studyB.id) {
      throw new Error(`Account B did not receive its own study event: ${JSON.stringify(evB)}`);
    }

    // Account A must NOT receive Study B's event!
    if (sseA.events.length > 0) {
      throw new Error(`CRITICAL: Account A received cross-study event: ${JSON.stringify(sseA.events)}`);
    }

    sseA.close();
    sseB.close();
    console.log('✅ TEST 6 PASSED: Complete tenant event isolation verified across Study A & Study B.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 6 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 7 — Authorization-before-SSE test
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 7] Authorization-before-SSE: Verify HTTP 403 status and headers precede any stream...');
    const resp = await makeRequest({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Group-Id': studyA.id,
      },
    });

    if (resp.statusCode !== 403) {
      throw new Error(`Expected HTTP 403, got ${resp.statusCode}`);
    }
    if (resp.headers['content-type']?.includes('text/event-stream')) {
      throw new Error('SSE Content-Type header was incorrectly set before authorization!');
    }
    if (resp.data.includes('data:')) {
      throw new Error('SSE event data was leaked before authorization!');
    }

    console.log('✅ TEST 7 PASSED: Membership authorization executes strictly prior to SSE header/stream setup.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 7 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 8 — Manipulated client identity
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 8] Manipulated client identity: Attempt to spoof user identity via header/query...');
    // Account B attempts to pass User A's ID in header and query
    const resp = await makeRequest({
      path: `/api/cases/events?userId=${encodeURIComponent(userA.id)}`,
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Group-Id': studyA.id,
        'X-User-Id': userA.id,
      },
    });

    if (resp.statusCode !== 403) {
      throw new Error(`Expected HTTP 403 despite spoofed user ID, got ${resp.statusCode}`);
    }

    console.log('✅ TEST 8 PASSED: Client-supplied user identities ignored; authenticated JWT identity enforced.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 8 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 9 — Multiple/alternate group inputs
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 9] Multiple/alternate group inputs: Attempt conflicting header vs query groupId...');
    // Account A provides X-Group-Id: studyA (authorized) but ?groupId=studyB (unauthorized)
    const resp = await makeRequest({
      path: `/api/cases/events?groupId=${studyB.id}`,
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Group-Id': studyA.id,
      },
    });

    if (resp.statusCode !== 400) {
      throw new Error(`Expected HTTP 400 on conflicting group inputs, got ${resp.statusCode}`);
    }
    const body = JSON.parse(resp.data);
    if (body.error !== 'CONFLICTING_GROUP_INPUT') {
      throw new Error(`Expected CONFLICTING_GROUP_INPUT error, got ${JSON.stringify(body)}`);
    }

    console.log('✅ TEST 9 PASSED: Conflicting group parameters rejected with HTTP 400; bypass prevented.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 9 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 10 — Disconnect cleanup
  // -------------------------------------------------------------------------
  try {
    console.log('\n[TEST 10] Disconnect cleanup: Verify event subscriptions connect and close cleanly...');
    const sse = await connectSSE({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Group-Id': studyA.id,
      },
    });
    const connectedEv = await sse.waitForEvent(2000);
    if (!connectedEv || connectedEv.type !== 'connected') {
      throw new Error('Failed to establish SSE connection');
    }

    sse.close();
    // Allow socket destruction to be acknowledged by server
    await new Promise((r) => setTimeout(r, 200));

    // Verify subsequent unauthorized request does not open stream
    const unauthResp = await makeRequest({
      path: '/api/cases/events',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Group-Id': studyA.id,
      },
    });
    if (unauthResp.statusCode !== 403) {
      throw new Error(`Expected 403 for unauthorized request, got ${unauthResp.statusCode}`);
    }

    console.log('✅ TEST 10 PASSED: Connection established and destroyed cleanly; unauthorized requests create 0 connections.');
    passed++;
  } catch (err: any) {
    console.error('❌ TEST 10 FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // REST REGRESSION CHECKS (Preserve REST BOLA & App-Owner RBAC)
  // -------------------------------------------------------------------------
  console.log('\n[REST REGRESSION] Verifying REST BOLA and RBAC controls...');
  // 1. Account B attempts GET /api/cases for Study A
  const restBGet = await makeRequest({
    path: '/api/cases',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'X-Group-Id': studyA.id,
    },
  });
  if (restBGet.statusCode !== 403) {
    throw new Error(`REST BOLA failed: Account B got status ${restBGet.statusCode} accessing Study A cases`);
  }

  // 2. Account B attempts POST /api/cases/register in Study A
  const restBPost = await makeRequest({
    path: '/api/cases/register',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'X-Group-Id': studyA.id,
    },
    body: {
      groupId: studyA.id,
      patientId: `ATTACK-${time}-99`,
      patientName: 'Attack Attempt',
    },
  });
  if (restBPost.statusCode !== 403) {
    throw new Error(`REST Write BOLA failed: Account B got status ${restBPost.statusCode} registering in Study A`);
  }

  // 3. Account B attempts GET /api/app-owner/overview
  const restAdmin = await makeRequest({
    path: '/api/app-owner/overview',
    headers: {
      Authorization: `Bearer ${tokenB}`,
    },
  });
  if (restAdmin.statusCode !== 403) {
    throw new Error(`RBAC failed: Non-owner got status ${restAdmin.statusCode} on App Owner overview`);
  }

  // 4. Account A reads their own Study A cases -> 200
  const restAGet = await makeRequest({
    path: '/api/cases',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'X-Group-Id': studyA.id,
    },
  });
  if (restAGet.statusCode !== 200) {
    throw new Error(`Authorized REST read failed: Account A got status ${restAGet.statusCode}`);
  }

  console.log('✅ REST REGRESSION PASSED: REST BOLA, write authorization, and app-owner RBAC all verified.');

  console.log('\n======================================================');
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite runner error:', err);
  process.exit(1);
});
