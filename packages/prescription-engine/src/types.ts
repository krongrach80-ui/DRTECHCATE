/**
 * packages/prescription-engine/src/types.ts
 *
 * ADAPTIVE CLINICAL COPILOT & PROGRESSIVE OVERLOAD TYPES
 */

export interface SessionHistoryRecord {
  sessionId?: string;
  completedReps: number;
  totalRepsTarget: number;
  consistencyScorePercent: number; // Form score (0 - 100)
  painReported: boolean;
  timestamp: string;
}

export type ProgressionRecommendationType =
  | 'rom_increase'
  | 'hold_duration_increase'
  | 'maintain'
  | 'deload_pain';

export interface CurrentExercisePrescription {
  targetMinDeg: number;
  targetMaxDeg: number;
  holdDurationSec: number;
  sets?: number;
  reps?: number;
  maxSafeAngleCapDeg?: number;
}

export interface ProgressionRecommendation {
  isEligibleForProgression: boolean;
  consecutiveSuccessfulSessions: number;
  averageFormScore: number;
  recommendationType: ProgressionRecommendationType;
  suggestedTargetMinDeg?: number;
  suggestedTargetMaxDeg?: number;
  suggestedHoldDurationSec?: number;
  clinicalRationaleTh: string;
  requiresPhysicalTherapistApproval: boolean; // Always true for clinical safety
}
