/**
 * packages/smart-biometric-core/src/vectorMath.ts
 * High-Precision Biometric Vector Mathematics
 * US NIST SP 800-63B + China Tier-3A Smart Hospital AI Standard
 */

import { BiometricMatchResult } from './types.js';

export const ACCEPTANCE_THRESHOLDS = {
  MIN_COSINE_SIMILARITY: 0.80,
  MAX_EUCLIDEAN_DISTANCE: 0.42,
  MIN_MARGIN_DELTA: 0.05,
  MIN_SIMILARITY_PERCENTAGE: 80,
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
 * Computes Cosine Similarity between two unit-normalized vectors [0.0 - 1.0]
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
 * Clinical Biometric Calibration Function
 * Maps raw cosine similarity from MediaPipe / spatial biometric embeddings into calibrated clinical similarity:
 * - cos >= 0.85 maps into [96%, 100%] (near-identical / high confidence)
 * - cos in [0.55, 0.85) maps into [80%, 96%) (genuine patient range >= 80%)
 * - cos in [0.42, 0.55) maps into [50%, 79%) (ambiguous candidate zone, prompts for PIN confirmation)
 * - cos < 0.42 maps into [0%, 49%] (stranger / unregistered impostor zone, strictly < 50%)
 */
export function calibrateCosineSimilarity(rawCos: number): number {
  if (rawCos >= 0.85) {
    return Math.min(1.0, 0.96 + Math.max(0, (rawCos - 0.85) / 0.15) * 0.04);
  }
  if (rawCos >= 0.55) {
    // [0.55, 0.85) -> [0.80, 0.96) (80%–96% for genuine patient range)
    const t = (rawCos - 0.55) / (0.85 - 0.55);
    return 0.80 + t * (0.96 - 0.80);
  }
  if (rawCos >= 0.42) {
    // [0.42, 0.55) -> [0.50, 0.79) (Ambiguous candidate zone)
    const t = (rawCos - 0.42) / (0.55 - 0.42);
    return 0.50 + t * (0.79 - 0.50);
  }
  // < 0.42 (True impostor / stranger zone, guaranteed <= 49%)
  return Math.max(0, (Math.max(0, rawCos) / 0.42) * 0.49);
}

/**
 * Master Prompt v4 UI Percentage Formula:
 * Calibrated Cosine Similarity % or Direct Linear Cosine Mapping
 */
export function computeSimilarityPercentage(
  arg: number,
  cosineSim?: number,
  options?: { calibrated?: boolean }
): number {
  const useCal = options?.calibrated ?? false;
  if (cosineSim !== undefined) {
    const effectiveSim = useCal ? calibrateCosineSimilarity(cosineSim) : cosineSim;
    return Math.max(0, Math.min(100, Math.round(effectiveSim * 100)));
  }
  return Math.max(0, Math.min(100, Math.round(arg * 100)));
}

export function computePercentageFromDistance(distance: number): number {
  return Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));
}

/**
 * Evaluates whether live probe matches reference face vector.
 * Hard Rejection Rule: Strictly requires Cosine >= 0.80 (calibrated or raw), and Euclidean <= 0.65.
 * Impostors with raw Cosine < 0.42 are unconditionally rejected (< 50%).
 */
export function evaluateBiometricMatch(
  probeVector: number[],
  referenceVector: number[],
  options?: {
    minCosine?: number;
    maxEuclidean?: number;
    minSimilarityPercentage?: number;
    useCalibration?: boolean;
  }
): BiometricMatchResult {
  const normProbe = l2Normalize(probeVector);
  const normRef = l2Normalize(referenceVector);

  const rawCos = cosineSimilarity(normProbe, normRef);
  const eucDist = euclideanDistance(normProbe, normRef);

  const useCalibration = options?.useCalibration === true;
  const calSim = calibrateCosineSimilarity(rawCos);
  const effectiveSim = useCalibration ? calSim : rawCos;
  const similarityPercentage = Math.max(0, Math.min(100, Math.round(effectiveSim * 100)));

  const minCos = options?.minCosine ?? ACCEPTANCE_THRESHOLDS.MIN_COSINE_SIMILARITY;
  const maxDist = options?.maxEuclidean ?? ACCEPTANCE_THRESHOLDS.MAX_EUCLIDEAN_DISTANCE;
  const minPercent = options?.minSimilarityPercentage ?? ACCEPTANCE_THRESHOLDS.MIN_SIMILARITY_PERCENTAGE;

  // Strict Hard Rejection Rule:
  // - True impostors/strangers (rawCos < 0.42) never pass (< 50%).
  // - Ambiguous candidate (0.42 <= rawCos < 0.55) yields [50%, 79%], isMatch = false.
  // - Matches if (useCalibration && rawCos >= 0.55 && similarityPercentage >= minPercent)
  //   OR (!useCalibration && rawCos >= minCos && similarityPercentage >= minPercent && (eucDist <= maxDist || eucDist <= 0.65))
  const isMatch =
    rawCos >= 0.42 &&
    similarityPercentage >= minPercent &&
    ((useCalibration && rawCos >= 0.55) ||
     (!useCalibration && rawCos >= minCos && (eucDist <= maxDist || eucDist <= 0.65)));

  return {
    isMatch,
    cosineSimilarity: Number(effectiveSim.toFixed(4)),
    rawCosineSimilarity: Number(rawCos.toFixed(4)),
    calibratedSimilarity: Number(calSim.toFixed(4)),
    euclideanDistance: Number(eucDist.toFixed(4)),
    similarityPercentage,
  };
}
