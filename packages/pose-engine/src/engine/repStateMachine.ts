/**
 * packages/pose-engine/src/engine/repStateMachine.ts
 *
 * DETERMINISTIC CLINICAL REP STATE MACHINE & FEEDBACK GENERATOR
 * Handles:
 * 1. 'angle_rep_hold': IDLE -> MOVING_TO_TARGET -> HOLDING_TARGET -> RETURNING_TO_START -> +1 Rep
 *    Supports both direction: 'increase' (Flexion/Abduction/Stand) and 'decrease' (Elbow Flexion/Wall Push-up)
 * 2. 'pendulum_circular': Delegates to ShoulderPendulumAnalyzer with 360° phase unwrapping
 * 3. 'neck_tilt': Evaluates lateral neck tilt between ears (7, 8) and shoulder line (11, 12)
 * 4. 'heel_raise': Evaluates vertical heel elevation normalized by lower leg scale
 * 5. Framing and anatomical visibility gates (visibility > 0.50) with trilingual prompts (TH / EN / CN)
 * 6. 350ms rep debounce to prevent jitter / oscillation double-counting
 * 7. Smooth real-time accuracy percentage (0%–100%) during motion.
 */

import {
  ExerciseDetectionConfig,
  PoseEngineLandmark,
  RepEvaluationResult,
  RepPhase,
  ActiveCompensationWarning,
  BodySide,
} from '../types/exerciseConfig';
import { calculateAngle3D, calculateAngle2D, normalizeLandmarksDepth } from '../math/geometry3d';
import { PoseSkeletonFilter } from '../math/filters';
import { ShoulderPendulumAnalyzer } from '../math/pendulumAnalyzer';
import { CompensationDetector } from '../compensation';
import { ForegroundSubjectLocker, SubjectLockResult } from '../subjectLock';

export interface LandmarkVisibilityPolicy {
  shoulderMinVis: number; // 0.45 (จุดหลักที่ต้องเห็นในโหมดครึ่งตัว)
  elbowMinVis: number; // 0.40 (ถ้าไม่เห็น ใช้ Upper-Body Shoulder/Torso Fallback)
  wristMinVis: number; // 0.35 (ถ้าไม่เห็น ใช้ Elbow หรือ Shoulder Fallback)
  hipMinVis: number; // 0.30 (ถ้าไม่เห็นในท่านั่งโต๊ะ คำนวณแกนลำตัวจากกึ่งกลางไหล่เทียบแนวดิ่ง)
}

export const DEFAULT_LANDMARK_VISIBILITY_POLICY: LandmarkVisibilityPolicy = {
  shoulderMinVis: 0.45,
  elbowMinVis: 0.40,
  wristMinVis: 0.35,
  hipMinVis: 0.30,
};

export function isLandmarkUsable(
  lm: PoseEngineLandmark | undefined,
  minVis: number
): boolean {
  if (!lm) return false;
  // ตัดจุดที่หลุดขอบจอออกไปก่อนคำนวณ
  if (lm.x < 0.01 || lm.x > 0.99 || lm.y < 0.01 || lm.y > 0.99) return false;
  const vis = lm.visibility !== undefined ? lm.visibility : 1.0;
  return vis >= minVis;
}

export class RepStateMachine {
  private config: ExerciseDetectionConfig;
  private phase: RepPhase = 'IDLE';
  private skeletonFilter: PoseSkeletonFilter;
  private pendulumAnalyzer: ShoulderPendulumAnalyzer;
  private compensationDetector: CompensationDetector;
  private subjectLocker: ForegroundSubjectLocker;

  private completedReps: number = 0;
  private incorrectReps: number = 0;
  private currentSet: number = 1;
  private holdStartTimeMs: number | null = null;
  private holdPauseStartMs: number | null = null;
  private totalHoldPausedDurationMs: number = 0;
  private lastEvaluationResult: RepEvaluationResult | null = null;
  private maxAngleAchievedDeg: number = 0;
  private recordedAnglesSum: number = 0;
  private recordedAnglesCount: number = 0;
  private isSetCompleted: boolean = false;
  private isExerciseCompleted: boolean = false;
  private lastRepCompletedTimeMs: number = 0;
  private baselineHeelY: number | null = null;
  private baselineHipY: number | null = null;
  private timerStartTimeMs: number | null = null;
  private balanceHoldStartTimeMs: number | null = null;
  private balanceHoldAccumulatedMs: number = 0;

  constructor(config: ExerciseDetectionConfig) {
    this.config = config;
    this.skeletonFilter = new PoseSkeletonFilter(1.2, 0.04);
    this.pendulumAnalyzer = new ShoulderPendulumAnalyzer(config.pendulumMechanics);
    const maxSafeVelocity = config.safetyContraindications?.maxSafeVelocityDegPerSec;
    this.compensationDetector = new CompensationDetector(config.compensationRules, maxSafeVelocity);
    const isUpper = config.framing !== 'full_body' && config.framing !== 'lower_body';
    this.subjectLocker = new ForegroundSubjectLocker({
      primaryKeypointIndices: isUpper ? [11, 12, 13, 14] : [11, 12, 13, 14, 15, 16, 23, 24],
      minKeypointVisibility: isUpper ? 0.45 : 0.65,
    });
  }

  public updateConfig(config: ExerciseDetectionConfig): void {
    this.config = config;
    if (config.pendulumMechanics) {
      this.pendulumAnalyzer = new ShoulderPendulumAnalyzer(config.pendulumMechanics);
    }
    const maxSafeVelocity = config.safetyContraindications?.maxSafeVelocityDegPerSec;
    this.compensationDetector.setMaxSafeVelocity(maxSafeVelocity);
    this.compensationDetector.setRules(config.compensationRules);
    const isUpper = config.framing !== 'full_body' && config.framing !== 'lower_body';
    this.subjectLocker = new ForegroundSubjectLocker({
      primaryKeypointIndices: isUpper ? [11, 12, 13, 14] : [11, 12, 13, 14, 15, 16, 23, 24],
      minKeypointVisibility: isUpper ? 0.45 : 0.65,
    });
  }

  public setSide(side: BodySide): void {
    this.config = { ...this.config, side };
    this.reset();
  }

  public evaluateFrame(
    normLandmarks: PoseEngineLandmark[],
    _worldLandmarks?: PoseEngineLandmark[],
    timestampMs: number = Date.now()
  ): RepEvaluationResult {
    return this.evaluate(normLandmarks, timestampMs);
  }

  public evaluate(
    rawLandmarks: PoseEngineLandmark[],
    timestampMs: number = Date.now()
  ): RepEvaluationResult {
    // 0. Anti-hijack & foreground subject lock evaluation
    const lockResult = this.subjectLocker.processFrame(rawLandmarks, timestampMs);

    if (lockResult.isFrameDropped && this.lastEvaluationResult) {
      return {
        ...this.lastEvaluationResult,
        isFrameDropped: true,
        frameDropReason: lockResult.frameDropReason,
      };
    }

    // 1. Filter raw landmarks using 1€ filter
    const filteredLandmarks = this.skeletonFilter.filterSkeleton(rawLandmarks, timestampMs);

    // 2. Framing & anatomical visibility readiness check
    const framingCheck = this.checkFramingReadiness(filteredLandmarks);
    if (framingCheck) {
      this.lastEvaluationResult = framingCheck;
      return framingCheck;
    }

    // 3. Branch based on evaluationMode
    let result: RepEvaluationResult;
    if (this.config.evaluationMode === 'pendulum_circular') {
      result = this.evaluatePendulumCircular(filteredLandmarks, timestampMs, lockResult);
    } else if (this.config.evaluationMode === 'timer' || this.config.mode === 'timer') {
      result = this.evaluateTimerMode(filteredLandmarks, timestampMs, lockResult);
    } else if (this.config.evaluationMode === 'hold_balance') {
      result = this.evaluateHoldBalance(filteredLandmarks, timestampMs, lockResult);
    } else if (this.config.evaluationMode === 'neck_tilt') {
      result = this.evaluateNeckTilt(filteredLandmarks, timestampMs, lockResult);
    } else if (this.config.evaluationMode === 'heel_raise') {
      result = this.evaluateHeelRaise(filteredLandmarks, timestampMs, lockResult);
    } else {
      result = this.evaluateAngleRepHold(filteredLandmarks, timestampMs, lockResult);
    }

    this.lastEvaluationResult = result;
    return result;
  }

  /**
   * Anatomical Framing & Visibility Gate
   */
  private checkFramingReadiness(landmarks: PoseEngineLandmark[]): RepEvaluationResult | null {
    const framing = this.config.framing;
    if (!framing || landmarks.length === 0) return null;

    // Never block with framing check if user is in timer mode
    if (this.config.mode === 'timer' || this.config.evaluationMode === 'timer') {
      return null;
    }

    // Never block with framing check if user is actively in middle of a rep or has completed reps
    if (
      this.completedReps > 0 ||
      this.phase === 'MOVING_TO_TARGET' ||
      this.phase === 'HOLDING_TARGET' ||
      this.phase === 'RETURNING_TO_START'
    ) {
      return null;
    }

    const isInFrame = (lm?: PoseEngineLandmark) =>
      Boolean(lm && lm.x >= 0.02 && lm.x <= 0.98 && lm.y >= 0.02 && lm.y <= 0.98);
    const isVisible = (lm?: PoseEngineLandmark) =>
      Boolean(lm && (lm.visibility ?? 1.0) >= 0.35 && isInFrame(lm));

    const isFull = framing === 'full' || framing === 'full_body' || framing === 'lower_body';
    const isHeadShoulders = framing === 'head_shoulders';
    const isUpper = framing === 'upper' || framing === 'upper_body';

    if (isFull) {
      // Lower body requires hips (23, 24), knees (25, 26), ankles (27, 28) with visibility >= 0.50
      const isLowerVisible = (lm?: PoseEngineLandmark) =>
        Boolean(lm && (lm.visibility ?? 1.0) >= 0.50 && isInFrame(lm));
      const hasLeftLower = isLowerVisible(landmarks[23]) && isLowerVisible(landmarks[25]) && isLowerVisible(landmarks[27]);
      const hasRightLower = isLowerVisible(landmarks[24]) && isLowerVisible(landmarks[26]) && isLowerVisible(landmarks[28]);

      if (!hasLeftLower && !hasRightLower) {
        const def = this.createDefaultResult(
          landmarks,
          '📷 กรุณาถอยห่างจากกล้องให้เห็นเต็มตัว'
        );
        def.coachingMessageEn = '📷 Please step back to show your full body';
        def.coachingMessageCn = '📷 请后退以展示全身';
        def.readinessStatus = 'missing_lower_body';
        def.formRating = 'warning';
        return def;
      }
    } else if (isHeadShoulders) {
      const hasLeftHead = isVisible(landmarks[7]) && isVisible(landmarks[11]);
      const hasRightHead = isVisible(landmarks[8]) && isVisible(landmarks[12]);

      if (!hasLeftHead && !hasRightHead) {
        const def = this.createDefaultResult(
          landmarks,
          '📷 กรุณาปรับมุมกล้องให้เห็นศีรษะ ใบหู และหัวไหล่ทั้งสองข้างชัดเจน'
        );
        def.coachingMessageEn = '📷 Head and shoulders required. Please adjust camera to show ears and shoulders clearly.';
        def.coachingMessageCn = '📷 请调整摄像头，确保头部、双耳及双肩清晰可见。';
        def.readinessStatus = 'missing_head_shoulders';
        def.formRating = 'warning';
        return def;
      }
    } else if (isUpper && this.config.evaluationMode !== 'pendulum_circular') {
      const hasShoulder = isVisible(landmarks[11]) || isVisible(landmarks[12]);
      if (!hasShoulder) {
        const def = this.createDefaultResult(
          landmarks,
          '📷 ปรับตำแหน่งให้เห็นไหล่สองข้างและแขน'
        );
        def.coachingMessageEn = '📷 Please adjust position to show both shoulders and arms';
        def.coachingMessageCn = '📷 请调整位置以清晰展示双肩与双臂';
        def.readinessStatus = 'missing_shoulder';
        def.formRating = 'warning';
        return def;
      }
    }

    return null;
  }

  /**
   * Evaluates standard angle-based hold exercise (Supports both increase & decrease directions)
   */
  private evaluateAngleRepHold(
    landmarks: PoseEngineLandmark[],
    timestampMs: number,
    lockResult?: SubjectLockResult
  ): RepEvaluationResult {
    const angleCfg = this.config.angleMechanics;
    const targetReps = this.config.defaultPrescription?.repsPerSet || 10;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;

    if (!angleCfg) {
      return this.createDefaultResult(landmarks, 'ยังไม่ได้กำหนดค่ามุมสำหรับท่านี้');
    }

    // Normalize landmarks for monocular depth invariance
    const normalizedLandmarks = normalizeLandmarksDepth(landmarks);

    // Resolve side triplet (supporting bilateral auto-selection)
    let triplet =
      this.config.side === 'left' ? angleCfg.landmarks.left : angleCfg.landmarks.right;

    if (this.config.side === 'bilateral') {
      const leftConf =
        (normalizedLandmarks[angleCfg.landmarks.left.vertex]?.visibility ?? 0) +
        (normalizedLandmarks[angleCfg.landmarks.left.pointB]?.visibility ?? 0);
      const rightConf =
        (normalizedLandmarks[angleCfg.landmarks.right.vertex]?.visibility ?? 0) +
        (normalizedLandmarks[angleCfg.landmarks.right.pointB]?.visibility ?? 0);
      triplet = rightConf >= leftConf ? angleCfg.landmarks.right : angleCfg.landmarks.left;
    }

    let currentAngle = 0;
    let readinessStatus: RepEvaluationResult['readinessStatus'] = 'ready';
    let isUpperBodyDeskActive = false;
    let isDistalElbowMissing = false;

    if (
      normalizedLandmarks.length > triplet.pointA &&
      normalizedLandmarks.length > triplet.vertex &&
      normalizedLandmarks.length > triplet.pointB
    ) {
      let pA = normalizedLandmarks[triplet.pointA];
      const pV = normalizedLandmarks[triplet.vertex];
      let pB = normalizedLandmarks[triplet.pointB];

      const policy = DEFAULT_LANDMARK_VISIBILITY_POLICY;
      const isCamUsable = (idx: number, minVis: number): boolean => {
        if (idx < 0 || idx >= landmarks.length) return false;
        const lm = landmarks[idx];
        if (!lm) return false;
        if (lm.x < 0.01 || lm.x > 0.99 || lm.y < 0.01 || lm.y > 0.99) return false;
        const vis = lm.visibility !== undefined ? lm.visibility : 1.0;
        return vis >= minVis;
      };

      if (this.config.targetJoint === 'shoulder') {
        const shoulderIdx = triplet.vertex;
        const elbowIdx = shoulderIdx === 11 ? 13 : 14;
        const wristIdx = shoulderIdx === 11 ? 15 : 16;
        const hipIdx = triplet.pointA;

        const hasShoulder = isCamUsable(shoulderIdx, policy.shoulderMinVis);
        const hasElbow = isCamUsable(elbowIdx, policy.elbowMinVis);
        const hasWrist = isCamUsable(wristIdx, policy.wristMinVis);
        const hasHip = isCamUsable(hipIdx, policy.hipMinVis);

        const effectivePA = hasHip
          ? pA
          : {
              x: pV.x,
              y: pV.y + 0.35,
              z: pV.z ?? 0,
              visibility: 0.85,
            };

        const isTargetElbow = triplet.pointB === elbowIdx;

        if (hasShoulder && hasElbow && (hasWrist || isTargetElbow)) {
          // Tier 1: Full arm visible
          currentAngle = triplet.use3DWorld
            ? calculateAngle3D(effectivePA, pV, pB)
            : calculateAngle2D(effectivePA, pV, pB);
          readinessStatus = 'ready';
        } else if (hasShoulder && hasElbow && !hasWrist && !isTargetElbow) {
          // Tier 2: Partial Arm Visible (Shoulder + Elbow usable, Wrist out of frame)
          const elbowLm = normalizedLandmarks[elbowIdx];
          currentAngle = triplet.use3DWorld
            ? calculateAngle3D(effectivePA, pV, elbowLm)
            : calculateAngle2D(effectivePA, pV, elbowLm);
          readinessStatus = 'partial_upper_body';
        } else if (hasShoulder && (!hasElbow || !hasWrist)) {
          // Tier 3: Close-Up Desk Mode (Only Shoulders visible; Elbow & Wrist out of bottom frame)
          isUpperBodyDeskActive = true;
          readinessStatus = 'partial_upper_body';

          const oppShoulderIdx = shoulderIdx === 11 ? 12 : 11;
          const oppShoulder = landmarks[oppShoulderIdx];
          const nose = landmarks[0];
          const baselineY = isCamUsable(oppShoulderIdx, 0.35) && oppShoulder
            ? oppShoulder.y
            : (isCamUsable(0, 0.35) && nose ? nose.y + 0.18 : (landmarks[shoulderIdx]?.y ?? 0.35));

          const upwardLift = Math.max(0, baselineY - (landmarks[shoulderIdx]?.y ?? 0.35));
          const targetMin = angleCfg.targetMinDeg;
          const startAngle = angleCfg.startAngleDeg;
          const liftRatio = Math.min(1.0, upwardLift / 0.10);
          currentAngle = startAngle + liftRatio * (targetMin - startAngle);
        } else {
          currentAngle = triplet.use3DWorld
            ? calculateAngle3D(effectivePA, pV, pB)
            : calculateAngle2D(effectivePA, pV, pB);
        }
      } else if (this.config.targetJoint === 'elbow') {
        const elbowIdx = triplet.vertex;
        const shoulderIdx = triplet.pointA;
        const wristIdx = triplet.pointB;
        const hasElbow = isCamUsable(elbowIdx, policy.elbowMinVis);
        const hasShoulder = isCamUsable(shoulderIdx, policy.shoulderMinVis);
        const hasWrist = isCamUsable(wristIdx, policy.wristMinVis);

        if (hasShoulder && hasElbow && hasWrist) {
          currentAngle = triplet.use3DWorld
            ? calculateAngle3D(pA, pV, pB)
            : calculateAngle2D(pA, pV, pB);
          readinessStatus = 'ready';
        } else if (hasShoulder && hasElbow && !hasWrist) {
          readinessStatus = 'partial_upper_body';
          const synthWrist = {
            x: pV.x + (pV.x - pA.x) * 0.5,
            y: pV.y + 0.20,
            z: pV.z ?? 0,
            visibility: 0.7,
          };
          currentAngle = triplet.use3DWorld
            ? calculateAngle3D(pA, pV, synthWrist)
            : calculateAngle2D(pA, pV, synthWrist);
        } else if (hasShoulder && (!hasElbow || !hasWrist)) {
          // Graceful fallback to Partial Upper-Body / Shoulder Oscillation Mode
          isUpperBodyDeskActive = true;
          readinessStatus = 'partial_upper_body';

          const oppShoulderIdx = shoulderIdx === 11 ? 12 : 11;
          const oppShoulder = landmarks[oppShoulderIdx];
          const nose = landmarks[0];
          const baselineY = isCamUsable(oppShoulderIdx, 0.35) && oppShoulder
            ? oppShoulder.y
            : (isCamUsable(0, 0.35) && nose ? nose.y + 0.18 : (landmarks[shoulderIdx]?.y ?? 0.35));

          const upwardLift = Math.max(0, baselineY - (landmarks[shoulderIdx]?.y ?? 0.35));
          const targetMin = angleCfg.targetMinDeg;
          const startAngle = angleCfg.startAngleDeg;
          const liftRatio = Math.min(1.0, upwardLift / 0.08);
          currentAngle = startAngle + liftRatio * (targetMin - startAngle);
        } else {
          currentAngle = angleCfg.startAngleDeg;
          readinessStatus = 'partial_upper_body';
        }
      } else {
        const isAUsable = isCamUsable(triplet.pointA, 0.30);
        const isVUsable = isCamUsable(triplet.vertex, 0.30);
        const isBUsable = isCamUsable(triplet.pointB, 0.30);
        currentAngle = triplet.use3DWorld
          ? calculateAngle3D(pA, pV, pB)
          : calculateAngle2D(pA, pV, pB);
        readinessStatus = isAUsable && isVUsable && isBUsable ? 'ready' : 'partial_upper_body';
      }
    }

    // Update telemetry metrics
    if (currentAngle > this.maxAngleAchievedDeg) {
      this.maxAngleAchievedDeg = Math.round(currentAngle);
    }
    this.recordedAnglesSum += currentAngle;
    this.recordedAnglesCount++;

    // Safety Angle Cap Check
    const safetyCap = this.config.safetyContraindications?.maxSafeAngleCapDeg || 175;
    const isExceedingSafetyCap = currentAngle > safetyCap;

    // Target zone parameters
    const startAngle = angleCfg.startAngleDeg;
    const targetMin = angleCfg.targetMinDeg;
    const targetMax = angleCfg.targetMaxDeg;
    const tolerance = angleCfg.toleranceDeg || 10;
    const holdDurationSec = angleCfg.holdDurationSec || 1.0;
    const direction = angleCfg.direction || 'increase';
    const isDecreasing = direction === 'decrease';

    // Calculate real-time smooth accuracy percent (0%–100%)
    let accuracyPercent = 0;
    if (isDecreasing) {
      const denom = Math.abs(startAngle - targetMax) || 1;
      if (currentAngle >= startAngle) {
        accuracyPercent = 0;
      } else if (currentAngle <= targetMax) {
        accuracyPercent = 100;
      } else {
        accuracyPercent = Math.min(
          100,
          Math.max(0, Math.round(((startAngle - currentAngle) / denom) * 100))
        );
      }
    } else {
      const denom = Math.abs(targetMin - startAngle) || 1;
      if (currentAngle <= startAngle) {
        accuracyPercent = 0;
      } else if (currentAngle >= targetMin) {
        accuracyPercent = 100;
      } else {
        accuracyPercent = Math.min(
          100,
          Math.max(0, Math.round(((currentAngle - startAngle) / denom) * 100))
        );
      }
    }
    if (Number.isNaN(accuracyPercent)) {
      accuracyPercent = 0;
    }

    // Biomechanical Anti-Cheat Guards
    const isSitToStand = this.config.id === 'sit-to-stand';
    const isHipAbduction = this.config.id === 'standing-hip-abduction' || this.config.id === 'standing-hip-abd';

    const curHipY = (normalizedLandmarks[23]?.y !== undefined && normalizedLandmarks[24]?.y !== undefined)
      ? (normalizedLandmarks[23].y + normalizedLandmarks[24].y) / 2
      : (normalizedLandmarks[23]?.y ?? normalizedLandmarks[24]?.y ?? null);

    if (isSitToStand && curHipY !== null) {
      if (this.phase === 'IDLE' && (this.baselineHipY === null || Math.abs(currentAngle - startAngle) < 15)) {
        this.baselineHipY = curHipY;
      }
    }

    let isSitToStandCheating = false;
    if (isSitToStand) {
      const kneeIdx = triplet.vertex;
      const ankleIdx = triplet.pointB;
      const kneeY = normalizedLandmarks[kneeIdx]?.y ?? 0.7;
      const ankleY = normalizedLandmarks[ankleIdx]?.y ?? 0.9;
      // Biomechanical check: If knee is extended but shank is horizontal (ankle near knee height), user is kicking leg seated
      const isShankHorizontal = Math.abs(ankleY - kneeY) < 0.08;
      if (currentAngle >= targetMin - tolerance && isShankHorizontal) {
        isSitToStandCheating = true;
      }
    }

    let isInsideTargetZone = isDecreasing
      ? currentAngle <= targetMax + tolerance && currentAngle >= targetMin - tolerance
      : currentAngle >= targetMin - tolerance && currentAngle <= targetMax + tolerance;

    if (isSitToStand && isSitToStandCheating) {
      isInsideTargetZone = false;
    }

    const isAtStartZone = isDecreasing
      ? currentAngle >= startAngle - tolerance - 5
      : Math.abs(currentAngle - startAngle) <= tolerance + 5;

    // Check compensation rules with normalized landmarks
    const compResult = this.compensationDetector.evaluate(
      normalizedLandmarks,
      currentAngle,
      timestampMs
    );
    const activeWarnings = [...compResult.warnings];

    let isHipAbductionCheating = false;
    if (isHipAbduction && compResult.lateralTiltDeg > 10.0) {
      isHipAbductionCheating = true;
    }

    let coachingMessage = 'เริ่มขยับข้อต่อเข้าสู่มุมเป้าหมาย';
    let coachingMessageEn: string | undefined;
    let coachingMessageCn: string | undefined;
    let holdProgressRatio = 0.0;
    let formRating: 'good' | 'warning' | 'error' = 'good';
    let isRepRejected = false;
    let repRejectionReasonTh: string | undefined = undefined;

    if (isSitToStandCheating) {
      formRating = 'error';
      coachingMessage = 'กรุณาลุกขึ้นยืนจากเก้าอี้จริง (อย่ายกเฉพาะขาขณะนั่ง)';
      coachingMessageEn = 'Please stand up fully from the chair (do not just kick legs while seated)';
      coachingMessageCn = '请完全从椅子上站起（切勿坐着踢腿借力）';
      activeWarnings.push({
        ruleId: 'stand_anti_cheat_hip_lift',
        type: 'trunk_lean',
        messageTh: 'กรุณาลุกขึ้นยืนจากเก้าอี้จริง (อย่ายกเฉพาะขาขณะนั่ง)',
        severity: 'error',
        currentValue: 0,
        thresholdValue: 4,
      });
    } else if (isHipAbductionCheating) {
      formRating = 'error';
      coachingMessage = 'รักษาลำตัวให้ตรง อย่ายักสะโพกหรือเอียงตัวช่วยยกขา';
      coachingMessageEn = 'Keep body upright, do not hike hip or lean sideways to lift leg';
      coachingMessageCn = '请保持身体垂直，切勿耸胯或侧倾身体借力';
      activeWarnings.push({
        ruleId: 'hip_anti_cheat_trunk_lean',
        type: 'trunk_lateral_flexion',
        messageTh: 'รักษาลำตัวให้ตรง อย่ายักสะโพกหรือเอียงตัวช่วยยกขา',
        severity: 'error',
        currentValue: Math.round(compResult.lateralTiltDeg),
        thresholdValue: 10,
      });
    } else if (isDistalElbowMissing) {
      formRating = 'warning';
      coachingMessage = '📷 ท่านี้ต้องใช้มุมข้อศอก กรุณาปรับมุมกล้องลงเล็กน้อยหรือถอยห่างให้เห็นข้อศอก';
      coachingMessageEn = '📷 This exercise requires elbow visibility. Please adjust camera down or step back.';
      coachingMessageCn = '📷 此动作需要看到手肘，请稍微调低摄像头或后退以露出手肘。';
    } else if (isUpperBodyDeskActive) {
      readinessStatus = 'partial_upper_body';
      formRating = 'good';
      coachingMessage = '💡 ตรวจจับโหมดครึ่งตัวบน (เห็นเฉพาะช่วงไหล่) — ขยับหัวไหล่และต้นแขนตามจังหวะเพื่อฝึกได้เลย (หรือถอยห่างเล็กน้อยหากต้องการตรวจจับเต็มแขน)';
      coachingMessageEn = '💡 Upper-body partial detection active — move your shoulder and upper arm rhythmically (step back slightly for full-arm tracking).';
      coachingMessageCn = '💡 半身检测模式已启用 — 请按节奏活动肩部和上臂（稍微后退可进行全臂检测）。';
    } else if (isExceedingSafetyCap) {
      formRating = 'error';
      coachingMessage = '⚠️ สูงเกินไปแล้ว ค่อยๆ ลดระดับลงเพื่อความปลอดภัย';
      activeWarnings.push({
        ruleId: 'safety_cap_exceeded',
        type: 'excessive_speed',
        messageTh: 'ทำมุมเกินขีดจำกัดความปลอดภัยที่กำหนด',
        severity: 'error',
        currentValue: Math.round(currentAngle),
        thresholdValue: safetyCap,
      });
    } else if (compResult.isVelocityViolated) {
      formRating = 'error';
      coachingMessage = 'เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ';
    } else if (activeWarnings.some((w) => w.severity === 'error')) {
      formRating = 'error';
      coachingMessage = activeWarnings[0].messageTh;
    } else if (compResult.lateralTiltDeg > 12.0) {
      formRating = 'warning';
      coachingMessage = 'รักษาลำตัวให้ตั้งตรง อย่าเอียงตัวช่วยยก';
    } else if (activeWarnings.length > 0) {
      formRating = 'warning';
      coachingMessage = activeWarnings[0].messageTh;
    }

    // STATE TRANSITIONS
    switch (this.phase) {
      case 'IDLE': {
        if (isInsideTargetZone) {
          this.phase = 'HOLDING_TARGET';
          this.holdStartTimeMs = timestampMs;
          this.holdPauseStartMs = null;
          this.totalHoldPausedDurationMs = 0;
          coachingMessage = `ถึงมุมเป้าหมายแล้ว ค้างไว้ ${holdDurationSec} วินาที`;
        } else if (!isUpperBodyDeskActive && !isDistalElbowMissing) {
          if (isAtStartZone) {
            coachingMessage = 'อยู่ในตำแหน่งเริ่มต้น พร้อมแล้วเริ่มเคลื่อนไหวได้เลย';
          } else if (isDecreasing ? currentAngle < startAngle - tolerance : currentAngle > startAngle + tolerance) {
            this.phase = 'MOVING_TO_TARGET';
            coachingMessage = 'เคลื่อนไหวเข้าสู่มุมเป้าหมายอย่างช้าๆ';
          }
        } else if (isUpperBodyDeskActive) {
          if (isDecreasing ? currentAngle < startAngle - tolerance : currentAngle > startAngle + tolerance) {
            this.phase = 'MOVING_TO_TARGET';
          }
        }
        break;
      }

      case 'MOVING_TO_TARGET': {
        if (isInsideTargetZone) {
          this.phase = 'HOLDING_TARGET';
          this.holdStartTimeMs = timestampMs;
          this.holdPauseStartMs = null;
          this.totalHoldPausedDurationMs = 0;
          coachingMessage = `ถึงมุมเป้าหมายแล้ว ค้างไว้ ${holdDurationSec} วินาที`;
        } else {
          coachingMessage = isDecreasing
            ? (currentAngle > targetMax + tolerance ? 'งอข้อต่อเพิ่มอีกนิด ให้ถึงแถบสีเขียว' : 'เหยียดออกเล็กน้อย ให้อยู่ในแถบสีเขียว')
            : (currentAngle < targetMin - tolerance ? 'ขยับเพิ่มอีกนิด ให้ถึงแถบสีเขียว' : 'ลดระดับลงเล็กน้อย ให้อยู่ในแถบสีเขียว');
        }
        break;
      }

      case 'HOLDING_TARGET': {
        if (!isInsideTargetZone) {
          // Patient fell out of target zone before finishing hold
          this.holdStartTimeMs = null;
          this.holdPauseStartMs = null;
          this.totalHoldPausedDurationMs = 0;
          this.phase = 'MOVING_TO_TARGET';
          coachingMessage = 'หลุดออกจากมุมเป้าหมาย ขยับกลับเข้าแถบสีเขียว';
        } else {
          // Pause hold timer if subject is occluded (exempt in Upper-Body Desk Mode)
          const isOccluded = !isUpperBodyDeskActive && (lockResult?.isOccluded ?? false);
          if (isOccluded) {
            if (this.holdPauseStartMs === null) {
              this.holdPauseStartMs = timestampMs;
            }
          } else {
            if (this.holdPauseStartMs !== null) {
              this.totalHoldPausedDurationMs += timestampMs - this.holdPauseStartMs;
              this.holdPauseStartMs = null;
            }
          }

          const currentPauseDuration =
            this.holdPauseStartMs !== null ? timestampMs - this.holdPauseStartMs : 0;
          const totalPaused = this.totalHoldPausedDurationMs + currentPauseDuration;
          const rawElapsedMs = timestampMs - (this.holdStartTimeMs || timestampMs);
          const activeElapsedSec = Math.max(0, rawElapsedMs - totalPaused) / 1000.0;

          holdProgressRatio = Math.min(1.0, activeElapsedSec / Math.max(0.1, holdDurationSec));
          if (this.config.id === 'shoulder-flexion' && isUpperBodyDeskActive) {
            // console.log(\`activeElapsedSec=\${activeElapsedSec}, holdDurationSec=\${holdDurationSec}\`);
          }

          if (activeElapsedSec >= holdDurationSec) {
            this.phase = 'RETURNING_TO_START';
            this.holdStartTimeMs = null;
            this.holdPauseStartMs = null;
            this.totalHoldPausedDurationMs = 0;
            coachingMessage = 'ยอดเยี่ยม! ค่อยๆ ผ่อนกลับสู่ตำแหน่งเริ่มต้น';
          } else {
            const remainingSec = Math.max(0, holdDurationSec - activeElapsedSec).toFixed(1);
            coachingMessage = isOccluded
              ? 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน'
              : `ค้างไว้อีก ${remainingSec} วินาที...`;
          }
        }
        break;
      }

      case 'RETURNING_TO_START': {
        if (isAtStartZone) {
          const nowMs = timestampMs;
          const isDebounced = nowMs - this.lastRepCompletedTimeMs >= 350;

          if (this.compensationDetector.getVelocityGuard().hasRepViolation() || isSitToStandCheating || isHipAbductionCheating) {
            // Rep rejected due to excessive velocity / jerky movement or anti-cheat violation
            this.incorrectReps++;
            this.phase = 'REP_COMPLETED';
            isRepRejected = true;
            repRejectionReasonTh = isSitToStandCheating
              ? 'กรุณาลุกขึ้นยืนจากเก้าอี้จริง (อย่ายกเฉพาะขาขณะนั่ง)'
              : isHipAbductionCheating
              ? 'รักษาลำตัวให้ตรง อย่ายักสะโพกหรือเอียงตัวช่วยยกขา'
              : 'เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ';
            coachingMessage = `⚠️ ท่าไม่ผ่าน: ${repRejectionReasonTh}`;
            this.compensationDetector.getVelocityGuard().resetRepViolation();
          } else if (isDebounced) {
            // Rep completed successfully!
            this.completedReps++;
            this.lastRepCompletedTimeMs = nowMs;
            this.phase = 'REP_COMPLETED';
            coachingMessage = `ครบ 1 ครั้ง! (${this.completedReps}/${targetReps})`;

            if (this.completedReps >= targetReps) {
              this.isSetCompleted = true;
              if (this.currentSet >= totalSets) {
                this.isExerciseCompleted = true;
              }
            }
          }
        } else {
          coachingMessage = 'ผ่อนกลับสู่ตำแหน่งเริ่มต้นให้สุด';
        }
        break;
      }

      case 'REP_COMPLETED': {
        this.compensationDetector.getVelocityGuard().resetRepViolation();
        this.phase = 'MOVING_TO_TARGET';
        break;
      }
    }

    // Occlusion warning check (only trigger warning message if NOT actively moving/holding in a rep)
    const isActivelyExercising =
      this.phase === 'MOVING_TO_TARGET' ||
      this.phase === 'HOLDING_TARGET' ||
      this.phase === 'RETURNING_TO_START' ||
      this.phase === 'REP_COMPLETED' ||
      this.completedReps > 0;

    if (lockResult?.isOccluded && !isActivelyExercising) {
      formRating = 'warning';
      coachingMessage = 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน';
      activeWarnings.push({
        ruleId: 'subject_occlusion_guard',
        type: 'trunk_lean',
        messageTh: 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน',
        severity: 'warning',
        currentValue: lockResult.averageVisibility,
        thresholdValue: 0.50,
      });
    }

    if (isExceedingSafetyCap) {
      coachingMessage = '⚠️ สูงเกินไปแล้ว ค่อยๆ ลดระดับลงเพื่อความปลอดภัย';
    } else if (compResult.isVelocityViolated) {
      coachingMessage = 'เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ';
    } else if (activeWarnings.some((w) => w.severity === 'error')) {
      coachingMessage = activeWarnings.find((w) => w.severity === 'error')!.messageTh;
    }

    return {
      phase: this.phase,
      currentAngleDeg: Math.round(currentAngle),
      targetAngleDeg: targetMin,
      accuracyPercent,
      accuracyPct: accuracyPercent,
      severity: formRating,
      holdProgressRatio,
      pendulumCircleProgressRatio: 0,
      isInsideTargetZone,
      isExceedingSafetyCap,
      completedReps: this.completedReps,
      incorrectReps: this.incorrectReps,
      targetReps,
      currentSet: this.currentSet,
      totalSets,
      isSetCompleted: this.isSetCompleted,
      isExerciseCompleted: this.isExerciseCompleted,
      coachingMessageTh: coachingMessage,
      activeWarnings,
      formRating,
      instantaneousVelocity: compResult.angularVelocityDegPerSec,
      angularVelocityDegPerSec: compResult.angularVelocityDegPerSec,
      trunkLateralTiltDeg: compResult.lateralTiltDeg,
      scapularHikingRatio: compResult.scapularHikingRatio,
      isRepRejected,
      repRejectionReasonTh,
      isOccluded: lockResult?.isOccluded ?? false,
      occlusionReasonTh: lockResult?.occlusionReasonTh,
      isSubjectLocked: lockResult?.isSubjectLocked ?? true,
      isFrameDropped: lockResult?.isFrameDropped ?? false,
      frameDropReason: lockResult?.frameDropReason,
      readinessStatus,
      coachingMessageEn,
      coachingMessageCn,
      filteredLandmarks: normalizedLandmarks,
    };
  }

  /**
   * Evaluates Neck Side Tilt (ears 7, 8 vs shoulders 11, 12)
   */
  private evaluateNeckTilt(
    landmarks: PoseEngineLandmark[],
    timestampMs: number,
    _lockResult?: SubjectLockResult
  ): RepEvaluationResult {
    const targetReps = this.config.defaultPrescription?.repsPerSet || 10;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;
    const holdDurationSec = this.config.angleMechanics?.holdDurationSec || 1.0;

    const earL = landmarks[7];
    const earR = landmarks[8];
    const shL = landmarks[11];
    const shR = landmarks[12];

    let tiltAngleDeg = 0;
    if (earL && earR && shL && shR) {
      const earAngle = Math.atan2(earR.y - earL.y, earR.x - earL.x) * (180 / Math.PI);
      const shAngle = Math.atan2(shR.y - shL.y, shR.x - shL.x) * (180 / Math.PI);
      tiltAngleDeg = Math.abs(earAngle - shAngle);
      if (tiltAngleDeg > 90) tiltAngleDeg = Math.abs(180 - tiltAngleDeg);
    }

    const isInsideTargetZone = tiltAngleDeg >= 18 && tiltAngleDeg <= 42;
    const isAtStartZone = tiltAngleDeg < 7;
    const accuracyPercent = isInsideTargetZone
      ? 100
      : Math.min(100, Math.max(0, Math.round((tiltAngleDeg / 20) * 100)));

    let coachingMessage = 'เอียงคอช้าๆ ไปด้านข้าง';
    let holdProgressRatio = 0.0;
    const formRating: 'good' | 'warning' | 'error' = 'good';

    switch (this.phase) {
      case 'IDLE': {
        if (isInsideTargetZone) {
          this.phase = 'HOLDING_TARGET';
          this.holdStartTimeMs = timestampMs;
          coachingMessage = `เอียงคอได้ดี ค้างไว้ ${holdDurationSec} วินาที`;
        } else if (isAtStartZone) {
          coachingMessage = 'ศีรษะตั้งตรง พร้อมแล้วค่อยๆ เอียงคอ';
        } else if (tiltAngleDeg >= 7) {
          this.phase = 'MOVING_TO_TARGET';
          coachingMessage = 'เอียงคอเพิ่มอีกนิด ให้รู้สึกตึงพอดี';
        }
        break;
      }
      case 'MOVING_TO_TARGET': {
        if (isInsideTargetZone) {
          this.phase = 'HOLDING_TARGET';
          this.holdStartTimeMs = timestampMs;
          coachingMessage = `เอียงคอได้ดี ค้างไว้ ${holdDurationSec} วินาที`;
        } else if (tiltAngleDeg < 18) {
          coachingMessage = 'เอียงคอเพิ่มอีกนิด ให้รู้สึกตึงพอดี';
        }
        break;
      }
      case 'HOLDING_TARGET': {
        if (!isInsideTargetZone) {
          this.phase = 'MOVING_TO_TARGET';
          this.holdStartTimeMs = null;
          coachingMessage = 'รักษาการเอียงคอให้อยู่ในช่วงเป้าหมาย';
        } else {
          const rawElapsedSec = (timestampMs - (this.holdStartTimeMs || timestampMs)) / 1000.0;
          holdProgressRatio = Math.min(1.0, rawElapsedSec / Math.max(0.1, holdDurationSec));
          if (rawElapsedSec >= holdDurationSec) {
            this.phase = 'RETURNING_TO_START';
            this.holdStartTimeMs = null;
            coachingMessage = 'ค่อยๆ ยกศีรษะกลับสู่ตรงกลาง';
          } else {
            coachingMessage = `ค้างไว้อีก ${(holdDurationSec - rawElapsedSec).toFixed(1)} วินาที`;
          }
        }
        break;
      }
      case 'RETURNING_TO_START': {
        if (isAtStartZone) {
          const nowMs = timestampMs;
          if (nowMs - this.lastRepCompletedTimeMs >= 350) {
            this.completedReps++;
            this.lastRepCompletedTimeMs = nowMs;
            this.phase = 'REP_COMPLETED';
            coachingMessage = `ครบ 1 ครั้ง! (${this.completedReps}/${targetReps})`;

            if (this.completedReps >= targetReps) {
              this.isSetCompleted = true;
              if (this.currentSet >= totalSets) {
                this.isExerciseCompleted = true;
              }
            }
          }
        } else {
          coachingMessage = 'กลับสู่ศีรษะตั้งตรง';
        }
        break;
      }
      case 'REP_COMPLETED': {
        this.phase = 'MOVING_TO_TARGET';
        break;
      }
    }

    return {
      phase: this.phase,
      currentAngleDeg: Math.round(tiltAngleDeg),
      targetAngleDeg: 25,
      accuracyPercent,
      accuracyPct: accuracyPercent,
      severity: formRating,
      holdProgressRatio,
      pendulumCircleProgressRatio: 0,
      isInsideTargetZone,
      isExceedingSafetyCap: tiltAngleDeg > 50,
      completedReps: this.completedReps,
      incorrectReps: this.incorrectReps,
      targetReps,
      currentSet: this.currentSet,
      totalSets,
      isSetCompleted: this.isSetCompleted,
      isExerciseCompleted: this.isExerciseCompleted,
      coachingMessageTh: coachingMessage,
      activeWarnings: [],
      formRating,
      instantaneousVelocity: 0,
      readinessStatus: 'ready',
      filteredLandmarks: landmarks,
    };
  }

  /**
   * Evaluates Heel Raise (tracks heel elevation relative to baseline)
   */
  private evaluateHeelRaise(
    landmarks: PoseEngineLandmark[],
    timestampMs: number,
    _lockResult?: SubjectLockResult
  ): RepEvaluationResult {
    const targetReps = this.config.defaultPrescription?.repsPerSet || 10;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;
    const holdDurationSec = this.config.angleMechanics?.holdDurationSec || 0.5;

    const heelL = landmarks[29] || landmarks[27];
    const heelR = landmarks[30] || landmarks[28];
    const kneeL = landmarks[25];

    const legLength = Math.max(
      0.15,
      kneeL && heelL ? Math.abs(heelL.y - kneeL.y) : 0.3
    );

    const currentHeelY = heelL && heelR ? (heelL.y + heelR.y) / 2 : (heelR?.y ?? heelL?.y ?? 0.85);

    if (this.baselineHeelY === null || currentHeelY > this.baselineHeelY) {
      this.baselineHeelY = currentHeelY;
    }

    const liftDist = this.baselineHeelY - currentHeelY;
    const liftRatio = Math.max(0, liftDist / legLength);

    const isInsideTargetZone = liftRatio >= 0.04;
    const isAtStartZone = liftRatio <= 0.015;

    const accuracyPercent = isInsideTargetZone
      ? 100
      : Math.min(100, Math.max(0, Math.round((liftRatio / 0.04) * 100)));

    let coachingMessage = 'เขย่งส้นเท้าขึ้นช้าๆ';
    let holdProgressRatio = 0.0;
    const formRating: 'good' | 'warning' | 'error' = 'good';

    switch (this.phase) {
      case 'IDLE': {
        if (isInsideTargetZone) {
          this.phase = 'HOLDING_TARGET';
          this.holdStartTimeMs = timestampMs;
          coachingMessage = `เขย่งส้นเท้าได้ดี ค้างไว้ ${holdDurationSec} วินาที`;
        } else if (isAtStartZone) {
          coachingMessage = 'ยืนตรง วางส้นเท้าแนบพื้น พร้อมแล้วเขย่งขึ้น';
        } else if (liftRatio > 0.015) {
          this.phase = 'MOVING_TO_TARGET';
          coachingMessage = 'เขย่งขึ้นอีกนิด ให้สุดปลายเท้า';
        }
        break;
      }
      case 'MOVING_TO_TARGET': {
        if (isInsideTargetZone) {
          this.phase = 'HOLDING_TARGET';
          this.holdStartTimeMs = timestampMs;
          coachingMessage = `เขย่งส้นเท้าได้ดี ค้างไว้ ${holdDurationSec} วินาที`;
        } else {
          coachingMessage = 'เขย่งขึ้นอีกนิด ให้สุดปลายเท้า';
        }
        break;
      }
      case 'HOLDING_TARGET': {
        if (!isInsideTargetZone) {
          this.phase = 'MOVING_TO_TARGET';
          this.holdStartTimeMs = null;
          coachingMessage = 'ยกส้นเท้าค้างไว้';
        } else {
          const rawElapsedSec = (timestampMs - (this.holdStartTimeMs || timestampMs)) / 1000.0;
          holdProgressRatio = Math.min(1.0, rawElapsedSec / Math.max(0.1, holdDurationSec));
          if (rawElapsedSec >= holdDurationSec) {
            this.phase = 'RETURNING_TO_START';
            this.holdStartTimeMs = null;
            coachingMessage = 'ค่อยๆ ลดส้นเท้าลงแตะพื้น';
          } else {
            coachingMessage = `ค้างไว้อีก ${(holdDurationSec - rawElapsedSec).toFixed(1)} วินาที`;
          }
        }
        break;
      }
      case 'RETURNING_TO_START': {
        if (isAtStartZone) {
          const nowMs = timestampMs;
          if (nowMs - this.lastRepCompletedTimeMs >= 350) {
            this.completedReps++;
            this.lastRepCompletedTimeMs = nowMs;
            this.phase = 'REP_COMPLETED';
            coachingMessage = `ครบ 1 ครั้ง! (${this.completedReps}/${targetReps})`;

            if (this.completedReps >= targetReps) {
              this.isSetCompleted = true;
              if (this.currentSet >= totalSets) {
                this.isExerciseCompleted = true;
              }
            }
          }
        } else {
          coachingMessage = 'ลดส้นเท้าลงให้แตะพื้น';
        }
        break;
      }
      case 'REP_COMPLETED': {
        this.phase = 'MOVING_TO_TARGET';
        break;
      }
    }

    return {
      phase: this.phase,
      currentAngleDeg: Math.round(liftRatio * 1000),
      targetAngleDeg: 40,
      accuracyPercent,
      accuracyPct: accuracyPercent,
      severity: formRating,
      holdProgressRatio,
      pendulumCircleProgressRatio: 0,
      isInsideTargetZone,
      isExceedingSafetyCap: false,
      completedReps: this.completedReps,
      incorrectReps: this.incorrectReps,
      targetReps,
      currentSet: this.currentSet,
      totalSets,
      isSetCompleted: this.isSetCompleted,
      isExerciseCompleted: this.isExerciseCompleted,
      coachingMessageTh: coachingMessage,
      activeWarnings: [],
      formRating,
      instantaneousVelocity: 0,
      readinessStatus: 'ready',
      filteredLandmarks: landmarks,
    };
  }

  /**
  /**
   * ประเมินท่า Shoulder Pendulum และท่าช่วงบนแบบยืดหยุ่น (Upper-Body Adaptive Fallback):
   * - ถ้านั่งหน้าคอมและเห็นทั้ง ไหล่ + ศอก + ข้อมือ -> ใช้ Full Wrist Circular Trajectory
   * - ถ้าเห็น ไหล่ + ศอก (ไม่เห็นข้อมือ) -> ใช้ Elbow Trajectory แทนข้อมือ
   * - ถ้าเห็นเฉพาะ หัวไหล่ + ช่วงอก (นั่งใกล้หน้าจอคอม) -> ใช้ Shoulder & Upper-Torso Circular Sway/Oscillation
   *   พร้อมแจ้งสถานะ "ตรวจจับได้บางส่วน (โหมดครึ่งตัวบน)" โดยไม่บล็อกการนับครั้งและไม่ค้างที่ 0%!
   */
  private evaluatePendulumCircular(
    landmarks: PoseEngineLandmark[],
    timestampMs: number,
    lockResult?: SubjectLockResult
  ): RepEvaluationResult {
    const targetReps = this.config.defaultPrescription?.repsPerSet || 10;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;

    let isRight = this.config.side !== 'left';
    if (this.config.side === 'bilateral' && landmarks.length > 24) {
      const leftScore = (landmarks[11]?.visibility ?? 0) + (landmarks[15]?.visibility ?? 0);
      const rightScore = (landmarks[12]?.visibility ?? 0) + (landmarks[16]?.visibility ?? 0);
      isRight = rightScore >= leftScore;
    }

    const sIdx = isRight ? 12 : 11;
    const eIdx = isRight ? 14 : 13;
    const wIdx = isRight ? 16 : 15;
    const oppSIdx = isRight ? 11 : 12;
    const hIdx = isRight ? 24 : 23;

    const shoulder = landmarks[sIdx];
    const elbow = landmarks[eIdx];
    const wrist = landmarks[wIdx];
    const oppShoulder = landmarks[oppSIdx];
    const hip = landmarks[hIdx];

    // Normalized shoulder width ratio for distance estimation
    const shoulderWidthRatio =
      shoulder && oppShoulder
        ? Math.hypot(shoulder.x - oppShoulder.x, shoulder.y - oppShoulder.y)
        : 0.28;

    const isShoulderUsable = Boolean(
      shoulder &&
      isLandmarkUsable(shoulder, 0.45) &&
      shoulder.x >= 0.02 && shoulder.x <= 0.98 &&
      shoulder.y >= 0.02 && shoulder.y <= 0.98
    );

    // 1. Baseline Gate: Shoulder must be visible
    if (!isShoulderUsable) {
      const def = this.createDefaultResult(
        landmarks,
        '📷 ไม่พบหัวไหล่ในภาพ กรุณายืนหรือนั่งให้กล้องเห็นหัวไหล่และลำตัวชัดเจน'
      );
      def.phase = 'WAITING_FOR_FRAMING';
      def.coachingMessageEn = 'Please position yourself so your shoulder is visible.';
      def.readinessStatus = 'missing_shoulder';
      def.blockingReason = 'missing_shoulder';
      def.formRating = 'warning';
      def.shoulderWidthRatio = Number(shoulderWidthRatio.toFixed(3));
      def.distanceStatus = 'ไม่พบหัวไหล่';
      return def;
    }

    const isUpperDeskConfigured =
      this.config.framing === 'upper' || this.config.framing === 'upper_body';

    const isElbowUsable = Boolean(
      elbow &&
      isLandmarkUsable(elbow, 0.40) &&
      elbow.x >= 0.02 && elbow.x <= 0.98 &&
      elbow.y >= 0.02 && elbow.y <= 0.96
    );

    const isWristUsable = Boolean(
      wrist &&
      isLandmarkUsable(wrist, 0.35) &&
      wrist.x >= 0.02 && wrist.x <= 0.98 &&
      wrist.y >= 0.02 && wrist.y <= 0.96
    );

    // 2. Framing Gate: Sitting too close (> 50% shoulder width or arm cropped below bottom edge)
    const isCroppedBelow = Boolean(elbow && (elbow.y ?? 0) > 0.95) || Boolean(wrist && (wrist.y ?? 0) > 0.98);
    const isTooClose = !isUpperDeskConfigured && (shoulderWidthRatio > 0.50 || (isCroppedBelow && !isElbowUsable));
    if (isTooClose) {
      const def = this.createDefaultResult(
        landmarks,
        '🪑 ถอยหลังอีกนิด ให้เห็นแขนถึงข้อศอก'
      );
      def.phase = 'WAITING_FOR_FRAMING';
      def.coachingMessageEn = '🪑 Step back slightly so your arm and elbow are visible';
      def.coachingMessageCn = '🪑 请稍微后退，确保手臂和肘部完整入镜';
      def.readinessStatus = 'too_close_missing_arm';
      def.blockingReason = 'too_close_or_arm_out_of_frame';
      def.formRating = 'warning';
      def.shoulderWidthRatio = Number(shoulderWidthRatio.toFixed(3));
      def.distanceStatus = 'ใกล้เกินไป (>50%)';
      return def;
    }

    // 3. Framing Gate: Standing too far (< 18% shoulder width)
    const isHorizontallySeparated = Math.abs(shoulder.x - oppShoulder.x) >= 0.08;
    if (isHorizontallySeparated && shoulderWidthRatio < 0.18) {
      const def = this.createDefaultResult(
        landmarks,
        'ขยับเข้ามาใกล้กล้องอีกนิด'
      );
      def.phase = 'WAITING_FOR_FRAMING';
      def.coachingMessageEn = 'Move slightly closer to the camera';
      def.coachingMessageCn = '请靠近摄像头一些';
      def.readinessStatus = 'too_far';
      def.blockingReason = 'patient_too_far';
      def.formRating = 'warning';
      def.shoulderWidthRatio = Number(shoulderWidthRatio.toFixed(3));
      def.distanceStatus = 'ไกลเกินไป (<18%)';
      return def;
    }

    const isUpperBodyMode = !isElbowUsable;

    // 5. Clinical Kinematic Tracking
    const effectiveElbow: PoseEngineLandmark = isUpperBodyMode
      ? { x: shoulder.x, y: shoulder.y + 0.15, z: shoulder.z ?? 0, visibility: 0.85 }
      : elbow!;
    const effectiveWrist: PoseEngineLandmark = isUpperBodyMode
      ? { x: shoulder.x, y: shoulder.y + 0.30, z: shoulder.z ?? 0, visibility: 0.85 }
      : (isWristUsable ? wrist! : elbow!);

    const hasHip = Boolean(hip && isLandmarkUsable(hip, 0.30));

    // In upper body mode without hips, synthesize forward lean within safe bounds
    const effectiveHip: PoseEngineLandmark | undefined = hasHip
      ? hip
      : isUpperBodyMode
      ? { x: shoulder.x, y: shoulder.y + 0.35, z: (shoulder.z ?? 0) + 0.16, visibility: 0.85 }
      : undefined;

    const result = this.pendulumAnalyzer.update({
      shoulder: isUpperBodyMode ? { x: oppShoulder.x, y: oppShoulder.y, z: oppShoulder.z ?? 0 } : shoulder!,
      elbow: effectiveElbow,
      wrist: effectiveWrist,
      hip: effectiveHip,
      oppositeShoulder: oppShoulder,
      timestampMs,
    });

    if (result.completedRep) {
      const nowMs = timestampMs;
      if (nowMs - this.lastRepCompletedTimeMs >= 350 && !this.isSetCompleted) {
        this.completedReps++;
        this.lastRepCompletedTimeMs = nowMs;
        if (this.completedReps >= targetReps) {
          this.isSetCompleted = true;
          if (this.currentSet >= totalSets) {
            this.isExerciseCompleted = true;
          }
        }
      }
    }

    let coachingMessage = 'ตำแหน่งพอดี เริ่มแกว่งแขนเป็นวงกลมผ่อนคลายได้เลย';
    let formRating: 'good' | 'warning' | 'error' = 'good';
    const activeWarnings: ActiveCompensationWarning[] = [];

    if (isUpperBodyMode) {
      formRating = 'good';
      if (result.cycleProgressRatio > 0) {
        coachingMessage = `💡 โหมดครึ่งตัวบน: กำลังวิเคราะห์การแกว่งหัวไหล่ (${Math.round(result.cycleProgressRatio * 100)}%)`;
      } else {
        coachingMessage = '💡 โหมดครึ่งตัวบน: ตรวจจับเฉพาะช่วงไหล่ — ขยับหัวไหล่ตามจังหวะเพื่อฝึกได้เลย';
      }
    } else if (result.warningTh) {
      coachingMessage = result.warningTh;
      formRating = 'warning';
      activeWarnings.push({
        ruleId: 'pendulum_biomechanic_warning',
        type: 'trunk_lean',
        messageTh: result.warningTh,
        severity: 'warning',
        currentValue: Math.round(result.trunkTiltDeg),
        thresholdValue: this.config.pendulumMechanics?.minTrunkForwardTiltDeg || 18,
      });
    } else if (result.cycleProgressRatio > 0) {
      coachingMessage = `แกว่งแขนผ่อนคลายต่อเนื่อง... (${Math.round(result.cycleProgressRatio * 100)}%)`;
    }

    const accuracyPercent = Math.min(100, Math.round((result.cycleProgressRatio || 0) * 100));
    const readinessStatus: RepEvaluationResult['readinessStatus'] = isUpperBodyMode
      ? 'partial_upper_body'
      : 'ready';

    return {
      phase: result.cycleProgressRatio > 0 ? 'MOVING_TO_TARGET' : 'IDLE',
      currentAngleDeg: Math.round(result.instantaneousPhaseDeg),
      targetAngleDeg: 360,
      accuracyPercent,
      accuracyPct: accuracyPercent,
      severity: formRating,
      holdProgressRatio: 0,
      pendulumCircleProgressRatio: result.cycleProgressRatio,
      isInsideTargetZone: false,
      isExceedingSafetyCap: false,
      completedReps: this.completedReps,
      incorrectReps: this.incorrectReps,
      targetReps,
      currentSet: this.currentSet,
      totalSets,
      isSetCompleted: this.isSetCompleted,
      isExerciseCompleted: this.isExerciseCompleted,
      coachingMessageTh: coachingMessage,
      coachingMessageEn: isUpperBodyMode
        ? result.cycleProgressRatio > 0
          ? `💡 Upper-body mode: tracking shoulder swing (${Math.round(result.cycleProgressRatio * 100)}%)`
          : '💡 Upper-body partial detection active — move your shoulder and upper arm rhythmically.'
        : undefined,
      coachingMessageCn: isUpperBodyMode
        ? result.cycleProgressRatio > 0
          ? `💡 半身模式：正在分析肩部摆动 (${Math.round(result.cycleProgressRatio * 100)}%)`
          : '💡 半身检测模式已启用 — 请按节奏活动肩部和上臂。'
        : undefined,
      activeWarnings,
      formRating,
      instantaneousVelocity: 0,
      isOccluded: lockResult?.isOccluded ?? false,
      occlusionReasonTh: lockResult?.occlusionReasonTh,
      isSubjectLocked: lockResult?.isSubjectLocked ?? true,
      isFrameDropped: lockResult?.isFrameDropped ?? false,
      frameDropReason: lockResult?.frameDropReason,
      readinessStatus,
      distanceStatus: isUpperBodyMode
        ? 'โหมดครึ่งตัวบน'
        : isWristUsable
        ? 'ตำแหน่งพอดี (30-50%)'
        : 'ติดตามข้อศอก',
      shoulderWidthRatio: Number(shoulderWidthRatio.toFixed(3)),
      hysteresisState: result.hysteresisState,
      normalizedSignal: result.normalizedSignal,
      calibratedThreshold: result.calibratedThreshold,
      blockingReason: result.blockingReason,
      filteredLandmarks: landmarks,
    };
  }

  /**
   * Evaluates Timer-based Exercises (Chin Tuck pacing & Codman Pendulum timed duration)
   */
  private evaluateTimerMode(
    landmarks: PoseEngineLandmark[],
    timestampMs: number,
    _lockResult?: SubjectLockResult
  ): RepEvaluationResult {
    const targetReps = this.config.defaultPrescription?.repsPerSet || 10;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;
    const durationSec = this.config.defaultDurationSec || this.config.defaultPrescription?.durationSec;

    if (this.timerStartTimeMs === null) {
      this.timerStartTimeMs = timestampMs;
    }

    let accuracyPercent = 100;
    let holdProgressRatio = 0.0;
    let pendulumCircleProgressRatio = 0.0;
    let coachingMessage = '';
    let coachingMessageEn = '';
    let coachingMessageCn = '';

    if (durationSec && durationSec > 0) {
      // Continuous timed exercise (e.g. Codman Shoulder Pendulum 45s)
      const elapsedSec = (timestampMs - this.timerStartTimeMs) / 1000.0;
      const remainingSec = Math.max(0, Math.ceil(durationSec - elapsedSec));
      pendulumCircleProgressRatio = Math.min(1.0, elapsedSec / durationSec);
      holdProgressRatio = pendulumCircleProgressRatio;

      if (elapsedSec >= durationSec) {
        this.completedReps = 1;
        this.isSetCompleted = true;
        if (this.currentSet >= totalSets) {
          this.isExerciseCompleted = true;
        }
        this.phase = 'REP_COMPLETED';
        coachingMessage = `ครบเวลา ${durationSec} วินาทีเรียบร้อยแล้ว!`;
        coachingMessageEn = `Completed full ${durationSec} seconds!`;
        coachingMessageCn = `已完成全套 ${durationSec} 秒训练！`;
      } else {
        this.phase = 'HOLDING_TARGET';
        coachingMessage = `โน้มตัวไปข้างหน้า ปล่อยแขนแกว่งเป็นวงกลมผ่อนคลาย (เหลืออีก ${remainingSec} วินาที)`;
        coachingMessageEn = `Lean forward, let arm swing loose (remaining: ${remainingSec}s)`;
        coachingMessageCn = `微前倾，手臂自然画圈放松（剩余 ${remainingSec} 秒）`;
      }
    } else {
      // Repetition & hold pacing cycle (e.g. Chin Tuck: 2s prep -> 5s hold -> 2s relax)
      const holdDuration = this.config.defaultHoldSec || this.config.defaultPrescription?.holdDurationSec || 5.0;
      const prepDuration = 2.0;
      const relaxDuration = 2.0;
      const cycleTotal = prepDuration + holdDuration + relaxDuration; // e.g. 9.0s

      const totalElapsedMs = timestampMs - this.timerStartTimeMs;
      const cycleElapsedSec = (totalElapsedMs % (cycleTotal * 1000)) / 1000.0;
      const currentCycle = Math.floor(totalElapsedMs / (cycleTotal * 1000));

      if (currentCycle > this.completedReps && this.completedReps < targetReps) {
        this.completedReps = Math.min(targetReps, currentCycle);
        if (this.completedReps >= targetReps) {
          this.isSetCompleted = true;
          if (this.currentSet >= totalSets) {
            this.isExerciseCompleted = true;
          }
        }
      }

      if (this.isSetCompleted) {
        this.phase = 'REP_COMPLETED';
        holdProgressRatio = 1.0;
        coachingMessage = `ครบ ${targetReps} ครั้งแล้ว! ทำได้ดีมาก`;
        coachingMessageEn = `Set completed! ${targetReps}/${targetReps}`;
        coachingMessageCn = `整组完成！ ${targetReps}/${targetReps}`;
      } else if (cycleElapsedSec < prepDuration) {
        this.phase = 'MOVING_TO_TARGET';
        holdProgressRatio = 0.0;
        coachingMessage = 'เตรียมตัว: ตามองตรง ดึงคางและศีรษะเข้าหาลำคอในแนวราบ';
        coachingMessageEn = 'Prepare: Retract chin horizontally backward';
        coachingMessageCn = '准备：水平向后收紧下巴';
      } else if (cycleElapsedSec < prepDuration + holdDuration) {
        this.phase = 'HOLDING_TARGET';
        const activeHoldSec = cycleElapsedSec - prepDuration;
        holdProgressRatio = Math.min(1.0, activeHoldSec / holdDuration);
        const remainingHold = Math.max(0, holdDuration - activeHoldSec).toFixed(1);
        coachingMessage = `ค้างท่าเก็บเหนียงไว้... (อีก ${remainingHold} วินาที)`;
        coachingMessageEn = `Hold chin tuck... (${remainingHold}s)`;
        coachingMessageCn = `保持收下颌体位...（还剩 ${remainingHold} 秒）`;
      } else {
        this.phase = 'RETURNING_TO_START';
        holdProgressRatio = 0.0;
        coachingMessage = 'ค่อยๆ ผ่อนคลายกล้ามเนื้อคอช้าๆ';
        coachingMessageEn = 'Slowly relax neck muscles';
        coachingMessageCn = '缓缓放松颈部肌群';
      }
    }

    return {
      phase: this.phase,
      currentAngleDeg: Math.round(holdProgressRatio * 100),
      targetAngleDeg: 100,
      accuracyPercent,
      accuracyPct: accuracyPercent,
      severity: 'good',
      holdProgressRatio,
      pendulumCircleProgressRatio,
      isInsideTargetZone: this.phase === 'HOLDING_TARGET',
      isExceedingSafetyCap: false,
      completedReps: this.completedReps,
      incorrectReps: this.incorrectReps,
      targetReps,
      currentSet: this.currentSet,
      totalSets,
      isSetCompleted: this.isSetCompleted,
      isExerciseCompleted: this.isExerciseCompleted,
      coachingMessageTh: coachingMessage,
      coachingMessageEn,
      coachingMessageCn,
      activeWarnings: [],
      formRating: 'good',
      instantaneousVelocity: 0,
      readinessStatus: 'ready',
      filteredLandmarks: landmarks,
    };
  }

  /**
   * Evaluates Balance & Sustained Stretch Hold Exercises (Single-Leg Stance Balance & Calf Stretch)
   */
  private evaluateHoldBalance(
    landmarks: PoseEngineLandmark[],
    timestampMs: number,
    _lockResult?: SubjectLockResult
  ): RepEvaluationResult {
    const targetReps = this.config.defaultPrescription?.repsPerSet || 3;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;
    const holdTargetSec = this.config.defaultHoldSec || this.config.defaultPrescription?.holdDurationSec || 20.0;

    const isSingleLeg = this.config.id === 'single-leg-balance';
    let isCriteriaMet = false;
    let compWarningTh: string | null = null;
    const activeWarnings: ActiveCompensationWarning[] = [];

    if (isSingleLeg) {
      const ankleL = landmarks[27];
      const ankleR = landmarks[28];
      const kneeL = landmarks[25];
      const kneeR = landmarks[26];

      const isAnkleVisible = (ankleL?.visibility ?? 0) > 0.35 && (ankleR?.visibility ?? 0) > 0.35;
      const ankleDiffY = isAnkleVisible ? Math.abs((ankleL?.y ?? 0) - (ankleR?.y ?? 0)) : 0;
      const isOneLegLifted = ankleDiffY > 0.035 || (Math.abs((kneeL?.y ?? 0) - (kneeR?.y ?? 0)) > 0.05);

      const compResult = this.compensationDetector.evaluate(landmarks, 0, timestampMs);
      const isTiltExcessive = compResult.lateralTiltDeg > 12.0;

      if (isTiltExcessive) {
        compWarningTh = 'รักษาลำตัวและเชิงกรานให้ขนานตรง อย่าเอียงตัว';
        activeWarnings.push({
          ruleId: 'balance_excessive_tilt',
          type: 'trunk_lateral_flexion',
          messageTh: compWarningTh,
          severity: 'warning',
          currentValue: Math.round(compResult.lateralTiltDeg),
          thresholdValue: 12,
        });
      }

      isCriteriaMet = isOneLegLifted && !isTiltExcessive;
    } else {
      // Calf stretch: staggered stance with feet visible
      const heelL = landmarks[29] || landmarks[27];
      const heelR = landmarks[30] || landmarks[28];
      const hasFeetVisible = (heelL?.visibility ?? 0) > 0.35 && (heelR?.visibility ?? 0) > 0.35;
      isCriteriaMet = hasFeetVisible;
    }

    let coachingMessage = '';
    let holdProgressRatio = 0.0;

    if (isCriteriaMet) {
      if (this.balanceHoldStartTimeMs === null) {
        this.balanceHoldStartTimeMs = timestampMs;
      }
      const currentHoldElapsed = (timestampMs - this.balanceHoldStartTimeMs + this.balanceHoldAccumulatedMs) / 1000.0;
      holdProgressRatio = Math.min(1.0, currentHoldElapsed / holdTargetSec);
      this.phase = 'HOLDING_TARGET';

      if (currentHoldElapsed >= holdTargetSec) {
        this.completedReps++;
        this.balanceHoldStartTimeMs = null;
        this.balanceHoldAccumulatedMs = 0;
        this.phase = 'REP_COMPLETED';
        coachingMessage = `ครบ 1 ครั้ง! ทรงตัวได้ดีมาก (${this.completedReps}/${targetReps})`;

        if (this.completedReps >= targetReps) {
          this.isSetCompleted = true;
          if (this.currentSet >= totalSets) {
            this.isExerciseCompleted = true;
          }
        }
      } else {
        const remaining = Math.max(0, holdTargetSec - currentHoldElapsed).toFixed(1);
        coachingMessage = isSingleLeg
          ? `ทรงตัวขาเดียวให้นิ่ง... ค้างไว้อีก ${remaining} วินาที`
          : `ยืดน่องให้ตึงพอดี... ค้างไว้อีก ${remaining} วินาที`;
      }
    } else {
      if (this.balanceHoldStartTimeMs !== null) {
        this.balanceHoldAccumulatedMs += (timestampMs - this.balanceHoldStartTimeMs);
        this.balanceHoldStartTimeMs = null;
      }
      this.phase = 'MOVING_TO_TARGET';
      coachingMessage = compWarningTh
        ? `⚠️ ${compWarningTh}`
        : (isSingleLeg ? 'ยกขาข้างหนึ่งขึ้นเพื่อเริ่มทรงตัว' : 'ก้าวขาไปด้านหลัง วางส้นเท้าติดพื้นเพื่อเริ่มยืด');
    }

    const accuracyPercent = Math.round(holdProgressRatio * 100);

    return {
      phase: this.phase,
      currentAngleDeg: Math.round(holdProgressRatio * holdTargetSec),
      targetAngleDeg: Math.round(holdTargetSec),
      accuracyPercent,
      accuracyPct: accuracyPercent,
      severity: activeWarnings.length > 0 ? 'warning' : 'good',
      holdProgressRatio,
      pendulumCircleProgressRatio: 0,
      isInsideTargetZone: this.phase === 'HOLDING_TARGET',
      isExceedingSafetyCap: false,
      completedReps: this.completedReps,
      incorrectReps: this.incorrectReps,
      targetReps,
      currentSet: this.currentSet,
      totalSets,
      isSetCompleted: this.isSetCompleted,
      isExerciseCompleted: this.isExerciseCompleted,
      coachingMessageTh: coachingMessage,
      activeWarnings,
      formRating: activeWarnings.length > 0 ? 'warning' : 'good',
      instantaneousVelocity: 0,
      readinessStatus: 'ready',
      filteredLandmarks: landmarks,
    };
  }

  private createDefaultResult(
    landmarks: PoseEngineLandmark[],
    message: string
  ): RepEvaluationResult {
    return {
      phase: 'IDLE',
      currentAngleDeg: 0,
      targetAngleDeg: 0,
      accuracyPercent: 0,
      accuracyPct: 0,
      severity: 'good',
      holdProgressRatio: 0,
      pendulumCircleProgressRatio: 0,
      isInsideTargetZone: false,
      isExceedingSafetyCap: false,
      completedReps: this.completedReps,
      incorrectReps: this.incorrectReps,
      targetReps: this.config.defaultPrescription?.repsPerSet || 10,
      currentSet: this.currentSet,
      totalSets: this.config.defaultPrescription?.totalSets || 3,
      isSetCompleted: this.isSetCompleted,
      isExerciseCompleted: this.isExerciseCompleted,
      coachingMessage: message,
      coachingMessageTh: message,
      activeWarnings: [],
      formRating: 'good',
      instantaneousVelocity: 0,
      filteredLandmarks: landmarks,
    };
  }

  public nextSet(): void {
    this.currentSet++;
    this.completedReps = 0;
    this.isSetCompleted = false;
    this.phase = 'IDLE';
    this.holdStartTimeMs = null;
    this.holdPauseStartMs = null;
    this.totalHoldPausedDurationMs = 0;
    this.lastRepCompletedTimeMs = 0;
    this.baselineHeelY = null;
    this.baselineHipY = null;
    this.timerStartTimeMs = null;
    this.balanceHoldStartTimeMs = null;
    this.balanceHoldAccumulatedMs = 0;
    this.pendulumAnalyzer.reset();
  }

  public reset(): void {
    this.phase = 'IDLE';
    this.completedReps = 0;
    this.incorrectReps = 0;
    this.currentSet = 1;
    this.holdStartTimeMs = null;
    this.holdPauseStartMs = null;
    this.totalHoldPausedDurationMs = 0;
    this.lastEvaluationResult = null;
    this.maxAngleAchievedDeg = 0;
    this.recordedAnglesSum = 0;
    this.recordedAnglesCount = 0;
    this.isSetCompleted = false;
    this.isExerciseCompleted = false;
    this.lastRepCompletedTimeMs = 0;
    this.baselineHeelY = null;
    this.baselineHipY = null;
    this.timerStartTimeMs = null;
    this.balanceHoldStartTimeMs = null;
    this.balanceHoldAccumulatedMs = 0;
    this.skeletonFilter.reset();
    this.pendulumAnalyzer.reset();
    this.compensationDetector.reset();
    this.subjectLocker.reset();
  }
}
