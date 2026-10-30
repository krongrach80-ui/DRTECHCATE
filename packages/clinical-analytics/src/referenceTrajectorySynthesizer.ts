/**
 * packages/clinical-analytics/src/referenceTrajectorySynthesizer.ts
 *
 * LONGITUDINAL RECOVERY SERIES SYNTHESIZER
 *
 * Mathematically generates an 8-week (12-session) benchmark recovery progression
 * for clinical validation, orthopedic surgeon reports, and longitudinal recovery analysis.
 *
 * Disease Target:
 * - ICD-10: M75.1 (Rotator cuff syndrome)
 * - LOINC: 80317-1 (Shoulder motion range)
 */

import {
  HistoricalSessionMetric,
  TrajectoryAnalysisResult,
  analyzeRecoveryTrajectory,
} from './recoveryTrajectory';
import { PatientClinicalProfile } from './clinicalReportGenerator';
import {
  KinematicReplaySnapshot,
  synthesizeClinicalPainReplaySnapshot,
} from '../../kinematic-replay-3d/src/index';

export interface LongitudinalRecoveryProfileResult {
  patientProfile: PatientClinicalProfile;
  sessions: HistoricalSessionMetric[];
  trajectory: TrajectoryAnalysisResult;
  linkedPainSnapshot: KinematicReplaySnapshot;
}

export interface RecoverySynthesisOptions {
  patientId?: string;
  patientName?: string;
  age?: number;
  gender?: 'ชาย' | 'หญิง' | 'อื่นๆ';
  targetJoint?: string;
  targetRomDeg?: number;
}

/**
 * Procedurally generates a standard 12-session longitudinal recovery trajectory
 *
 * Clinical Benchmarks:
 * - Max ROM increases from 62° to 138° (Target: 160°) with linear regression R² > 0.92
 * - Scapular Hiking Rate decreases from 34% (0.34) down to 6% (0.06)
 * - Trunk compensation angle decreases from 14.0° down to 2.0° (28% to 4% index)
 * - Session 4 (Day 11) contains an acute pain event linked to 3D kinematic snapshot
 */
export function synthesizeLongitudinalRecoveryProfile(
  options: RecoverySynthesisOptions = {}
): LongitudinalRecoveryProfileResult {
  const patientId = options.patientId || 'HN-89021';
  const fullName = options.patientName || 'นายวิชาญ ธนพัฒน์พิริยะ';
  const age = options.age || 52;
  const gender = options.gender || 'ชาย';
  const targetJoint = options.targetJoint || 'ข้อต่อหัวไหล่ขวา (Right Shoulder Complex)';
  const targetRomDeg = options.targetRomDeg || 160;

  const patientProfile: PatientClinicalProfile = {
    hn: patientId,
    fullName,
    age,
    gender,
    targetJoint,
    diagnosis: 'Rotator Cuff Syndrome with Subacromial Impingement',
    icd10Code: 'M75.1 (Rotator cuff syndrome)',
    loincCode: '80317-1 (Shoulder motion range)',
    attendingPtName: 'กภ. สุภาพร ชีวเวช (วภ. 10245)',
    attendingPtLicense: 'PT-10245',
  };

  const dayIndices = [0, 4, 7, 11, 14, 18, 21, 25, 28, 32, 35, 39];
  const maxRomValues = [62, 69, 76, 82, 88, 96, 103, 110, 117, 124, 131, 138];
  const scapularHiking = [0.34, 0.31, 0.28, 0.25, 0.22, 0.18, 0.15, 0.12, 0.10, 0.08, 0.07, 0.06];
  const trunkTilts = [14.0, 12.5, 11.0, 10.0, 8.5, 7.0, 5.5, 4.5, 3.5, 2.8, 2.3, 2.0];
  const formScores = [65, 68, 72, 75, 79, 83, 86, 89, 91, 93, 95, 96];
  const velocityVariances = [6.8, 6.2, 5.6, 5.1, 4.4, 3.8, 3.2, 2.7, 2.2, 1.8, 1.6, 1.4];

  // Base starting date: September 18, 2026
  const baseTimestampMs = 1790000000000; // Deterministic timestamp to preserve purity

  const sessions: HistoricalSessionMetric[] = dayIndices.map((dayIdx, idx) => {
    const sessionDate = new Date(baseTimestampMs + dayIdx * 86400000).toISOString();
    const isPainSession = idx === 3; // Session 4 (Day 11)

    return {
      sessionId: `sess-rec-d${dayIdx}`,
      dateIso: sessionDate,
      dayIndex: dayIdx,
      maxRomDeg: maxRomValues[idx],
      targetRomDeg,
      formQualityScore: formScores[idx],
      angularVelocityVariance: velocityVariances[idx],
      scapularHikingRate: scapularHiking[idx],
      trunkTiltDeg: trunkTilts[idx],
      painReported: isPainSession,
    };
  });

  const trajectory = analyzeRecoveryTrajectory(sessions);

  const linkedPainSnapshot = synthesizeClinicalPainReplaySnapshot({
    patientId,
    sessionId: 'sess-rec-d11',
    exerciseName: 'Shoulder Abduction (กางข้อไหล่)',
  });

  return {
    patientProfile,
    sessions,
    trajectory,
    linkedPainSnapshot,
  };
}
