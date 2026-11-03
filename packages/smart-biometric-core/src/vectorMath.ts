/**
 * packages/smart-biometric-core/src/vectorMath.ts
 * High-Precision Medical-Grade Biometric Vector Mathematics
 * US NIST SP 800-63B + Hospital-Grade Identity Verification
 */

import { BiometricMatchResult } from './types.js';
import { BIOMETRIC_CONFIG } from './biometricConfig.js';

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
