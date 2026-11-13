/**
 * packages/pose-engine/src/math/oneEuroFilter.ts
 *
 * CLINICAL-GRADE ONE EURO FILTER (1€ Filter - CHI 2012)
 * Adaptive dual-cutoff low-pass filtering for real-time biomechanical tracking:
 * - At low speed: High tremor and jitter suppression (fc = minCutoff = 1.2 Hz)
 * - At high speed: Low phase lag for instant angle tracking (fc = minCutoff + beta * |dx|)
 *
 * Includes coordinate bounds sanitizer ([0.01, 0.99]) and per-landmark visibility gating.
 */

import { PoseEngineLandmark } from '../types/exerciseConfig';
import {
  DEFAULT_ONE_EURO_BETA,
  DEFAULT_ONE_EURO_D_CUTOFF,
  DEFAULT_ONE_EURO_MIN_CUTOFF,
  OneEuroScalarFilter,
  OneEuro3DFilter,
  PoseSkeletonFilter,
} from './filters';

export {
  DEFAULT_ONE_EURO_BETA,
  DEFAULT_ONE_EURO_D_CUTOFF,
  DEFAULT_ONE_EURO_MIN_CUTOFF,
  OneEuroScalarFilter,
  OneEuro3DFilter,
  PoseSkeletonFilter,
};

export const ONE_EURO_MISSING_RESET_MS = 500;
export const DEFAULT_LANDMARK_MIN_VISIBILITY = 0.35;

export interface LandmarkFilterOptions {
  minCutoff?: number;
  beta?: number;
  dCutoff?: number;
  minVisibilityMap?: Record<number, number>;
  defaultMinVisibility?: number;
  coordinateSpace?: 'normalized' | 'world';
}

export class ClinicalOneEuroLandmarkFilter {
  private skeletonFilter: PoseSkeletonFilter;
  private minVisibilityMap: Record<number, number>;
  private defaultMinVisibility: number;
  private coordinateSpace: 'normalized' | 'world';
  private lastFilterTimestampMs: number | null = null;

  constructor(options: LandmarkFilterOptions = {}) {
    const minCutoff = options.minCutoff ?? DEFAULT_ONE_EURO_MIN_CUTOFF;
    const beta = options.beta ?? DEFAULT_ONE_EURO_BETA;
    const dCutoff = options.dCutoff ?? DEFAULT_ONE_EURO_D_CUTOFF;
    this.skeletonFilter = new PoseSkeletonFilter(minCutoff, beta, dCutoff);
    this.minVisibilityMap = options.minVisibilityMap ?? {};
    this.defaultMinVisibility = options.defaultMinVisibility ?? DEFAULT_LANDMARK_MIN_VISIBILITY;
    this.coordinateSpace = options.coordinateSpace ?? 'normalized';
  }

  public setVisibilityPolicy(
    minVisibilityMap: Record<number, number>,
    defaultMinVis: number = DEFAULT_LANDMARK_MIN_VISIBILITY
  ) {
    this.minVisibilityMap = { ...minVisibilityMap };
    this.defaultMinVisibility = defaultMinVis;
  }

  /**
   * Filters and sanitizes landmarks:
   * 1. Resets stale filter state if subject disappeared longer than ONE_EURO_MISSING_RESET_MS.
   * 2. Filters (x, y, z) through One Euro Filter.
   * 3. For normalized screen coordinates, checks [0.01, 0.99] bounds and per-landmark visibility.
   *    For world landmarks (meters relative to mid-hip), skips [0.01, 0.99] clipping so negative/large coordinates stay intact.
   */
  public filter(landmarks: PoseEngineLandmark[], timestampMs: number): PoseEngineLandmark[] {
    if (!landmarks || landmarks.length === 0) {
      this.reset();
      return [];
    }

    if (
      this.lastFilterTimestampMs !== null &&
      timestampMs - this.lastFilterTimestampMs > ONE_EURO_MISSING_RESET_MS
    ) {
      this.skeletonFilter.reset();
    }
    this.lastFilterTimestampMs = timestampMs;

    const smoothed = this.skeletonFilter.filterSkeleton(landmarks, timestampMs);

    return smoothed.map((lm, idx) => {
      const minVis = this.minVisibilityMap[idx] ?? this.defaultMinVisibility;
      const vis = lm.visibility ?? 1.0;

      const isOutOfBounds =
        this.coordinateSpace === 'normalized' &&
        (lm.x < 0.01 || lm.x > 0.99 || lm.y < 0.01 || lm.y > 0.99);

      if (isOutOfBounds || vis < minVis) {
        return {
          ...lm,
          visibility: Math.min(vis, 0.1), // Flag as degraded/unusable
          presence: 0.1,
        };
      }

      return lm;
    });
  }

  public reset(): void {
    this.skeletonFilter.reset();
    this.lastFilterTimestampMs = null;
  }

  public resetLandmarks(indices: number[]): void {
    this.skeletonFilter.resetLandmarks(indices);
  }
}

