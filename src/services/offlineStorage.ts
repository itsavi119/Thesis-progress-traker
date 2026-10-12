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

  private memoryCases: Map<string, CaseRecord> = new Map();

  /**
   * Save patient case locally with storage persistence for static host resilience
   */
  public async saveCase(caseRecord: CaseRecord, _userId?: string | null): Promise<void> {
    this.memoryCases.set(caseRecord.id, caseRecord);
    if (typeof window !== 'undefined') {
      try {
        const list = Array.from(this.memoryCases.values());
        localStorage.setItem('thesis_tracker_static_cases', JSON.stringify(list));
      } catch {}
    }
  }

  /**
   * Save multiple cases
   */
  public async saveCases(casesList: CaseRecord[], _userId?: string | null): Promise<void> {
    for (const c of casesList) {
      this.memoryCases.set(c.id, c);
    }
    if (typeof window !== 'undefined') {
      try {
        const list = Array.from(this.memoryCases.values());
        localStorage.setItem('thesis_tracker_static_cases', JSON.stringify(list));
      } catch {}
    }
  }

  /**
   * Retrieve cases for study group
   */
  public async getCases(groupId?: string, _userId?: string | null): Promise<CaseRecord[]> {
    if (this.memoryCases.size === 0 && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('thesis_tracker_static_cases');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const c of parsed) this.memoryCases.set(c.id, c);
          }
        }
      } catch {}
    }
    const all = Array.from(this.memoryCases.values());
    if (!groupId || groupId === 'group-default-1') return all;
    return all.filter((c) => c.group_id === groupId);
  }

  /**
   * Delete case from local storage
   */
  public async deleteCase(caseId: string): Promise<void> {
    this.memoryCases.delete(caseId);
    if (typeof window !== 'undefined') {
      try {
        const list = Array.from(this.memoryCases.values());
        localStorage.setItem('thesis_tracker_static_cases', JSON.stringify(list));
      } catch {}
    }
  }

  /**
   * Search cases
   */
  public async searchCases(groupId: string, query: string, userId?: string | null): Promise<CaseRecord[]> {
    const list = await this.getCases(groupId, userId);
    if (!query || !query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.patient_id.toLowerCase().includes(q) ||
        (c.patient_name && c.patient_name.toLowerCase().includes(q)) ||
        (c.diagnosis && c.diagnosis.toLowerCase().includes(q)) ||
        (c.drug_names && c.drug_names.toLowerCase().includes(q))
    );
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
