/**
 * packages/kinematic-replay-3d/src/biomechanicalAnomalyFinder.ts
 *
 * BIOMECHANICAL ANOMALY & MICRO-JERK DETECTOR
 *
 * Evaluates pure kinematic time-series to identify:
 * 1. Angular Jerk Spikes (d³θ/dt³): Highlights sudden involuntary joint stumbling/twitching.
 * 2. Culprit Joint Localization: Pinpoints whether shoulder, elbow, or trunk triggered compensation.
 * 3. Timeline Scrubber Markers: Supplies exact timestamps for interactive 3D scrubbing.
 */

import { KinematicReplaySnapshot } from './ringBuffer';

export interface AnomalyDetectionResult {
  hasAnomaly: boolean;
  anomalyTimestamps: number[];
  anomalyFrameIndices: number[];
  peakJerkFrameIndex: number;
  peakJerkValueDegPerSec3: number;
  peakVelocityDegPerSec: number;
  culpritJoint: string;
  culpritSide: 'left' | 'right' | 'bilateral' | 'trunk';
  descriptionTh: string;
  recommendationTh: string;
}

export interface AnomalyThresholds {
  minJerkThresholdDegPerSec3?: number; // default: 450°/s³
  minVelocityThresholdDegPerSec?: number; // default: 180°/s
  minTrunkTiltSpikeDeg?: number; // default: 15°
}

export function detectBiomechanicalAnomalies(
  snapshot: KinematicReplaySnapshot,
  thresholds: AnomalyThresholds = {}
): AnomalyDetectionResult {
  const minJerk = thresholds.minJerkThresholdDegPerSec3 ?? 450;
  const minVelocity = thresholds.minVelocityThresholdDegPerSec ?? 180;
  const minTrunkSpike = thresholds.minTrunkTiltSpikeDeg ?? 15;

  const frames = snapshot.frames;
  if (!frames || frames.length < 3) {
    return {
      hasAnomaly: false,
      anomalyTimestamps: [],
      anomalyFrameIndices: [],
      peakJerkFrameIndex: 0,
      peakJerkValueDegPerSec3: 0,
      peakVelocityDegPerSec: 0,
      culpritJoint: 'none',
      culpritSide: 'bilateral',
      descriptionTh: 'ข้อมูลเฟรมไม่เพียงพอสำหรับการวิเคราะห์ Jerk เชิงลึก',
      recommendationTh: 'ติดตามการเคลื่อนไหวในรอบถัดไป',
    };
  }

  const anomalyTimestamps: number[] = [];
  const anomalyFrameIndices: number[] = [];
  let peakJerk = 0;
  let peakJerkIndex = 0;
  let peakVelocity = 0;

  // Track joint displacement deltas to isolate culprit joint
  let leftArmDisplacementSpike = 0;
  let rightArmDisplacementSpike = 0;
  let trunkDisplacementSpike = 0;

  // Compute velocities, accelerations, and jerk across frames
  const velocities: number[] = [];
  const accelerations: number[] = [];
  const jerks: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    const curr = frames[i];
    const prev = i > 0 ? frames[i - 1] : curr;
    const dt = Math.max(0.015, (curr.timestampMs - prev.timestampMs) / 1000);

    // 1. Angular velocity
    let v = curr.angularVelocityDegPerSec ?? 0;
    if (v === 0 && curr.currentAngleDeg !== undefined && prev.currentAngleDeg !== undefined) {
      v = Math.abs((curr.currentAngleDeg - prev.currentAngleDeg) / dt);
    }
    velocities.push(v);
    if (v > peakVelocity) peakVelocity = Math.round(v * 10) / 10;

    // 2. Angular acceleration
    let a = 0;
    if (i > 0) {
      a = (velocities[i] - velocities[i - 1]) / dt;
    }
    accelerations.push(a);

    // 3. Angular Jerk (d³θ/dt³)
    let j = 0;
    if (i > 1) {
      j = Math.abs((accelerations[i] - accelerations[i - 1]) / dt);
    }
    jerks.push(j);

    if (j > peakJerk) {
      peakJerk = Math.round(j * 10) / 10;
      peakJerkIndex = i;
    }

    // Check if frame exceeds anomaly thresholds or explicitly triggered pain
    const isJerkAnomaly = j >= minJerk;
    const isVelocityAnomaly = v >= minVelocity;
    const isTrunkAnomaly = (curr.trunkLateralTiltDeg ?? 0) >= minTrunkSpike;
    const isPain = curr.isPainEvent === true;

    if (isJerkAnomaly || isVelocityAnomaly || isTrunkAnomaly || isPain) {
      anomalyTimestamps.push(curr.timestampMs);
      anomalyFrameIndices.push(i);

      // Measure landmark displacements to identify culprit side
      if (curr.landmarks.length >= 25 && prev.landmarks.length >= 25) {
        // Left wrist (15) & Left shoulder (11)
        const leftDelta =
          Math.hypot(
            curr.landmarks[15].x - prev.landmarks[15].x,
            curr.landmarks[15].y - prev.landmarks[15].y
          ) +
          Math.hypot(
            curr.landmarks[11].x - prev.landmarks[11].x,
            curr.landmarks[11].y - prev.landmarks[11].y
          );

        // Right wrist (16) & Right shoulder (12)
        const rightDelta =
          Math.hypot(
            curr.landmarks[16].x - prev.landmarks[16].x,
            curr.landmarks[16].y - prev.landmarks[16].y
          ) +
          Math.hypot(
            curr.landmarks[12].x - prev.landmarks[12].x,
            curr.landmarks[12].y - prev.landmarks[12].y
          );

        // Trunk (mid shoulder 11-12 to mid hip 23-24)
        const trunkDelta = Math.abs((curr.trunkLateralTiltDeg ?? 0) - (prev.trunkLateralTiltDeg ?? 0));

        leftArmDisplacementSpike += leftDelta;
        rightArmDisplacementSpike += rightDelta;
        trunkDisplacementSpike += trunkDelta;
      }
    }
  }

  const hasAnomaly = anomalyFrameIndices.length > 0 || snapshot.hasPainEvent;

  // Determine culprit joint & side
  let culpritSide: 'left' | 'right' | 'bilateral' | 'trunk' = 'bilateral';
  let culpritJoint = 'shoulder';

  if (trunkDisplacementSpike > 20 && trunkDisplacementSpike > leftArmDisplacementSpike && trunkDisplacementSpike > rightArmDisplacementSpike) {
    culpritSide = 'trunk';
    culpritJoint = 'spine_trunk';
  } else if (leftArmDisplacementSpike > rightArmDisplacementSpike * 1.3) {
    culpritSide = 'left';
    culpritJoint = 'left_shoulder_complex';
  } else if (rightArmDisplacementSpike > leftArmDisplacementSpike * 1.3) {
    culpritSide = 'right';
    culpritJoint = 'right_shoulder_complex';
  } else {
    culpritSide = 'bilateral';
    culpritJoint = 'shoulder_girdle';
  }

  let descriptionTh = 'ไม่พบจังหวะกระตุกหรือแรงกระชากที่ผิดปกติ การเคลื่อนไหวราบรื่นตามมาตรฐานชีวกลศาสตร์';
  let recommendationTh = 'ผู้ป่วยสามารถฝึกในระดับความยากและองศาปัจจุบันต่อไปได้';

  if (hasAnomaly) {
    const sideTh =
      culpritSide === 'left'
        ? 'ข้างซ้าย'
        : culpritSide === 'right'
        ? 'ข้างขวา'
        : culpritSide === 'trunk'
        ? 'แนวกระดูกสันหลัง/ลำตัว'
        : 'ทั้งสองข้าง';

    descriptionTh = `ตรวจพบแรงกระชากเชิงมุม (Jerk Spike) สูงสุด ${peakJerk}°/s³ บริเวณข้อต่อ${sideTh} (เฟรมที่ ${peakJerkIndex + 1}) ร่วมกับความเร็วสูงสุด ${peakVelocity}°/s ส่งผลให้เกิดการสะดุดของการเคลื่อนไหว`;
    recommendationTh = `แนะนำให้นักกายภาพบำบัดตรวจประเมินกล้ามเนื้อ Stabilizers รอบ${sideTh} และพิจารณาปรับลดองศาเป้าหมายลง 10-15° ชั่วคราวเพื่อป้องกันการอักเสบซ้ำ`;
  }

  return {
    hasAnomaly,
    anomalyTimestamps,
    anomalyFrameIndices,
    peakJerkFrameIndex: peakJerkIndex,
    peakJerkValueDegPerSec3: peakJerk,
    peakVelocityDegPerSec: peakVelocity,
    culpritJoint,
    culpritSide,
    descriptionTh,
    recommendationTh,
  };
}
