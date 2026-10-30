/**
 * packages/storage/src/offlineBuffer.ts
 *
 * OFFLINE-FIRST RESILIENCE & TELEMETRY SYNCHRONIZATION ENGINE
 * SaMD Class II & Offline Continuity Standards:
 * - Local IndexedDB persistence for kinematic exercise sessions
 * - Automatic background synchronization when network re-establishes
 * - In-memory / localStorage fallback when running in server or test contexts
 */

export interface QueuedTelemetryRecord<T = unknown> {
  id: string;
  data: T;
  enqueuedAt: string;
  attempts: number;
  synced: boolean;
  syncedAt?: string;
  lastError?: string;
}

export type TelemetrySyncHandler<T> = (record: QueuedTelemetryRecord<T>) => Promise<boolean>;

const DB_NAME = 'drtech_clinical_storage_v2';
const STORE_NAME = 'telemetry_queue';
const DB_VERSION = 1;

export class OfflineBufferEngine<T = unknown> {
  private inMemoryQueue: Map<string, QueuedTelemetryRecord<T>> = new Map();
  private isIndexedDBAvailable: boolean;
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  constructor() {
    this.isIndexedDBAvailable =
      typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
    if (this.isIndexedDBAvailable) {
      this.dbPromise = this.initDB();
    }
  }

  private initDB(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('synced', 'synced', { unique: false });
            store.createIndex('enqueuedAt', 'enqueuedAt', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Enqueues telemetry data for offline persistence
   */
  public async enqueue(data: T): Promise<string> {
    const id = `telemetry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const record: QueuedTelemetryRecord<T> = {
      id,
      data,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      synced: false,
    };

    // Store in memory queue
    this.inMemoryQueue.set(id, record);

    // Persist to IndexedDB if available
    if (this.isIndexedDBAvailable && this.dbPromise) {
      try {
        const db = await this.dbPromise;
        if (db) {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        }
      } catch {
        // Fallback to localStorage
        this.saveToLocalStorageFallback();
      }
    } else {
      this.saveToLocalStorageFallback();
    }

    return id;
  }

  /**
   * Retrieves all pending unsynced records
   */
  public async getPending(): Promise<QueuedTelemetryRecord<T>[]> {
    if (this.isIndexedDBAvailable && this.dbPromise) {
      try {
        const db = await this.dbPromise;
        if (db) {
          return await new Promise<QueuedTelemetryRecord<T>[]>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
              const all = (req.result as QueuedTelemetryRecord<T>[]) || [];
              const pending = all.filter((r) => !r.synced);
              resolve(pending);
            };
            req.onerror = () => resolve(this.getPendingFromMemory());
          });
        }
      } catch {
        return this.getPendingFromMemory();
      }
    }

    return this.getPendingFromMemory();
  }

  private getPendingFromMemory(): QueuedTelemetryRecord<T>[] {
    this.loadFromLocalStorageFallback();
    return Array.from(this.inMemoryQueue.values()).filter((r) => !r.synced);
  }

  /**
   * Marks a record as successfully synced to the remote server
   */
  public async markAsSynced(id: string): Promise<void> {
    const memRecord = this.inMemoryQueue.get(id);
    if (memRecord) {
      memRecord.synced = true;
      memRecord.syncedAt = new Date().toISOString();
    }

    if (this.isIndexedDBAvailable && this.dbPromise) {
      try {
        const db = await this.dbPromise;
        if (db) {
          await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => {
              const item = req.result as QueuedTelemetryRecord<T>;
              if (item) {
                item.synced = true;
                item.syncedAt = new Date().toISOString();
                store.put(item);
              }
              resolve();
            };
            req.onerror = () => resolve();
          });
        }
      } catch {
        this.saveToLocalStorageFallback();
      }
    } else {
      this.saveToLocalStorageFallback();
    }
  }

  /**
   * Clears all synced records from storage to reclaim space
   */
  public async clearSynced(): Promise<number> {
    let clearedCount = 0;
    for (const [id, record] of this.inMemoryQueue.entries()) {
      if (record.synced) {
        this.inMemoryQueue.delete(id);
        clearedCount++;
      }
    }

    if (this.isIndexedDBAvailable && this.dbPromise) {
      try {
        const db = await this.dbPromise;
        if (db) {
          await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
              const all = req.result as QueuedTelemetryRecord<T>[];
              all.forEach((item) => {
                if (item.synced) store.delete(item.id);
              });
              resolve();
            };
            req.onerror = () => resolve();
          });
        }
      } catch {
        // safe
      }
    }

    this.saveToLocalStorageFallback();
    return clearedCount;
  }

  public getQueueSize(): number {
    return Array.from(this.inMemoryQueue.values()).filter((r) => !r.synced).length;
  }

  private saveToLocalStorageFallback(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const records = Array.from(this.inMemoryQueue.values());
      localStorage.setItem('drtech_offline_telemetry_backup', JSON.stringify(records));
    } catch {
      // storage quota
    }
  }

  private loadFromLocalStorageFallback(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('drtech_offline_telemetry_backup');
      if (raw) {
        const records: QueuedTelemetryRecord<T>[] = JSON.parse(raw);
        records.forEach((r) => this.inMemoryQueue.set(r.id, r));
      }
    } catch {
      // parse safe
    }
  }
}

/**
 * Background Sync Worker
 * Automatically syncs queued records upon network reconnection
 */
export class BackgroundSyncWorker<T = unknown> {
  private buffer: OfflineBufferEngine<T>;
  private syncHandler: TelemetrySyncHandler<T>;
  private isSyncing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    buffer: OfflineBufferEngine<T>,
    syncHandler: TelemetrySyncHandler<T>,
    syncIntervalMs = 30000
  ) {
    this.buffer = buffer;
    this.syncHandler = syncHandler;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.triggerSync();
      });
      this.intervalId = setInterval(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          this.triggerSync();
        }
      }, syncIntervalMs);
    }
  }

  public async triggerSync(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0 };
    this.isSyncing = true;

    let synced = 0;
    let failed = 0;

    try {
      const pending = await this.buffer.getPending();
      for (const record of pending) {
        try {
          const success = await this.syncHandler(record);
          if (success) {
            await this.buffer.markAsSynced(record.id);
            synced++;
          } else {
            record.attempts++;
            failed++;
          }
        } catch (err: unknown) {
          record.attempts++;
          record.lastError = err instanceof Error ? err.message : String(err);
          failed++;
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return { synced, failed };
  }

  public destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}
