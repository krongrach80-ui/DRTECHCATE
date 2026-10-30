/**
 * packages/kinematic-replay-3d/src/__tests__/ringBuffer.test.ts
 *
 * Unit tests for Lock-Free Kinematic Ring Buffer
 */

import { describe, it, expect } from 'vitest';
import { KinematicRingBuffer, KinematicFrame } from '../ringBuffer';

function createDummyFrame(idx: number, isPain: boolean = false): KinematicFrame {
  return {
    timestampMs: 1000 + idx * 33,
    landmarks: Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.95,
    })),
    currentAngleDeg: 45 + (idx % 20),
    angularVelocityDegPerSec: 30,
    isPainEvent: isPain,
  };
}

describe('KinematicRingBuffer', () => {
  it('1. initializes with default capacity and starts empty', () => {
    const buffer = new KinematicRingBuffer(300);
    expect(buffer.size()).toBe(0);
    expect(buffer.getCapacity()).toBe(300);
    expect(buffer.getLatestFrame()).toBeNull();
  });

  it('2. pushes frames up to capacity in O(1) and maintains chronological ordering', () => {
    const buffer = new KinematicRingBuffer(5);
    for (let i = 0; i < 5; i++) {
      buffer.push(createDummyFrame(i));
    }
    expect(buffer.size()).toBe(5);

    const snapshot = buffer.captureSnapshot();
    expect(snapshot.totalFrames).toBe(5);
    expect(snapshot.frames[0].timestampMs).toBe(1000);
    expect(snapshot.frames[4].timestampMs).toBe(1000 + 4 * 33);
  });

  it('3. wraps around circularly when exceeding capacity without memory leaks', () => {
    const buffer = new KinematicRingBuffer(5);
    // Push 8 frames into capacity 5
    for (let i = 0; i < 8; i++) {
      buffer.push(createDummyFrame(i));
    }

    expect(buffer.size()).toBe(5);
    const snapshot = buffer.captureSnapshot();
    expect(snapshot.totalFrames).toBe(5);
    // Oldest 3 frames (0, 1, 2) were overwritten; oldest remaining should be frame 3
    expect(snapshot.frames[0].timestampMs).toBe(1000 + 3 * 33);
    // Newest should be frame 7
    expect(snapshot.frames[4].timestampMs).toBe(1000 + 7 * 33);
    expect(buffer.getLatestFrame()?.timestampMs).toBe(1000 + 7 * 33);
  });

  it('4. detects pain event flag accurately in snapshot metadata', () => {
    const buffer = new KinematicRingBuffer(10);
    buffer.push(createDummyFrame(0, false));
    buffer.push(createDummyFrame(1, true)); // Pain triggered here!
    buffer.push(createDummyFrame(2, false));

    const snapshot = buffer.captureSnapshot({
      patientId: 'HN-12345',
      exerciseName: 'Shoulder Pendulum',
    });

    expect(snapshot.hasPainEvent).toBe(true);
    expect(snapshot.patientId).toBe('HN-12345');
    expect(snapshot.exerciseName).toBe('Shoulder Pendulum');
  });

  it('5. clears buffer cleanly', () => {
    const buffer = new KinematicRingBuffer(10);
    buffer.push(createDummyFrame(1));
    buffer.push(createDummyFrame(2));
    buffer.clear();

    expect(buffer.size()).toBe(0);
    expect(buffer.getLatestFrame()).toBeNull();
    const snapshot = buffer.captureSnapshot();
    expect(snapshot.totalFrames).toBe(0);
  });
});
