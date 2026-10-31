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

  constructor(config: ExerciseDetectionConfig) {
    this.config = config;
    this.skeletonFilter = new PoseSkeletonFilter(1.2, 0.04);
    this.pendulumAnalyzer = new ShoulderPendulumAnalyzer(config.pendulumMechanics);
    const maxSafeVelocity = config.safetyContraindications?.maxSafeVelocityDegPerSec;
    this.compensationDetector = new CompensationDetector(config.compensationRules, maxSafeVelocity);
    this.subjectLocker = new ForegroundSubjectLocker();
  }

  public updateConfig(config: ExerciseDetectionConfig): void {
    this.config = config;
    if (config.pendulumMechanics) {
      this.pendulumAnalyzer = new ShoulderPendulumAnalyzer(config.pendulumMechanics);
    }
    const maxSafeVelocity = config.safetyContraindications?.maxSafeVelocityDegPerSec;
    this.compensationDetector.setMaxSafeVelocity(maxSafeVelocity);
    this.compensationDetector.setRules(config.compensationRules);
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

    const isInFrame = (lm?: PoseEngineLandmark) =>
      Boolean(lm && lm.x >= 0.02 && lm.x <= 0.98 && lm.y >= 0.02 && lm.y <= 0.98);
    const isVisible = (lm?: PoseEngineLandmark) =>
      Boolean(lm && (lm.visibility ?? 1.0) >= 0.40 && isInFrame(lm));

    if (framing === 'full_body' || framing === 'lower_body') {
      // Lower body requires hips (23, 24), knees (25, 26), ankles (27, 28)
      const hasLeftLower = isVisible(landmarks[23]) && isVisible(landmarks[25]) && isVisible(landmarks[27]);
      const hasRightLower = isVisible(landmarks[24]) && isVisible(landmarks[26]) && isVisible(landmarks[28]);

      if (!hasLeftLower && !hasRightLower) {
        const def = this.createDefaultResult(
          landmarks,
          '📷 ท่านี้ต้องเห็นช่วงขาและข้อเท้า กรุณาถอยห่างจากกล้องประมาณ 2–2.5 เมตรให้เห็นเต็มตัว'
        );
        def.coachingMessageEn = '📷 Full lower body required. Please step back 2–2.5 meters so hips, knees, and ankles are visible.';
        def.coachingMessageCn = '📷 此动作需要看到腿部和脚踝，请后退 2–2.5 米以显示全身。';
        def.readinessStatus = 'missing_lower_body';
        def.formRating = 'warning';
        return def;
      }
    } else if (framing === 'head_shoulders') {
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
    } else if (framing === 'upper_body' && this.config.evaluationMode !== 'pendulum_circular') {
      const hasShoulder = isVisible(landmarks[11]) || isVisible(landmarks[12]);
      if (!hasShoulder) {
        const def = this.createDefaultResult(
          landmarks,
          '📷 ไม่พบหัวไหล่ในภาพ กรุณาถอยห่างจากกล้องประมาณ 1.5–2 เมตร'
        );
        def.coachingMessageEn = '📷 Shoulder not detected. Please step back 1.5–2 meters.';
        def.coachingMessageCn = '📷 未检测到肩部，请后退1.5-2米。';
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
    if (
      normalizedLandmarks.length > triplet.pointA &&
      normalizedLandmarks.length > triplet.vertex &&
      normalizedLandmarks.length > triplet.pointB
    ) {
      const pA = normalizedLandmarks[triplet.pointA];
      const pV = normalizedLandmarks[triplet.vertex];
      const pB = normalizedLandmarks[triplet.pointB];

      currentAngle = triplet.use3DWorld
        ? calculateAngle3D(pA, pV, pB)
        : calculateAngle2D(pA, pV, pB);
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
      if (currentAngle >= startAngle) {
        accuracyPercent = 0;
      } else if (currentAngle <= targetMax) {
        accuracyPercent = 100;
      } else {
        accuracyPercent = Math.min(
          100,
          Math.max(0, Math.round(((startAngle - currentAngle) / (startAngle - targetMax)) * 100))
        );
      }
    } else {
      if (currentAngle <= startAngle) {
        accuracyPercent = 0;
      } else if (currentAngle >= targetMin) {
        accuracyPercent = 100;
      } else {
        accuracyPercent = Math.min(
          100,
          Math.max(0, Math.round(((currentAngle - startAngle) / (targetMin - startAngle)) * 100))
        );
      }
    }

    const isInsideTargetZone = isDecreasing
      ? currentAngle <= targetMax + tolerance && currentAngle >= targetMin - tolerance
      : currentAngle >= targetMin - tolerance && currentAngle <= targetMax + tolerance;

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

    let coachingMessage = 'เริ่มขยับข้อต่อเข้าสู่มุมเป้าหมาย';
    let holdProgressRatio = 0.0;
    let formRating: 'good' | 'warning' | 'error' = 'good';
    let isRepRejected = false;
    let repRejectionReasonTh: string | undefined = undefined;

    if (isExceedingSafetyCap) {
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
        } else if (isAtStartZone) {
          coachingMessage = 'อยู่ในตำแหน่งเริ่มต้น พร้อมแล้วเริ่มเคลื่อนไหวได้เลย';
        } else if (isDecreasing ? currentAngle < startAngle - tolerance : currentAngle > startAngle + tolerance) {
          this.phase = 'MOVING_TO_TARGET';
          coachingMessage = 'เคลื่อนไหวเข้าสู่มุมเป้าหมายอย่างช้าๆ';
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
          // Pause hold timer if subject is occluded
          const isOccluded = lockResult?.isOccluded ?? false;
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

          if (this.compensationDetector.getVelocityGuard().hasRepViolation()) {
            // Rep rejected due to excessive velocity / jerky movement
            this.incorrectReps++;
            this.phase = 'REP_COMPLETED';
            isRepRejected = true;
            repRejectionReasonTh = 'เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ';
            coachingMessage = '⚠️ ท่าไม่ผ่าน: เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ';
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

    // Occlusion warning check
    if (lockResult?.isOccluded) {
      formRating = 'warning';
      coachingMessage = 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน';
      activeWarnings.push({
        ruleId: 'subject_occlusion_guard',
        type: 'trunk_lean',
        messageTh: 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน',
        severity: 'warning',
        currentValue: lockResult.averageVisibility,
        thresholdValue: 0.65,
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
      readinessStatus: 'ready',
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
   * Evaluates Shoulder Pendulum circular trajectory
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
    const hIdx = isRight ? 24 : 23;

    const isInFrame = (lm?: PoseEngineLandmark) =>
      Boolean(lm && lm.x >= 0.02 && lm.x <= 0.98 && lm.y >= 0.02 && lm.y <= 0.98);
    const isVisible = (lm?: PoseEngineLandmark) =>
      Boolean(lm && (lm.visibility ?? 1.0) >= 0.40 && isInFrame(lm));

    const shoulder = landmarks[sIdx];
    const elbow = landmarks[eIdx];
    const wrist = landmarks[wIdx];
    const hip = landmarks[hIdx] || (shoulder ? { x: shoulder.x, y: shoulder.y + 0.35, z: shoulder.z ?? 0 } : undefined);

    if (!shoulder || !isVisible(shoulder)) {
      const def = this.createDefaultResult(
        landmarks,
        '📷 ไม่พบหัวไหล่ในภาพ กรุณาถอยห่างจากกล้องประมาณ 1.5–2 เมตร'
      );
      def.readinessStatus = 'missing_shoulder';
      def.formRating = 'warning';
      return def;
    }

    if (!elbow || !wrist || !isVisible(elbow) || !isVisible(wrist)) {
      const def = this.createDefaultResult(
        landmarks,
        '📷 ไม่พบข้อศอกและข้อมือข้างที่ฝึก กรุณาถอยห่างจากกล้องหรือปรับมุมกล้องให้เห็นแขนตั้งแต่ไหล่ถึงข้อมือ'
      );
      def.readinessStatus = 'missing_arm_landmarks';
      def.formRating = 'warning';
      return def;
    }

    const effectiveHip = (hip && isVisible(hip))
      ? hip
      : { x: shoulder.x, y: shoulder.y + 0.35, z: shoulder.z ?? 0, visibility: 0.9 };

    const result = this.pendulumAnalyzer.update({
      shoulder,
      elbow,
      wrist,
      hip: effectiveHip,
      timestampMs,
    });

    if (result.completedRep) {
      const nowMs = timestampMs;
      if (nowMs - this.lastRepCompletedTimeMs >= 350) {
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

    let coachingMessage = 'แกว่งแขนเบาๆ เป็นวงกลมตามแรงโน้มถ่วง';
    let formRating: 'good' | 'warning' | 'error' = 'good';
    const activeWarnings: ActiveCompensationWarning[] = [];

    if (lockResult?.isOccluded) {
      formRating = 'warning';
      coachingMessage = 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน';
      activeWarnings.push({
        ruleId: 'pendulum_occlusion_guard',
        type: 'trunk_lean',
        messageTh: 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน',
        severity: 'warning',
        currentValue: lockResult.averageVisibility,
        thresholdValue: 0.65,
      });
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
      coachingMessage = `แกว่งเป็นวงกลมต่อเนื่อง... (${Math.round(result.cycleProgressRatio * 100)}%)`;
    }

    const accuracyPercent = Math.min(100, Math.round((result.cycleProgressRatio || 0) * 100));

    return {
      phase: result.cycleProgressRatio > 0 ? 'MOVING_TO_TARGET' : 'IDLE',
      currentAngleDeg: Math.round(result.instantaneousPhaseDeg),
      targetAngleDeg: 360,
      accuracyPercent,
      accuracyPct: accuracyPercent,
      severity: formRating,
      holdProgressRatio: 0,
      pendulumCircleProgressRatio: result.cycleProgressRatio,
      isInsideTargetZone: result.isTrunkValid && result.isElbowRelaxed,
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
      formRating,
      instantaneousVelocity: 0,
      isOccluded: lockResult?.isOccluded ?? false,
      occlusionReasonTh: lockResult?.occlusionReasonTh,
      isSubjectLocked: lockResult?.isSubjectLocked ?? true,
      isFrameDropped: lockResult?.isFrameDropped ?? false,
      frameDropReason: lockResult?.frameDropReason,
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
    this.skeletonFilter.reset();
    this.pendulumAnalyzer.reset();
    this.compensationDetector.reset();
    this.subjectLocker.reset();
  }
}
