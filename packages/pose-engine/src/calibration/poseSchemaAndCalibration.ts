/**
 * packages/pose-engine/src/calibration/poseSchemaAndCalibration.ts
 *
 * Part 4: Schema validation, statistical clinician calibration (median + MAD/IQR),
 * custom exercise definitions (no-code creation), and resilient local storage.
 *
 * Scope guarantees:
 * - No ML training, no network/server transmission, no video/image storage.
 * - Pure validation & calibration functions never throw on malformed/empty inputs.
 * - Never mutates built-in exercises; stores custom poses and per-(patientId, poseId)
 *   calibrations under dedicated localStorage namespaces.
 */

import type {
  AngleDirection,
  BodySide,
  ExerciseDetectionConfig,
  FramingRequirement,
  LandmarkTriplet,
  PoseEngineLandmark,
  TargetJoint,
} from '../types/exerciseConfig';
import {
  DEFAULT_ANGLE_FALLOFF_DEG,
  DEFAULT_ANGLE_TOLERANCE_DEG,
  MIN_JOINT_VISIBILITY,
} from '../math/sessionProgressAndAccuracy';
import { calculateAngle2D, calculateAngle3D, clamp } from '../math/geometry3d';

// ============================================================================
// Named Configuration Constants (No Magic Numbers in Logic)
// ============================================================================

export const DEFAULT_POSE_SIDE = 'both' as const;
export const DEFAULT_POSE_TOLERANCE_DEG = DEFAULT_ANGLE_TOLERANCE_DEG;
export const DEFAULT_FALLOFF_DEG = DEFAULT_ANGLE_FALLOFF_DEG;
export const DEFAULT_JOINT_WEIGHT = 1.0;
export const DEFAULT_START_ANGLE_DEG = 20;
export const DEFAULT_HOLD_DURATION_SEC = 1.0;

export const MIN_POSE_ANGLE_DEG = 0;
export const MAX_POSE_ANGLE_DEG = 180;
export const MAX_MEDIAPIPE_LANDMARK_INDEX = 32;

export const DEFAULT_PHASE_ENTER_RATIO = 0.90;
export const DEFAULT_PHASE_EXIT_RATIO = 0.70;

export const CALIBRATION_DURATION_MS = 3000;
export const CALIBRATION_SAMPLE_INTERVAL_MS = 33;
export const MIN_CALIBRATION_FRAMES = 15;
export const MIN_CALIBRATION_VISIBILITY = MIN_JOINT_VISIBILITY;

export const CALIBRATION_MAD_SCALE = 1.4826;
export const CALIBRATION_TOLERANCE_MULTIPLIER = 2.0;
export const CALIBRATION_MIN_MARGIN_DEG = 4.0;
export const MIN_CALIBRATED_TOLERANCE_DEG = 5.0;
export const MAX_CALIBRATED_TOLERANCE_DEG = 25.0;

export const DRTECH_CUSTOM_POSES_STORAGE_KEY = 'drtech_care_custom_poses_v1';
export const DRTECH_PATIENT_CALIBRATIONS_STORAGE_KEY = 'drtech_care_patient_calibrations_v1';

// ============================================================================
// Schema & Types
// ============================================================================

export type PoseSide = 'left' | 'right' | 'both';

export type PoseJointPresetKey =
  | 'shoulder'
  | 'elbow'
  | 'knee'
  | 'hip'
  | 'neck'
  | 'ankle'
  | 'wrist';

export interface PoseJointPresetSpec {
  key: PoseJointPresetKey;
  labelTh: string;
  targetJoint: TargetJoint;
  framing: FramingRequirement;
  defaultDirection: AngleDirection;
  defaultStartAngleDeg: number;
  left: LandmarkTriplet;
  right: LandmarkTriplet;
  requiredLandmarks: number[];
}

export const POSE_JOINT_PRESETS: Record<PoseJointPresetKey, PoseJointPresetSpec> = {
  shoulder: {
    key: 'shoulder',
    labelTh: 'ข้อไหล่ (สะโพก-ไหล่-ศอก)',
    targetJoint: 'shoulder',
    framing: 'upper',
    defaultDirection: 'increase',
    defaultStartAngleDeg: 20,
    left: { pointA: 23, vertex: 11, pointB: 13, use3DWorld: true },
    right: { pointA: 24, vertex: 12, pointB: 14, use3DWorld: true },
    requiredLandmarks: [11, 12, 13, 14, 23, 24],
  },
  elbow: {
    key: 'elbow',
    labelTh: 'ข้อศอก (ไหล่-ศอก-ข้อมือ)',
    targetJoint: 'elbow',
    framing: 'upper',
    defaultDirection: 'decrease',
    defaultStartAngleDeg: 160,
    left: { pointA: 11, vertex: 13, pointB: 15, use3DWorld: true },
    right: { pointA: 12, vertex: 14, pointB: 16, use3DWorld: true },
    requiredLandmarks: [11, 12, 13, 14, 15, 16],
  },
  knee: {
    key: 'knee',
    labelTh: 'ข้อเข่า (สะโพก-เข่า-ข้อเท้า)',
    targetJoint: 'knee',
    framing: 'lower_body',
    defaultDirection: 'increase',
    defaultStartAngleDeg: 90,
    left: { pointA: 23, vertex: 25, pointB: 27, use3DWorld: true },
    right: { pointA: 24, vertex: 26, pointB: 28, use3DWorld: true },
    requiredLandmarks: [23, 24, 25, 26, 27, 28],
  },
  hip: {
    key: 'hip',
    labelTh: 'ข้อสะโพก (ไหล่-สะโพก-เข่า)',
    targetJoint: 'hip',
    framing: 'full',
    defaultDirection: 'increase',
    defaultStartAngleDeg: 15,
    left: { pointA: 11, vertex: 23, pointB: 25, use3DWorld: true },
    right: { pointA: 12, vertex: 24, pointB: 26, use3DWorld: true },
    requiredLandmarks: [11, 12, 23, 24, 25, 26],
  },
  neck: {
    key: 'neck',
    labelTh: 'คอ/ศีรษะ (หู-ไหล่-สะโพก)',
    targetJoint: 'neck',
    framing: 'head_shoulders',
    defaultDirection: 'decrease',
    defaultStartAngleDeg: 90,
    left: { pointA: 7, vertex: 11, pointB: 23, use3DWorld: false },
    right: { pointA: 8, vertex: 12, pointB: 24, use3DWorld: false },
    requiredLandmarks: [0, 7, 8, 11, 12],
  },
  ankle: {
    key: 'ankle',
    labelTh: 'ข้อเท้า (เข่า-ข้อเท้า-ปลายเท้า)',
    targetJoint: 'ankle',
    framing: 'lower_body',
    defaultDirection: 'increase',
    defaultStartAngleDeg: 90,
    left: { pointA: 25, vertex: 27, pointB: 31, use3DWorld: false },
    right: { pointA: 26, vertex: 28, pointB: 32, use3DWorld: false },
    requiredLandmarks: [25, 26, 27, 28, 31, 32],
  },
  wrist: {
    key: 'wrist',
    labelTh: 'ข้อมือ (ศอก-ข้อมือ-นิ้วชี้)',
    targetJoint: 'wrist',
    framing: 'upper',
    defaultDirection: 'decrease',
    defaultStartAngleDeg: 170,
    left: { pointA: 13, vertex: 15, pointB: 19, use3DWorld: false },
    right: { pointA: 14, vertex: 16, pointB: 20, use3DWorld: false },
    requiredLandmarks: [13, 14, 15, 16, 19, 20],
  },
};

export interface PoseJointDefinition {
  id?: string;
  jointType?: PoseJointPresetKey;
  pointA?: number;
  vertex?: number;
  pointB?: number;
  target: number;
  tolerance?: number;
  weight?: number;
  startAngleDeg?: number;
  direction?: AngleDirection;
  holdDurationSec?: number;
}

export interface ValidatedPoseJoint {
  id: string;
  jointType: PoseJointPresetKey;
  pointA: number;
  vertex: number;
  pointB: number;
  target: number;
  tolerance: number;
  weight: number;
  startAngleDeg: number;
  direction: AngleDirection;
  holdDurationSec: number;
}

export interface PosePhaseThresholds {
  enter: number;
  exit: number;
}

export interface PoseDefinitionInput {
  id: string;
  name: string;
  side?: PoseSide;
  joints: PoseJointDefinition[];
  falloff?: number;
  hint?: string;
  requiredLandmarks?: number[];
  phaseThresholds?: Partial<PosePhaseThresholds>;
  repsPerSet?: number;
  totalSets?: number;
  createdAt?: string;
}

export interface ValidatedPoseDefinition {
  id: string;
  name: string;
  side: PoseSide;
  joints: ValidatedPoseJoint[];
  falloff: number;
  hint?: string;
  requiredLandmarks: number[];
  phaseThresholds: PosePhaseThresholds;
  repsPerSet: number;
  totalSets: number;
  createdAt: string;
}

export interface PoseValidationError {
  field: string;
  message: string;
}

export type PoseValidationResult =
  | { ok: true; value: ValidatedPoseDefinition }
  | { ok: false; errors: PoseValidationError[] };

export interface CalibrationFrameSample {
  angleDeg: number | null | undefined;
  visibility?: number | null;
  timestampMs?: number;
}

export type CalibrationSampleInput = CalibrationFrameSample | number | null | undefined;

export interface ComputeCalibrationOptions {
  minFrames?: number;
  minVisibility?: number;
  originalTarget?: number;
  originalTolerance?: number;
  jointLabelTh?: string;
}

export interface CalibrationProposal {
  target: number;
  tolerance: number;
  madDeg: number;
  iqrDeg: number;
  validFrameCount: number;
  totalFrameCount: number;
  hint: string;
  originalTarget: number;
  originalTolerance: number;
}

export type CalibrationComputationResult =
  | { ok: true; proposal: CalibrationProposal }
  | {
      ok: false;
      reason: 'insufficient_samples';
      messageTh: string;
      validFrameCount: number;
      totalFrameCount: number;
      requiredFrameCount: number;
    };

export interface PatientPoseCalibrationRecord {
  patientId: string;
  poseId: string;
  targetAngleDeg: number;
  toleranceDeg: number;
  madDeg: number;
  iqrDeg: number;
  validFrameCount: number;
  hintTh: string;
  calibratedAt: string;
  calibratedBy: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

// ============================================================================
// Pure Statistical Helpers
// ============================================================================

function toFiniteNumber(val: unknown): number | null {
  if (val === null || val === undefined || typeof val === 'boolean' || val === '') {
    return null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function computeSortedMedian(sortedValues: number[]): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sortedValues[mid];
  }
  return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
}

function computePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = clamp(p, 0, 1) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const frac = idx - lo;
  return sortedValues[lo] * (1 - frac) + sortedValues[hi] * frac;
}

function isValidLandmarkIndex(idx: unknown): idx is number {
  return (
    typeof idx === 'number' &&
    Number.isInteger(idx) &&
    idx >= 0 &&
    idx <= MAX_MEDIAPIPE_LANDMARK_INDEX
  );
}

function resolveDefaultStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

// ============================================================================
// Step 1: Pose Schema Validation (Pure, Never Throws)
// ============================================================================

export function validatePoseDefinition(
  input: unknown,
  options?: { existingIds?: Iterable<string>; allowOverwriteId?: boolean }
): PoseValidationResult {
  const errors: PoseValidationError[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ field: 'root', message: 'ข้อมูลท่าไม่ถูกต้อง (ต้องเป็น object)' }],
    };
  }

  const raw = input as Record<string, unknown>;

  // 1. Validate id (required, non-empty, unique)
  const rawId = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
  if (!rawId) {
    errors.push({ field: 'id', message: 'กรุณาระบุรหัสท่า (id)' });
  } else if (!/^[a-z0-9-_]+$/.test(rawId)) {
    errors.push({
      field: 'id',
      message: 'รหัสท่า (id) ต้องใช้ตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข ขีดกลาง (-) หรือขีดล่าง (_) เท่านั้น',
    });
  } else if (!options?.allowOverwriteId && options?.existingIds) {
    const existingSet = new Set(Array.from(options.existingIds, (s) => String(s).trim().toLowerCase()));
    if (existingSet.has(rawId)) {
      errors.push({
        field: 'id',
        message: `รหัสท่า "${rawId}" มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`,
      });
    }
  }

  // 2. Validate name (Thai / display name, required)
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!rawName) {
    errors.push({ field: 'name', message: 'กรุณาระบุชื่อท่า (ภาษาไทย)' });
  }

  // 3. Validate side ("left" | "right" | "both", defaults to DEFAULT_POSE_SIDE = "both")
  let resolvedSide: PoseSide = DEFAULT_POSE_SIDE;
  if (raw.side !== undefined && raw.side !== null && raw.side !== '') {
    if (raw.side === 'left' || raw.side === 'right' || raw.side === 'both') {
      resolvedSide = raw.side;
    } else {
      errors.push({
        field: 'side',
        message: 'ค่าข้างที่ฝึก (side) ต้องเป็น "left", "right" หรือ "both" เท่านั้น',
      });
    }
  }

  // 4. Validate falloff (> 0, defaults to DEFAULT_FALLOFF_DEG)
  let resolvedFalloff = DEFAULT_FALLOFF_DEG;
  if (raw.falloff !== undefined && raw.falloff !== null && raw.falloff !== '') {
    const parsedFalloff = toFiniteNumber(raw.falloff);
    if (parsedFalloff === null || parsedFalloff <= 0) {
      errors.push({
        field: 'falloff',
        message: 'ช่วงลดคะแนน (falloff) ต้องเป็นตัวเลขที่มากกว่า 0 องศา',
      });
    } else {
      resolvedFalloff = parsedFalloff;
    }
  }

  // 5. Validate phaseThresholds (enter / exit hysteresis, defaults to constants)
  let enterRatio = DEFAULT_PHASE_ENTER_RATIO;
  let exitRatio = DEFAULT_PHASE_EXIT_RATIO;
  if (raw.phaseThresholds !== undefined && raw.phaseThresholds !== null) {
    if (typeof raw.phaseThresholds !== 'object' || Array.isArray(raw.phaseThresholds)) {
      errors.push({
        field: 'phaseThresholds',
        message: 'phaseThresholds ต้องเป็น object ที่มีค่า enter และ exit',
      });
    } else {
      const pt = raw.phaseThresholds as Record<string, unknown>;
      if (pt.enter !== undefined) {
        const parsedEnter = toFiniteNumber(pt.enter);
        if (parsedEnter === null || parsedEnter <= 0 || parsedEnter > 1) {
          errors.push({
            field: 'phaseThresholds.enter',
            message: 'เกณฑ์เข้าท่า (enter) ต้องอยู่ระหว่าง 0.01 ถึง 1.0',
          });
        } else {
          enterRatio = parsedEnter;
        }
      }
      if (pt.exit !== undefined) {
        const parsedExit = toFiniteNumber(pt.exit);
        if (parsedExit === null || parsedExit <= 0 || parsedExit > 1) {
          errors.push({
            field: 'phaseThresholds.exit',
            message: 'เกณฑ์ออกท่า (exit) ต้องอยู่ระหว่าง 0.01 ถึง 1.0',
          });
        } else {
          exitRatio = parsedExit;
        }
      }
      if (exitRatio > enterRatio) {
        errors.push({
          field: 'phaseThresholds',
          message: 'เกณฑ์ออกท่า (exit) ต้องน้อยกว่าหรือเท่ากับเกณฑ์เข้าท่า (enter)',
        });
      }
    }
  }

  // 6. Validate joints (must be non-empty array)
  const validatedJoints: ValidatedPoseJoint[] = [];
  if (!Array.isArray(raw.joints) || raw.joints.length === 0) {
    errors.push({
      field: 'joints',
      message: 'กรุณาระบุข้อต่ออย่างน้อย 1 ข้อต่อในรายการ joints',
    });
  } else {
    raw.joints.forEach((item, index) => {
      const prefix = `joints[${index}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push({ field: prefix, message: `ข้อต่อลำดับที่ ${index + 1} ไม่ถูกต้อง` });
        return;
      }

      const j = item as Record<string, unknown>;
      const rawJointType =
        typeof j.jointType === 'string' && j.jointType in POSE_JOINT_PRESETS
          ? (j.jointType as PoseJointPresetKey)
          : j.jointType === undefined
            ? 'shoulder'
            : null;

      if (rawJointType === null) {
        errors.push({
          field: `${prefix}.jointType`,
          message: `ประเภทข้อต่อในข้อต่อลำดับที่ ${index + 1} ไม่ถูกต้อง`,
        });
      }

      const preset = POSE_JOINT_PRESETS[rawJointType ?? 'shoulder'];
      const defaultTriplet = resolvedSide === 'right' ? preset.right : preset.left;

      const pointA = j.pointA !== undefined ? toFiniteNumber(j.pointA) : defaultTriplet.pointA;
      const vertex = j.vertex !== undefined ? toFiniteNumber(j.vertex) : defaultTriplet.vertex;
      const pointB = j.pointB !== undefined ? toFiniteNumber(j.pointB) : defaultTriplet.pointB;

      if (!isValidLandmarkIndex(pointA) || !isValidLandmarkIndex(vertex) || !isValidLandmarkIndex(pointB)) {
        errors.push({
          field: `${prefix}.landmarks`,
          message: `ดัชนีจุดข้อต่อ (Landmark) ต้องเป็นจำนวนเต็มระหว่าง 0 ถึง ${MAX_MEDIAPIPE_LANDMARK_INDEX}`,
        });
      }

      const parsedTarget = toFiniteNumber(j.target);
      if (
        parsedTarget === null ||
        parsedTarget < MIN_POSE_ANGLE_DEG ||
        parsedTarget > MAX_POSE_ANGLE_DEG
      ) {
        errors.push({
          field: `${prefix}.target`,
          message: `มุมเป้าหมาย (target) ต้องอยู่ระหว่าง ${MIN_POSE_ANGLE_DEG} ถึง ${MAX_POSE_ANGLE_DEG} องศา`,
        });
      }

      let resolvedTolerance = DEFAULT_POSE_TOLERANCE_DEG;
      if (j.tolerance !== undefined && j.tolerance !== null && j.tolerance !== '') {
        const parsedTol = toFiniteNumber(j.tolerance);
        if (parsedTol === null || parsedTol <= 0) {
          errors.push({
            field: `${prefix}.tolerance`,
            message: 'ค่าเผื่อมุม (tolerance) ต้องมากกว่า 0 องศา',
          });
        } else {
          resolvedTolerance = parsedTol;
        }
      }

      let resolvedWeight = DEFAULT_JOINT_WEIGHT;
      if (j.weight !== undefined && j.weight !== null && j.weight !== '') {
        const parsedWeight = toFiniteNumber(j.weight);
        if (parsedWeight === null || parsedWeight <= 0) {
          errors.push({
            field: `${prefix}.weight`,
            message: 'ค่าน้ำหนักข้อต่อ (weight) ต้องมากกว่า 0',
          });
        } else {
          resolvedWeight = parsedWeight;
        }
      }

      const direction: AngleDirection =
        j.direction === 'decrease' || j.direction === 'increase'
          ? j.direction
          : preset.defaultDirection;

      let startAngleDeg = preset.defaultStartAngleDeg;
      if (j.startAngleDeg !== undefined && j.startAngleDeg !== null && j.startAngleDeg !== '') {
        const parsedStart = toFiniteNumber(j.startAngleDeg);
        if (parsedStart === null || parsedStart < MIN_POSE_ANGLE_DEG || parsedStart > MAX_POSE_ANGLE_DEG) {
          errors.push({
            field: `${prefix}.startAngleDeg`,
            message: `มุมเริ่มต้น (startAngleDeg) ต้องอยู่ระหว่าง ${MIN_POSE_ANGLE_DEG} ถึง ${MAX_POSE_ANGLE_DEG} องศา`,
          });
        } else {
          startAngleDeg = parsedStart;
        }
      }

      let holdDurationSec = DEFAULT_HOLD_DURATION_SEC;
      if (j.holdDurationSec !== undefined && j.holdDurationSec !== null && j.holdDurationSec !== '') {
        const parsedHold = toFiniteNumber(j.holdDurationSec);
        if (parsedHold === null || parsedHold < 0) {
          errors.push({
            field: `${prefix}.holdDurationSec`,
            message: 'เวลาค้างท่า (holdDurationSec) ต้องไม่ติดลบ',
          });
        } else {
          holdDurationSec = parsedHold;
        }
      }

      if (
        rawJointType !== null &&
        parsedTarget !== null &&
        parsedTarget >= MIN_POSE_ANGLE_DEG &&
        parsedTarget <= MAX_POSE_ANGLE_DEG &&
        isValidLandmarkIndex(pointA) &&
        isValidLandmarkIndex(vertex) &&
        isValidLandmarkIndex(pointB)
      ) {
        validatedJoints.push({
          id: typeof j.id === 'string' && j.id.trim() ? j.id.trim() : `${rawJointType}_${index + 1}`,
          jointType: rawJointType,
          pointA,
          vertex,
          pointB,
          target: parsedTarget,
          tolerance: resolvedTolerance,
          weight: resolvedWeight,
          startAngleDeg,
          direction,
          holdDurationSec,
        });
      }
    });
  }

  // 7. Validate requiredLandmarks (optional; auto-derived from joints if omitted)
  let resolvedRequiredLandmarks: number[] = [];
  if (raw.requiredLandmarks !== undefined && raw.requiredLandmarks !== null) {
    if (!Array.isArray(raw.requiredLandmarks) || raw.requiredLandmarks.length === 0) {
      errors.push({
        field: 'requiredLandmarks',
        message: 'requiredLandmarks ต้องเป็นอาร์เรย์ของดัชนีข้อต่อที่ไม่ว่าง',
      });
    } else {
      const uniqueIndices = new Set<number>();
      for (const idx of raw.requiredLandmarks) {
        if (!isValidLandmarkIndex(idx)) {
          errors.push({
            field: 'requiredLandmarks',
            message: `ดัชนีใน requiredLandmarks ต้องเป็นจำนวนเต็ม 0–${MAX_MEDIAPIPE_LANDMARK_INDEX}`,
          });
          break;
        }
        uniqueIndices.add(idx);
      }
      resolvedRequiredLandmarks = Array.from(uniqueIndices);
    }
  } else if (validatedJoints.length > 0) {
    const derived = new Set<number>();
    for (const j of validatedJoints) {
      const preset = POSE_JOINT_PRESETS[j.jointType];
      if (resolvedSide === 'left') {
        derived.add(preset.left.pointA);
        derived.add(preset.left.vertex);
        derived.add(preset.left.pointB);
      } else if (resolvedSide === 'right') {
        derived.add(preset.right.pointA);
        derived.add(preset.right.vertex);
        derived.add(preset.right.pointB);
      } else {
        for (const lmIdx of preset.requiredLandmarks) {
          derived.add(lmIdx);
        }
      }
    }
    resolvedRequiredLandmarks = Array.from(derived);
  }

  // Optional repsPerSet & totalSets
  let repsPerSet = 10;
  if (raw.repsPerSet !== undefined && raw.repsPerSet !== null && raw.repsPerSet !== '') {
    const parsedReps = toFiniteNumber(raw.repsPerSet);
    if (parsedReps === null || parsedReps <= 0) {
      errors.push({ field: 'repsPerSet', message: 'จำนวนครั้งต่อเซ็ตต้องมากกว่า 0' });
    } else {
      repsPerSet = Math.round(parsedReps);
    }
  }

  let totalSets = 3;
  if (raw.totalSets !== undefined && raw.totalSets !== null && raw.totalSets !== '') {
    const parsedSets = toFiniteNumber(raw.totalSets);
    if (parsedSets === null || parsedSets <= 0) {
      errors.push({ field: 'totalSets', message: 'จำนวนเซ็ตต้องมากกว่า 0' });
    } else {
      totalSets = Math.round(parsedSets);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const hint = typeof raw.hint === 'string' && raw.hint.trim() ? raw.hint.trim() : undefined;
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt.trim()
      ? raw.createdAt.trim()
      : new Date().toISOString();

  return {
    ok: true,
    value: {
      id: rawId,
      name: rawName,
      side: resolvedSide,
      joints: validatedJoints,
      falloff: resolvedFalloff,
      hint,
      requiredLandmarks: resolvedRequiredLandmarks,
      phaseThresholds: {
        enter: enterRatio,
        exit: exitRatio,
      },
      repsPerSet,
      totalSets,
      createdAt,
    },
  };
}

// ============================================================================
// Step 2: Convert Validated Custom Pose to ExerciseDetectionConfig
// ============================================================================

export function poseDefinitionToExerciseConfig(
  def: ValidatedPoseDefinition
): ExerciseDetectionConfig {
  const primaryJoint = def.joints[0];
  const preset = POSE_JOINT_PRESETS[primaryJoint.jointType];
  const isDecreasing = primaryJoint.direction === 'decrease';

  const leftTriplet: LandmarkTriplet =
    primaryJoint.pointA !== preset.right.pointA ||
    primaryJoint.vertex !== preset.right.vertex ||
    primaryJoint.pointB !== preset.right.pointB
      ? {
          pointA: preset.left.pointA,
          vertex: preset.left.vertex,
          pointB: preset.left.pointB,
          use3DWorld: preset.left.use3DWorld,
          weight: primaryJoint.weight,
          jointNameTh: preset.labelTh,
          lowAngleHintTh: def.hint,
        }
      : {
          ...preset.left,
          weight: primaryJoint.weight,
          jointNameTh: preset.labelTh,
          lowAngleHintTh: def.hint,
        };

  const rightTriplet: LandmarkTriplet = {
    pointA:
      def.side === 'right'
        ? primaryJoint.pointA
        : preset.right.pointA,
    vertex:
      def.side === 'right'
        ? primaryJoint.vertex
        : preset.right.vertex,
    pointB:
      def.side === 'right'
        ? primaryJoint.pointB
        : preset.right.pointB,
    use3DWorld: preset.right.use3DWorld,
    weight: primaryJoint.weight,
    jointNameTh: preset.labelTh,
    lowAngleHintTh: def.hint,
  };

  if (def.side === 'left') {
    leftTriplet.pointA = primaryJoint.pointA;
    leftTriplet.vertex = primaryJoint.vertex;
    leftTriplet.pointB = primaryJoint.pointB;
  }

  const targetMinDeg = isDecreasing
    ? Math.max(MIN_POSE_ANGLE_DEG, primaryJoint.target - primaryJoint.tolerance)
    : primaryJoint.target;
  const targetMaxDeg = isDecreasing
    ? primaryJoint.target
    : MAX_POSE_ANGLE_DEG;

  const sideValue: BodySide = def.side === 'both' ? 'bilateral' : def.side;

  const minVisibilityMap: Record<number, number> = {};
  for (const lmIdx of def.requiredLandmarks) {
    minVisibilityMap[lmIdx] = MIN_CALIBRATION_VISIBILITY;
  }

  return {
    id: def.id,
    exerciseId: def.id,
    is_active: true,
    mode: 'camera',
    nameTh: def.name,
    nameEn: def.name,
    descriptionTh: def.hint || `ท่ากายภาพบำบัดกำหนดเอง: ${def.name}`,
    framing: preset.framing,
    camera_framing: preset.framing === 'upper' ? 'upper_body' : preset.framing,
    evaluationMode: preset.targetJoint === 'neck' ? 'neck_tilt' : 'angle_rep_hold',
    side: sideValue,
    lateralityMode: 'unilateral_or_bilateral',
    allowDynamicUnilateral: true,
    use3DWorld: preset.left.use3DWorld ?? true,
    targetJoint: preset.targetJoint,
    defaultSets: def.totalSets,
    defaultReps: def.repsPerSet,
    defaultHoldSec: primaryJoint.holdDurationSec,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: def.hint || 'จัดตำแหน่งร่างกายให้อยู่ในกรอบกล้องและเห็นข้อต่อชัดเจน',
    },
    angleMechanics: {
      landmarks: {
        left: leftTriplet,
        right: rightTriplet,
      },
      direction: primaryJoint.direction,
      startAngleDeg: primaryJoint.startAngleDeg,
      targetMinDeg,
      targetMaxDeg,
      toleranceDeg: primaryJoint.tolerance,
      falloffDeg: def.falloff,
      weight: primaryJoint.weight,
      jointNameTh: preset.labelTh,
      lowAngleHintTh: def.hint,
      holdDurationSec: primaryJoint.holdDurationSec,
      use3DWorld: preset.left.use3DWorld ?? true,
    },
    defaultPrescription: {
      repsPerSet: def.repsPerSet,
      totalSets: def.totalSets,
      restBetweenSetsSec: 30,
      holdDurationSec: primaryJoint.holdDurationSec,
      targetMinDeg: primaryJoint.target,
    },
    compensationRules: [],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บผิดปกติให้หยุดพักทันทีและแจ้งนักกายภาพบำบัด',
      maxSafeAngleCapDeg: MAX_POSE_ANGLE_DEG,
    },
    requiredLandmarks: {
      left: [leftTriplet.pointA, leftTriplet.vertex, leftTriplet.pointB],
      right: [rightTriplet.pointA, rightTriplet.vertex, rightTriplet.pointB],
      bilateral: def.requiredLandmarks,
    },
    minLandmarkVisibility: minVisibilityMap,
    coachingCues: {
      idleMessageTh: `เตรียมพร้อมท่า ${def.name}`,
      movingMessageTh: def.hint || `เคลื่อนไหวไปยังมุมเป้าหมาย ${primaryJoint.target}°`,
      holdingMessageTh: `เยี่ยมมาก ค้างท่าไว้ที่ ~${primaryJoint.target}°`,
      returningMessageTh: 'ค่อยๆ ผ่อนกลับสู่ท่าเริ่มต้น',
      framingMessageTh: 'กรุณาขยับให้กล้องเห็นข้อต่อที่ใช้ฝึกชัดเจน',
      targetKeypoints: def.requiredLandmarks,
    },
  };
}

// ============================================================================
// Step 3: Pure Statistical Calibration Function (Median + MAD/IQR)
// ============================================================================

export function computeCalibration(
  samples: unknown,
  options?: ComputeCalibrationOptions
): CalibrationComputationResult {
  const minFrames =
    typeof options?.minFrames === 'number' && Number.isFinite(options.minFrames) && options.minFrames > 0
      ? Math.floor(options.minFrames)
      : MIN_CALIBRATION_FRAMES;
  const minVisibility =
    typeof options?.minVisibility === 'number' && Number.isFinite(options.minVisibility)
      ? clamp(options.minVisibility, 0, 1)
      : MIN_CALIBRATION_VISIBILITY;

  const originalTarget =
    typeof options?.originalTarget === 'number' && Number.isFinite(options.originalTarget)
      ? options.originalTarget
      : 90;
  const originalTolerance =
    typeof options?.originalTolerance === 'number' && Number.isFinite(options.originalTolerance)
      ? options.originalTolerance
      : DEFAULT_POSE_TOLERANCE_DEG;

  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      ok: false,
      reason: 'insufficient_samples',
      messageTh: `ข้อมูลไม่พอ (ได้ 0/${minFrames} เฟรม) กรุณาให้คนไข้ค้างท่าให้นิ่งและเห็นข้อต่อชัดเจนแล้วลองใหม่`,
      validFrameCount: 0,
      totalFrameCount: 0,
      requiredFrameCount: minFrames,
    };
  }

  const validAngles: number[] = [];

  for (const item of samples) {
    if (item === null || item === undefined) continue;

    let rawAngle: unknown;
    let rawVis: unknown = 1.0;

    if (typeof item === 'number') {
      rawAngle = item;
    } else if (typeof item === 'object' && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      rawAngle = obj.angleDeg;
      rawVis = obj.visibility !== undefined ? obj.visibility : 1.0;
    } else {
      continue;
    }

    const angle = toFiniteNumber(rawAngle);
    const vis = toFiniteNumber(rawVis);
    if (angle === null || vis === null) continue;
    if (angle < MIN_POSE_ANGLE_DEG || angle > MAX_POSE_ANGLE_DEG) continue;
    if (vis < minVisibility) continue;

    validAngles.push(angle);
  }

  if (validAngles.length < minFrames) {
    return {
      ok: false,
      reason: 'insufficient_samples',
      messageTh: `ข้อมูลไม่พอ (ได้ ${validAngles.length}/${minFrames} เฟรมที่เห็นข้อต่อชัด) กรุณาค้างท่าให้นิ่งแล้วลองใหม่`,
      validFrameCount: validAngles.length,
      totalFrameCount: samples.length,
      requiredFrameCount: minFrames,
    };
  }

  const sorted = [...validAngles].sort((a, b) => a - b);
  const medianAngle = computeSortedMedian(sorted);

  // MAD: median(|x_i - median|)
  const absDeviations = sorted.map((x) => Math.abs(x - medianAngle)).sort((a, b) => a - b);
  const rawMad = computeSortedMedian(absDeviations);
  const scaledMad = rawMad * CALIBRATION_MAD_SCALE;

  // IQR for telemetry transparency
  const q1 = computePercentile(sorted, 0.25);
  const q3 = computePercentile(sorted, 0.75);
  const iqrDeg = Math.max(0, q3 - q1);

  const robustSpread = Math.max(scaledMad, iqrDeg * 0.5);
  const rawTolerance = robustSpread * CALIBRATION_TOLERANCE_MULTIPLIER + CALIBRATION_MIN_MARGIN_DEG;
  const clampedTolerance = clamp(
    Math.round(rawTolerance * 10) / 10,
    MIN_CALIBRATED_TOLERANCE_DEG,
    MAX_CALIBRATED_TOLERANCE_DEG
  );

  const roundedTarget = Math.round(medianAngle);
  const roundedTolerance = Math.round(clampedTolerance);
  const jointLabel = options?.jointLabelTh ? `${options.jointLabelTh} ` : '';
  const hint = `ค้างท่า${jointLabel}ที่มุมประมาณ ${roundedTarget}° (เกณฑ์ยอมรับ ±${roundedTolerance}°)`;

  return {
    ok: true,
    proposal: {
      target: roundedTarget,
      tolerance: roundedTolerance,
      madDeg: Math.round(rawMad * 10) / 10,
      iqrDeg: Math.round(iqrDeg * 10) / 10,
      validFrameCount: validAngles.length,
      totalFrameCount: samples.length,
      hint,
      originalTarget,
      originalTolerance,
    },
  };
}

/**
 * Extracts angleDeg and minimum landmark visibility from a single pose frame
 * using the active exercise's configured landmark triplet.
 */
export function extractCalibrationSampleFromLandmarks(
  landmarks: PoseEngineLandmark[] | null | undefined,
  config: ExerciseDetectionConfig | null | undefined,
  sideOverride?: BodySide | string | null
): CalibrationFrameSample | null {
  if (!landmarks || landmarks.length === 0 || !config?.angleMechanics?.landmarks) {
    return null;
  }

  const rawSide = String(sideOverride ?? config.side ?? DEFAULT_POSE_SIDE).toLowerCase().trim();
  const candidates: LandmarkTriplet[] =
    rawSide === 'left'
      ? [config.angleMechanics.landmarks.left]
      : rawSide === 'right'
        ? [config.angleMechanics.landmarks.right]
        : [config.angleMechanics.landmarks.left, config.angleMechanics.landmarks.right];

  let bestSample: CalibrationFrameSample | null = null;

  for (const triplet of candidates) {
    const lmA = landmarks[triplet.pointA];
    const lmV = landmarks[triplet.vertex];
    const lmB = landmarks[triplet.pointB];
    if (!lmA || !lmV || !lmB) continue;

    const minVis = Math.min(
      lmA.visibility ?? 1.0,
      lmV.visibility ?? 1.0,
      lmB.visibility ?? 1.0
    );
    const use3D = Boolean(triplet.use3DWorld ?? config.angleMechanics.use3DWorld ?? config.use3DWorld);
    const angle = use3D ? calculateAngle3D(lmA, lmV, lmB) : calculateAngle2D(lmA, lmV, lmB);

    if (!Number.isFinite(angle)) continue;
    if (!bestSample || minVis > (bestSample.visibility ?? 0)) {
      bestSample = {
        angleDeg: angle,
        visibility: minVis,
        timestampMs: Date.now(),
      };
    }
  }

  return bestSample;
}

// ============================================================================
// Step 4: Apply Calibration to Exercise Config (Never Changes Side / Rep Rules)
// ============================================================================

export function applyCalibrationToConfig(
  baseConfig: ExerciseDetectionConfig,
  calibration?: PatientPoseCalibrationRecord | null
): ExerciseDetectionConfig {
  if (!calibration || !baseConfig.angleMechanics) {
    return baseConfig;
  }

  const calTarget = toFiniteNumber(calibration.targetAngleDeg);
  const calTol = toFiniteNumber(calibration.toleranceDeg);
  if (
    calTarget === null ||
    calTarget < MIN_POSE_ANGLE_DEG ||
    calTarget > MAX_POSE_ANGLE_DEG ||
    calTol === null ||
    calTol <= 0
  ) {
    return baseConfig;
  }

  const direction = baseConfig.angleMechanics.direction ?? 'increase';
  const origMin = baseConfig.angleMechanics.targetMinDeg;
  const origMax = baseConfig.angleMechanics.targetMaxDeg;

  const newTargetMinDeg =
    direction === 'decrease'
      ? Math.max(MIN_POSE_ANGLE_DEG, Math.min(origMin, calTarget - calTol))
      : calTarget;
  const newTargetMaxDeg =
    direction === 'decrease'
      ? calTarget
      : Math.max(calTarget, origMax);

  return {
    ...baseConfig,
    // Keep base side, evaluationMode, lateralityMode untouched
    targetMinDegOverride: calTarget,
    angleMechanics: {
      ...baseConfig.angleMechanics,
      targetMinDeg: newTargetMinDeg,
      targetMaxDeg: newTargetMaxDeg,
      toleranceDeg: calTol,
      lowAngleHintTh: calibration.hintTh || baseConfig.angleMechanics.lowAngleHintTh,
    },
    defaultPrescription: {
      ...baseConfig.defaultPrescription,
      targetMinDeg: calTarget,
    },
  };
}

// ============================================================================
// Step 5: Safe Storage Layer (Corrupted JSON Resilient, Never Throws)
// ============================================================================

function safeReadJsonArray(storage: StorageLike | null, key: string): unknown[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadCustomPosesFromStorage(
  storage?: StorageLike | null
): ValidatedPoseDefinition[] {
  const store = resolveDefaultStorage(storage);
  const rawList = safeReadJsonArray(store, DRTECH_CUSTOM_POSES_STORAGE_KEY);
  const validPoses: ValidatedPoseDefinition[] = [];
  const seenIds = new Set<string>();

  for (const item of rawList) {
    const res = validatePoseDefinition(item, { existingIds: seenIds });
    if (res.ok) {
      seenIds.add(res.value.id);
      validPoses.push(res.value);
    }
  }

  return validPoses;
}

export function saveCustomPoseToStorage(
  input: unknown,
  options?: {
    builtInIds?: Iterable<string>;
    storage?: StorageLike | null;
  }
): PoseValidationResult {
  const store = resolveDefaultStorage(options?.storage);
  const currentCustom = loadCustomPosesFromStorage(store);
  const existingIds = new Set<string>([
    ...(options?.builtInIds ? Array.from(options.builtInIds) : []),
    ...currentCustom.map((p) => p.id),
  ]);

  const validation = validatePoseDefinition(input, { existingIds });
  if (!validation.ok) {
    return validation;
  }

  if (store) {
    try {
      const updated = [...currentCustom, validation.value];
      store.setItem(DRTECH_CUSTOM_POSES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      return {
        ok: false,
        errors: [{ field: 'storage', message: 'ไม่สามารถบันทึกข้อมูลท่าลงในเครื่องได้' }],
      };
    }
  }

  return validation;
}

export function getCustomPoseConfigs(storage?: StorageLike | null): ExerciseDetectionConfig[] {
  return loadCustomPosesFromStorage(storage).map(poseDefinitionToExerciseConfig);
}

function isValidCalibrationRecord(item: unknown): item is PatientPoseCalibrationRecord {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const r = item as Record<string, unknown>;
  const target = toFiniteNumber(r.targetAngleDeg);
  const tol = toFiniteNumber(r.toleranceDeg);
  return (
    typeof r.patientId === 'string' &&
    r.patientId.trim().length > 0 &&
    typeof r.poseId === 'string' &&
    r.poseId.trim().length > 0 &&
    target !== null &&
    target >= MIN_POSE_ANGLE_DEG &&
    target <= MAX_POSE_ANGLE_DEG &&
    tol !== null &&
    tol > 0
  );
}

export function loadAllPatientCalibrations(
  storage?: StorageLike | null
): PatientPoseCalibrationRecord[] {
  const store = resolveDefaultStorage(storage);
  const rawList = safeReadJsonArray(store, DRTECH_PATIENT_CALIBRATIONS_STORAGE_KEY);
  const validRecords: PatientPoseCalibrationRecord[] = [];
  for (const item of rawList) {
    if (isValidCalibrationRecord(item)) {
      validRecords.push(item);
    }
  }
  return validRecords;
}

export function getPatientCalibration(
  patientId: string | null | undefined,
  poseId: string | null | undefined,
  storage?: StorageLike | null
): PatientPoseCalibrationRecord | null {
  const pid = (patientId || '').trim() || 'guest-kiosk';
  const xid = (poseId || '').trim().toLowerCase();
  if (!xid) return null;

  const all = loadAllPatientCalibrations(storage);
  return (
    all.find((r) => r.patientId === pid && r.poseId.toLowerCase() === xid) ?? null
  );
}

export function savePatientCalibration(
  record: PatientPoseCalibrationRecord,
  storage?: StorageLike | null
): boolean {
  const normalized: PatientPoseCalibrationRecord = {
    ...record,
    patientId: (record.patientId || '').trim() || 'guest-kiosk',
    poseId: (record.poseId || '').trim().toLowerCase(),
    calibratedAt: record.calibratedAt || new Date().toISOString(),
    calibratedBy: (record.calibratedBy || '').trim() || 'Physical Therapist',
  };

  if (!isValidCalibrationRecord(normalized)) {
    return false;
  }

  const store = resolveDefaultStorage(storage);
  if (!store) return false;

  try {
    const existing = loadAllPatientCalibrations(store).filter(
      (r) => !(r.patientId === normalized.patientId && r.poseId.toLowerCase() === normalized.poseId)
    );
    existing.push(normalized);
    store.setItem(DRTECH_PATIENT_CALIBRATIONS_STORAGE_KEY, JSON.stringify(existing));
    return true;
  } catch {
    return false;
  }
}

export function resetPatientCalibration(
  patientId: string | null | undefined,
  poseId: string | null | undefined,
  storage?: StorageLike | null
): boolean {
  const pid = (patientId || '').trim() || 'guest-kiosk';
  const xid = (poseId || '').trim().toLowerCase();
  if (!xid) return false;

  const store = resolveDefaultStorage(storage);
  if (!store) return false;

  try {
    const existing = loadAllPatientCalibrations(store);
    const filtered = existing.filter(
      (r) => !(r.patientId === pid && r.poseId.toLowerCase() === xid)
    );
    store.setItem(DRTECH_PATIENT_CALIBRATIONS_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

