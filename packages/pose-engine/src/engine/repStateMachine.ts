/**
 * packages/pose-engine/src/engine/repStateMachine.ts
 *
 * DETERMINISTIC CLINICAL REP STATE MACHINE & FEEDBACK GENERATOR
 * Handles:
 * 1. 'angle_rep_hold': IDLE -> MOVING_TO_TARGET -> HOLDING_TARGET -> RETURNING_TO_START -> +1 Rep
 * 2. 'pendulum_circular': Delegates to ShoulderPendulumAnalyzer with 360° phase unwrapping
 * 3. Form warnings, safety angle cap enforcement, and set/exercise transitions.
 */

import {
  ExerciseDetectionConfig,
  PoseEngineLandmark,
  RepEvaluationResult,
  RepPhase,
  ActiveCompensationWarning,
} from '../types/exerciseConfig';
import { calculateAngle3D, calculateAngle2D } from '../math/geometry3d';
import { PoseSkeletonFilter } from '../math/filters';
import { ShoulderPendulumAnalyzer } from '../math/pendulumAnalyzer';
import { CompensationDetector } from './compensationDetector';

export class RepStateMachine {
  private config: ExerciseDetectionConfig;
  private phase: RepPhase = 'IDLE';
  private skeletonFilter: PoseSkeletonFilter;
  private pendulumAnalyzer: ShoulderPendulumAnalyzer;
  private compensationDetector: CompensationDetector;

  private completedReps: number = 0;
  private incorrectReps: number = 0;
  private currentSet: number = 1;
  private holdStartTimeMs: number | null = null;
  private maxAngleAchievedDeg: number = 0;
  private recordedAnglesSum: number = 0;
  private recordedAnglesCount: number = 0;
  private isSetCompleted: boolean = false;
  private isExerciseCompleted: boolean = false;

  constructor(config: ExerciseDetectionConfig) {
    this.config = config;
    this.skeletonFilter = new PoseSkeletonFilter(1.2, 0.04);
    this.pendulumAnalyzer = new ShoulderPendulumAnalyzer(config.pendulumMechanics);
    this.compensationDetector = new CompensationDetector(config.compensationRules);
  }

  public updateConfig(config: ExerciseDetectionConfig): void {
    this.config = config;
    if (config.pendulumMechanics) {
      this.pendulumAnalyzer = new ShoulderPendulumAnalyzer(config.pendulumMechanics);
    }
    this.compensationDetector.setRules(config.compensationRules);
  }

  public evaluate(
    rawLandmarks: PoseEngineLandmark[],
    timestampMs: number = Date.now()
  ): RepEvaluationResult {
    // 1. Filter raw landmarks using 1€ filter
    const filteredLandmarks = this.skeletonFilter.filterSkeleton(rawLandmarks, timestampMs);

    // Branch based on evaluationMode
    if (this.config.evaluationMode === 'pendulum_circular') {
      return this.evaluatePendulumCircular(filteredLandmarks, timestampMs);
    } else {
      return this.evaluateAngleRepHold(filteredLandmarks, timestampMs);
    }
  }

  /**
   * Evaluates standard angle-based hold exercise
   */
  private evaluateAngleRepHold(
    landmarks: PoseEngineLandmark[],
    timestampMs: number
  ): RepEvaluationResult {
    const angleCfg = this.config.angleMechanics;
    const targetReps = this.config.defaultPrescription?.repsPerSet || 10;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;

    if (!angleCfg) {
      return this.createDefaultResult(landmarks, 'ยังไม่ได้กำหนดค่ามุมสำหรับท่านี้');
    }

    // Resolve side triplet
    const triplet =
      this.config.side === 'right' ? angleCfg.landmarks.right : angleCfg.landmarks.left;

    let currentAngle = 0;
    if (
      landmarks.length > triplet.pointA &&
      landmarks.length > triplet.vertex &&
      landmarks.length > triplet.pointB
    ) {
      const pA = landmarks[triplet.pointA];
      const pV = landmarks[triplet.vertex];
      const pB = landmarks[triplet.pointB];

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
    const safetyCap = this.config.safetyContraindications?.maxSafeAngleCapDeg || 170;
    const isExceedingSafetyCap = currentAngle > safetyCap;

    // Target zone parameters
    const startAngle = angleCfg.startAngleDeg;
    const targetMin = angleCfg.targetMinDeg;
    const targetMax = angleCfg.targetMaxDeg;
    const tolerance = angleCfg.toleranceDeg || 10;
    const holdDurationSec = angleCfg.holdDurationSec || 2.0;

    const isInsideTargetZone =
      currentAngle >= targetMin - tolerance && currentAngle <= targetMax + tolerance;
    const isAtStartZone = Math.abs(currentAngle - startAngle) <= tolerance + 5;

    // Check compensation rules
    const activeWarnings = this.compensationDetector.evaluate(
      landmarks,
      currentAngle,
      timestampMs
    );

    let coachingMessage = 'เริ่มขยับข้อต่อเข้าสู่มุมเป้าหมาย';
    let holdProgressRatio = 0.0;
    let formRating: 'good' | 'warning' | 'error' = 'good';

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
    } else if (activeWarnings.some((w) => w.severity === 'error')) {
      formRating = 'error';
      coachingMessage = activeWarnings[0].messageTh;
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
          coachingMessage = `ถึงมุมเป้าหมายแล้ว ค้างไว้ ${holdDurationSec} วินาที`;
        } else if (isAtStartZone) {
          coachingMessage = 'อยู่ในตำแหน่งเริ่มต้น พร้อมแล้วเริ่มเคลื่อนไหวได้เลย';
        } else if (currentAngle > startAngle + tolerance) {
          this.phase = 'MOVING_TO_TARGET';
          coachingMessage = 'เคลื่อนไหวเข้าสู่มุมเป้าหมายอย่างช้าๆ';
        }
        break;
      }

      case 'MOVING_TO_TARGET': {
        if (isInsideTargetZone) {
          this.phase = 'HOLDING_TARGET';
          this.holdStartTimeMs = timestampMs;
          coachingMessage = `ถึงมุมเป้าหมายแล้ว ค้างไว้ ${holdDurationSec} วินาที`;
        } else if (currentAngle < targetMin - tolerance) {
          coachingMessage = 'ขยับเพิ่มอีกนิด ให้ถึงแถบสีเขียว';
        } else if (currentAngle > targetMax + tolerance && !isExceedingSafetyCap) {
          coachingMessage = 'ลดระดับลงเล็กน้อย ให้อยู่ในแถบสีเขียว';
        }
        break;
      }

      case 'HOLDING_TARGET': {
        if (!isInsideTargetZone) {
          // Patient fell out of target zone before finishing hold
          this.holdStartTimeMs = null;
          this.phase = 'MOVING_TO_TARGET';
          coachingMessage = 'หลุดออกจากมุมเป้าหมาย ขยับกลับเข้าแถบสีเขียว';
        } else {
          const elapsedSec = (timestampMs - (this.holdStartTimeMs || timestampMs)) / 1000.0;
          holdProgressRatio = Math.min(1.0, elapsedSec / Math.max(0.1, holdDurationSec));

          if (elapsedSec >= holdDurationSec) {
            this.phase = 'RETURNING_TO_START';
            this.holdStartTimeMs = null;
            coachingMessage = 'ยอดเยี่ยม! ค่อยๆ ผ่อนกลับสู่ตำแหน่งเริ่มต้น';
          } else {
            const remainingSec = Math.max(0, holdDurationSec - elapsedSec).toFixed(1);
            coachingMessage = `ค้างไว้อีก ${remainingSec} วินาที...`;
          }
        }
        break;
      }

      case 'RETURNING_TO_START': {
        if (isAtStartZone) {
          // Rep completed successfully!
          this.completedReps++;
          this.phase = 'REP_COMPLETED';
          coachingMessage = `ครบ 1 ครั้ง! (${this.completedReps}/${targetReps})`;

          if (this.completedReps >= targetReps) {
            this.isSetCompleted = true;
            if (this.currentSet >= totalSets) {
              this.isExerciseCompleted = true;
            }
          }
        } else {
          coachingMessage = 'ผ่อนกลับสู่ตำแหน่งเริ่มต้นให้สุด';
        }
        break;
      }

      case 'REP_COMPLETED': {
        this.phase = 'MOVING_TO_TARGET';
        break;
      }
    }

    // Safety cap and error warnings ALWAYS take precedence over phase coaching
    if (isExceedingSafetyCap) {
      coachingMessage = '⚠️ สูงเกินไปแล้ว ค่อยๆ ลดระดับลงเพื่อความปลอดภัย';
    } else if (activeWarnings.some((w) => w.severity === 'error')) {
      coachingMessage = activeWarnings.find((w) => w.severity === 'error')!.messageTh;
    }

    return {
      phase: this.phase,
      currentAngleDeg: Math.round(currentAngle),
      targetAngleDeg: targetMin,
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
      instantaneousVelocity: 0,
      filteredLandmarks: landmarks,
    };
  }

  /**
   * Evaluates Shoulder Pendulum circular trajectory
   */
  private evaluatePendulumCircular(
    landmarks: PoseEngineLandmark[],
    timestampMs: number
  ): RepEvaluationResult {
    const targetReps = this.config.defaultPrescription?.repsPerSet || 10;
    const totalSets = this.config.defaultPrescription?.totalSets || 3;

    // Landmark indices for shoulder pendulum:
    // Left side: Shoulder 11, Elbow 13, Wrist 15, Hip 23
    // Right side: Shoulder 12, Elbow 14, Wrist 16, Hip 24
    const isRight = this.config.side === 'right';
    const sIdx = isRight ? 12 : 11;
    const eIdx = isRight ? 14 : 13;
    const wIdx = isRight ? 16 : 15;
    const hIdx = isRight ? 24 : 23;

    if (landmarks.length <= Math.max(sIdx, eIdx, wIdx, hIdx)) {
      return this.createDefaultResult(landmarks, 'กำลังค้นหาตำแหน่งหัวไหล่และแขน...');
    }

    const shoulder = landmarks[sIdx];
    const elbow = landmarks[eIdx];
    const wrist = landmarks[wIdx];
    const hip = landmarks[hIdx];

    const result = this.pendulumAnalyzer.update({
      shoulder,
      elbow,
      wrist,
      hip,
      timestampMs,
    });

    if (result.completedRep) {
      this.completedReps++;
      if (this.completedReps >= targetReps) {
        this.isSetCompleted = true;
        if (this.currentSet >= totalSets) {
          this.isExerciseCompleted = true;
        }
      }
    }

    let coachingMessage = 'แกว่งแขนเบาๆ เป็นวงกลมตามแรงโน้มถ่วง';
    let formRating: 'good' | 'warning' | 'error' = 'good';
    const activeWarnings: ActiveCompensationWarning[] = [];

    if (result.warningTh) {
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

    return {
      phase: result.cycleProgressRatio > 0 ? 'MOVING_TO_TARGET' : 'IDLE',
      currentAngleDeg: Math.round(result.instantaneousPhaseDeg),
      targetAngleDeg: 360,
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
    this.pendulumAnalyzer.reset();
  }

  public reset(): void {
    this.phase = 'IDLE';
    this.completedReps = 0;
    this.incorrectReps = 0;
    this.currentSet = 1;
    this.holdStartTimeMs = null;
    this.maxAngleAchievedDeg = 0;
    this.recordedAnglesSum = 0;
    this.recordedAnglesCount = 0;
    this.isSetCompleted = false;
    this.isExerciseCompleted = false;
    this.skeletonFilter.reset();
    this.pendulumAnalyzer.reset();
    this.compensationDetector.reset();
  }
}
