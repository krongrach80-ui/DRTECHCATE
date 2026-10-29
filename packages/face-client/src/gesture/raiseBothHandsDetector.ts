/**
 * packages/face-client/src/gesture/raiseBothHandsDetector.ts
 *
 * DRTECH.CARE CLINICAL-GRADE TOUCHLESS READINESS CONFIRMATION ENGINE
 * Biomechanical detection of "Raise Both Hands" gesture with:
 * 1. Seated/Wheelchair & Standing scale invariance.
 * 2. 4-point elevation margin gating (Both wrists above shoulders by X% torso height).
 * 3. Spatial Identity Anchor tracking (Multi-person & anti-hijacking safety).
 * 4. Temporal Exponential Moving Average (EMA) smoothing and smooth dwell decay.
 * 5. Accessibility fallbacks for hemiparesis / frozen shoulder patients.
 */

export interface PoseLandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export interface SpatialIdentityAnchor {
  anchorNoseXY: { x: number; y: number };
  anchorShoulderCenterXY?: { x: number; y: number };
}

export interface RaiseBothHandsConfig {
  minVisibility: number;                  // Minimum visibility score for shoulders & wrists (default: 0.60)
  minPresence: number;                    // Minimum presence score (default: 0.60)
  elevationMarginRatio: number;           // Fraction of torso scale wrists must be above shoulders (default: 0.12)
  minWristSeparation: number;             // Minimum horizontal separation between wrists (default: 0.12)
  holdDurationMs: number;                 // Hold dwell duration in milliseconds (default: 1200ms)
  minConsecutiveFrames: number;           // Minimum consecutive frames (default: 10)
  decayRatePerSecond: number;             // Progress decay rate per second when hands lowered (default: 2.2)
  emaAlpha: number;                       // Exponential smoothing alpha (default: 0.35)
  maxAnchorDrift: number;                 // Max normalized spatial drift for identity continuity (default: 0.22)
  accessibilityTimeoutMs: number;         // Modal duration before displaying fallback advice (default: 7000ms)
  singleArmAccessibilityTimeoutMs: number;// Duration of repeated single-arm attempts before fallback (default: 3500ms)
}

export const DEFAULT_RAISE_BOTH_HANDS_CONFIG: RaiseBothHandsConfig = {
  minVisibility: 0.60,
  minPresence: 0.60,
  elevationMarginRatio: 0.12,
  minWristSeparation: 0.12,
  holdDurationMs: 1200,
  minConsecutiveFrames: 10,
  decayRatePerSecond: 2.2,
  emaAlpha: 0.35,
  maxAnchorDrift: 0.22,
  accessibilityTimeoutMs: 7000,
  singleArmAccessibilityTimeoutMs: 3500,
};

export type RaiseBothHandsStatus =
  | 'searching'
  | 'ready'
  | 'holding'
  | 'single_hand_detected'
  | 'low_visibility_or_out_of_frame'
  | 'identity_mismatch_or_lost'
  | 'confirmed';

export interface RaiseBothHandsState {
  progress: number;                       // Hold progress: 0.0 to 1.0
  consecutiveValidFrames: number;
  smoothedLandmarks: Record<number, { x: number; y: number }>;
  firstHoldStartTime: number | null;
  lastFrameTimeMs: number | null;
  modalOpenStartTimeMs: number | null;
  singleHandAttemptStartTimeMs: number | null;
  lastValidAnchor: { x: number; y: number } | null;
  confirmed: boolean;
}

export interface RaiseBothHandsResult {
  detected: boolean;
  progress: number;
  status: RaiseBothHandsStatus;
  thaiMessage: string;
  showAccessibilityFallbackHint: boolean;
  leftWristAboveShoulder: boolean;
  rightWristAboveShoulder: boolean;
  leftWristY?: number;
  rightWristY?: number;
  leftShoulderY?: number;
  rightShoulderY?: number;
  referenceTorsoScale: number;
  isSeated: boolean;
  nextState: RaiseBothHandsState;
}

// Landmark Indices (MediaPipe Pose 33 Topology)
export const POSE_LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};

/**
 * Initializes an empty/fresh gesture tracker state.
 */
export function createInitialRaiseBothHandsState(nowMs: number = Date.now()): RaiseBothHandsState {
  return {
    progress: 0.0,
    consecutiveValidFrames: 0,
    smoothedLandmarks: {},
    firstHoldStartTime: null,
    lastFrameTimeMs: nowMs,
    modalOpenStartTimeMs: nowMs,
    singleHandAttemptStartTimeMs: null,
    lastValidAnchor: null,
    confirmed: false,
  };
}

/**
 * Pure deterministic detection function.
 * Evaluates pose landmarks against clinical gesture rules, identity anchor, and temporal dwell criteria.
 */
export function detectRaiseBothHands(
  rawInput: PoseLandmarkPoint[] | PoseLandmarkPoint[][] | null | undefined,
  anchor: SpatialIdentityAnchor | null | undefined,
  customConfig?: Partial<RaiseBothHandsConfig>,
  prevState?: RaiseBothHandsState,
  currentTimestampMs: number = Date.now()
): RaiseBothHandsResult {
  const config: RaiseBothHandsConfig = { ...DEFAULT_RAISE_BOTH_HANDS_CONFIG, ...customConfig };
  const state: RaiseBothHandsState = prevState ? { ...prevState } : createInitialRaiseBothHandsState(currentTimestampMs);

  if (state.modalOpenStartTimeMs === null) {
    state.modalOpenStartTimeMs = currentTimestampMs;
  }

  const dtMs = state.lastFrameTimeMs ? Math.max(1, currentTimestampMs - state.lastFrameTimeMs) : 33;
  state.lastFrameTimeMs = currentTimestampMs;

  // Accessibility timeout calculations
  const totalModalOpenTimeMs = currentTimestampMs - (state.modalOpenStartTimeMs || currentTimestampMs);
  let showAccessibilityFallbackHint = totalModalOpenTimeMs >= config.accessibilityTimeoutMs;

  // If already confirmed, lock in confirmed state
  if (state.confirmed) {
    return {
      detected: true,
      progress: 1.0,
      status: 'confirmed',
      thaiMessage: '✅ ยืนยันสำเร็จ! กำลังเข้าสู่หน้าฝึก...',
      showAccessibilityFallbackHint: false,
      leftWristAboveShoulder: true,
      rightWristAboveShoulder: true,
      referenceTorsoScale: 0.30,
      isSeated: false,
      nextState: state,
    };
  }

  // 1. Resolve Candidate Pose (Single or Multi-Person with Spatial Anchor Matching)
  let candidatePose: PoseLandmarkPoint[] | null = null;

  if (Array.isArray(rawInput) && rawInput.length > 0) {
    if (Array.isArray(rawInput[0])) {
      // Multi-person array: PoseLandmarkPoint[][]
      const poses = rawInput as PoseLandmarkPoint[][];
      if (anchor && anchor.anchorNoseXY) {
        let bestDistance = Infinity;
        let bestPose: PoseLandmarkPoint[] | null = null;

        for (const p of poses) {
          if (p.length > POSE_LM.NOSE) {
            const nose = p[POSE_LM.NOSE];
            const dist = Math.hypot(nose.x - anchor.anchorNoseXY.x, nose.y - anchor.anchorNoseXY.y);
            if (dist < bestDistance) {
              bestDistance = dist;
              bestPose = p;
            }
          }
        }

        if (bestDistance <= config.maxAnchorDrift && bestPose) {
          candidatePose = bestPose;
        } else {
          // Identity anchor mismatch (e.g. verified person stepped out or only bystanders in frame)
          candidatePose = null;
        }
      } else {
        // No anchor provided: default to first detected person
        candidatePose = poses[0];
      }
    } else {
      // Single person array: PoseLandmarkPoint[]
      candidatePose = rawInput as PoseLandmarkPoint[];
      if (anchor && anchor.anchorNoseXY && candidatePose.length > POSE_LM.NOSE) {
        const nose = candidatePose[POSE_LM.NOSE];
        const dist = Math.hypot(nose.x - anchor.anchorNoseXY.x, nose.y - anchor.anchorNoseXY.y);
        if (dist > config.maxAnchorDrift) {
          candidatePose = null;
        }
      }
    }
  }

  // Helper for applying smooth progress decay
  const applyDecay = () => {
    state.consecutiveValidFrames = 0;
    state.firstHoldStartTime = null;
    const decayAmount = (config.decayRatePerSecond * dtMs) / 1000.0;
    state.progress = Math.max(0.0, state.progress - decayAmount);
  };

  // 2. Handle missing pose or lost identity anchor
  if (!candidatePose || candidatePose.length <= POSE_LM.RIGHT_WRIST) {
    applyDecay();
    return {
      detected: false,
      progress: round2(state.progress),
      status: anchor && anchor.anchorNoseXY ? 'identity_mismatch_or_lost' : 'searching',
      thaiMessage: '👀 กำลังมองหามือของคุณ... ยก 2 มือชูขึ้นเหนือไหล่เพื่อเริ่ม',
      showAccessibilityFallbackHint,
      leftWristAboveShoulder: false,
      rightWristAboveShoulder: false,
      referenceTorsoScale: 0.30,
      isSeated: false,
      nextState: state,
    };
  }

  // 3. Extract required landmarks & check visibility
  const nose = candidatePose[POSE_LM.NOSE];
  const leftShoulder = candidatePose[POSE_LM.LEFT_SHOULDER];
  const rightShoulder = candidatePose[POSE_LM.RIGHT_SHOULDER];
  const leftWrist = candidatePose[POSE_LM.LEFT_WRIST];
  const rightWrist = candidatePose[POSE_LM.RIGHT_WRIST];

  const getVis = (lm?: PoseLandmarkPoint) => (typeof lm?.visibility === 'number' ? lm.visibility : 1.0);
  const getPres = (lm?: PoseLandmarkPoint) => (typeof lm?.presence === 'number' ? lm.presence : 1.0);

  const keyLandmarks = [leftShoulder, rightShoulder, leftWrist, rightWrist];
  const allVisible = keyLandmarks.every(
    (lm) => getVis(lm) >= config.minVisibility && getPres(lm) >= config.minPresence
  );

  // 4. Apply Exponential Moving Average (EMA) to suppress camera sensor jitter
  const alpha = config.emaAlpha;
  const smoothed: Record<number, { x: number; y: number }> = { ...state.smoothedLandmarks };

  const smooth = (idx: number, raw: PoseLandmarkPoint) => {
    if (!smoothed[idx]) {
      smoothed[idx] = { x: raw.x, y: raw.y };
    } else {
      smoothed[idx] = {
        x: alpha * raw.x + (1 - alpha) * smoothed[idx].x,
        y: alpha * raw.y + (1 - alpha) * smoothed[idx].y,
      };
    }
    return smoothed[idx];
  };

  const sNose = smooth(POSE_LM.NOSE, nose);
  const sLS = smooth(POSE_LM.LEFT_SHOULDER, leftShoulder);
  const sRS = smooth(POSE_LM.RIGHT_SHOULDER, rightShoulder);
  const sLW = smooth(POSE_LM.LEFT_WRIST, leftWrist);
  const sRW = smooth(POSE_LM.RIGHT_WRIST, rightWrist);
  state.smoothedLandmarks = smoothed;

  // 5. Dynamic Reference Torso Scale Calculation (Standing vs. Seated / Wheelchair Invariance)
  let referenceTorsoScale = 0.30;
  let isSeated = false;

  const leftHip = candidatePose[POSE_LM.LEFT_HIP];
  const rightHip = candidatePose[POSE_LM.RIGHT_HIP];
  const hipsVisible =
    Boolean(leftHip && rightHip) &&
    getVis(leftHip) >= 0.50 &&
    getVis(rightHip) >= 0.50;

  if (hipsVisible && leftHip && rightHip) {
    const hipMidY = (leftHip.y + rightHip.y) / 2.0;
    const shoulderMidY = (sLS.y + sRS.y) / 2.0;
    const verticalTorso = Math.abs(hipMidY - shoulderMidY);
    if (verticalTorso >= 0.12) {
      referenceTorsoScale = verticalTorso;
      isSeated = false;
    } else {
      // Hips are too close to shoulders -> seated compression
      isSeated = true;
    }
  } else {
    // Hips occluded, hidden by desk, or out of frame (Wheelchair / Seated posture)
    isSeated = true;
  }

  if (isSeated) {
    // Robust seated fallback: Biacromial shoulder span * 1.25
    const shoulderSpan = Math.hypot(sLS.x - sRS.x, sLS.y - sRS.y);
    if (shoulderSpan >= 0.08) {
      referenceTorsoScale = shoulderSpan * 1.25;
    } else {
      // Secondary fallback: Nose to shoulder vertical distance * 2.2
      const shoulderMidY = (sLS.y + sRS.y) / 2.0;
      const headHeight = Math.abs(shoulderMidY - sNose.y);
      referenceTorsoScale = Math.max(0.18, headHeight * 2.2);
    }
  }

  // 6. Gating Evaluations
  if (!allVisible) {
    applyDecay();
    return {
      detected: false,
      progress: round2(state.progress),
      status: 'low_visibility_or_out_of_frame',
      thaiMessage: '📐 ไม่เห็นข้อมือหรือไหล่ กรุณาถอยหลังเล็กน้อย หรือกดปุ่มเพื่อเริ่ม',
      showAccessibilityFallbackHint,
      leftWristAboveShoulder: false,
      rightWristAboveShoulder: false,
      leftWristY: sLW.y,
      rightWristY: sRW.y,
      leftShoulderY: sLS.y,
      rightShoulderY: sRS.y,
      referenceTorsoScale: round3(referenceTorsoScale),
      isSeated,
      nextState: state,
    };
  }

  // Elevation threshold check (in normalized image space, smaller y = higher elevation)
  const margin = config.elevationMarginRatio * referenceTorsoScale;
  const leftWristAbove = sLW.y <= sLS.y - margin;
  const rightWristAbove = sRW.y <= sRS.y - margin;

  // Separation check to reject crossed hands scratching head
  const wristSeparation = Math.abs(sLW.x - sRW.x);
  const wristsSeparated = wristSeparation >= config.minWristSeparation;

  const bothHandsValid = leftWristAbove && rightWristAbove && wristsSeparated;

  // Single-hand attempt tracking for accessibility prompt
  const singleHandValid = (leftWristAbove && !rightWristAbove) || (!leftWristAbove && rightWristAbove);
  if (singleHandValid) {
    if (state.singleHandAttemptStartTimeMs === null) {
      state.singleHandAttemptStartTimeMs = currentTimestampMs;
    } else {
      const singleHandDuration = currentTimestampMs - state.singleHandAttemptStartTimeMs;
      if (singleHandDuration >= config.singleArmAccessibilityTimeoutMs) {
        showAccessibilityFallbackHint = true;
      }
    }
  } else if (bothHandsValid) {
    state.singleHandAttemptStartTimeMs = null;
  }

  // 7. Temporal Accumulation & State Machine
  if (bothHandsValid) {
    state.consecutiveValidFrames += 1;

    if (state.firstHoldStartTime === null) {
      state.firstHoldStartTime = currentTimestampMs;
    }

    const elapsedHoldMs = currentTimestampMs - state.firstHoldStartTime;
    const timeProgress = Math.min(1.0, elapsedHoldMs / config.holdDurationMs);
    const frameProgress = Math.min(1.0, state.consecutiveValidFrames / config.minConsecutiveFrames);

    // Both time and minimum consecutive frames must advance
    state.progress = Math.min(1.0, Math.max(state.progress, Math.min(timeProgress, frameProgress)));

    if (state.progress >= 1.0) {
      state.confirmed = true;
      return {
        detected: true,
        progress: 1.0,
        status: 'confirmed',
        thaiMessage: '✅ ยืนยันสำเร็จ! กำลังเข้าสู่หน้าฝึก...',
        showAccessibilityFallbackHint: false,
        leftWristAboveShoulder: true,
        rightWristAboveShoulder: true,
        leftWristY: sLW.y,
        rightWristY: sRW.y,
        leftShoulderY: sLS.y,
        rightShoulderY: sRS.y,
        referenceTorsoScale: round3(referenceTorsoScale),
        isSeated,
        nextState: state,
      };
    }

    const percent = Math.round(state.progress * 100);
    return {
      detected: false,
      progress: round2(state.progress),
      status: 'holding',
      thaiMessage: `⏳ ค้างไว้อีกนิด... (${percent}%)`,
      showAccessibilityFallbackHint,
      leftWristAboveShoulder: true,
      rightWristAboveShoulder: true,
      leftWristY: sLW.y,
      rightWristY: sRW.y,
      leftShoulderY: sLS.y,
      rightShoulderY: sRS.y,
      referenceTorsoScale: round3(referenceTorsoScale),
      isSeated,
      nextState: state,
    };
  }

  // Not both hands valid: smoothly decay progress
  applyDecay();

  if (singleHandValid) {
    return {
      detected: false,
      progress: round2(state.progress),
      status: 'single_hand_detected',
      thaiMessage: '🙋 เห็นมือข้างเดียวแล้ว ยกมืออีกข้างขึ้นด้วยครับ (หรือกดปุ่มด้านล่าง)',
      showAccessibilityFallbackHint,
      leftWristAboveShoulder: leftWristAbove,
      rightWristAboveShoulder: rightWristAbove,
      leftWristY: sLW.y,
      rightWristY: sRW.y,
      leftShoulderY: sLS.y,
      rightShoulderY: sRS.y,
      referenceTorsoScale: round3(referenceTorsoScale),
      isSeated,
      nextState: state,
    };
  }

  return {
    detected: false,
    progress: round2(state.progress),
    status: 'ready',
    thaiMessage: '👀 กำลังมองหามือของคุณ... ยก 2 มือชูขึ้นเหนือไหล่เพื่อเริ่ม',
    showAccessibilityFallbackHint,
    leftWristAboveShoulder: false,
    rightWristAboveShoulder: false,
    leftWristY: sLW.y,
    rightWristY: sRW.y,
    leftShoulderY: sLS.y,
    rightShoulderY: sRS.y,
    referenceTorsoScale: round3(referenceTorsoScale),
    isSeated,
    nextState: state,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
