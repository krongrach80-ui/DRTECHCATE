/**
 * packages/pose-engine/src/__tests__/part4_schema_and_calibration.test.ts
 *
 * Unit tests for Part 4:
 * 1. Pose schema validation (validatePoseDefinition)
 * 2. Pure robust statistical calibration (computeCalibration: median + MAD/IQR)
 * 3. Applying & resetting per-patient calibration without altering side/rep rules
 * 4. Custom pose execution in RepStateMachine & resilient storage JSON parsing
 */

import { describe, it, expect } from 'vitest';
import {
  CALIBRATION_DURATION_MS,
  DEFAULT_FALLOFF_DEG,
  DEFAULT_PHASE_ENTER_RATIO,
  DEFAULT_PHASE_EXIT_RATIO,
  DEFAULT_POSE_SIDE,
  DEFAULT_POSE_TOLERANCE_DEG,
  DRTECH_CUSTOM_POSES_STORAGE_KEY,
  DRTECH_PATIENT_CALIBRATIONS_STORAGE_KEY,
  MAX_CALIBRATED_TOLERANCE_DEG,
  MIN_CALIBRATED_TOLERANCE_DEG,
  MIN_CALIBRATION_FRAMES,
  MIN_CALIBRATION_VISIBILITY,
  StorageLike,
  applyCalibrationToConfig,
  computeCalibration,
  getPatientCalibration,
  loadAllPatientCalibrations,
  loadCustomPosesFromStorage,
  poseDefinitionToExerciseConfig,
  resetPatientCalibration,
  saveCustomPoseToStorage,
  savePatientCalibration,
  validatePoseDefinition,
} from '../calibration/poseSchemaAndCalibration';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { RepStateMachine } from '../engine/repStateMachine';
import { calcPoseAccuracy } from '../math/sessionProgressAndAccuracy';
import type { PoseEngineLandmark } from '../types/exerciseConfig';

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

function buildShouldersAtAngle(angleDeg: number, visibility: number = 0.95): PoseEngineLandmark[] {
  const lms: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
  }));

  // Head & Torso upright inside ROI [0.1, 0.9]
  lms[0] = { x: 0.5, y: 0.2, z: 0, visibility: 0.95 };
  lms[11] = { x: 0.42, y: 0.35, z: 0, visibility }; // Left shoulder vertex
  lms[12] = { x: 0.58, y: 0.35, z: 0, visibility }; // Right shoulder vertex
  lms[23] = { x: 0.44, y: 0.65, z: 0, visibility }; // Left hip (down vector from shoulder = +y)
  lms[24] = { x: 0.56, y: 0.65, z: 0, visibility }; // Right hip

  // Vector shoulder->hip is (0, +0.3). Rotate arm vector by angleDeg from downward vertical:
  const rad = (angleDeg * Math.PI) / 180;
  const armLen = 0.25;
  // Left arm extends to left (-x), downward (+y * cos) / upward (-y * cos)
  lms[13] = {
    x: lms[11].x - Math.sin(rad) * armLen,
    y: lms[11].y + Math.cos(rad) * armLen,
    z: 0,
    visibility,
  };
  lms[15] = {
    x: lms[11].x - Math.sin(rad) * (armLen * 1.8),
    y: lms[11].y + Math.cos(rad) * (armLen * 1.8),
    z: 0,
    visibility,
  };

  // Right arm mirrored symmetrically (+x)
  lms[14] = {
    x: lms[12].x + Math.sin(rad) * armLen,
    y: lms[12].y + Math.cos(rad) * armLen,
    z: 0,
    visibility,
  };
  lms[16] = {
    x: lms[12].x + Math.sin(rad) * (armLen * 1.8),
    y: lms[12].y + Math.cos(rad) * (armLen * 1.8),
    z: 0,
    visibility,
  };

  return lms;
}

describe('Part 4: Pose Schema Validation, Robust Calibration, Custom Poses & Storage', () => {
  describe('1. validatePoseDefinition', () => {
    it('passes a valid pose and applies named constant defaults (side="both")', () => {
      const result = validatePoseDefinition({
        id: 'custom-shoulder-90',
        name: 'ยกแขนข้างระดับไหล่ 90 องศา',
        joints: [{ jointType: 'shoulder', target: 90 }],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('custom-shoulder-90');
        expect(result.value.side).toBe(DEFAULT_POSE_SIDE);
        expect(result.value.side).toBe('both');
        expect(result.value.falloff).toBe(DEFAULT_FALLOFF_DEG);
        expect(result.value.phaseThresholds).toEqual({
          enter: DEFAULT_PHASE_ENTER_RATIO,
          exit: DEFAULT_PHASE_EXIT_RATIO,
        });
        expect(result.value.joints).toHaveLength(1);
        expect(result.value.joints[0].tolerance).toBe(DEFAULT_POSE_TOLERANCE_DEG);
        expect(result.value.requiredLandmarks.length).toBeGreaterThan(0);
      }
    });

    it('rejects duplicate id with a Thai error targeting the id field', () => {
      const result = validatePoseDefinition(
        {
          id: 'shoulder-abduction',
          name: 'ท่าซ้ำ',
          joints: [{ jointType: 'shoulder', target: 90 }],
        },
        { existingIds: ['shoulder-abduction', 'active-shoulder-flexion'] }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.field === 'id')).toBe(true);
      }
    });

    it('rejects target angles outside [0, 180]', () => {
      const tooHigh = validatePoseDefinition({
        id: 'too-high',
        name: 'มุมเกิน',
        joints: [{ jointType: 'shoulder', target: 195 }],
      });
      expect(tooHigh.ok).toBe(false);
      if (!tooHigh.ok) {
        expect(tooHigh.errors.some((e) => e.field === 'joints[0].target')).toBe(true);
      }

      const negative = validatePoseDefinition({
        id: 'too-low',
        name: 'มุมติดลบ',
        joints: [{ jointType: 'shoulder', target: -5 }],
      });
      expect(negative.ok).toBe(false);
      if (!negative.ok) {
        expect(negative.errors.some((e) => e.field === 'joints[0].target')).toBe(true);
      }
    });

    it('rejects tolerance <= 0 and falloff <= 0', () => {
      const zeroTol = validatePoseDefinition({
        id: 'zero-tol',
        name: 'tolerance ศูนย์',
        joints: [{ jointType: 'elbow', target: 60, tolerance: 0 }],
      });
      expect(zeroTol.ok).toBe(false);
      if (!zeroTol.ok) {
        expect(zeroTol.errors.some((e) => e.field === 'joints[0].tolerance')).toBe(true);
      }

      const negativeTolAndFalloff = validatePoseDefinition({
        id: 'neg-tol',
        name: 'ค่าติดลบ',
        falloff: -10,
        joints: [{ jointType: 'elbow', target: 60, tolerance: -3 }],
      });
      expect(negativeTolAndFalloff.ok).toBe(false);
      if (!negativeTolAndFalloff.ok) {
        expect(negativeTolAndFalloff.errors.some((e) => e.field === 'joints[0].tolerance')).toBe(true);
        expect(negativeTolAndFalloff.errors.some((e) => e.field === 'falloff')).toBe(true);
      }
    });

    it('rejects empty joints and invalid side without throwing', () => {
      const res = validatePoseDefinition({
        id: 'bad-pose',
        name: 'ท่าไม่มีข้อต่อ',
        side: 'center',
        joints: [],
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.field === 'side')).toBe(true);
        expect(res.errors.some((e) => e.field === 'joints')).toBe(true);
      }

      expect(validatePoseDefinition(null).ok).toBe(false);
    });
  });

  describe('2. computeCalibration (Pure Robust Statistics)', () => {
    it('computes exact median target and bounded tolerance on normal samples', () => {
      const samples = Array.from({ length: 30 }, (_, i) => ({
        angleDeg: 95 + (i % 5) - 2, // 93..97, median = 95
        visibility: 0.92,
      }));

      const res = computeCalibration(samples, {
        originalTarget: 120,
        originalTolerance: 10,
        jointLabelTh: 'ข้อไหล่',
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.proposal.target).toBe(95);
        expect(res.proposal.tolerance).toBeGreaterThanOrEqual(MIN_CALIBRATED_TOLERANCE_DEG);
        expect(res.proposal.tolerance).toBeLessThanOrEqual(MAX_CALIBRATED_TOLERANCE_DEG);
        expect(res.proposal.validFrameCount).toBe(30);
        expect(res.proposal.hint).toContain('95°');
      }
    });

    it('keeps median within ±2° of 120° despite 10% extreme outlier frames (Acceptance Criterion)', () => {
      // 90 frames at 120° + 10 outlier frames (10%): extreme drops/spikes like 5° or 180°
      const normalFrames = Array.from({ length: 90 }, () => ({
        angleDeg: 120,
        visibility: 0.95,
      }));
      const outlierFrames = Array.from({ length: 10 }, (_, idx) => ({
        angleDeg: idx % 2 === 0 ? 5 : 180,
        visibility: 0.95,
      }));

      const res = computeCalibration([...normalFrames, ...outlierFrames]);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(Math.abs(res.proposal.target - 120)).toBeLessThanOrEqual(2);
        expect(res.proposal.target).toBe(120);
      }
    });

    it('never throws on empty samples or below MIN_CALIBRATION_FRAMES and returns "ข้อมูลไม่พอ"', () => {
      const emptyRes = computeCalibration([]);
      expect(emptyRes.ok).toBe(false);
      if (!emptyRes.ok) {
        expect(emptyRes.reason).toBe('insufficient_samples');
        expect(emptyRes.messageTh).toContain('ข้อมูลไม่พอ');
      }

      const nullRes = computeCalibration(null);
      expect(nullRes.ok).toBe(false);

      const fewValid = Array.from({ length: MIN_CALIBRATION_FRAMES - 1 }, () => ({
        angleDeg: 100,
        visibility: 0.9,
      }));
      const tooFewRes = computeCalibration(fewValid);
      expect(tooFewRes.ok).toBe(false);
      if (!tooFewRes.ok) {
        expect(tooFewRes.validFrameCount).toBe(MIN_CALIBRATION_FRAMES - 1);
      }
    });

    it('skips null, NaN, Infinity, and low-visibility samples without returning NaN', () => {
      const mixedSamples = [
        null,
        undefined,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        { angleDeg: Number.NaN, visibility: 0.99 },
        { angleDeg: 20, visibility: MIN_CALIBRATION_VISIBILITY - 0.2 }, // low visibility skipped
        ...Array.from({ length: 20 }, () => ({ angleDeg: 108, visibility: 0.85 })),
      ];

      const res = computeCalibration(mixedSamples);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(Number.isFinite(res.proposal.target)).toBe(true);
        expect(Number.isFinite(res.proposal.tolerance)).toBe(true);
        expect(res.proposal.target).toBe(108);
        expect(res.proposal.validFrameCount).toBe(20);
      }
    });
  });

  describe('3. Applying Calibration, Resetting & Rep Counting on Custom Pose', () => {
    it('uses calibrated target/tolerance when confirmed, preserves side, and restores defaults on reset', () => {
      const storage = createMemoryStorage();
      const baseConfig = CLINICAL_EXERCISES_CONFIG['shoulder-abduction'];

      // Without calibration -> unchanged original reference
      const uncalibrated = applyCalibrationToConfig(
        baseConfig,
        getPatientCalibration('patient-1', 'shoulder-abduction', storage)
      );
      expect(uncalibrated.angleMechanics?.targetMinDeg).toBe(baseConfig.angleMechanics?.targetMinDeg);
      expect(uncalibrated.angleMechanics?.toleranceDeg).toBe(baseConfig.angleMechanics?.toleranceDeg);
      expect(uncalibrated.side).toBe(baseConfig.side);

      // Save confirmed calibration for patient-1
      const saved = savePatientCalibration(
        {
          patientId: 'patient-1',
          poseId: 'shoulder-abduction',
          targetAngleDeg: 112,
          toleranceDeg: 7,
          madDeg: 1.5,
          iqrDeg: 2.0,
          validFrameCount: 60,
          hintTh: 'ค้างท่าที่มุมประมาณ 112°',
          calibratedAt: '2026-11-13T10:00:00Z',
          calibratedBy: 'PT Somchai',
        },
        storage
      );
      expect(saved).toBe(true);

      const calRecord = getPatientCalibration('patient-1', 'shoulder-abduction', storage);
      const calibratedCfg = applyCalibrationToConfig(baseConfig, calRecord);

      expect(calibratedCfg.angleMechanics?.targetMinDeg).toBe(112);
      expect(calibratedCfg.angleMechanics?.toleranceDeg).toBe(7);
      expect(calibratedCfg.side).toBe(baseConfig.side); // Side must NOT change
      expect(calibratedCfg.evaluationMode).toBe(baseConfig.evaluationMode);

      // Built-in catalog config was never overwritten
      expect(CLINICAL_EXERCISES_CONFIG['shoulder-abduction'].angleMechanics?.targetMinDeg).toBe(80);

      // Other patients still get original defaults
      expect(getPatientCalibration('patient-2', 'shoulder-abduction', storage)).toBeNull();

      // Reset calibration -> restores defaults
      resetPatientCalibration('patient-1', 'shoulder-abduction', storage);
      const afterReset = applyCalibrationToConfig(
        baseConfig,
        getPatientCalibration('patient-1', 'shoulder-abduction', storage)
      );
      expect(afterReset.angleMechanics?.targetMinDeg).toBe(80);
      expect(afterReset.angleMechanics?.toleranceDeg).toBe(10);
    });

    it('adds a custom pose via schema/storage and counts a full rep in RepStateMachine', () => {
      const storage = createMemoryStorage();
      const saveRes = saveCustomPoseToStorage(
        {
          id: 'custom-abduction-75',
          name: 'กางแขนมุมเบา 75 องศา',
          side: 'both',
          falloff: 25,
          joints: [{ jointType: 'shoulder', target: 75, tolerance: 10, holdDurationSec: 0.4 }],
          hint: 'กางแขนเบาๆ ถึง 75 องศา',
        },
        {
          builtInIds: Object.keys(CLINICAL_EXERCISES_CONFIG),
          storage,
        }
      );

      expect(saveRes.ok).toBe(true);
      const loaded = loadCustomPosesFromStorage(storage);
      expect(loaded).toHaveLength(1);

      const customCfg = poseDefinitionToExerciseConfig(loaded[0]);
      const machine = new RepStateMachine(customCfg);

      let t = 1000;
      const stepMs = 40;
      let latest = machine.evaluateFrame(buildShouldersAtAngle(20), buildShouldersAtAngle(20), t);

      // Clear optional pre-check if active
      for (let i = 0; i < 35; i++) {
        t += stepMs;
        const lms = buildShouldersAtAngle(20);
        latest = machine.evaluateFrame(lms, lms, t);
      }

      // Move up smoothly to calibrated custom target 75° and hold > 0.4s
      for (let ang = 25; ang <= 78; ang += 6) {
        t += stepMs;
        const lms = buildShouldersAtAngle(ang);
        latest = machine.evaluateFrame(lms, lms, t);
      }
      for (let i = 0; i < 16; i++) {
        t += stepMs;
        const lms = buildShouldersAtAngle(78);
        latest = machine.evaluateFrame(lms, lms, t);
      }

      // Check live accuracy at target 78° (within 75° ± 10° -> 100%)
      const accAtTarget = calcPoseAccuracy(buildShouldersAtAngle(78), customCfg, 'both');
      expect(accAtTarget.score).toBe(100);

      // Return back down to rest position (20°)
      for (let ang = 70; ang >= 20; ang -= 8) {
        t += stepMs;
        const lms = buildShouldersAtAngle(ang);
        latest = machine.evaluateFrame(lms, lms, t);
      }
      for (let i = 0; i < 4; i++) {
        t += stepMs;
        const lms = buildShouldersAtAngle(20);
        latest = machine.evaluateFrame(lms, lms, t);
      }

      expect(latest.completedReps).toBe(1);
    });
  });

  describe('4. Resilient Storage Reading', () => {
    it('does not throw on corrupted JSON in storage and falls back safely to defaults', () => {
      const brokenStorage = createMemoryStorage({
        [DRTECH_CUSTOM_POSES_STORAGE_KEY]: '{invalid-json[',
        [DRTECH_PATIENT_CALIBRATIONS_STORAGE_KEY]: 'not-valid-json!!!',
      });

      expect(() => loadCustomPosesFromStorage(brokenStorage)).not.toThrow();
      expect(loadCustomPosesFromStorage(brokenStorage)).toEqual([]);

      expect(() => loadAllPatientCalibrations(brokenStorage)).not.toThrow();
      expect(loadAllPatientCalibrations(brokenStorage)).toEqual([]);

      const cal = getPatientCalibration('patient-1', 'shoulder-abduction', brokenStorage);
      expect(cal).toBeNull();

      const fallbackCfg = applyCalibrationToConfig(CLINICAL_EXERCISES_CONFIG['shoulder-abduction'], cal);
      expect(fallbackCfg.angleMechanics?.targetMinDeg).toBe(80);
      expect(CALIBRATION_DURATION_MS).toBe(3000);
    });
  });
});

