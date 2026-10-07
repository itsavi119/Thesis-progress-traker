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

async function runSec008Verification() {
  console.log('\n======================================================');
  console.log(' SEC-008 VERIFICATION TEST SUITE');
  console.log(' (WEAK PASSWORD POLICY & BREACH SCREENING REMEDIATION)');
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

  const timestamp = Date.now();

  // --- A. TOO SHORT PASSWORDS (< 10 characters) ---
  console.log('[TEST A] Testing passwords shorter than configured minimum (10 chars)...');
  const shortSamples = ['123456789', '123456', 'short', 'abc'];
  let allShortRejected = true;
  for (const shortPass of shortSamples) {
    const res = await makeRawRequest({
      path: '/api/auth/register',
      method: 'POST',
      body: {
        email: `short_${Date.now()}_${shortPass}@hospital.org`,
        password: shortPass,
        displayName: 'Short Tester',
      },
    });
    if (
      res.statusCode !== 400 ||
      !(res.json?.message?.includes('at least 10 characters') || res.json?.message?.includes('Password must be at least'))
    ) {
      allShortRejected = false;
      break;
    }
  }
  assert(
    allShortRejected,
    'Sub-minimum passwords (including 123456789, length 9) strictly rejected with HTTP 400 and clear policy message'
  );

  // --- B. EXACT MINIMUM (10 characters, strong) ---
  console.log('[TEST B] Testing exact minimum length (10 chars, strong)...');
  const exactPass = 'k9#mQ2!xL8';
  const resExact = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `exact_${timestamp}@hospital.org`,
      password: exactPass,
      displayName: 'Exact Min User',
    },
  });
  assert(
    resExact.statusCode === 201 && !!resExact.json?.user,
    'Valid password of exactly 10 characters accepted for registration',
    `Status: ${resExact.statusCode}, body: ${resExact.body}`
  );

  // --- C. LONG PASSWORD (Passphrase) ---
  console.log('[TEST C] Testing long passphrase...');
  const longPassphrase = 'clinical-thesis-cardiology-protocol-randomized-trial-2026';
  const resLong = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `longpass_${timestamp}@hospital.org`,
      password: longPassphrase,
      displayName: 'Long Passphrase User',
    },
  });
  assert(
    resLong.statusCode === 201 && !!resLong.json?.user,
    'Substantially longer strong passphrase accepted without requiring symbols or artificial complexity'
  );

  // --- D. VERY LONG PASSWORD (Maximum length boundary) ---
  console.log('[TEST D] Testing maximum password length boundary (128 chars)...');
  const valid128 = 'A'.repeat(64) + 'b9#' + 'C'.repeat(61); // 128 chars
  const res128 = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `boundary128_${timestamp}@hospital.org`,
      password: valid128,
      displayName: 'Max Boundary User',
    },
  });
  assert(
    res128.statusCode === 201 && !!res128.json?.user,
    'Maximum allowed password length (128 chars) accepted without truncation'
  );

  const invalid129 = 'A'.repeat(129);
  const res129 = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `boundary129_${timestamp}@hospital.org`,
      password: invalid129,
      displayName: 'Excessive User',
    },
  });
  assert(
    res129.statusCode === 400 && res129.json?.message?.includes('128'),
    'Excessive length (> 128 chars) explicitly rejected with controlled HTTP 400 without silent truncation'
  );

  // --- E. COMMON & PREDICTABLE PASSWORDS ---
  console.log('[TEST E] Testing common weak passwords observed in assessment (12345678, Password1, etc.)...');
  const commonSamples = ['12345678', 'Password1', '1234567890', 'password123', 'admin123456', 'aaaaaaaaaa'];
  let allCommonRejected = true;
  for (const commonPass of commonSamples) {
    const res = await makeRawRequest({
      path: '/api/auth/register',
      method: 'POST',
      body: {
        email: `common_${Date.now()}_${commonPass.substring(0, 5)}@hospital.org`,
        password: commonPass,
        displayName: 'Common Tester',
      },
    });
    if (res.statusCode !== 400) {
      allCommonRejected = false;
      console.error(`Failed to reject common password: ${commonPass}, got ${res.statusCode}`);
      break;
    }
  }
  assert(
    allCommonRejected,
    'Observed assessment passwords (12345678, Password1) and common/sequential patterns rejected'
  );

  // --- F. BREACHED PASSWORD SCREENING ---
  console.log('[TEST F] Testing breached password response structure...');
  const resBreached = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `breached_${timestamp}@hospital.org`,
      password: 'password12345',
      displayName: 'Breached Tester',
    },
  });
  assert(
    resBreached.statusCode === 400 &&
      resBreached.json?.error === 'WEAK_PASSWORD' &&
      resBreached.json?.message?.includes('compromised'),
    'Compromised/breached credential returns generic WEAK_PASSWORD response without disclosing internals'
  );

  // --- G. NON-STRING INPUTS ---
  console.log('[TEST G] Testing non-string inputs (null, number, object, array, boolean)...');
  const nonStringInputs = [null, 12345678, { malicious: true }, ['array-pass'], true];
  let allNonStringRejected = true;
  for (const badInput of nonStringInputs) {
    const res = await makeRawRequest({
      path: '/api/auth/register',
      method: 'POST',
      body: {
        email: `nonstr_${Date.now()}@hospital.org`,
        password: badInput,
        displayName: 'Non-String Tester',
      },
    });
    if (res.statusCode !== 400) {
      allNonStringRejected = false;
      break;
    }
  }
  assert(
    allNonStringRejected,
    'Non-string password types (null, number, object, array, boolean) safely rejected with HTTP 400'
  );

  // --- H. REGISTRATION ENDPOINT ENFORCEMENT ---
  console.log('[TEST H] Verifying registration blocks weak passwords and accepts strong...');
  const resRegWeak = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `regweak_${timestamp}@hospital.org`,
      password: 'weak',
      displayName: 'Weak Register',
    },
  });
  assert(
    resRegWeak.statusCode === 400,
    'Account registration cannot be completed with a weak password'
  );

  // Register an account for password-change testing
  const validAccountPass = 'SecureResearchPassword2026!';
  const resRegValid = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email: `changetest_${timestamp}@hospital.org`,
      password: validAccountPass,
      displayName: 'Password Change Tester',
    },
  });
  const cookieValid = resRegValid.headers['set-cookie']?.[0]?.split(';')[0];

  // --- I. PASSWORD CHANGE ENDPOINT ENFORCEMENT ---
  console.log('[TEST I] Testing password change endpoint...');
  const resChangeWeak = await makeRawRequest({
    path: '/api/auth/change-password',
    method: 'POST',
    headers: { Cookie: cookieValid || '' },
    body: {
      currentPassword: validAccountPass,
      newPassword: 'short',
      confirmPassword: 'short',
    },
  });
  assert(
    resChangeWeak.statusCode === 400,
    'Password change endpoint rejects new password that is below minimum length'
  );

  const resChangeBreached = await makeRawRequest({
    path: '/api/auth/change-password',
    method: 'POST',
    headers: { Cookie: cookieValid || '' },
    body: {
      currentPassword: validAccountPass,
      newPassword: 'password12345',
      confirmPassword: 'password12345',
    },
  });
  assert(
    resChangeBreached.statusCode === 400 && resChangeBreached.json?.error === 'WEAK_PASSWORD',
    'Password change endpoint rejects compromised password with WEAK_PASSWORD error'
  );

  const updatedPassword = 'NewStrongThesisKey2026!';
  const resChangeSuccess = await makeRawRequest({
    path: '/api/auth/change-password',
    method: 'POST',
    headers: { Cookie: cookieValid || '' },
    body: {
      currentPassword: validAccountPass,
      newPassword: updatedPassword,
      confirmPassword: updatedPassword,
    },
  });
  assert(
    resChangeSuccess.statusCode === 200 && resChangeSuccess.json?.success === true,
    'Password change succeeds when strong new password satisfies the policy'
  );

  // Verify login with new password succeeds and old password fails
  const resOldLogin = await makeRawRequest({
    path: '/api/auth/login',
    method: 'POST',
    body: {
      email: `changetest_${timestamp}@hospital.org`,
      password: validAccountPass,
    },
  });
  const resNewLogin = await makeRawRequest({
    path: '/api/auth/login',
    method: 'POST',
    body: {
      email: `changetest_${timestamp}@hospital.org`,
      password: updatedPassword,
    },
  });
  assert(
    resOldLogin.statusCode === 401 && resNewLogin.statusCode === 200,
    'Updated password authenticates successfully and old password no longer works'
  );

  // --- J. CONFIRM PASSWORD MISMATCH ---
  console.log('[TEST J] Testing password confirmation mismatch...');
  const resMismatch = await makeRawRequest({
    path: '/api/auth/change-password',
    method: 'POST',
    headers: { Cookie: resNewLogin.headers['set-cookie']?.[0]?.split(';')[0] || '' },
    body: {
      currentPassword: updatedPassword,
      newPassword: 'AnotherStrongPass2026!',
      confirmPassword: 'MismatchDifferentPass2026!',
    },
  });
  assert(
    resMismatch.statusCode === 400 && resMismatch.json?.error === 'MISMATCH',
    'Mismatched confirm password rejected with controlled HTTP 400 MISMATCH'
  );

  // --- K. PASSWORD RESET ENDPOINT ---
  console.log('[TEST K] Testing password reset flow...');
  const resResetWeak = await makeRawRequest({
    path: '/api/auth/reset-password',
    method: 'POST',
    body: {
      email: `changetest_${timestamp}@hospital.org`,
      resetToken: 'dummy-token',
      newPassword: '123',
    },
  });
  assert(
    resResetWeak.statusCode === 400,
    'Password reset endpoint rejects sub-minimum new password'
  );

  const resetTargetPass = 'BrandNewResetPassword2026!';
  const resResetSuccess = await makeRawRequest({
    path: '/api/auth/reset-password',
    method: 'POST',
    body: {
      email: `changetest_${timestamp}@hospital.org`,
      resetToken: 'valid-token',
      newPassword: resetTargetPass,
      confirmPassword: resetTargetPass,
    },
  });
  assert(
    resResetSuccess.statusCode === 200 && resResetSuccess.json?.success === true,
    'Password reset succeeds when compliant with centralized policy'
  );

  // --- L. ADMIN PASSWORD SETTING (No privileged bypass) ---
  console.log('[TEST L] Verifying admin password setting enforces policy...');
  // Register an app owner or login as app owner
  const adminEmail = 'avishah.as119@gmail.com';
  // Use organization login dev reset if needed
  await makeRawRequest({ path: '/api/dev/reset-auth-rate-limit', method: 'POST' });
  const adminLogin = await makeRawRequest({
    path: '/api/auth/organization-login',
    method: 'POST',
    body: {
      email: adminEmail,
      uid: 'app-owner-uid',
      displayName: 'System Admin',
    },
  });
  const adminCookie = adminLogin.headers['set-cookie']?.[0]?.split(';')[0];

  const adminSetWeak = await makeRawRequest({
    path: '/api/auth/admin/set-user-password',
    method: 'POST',
    headers: { Cookie: adminCookie || '' },
    body: {
      targetUserId: resRegValid.json?.user?.id,
      newPassword: '12345',
    },
  });
  assert(
    adminSetWeak.statusCode === 400,
    'Administrator password-setting endpoint strictly enforces policy with NO privileged bypass'
  );

  // --- M. NEVER LOGS OR LEAKS PLAINTEXT PASSWORDS ---
  console.log('[TEST M] Verifying no plaintext password or hash in responses...');
  const allResponses = [resExact.body, resLong.body, res128.body, resRegWeak.body, resBreached.body];
  let noLeakage = true;
  for (const resp of allResponses) {
    if (resp.includes(exactPass) || resp.includes('password_hash') || resp.includes('$2a$') || resp.includes('$2b$')) {
      noLeakage = false;
      break;
    }
  }
  assert(
    noLeakage,
    'Zero plaintext passwords, hashes, or bcrypt digests exposed in any API response'
  );

  // --- N. API BYPASS RESISTANCE ---
  console.log('[TEST N] Verifying direct API bypass is rejected server-side...');
  const bypassRes = await makeRawRequest({
    path: '/api/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    rawBody: JSON.stringify({
      email: `api_bypass_${timestamp}@hospital.org`,
      password: 'short',
      displayName: 'Direct API Caller',
    }),
  });
  assert(
    bypassRes.statusCode === 400,
    'Direct backend API call with weak password rejected independently of frontend checks'
  );

  console.log('\n======================================================');
  console.log(` FINAL RESULTS: ${passed}/${total} SCENARIOS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSec008Verification().catch((err) => {
  console.error('Fatal error during SEC-008 verification:', err);
  process.exit(1);
});
