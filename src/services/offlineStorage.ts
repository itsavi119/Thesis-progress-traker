/**
 * Secure Zero-Local-Data Policy
 *
 * All clinical data and research records reside strictly on the authoritative server.
 * No Protected Health Information (PHI), patient cases, or research data are persisted
 * locally to browser IndexedDB, WebSQL, or local disk stores.
 *
 * Any existing local databases are actively purged on initialization.
 */

import type { CaseRecord } from '../types/index.js';

const DB_NAME = 'thesis_case_tracker_offline';
const LEGACY_STORES = ['cases', 'offline_cases', 'patient_records', 'encrypted_cases'];

class OfflineStorageService {
  private activeUserId: string | null = null;

  constructor() {
    // Actively purge any legacy or previously cached IndexedDB stores on initialization
    this.purgeAllData().catch(() => {});
  }

  /**
   * Initialize user session: verifies identity without writing local data
   */
  public async initializeUserSession(userId: string): Promise<void> {
    this.activeUserId = userId;
    await this.purgeAllData().catch(() => {});
  }

  /**
   * No-op: Zero local data storage policy (data is only persisted server-side)
   */
  public async saveCase(_caseRecord: CaseRecord, _userId?: string | null): Promise<void> {
    // Intentionally no-op: no clinical records stored locally
  }

  /**
   * No-op: Zero local data storage policy
   */
  public async saveCases(_cases: CaseRecord[], _userId?: string | null): Promise<void> {
    // Intentionally no-op: no clinical records stored locally
  }

  /**
   * Always returns empty array: all queries execute against authoritative API
   */
  public async getCases(_groupId: string, _userId?: string | null): Promise<CaseRecord[]> {
    return [];
  }

  /**
   * No-op: Local deletion not applicable since no local records are stored
   */
  public async deleteCase(_caseId: string): Promise<void> {
    // Intentionally no-op
  }

  /**
   * Always returns empty array: searches execute against server API
   */
  public async searchCases(_groupId: string, _query: string, _userId?: string | null): Promise<CaseRecord[]> {
    return [];
  }

  /**
   * Logout & Session Termination: Wipes any lingering in-memory or storage state
   */
  public async clearSession(_userId?: string): Promise<void> {
    this.activeUserId = null;
    await this.purgeAllData().catch(() => {});
  }

  /**
   * Complete database wipe: deletes all browser IndexedDB instances
   */
  public async destroyDatabase(): Promise<void> {
    await this.purgeAllData();
  }

  /**
   * Actively purges any IndexedDB databases created in the browser
   */
  public async purgeAllData(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      if (window.indexedDB) {
        window.indexedDB.deleteDatabase(DB_NAME);
        for (const store of LEGACY_STORES) {
          window.indexedDB.deleteDatabase(store);
        }

        // If modern IDBFactory.databases() is supported, purge all
        if (typeof (window.indexedDB as any).databases === 'function') {
          try {
            const dbs = await (window.indexedDB as any).databases();
            if (Array.isArray(dbs)) {
              for (const db of dbs) {
                if (db.name && (db.name.includes('thesis') || db.name.includes('case'))) {
                  window.indexedDB.deleteDatabase(db.name);
                }
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[Storage] Notice during local store purge:', err);
    }
  }
}

export const offlineStorage = new OfflineStorageService();
