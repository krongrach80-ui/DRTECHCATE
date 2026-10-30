/**
 * packages/prescription-engine/src/adaptiveProgression.ts
 *
 * CLINICAL COPILOT & ADAPTIVE PROGRESSION ENGINE
 * SaMD Class II & Evidence-Based Physical Therapy Guidelines:
 *
 * 1. Dynamic Progressive Overload Logic:
 *    - Analyzes patient performance history over consecutive sessions.
 *    - Criteria for progression:
 *      * 3 consecutive sessions completed without reported pain (Pain-Free).
 *      * Form score (consistency) >= 90% in each session.
 *      * Completed reps >= prescribed target reps.
 *    - Recommendation outcome:
 *      * If safe anatomical ceiling permits: Target Range of Motion (ROM) +5°.
 *      * If ceiling is reached: Isometric Hold Duration +2.0 seconds.
 *
 * 2. Clinical Override Safeguard:
 *    - Every AI progression proposal requires explicit Physical Therapist review & approval
 *      via PatientPrescriptionOverrideModal before being applied to the patient's Kiosk.
 */

import {
  SessionHistoryRecord,
  CurrentExercisePrescription,
  ProgressionRecommendation,
} from './types';

export function evaluateAdaptiveProgression(
  history: SessionHistoryRecord[],
  currentPrescription: CurrentExercisePrescription
): ProgressionRecommendation {
  const maxSafeCap = currentPrescription.maxSafeAngleCapDeg ?? 170;

  if (!history || history.length === 0) {
    return {
      isEligibleForProgression: false,
      consecutiveSuccessfulSessions: 0,
      averageFormScore: 0,
      recommendationType: 'maintain',
      suggestedTargetMinDeg: currentPrescription.targetMinDeg,
      suggestedTargetMaxDeg: currentPrescription.targetMaxDeg,
      suggestedHoldDurationSec: currentPrescription.holdDurationSec,
      clinicalRationaleTh: 'ยังไม่มีประวัติการฝึกเพียงพอสำหรับการประเมินการปรับระดับอัตโนมัติ',
      requiresPhysicalTherapistApproval: true,
    };
  }

  // Sort chronological (most recent at end)
  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const latestSession = sortedHistory[sortedHistory.length - 1];

  // Safeguard: Check if latest session had pain reported
  if (latestSession.painReported) {
    return {
      isEligibleForProgression: false,
      consecutiveSuccessfulSessions: 0,
      averageFormScore: latestSession.consistencyScorePercent,
      recommendationType: 'deload_pain',
      suggestedTargetMinDeg: currentPrescription.targetMinDeg,
      suggestedTargetMaxDeg: currentPrescription.targetMaxDeg,
      suggestedHoldDurationSec: currentPrescription.holdDurationSec,
      clinicalRationaleTh:
        '⚠️ ผู้ป่วยมีรายงานอาการเจ็บปวดในเซสชันล่าสุด แนะนำรักษาระดับหรือพิจารณาปรึกษานักกายภาพบำบัดเพื่อปรับลดระดับความยาก',
      requiresPhysicalTherapistApproval: true,
    };
  }

  // Need at least 3 sessions to evaluate progressive overload
  if (sortedHistory.length < 3) {
    const recent = sortedHistory[sortedHistory.length - 1];
    return {
      isEligibleForProgression: false,
      consecutiveSuccessfulSessions: sortedHistory.length,
      averageFormScore: recent.consistencyScorePercent,
      recommendationType: 'maintain',
      suggestedTargetMinDeg: currentPrescription.targetMinDeg,
      suggestedTargetMaxDeg: currentPrescription.targetMaxDeg,
      suggestedHoldDurationSec: currentPrescription.holdDurationSec,
      clinicalRationaleTh: `ผู้ป่วยฝึกสำเร็จแล้ว ${sortedHistory.length}/3 เซสชัน (ต้องการผลสำเร็จติดต่อกันอย่างน้อย 3 เซสชันเพื่อปลดล็อกคำแนะนำการปรับระดับ)`,
      requiresPhysicalTherapistApproval: true,
    };
  }

  // Take the last 3 consecutive sessions
  const last3 = sortedHistory.slice(-3);

  let consecutiveSuccess = 0;
  let totalScoreSum = 0;

  for (const session of last3) {
    const isPainFree = !session.painReported;
    const isFormPassing = session.consistencyScorePercent >= 90;
    const isRepsComplete = session.completedReps >= session.totalRepsTarget;

    if (isPainFree && isFormPassing && isRepsComplete) {
      consecutiveSuccess++;
      totalScoreSum += session.consistencyScorePercent;
    } else {
      // Streak broken
      break;
    }
  }

  const avgFormScore = consecutiveSuccess > 0 ? Math.round(totalScoreSum / consecutiveSuccess) : 0;

  // Criteria met: 3 consecutive pain-free sessions with form score >= 90%
  if (consecutiveSuccess === 3) {
    const canIncreaseRom = currentPrescription.targetMaxDeg + 5 <= maxSafeCap;

    if (canIncreaseRom) {
      const newTargetMax = currentPrescription.targetMaxDeg + 5;
      return {
        isEligibleForProgression: true,
        consecutiveSuccessfulSessions: 3,
        averageFormScore: avgFormScore,
        recommendationType: 'rom_increase',
        suggestedTargetMinDeg: currentPrescription.targetMinDeg,
        suggestedTargetMaxDeg: newTargetMax,
        suggestedHoldDurationSec: currentPrescription.holdDurationSec,
        clinicalRationaleTh: `🌟 ผู้ป่วยทำตาม Prescription สำเร็จ 3 เซสชันติดต่อกันโดยไม่มีอาการเจ็บปวด (Pain-Free) และมี Form Score เฉลี่ย ${avgFormScore}% (≥ 90%) แนะนำปรับเพิ่มมุม Range of Motion +5° (จาก ${currentPrescription.targetMaxDeg}° เป็น ${newTargetMax}°) เพื่อกระตุ้นการฟื้นตัว`,
        requiresPhysicalTherapistApproval: true,
      };
    } else {
      const newHoldDuration = currentPrescription.holdDurationSec + 2.0;
      return {
        isEligibleForProgression: true,
        consecutiveSuccessfulSessions: 3,
        averageFormScore: avgFormScore,
        recommendationType: 'hold_duration_increase',
        suggestedTargetMinDeg: currentPrescription.targetMinDeg,
        suggestedTargetMaxDeg: currentPrescription.targetMaxDeg,
        suggestedHoldDurationSec: newHoldDuration,
        clinicalRationaleTh: `🌟 ผู้ป่วยทำตาม Prescription สำเร็จ 3 เซสชันติดต่อกันโดยไม่มีอาการเจ็บปวด และช่วงการเคลื่อนไหวถึงขีดจำกัดความปลอดภัย (${maxSafeCap}°) แล้ว แนะนำเพิ่มรอบการค้างท่า (Hold Duration) +2 วินาที (จาก ${currentPrescription.holdDurationSec}s เป็น ${newHoldDuration}s) เพื่อเสริมความทนทานของกล้ามเนื้อ`,
        requiresPhysicalTherapistApproval: true,
      };
    }
  }

  // Not yet 3 consecutive qualified sessions
  return {
    isEligibleForProgression: false,
    consecutiveSuccessfulSessions: consecutiveSuccess,
    averageFormScore: avgFormScore,
    recommendationType: 'maintain',
    suggestedTargetMinDeg: currentPrescription.targetMinDeg,
    suggestedTargetMaxDeg: currentPrescription.targetMaxDeg,
    suggestedHoldDurationSec: currentPrescription.holdDurationSec,
    clinicalRationaleTh: `ยังไม่ผ่านเกณฑ์การปรับระดับ: ต้องทำท่าได้อย่างถูกต้อง (Form Score ≥ 90%) และไม่มีความเจ็บปวดครบ 3 เซสชันติดต่อกัน (ปัจจุบันสำเร็จ ${consecutiveSuccess}/3 เซสชัน)`,
    requiresPhysicalTherapistApproval: true,
  };
}
