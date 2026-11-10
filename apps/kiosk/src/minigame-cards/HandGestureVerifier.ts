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
    minConfidence = 0.45,
    isMirrored = true,
    leftZoneThreshold = 0.46,
    rightZoneThreshold = 0.54,
    maxYThreshold = 0.88,
    raisedTipMargin = 0.02,
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

  // --- LAYER 2: Raised Open-Palm Gesture Check (Optimized for elderly patients at 1-2m) ---

  // Check 2.1: Hand orientation upward
  // Accept if index/middle tip is higher than wrist, or fingertips are higher than MCP knuckles
  const isIndexRaised = indexTip.y < wrist.y - raisedTipMargin || indexTip.y < indexMcp.y;
  const isMiddleRaised = middleTip.y < wrist.y - raisedTipMargin || middleTip.y < middleMcp.y;
  const isAnyFingerRaised = isIndexRaised || isMiddleRaised || ringTip.y < ringMcp.y || pinkyTip.y < pinkyMcp.y;

  if (!isAnyFingerRaised) {
    return {
      ...resultWithPalm,
      rejectionReason: 'HAND_NOT_RAISED_OR_POINTING_DOWN',
    };
  }

  // Check 2.2: Open Palm Check
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
    // Relaxed threshold for distance foreshortening / elderly curvature
    if (mcpToWrist > 0.02 && (tipToWrist > 1.15 * mcpToWrist || finger.tip.y < finger.mcp.y)) {
      extendedCount++;
    }
  }

  resultWithPalm.extendedFingersCount = extendedCount;

  if (extendedCount < 1) {
    return {
      ...resultWithPalm,
      rejectionReason: `FINGERS_NOT_EXTENDED_COUNT_${extendedCount}_MIN_1`,
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

/**
 * Anatomical Left vs Right Hand Evaluation
 * Accurately determines if the patient is raising their real anatomical Left Hand or Right Hand.
 *
 * Principles:
 * 1. Comfortable elevation: Hand at or above chest level (y <= maxYThreshold 0.78).
 * 2. Extended open palm: At least 3 extended fingers (tip to wrist > 1.25 * mcp to wrist).
 * 3. Spatial and anatomical handedness:
 *    - In un-mirrored raw camera feed: MediaPipe returns categoryName 'Left' for person's real Left Hand.
 *    - In mirrored screen space (what user sees): User's Left hand is on the Left half (mirroredX < 0.65).
 *    - User's Right hand is on the Right half (mirroredX > 0.35).
 */
export interface AnatomicalHandEvaluation {
  isValid: boolean;
  anatomicalSide: 'left' | 'right' | null;
  confidence: number;
  extendedFingers: number;
  palmCenter: { x: number; y: number; mirroredX: number };
  palmSize: number;
  rejectionReason?: string;
}

export function evaluateAnatomicalHand(
  landmarks: HandLandmarkPoint[] | null | undefined,
  categoryName?: string, // 'Left' | 'Right' from MediaPipe handedness
  confidence: number = 0.85,
  options: {
    minConfidence?: number;
    isMirrored?: boolean;
    maxYThreshold?: number;
    raisedTipMargin?: number;
  } = {}
): AnatomicalHandEvaluation {
  const {
    minConfidence = 0.70,
    isMirrored = true,
    maxYThreshold = 0.78, // comfortable chest level, doesn't require stretching all the way up
    raisedTipMargin = 0.04, // slight upward elevation
  } = options;

  const baseResult: AnatomicalHandEvaluation = {
    isValid: false,
    anatomicalSide: null,
    confidence: typeof confidence === 'number' && !isNaN(confidence) ? confidence : 0,
    extendedFingers: 0,
    palmCenter: { x: 0.5, y: 0.5, mirroredX: 0.5 },
    palmSize: 0,
  };

  if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 21) {
    return { ...baseResult, rejectionReason: 'NO_HAND_LANDMARKS' };
  }

  if (confidence < minConfidence) {
    return { ...baseResult, rejectionReason: 'LOW_CONFIDENCE' };
  }

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const middleTip = landmarks[12];
  const indexTip = landmarks[8];

  const mirroredX = isMirrored ? 1.0 - middleMcp.x : middleMcp.x;
  const palmSize = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);

  baseResult.palmCenter = { x: middleMcp.x, y: middleMcp.y, mirroredX };
  baseResult.palmSize = palmSize;

  // Comfortable height check: wrist & middle MCP should be at chest or above (y <= maxYThreshold)
  if (middleMcp.y > maxYThreshold || wrist.y > maxYThreshold) {
    return { ...baseResult, rejectionReason: 'HAND_BELOW_CHEST' };
  }

  // Raised upward: fingertips higher than wrist
  if (middleTip.y > wrist.y - raisedTipMargin && indexTip.y > wrist.y - raisedTipMargin) {
    return { ...baseResult, rejectionReason: 'HAND_NOT_UPWARD' };
  }

  // Count extended fingers
  const dist = (p1: HandLandmarkPoint, p2: HandLandmarkPoint) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const fingers = [
    { tip: landmarks[8], mcp: landmarks[5] },
    { tip: landmarks[12], mcp: landmarks[9] },
    { tip: landmarks[16], mcp: landmarks[13] },
    { tip: landmarks[20], mcp: landmarks[17] },
  ];

  let extendedCount = 0;
  for (const finger of fingers) {
    const tipToWrist = dist(finger.tip, wrist);
    const mcpToWrist = dist(finger.mcp, wrist);
    if (mcpToWrist > 0.02 && tipToWrist > 1.25 * mcpToWrist) {
      extendedCount++;
    }
  }

  baseResult.extendedFingers = extendedCount;
  if (extendedCount < 3) {
    return { ...baseResult, rejectionReason: 'FINGERS_NOT_OPEN' };
  }

  // Determine Anatomical Left vs Right:
  // When raw webcam frame is processed (without horizontal flip):
  // MediaPipe predicts categoryName 'Left' for anatomical Left hand, 'Right' for Right hand.
  // In mirrored screen space (what user sees on screen):
  // User's Left hand appears on the Left side of the screen (mirroredX < 0.55).
  // User's Right hand appears on the Right side of the screen (mirroredX > 0.45).
  let side: 'left' | 'right' | null = null;
  const normalizedCategory = (categoryName || '').toLowerCase();

  if (normalizedCategory === 'left') {
    side = 'left';
  } else if (normalizedCategory === 'right') {
    side = 'right';
  } else {
    // Geometric fallback if categoryName is missing:
    // User's Left hand in mirror screen is on the Left side (mirroredX < 0.5)
    side = mirroredX < 0.5 ? 'left' : 'right';
  }

  // Spatial consistency guard: Left hand must be on the user's left side (mirroredX < 0.68),
  // Right hand must be on the user's right side (mirroredX > 0.32)
  if (side === 'left' && mirroredX > 0.68) {
    return { ...baseResult, rejectionReason: 'LEFT_HAND_OVEREXTENDED_RIGHT' };
  }
  if (side === 'right' && mirroredX < 0.32) {
    return { ...baseResult, rejectionReason: 'RIGHT_HAND_OVEREXTENDED_LEFT' };
  }

  return {
    ...baseResult,
    isValid: true,
    anatomicalSide: side,
  };
}

/**
 * Canonical Hand-to-Answer Mapping for Physical Card Minigame:
 * Right Hand (มือขวา) = 'yes' (ใช่)
 * Left Hand (มือซ้าย) = 'no' (ไม่)
 */
export const HAND_ANSWER_MAP = {
  right: 'yes',
  left: 'no',
} as const;

export type HandAnswerMapped = (typeof HAND_ANSWER_MAP)[keyof typeof HAND_ANSWER_MAP];

export interface MinigameHandEvaluation {
  handIndex: number;
  landmarks: HandLandmarkPoint[];
  anatomicalSide: 'left' | 'right';
  answerSide: 'yes' | 'no';
  isRaised: boolean;
  confidence: number;
  extendedFingers: number;
  palmCenter: { x: number; y: number; mirroredX: number; mirroredY: number };
  palmSize: number;
  isNearEdge: boolean;
  rejectionReason?: string;
}

export interface MinigameFrameResult {
  allHands: MinigameHandEvaluation[];
  raisedHands: MinigameHandEvaluation[];
  activeHand: MinigameHandEvaluation | null;
  isBothHandsRaised: boolean;
  hasNearEdgeHand: boolean;
}

/**
 * Multi-hand evaluation specifically engineered for Minigame "การ์ดกายภาพ"
 * - Supports 2 hands simultaneously
 * - Decides Left/Right from anatomical handedness
 * - Inverts mapping: Right hand = "yes", Left hand = "no"
 * - Rejects background users by focusing on the largest palm close to center
 * - Flags near-edge positioning
 */
export function evaluateMinigameFrame(
  rawHands: HandLandmarkPoint[][] | null | undefined,
  handednessList: any[] | null | undefined,
  options: {
    isMirrored?: boolean;
    minConfidence?: number;
    maxYThreshold?: number;
    raisedTipMargin?: number;
  } = {}
): MinigameFrameResult {
  const {
    isMirrored = true,
    minConfidence = 0.45,
    maxYThreshold = 0.78, // ระดับอกที่สบายต่อผู้ป่วยสูงอายุ
    raisedTipMargin = 0.03,
  } = options;

  if (!rawHands || !Array.isArray(rawHands) || rawHands.length === 0) {
    return {
      allHands: [],
      raisedHands: [],
      activeHand: null,
      isBothHandsRaised: false,
      hasNearEdgeHand: false,
    };
  }

  const dist = (p1: HandLandmarkPoint, p2: HandLandmarkPoint) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

  // 1. Evaluate all detected hands
  const evaluatedList: MinigameHandEvaluation[] = [];

  for (let i = 0; i < rawHands.length; i++) {
    const landmarks = rawHands[i];
    if (!landmarks || landmarks.length < 21) continue;

    const rawHandedness = handednessList?.[i];
    const catName = Array.isArray(rawHandedness)
      ? rawHandedness[0]?.categoryName || ''
      : (rawHandedness as any)?.categoryName || '';
    const confidence = Array.isArray(rawHandedness)
      ? rawHandedness[0]?.score ?? 0.85
      : (rawHandedness as any)?.score ?? 0.85;

    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const indexMcp = landmarks[5];
    const middleTip = landmarks[12];
    const middleMcp = landmarks[9];
    const ringTip = landmarks[16];
    const ringMcp = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyMcp = landmarks[17];

    const mirroredX = isMirrored ? 1.0 - middleMcp.x : middleMcp.x;
    const mirroredY = middleMcp.y;
    const palmSize = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);

    const isNearEdge =
      mirroredX < 0.08 ||
      mirroredX > 0.92 ||
      middleTip.y < 0.04 ||
      wrist.y > 0.94;

    // Determine anatomical hand:
    // When input raw frame is unmirrored:
    // MediaPipe predicts 'Right' for person's real Right hand, 'Left' for Left hand.
    let anatomicalSide: 'left' | 'right';
    const norm = catName.toLowerCase();
    if (norm === 'right' || norm === 'left') {
      anatomicalSide = norm;
    } else {
      anatomicalSide = mirroredX > 0.5 ? 'right' : 'left';
    }

    // Spatial consistency guard:
    // In mirrored mode (scale-x-[-1]): player's right hand appears on Screen Right (mirroredX > 0.65)
    // In non-mirrored mode: player's right hand appears on Screen Left (middleMcp.x < 0.35)
    if (isMirrored) {
      if (mirroredX > 0.65) {
        anatomicalSide = 'right';
      } else if (mirroredX < 0.35) {
        anatomicalSide = 'left';
      }
    } else {
      if (middleMcp.x < 0.35) {
        anatomicalSide = 'right';
      } else if (middleMcp.x > 0.65) {
        anatomicalSide = 'left';
      }
    }

    // Canonical mapping: Right hand = 'yes' (ใช่), Left hand = 'no' (ไม่)
    const answerSide = HAND_ANSWER_MAP[anatomicalSide];

    // Extended fingers check
    const fingers = [
      { tip: indexTip, mcp: indexMcp },
      { tip: middleTip, mcp: middleMcp },
      { tip: ringTip, mcp: ringMcp },
      { tip: pinkyTip, mcp: pinkyMcp },
    ];
    let extendedFingers = 0;
    for (const f of fingers) {
      const tipToWrist = dist(f.tip, wrist);
      const mcpToWrist = dist(f.mcp, wrist);
      if (mcpToWrist > 0.02 && (tipToWrist > 1.18 * mcpToWrist || f.tip.y < f.mcp.y)) {
        extendedFingers++;
      }
    }

    // Raised hand check:
    const isUpward = middleTip.y < wrist.y - raisedTipMargin || indexTip.y < wrist.y - raisedTipMargin;
    const isAboveChest = middleMcp.y <= maxYThreshold && wrist.y <= 0.88;
    const isOpen = extendedFingers >= 2;
    const isConfOk = confidence >= minConfidence;

    const isRaised = isUpward && isAboveChest && isOpen && isConfOk;

    evaluatedList.push({
      handIndex: i,
      landmarks,
      anatomicalSide,
      answerSide,
      isRaised,
      confidence,
      extendedFingers,
      palmCenter: { x: middleMcp.x, y: middleMcp.y, mirroredX, mirroredY },
      palmSize,
      isNearEdge,
    });
  }

  if (evaluatedList.length === 0) {
    return {
      allHands: [],
      raisedHands: [],
      activeHand: null,
      isBothHandsRaised: false,
      hasNearEdgeHand: false,
    };
  }

  // 2. Multi-person filter: Focus on primary player (largest palm)
  const maxPalm = Math.max(...evaluatedList.map((h) => h.palmSize));
  const primaryHands = evaluatedList.filter((h) => h.palmSize >= maxPalm * 0.45);

  const raisedHands = primaryHands.filter((h) => h.isRaised);
  const hasNearEdgeHand = primaryHands.some((h) => h.isNearEdge);

  const rightRaised = raisedHands.filter((h) => h.anatomicalSide === 'right');
  const leftRaised = raisedHands.filter((h) => h.anatomicalSide === 'left');

  let isBothHandsRaised = false;
  let activeHand: MinigameHandEvaluation | null = null;

  if (rightRaised.length > 0 && leftRaised.length > 0) {
    // ทั้งสองข้างยกขึ้นมา ตรวจสอบด้วย Differential Height
    const highestRight = rightRaised.reduce((prev, curr) => (curr.palmCenter.y < prev.palmCenter.y ? curr : prev));
    const highestLeft = leftRaised.reduce((prev, curr) => (curr.palmCenter.y < prev.palmCenter.y ? curr : prev));
    const heightDiff = Math.abs(highestRight.palmCenter.y - highestLeft.palmCenter.y);

    // หากมือข้างหนึ่งยกสูงกว่าอีกข้างชัดเจน (> 0.15) หรือมืออีกข้างอยู่ในโซนต่ำพักแขน (> 0.68)
    // ให้ถือว่าเลือกตอบด้วยมือข้างที่ยกสูงจริง ไม่ติดสถานะยก 2 มือ
    if (heightDiff > 0.15 || highestRight.palmCenter.y > 0.68 || highestLeft.palmCenter.y > 0.68) {
      activeHand = highestRight.palmCenter.y < highestLeft.palmCenter.y ? highestRight : highestLeft;
      isBothHandsRaised = false;
    } else {
      isBothHandsRaised = true;
      activeHand = null;
    }
  } else if (raisedHands.length > 0) {
    // ยกข้างเดียวชัดเจน
    activeHand = raisedHands.reduce((prev, curr) => (curr.palmCenter.y < prev.palmCenter.y ? curr : prev));
    isBothHandsRaised = false;
  }

  return {
    allHands: primaryHands,
    raisedHands,
    activeHand,
    isBothHandsRaised,
    hasNearEdgeHand,
  };
}

/**
 * Draw all detected hand skeletons on the overlay canvas with side-specific clinical colors:
 * - Right hand (answering 'yes'): Emerald Green
 * - Left hand (answering 'no'): Amber / Orange
 * - Neutral / Lowered: Clean White
 * - Dwell Progress Ring centered on active palm MCP
 */
export function drawAllMinigameHands(
  ctx: CanvasRenderingContext2D,
  hands: MinigameHandEvaluation[],
  canvasWidth: number,
  canvasHeight: number,
  activeHand: MinigameHandEvaluation | null,
  dwellProgress: number = 0,
  isBothHandsWarning: boolean = false,
  isMirrored: boolean = true
) {
  if (!hands || hands.length === 0) return;

  ctx.save();

  const mapX = (xNorm: number) => (isMirrored ? 1.0 - xNorm : xNorm) * canvasWidth;
  const mapY = (yNorm: number) => yNorm * canvasHeight;

  for (const h of hands) {
    const isCurrentActive = Boolean(activeHand && activeHand.handIndex === h.handIndex);
    const isRight = h.anatomicalSide === 'right';

    let strokeColor = 'rgba(255, 255, 255, 0.45)';
    let jointColor = '#E2E8F0';

    if (isBothHandsWarning && h.isRaised) {
      strokeColor = 'rgba(244, 63, 94, 0.85)'; // Rose warning
      jointColor = '#FB7185';
    } else if (isCurrentActive) {
      if (isRight) {
        strokeColor = 'rgba(16, 185, 129, 0.95)'; // Vibrant Emerald (Right = Yes)
        jointColor = '#34D399';
      } else {
        strokeColor = 'rgba(249, 115, 22, 0.95)'; // Vibrant Orange (Left = No)
        jointColor = '#FB923C';
      }
    } else if (h.isRaised) {
      strokeColor = isRight ? 'rgba(16, 185, 129, 0.6)' : 'rgba(249, 115, 22, 0.6)';
      jointColor = isRight ? '#6EE7B7' : '#FDBA74';
    }

    // Batched 21-point connections in a single draw call (GPU accelerated)
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isCurrentActive ? 4 : 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = h.landmarks[startIdx];
      const p2 = h.landmarks[endIdx];
      if (p1 && p2) {
        ctx.moveTo(mapX(p1.x), mapY(p1.y));
        ctx.lineTo(mapX(p2.x), mapY(p2.y));
      }
    }
    ctx.stroke();

    // Draw 21 joints
    for (let i = 0; i < h.landmarks.length; i++) {
      const pt = h.landmarks[i];
      const x = mapX(pt.x);
      const y = mapY(pt.y);

      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const radius = isTip ? 5 : i === 0 || i === 9 ? 6 : 3;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = jointColor;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw Dwell Progress Ring on the Active Hand's Palm (MCP 9)
    if (isCurrentActive && dwellProgress > 0) {
      const palm = h.landmarks[9];
      const px = mapX(palm.x);
      const py = mapY(palm.y);
      const ringRadius = 32;

      // Outer glow / track
      ctx.beginPath();
      ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 5;
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
      ctx.strokeStyle = isRight ? '#10B981' : '#F97316';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  ctx.restore();
}

export interface InterpolateHandsOptions {
  /** If true, dynamically adjusts alpha based on hand movement velocity */
  adaptive?: boolean;
  /** Milliseconds to extrapolate forward based on current velocity (max 80ms) */
  extrapolateMs?: number;
  /** Delta time in milliseconds since last update (default ~16ms) */
  deltaTimeMs?: number;
}

/**
 * Velocity-Adaptive Linear Interpolation (Lerp) & Latency Compensation for Multi-Hand Landmarks
 * - Stillness: Low-pass filter (alpha ~0.45) eliminates jitter and tremor.
 * - Fast motion / horizontal hand sweep: alpha -> 0.98+ for instant zero-lag response.
 * - Forward extrapolation (Dead Reckoning): projects coordinates 30-50ms ahead to cancel camera latency.
 */
export function interpolateHands<T extends MinigameHandEvaluation | HandLandmarkPoint[]>(
  prev: T[] | null | undefined,
  target: T[] | null | undefined,
  alpha: number = 0.45,
  options?: InterpolateHandsOptions
): T[] {
  if (!target || target.length === 0) return [];
  if (!prev || prev.length === 0) return target;

  const isEvaluation = 'landmarks' in (target[0] as any);
  const isAdaptive = Boolean(options?.adaptive);
  const dt = Math.max(1, options?.deltaTimeMs || 16.6);
  const dtSec = dt / 1000;
  const maxExtrapolateSec = Math.min(0.08, Math.max(0, (options?.extrapolateMs || 0) / 1000));

  if (isEvaluation) {
    const prevHands = prev as unknown as MinigameHandEvaluation[];
    const targetHands = target as unknown as MinigameHandEvaluation[];

    const result = targetHands.map((tgt) => {
      const prevHand = prevHands.find(
        (p) => p.anatomicalSide === tgt.anatomicalSide || p.handIndex === tgt.handIndex
      );
      if (!prevHand || !prevHand.landmarks || prevHand.landmarks.length < 21) {
        return tgt;
      }

      // Compute palm displacement and speed (normalized screens per second)
      const prevPalm = prevHand.palmCenter;
      const tgtPalm = tgt.palmCenter;
      const palmDist = Math.hypot(tgtPalm.x - prevPalm.x, tgtPalm.y - prevPalm.y);
      const palmSpeed = palmDist / dtSec; // e.g. 0.02 (still) to 3.0+ (rapid hand sweep)

      // Velocity-Adaptive Alpha:
      // Stillness (< 0.08 screen/s): alpha = 0.45 (smooth, zero jitter, tremor-free)
      // Moderate (0.08 - 0.40 screen/s): alpha smoothly ramps from 0.45 to 0.92
      // Fast sweep (>= 0.40 screen/s): alpha = 0.98 (instantaneous tracking)
      let effectiveAlpha = alpha;
      let extrapHorizon = 0;

      if (isAdaptive) {
        if (palmSpeed < 0.08) {
          effectiveAlpha = 0.45;
          extrapHorizon = 0;
        } else if (palmSpeed < 0.40) {
          const ratio = (palmSpeed - 0.08) / (0.40 - 0.08);
          effectiveAlpha = 0.45 + ratio * 0.47; // 0.45 -> 0.92
          extrapHorizon = maxExtrapolateSec * ratio;
        } else {
          effectiveAlpha = 0.98;
          extrapHorizon = maxExtrapolateSec;
        }
      }

      // Palm velocity vector (units / second)
      const palmVx = (tgtPalm.x - prevPalm.x) / dtSec;
      const palmVy = (tgtPalm.y - prevPalm.y) / dtSec;

      const smoothedLandmarks: HandLandmarkPoint[] = tgt.landmarks.map((pt, idx) => {
        const prevPt = prevHand.landmarks[idx];
        if (!prevPt) return pt;

        // Base smoothed coordinates
        let sx = prevPt.x + (pt.x - prevPt.x) * effectiveAlpha;
        let sy = prevPt.y + (pt.y - prevPt.y) * effectiveAlpha;
        let sz =
          typeof pt.z === 'number' && typeof prevPt.z === 'number'
            ? prevPt.z + (pt.z - prevPt.z) * effectiveAlpha
            : pt.z;

        // Predictive Extrapolation: project forward by extrapHorizon to overlay moving hand in video
        if (extrapHorizon > 0 && palmSpeed >= 0.08) {
          const ptVx = (pt.x - prevPt.x) / dtSec;
          const ptVy = (pt.y - prevPt.y) / dtSec;
          const blendedVx = ptVx * 0.65 + palmVx * 0.35;
          const blendedVy = ptVy * 0.65 + palmVy * 0.35;

          sx = Math.max(0.01, Math.min(0.99, sx + blendedVx * extrapHorizon));
          sy = Math.max(0.01, Math.min(0.99, sy + blendedVy * extrapHorizon));
        }

        return { x: sx, y: sy, z: sz };
      });

      let smoothedPalmX = prevPalm.x + (tgtPalm.x - prevPalm.x) * effectiveAlpha;
      let smoothedPalmY = prevPalm.y + (tgtPalm.y - prevPalm.y) * effectiveAlpha;
      if (extrapHorizon > 0 && palmSpeed >= 0.08) {
        smoothedPalmX = Math.max(0.01, Math.min(0.99, smoothedPalmX + palmVx * extrapHorizon));
        smoothedPalmY = Math.max(0.01, Math.min(0.99, smoothedPalmY + palmVy * extrapHorizon));
      }

      const smoothedPalm = {
        x: smoothedPalmX,
        y: smoothedPalmY,
        mirroredX: 1.0 - smoothedPalmX,
        mirroredY: smoothedPalmY,
      };

      return {
        ...tgt,
        landmarks: smoothedLandmarks,
        palmCenter: smoothedPalm,
      };
    });

    return result as unknown as T[];
  }

  // Raw LandmarkPoint array fallback
  const prevList = prev as unknown as HandLandmarkPoint[][];
  const targetList = target as unknown as HandLandmarkPoint[][];

  const result = targetList.map((tgtHand, hIdx) => {
    const prevHand = prevList[hIdx];
    if (!prevHand) return tgtHand;
    return tgtHand.map((pt, idx) => {
      const prevPt = prevHand[idx];
      if (!prevPt) return pt;
      return {
        x: prevPt.x + (pt.x - prevPt.x) * alpha,
        y: prevPt.y + (pt.y - prevPt.y) * alpha,
        z:
          typeof pt.z === 'number' && typeof prevPt.z === 'number'
            ? prevPt.z + (pt.z - prevPt.z) * alpha
            : pt.z,
      };
    });
  });

  return result as unknown as T[];
}
