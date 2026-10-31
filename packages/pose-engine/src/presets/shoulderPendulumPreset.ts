/**
 * packages/pose-engine/src/presets/shoulderPendulumPreset.ts
 *
 * PRODUCTION CLINICAL PRESETS FOR DRTECH.CARE
 * Includes Shoulder Pendulum (Codman's Circular Pendulum) & Core Physical Therapy Exercises.
 */

import { ExerciseDetectionConfig } from '../types/exerciseConfig';

/**
 * PRODUCTION PRESET: Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)
 */
export const SHOULDER_PENDULUM_PRESET: ExerciseDetectionConfig = {
  id: 'ex-shoulder-pendulum',
  exerciseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  nameTh: 'Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)',
  nameEn: 'Codman Shoulder Pendulum',
  description: 'โน้มลำตัวไปข้างหน้า ปล่อยแขนห้อยลงตามแรงโน้มถ่วง และแกว่งเป็นวงกลมเบาๆ เพื่อผ่อนคลายข้อต่อและเพิ่มการไหลเวียนเลือด',
  mediaUrl: '/assets/exercises/shoulder_pendulum.mp4',
  evaluationMode: 'pendulum_circular',
  side: 'right',
  targetJoint: 'shoulder',
  cameraGuide: {
    recommendedView: 'side_45',
    recommendedDistanceMeters: [1.5, 2.5],
    instructionTextTh: 'กรุณายืนหันข้างเฉียง 45° ถึง 90° ระยะห่าง 1.5 - 2.5 เมตรจากกล้อง โน้มตัวไปข้างหน้าเล็กน้อย และปล่อยแขนข้างที่ต้องการฝึกให้ห้อยลงอย่างผ่อนคลาย',
  },
  pendulumMechanics: {
    minTrunkForwardTiltDeg: 18.0,
    maxTrunkForwardTiltDeg: 65.0,
    minElbowStraightnessDeg: 145.0,
    minCircleRadiusRatio: 0.07,
    maxCircleRadiusRatio: 0.35,
    minCycleDurationSec: 1.2,
    maxCycleDurationSec: 5.0,
  },
  defaultPrescription: {
    repsPerSet: 10,
    totalSets: 3,
    restBetweenSetsSec: 30,
  },
  compensationRules: [
    {
      ruleId: 'pendulum_trunk_lean',
      type: 'trunk_lean',
      thresholdValue: 0.25,
      warningMessageTh: 'ลำตัวเอียงหรือไม่นิ่ง โน้มตัวให้มั่นคงและปล่อยให้แขนแกว่งเป็นอิสระ',
      severity: 'warning',
    },
    {
      ruleId: 'pendulum_elbow_flexion',
      type: 'elbow_flexion',
      thresholdValue: 140.0,
      warningMessageTh: 'ปล่อยแขนให้ตรง อย่าเกร็งหรืองอข้อศอกขณะแกว่ง',
      severity: 'warning',
    },
    {
      ruleId: 'pendulum_speed',
      type: 'excessive_speed',
      thresholdValue: 240.0,
      warningMessageTh: 'แกว่งแขนเร็วเกินไป ค่อยๆ แกว่งช้าๆ เพื่อผ่อนคลายข้อไหล่',
      severity: 'warning',
    },
  ],
  safetyContraindications: {
    stopOnPainMessageTh: 'หากมีอาการเจ็บแปลบบริเวณข้อไหล่หรือแขน ให้หยุดทันทีและแจ้งนักกายภาพบำบัด',
    maxSafeAngleCapDeg: 90,
  },
};

/**
 * PRODUCTION PRESET: Shoulder Abduction (กางแขนยกด้านข้าง)
 */
export const SHOULDER_ABDUCTION_PRESET: ExerciseDetectionConfig = {
  id: 'ex-shoulder-abduction',
  nameTh: 'Shoulder Abduction (กางแขนยกด้านข้าง)',
  nameEn: 'Shoulder Abduction',
  description: 'ยกแขนกางออกด้านข้างลำตัวช้าๆ จนถึงระดับขนานกับพื้น แล้วค้างไว้',
  evaluationMode: 'angle_rep_hold',
  side: 'right',
  targetJoint: 'shoulder',
  cameraGuide: {
    recommendedView: 'front',
    recommendedDistanceMeters: [1.8, 2.5],
    instructionTextTh: 'ยืนหันหน้าตรงเข้าหากล้อง ให้เห็นลำตัวและแขนทั้งสองข้างอย่างชัดเจน',
  },
  angleMechanics: {
    landmarks: {
      left: { pointA: 23, vertex: 11, pointB: 15, use3DWorld: true }, // Hip -> Shoulder -> Wrist
      right: { pointA: 24, vertex: 12, pointB: 16, use3DWorld: true },
    },
    startAngleDeg: 20,
    targetMinDeg: 80,
    targetMaxDeg: 100,
    toleranceDeg: 10,
    holdDurationSec: 2.0,
  },
  defaultPrescription: {
    repsPerSet: 10,
    totalSets: 3,
    restBetweenSetsSec: 30,
  },
  compensationRules: [
    {
      ruleId: 'abduction_trunk_lean',
      type: 'trunk_lean',
      thresholdValue: 0.15,
      warningMessageTh: 'ลำตัวเอียงไปด้านข้าง พยายามรักษาลำตัวให้ตรง',
      severity: 'warning',
    },
    {
      ruleId: 'abduction_shoulder_shrug',
      type: 'shoulder_shrug',
      thresholdValue: 0.12,
      warningMessageTh: 'อย่าห่อหรือยกไหล่ขึ้น ให้ใช้กล้ามเนื้อต้นแขนยกอย่างผ่อนคลาย',
      severity: 'warning',
    },
  ],
  safetyContraindications: {
    stopOnPainMessageTh: 'หากรู้สึกเจ็บบริเวณข้อต่อหัวไหล่ ให้หยุดพักทันที',
    maxSafeAngleCapDeg: 135,
  },
};

/**
 * PRODUCTION PRESET: Knee Extension (เหยียดข้อเข่า)
 */
export const KNEE_EXTENSION_PRESET: ExerciseDetectionConfig = {
  id: 'ex-knee-extension',
  nameTh: 'Knee Extension (เหยียดข้อเข่าขณะนั่ง)',
  nameEn: 'Seated Knee Extension',
  description: 'นั่งบนเก้าอี้แล้วค่อยๆ เหยียดขาไปข้างหน้าจนข้อเข่าตรง ค้างไว้แล้วลดระดับลง',
  evaluationMode: 'angle_rep_hold',
  side: 'right',
  targetJoint: 'knee',
  cameraGuide: {
    recommendedView: 'side_90',
    recommendedDistanceMeters: [1.8, 2.8],
    instructionTextTh: 'นั่งเก้าอี้หันข้าง 90° เข้าหากล้อง เพื่อให้เห็นแนวข้อสะโพก เข่า และข้อเท้าชัดเจน',
  },
  angleMechanics: {
    landmarks: {
      left: { pointA: 23, vertex: 25, pointB: 27, use3DWorld: true }, // Hip -> Knee -> Ankle
      right: { pointA: 24, vertex: 26, pointB: 28, use3DWorld: true },
    },
    startAngleDeg: 90,
    targetMinDeg: 165,
    targetMaxDeg: 180,
    toleranceDeg: 8,
    holdDurationSec: 2.0,
  },
  defaultPrescription: {
    repsPerSet: 10,
    totalSets: 3,
    restBetweenSetsSec: 30,
  },
  compensationRules: [
    {
      ruleId: 'knee_ext_trunk_lean',
      type: 'trunk_lean',
      thresholdValue: 0.18,
      warningMessageTh: 'นั่งหลังตรง อย่าเอนหลังพิงหรือเอียงลำตัว',
      severity: 'warning',
    },
  ],
  safetyContraindications: {
    stopOnPainMessageTh: 'หากรู้สึกปวดเสียวที่สะบ้าหรือข้อเข่า ให้หยุดการเหยียดทันที',
    maxSafeAngleCapDeg: 180,
  },
};

import {
  ALL_CLINICAL_EXERCISES,
  getClinicalExerciseConfig,
} from './exercises.config';

export const DEFAULT_CLINICAL_PRESETS: ExerciseDetectionConfig[] = ALL_CLINICAL_EXERCISES;

/**
 * Lookup helper: finds matching detection config by title or exercise ID from the full 10-exercise catalog
 */
export function findPresetForExercise(
  exerciseNameOrId?: string | null
): ExerciseDetectionConfig | null {
  if (!exerciseNameOrId) return null;
  const match = getClinicalExerciseConfig(exerciseNameOrId);
  if (match) return match;

  const query = exerciseNameOrId.toLowerCase().trim();
  for (const preset of DEFAULT_CLINICAL_PRESETS) {
    if (preset.id === query || preset.exerciseId === query) return preset;
    if (preset.nameTh.toLowerCase().includes(query) || query.includes(preset.nameTh.toLowerCase())) return preset;
    if (preset.nameEn.toLowerCase().includes(query) || query.includes(preset.nameEn.toLowerCase())) return preset;
    if (preset.nameCn && (preset.nameCn.includes(query) || query.includes(preset.nameCn))) return preset;
  }

  return SHOULDER_PENDULUM_PRESET;
}

