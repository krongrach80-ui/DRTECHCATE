/**
 * packages/kinematic-replay-3d/src/__tests__/biomechanicalAnomalyFinder.test.ts
 *
 * Unit tests for Biomechanical Anomaly & Micro-Jerk Detector
 */

import { describe, it, expect } from 'vitest';
import { detectBiomechanicalAnomalies } from '../biomechanicalAnomalyFinder';
import { KinematicFrame, KinematicReplaySnapshot } from '../ringBuffer';

function createDummySkeleton(
  shoulderX: number = 0.5,
  wristX: number = 0.5
) {
  const skel = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.95,
  }));
  skel[11] = { x: shoulderX - 0.1, y: 0.3, z: 0, visibility: 0.95 }; // Left shoulder
  skel[12] = { x: shoulderX + 0.1, y: 0.3, z: 0, visibility: 0.95 }; // Right shoulder
  skel[15] = { x: wristX - 0.2, y: 0.6, z: 0, visibility: 0.95 }; // Left wrist
  skel[16] = { x: wristX + 0.2, y: 0.6, z: 0, visibility: 0.95 }; // Right wrist
  return skel;
}

describe('Biomechanical Anomaly & Micro-Jerk Detector', () => {
  it('1. returns no anomaly for smooth continuous kinematic movement', () => {
    const frames: KinematicFrame[] = [];
    // 30 frames of smooth harmonic movement at 30 FPS
    for (let i = 0; i < 30; i++) {
      frames.push({
        timestampMs: 1000 + i * 33,
        landmarks: createDummySkeleton(0.5, 0.5),
        currentAngleDeg: 30 + Math.sin(i * 0.1) * 10,
        angularVelocityDegPerSec: 25,
        trunkLateralTiltDeg: 2,
        isPainEvent: false,
      });
    }

    const snapshot: KinematicReplaySnapshot = {
      sessionId: 'sess-normal',
      patientId: 'patient-1',
      exerciseName: 'Shoulder Flexion',
      capturedAt: new Date().toISOString(),
      totalFrames: frames.length,
      fps: 30,
      frames,
      hasPainEvent: false,
    };

    const result = detectBiomechanicalAnomalies(snapshot);
    expect(result.hasAnomaly).toBe(false);
    expect(result.anomalyFrameIndices.length).toBe(0);
    expect(result.descriptionTh).toContain('ไม่พบจังหวะกระตุกหรือแรงกระชากที่ผิดปกติ');
  });

  it('2. detects sudden jerk spike and tags anomaly timeline frames', () => {
    const frames: KinematicFrame[] = [];
    for (let i = 0; i < 30; i++) {
      // Normal progression
      let angle = 40 + i * 2;
      let vel = 30;
      let wristX = 0.5;

      // Frame 15: Violent jerk / twitch spike!
      if (i === 15) {
        angle = 120; // 40° sudden jump
        vel = 240; // > 180°/s
        wristX = 0.9;
      }

      frames.push({
        timestampMs: 1000 + i * 33,
        landmarks: createDummySkeleton(0.5, wristX),
        currentAngleDeg: angle,
        angularVelocityDegPerSec: vel,
        trunkLateralTiltDeg: 4,
        isPainEvent: false,
      });
    }

    const snapshot: KinematicReplaySnapshot = {
      sessionId: 'sess-jerk',
      patientId: 'patient-2',
      exerciseName: 'Shoulder Abduction',
      capturedAt: new Date().toISOString(),
      totalFrames: frames.length,
      fps: 30,
      frames,
      hasPainEvent: false,
    };

    const result = detectBiomechanicalAnomalies(snapshot, { minJerkThresholdDegPerSec3: 400 });
    expect(result.hasAnomaly).toBe(true);
    expect(result.peakJerkValueDegPerSec3).toBeGreaterThan(400);
    expect(result.peakVelocityDegPerSec).toBeGreaterThanOrEqual(240);
    expect(result.anomalyFrameIndices).toContain(15);
    expect(result.descriptionTh).toContain('ตรวจพบแรงกระชากเชิงมุม (Jerk Spike)');
  });

  it('3. isolates culprit joint and provides clinical recommendation', () => {
    const frames: KinematicFrame[] = [];
    for (let i = 0; i < 20; i++) {
      const isPain = i === 10;
      frames.push({
        timestampMs: 1000 + i * 33,
        landmarks: createDummySkeleton(0.5, isPain ? 0.95 : 0.5),
        currentAngleDeg: isPain ? 110 : 50,
        angularVelocityDegPerSec: isPain ? 210 : 30,
        trunkLateralTiltDeg: isPain ? 18 : 2, // Large trunk compensation
        isPainEvent: isPain,
      });
    }

    const snapshot: KinematicReplaySnapshot = {
      sessionId: 'sess-pain',
      patientId: 'patient-3',
      exerciseName: 'Shoulder Pendulum',
      capturedAt: new Date().toISOString(),
      totalFrames: frames.length,
      fps: 30,
      frames,
      hasPainEvent: true,
    };

    const result = detectBiomechanicalAnomalies(snapshot);
    expect(result.hasAnomaly).toBe(true);
    expect(result.anomalyTimestamps).toContain(1000 + 10 * 33);
    expect(result.recommendationTh).toContain('แนะนำให้นักกายภาพบำบัด');
  });
});
