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
import { OneEuroScalarFilter, OneEuro3DFilter, PoseSkeletonFilter } from './filters';

export { OneEuroScalarFilter, OneEuro3DFilter, PoseSkeletonFilter };

export interface LandmarkFilterOptions {
  minCutoff?: number; // 1.2 Hz
  beta?: number;      // 0.04
  dCutoff?: number;   // 1.0 Hz
  minVisibilityMap?: Record<number, number>;
  defaultMinVisibility?: number; // 0.35
}

export class ClinicalOneEuroLandmarkFilter {
  private skeletonFilter: PoseSkeletonFilter;
  private minVisibilityMap: Record<number, number>;
  private defaultMinVisibility: number;

  constructor(options: LandmarkFilterOptions = {}) {
    const minCutoff = options.minCutoff ?? 1.2;
    const beta = options.beta ?? 0.04;
    this.skeletonFilter = new PoseSkeletonFilter(minCutoff, beta);
    this.minVisibilityMap = options.minVisibilityMap ?? {};
    this.defaultMinVisibility = options.defaultMinVisibility ?? 0.35;
  }

  public setVisibilityPolicy(minVisibilityMap: Record<number, number>, defaultMinVis: number = 0.35) {
    this.minVisibilityMap = { ...minVisibilityMap };
    this.defaultMinVisibility = defaultMinVis;
  }

  /**
   * Filters and sanitizes landmarks:
   * 1. Filters (x, y, z) through One Euro Filter.
   * 2. Checks coordinate bounds [0.01, 0.99].
   * 3. Validates against landmark-specific visibility threshold.
   */
  public filter(landmarks: PoseEngineLandmark[], timestampMs: number): PoseEngineLandmark[] {
    if (!landmarks || landmarks.length === 0) return [];

    const smoothed = this.skeletonFilter.filterSkeleton(landmarks, timestampMs);

    return smoothed.map((lm, idx) => {
      const minVis = this.minVisibilityMap[idx] ?? this.defaultMinVisibility;
      const vis = lm.visibility ?? 1.0;

      // Discard or zero-out confidence if outside sensor boundary [0.01, 0.99]
      const isOutOfBounds =
        lm.x < 0.01 || lm.x > 0.99 || lm.y < 0.01 || lm.y > 0.99;

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
  }
}
