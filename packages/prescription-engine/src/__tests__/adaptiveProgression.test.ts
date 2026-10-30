/**
 * packages/prescription-engine/src/__tests__/adaptiveProgression.test.ts
 *
 * Unit tests for Dynamic Progressive Overload & Clinical Copilot Safeguards
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateAdaptiveProgression,
  SessionHistoryRecord,
  CurrentExercisePrescription,
} from '../index';

describe('Adaptive AI Prescription Engine (Clinical Copilot)', () => {
  const basePrescription: CurrentExercisePrescription = {
    targetMinDeg: 80,
    targetMaxDeg: 100,
    holdDurationSec: 2.0,
    sets: 3,
    reps: 10,
    maxSafeAngleCapDeg: 140,
  };

  it('1. recommends ROM +5° when patient completes 3 consecutive sessions pain-free with form score >= 90%', () => {
    const history: SessionHistoryRecord[] = [
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 92,
        painReported: false,
        timestamp: '2026-10-25T10:00:00Z',
      },
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 95,
        painReported: false,
        timestamp: '2026-10-27T10:00:00Z',
      },
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 96,
        painReported: false,
        timestamp: '2026-10-29T10:00:00Z',
      },
    ];

    const recommendation = evaluateAdaptiveProgression(history, basePrescription);

    expect(recommendation.isEligibleForProgression).toBe(true);
    expect(recommendation.recommendationType).toBe('rom_increase');
    expect(recommendation.suggestedTargetMaxDeg).toBe(105); // 100° + 5°
    expect(recommendation.suggestedHoldDurationSec).toBe(2.0);
    expect(recommendation.consecutiveSuccessfulSessions).toBe(3);
    expect(recommendation.requiresPhysicalTherapistApproval).toBe(true);
    expect(recommendation.clinicalRationaleTh).toContain('เพิ่มมุม Range of Motion +5°');
  });

  it('2. recommends Hold Duration +2s when ROM reaches anatomical safety ceiling', () => {
    const atCeilingPrescription: CurrentExercisePrescription = {
      targetMinDeg: 120,
      targetMaxDeg: 140, // Already at maxSafeAngleCapDeg (140°)
      holdDurationSec: 3.0,
      maxSafeAngleCapDeg: 140,
    };

    const history: SessionHistoryRecord[] = [
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 94,
        painReported: false,
        timestamp: '2026-10-25T10:00:00Z',
      },
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 91,
        painReported: false,
        timestamp: '2026-10-27T10:00:00Z',
      },
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 97,
        painReported: false,
        timestamp: '2026-10-29T10:00:00Z',
      },
    ];

    const recommendation = evaluateAdaptiveProgression(history, atCeilingPrescription);

    expect(recommendation.isEligibleForProgression).toBe(true);
    expect(recommendation.recommendationType).toBe('hold_duration_increase');
    expect(recommendation.suggestedTargetMaxDeg).toBe(140);
    expect(recommendation.suggestedHoldDurationSec).toBe(5.0); // 3.0s + 2.0s
    expect(recommendation.requiresPhysicalTherapistApproval).toBe(true);
    expect(recommendation.clinicalRationaleTh).toContain('เพิ่มรอบการค้างท่า (Hold Duration) +2 วินาที');
  });

  it('3. rejects progression and flags deload when patient reports pain', () => {
    const historyWithPain: SessionHistoryRecord[] = [
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 95,
        painReported: false,
        timestamp: '2026-10-25T10:00:00Z',
      },
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 94,
        painReported: false,
        timestamp: '2026-10-27T10:00:00Z',
      },
      {
        completedReps: 4,
        totalRepsTarget: 10,
        consistencyScorePercent: 70,
        painReported: true, // Pain stop
        timestamp: '2026-10-29T10:00:00Z',
      },
    ];

    const recommendation = evaluateAdaptiveProgression(historyWithPain, basePrescription);

    expect(recommendation.isEligibleForProgression).toBe(false);
    expect(recommendation.recommendationType).toBe('deload_pain');
    expect(recommendation.clinicalRationaleTh).toContain('ผู้ป่วยมีรายงานอาการเจ็บปวด');
    expect(recommendation.requiresPhysicalTherapistApproval).toBe(true);
  });

  it('4. maintains prescription when form score is below 90%', () => {
    const lowScoreHistory: SessionHistoryRecord[] = [
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 92,
        painReported: false,
        timestamp: '2026-10-25T10:00:00Z',
      },
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 84, // < 90%
        painReported: false,
        timestamp: '2026-10-27T10:00:00Z',
      },
      {
        completedReps: 10,
        totalRepsTarget: 10,
        consistencyScorePercent: 95,
        painReported: false,
        timestamp: '2026-10-29T10:00:00Z',
      },
    ];

    const recommendation = evaluateAdaptiveProgression(lowScoreHistory, basePrescription);

    expect(recommendation.isEligibleForProgression).toBe(false);
    expect(recommendation.recommendationType).toBe('maintain');
  });
});
