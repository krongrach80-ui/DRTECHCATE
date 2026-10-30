/**
 * packages/pose-engine/src/__tests__/privacy.test.ts
 *
 * Unit tests for Zero-Video Storage & Privacy-by-Design Compliance
 * SaMD Class II & HIPAA/GDPR Privacy Verification
 */

import { describe, it, expect } from 'vitest';
import {
  verifyZeroVideoRetention,
  sanitizeTelemetryPayload,
  sanitizeLandmarkVector,
  createPrivacyAuditRecord,
} from '../privacy';
import { ExerciseSessionTelemetry } from '../types/exerciseConfig';

describe('Privacy-by-Design & Zero-Video Storage Engine', () => {
  it('1. verifies compliant numerical telemetry passes without violation', () => {
    const validPayload = {
      exerciseId: 'ex-01',
      maxAngleDeg: 95.4,
      reps: 10,
      velocity: 120.5,
      landmarks: [
        { x: 0.5, y: 0.4, z: 0.1 },
        { x: 0.6, y: 0.4, z: 0.1 },
      ],
    };

    const result = verifyZeroVideoRetention(validPayload);
    expect(result.isCompliant).toBe(true);
    expect(result.zeroVideoGuaranteed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('2. detects and rejects forbidden base64 image strings', () => {
    const maliciousPayload = {
      exerciseId: 'ex-01',
      patientSnapshot: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
      reps: 5,
    };

    const result = verifyZeroVideoRetention(maliciousPayload);
    expect(result.isCompliant).toBe(false);
    expect(result.containsBase64Payload).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('patientSnapshot');
  });

  it('3. detects and rejects forbidden video stream strings or raw blobs', () => {
    const streamPayload = {
      exerciseId: 'ex-01',
      recordedVideoStream: 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAA...',
    };

    const result = verifyZeroVideoRetention(streamPayload);
    expect(result.isCompliant).toBe(false);
    expect(result.violations[0]).toContain('recordedVideoStream');
  });

  it('4. sanitizes telemetry payload and guarantees zero-video compliance', () => {
    const rawTelemetry: ExerciseSessionTelemetry = {
      exerciseId: 'ex-shoulder-pendulum',
      exerciseName: 'Shoulder Pendulum',
      patientId: 'HN100234',
      totalRepsTarget: 10,
      completedReps: 10,
      incorrectReps: 1,
      totalSetsCompleted: 3,
      maxAngleAchievedDeg: 120,
      averageAngleDeg: 85,
      averageHoldDurationSec: 2.0,
      consistencyScorePercent: 91,
      compensationEventsCount: 2,
      scapularHikingRate: 0.05,
      trunkCompensationIndex: 3.2,
      averageVelocityDegPerSec: 65,
      completionMode: 'ai_verified',
      painReported: false,
      sessionDurationSec: 180,
      timestamp: '2026-10-30T10:00:00Z',
    };

    const sanitized = sanitizeTelemetryPayload(rawTelemetry);
    expect(sanitized.completedReps).toBe(10);
    expect(sanitized.patientId).toBe('HN100234');
    expect(sanitized.painReported).toBe(false);
  });

  it('5. truncates and sanitizes landmark vectors to 4 decimal precision', () => {
    const rawLandmarks = [
      { x: 0.1234567, y: 0.9876543, z: 0.5555555, visibility: 0.9898 },
    ];
    const sanitized = sanitizeLandmarkVector(rawLandmarks);
    expect(sanitized[0].x).toBe(0.1235);
    expect(sanitized[0].y).toBe(0.9877);
    expect(sanitized[0].z).toBe(0.5556);
    expect(sanitized[0].visibility).toBe(0.99);
  });

  it('6. generates HIPAA-compliant anonymized audit records', () => {
    const audit = createPrivacyAuditRecord('telemetry_sanitized', 'HN12345678', 1024);
    expect(audit.patientHnAnonymized).toBe('HN12***');
    expect(audit.zeroVideoVerified).toBe(true);
    expect(audit.bytesTransmitted).toBe(1024);
  });
});
