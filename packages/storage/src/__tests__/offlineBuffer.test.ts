/**
 * packages/storage/src/__tests__/offlineBuffer.test.ts
 *
 * Unit tests for OfflineBufferEngine & BackgroundSyncWorker
 */

import { describe, it, expect, vi } from 'vitest';
import { OfflineBufferEngine, BackgroundSyncWorker } from '../offlineBuffer';

describe('OfflineBufferEngine & BackgroundSyncWorker', () => {
  it('1. enqueues telemetry items into offline buffer', async () => {
    const buffer = new OfflineBufferEngine<{ score: number }>();
    const id1 = await buffer.enqueue({ score: 95 });
    const id2 = await buffer.enqueue({ score: 88 });

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(buffer.getQueueSize()).toBe(2);

    const pending = await buffer.getPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].data.score).toBe(95);
  });

  it('2. marks record as synced and clears synced records', async () => {
    const buffer = new OfflineBufferEngine<{ title: string }>();
    const id = await buffer.enqueue({ title: 'Session A' });

    await buffer.markAsSynced(id);
    expect(buffer.getQueueSize()).toBe(0);

    const cleared = await buffer.clearSynced();
    expect(cleared).toBe(1);
    expect(buffer.getQueueSize()).toBe(0);
  });

  it('3. background sync worker flushes pending items via sync handler', async () => {
    const buffer = new OfflineBufferEngine<{ patientId: string }>();
    await buffer.enqueue({ patientId: 'HN001' });
    await buffer.enqueue({ patientId: 'HN002' });

    const syncedHns: string[] = [];
    const syncHandler = vi.fn().mockImplementation(async (record) => {
      syncedHns.push(record.data.patientId);
      return true;
    });

    const worker = new BackgroundSyncWorker(buffer, syncHandler, 60000);
    const syncResult = await worker.triggerSync();

    expect(syncResult.synced).toBe(2);
    expect(syncResult.failed).toBe(0);
    expect(syncHandler).toHaveBeenCalledTimes(2);
    expect(syncedHns).toEqual(['HN001', 'HN002']);
    expect(buffer.getQueueSize()).toBe(0);

    worker.destroy();
  });

  it('4. handles sync failures gracefully and records attempt counters', async () => {
    const buffer = new OfflineBufferEngine<{ task: string }>();
    await buffer.enqueue({ task: 'Network Fault Test' });

    const failingHandler = vi.fn().mockRejectedValue(new Error('Hospital Gateway Timeout (504)'));
    const worker = new BackgroundSyncWorker(buffer, failingHandler, 60000);

    const syncResult = await worker.triggerSync();
    expect(syncResult.synced).toBe(0);
    expect(syncResult.failed).toBe(1);

    const pending = await buffer.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].lastError).toContain('Hospital Gateway Timeout');

    worker.destroy();
  });
});
