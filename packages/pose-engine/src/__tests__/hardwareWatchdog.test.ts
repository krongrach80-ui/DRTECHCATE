/**
 * packages/pose-engine/src/__tests__/hardwareWatchdog.test.ts
 *
 * Unit tests for Camera Stream Watchdog & Auto-Recovery Engine
 */

import { describe, it, expect, vi } from 'vitest';
import { CameraStreamWatchdog } from '../hardwareWatchdog';
import { PoseEngineLandmark } from '../types/exerciseConfig';

function createDummyLandmarks(x: number = 0.5, y: number = 0.5): PoseEngineLandmark[] {
  const landmarks: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
    x,
    y,
    z: 0.0,
    visibility: 0.95,
    presence: 0.95,
  }));
  landmarks[0] = { x, y: y - 0.2, z: 0, visibility: 0.95, presence: 0.95 }; // Nose
  landmarks[11] = { x: x - 0.1, y, z: 0, visibility: 0.95, presence: 0.95 }; // Left Shoulder
  landmarks[12] = { x: x + 0.1, y, z: 0, visibility: 0.95, presence: 0.95 }; // Right Shoulder
  return landmarks;
}

describe('CameraStreamWatchdog', () => {
  it('1. detects frozen frame when landmark coordinates remain identical for >= maxFrozenFrames', () => {
    const watchdog = new CameraStreamWatchdog({
      maxFrozenFrames: 60,
      minFpsThreshold: 15.0,
    });

    const frozenSkel = createDummyLandmarks(0.5, 0.5);

    // Initial frame
    let status = watchdog.update(frozenSkel, 1000);
    expect(status.isFrozen).toBe(false);
    expect(status.consecutiveFrozenFrames).toBe(0);

    // Feed 60 identical frames at 30 FPS (delta 33ms)
    for (let f = 1; f <= 60; f++) {
      status = watchdog.update(frozenSkel, 1000 + f * 33);
    }
    expect(status.isFrozen).toBe(true);
    expect(status.consecutiveFrozenFrames).toBe(60);
    expect(status.needsReconnect).toBe(true);
    expect(status.statusMessageTh).toContain('⚠️ สัญญาณกล้องไม่เคลื่อนไหว');

    // As soon as patient moves, consecutiveFrozenFrames clears
    const movedSkel = createDummyLandmarks(0.52, 0.51);
    status = watchdog.update(movedSkel, 1000 + 61 * 33);
    expect(status.consecutiveFrozenFrames).toBe(0);
    expect(status.isFrozen).toBe(false);
  });

  it('2. monitors rolling FPS and throttles into lowPerformanceMode when FPS < 15', () => {
    const watchdog = new CameraStreamWatchdog({
      minFpsThreshold: 15.0,
      rollingWindowSize: 10,
    });

    // Simulate 30 FPS (33.3ms interval)
    let t = 1000;
    let status = watchdog.update(createDummyLandmarks(0.5, 0.5), t);
    for (let i = 0; i < 15; i++) {
      t += 33;
      status = watchdog.update(createDummyLandmarks(0.5 + i * 0.001, 0.5), t);
    }
    expect(status.rollingFps).toBeGreaterThanOrEqual(25);
    expect(status.lowPerformanceMode).toBe(false);

    // Simulate sudden lag / CPU throttle down to 10 FPS (100ms interval)
    for (let i = 0; i < 15; i++) {
      t += 100;
      status = watchdog.update(createDummyLandmarks(0.5 + (15 + i) * 0.001, 0.5), t);
    }
    expect(status.rollingFps).toBeLessThan(15);
    expect(status.lowPerformanceMode).toBe(true);
    expect(status.statusMessageTh).toContain('เปิดโหมดประหยัดพลังงาน (FPS ต่ำ)');

    // Simulate recovery back to 30 FPS
    for (let i = 0; i < 20; i++) {
      t += 33;
      status = watchdog.update(createDummyLandmarks(0.5 + (30 + i) * 0.001, 0.5), t);
    }
    expect(status.rollingFps).toBeGreaterThanOrEqual(22);
    expect(status.lowPerformanceMode).toBe(false);
  });

  it('3. executes auto-reconnect with exponential backoff on frozen stream', async () => {
    vi.useFakeTimers();

    const watchdog = new CameraStreamWatchdog({
      maxFrozenFrames: 5,
      maxReconnectAttempts: 3,
      baseReconnectDelayMs: 200,
    });

    // Mock active MediaStream
    const mockActiveStream = {
      active: true,
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    let attemptCount = 0;
    const reconnectFactory = vi.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error('Device unavailable');
      }
      return mockActiveStream;
    });

    // Trigger freeze
    const skel = createDummyLandmarks(0.5, 0.5);
    for (let i = 0; i < 6; i++) {
      watchdog.update(skel, 1000 + i * 33);
    }

    // Attempt 1 fails
    const reconnectPromise1 = watchdog.attemptReconnect(reconnectFactory);
    await vi.advanceTimersByTimeAsync(200); // base delay 200ms
    const res1 = await reconnectPromise1;
    expect(res1.success).toBe(false);
    expect(res1.error).toContain('Device unavailable');

    // Attempt 2 succeeds
    const reconnectPromise2 = watchdog.attemptReconnect(reconnectFactory);
    await vi.advanceTimersByTimeAsync(400); // 200 * 2^1 = 400ms
    const res2 = await reconnectPromise2;
    expect(res2.success).toBe(true);
    expect(res2.stream).toBe(mockActiveStream);

    vi.useRealTimers();
  });

  it('4. halts reconnects and advises USB cable inspection when exceeding maxReconnectAttempts', async () => {
    vi.useFakeTimers();

    const watchdog = new CameraStreamWatchdog({
      maxFrozenFrames: 3,
      maxReconnectAttempts: 2,
      baseReconnectDelayMs: 100,
    });

    const failingFactory = vi.fn().mockRejectedValue(new Error('USB Bus Disconnected'));

    // Attempt 1
    const p1 = watchdog.attemptReconnect(failingFactory);
    await vi.advanceTimersByTimeAsync(100);
    await p1;

    // Attempt 2
    const p2 = watchdog.attemptReconnect(failingFactory);
    await vi.advanceTimersByTimeAsync(200);
    await p2;

    // Attempt 3: exceeds max attempts
    const p3 = watchdog.attemptReconnect(failingFactory);
    const res3 = await p3;
    expect(res3.success).toBe(false);
    expect(res3.error).toContain('Exceeded maximum reconnect attempts');

    // Feed frozen frames to trigger frozen status check
    const frozenSkel = createDummyLandmarks(0.5, 0.5);
    let status = watchdog.update(frozenSkel, 1000);
    for (let i = 1; i <= 3; i++) {
      status = watchdog.update(frozenSkel, 1000 + i * 33);
    }
    expect(status.isFrozen).toBe(true);
    expect(status.statusMessageTh).toContain('⚠️ สัญญาณกล้องค้าง กรุณาตรวจสอบสายเชื่อมต่อ USB');

    vi.useRealTimers();
  });

  it('5. reset clears all watchdog metrics', () => {
    const watchdog = new CameraStreamWatchdog();
    const skel = createDummyLandmarks(0.5, 0.5);
    for (let i = 0; i < 65; i++) {
      watchdog.update(skel, 1000 + i * 33);
    }

    watchdog.reset();
    const freshStatus = watchdog.update(skel, 5000);
    expect(freshStatus.isFrozen).toBe(false);
    expect(freshStatus.consecutiveFrozenFrames).toBe(0);
    expect(freshStatus.isHealthy).toBe(true);
  });
});
