import type { CaseRecord, ResearchGroup, CaseStatus } from '../types/index.js';

export interface PendingSyncItem {
  id: string;
  type: 'CREATE_CASE' | 'UPDATE_CASE' | 'DELETE_CASE' | 'UPDATE_STATUS';
  groupId: string;
  recordId: string;
  payload: any;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export type SyncState = 'synced' | 'offline' | 'syncing' | 'all_synced';

const DB_NAME = 'thesis_tracker_offline_db';
const DB_VERSION = 2;

class OfflineStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private syncListeners: Array<(state: SyncState, pendingCount: number) => void> = [];
  private currentSyncState: SyncState = typeof navigator !== 'undefined' && navigator.onLine ? 'synced' : 'offline';

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateSyncState('syncing');
      });
      window.addEventListener('offline', () => {
        this.updateSyncState('offline');
      });
    }
  }

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is not supported in this environment.'));
          return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('cases')) {
            const caseStore = db.createObjectStore('cases', { keyPath: 'id' });
            caseStore.createIndex('group_id', 'group_id', { unique: false });
            caseStore.createIndex('normalized_patient_id', 'normalized_patient_id', { unique: false });
          }
          if (!db.objectStoreNames.contains('groups')) {
            db.createObjectStore('groups', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('sync_queue')) {
            const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
            queueStore.createIndex('groupId', 'groupId', { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  public subscribe(listener: (state: SyncState, pendingCount: number) => void): () => void {
    this.syncListeners.push(listener);
    this.getPendingCount().then((count) => listener(this.currentSyncState, count));
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  private updateSyncState(state: SyncState): void {
    this.currentSyncState = state;
    this.getPendingCount().then((count) => {
      for (const listener of this.syncListeners) {
        listener(state, count);
      }
    });
  }

  // --- CASES STORAGE ---

  public async cacheCases(groupId: string, cases: CaseRecord[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['cases'], 'readwrite');
      const store = tx.objectStore('cases');

      for (const c of cases) {
        store.put({ ...c, sync_status: 'synced' });
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('Failed to cache cases in IndexedDB:', err);
    }
  }

  public async getCachedCases(groupId: string): Promise<CaseRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['cases'], 'readonly');
      const store = tx.objectStore('cases');
      const index = store.index('group_id');
      const request = index.getAll(groupId);

      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public async putLocalCase(record: CaseRecord): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['cases'], 'readwrite');
      tx.objectStore('cases').put(record);
    } catch (err) {
      console.warn('Failed to save local case:', err);
    }
  }

  public async removeLocalCase(caseId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['cases'], 'readwrite');
      tx.objectStore('cases').delete(caseId);
    } catch (err) {
      console.warn('Failed to remove local case:', err);
    }
  }

  // --- SYNC QUEUE ---

  public async enqueue(
    type: PendingSyncItem['type'],
    groupId: string,
    recordId: string,
    payload: any
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const item: PendingSyncItem = {
        id: crypto.randomUUID(),
        type,
        groupId,
        recordId,
        payload,
        createdAt: new Date().toISOString(),
        attempts: 0,
      };

      const tx = db.transaction(['sync_queue'], 'readwrite');
      tx.objectStore('sync_queue').put(item);

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      this.updateSyncState(navigator.onLine ? 'syncing' : 'offline');
    } catch (err) {
      console.warn('Failed to enqueue sync operation:', err);
    }
  }

  public async getPendingItems(): Promise<PendingSyncItem[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['sync_queue'], 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();

      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public async removePendingItem(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['sync_queue'], 'readwrite');
      tx.objectStore('sync_queue').delete(id);

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('Failed to remove pending sync item:', err);
    }
  }

  public async getPendingCount(): Promise<number> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['sync_queue'], 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.count();

      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }

  // --- AUTOMATIC SYNC FLUSH WITH SERVER ---

  public async flushSyncQueue(apiClient: {
    registerCase: (params: any) => Promise<any>;
    updateCaseDetails: (id: string, details: any, groupId: string) => Promise<any>;
    updateCaseStatus: (id: string, status: CaseStatus, groupId: string) => Promise<any>;
    deleteCase: (id: string, groupId: string) => Promise<any>;
  }): Promise<{ syncedCount: number; errorsCount: number }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateSyncState('offline');
      return { syncedCount: 0, errorsCount: 0 };
    }

    const items = await this.getPendingItems();
    if (items.length === 0) {
      this.updateSyncState('synced');
      return { syncedCount: 0, errorsCount: 0 };
    }

    this.updateSyncState('syncing');
    let syncedCount = 0;
    let errorsCount = 0;

    for (const item of items) {
      try {
        if (item.type === 'CREATE_CASE') {
          await apiClient.registerCase(item.payload);
        } else if (item.type === 'UPDATE_CASE') {
          await apiClient.updateCaseDetails(item.recordId, item.payload, item.groupId);
        } else if (item.type === 'UPDATE_STATUS') {
          await apiClient.updateCaseStatus(item.recordId, item.payload.status, item.groupId);
        } else if (item.type === 'DELETE_CASE') {
          await apiClient.deleteCase(item.recordId, item.groupId);
        }

        await this.removePendingItem(item.id);
        syncedCount++;
      } catch (err: any) {
        console.warn(`Sync item ${item.id} error:`, err);
        // If duplicate or conflict, mark attempt so we don't block forever
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = err.message || 'Sync failed';
        if (item.attempts > 5) {
          await this.removePendingItem(item.id);
        }
        errorsCount++;
      }
    }

    const remaining = await this.getPendingCount();
    if (remaining === 0) {
      this.updateSyncState('all_synced');
      setTimeout(() => this.updateSyncState('synced'), 2500);
    } else {
      this.updateSyncState('offline');
    }

    return { syncedCount, errorsCount };
  }
}

export const offlineStorage = new OfflineStorageService();
