/**
 * apps/kiosk/src/minigame-cards/HandGestureVerifier.ts
 *
 * Strict Hand Landmark & Raised Open-Palm Verification Gate for Minigame "การ์ดกายภาพ"
 * Eliminates false positives from head, body, shirt motion or pixel differencing.
 */

export interface HandLandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

export type HandAnswerSide = 'yes' | 'no';
export type HandZone = 'LEFT' | 'RIGHT' | 'CENTER' | 'NONE';

export interface HandVerificationResult {
  /** True strictly when a real human hand is detected, raised, open-palmed, and in LEFT/RIGHT answer zone */
  isValidHand: boolean;
  /** Whether hand landmarks were detected with sufficient confidence */
  isHandDetected: boolean;
  /** Whether the hand is in an open-palm raised position */
  isOpenPalm: boolean;
  /** Detected zone: 'LEFT' (yes), 'RIGHT' (no), 'CENTER' (neutral), or 'NONE' */
  zone: HandZone;
  /** Selected answer: 'yes' (screen left), 'no' (screen right), or null */
  side: HandAnswerSide | null;
  /** Detection confidence score (0.0 to 1.0) */
  confidence: number;
  /** Number of fingers detected as extended (at least 3 required) */
  extendedFingersCount: number;
  /** Mirrored palm center X coordinate (0.0 to 1.0) */
  mirroredX: number;
  /** Palm center Y coordinate (0.0 to 1.0) */
  mirroredY: number;
  /** Reason for rejection if isValidHand is false */
  rejectionReason?: string;
}

export interface HandVerificationOptions {
  /** Minimum confidence required for hand detection (Default: 0.75) */
  minConfidence?: number;
  /** Whether camera feed is horizontally mirrored (Default: true) */
  isMirrored?: boolean;
  /** Left zone boundary threshold (mirroredX < threshold => LEFT / 'yes') (Default: 0.42) */
  leftZoneThreshold?: number;
  /** Right zone boundary threshold (mirroredX > threshold => RIGHT / 'no') (Default: 0.58) */
  rightZoneThreshold?: number;
  /** Maximum Y coordinate allowed for palm center (Default: 0.70) */
  maxYThreshold?: number;
  /** Minimum vertical margin fingertips must be higher than wrist (tip.y < wrist.y - margin) (Default: 0.07) */
  raisedTipMargin?: number;
}

/**
 * Standard MediaPipe Hand Landmark Connections (21 landmarks)
 */
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [9, 10], [10, 11], [11, 12],
  // Ring finger
  [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base connection
  [5, 9], [9, 13], [13, 17],
];

/**
 * 4-Layer Hand Verification Gate:
 *
 * 1. Layer 1 — Hand Presence & Confidence >= 0.75:
 *    - All 21 landmarks must be present and valid numbers.
 *    - Confidence score must be >= 0.75.
 *    - If no hand or only head/body/clothing detected => Reject.
 *
 * 2. Layer 2 — Raised Open-Palm Gesture Check:
 *    - Hand pointing upward: tips of middle (12) & index (8) must be higher than wrist (0) by at least 0.07
 *      (tip.y < wrist.y - 0.07).
 *    - Open Palm Check: at least 3 fingers extended
 *      (distance from TIP [8, 12, 16, 20] to WRIST [0] > 1.3 * distance from MCP [5, 9, 13, 17] to WRIST).
 *    - Palm center (MCP 9) y <= 0.70 (not resting at bottom of frame).
 *
 * 3. Layer 3 — Left / Right Zones:
 *    - Left zone ('yes'): mirroredX < 0.42
 *    - Right zone ('no'): mirroredX > 0.58
 *    - Center neutral zone: 0.42 <= mirroredX <= 0.58
 */
export function verifyRealHandGesture(
  landmarks: HandLandmarkPoint[] | null | undefined,
  confidence: number = 0.85,
  options: HandVerificationOptions = {}
): HandVerificationResult {
  const {
    minConfidence = 0.75,
    isMirrored = true,
    leftZoneThreshold = 0.42,
    rightZoneThreshold = 0.58,
    maxYThreshold = 0.70,
    raisedTipMargin = 0.07,
  } = options;

  // Base fallback result
  const baseResult: HandVerificationResult = {
    isValidHand: false,
    isHandDetected: false,
    isOpenPalm: false,
    zone: 'NONE',
    side: null,
    confidence: typeof confidence === 'number' && !isNaN(confidence) ? confidence : 0,
    extendedFingersCount: 0,
    mirroredX: 0.5,
    mirroredY: 0.5,
  };

  // --- LAYER 1: Hand Structure & Confidence ---
  if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 21) {
    return {
      ...baseResult,
      rejectionReason: 'NO_HAND_LANDMARKS_DETECTED',
    };
  }

  if (confidence < minConfidence) {
    return {
      ...baseResult,
      rejectionReason: `CONFIDENCE_TOO_LOW_${confidence.toFixed(2)}_MIN_${minConfidence.toFixed(2)}`,
    };
  }

  // Validate all 21 points are finite numbers
  for (let i = 0; i < 21; i++) {
    const pt = landmarks[i];
    if (
      !pt ||
      typeof pt.x !== 'number' ||
      typeof pt.y !== 'number' ||
      isNaN(pt.x) ||
      isNaN(pt.y) ||
      !isFinite(pt.x) ||
      !isFinite(pt.y)
    ) {
      return {
        ...baseResult,
        rejectionReason: `CORRUPTED_LANDMARK_AT_INDEX_${i}`,
      };
    }
  }

  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const middleTip = landmarks[12];
  const ringMcp = landmarks[13];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyTip = landmarks[20];

  const mirroredX = isMirrored ? 1.0 - middleMcp.x : middleMcp.x;
  const mirroredY = middleMcp.y;

  const resultWithPalm: HandVerificationResult = {
    ...baseResult,
    isHandDetected: true,
    confidence,
    mirroredX,
    mirroredY,
  };

  // --- LAYER 2: Raised Open-Palm Gesture Check ---

  // Check 2.1: Hand orientation upward (fingertips must be significantly higher than wrist)
  // In screen coordinates, y=0 is top and y=1 is bottom, so tip.y < wrist.y - 0.07 means tip is higher
  const isIndexRaised = indexTip.y < wrist.y - raisedTipMargin;
  const isMiddleRaised = middleTip.y < wrist.y - raisedTipMargin;

  if (!isIndexRaised || !isMiddleRaised) {
    return {
      ...resultWithPalm,
      rejectionReason: 'HAND_NOT_RAISED_OR_POINTING_DOWN',
    };
  }

  // Check 2.2: Open Palm Check (at least 3 fingers extended)
  // Extension test: distance(tip, wrist) > 1.3 * distance(mcp, wrist)
  const dist = (p1: HandLandmarkPoint, p2: HandLandmarkPoint) =>
    Math.hypot(p1.x - p2.x, p1.y - p2.y);

  const fingers = [
    { tip: indexTip, mcp: indexMcp },
    { tip: middleTip, mcp: middleMcp },
    { tip: ringTip, mcp: ringMcp },
    { tip: pinkyTip, mcp: pinkyMcp },
  ];

  let extendedCount = 0;
  for (const finger of fingers) {
    const tipToWrist = dist(finger.tip, wrist);
    const mcpToWrist = dist(finger.mcp, wrist);
    // Avoid division by zero or very collapsed joints
    if (mcpToWrist > 0.02 && tipToWrist > 1.3 * mcpToWrist) {
      extendedCount++;
    }
  }

  resultWithPalm.extendedFingersCount = extendedCount;

  if (extendedCount < 3) {
    return {
      ...resultWithPalm,
      rejectionReason: `FINGERS_NOT_EXTENDED_COUNT_${extendedCount}_MIN_3`,
    };
  }

  // Check 2.3: Palm center height inside answering zone (y <= maxYThreshold)
  if (middleMcp.y > maxYThreshold) {
    return {
      ...resultWithPalm,
      rejectionReason: `HAND_TOO_LOW_Y_${middleMcp.y.toFixed(2)}_MAX_${maxYThreshold.toFixed(2)}`,
    };
  }

  resultWithPalm.isOpenPalm = true;

  // --- LAYER 3: Left / Right Zone Assignment ---
  if (mirroredX < leftZoneThreshold) {
    return {
      ...resultWithPalm,
      isValidHand: true,
      zone: 'LEFT',
      side: 'yes',
    };
  }

  if (mirroredX > rightZoneThreshold) {
    return {
      ...resultWithPalm,
      isValidHand: true,
      zone: 'RIGHT',
      side: 'no',
    };
  }

  // Neutral center zone
  return {
    ...resultWithPalm,
    isValidHand: false,
    zone: 'CENTER',
    side: null,
    rejectionReason: 'NEUTRAL_CENTER_ZONE',
  };
}

/**
 * Utility to draw 21-point hand skeleton on a Canvas overlay
 */
export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: HandLandmarkPoint[],
  canvasWidth: number,
  canvasHeight: number,
  zone: HandZone = 'NONE',
  dwellProgress: number = 0
) {
  if (!landmarks || landmarks.length < 21) return;

  const isLeft = zone === 'LEFT';
  const isRight = zone === 'RIGHT';
  const isCenter = zone === 'CENTER';

  const strokeColor = isLeft
    ? 'rgba(16, 185, 129, 0.85)' // Emerald
    : isRight
    ? 'rgba(249, 115, 22, 0.85)' // Orange
    : isCenter
    ? 'rgba(56, 189, 248, 0.75)' // Cyan
    : 'rgba(255, 255, 255, 0.6)'; // Neutral White

  const jointColor = isLeft
    ? '#34D399'
    : isRight
    ? '#FB923C'
    : isCenter
    ? '#38BDF8'
    : '#E2E8F0';

  ctx.save();

  // Draw connections
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
    const p1 = landmarks[startIdx];
    const p2 = landmarks[endIdx];
    if (p1 && p2) {
      // Invert X because video feed is mirrored (scale-x-[-1])
      const x1 = (1.0 - p1.x) * canvasWidth;
      const y1 = p1.y * canvasHeight;
      const x2 = (1.0 - p2.x) * canvasWidth;
      const y2 = p2.y * canvasHeight;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // Draw 21 joints
  for (let i = 0; i < landmarks.length; i++) {
    const pt = landmarks[i];
    const x = (1.0 - pt.x) * canvasWidth;
    const y = pt.y * canvasHeight;

    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    const radius = isTip ? 5 : i === 0 || i === 9 ? 6 : 3.5;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = jointColor;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Draw Dwell Progress Ring around Palm Center (MCP 9) if in LEFT or RIGHT zone
  if ((isLeft || isRight) && dwellProgress > 0) {
    const palm = landmarks[9];
    const px = (1.0 - palm.x) * canvasWidth;
    const py = palm.y * canvasHeight;
    const ringRadius = 26;

    // Background track ring
    ctx.beginPath();
    ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Progress arc
    ctx.beginPath();
    ctx.arc(
      px,
      py,
      ringRadius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(1.0, dwellProgress)
    );
    ctx.strokeStyle = isLeft ? '#10B981' : '#F97316';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.restore();
}
