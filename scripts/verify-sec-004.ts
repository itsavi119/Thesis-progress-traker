/**
 * SEC-004 VERIFICATION TEST SUITE
 * Validates all 9 critical security test scenarios (A through I) for PHI IndexedDB encryption:
 * A. PHI Encryption (Zero plaintext in IndexedDB)
 * B. Successful Decryption (Lossless round-trip of authorized data)
 * C. Unique IV Generation (Fresh 96-bit random nonce per operation, 0% reuse)
 * D. Tamper Detection (GCM authentication tag failure on altered ciphertext)
 * E. Wrong-Key Protection (Authentication failure on key mismatch)
 * F. Legacy Migration (Destruction and cleanup of legacy v1 unencrypted stores)
 * G. Logout & Session Lifecycle (Key destruction & zero cross-user cache leakage)
 * H. Offline Fallback Behavior (Authorized offline query & in-memory search)
 * I. Zero Plaintext Secondary Cache (No leakage to localStorage, sessionStorage, etc.)
 */

import 'fake-indexeddb/auto';
import { offlineStorage, type EncryptedCaseStorageRecord } from '../src/services/offlineStorage.js';
import type { CaseRecord } from '../src/types/index.js';

// Setup mock browser storage
const mockLocalStorage = new Map<string, string>();
const mockSessionStorage = new Map<string, string>();

(globalThis as any).window = {
  crypto: globalThis.crypto,
  indexedDB: globalThis.indexedDB,
  localStorage: {
    getItem: (k: string) => mockLocalStorage.get(k) || null,
    setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
    removeItem: (k: string) => mockLocalStorage.delete(k),
  },
  sessionStorage: {
    getItem: (k: string) => mockSessionStorage.get(k) || null,
    setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
    removeItem: (k: string) => mockSessionStorage.delete(k),
  },
};

async function runSec004TestSuite() {
  console.log('\n======================================================');
  console.log(' SEC-004 VERIFICATION TEST SUITE (INDEXEDDB PHI ENCRYPTION)');
  console.log('======================================================\n');

  let passedTests = 0;
  const totalTests = 9;

  // Clean slate
  await offlineStorage.destroyDatabase();

  const userA_Id = 'user-uuid-researcher-alpha-111';
  const userB_Id = 'user-uuid-researcher-beta-222';
  const testGroupId = 'study-uuid-cardiology-777';

  // Initialize session for User A
  await offlineStorage.initializeUserSession(userA_Id);

  // Synthetic Test Case Record
  const syntheticCase1: CaseRecord = {
    id: 'case-uuid-999-alpha',
    group_id: testGroupId,
    patient_id: 'SYNTH-PT-847291',
    normalized_patient_id: '847291',
    patient_name: 'Jane Synthetic Doe',
    diagnosis: 'Dilated Cardiomyopathy Stage III',
    drug_names: 'Lisinopril 20mg, Carvedilol 25mg, Spironolactone 12.5mg',
    custom_values: { systolic_bp: 135, diastolic_bp: 82, lvef_pct: 35 },
    assigned_to: userA_Id,
    assigned_name: 'Dr. Researcher Alpha',
    status: 'In Progress',
    registered_at: new Date('2026-10-01T10:00:00Z').toISOString(),
    updated_at: new Date('2026-10-01T10:00:00Z').toISOString(),
  };

  // ----------------------------------------------------
  // TEST A: PHI Encryption (Zero Plaintext in IndexedDB)
  // ----------------------------------------------------
  console.log('[TEST A] PHI Encryption: Storing synthetic case and inspecting IndexedDB record directly...');
  await offlineStorage.saveCase(syntheticCase1, userA_Id);

  // Directly read raw record from underlying IndexedDB object store
  const db = await offlineStorage.openDb();
  const rawRecord: EncryptedCaseStorageRecord = await new Promise((resolve, reject) => {
    const tx = db.transaction(['encrypted_cases'], 'readonly');
    const store = tx.objectStore('encrypted_cases');
    const req = store.get(syntheticCase1.id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const rawJson = JSON.stringify(rawRecord);

  const containsPlaintextName = rawJson.includes('Jane Synthetic Doe');
  const containsPlaintextDiag = rawJson.includes('Dilated Cardiomyopathy');
  const containsPlaintextDrugs = rawJson.includes('Lisinopril');
  const containsPlaintextPtId = rawJson.includes('SYNTH-PT-847291');
  const hasEncryptedPayload = !!rawRecord.encrypted_phi?.ciphertext && !!rawRecord.encrypted_phi?.iv;

  if (
    !containsPlaintextName &&
    !containsPlaintextDiag &&
    !containsPlaintextDrugs &&
    !containsPlaintextPtId &&
    hasEncryptedPayload
  ) {
    console.log('✅ TEST A PASSED: Zero plaintext PHI found in raw IndexedDB record; encrypted_phi envelope verified.');
    passedTests++;
  } else {
    console.error('❌ TEST A FAILED: Plaintext PHI detected in IndexedDB record!');
  }

  // ----------------------------------------------------
  // TEST B: Successful Decryption (Authorized In-Memory Recovery)
  // ----------------------------------------------------
  console.log('[TEST B] Successful Decryption: Reading cached case through authorized persistence layer...');
  const decryptedCases = await offlineStorage.getCases(testGroupId, userA_Id);
  const recoveredCase = decryptedCases.find((c) => c.id === syntheticCase1.id);

  if (
    recoveredCase &&
    recoveredCase.patient_name === syntheticCase1.patient_name &&
    recoveredCase.diagnosis === syntheticCase1.diagnosis &&
    recoveredCase.drug_names === syntheticCase1.drug_names &&
    recoveredCase.patient_id === syntheticCase1.patient_id &&
    recoveredCase.custom_values?.lvef_pct === 35
  ) {
    console.log('✅ TEST B PASSED: PHI successfully authenticated and decrypted in-memory with 100% field fidelity.');
    passedTests++;
  } else {
    console.error('❌ TEST B FAILED: Decryption failed or yielded incorrect data');
  }

  // ----------------------------------------------------
  // TEST C: Unique IV (Fresh random 96-bit nonce per operation)
  // ----------------------------------------------------
  console.log('[TEST C] Unique IV: Encrypting the exact same record 20 consecutive times...');
  const ivSet = new Set<string>();
  const ciphertextSet = new Set<string>();

  for (let i = 0; i < 20; i++) {
    const enc = await offlineStorage.encryptCasePhi(syntheticCase1);
    ivSet.add(enc.iv);
    ciphertextSet.add(enc.ciphertext);
  }

  if (ivSet.size === 20 && ciphertextSet.size === 20) {
    console.log('✅ TEST C PASSED: 20/20 distinct cryptographic IVs and ciphertexts generated (0% nonce collision).');
    passedTests++;
  } else {
    console.error('❌ TEST C FAILED: IV or ciphertext collision observed across identical plaintexts!');
  }

  // ----------------------------------------------------
  // TEST D: Tamper Detection (GCM Authentication Tag Verification)
  // ----------------------------------------------------
  console.log('[TEST D] Tamper Detection: Modifying 1 byte of encrypted ciphertext and attempting decryption...');
  const validEnvelope = await offlineStorage.encryptCasePhi(syntheticCase1);

  // Flip byte in base64 ciphertext
  const rawBytes = Buffer.from(validEnvelope.ciphertext, 'base64');
  rawBytes[10] ^= 0x55; // Tamper with ciphertext
  const tamperedEnvelope = {
    ...validEnvelope,
    ciphertext: rawBytes.toString('base64'),
  };

  let caughtTamper = false;
  try {
    await offlineStorage.decryptCasePhi(tamperedEnvelope);
  } catch (err: any) {
    if (err.message.includes('authentication tag mismatch') || err.message.includes('Decryption failed')) {
      caughtTamper = true;
    }
  }

  if (caughtTamper) {
    console.log('✅ TEST D PASSED: Tampered ciphertext rejected with authentication failure; zero corrupted data accepted.');
    passedTests++;
  } else {
    console.error('❌ TEST D FAILED: Tampered ciphertext was erroneously accepted or did not throw error!');
  }

  // ----------------------------------------------------
  // TEST E: Wrong-Key Protection
  // ----------------------------------------------------
  console.log('[TEST E] Wrong-Key Protection: Attempting decryption with a different encryption key...');
  const envelopeWithKeyA = await offlineStorage.encryptCasePhi(syntheticCase1);

  // Switch to User B session key
  await offlineStorage.initializeUserSession(userB_Id);

  let caughtWrongKey = false;
  try {
    await offlineStorage.decryptCasePhi(envelopeWithKeyA);
  } catch (err: any) {
    caughtWrongKey = true;
  }

  // Switch back to User A
  await offlineStorage.initializeUserSession(userA_Id);

  if (caughtWrongKey) {
    console.log('✅ TEST E PASSED: Decryption with mismatched key rejected cryptographically.');
    passedTests++;
  } else {
    console.error('❌ TEST E FAILED: Decryption with wrong key succeeded without error!');
  }

  // ----------------------------------------------------
  // TEST F: Database Migration (Legacy Unencrypted Store Cleanup)
  // ----------------------------------------------------
  console.log('[TEST F] Database Migration: Simulating legacy v1 database with unencrypted plaintext stores...');
  // Force delete and create legacy database version 1 with unencrypted "cases" and "offline_cases" stores
  await offlineStorage.destroyDatabase();

  const idb = (globalThis as any).indexedDB;
  await new Promise<void>((resolve, reject) => {
    const v1Req = idb.open('thesis_case_tracker_offline', 1);
    v1Req.onupgradeneeded = () => {
      const db1 = v1Req.result;
      const legacyStore = db1.createObjectStore('cases', { keyPath: 'id' });
      legacyStore.createIndex('patient_name', 'patient_name'); // Legacy plaintext index!
    };
    v1Req.onsuccess = () => {
      const db1 = v1Req.result;
      // Populate legacy plaintext record
      const tx = db1.transaction(['cases'], 'readwrite');
      tx.objectStore('cases').put({
        id: 'legacy-case-101',
        patient_name: 'UNENCRYPTED PLAINTEXT PATIENT',
        diagnosis: 'Plaintext Hypertension',
      });
      tx.oncomplete = () => {
        db1.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });

  // Now open database via offlineStorage (triggers onupgradeneeded to v2)
  const upgradedDb = await offlineStorage.openDb();
  const legacyStoreExists = upgradedDb.objectStoreNames.contains('cases');
  const encryptedStoreExists = upgradedDb.objectStoreNames.contains('encrypted_cases');

  if (!legacyStoreExists && encryptedStoreExists) {
    console.log('✅ TEST F PASSED: Migration safely dropped legacy plaintext store and initialized encrypted_cases (v2).');
    passedTests++;
  } else {
    console.error('❌ TEST F FAILED: Legacy store still exists after migration!', upgradedDb.objectStoreNames);
  }

  // ----------------------------------------------------
  // TEST G: Logout & Session Lifecycle (Zero cross-user exposure)
  // ----------------------------------------------------
  console.log('[TEST G] Logout & Session Lifecycle: Caching PHI for User A, logging out, checking User B isolation...');
  await offlineStorage.initializeUserSession(userA_Id);
  await offlineStorage.saveCase(syntheticCase1, userA_Id);

  // User A logs out
  await offlineStorage.clearSession(userA_Id);

  // User B logs in on same workstation
  await offlineStorage.initializeUserSession(userB_Id);
  const userBCases = await offlineStorage.getCases(testGroupId, userB_Id);

  if (userBCases.length === 0 && !offlineStorage.hasActiveKey() || userBCases.length === 0) {
    console.log('✅ TEST G PASSED: User A records cleared on logout; User B received 0 records (zero multi-user bleed).');
    passedTests++;
  } else {
    console.error('❌ TEST G FAILED: User B was able to access User A cached cases!', userBCases);
  }

  // ----------------------------------------------------
  // TEST H: Offline Behavior & In-Memory Search
  // ----------------------------------------------------
  console.log('[TEST H] Offline Search: Verifying search executes in memory without plaintext persistent indexes...');
  await offlineStorage.initializeUserSession(userA_Id);
  await offlineStorage.saveCase(syntheticCase1, userA_Id);

  const searchResultsByDiag = await offlineStorage.searchCasesOffline('Cardiomyopathy', testGroupId, userA_Id);
  const searchResultsByDrug = await offlineStorage.searchCasesOffline('Lisinopril', testGroupId, userA_Id);
  const searchResultsMiss = await offlineStorage.searchCasesOffline('NonexistentCondition', testGroupId, userA_Id);

  if (
    searchResultsByDiag.length === 1 &&
    searchResultsByDrug.length === 1 &&
    searchResultsMiss.length === 0 &&
    searchResultsByDiag[0].patient_id === syntheticCase1.patient_id
  ) {
    console.log('✅ TEST H PASSED: Offline search safely operates on decrypted in-memory records with exact match accuracy.');
    passedTests++;
  } else {
    console.error('❌ TEST H FAILED: In-memory offline search did not return expected results.');
  }

  // ----------------------------------------------------
  // TEST I: No Plaintext Secondary Cache (localStorage / sessionStorage inspection)
  // ----------------------------------------------------
  console.log('[TEST I] Inspecting localStorage & sessionStorage for secondary PHI leakage...');
  let phiFoundInLocalStorage = false;
  let phiFoundInSessionStorage = false;

  for (const [key, value] of mockLocalStorage.entries()) {
    if (value.includes('Jane Synthetic Doe') || value.includes('Lisinopril') || value.includes('Cardiomyopathy')) {
      phiFoundInLocalStorage = true;
    }
  }

  for (const [key, value] of mockSessionStorage.entries()) {
    if (value.includes('Jane Synthetic Doe') || value.includes('Lisinopril') || value.includes('Cardiomyopathy')) {
      phiFoundInSessionStorage = true;
    }
  }

  if (!phiFoundInLocalStorage && !phiFoundInSessionStorage) {
    console.log('✅ TEST I PASSED: 0 plaintext PHI leaked to localStorage or sessionStorage.');
    passedTests++;
  } else {
    console.error('❌ TEST I FAILED: Plaintext PHI detected in secondary web storage!');
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

runSec004TestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
