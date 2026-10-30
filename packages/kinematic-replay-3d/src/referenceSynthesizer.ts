/**
 * packages/kinematic-replay-3d/src/referenceSynthesizer.ts
 *
 * PROCEDURAL BIOMECHANICAL TELEMETRY SYNTHESIZER
 *
 * Generates mathematically consistent 3D kinematic sequences (33 Keypoints)
 * for clinical calibration, algorithm verification, and interactive 360° holographic replay.
 *
 * Compliance: SaMD Class II, HIPAA/GDPR Zero-Video Vector Telemetry.
 */

import { KinematicFrame, KinematicLandmark, KinematicReplaySnapshot } from './ringBuffer';

export interface TelemetrySynthesizerOptions {
  sessionId?: string;
  patientId?: string;
  exerciseName?: string;
  fps?: number;
  totalFrames?: number;
}

/**
 * Creates 33 base anthropometric landmarks for human skeleton representation
 */
function createBaseSkeletonLandmarks(): KinematicLandmark[] {
  const landmarks: KinematicLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({ x: 0.5, y: 0.5, z: 0.0, visibility: 0.95 });
  }

  // Key reference joints
  landmarks[0] = { x: 0.50, y: 0.18, z: -0.05, visibility: 0.99 }; // Nose
  landmarks[11] = { x: 0.58, y: 0.34, z: 0.00, visibility: 0.98 }; // Left Shoulder
  landmarks[12] = { x: 0.42, y: 0.34, z: 0.00, visibility: 0.98 }; // Right Shoulder
  landmarks[13] = { x: 0.64, y: 0.48, z: 0.02, visibility: 0.95 }; // Left Elbow
  landmarks[14] = { x: 0.38, y: 0.49, z: 0.00, visibility: 0.95 }; // Right Elbow
  landmarks[15] = { x: 0.68, y: 0.62, z: 0.04, visibility: 0.95 }; // Left Wrist
  landmarks[16] = { x: 0.36, y: 0.64, z: 0.00, visibility: 0.95 }; // Right Wrist

  landmarks[23] = { x: 0.55, y: 0.60, z: 0.00, visibility: 0.98 }; // Left Hip
  landmarks[24] = { x: 0.45, y: 0.60, z: 0.00, visibility: 0.98 }; // Right Hip
  landmarks[25] = { x: 0.56, y: 0.78, z: 0.02, visibility: 0.95 }; // Left Knee
  landmarks[26] = { x: 0.44, y: 0.78, z: 0.02, visibility: 0.95 }; // Right Knee
  landmarks[27] = { x: 0.56, y: 0.95, z: 0.00, visibility: 0.95 }; // Left Ankle
  landmarks[28] = { x: 0.44, y: 0.95, z: 0.00, visibility: 0.95 }; // Right Ankle

  return landmarks;
}

/**
 * Synthesizes a clinical pain-event kinematic replay snapshot (300 frames, 10.0s @ 30 FPS)
 *
 * Sequence Progression:
 * - Frames 0–189 (0.0s – 6.3s): Smooth shoulder abduction (25° -> 115°), upright trunk (< 4° tilt).
 * - Frames 190–224 (6.3s – 7.5s): Critical anomaly & pain incident centered at Frame 210.
 *   - Left shoulder elevates (scapular hiking)
 *   - Trunk lateral tilt to the right (18.5° > 12° threshold)
 *   - Angular jerk spike (alpha' > 850°/s³)
 *   - Culprit joint: left shoulder complex
 * - Frames 225–299 (7.5s – 10.0s): Arm lowers and stabilizes in resting posture.
 */
export function synthesizeClinicalPainReplaySnapshot(
  options: TelemetrySynthesizerOptions = {}
): KinematicReplaySnapshot {
  const fps = options.fps ?? 30;
  const totalFrames = options.totalFrames ?? 300;
  const frameIntervalMs = 1000 / fps;
  const frames: KinematicFrame[] = [];

  const baseShoulderY = 0.34;
  const armLengthUpper = 0.15;
  const armLengthForearm = 0.14;

  for (let i = 0; i < totalFrames; i++) {
    const timestampMs = Math.round(i * frameIntervalMs);
    const landmarks = createBaseSkeletonLandmarks();

    let angleDeg = 25;
    let angularVelocity = 18;
    let trunkTiltDeg = 2.0;
    let isPain = false;
    let scapularHikingRatio = 0.04;
    let coachingMsg = 'การเคลื่อนไหวราบรื่น ลำตัวตรง';

    if (i < 190) {
      // Phase 1: Smooth Abduction (25° to 115°)
      const progress = i / 189;
      // Sinusoidal easing for natural bio-motion
      angleDeg = 25 + 90 * Math.sin((progress * Math.PI) / 2);
      angularVelocity = 15 + 10 * Math.cos(progress * Math.PI);
      trunkTiltDeg = 1.8 + 1.2 * Math.sin(progress * Math.PI * 2);
      scapularHikingRatio = 0.04 + 0.03 * progress;
    } else if (i < 225) {
      // Phase 2: Critical Anomaly & Pain Event (Around Frame 210)
      const distFromPeak = Math.abs(i - 210);
      const gaussianFactor = Math.exp(-Math.pow(distFromPeak / 4, 2));

      // Trunk compensations
      trunkTiltDeg = 4.0 + 14.5 * gaussianFactor; // Peaks at 18.5°
      scapularHikingRatio = 0.08 + 0.32 * gaussianFactor; // Severe hiking up to 0.40

      // Shoulder angle reaches high abduction then jerks
      if (i < 210) {
        angleDeg = 115 + (i - 190) * 0.4;
      } else {
        angleDeg = 123 - (i - 210) * 1.8;
      }

      // Angular velocity & Jerk spike profile
      if (i === 208) {
        angularVelocity = 35;
      } else if (i === 209) {
        angularVelocity = 85;
      } else if (i === 210) {
        angularVelocity = 210; // Exceeds 180°/s velocity anomaly threshold
        isPain = true;
        coachingMsg = '🚨 ตรวจพบแรงกระชากของข้อต่อและผู้ป่วยกดปุ่มหยุดฉุกเฉิน';
      } else if (i === 211) {
        angularVelocity = 50;
        isPain = true;
      } else {
        angularVelocity = Math.max(10, 45 - distFromPeak * 4);
      }

      // Left shoulder elevation (scapular hiking upward displacement)
      landmarks[11].y = baseShoulderY - 0.06 * gaussianFactor; // Elevates toward ear
      landmarks[11].x += 0.015 * gaussianFactor; // Slight lateral shift

      // Left wrist jerk twitch
      if (i === 210) {
        landmarks[15].x += 0.04;
        landmarks[15].y -= 0.03;
      }
    } else {
      // Phase 3: Post-Pain Arm Lowering and Rest
      const progress = (i - 225) / (totalFrames - 225);
      const decay = Math.exp(-progress * 3);
      angleDeg = 25 + 75 * decay;
      angularVelocity = Math.max(2, 20 * decay);
      trunkTiltDeg = 2.0 + 2.5 * decay;
      scapularHikingRatio = 0.04 + 0.05 * decay;
      coachingMsg = 'พักแขนข้างลำตัวหลังสิ้นสุดการฝึก';
    }

    // Kinematic forward projection for Left Arm coordinates
    const leftRad = (angleDeg * Math.PI) / 180;
    const shoulderX = landmarks[11].x;
    const shoulderY = landmarks[11].y;

    landmarks[13].x = shoulderX + armLengthUpper * Math.sin(leftRad);
    landmarks[13].y = shoulderY + armLengthUpper * Math.cos(leftRad);
    landmarks[13].z = 0.02 * Math.sin(leftRad);

    landmarks[15].x = landmarks[13].x + armLengthForearm * Math.sin(leftRad);
    landmarks[15].y = landmarks[13].y + armLengthForearm * Math.cos(leftRad);
    landmarks[15].z = 0.04 * Math.sin(leftRad);

    // Lateral trunk tilt: offset shoulders relative to spine axis
    const tiltRad = (trunkTiltDeg * Math.PI) / 180;
    const trunkTiltOffset = 0.08 * Math.sin(tiltRad);
    landmarks[11].y += trunkTiltOffset * 0.5;
    landmarks[12].y -= trunkTiltOffset * 0.5;

    frames.push({
      timestampMs,
      landmarks,
      currentAngleDeg: Math.round(angleDeg * 10) / 10,
      angularVelocityDegPerSec: Math.round(angularVelocity * 10) / 10,
      trunkLateralTiltDeg: Math.round(trunkTiltDeg * 10) / 10,
      scapularHikingRatio: Math.round(scapularHikingRatio * 100) / 100,
      phase: i < 190 ? 'exercise_active' : i < 225 ? 'anomaly_pain' : 'exercise_cooldown',
      isPainEvent: isPain,
      coachingMessageTh: coachingMsg,
    });
  }

  return {
    sessionId: options.sessionId || 'sess-ref-pain-04',
    patientId: options.patientId || 'HN-90821',
    exerciseName: options.exerciseName || 'Shoulder Abduction (กางข้อไหล่)',
    capturedAt: '2026-10-30T10:15:00.000Z',
    totalFrames: frames.length,
    fps,
    frames,
    hasPainEvent: true,
  };
}
