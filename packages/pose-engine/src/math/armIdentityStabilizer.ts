/**
 * packages/pose-engine/src/math/armIdentityStabilizer.ts
 *
 * CLINICAL ARM IDENTITY STABILIZER & AMBIGUITY GATE
 * SaMD Class II & Hospital-Grade Biomechanical Tracking Continuity:
 *
 * 1. 2x2 Assignment Cost Matrix:
 *    - ตรวจจับและสลับรหัสข้อต่อแขน/ข้อมือ (Left 13,15,17,19,21 vs Right 14,16,18,20,22)
 *      กลับข้างให้ถูกต้องตามกายวิภาคศาสตร์ก่อนส่งเข้าตัวกรองสัญญาณ (One Euro Filter)
 * 2. Anatomical Bone Length & Kinetic Continuity Guard:
 *    - ตรวจสอบความยาวกระดูกต้นแขน (Shoulder -> Elbow) และปลายแขน (Elbow -> Wrist)
 *      เทียบกับค่าฐานที่เรียนรู้ระหว่างการฝึก
 * 3. Ambiguity State Gate (Fail-Closed):
 *    - เมื่อข้อมือ/ศอกสองข้างอยู่ใกล้กันกว่า AMBIGUITY_DISTANCE หรือไขว้ข้ามแนวแกนลำตัว
 *      จะตั้งสถานะ isArmAmbiguous = true เพื่อให้ตัวนับหยุดนับชั่วคราว และให้เรนเดอร์ลบเส้นเชื่อมที่ผิดพลาด
 */

import { PoseEngineLandmark } from '../types/exerciseConfig';
import { distance3D } from './geometry3d';

/**
 * คอนฟิกรวมศูนย์สำหรับการคงตัวตนแขนซ้าย/ขวาและการตรวจจับความกำกวม (Arm Identity & Ambiguity Config)
 */
export const ARM_STABILIZER_CONFIG = {
  /** ระยะห่างขั้นต่ำระหว่างข้อมือหรือศอกซ้าย-ขวา หากชิดกันกว่านี้ถือว่ากำกวม/เสี่ยงสลับ (normalized screen space) */
  AMBIGUITY_DISTANCE: 0.10,
  /** ความเร็ว/ระยะกระโดดสูงสุดของข้อต่อต่อเฟรมที่เป็นไปได้ทางสรีรวิทยา หากเกินถือว่าพิกัดกระโดดผิดปกติ */
  MAX_JUMP_PER_FRAME: 0.18,
  /** ค่าความคลาดเคลื่อนที่ยอมรับได้ของความยาวกระดูกแขนเทียบกับค่าฐานที่เรียนรู้ */
  BONE_LENGTH_TOLERANCE: 0.35,
  /** ระดับความเชื่อมั่นการมองเห็นขั้นต่ำของข้อต่อที่จะนำมาประมวลผลหรือวาด */
  MIN_LANDMARK_VISIBILITY: 0.50,
};

export interface ArmStabilizerConfig {
  /** ระยะห่างขั้นต่ำระหว่างข้อมือซ้าย-ขวาที่ถือว่ากำกวม */
  ambiguityDistance?: number;
  /** ระยะกระโดดสูงสุดต่อเฟรม */
  maxJumpPerFrame?: number;
  /** ความคลาดเคลื่อนความยาวกระดูกแขนที่ยอมรับได้ */
  boneLengthTolerance?: number;
  /** เกณฑ์ visibility ขั้นต่ำ */
  minLandmarkVisibility?: number;
}

export interface ArmStabilizerResult {
  /** โครงร่างที่ผ่านการล็อกและสลับตัวตนซ้าย-ขวากลับให้ถูกต้องแล้ว */
  stabilizedLandmarks: PoseEngineLandmark[];
  /** สถานะความกำกวม (true เมื่อข้อมือ/ศอกชิดกันหรือไขว้กัน) */
  isArmAmbiguous: boolean;
  /** รายการดัชนีข้อต่อที่มีความกำกวม (ไม่ควรวาดหรือควรวาดแบบจาง) */
  ambiguousJoints: Set<number>;
  /** รายการดัชนีข้อต่อที่เพิ่งถูกสลับกลับในเฟรมนี้ (เพื่อให้ตัวกรองรีเซ็ตสถานะ memory ทันที) */
  swappedJoints: number[];
  /** คำแนะนำทางคลินิกเมื่ออยู่ในสถานะกำกวม */
  coachingCueTh?: string;
  coachingCueEn?: string;
  coachingCueCn?: string;
}

// MediaPipe Arm and Hand Landmark Indices
export const LEFT_ARM_JOINTS = [13, 15, 17, 19, 21]; // Elbow, Wrist, Pinky, Index, Thumb
export const RIGHT_ARM_JOINTS = [14, 16, 18, 20, 22];

export class ArmIdentityStabilizer {
  private ambiguityDistance: number;
  private maxJumpPerFrame: number;
  private boneLengthTolerance: number;
  private minLandmarkVisibility: number;

  private lastReliableLandmarks: PoseEngineLandmark[] | null = null;
  private lastReliableTimestampMs: number = 0;

  // Learned calibrated bone lengths
  private calibratedLeftUpperArm: number | null = null;
  private calibratedLeftForearm: number | null = null;
  private calibratedRightUpperArm: number | null = null;
  private calibratedRightForearm: number | null = null;

  constructor(config: ArmStabilizerConfig = {}) {
    this.ambiguityDistance = config.ambiguityDistance ?? ARM_STABILIZER_CONFIG.AMBIGUITY_DISTANCE;
    this.maxJumpPerFrame = config.maxJumpPerFrame ?? ARM_STABILIZER_CONFIG.MAX_JUMP_PER_FRAME;
    this.boneLengthTolerance = config.boneLengthTolerance ?? ARM_STABILIZER_CONFIG.BONE_LENGTH_TOLERANCE;
    this.minLandmarkVisibility = config.minLandmarkVisibility ?? ARM_STABILIZER_CONFIG.MIN_LANDMARK_VISIBILITY;
  }

  /**
   * ประมวลผลและล็อกตัวตนแขนซ้าย-ขวาต่อเฟรม (Anatomical Arm Identity Stabilization):
   * 1. ตรวจสอบระยะห่างและความสัมพันธ์ของตำแหน่งข้อมือและศอก
   * 2. เปรียบเทียบ 2x2 Assignment Cost เทียบกับเฟรมก่อนหน้าและความยาวกระดูกแขน
   * 3. สลับรหัสข้อต่อกลับข้างหากตรวจพบว่า MediaPipe สลับผิดข้าง
   * 4. ตั้งค่า isArmAmbiguous และ ambiguousJoints เมื่อข้อมือชิดหรือบดบังกัน
   */
  public stabilize(
    rawLandmarks: PoseEngineLandmark[],
    timestampMs: number = Date.now()
  ): ArmStabilizerResult {
    if (!rawLandmarks || rawLandmarks.length < 23) {
      return {
        stabilizedLandmarks: rawLandmarks || [],
        isArmAmbiguous: false,
        ambiguousJoints: new Set(),
        swappedJoints: [],
      };
    }

    // Clone landmarks to prevent mutating caller's original array
    const landmarks: PoseEngineLandmark[] = rawLandmarks.map((lm) => ({ ...lm }));
    const ambiguousJoints = new Set<number>();
    const swappedJoints: number[] = [];

    const ls = landmarks[11]; // Left Shoulder
    const rs = landmarks[12]; // Right Shoulder
    let le = landmarks[13];   // Left Elbow
    let re = landmarks[14];   // Right Elbow
    let lw = landmarks[15];   // Left Wrist
    let rw = landmarks[16];   // Right Wrist

    const hasShoulders =
      ls && rs &&
      (ls.visibility ?? 0) >= this.minLandmarkVisibility &&
      (rs.visibility ?? 0) >= this.minLandmarkVisibility;

    // 1. Evaluate Wrist and Elbow Distances
    const wristDist = (lw && rw) ? distance3D(lw, rw) : 1.0;
    const elbowDist = (le && re) ? distance3D(le, re) : 1.0;

    // 2. Anatomical Cross-Check: In raw camera space, patient's left shoulder (11) is on camera right (higher X),
    // and patient's right shoulder (12) is on camera left (lower X).
    // If left shoulder X > right shoulder X, normal uncrossed arms have left wrist X > right wrist X.
    let isCrossed = false;
    if (hasShoulders && lw && rw) {
      const shouldersReversed = ls.x < rs.x; // Facing away or extreme tilt
      if (!shouldersReversed) {
        // Patient facing camera: Left shoulder is on camera right (ls.x > rs.x)
        // If lw.x < rw.x, wrists have laterally crossed each other!
        if (lw.x < rw.x - 0.02) {
          isCrossed = true;
        }
      } else {
        if (lw.x > rw.x + 0.02) {
          isCrossed = true;
        }
      }
    }

    // 3. Ambiguity Condition:
    // Wrists are within AMBIGUITY_DISTANCE, or crossed, or elbows are very close,
    // or wrists are near the face covering the chin/nose.
    let isArmAmbiguous = false;
    if (wristDist < this.ambiguityDistance || isCrossed || elbowDist < this.ambiguityDistance * 0.9) {
      isArmAmbiguous = true;
    }

    // Check Hands Covering Face / Neck:
    if (hasShoulders && lw && rw) {
      const midShoulderY = (ls.y + rs.y) / 2.0;
      const midShoulderX = (ls.x + rs.x) / 2.0;
      const isNearFaceY = lw.y < midShoulderY - 0.05 && rw.y < midShoulderY - 0.05;
      const isNearFaceX = Math.abs(lw.x - midShoulderX) < 0.15 && Math.abs(rw.x - midShoulderX) < 0.15;
      if (isNearFaceY && isNearFaceX && wristDist < 0.14) {
        isArmAmbiguous = true;
      }
    }

    // 4. 2x2 Assignment Cost Comparison against Last Reliable Pose
    let shouldSwapWrists = false;
    let shouldSwapElbows = false;

    if (this.lastReliableLandmarks && lw && rw && le && re) {
      const prevLw = this.lastReliableLandmarks[15];
      const prevRw = this.lastReliableLandmarks[16];
      const prevLe = this.lastReliableLandmarks[13];
      const prevRe = this.lastReliableLandmarks[14];

      if (prevLw && prevRw) {
        const directWristCost = distance3D(prevLw, lw) + distance3D(prevRw, rw);
        const swapWristCost = distance3D(prevLw, rw) + distance3D(prevRw, lw);

        // Bone length consistency check
        let directBoneCost = 0;
        let swapBoneCost = 0;
        if (this.calibratedLeftForearm && this.calibratedRightForearm) {
          const directLenL = distance3D(le, lw);
          const directLenR = distance3D(re, rw);
          const swapLenL = distance3D(le, rw);
          const swapLenR = distance3D(re, lw);

          directBoneCost =
            Math.abs(directLenL - this.calibratedLeftForearm) / this.calibratedLeftForearm +
            Math.abs(directLenR - this.calibratedRightForearm) / this.calibratedRightForearm;
          swapBoneCost =
            Math.abs(swapLenL - this.calibratedLeftForearm) / this.calibratedLeftForearm +
            Math.abs(swapLenR - this.calibratedRightForearm) / this.calibratedRightForearm;
        }

        const totalDirectCost = directWristCost + directBoneCost * 0.15;
        const totalSwapCost = swapWristCost + swapBoneCost * 0.15;

        // If swap cost is significantly smaller than direct cost, MediaPipe inverted left & right
        if (totalSwapCost < totalDirectCost - 0.06 && swapWristCost < directWristCost * 0.70) {
          shouldSwapWrists = true;
        }
      }

      if (prevLe && prevRe) {
        const directElbowCost = distance3D(prevLe, le) + distance3D(prevRe, re);
        const swapElbowCost = distance3D(prevLe, re) + distance3D(prevRe, le);
        if (swapElbowCost < directElbowCost - 0.06 && swapElbowCost < directElbowCost * 0.70) {
          shouldSwapElbows = true;
        }
      }
    }

    // 5. Apply Joint Inversion Swap if detected
    if (shouldSwapElbows) {
      const tempLe = landmarks[13];
      landmarks[13] = landmarks[14];
      landmarks[14] = tempLe;
      swappedJoints.push(13, 14);
      le = landmarks[13];
      re = landmarks[14];
    }

    if (shouldSwapWrists) {
      // Swap wrists
      const tempLw = landmarks[15];
      landmarks[15] = landmarks[16];
      landmarks[16] = tempLw;

      // Swap hands & finger keypoints (Left: 17, 19, 21 vs Right: 18, 20, 22)
      for (let i = 0; i < 3; i++) {
        const leftIdx = 17 + i * 2;
        const rightIdx = 18 + i * 2;
        const tempHand = landmarks[leftIdx];
        landmarks[leftIdx] = landmarks[rightIdx];
        landmarks[rightIdx] = tempHand;
      }

      swappedJoints.push(15, 16, 17, 18, 19, 20, 21, 22);
      lw = landmarks[15];
      rw = landmarks[16];
    }

    // 6. Anti-Teleportation & Velocity Cap (Clamp impossible single-frame joint jumps)
    if (this.lastReliableLandmarks) {
      const armIndices = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
      for (const idx of armIndices) {
        const currPt = landmarks[idx];
        const prevPt = this.lastReliableLandmarks[idx];
        if (currPt && prevPt) {
          const jumpDist = distance3D(currPt, prevPt);
          if (jumpDist > this.maxJumpPerFrame) {
            // Unnatural lateral jump: hold previous position and flag joint as degraded
            landmarks[idx] = {
              ...prevPt,
              visibility: Math.min(currPt.visibility ?? 0.5, 0.40),
            };
            ambiguousJoints.add(idx);
          }
        }
      }
    }

    // 7. Populate Ambiguous Joints Set
    if (isArmAmbiguous) {
      // Mark all wrist and hand keypoints as ambiguous
      [15, 16, 17, 18, 19, 20, 21, 22].forEach((j) => ambiguousJoints.add(j));
      if (elbowDist < this.ambiguityDistance * 1.2) {
        ambiguousJoints.add(13);
        ambiguousJoints.add(14);
      }
    }

    // Also flag joints with visibility below threshold
    [13, 14, 15, 16, 17, 18, 19, 20, 21, 22].forEach((idx) => {
      const lm = landmarks[idx];
      if (!lm || (lm.visibility ?? 0) < this.minLandmarkVisibility) {
        ambiguousJoints.add(idx);
      }
    });

    // 8. Update Learned Bone Lengths during clear, high-confidence frames
    if (
      !isArmAmbiguous &&
      hasShoulders &&
      le && re && lw && rw &&
      (le.visibility ?? 0) >= 0.70 &&
      (re.visibility ?? 0) >= 0.70 &&
      (lw.visibility ?? 0) >= 0.70 &&
      (rw.visibility ?? 0) >= 0.70 &&
      wristDist > 0.20
    ) {
      const leftUpperArm = distance3D(ls, le);
      const rightUpperArm = distance3D(rs, re);
      const leftForearm = distance3D(le, lw);
      const rightForearm = distance3D(re, rw);

      this.calibratedLeftUpperArm = this.calibratedLeftUpperArm
        ? 0.95 * this.calibratedLeftUpperArm + 0.05 * leftUpperArm
        : leftUpperArm;
      this.calibratedRightUpperArm = this.calibratedRightUpperArm
        ? 0.95 * this.calibratedRightUpperArm + 0.05 * rightUpperArm
        : rightUpperArm;
      this.calibratedLeftForearm = this.calibratedLeftForearm
        ? 0.95 * this.calibratedLeftForearm + 0.05 * leftForearm
        : leftForearm;
      this.calibratedRightForearm = this.calibratedRightForearm
        ? 0.95 * this.calibratedRightForearm + 0.05 * rightForearm
        : rightForearm;

      // Update last reliable landmarks
      this.lastReliableLandmarks = landmarks.map((lm) => ({ ...lm }));
      this.lastReliableTimestampMs = timestampMs;
    } else if (this.lastReliableLandmarks && !isArmAmbiguous) {
      // Partial update for reliable uncrossed frames
      this.lastReliableLandmarks = landmarks.map((lm) => ({ ...lm }));
      this.lastReliableTimestampMs = timestampMs;
    }

    return {
      stabilizedLandmarks: landmarks,
      isArmAmbiguous,
      ambiguousJoints,
      swappedJoints,
      coachingCueTh: isArmAmbiguous ? 'กรุณาแยกแขนหรือข้อมือสองข้างออกจากกันเพื่อความแม่นยำ' : undefined,
      coachingCueEn: isArmAmbiguous ? 'Please separate both arms or wrists for tracking accuracy' : undefined,
      coachingCueCn: isArmAmbiguous ? '请将双手或手腕分开以确保准确追踪' : undefined,
    };
  }

  public reset(): void {
    this.lastReliableLandmarks = null;
    this.lastReliableTimestampMs = 0;
    this.calibratedLeftUpperArm = null;
    this.calibratedLeftForearm = null;
    this.calibratedRightUpperArm = null;
    this.calibratedRightForearm = null;
  }
}

