/**
 * packages/smart-biometric-core/src/vectorMath.ts
 * High-Precision Medical-Grade Biometric Vector Mathematics
 * US NIST SP 800-63B + Hospital-Grade Identity Verification
 */

import { BiometricMatchResult } from './types.js';
import {
  BIOMETRIC_CONFIG,
  MATCH_THRESHOLD,
  MIN_MARGIN,
  REQUIRED_CONSECUTIVE_FRAMES,
  CONSECUTIVE_FRAME_WINDOW,
} from './biometricConfig.js';

export const ACCEPTANCE_THRESHOLDS = {
  MIN_COSINE_SIMILARITY: BIOMETRIC_CONFIG.MIN_COSINE_SIMILARITY,
  MAX_EUCLIDEAN_DISTANCE: BIOMETRIC_CONFIG.MAX_EUCLIDEAN_DISTANCE,
  SINGLE_USER_STRICT_DISTANCE: BIOMETRIC_CONFIG.SINGLE_USER_STRICT_DISTANCE,
  MIN_MARGIN_DELTA: BIOMETRIC_CONFIG.MARGIN_MIN,
  MIN_SIMILARITY_PERCENTAGE: 85,
};

/**
 * Normalizes vector to unit length (L2 norm = 1.0)
 */
export function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return new Array(vector.length).fill(0);
  return vector.map((v) => v / norm);
}

/**
 * Computes Cosine Similarity between two unit-normalized vectors [-1.0 to 1.0]
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  return Math.max(-1, Math.min(1, dotProduct));
}

/**
 * Computes Euclidean Distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 2.0;
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * Computes arithmetic mean across multiple vectors and re-normalizes with L2 norm
 */
export function computeAverageVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const avg = new Array(dim).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      avg[i] += vec[i];
    }
  }

  const normalizedAvg = avg.map((v) => v / vectors.length);
  return l2Normalize(normalizedAvg);
}

/**
 * Unbiased Biometric Similarity Calculation (No Fake Boosting / No Artificial 98% Cap)
 * - Cosine >= 0.85 indicates true genuine match range (>= 85%)
 * - Cosine 0.70 to 0.84 indicates ambiguous borderline (50% to 79%) -> requires PIN confirmation
 * - Cosine < 0.70 is an unregistered stranger / impostor -> guaranteed strictly < 45%
 */
export function calibrateCosineSimilarity(rawCos: number): number {
  if (rawCos <= 0) return 0;
  if (rawCos >= BIOMETRIC_CONFIG.MIN_COSINE_SIMILARITY) {
    // 0.85 -> 1.0 maps naturally without artificial ceiling or boost
    return Math.min(1.0, rawCos);
  }
  if (rawCos >= 0.70) {
    // 0.70 - 0.85 maps to 0.50 - 0.79 (Ambiguous borderline zone)
    const t = (rawCos - 0.70) / (BIOMETRIC_CONFIG.MIN_COSINE_SIMILARITY - 0.70);
    return 0.50 + t * 0.29;
  }
  // True stranger / impostor (< 0.70): guaranteed strictly < 45% (never reaches 50%)
  return Math.max(0, (rawCos / 0.70) * 0.45);
}

/**
 * UI Percentage Formula: Unbiased conversion to whole percentage
 */
export function computeSimilarityPercentage(
  arg: number,
  cosineSim?: number,
  options?: { calibrated?: boolean }
): number {
  if (cosineSim !== undefined) {
    const effectiveSim = options?.calibrated ? calibrateCosineSimilarity(cosineSim) : cosineSim;
    return Math.max(0, Math.min(100, Math.round(effectiveSim * 100)));
  }
  return Math.max(0, Math.min(100, Math.round(arg * 100)));
}

export function computePercentageFromDistance(distance: number): number {
  return Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));
}

/**
 * Evaluates whether live probe matches reference face vector with Fail-Closed security.
 * Hard Rejection Rule:
 * Strictly requires BOTH Cosine Similarity >= 0.85 AND Euclidean Distance <= 0.38 (or 0.32 for single user).
 * Impostors with Cosine < 0.70 or Distance > 0.38 are unconditionally rejected.
 */
export function evaluateBiometricMatch(
  probeVector: number[],
  referenceVector: number[],
  options?: {
    minCosine?: number;
    maxEuclidean?: number;
    minSimilarityPercentage?: number;
    useCalibration?: boolean;
    isSingleUserInDb?: boolean;
  }
): BiometricMatchResult {
  const normProbe = l2Normalize(probeVector);
  const normRef = l2Normalize(referenceVector);

  const rawCos = cosineSimilarity(normProbe, normRef);
  const eucDist = euclideanDistance(normProbe, normRef);

  const calSim = calibrateCosineSimilarity(rawCos);
  const similarityPercentage = Math.max(0, Math.min(100, Math.round(calSim * 100)));

  const maxDist = options?.isSingleUserInDb
    ? BIOMETRIC_CONFIG.SINGLE_USER_STRICT_DISTANCE
    : (options?.maxEuclidean ?? BIOMETRIC_CONFIG.MAX_EUCLIDEAN_DISTANCE);
  const minCos = options?.minCosine ?? BIOMETRIC_CONFIG.MIN_COSINE_SIMILARITY;

  // Strict Fail-Closed Verification:
  // Must satisfy BOTH Cosine Similarity >= minCos AND Euclidean Distance <= maxDist
  const isMatch = rawCos >= minCos && eucDist <= maxDist;

  return {
    isMatch,
    cosineSimilarity: Number(rawCos.toFixed(4)),
    rawCosineSimilarity: Number(rawCos.toFixed(4)),
    calibratedSimilarity: Number(calSim.toFixed(4)),
    euclideanDistance: Number(eucDist.toFixed(4)),
    similarityPercentage,
  };
}

export interface EnrolledFaceAccount {
  userId: string;
  hn?: string;
  status?: string;
  faceConfirmed?: boolean;
  descriptor?: unknown;
  descriptors?: unknown[];
}

export interface MatchFaceOptions {
  matchThreshold?: number;
  minMargin?: number;
  allowedDims?: number[];
  onWarn?: (message: string) => void;
}

export interface FaceMatchDecision {
  status: 'MATCHED' | 'NOT_FOUND';
  matched: boolean;
  userId: string | null;
  distance: number;
  secondDistance: number;
  margin: number;
  message: string;
  showStaffRegisterButton: boolean;
  reason?: string;
}

const DEFAULT_ALLOWED_DIMS = [128, 512];

/**
 * Validates that a face descriptor is non-null, array/Float32Array of valid dimension (128 or 512),
 * contains strictly finite numbers (no NaN/Infinity), and has non-zero L2 norm.
 */
export function isValidDescriptor(
  descriptor: unknown,
  allowedDims: number[] = DEFAULT_ALLOWED_DIMS
): descriptor is number[] {
  if (!descriptor) return false;
  const arr =
    Array.isArray(descriptor)
      ? descriptor
      : descriptor instanceof Float32Array
        ? Array.from(descriptor)
        : null;
  if (!arr || arr.length === 0) return false;
  if (!allowedDims.includes(arr.length)) return false;

  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return false;
    }
    sumSq += val * val;
  }

  return Math.sqrt(sumSq) > 1e-4;
}

function toNumericDescriptor(descriptor: unknown): number[] | null {
  if (Array.isArray(descriptor)) return descriptor;
  if (descriptor instanceof Float32Array) return Array.from(descriptor);
  return null;
}

/**
 * Single-source Fail-Closed 1:N face matcher.
 * Passes ONLY when:
 * 1) Probe and candidate descriptors are valid,
 * 2) Closest Euclidean distance <= matchThreshold (default 0.45),
 * 3) Margin (secondClosestDistance - closestDistance) >= minMargin (default 0.08).
 * Otherwise returns NOT_FOUND ("ไม่พบบัญชี") with showStaffRegisterButton=true without throwing.
 */
export function matchFace(
  probeDescriptor: unknown,
  enrolledAccounts: EnrolledFaceAccount[],
  options: MatchFaceOptions = {}
): FaceMatchDecision {
  const matchThreshold = options.matchThreshold ?? MATCH_THRESHOLD;
  const minMargin = options.minMargin ?? MIN_MARGIN;
  const allowedDims = options.allowedDims ?? DEFAULT_ALLOWED_DIMS;
  const onWarn = options.onWarn;

  const failNotFound = (
    reason: string,
    distance = Infinity,
    secondDistance = Infinity,
    margin = 0
  ): FaceMatchDecision => ({
    status: 'NOT_FOUND',
    matched: false,
    userId: null,
    distance,
    secondDistance,
    margin,
    message: 'ไม่พบบัญชี',
    showStaffRegisterButton: true,
    reason,
  });

  if (!isValidDescriptor(probeDescriptor, allowedDims)) {
    return failNotFound('INVALID_PROBE_DESCRIPTOR');
  }

  const rawProbe = toNumericDescriptor(probeDescriptor);
  if (!rawProbe) {
    return failNotFound('INVALID_PROBE_DESCRIPTOR');
  }
  const normProbe = l2Normalize(rawProbe);

  if (!Array.isArray(enrolledAccounts) || enrolledAccounts.length === 0) {
    return failNotFound('NO_ENROLLED_ACCOUNTS');
  }

  const scoredAccounts: Array<{ userId: string; distance: number }> = [];

  for (const account of enrolledAccounts) {
    if (!account || !account.userId) continue;
    if (account.status === 'archived' || account.status === 'inactive' || account.faceConfirmed === false) {
      continue;
    }

    const rawCandidates: unknown[] = [];
    if (account.descriptor !== undefined) rawCandidates.push(account.descriptor);
    if (Array.isArray(account.descriptors)) rawCandidates.push(...account.descriptors);

    let accountBestDist = Infinity;
    let hasValidAccountVec = false;

    for (const rawCand of rawCandidates) {
      if (!isValidDescriptor(rawCand, allowedDims)) continue;
      const candArr = toNumericDescriptor(rawCand);
      if (!candArr || candArr.length !== normProbe.length) continue;

      hasValidAccountVec = true;
      const normCand = l2Normalize(candArr);
      const dist = euclideanDistance(normProbe, normCand);
      if (dist < accountBestDist) {
        accountBestDist = dist;
      }
    }

    if (!hasValidAccountVec) {
      onWarn?.(`[FACE-AUTH] Skipped active account ${account.userId} without valid face descriptor`);
      continue;
    }

    scoredAccounts.push({
      userId: account.userId,
      distance: Number(accountBestDist.toFixed(6)),
    });
  }

  if (scoredAccounts.length === 0) {
    return failNotFound('NO_VALID_DESCRIPTORS');
  }

  scoredAccounts.sort((a, b) => a.distance - b.distance);
  const closest = scoredAccounts[0];
  const secondClosest = scoredAccounts.length > 1 ? scoredAccounts[1] : null;
  const secondDistance = secondClosest ? secondClosest.distance : Infinity;
  const margin = secondClosest ? Number((secondDistance - closest.distance).toFixed(6)) : Infinity;

  if (closest.distance > matchThreshold) {
    return failNotFound('ABOVE_MATCH_THRESHOLD', closest.distance, secondDistance, secondClosest ? margin : 0);
  }

  if (secondClosest && margin < minMargin) {
    return failNotFound('BELOW_MIN_MARGIN', closest.distance, secondDistance, margin);
  }

  return {
    status: 'MATCHED',
    matched: true,
    userId: closest.userId,
    distance: closest.distance,
    secondDistance,
    margin: secondClosest ? margin : Infinity,
    message: 'ยืนยันตัวตนสำเร็จ',
    showStaffRegisterButton: false,
  };
}

/**
 * Tracks consecutive frames matching the exact same userId within a sliding frame window.
 */
export class ConsecutiveFrameTracker {
  private streakUserId: string | null = null;
  private streakCount = 0;
  private readonly requiredFrames: number;
  private readonly maxWindow: number;

  constructor(
    requiredFrames: number = REQUIRED_CONSECUTIVE_FRAMES,
    maxWindow: number = CONSECUTIVE_FRAME_WINDOW
  ) {
    this.requiredFrames = Math.max(1, requiredFrames);
    this.maxWindow = Math.max(this.requiredFrames, maxWindow);
  }

  reset(): void {
    this.streakUserId = null;
    this.streakCount = 0;
  }

  push(decision: FaceMatchDecision): {
    confirmed: boolean;
    userId: string | null;
    streakCount: number;
    requiredFrames: number;
  } {
    if (!decision.matched || !decision.userId) {
      this.reset();
      return {
        confirmed: false,
        userId: null,
        streakCount: 0,
        requiredFrames: this.requiredFrames,
      };
    }

    if (this.streakUserId === decision.userId) {
      this.streakCount += 1;
    } else {
      this.streakUserId = decision.userId;
      this.streakCount = 1;
    }

    return {
      confirmed: this.streakCount >= this.requiredFrames,
      userId: this.streakCount >= this.requiredFrames ? this.streakUserId : null,
      streakCount: this.streakCount,
      requiredFrames: this.requiredFrames,
    };
  }

  getMaxWindow(): number {
    return this.maxWindow;
  }
}

/**
 * Evaluates a sequence of up to 5 frames and grants MATCHED only when >= 3 consecutive frames
 * match the same userId under MATCH_THRESHOLD and MIN_MARGIN.
 */
export function evaluateConsecutiveFaceFrames(
  frameDescriptors: unknown[],
  enrolledAccounts: EnrolledFaceAccount[],
  options: MatchFaceOptions & { requiredConsecutiveFrames?: number; maxWindow?: number } = {}
): FaceMatchDecision & { consecutiveCount: number } {
  const required = options.requiredConsecutiveFrames ?? REQUIRED_CONSECUTIVE_FRAMES;
  const maxWindow = options.maxWindow ?? CONSECUTIVE_FRAME_WINDOW;
  const tracker = new ConsecutiveFrameTracker(required, maxWindow);
  const windowFrames = Array.isArray(frameDescriptors) ? frameDescriptors.slice(-maxWindow) : [];

  let lastDecision: FaceMatchDecision = {
    status: 'NOT_FOUND',
    matched: false,
    userId: null,
    distance: Infinity,
    secondDistance: Infinity,
    margin: 0,
    message: 'ไม่พบบัญชี',
    showStaffRegisterButton: true,
    reason: 'INSUFFICIENT_FRAMES',
  };

  for (const frame of windowFrames) {
    const decision = matchFace(frame, enrolledAccounts, options);
    lastDecision = decision;
    const state = tracker.push(decision);
    if (state.confirmed && state.userId) {
      return {
        ...decision,
        matched: true,
        status: 'MATCHED',
        consecutiveCount: state.streakCount,
      };
    }
  }

  return {
    ...lastDecision,
    status: 'NOT_FOUND',
    matched: false,
    userId: null,
    message: 'ไม่พบบัญชี',
    showStaffRegisterButton: true,
    consecutiveCount: 0,
    reason: lastDecision.matched ? 'INSUFFICIENT_CONSECUTIVE_FRAMES' : (lastDecision.reason || 'INSUFFICIENT_FRAMES'),
  };
}

const AUTHORIZED_STAFF_ROLES = new Set([
  'admin',
  'pt',
  'staff',
  'director',
  'doctor',
  'nurse',
  'caregiver',
]);

/**
 * Authorization guard ensuring only authenticated staff/clinicians can invoke patient registration.
 */
export function canAccessStaffRegistration(
  actor: { role?: string | null; isAuthenticated?: boolean } | null | undefined
): boolean {
  if (!actor || actor.isAuthenticated !== true) return false;
  const normalizedRole = typeof actor.role === 'string' ? actor.role.trim().toLowerCase() : '';
  return AUTHORIZED_STAFF_ROLES.has(normalizedRole);
}
