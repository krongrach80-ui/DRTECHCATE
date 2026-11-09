/**
 * packages/pose-engine/src/math/sideResolution.ts
 *
 * Centralized Anatomical Side Resolution & Wrong-Side Movement Detection
 *
 * Clinical & Biomechanical Specifications:
 * 1. MediaPipe BlazePose outputs anatomical landmark indices directly from the raw camera frame:
 *    - Left anatomical limbs: 11 (Shoulder), 13 (Elbow), 15 (Wrist), 23 (Hip), 25 (Knee), 27 (Ankle)
 *    - Right anatomical limbs: 12 (Shoulder), 14 (Elbow), 16 (Wrist), 24 (Hip), 26 (Knee), 28 (Ankle)
 *    Whether CSS `-scale-x-100` is active on <video> or not, the raw frame passed to MediaPipe
 *    evaluates patient-perspective anatomical left as odd indices and right as even indices.
 * 2. resolveTargetSide: Maps prescribed side ('left' | 'right' | 'bilateral') deterministically.
 * 3. Wrong-side Movement Guard: Detects when a patient raises/moves the non-target limb while
 *    leaving the prescribed limb stationary, blocking rep completion and providing clinical coaching.
 */

import { BodySide, LandmarkTriplet, AngleMechanicsConfig, TargetJoint } from '../types/exerciseConfig';

export interface SideTripletsResult {
  targetTriplet: LandmarkTriplet;
  oppositeTriplet?: LandmarkTriplet;
  isUnilateral: boolean;
  effectiveSide: BodySide;
}

export interface WrongSideCoachingText {
  th: string;
  en: string;
  cn: string;
}

/**
 * Resolves the authoritative clinical body side for pose evaluation.
 * Preserves patient-perspective prescription regardless of screen display mirroring.
 */
export function resolveTargetSide(
  prescribedSide?: BodySide | string | null,
  _isMirrored: boolean = true
): BodySide {
  if (!prescribedSide) return 'bilateral';
  const clean = prescribedSide.trim().toLowerCase();
  if (clean === 'left') return 'left';
  if (clean === 'right') return 'right';
  if (clean === 'both' || clean === 'bilateral') return 'bilateral';
  return 'bilateral';
}

/**
 * Returns the opposite anatomical body side for unilateral training.
 */
export function getOppositeSide(side: BodySide): BodySide {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return 'bilateral';
}

/**
 * Resolves both target and opposite landmark triplets for an angle-based exercise.
 */
export function resolveTripletsForSide(
  angleCfg: AngleMechanicsConfig,
  prescribedSide: BodySide
): SideTripletsResult {
  const effectiveSide = resolveTargetSide(prescribedSide);

  if (effectiveSide === 'left') {
    return {
      targetTriplet: angleCfg.landmarks.left,
      oppositeTriplet: angleCfg.landmarks.right,
      isUnilateral: true,
      effectiveSide: 'left',
    };
  }

  if (effectiveSide === 'right') {
    return {
      targetTriplet: angleCfg.landmarks.right,
      oppositeTriplet: angleCfg.landmarks.left,
      isUnilateral: true,
      effectiveSide: 'right',
    };
  }

  // Bilateral default
  return {
    targetTriplet: angleCfg.landmarks.right,
    oppositeTriplet: undefined,
    isUnilateral: false,
    effectiveSide: 'bilateral',
  };
}

/**
 * Generates trilingual clinical warning prompts when patient moves the non-target side.
 */
export function getWrongSideCoachingMessage(
  prescribedSide: 'left' | 'right',
  targetJoint?: TargetJoint | string
): WrongSideCoachingText {
  const isArmJoint =
    targetJoint === 'shoulder' ||
    targetJoint === 'elbow' ||
    targetJoint === 'wrist' ||
    targetJoint === 'scapula';

  const isLegJoint =
    targetJoint === 'knee' ||
    targetJoint === 'hip' ||
    targetJoint === 'ankle';

  if (isArmJoint) {
    return {
      th: prescribedSide === 'left' ? 'กรุณาใช้แขนข้างซ้าย (ข้างที่สั่งฝึก)' : 'กรุณาใช้แขนข้างขวา (ข้างที่สั่งฝึก)',
      en: prescribedSide === 'left' ? 'Please use your left arm (prescribed side)' : 'Please use your right arm (prescribed side)',
      cn: prescribedSide === 'left' ? '请使用左臂进行锻炼（处方侧）' : '请使用右臂进行锻炼（处方侧）',
    };
  }

  if (isLegJoint) {
    return {
      th: prescribedSide === 'left' ? 'กรุณาใช้ขาข้างซ้าย (ข้างที่สั่งฝึก)' : 'กรุณาใช้ขาข้างขวา (ข้างที่สั่งฝึก)',
      en: prescribedSide === 'left' ? 'Please use your left leg (prescribed side)' : 'Please use your right leg (prescribed side)',
      cn: prescribedSide === 'left' ? '请使用左腿进行锻炼（处方侧）' : '请使用右腿进行锻炼（处方侧）',
    };
  }

  return {
    th: prescribedSide === 'left' ? 'กรุณาฝึกข้างซ้าย (ข้างที่สั่งฝึก)' : 'กรุณาฝึกข้างขวา (ข้างที่สั่งฝึก)',
    en: prescribedSide === 'left' ? 'Please train your left side (prescribed side)' : 'Please train your right side (prescribed side)',
    cn: prescribedSide === 'left' ? '请使用左侧进行锻炼（处方侧）' : '请使用右侧进行锻炼（处方侧）',
  };
}
