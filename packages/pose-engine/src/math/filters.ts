/**
 * packages/pose-engine/src/math/filters.ts
 *
 * VELOCITY-AWARE ONE EURO FILTER (1€ Filter)
 * Designed for real-time biomechanical tracking (CHI 2012 algorithm).
 * Dynamically adapts cutoff frequency based on rate of movement:
 * - Low speed (holding joint in target zone): high jitter and tremor suppression.
 * - High speed: minimal lag for crisp angle response.
 */

import { PoseEngineLandmark } from '../types/exerciseConfig';

export const DEFAULT_ONE_EURO_MIN_CUTOFF = 1.0;
export const DEFAULT_ONE_EURO_BETA = 0.04;
export const DEFAULT_ONE_EURO_D_CUTOFF = 1.0;

export class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = alpha * value + (1.0 - alpha) * this.s!;
    this.s = this.y;
    return this.y;
  }

  public last(): number | null {
    return this.y;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroScalarFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(
    minCutoff: number = DEFAULT_ONE_EURO_MIN_CUTOFF,
    beta: number = DEFAULT_ONE_EURO_BETA,
    dCutoff: number = DEFAULT_ONE_EURO_D_CUTOFF
  ) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private calculateAlpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  public filter(x: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilter.filter(x, 1.0);
    }

    const dt = (timestampMs - this.lastTime) / 1000.0;
    this.lastTime = timestampMs;

    // Guard against identical timestamps or system clock adjustments
    if (dt <= 0.0) {
      return this.xFilter.last() ?? x;
    }

    const rate = 1.0 / dt;
    const prevX = this.xFilter.last() ?? x;
    const dx = (x - prevX) * rate;

    const dAlpha = this.calculateAlpha(rate, this.dCutoff);
    const edx = this.dxFilter.filter(dx, dAlpha);

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const alpha = this.calculateAlpha(rate, cutoff);

    return this.xFilter.filter(x, alpha);
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class OneEuro3DFilter {
  private fx: OneEuroScalarFilter;
  private fy: OneEuroScalarFilter;
  private fz: OneEuroScalarFilter;

  constructor(
    minCutoff: number = DEFAULT_ONE_EURO_MIN_CUTOFF,
    beta: number = DEFAULT_ONE_EURO_BETA,
    dCutoff: number = DEFAULT_ONE_EURO_D_CUTOFF
  ) {
    this.fx = new OneEuroScalarFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroScalarFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroScalarFilter(minCutoff, beta, dCutoff);
  }

  public filter(point: { x: number; y: number; z?: number }, timestampMs: number) {
    const safeX = Number.isFinite(point.x) ? point.x : 0;
    const safeY = Number.isFinite(point.y) ? point.y : 0;
    const safeZ = point.z !== undefined && Number.isFinite(point.z) ? point.z : 0;
    return {
      x: this.fx.filter(safeX, timestampMs),
      y: this.fy.filter(safeY, timestampMs),
      z: point.z !== undefined ? this.fz.filter(safeZ, timestampMs) : 0,
    };
  }

  public reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

/**
 * Multi-joint pose landmark filter for 33 MediaPipe landmarks
 */
export class PoseSkeletonFilter {
  private landmarkFilters: Map<number, OneEuro3DFilter> = new Map();
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(
    minCutoff: number = DEFAULT_ONE_EURO_MIN_CUTOFF,
    beta: number = DEFAULT_ONE_EURO_BETA,
    dCutoff: number = DEFAULT_ONE_EURO_D_CUTOFF
  ) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public filterSkeleton(landmarks: PoseEngineLandmark[], timestampMs: number): PoseEngineLandmark[] {
    return landmarks.map((lm, idx) => {
      let filter = this.landmarkFilters.get(idx);
      if (!filter) {
        filter = new OneEuro3DFilter(this.minCutoff, this.beta, this.dCutoff);
        this.landmarkFilters.set(idx, filter);
      }
      const filteredXYZ = filter.filter(lm, timestampMs);
      return {
        ...lm,
        x: filteredXYZ.x,
        y: filteredXYZ.y,
        z: lm.z !== undefined ? filteredXYZ.z : undefined,
      };
    });
  }

  public reset(): void {
    this.landmarkFilters.clear();
  }

  public resetLandmarks(indices: number[]): void {
    for (const idx of indices) {
      this.landmarkFilters.delete(idx);
    }
  }
}
