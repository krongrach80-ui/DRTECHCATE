/**
 * One Euro Filter (1€ Filter) for Noise and Tremor Suppression
 * Based on: Géry Casiez, Nicolas Roussel, Daniel Vogel (CHI 2012)
 * "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Human-Computer Interfaces"
 *
 * Essential for physical therapy patients with resting tremors, stroke recovery,
 * or motor instability.
 */

import { Point2D } from './types.js';

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

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
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

    // Guard against identical timestamps or backwards clocks
    if (dt <= 0) {
      return this.xFilter.last() ?? x;
    }

    const rate = 1.0 / dt;

    // Filter the derivative (speed estimation)
    const prevX = this.xFilter.last() ?? x;
    const dx = (x - prevX) * rate;
    const edx = this.dxFilter.filter(dx, this.calculateAlpha(rate, this.dCutoff));

    // Dynamic cutoff frequency: fc = minCutoff + beta * |speed|
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter value with dynamic cutoff
    return this.xFilter.filter(x, this.calculateAlpha(rate, cutoff));
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

/**
 * 2D Point Filter combining two independent 1€ filters for X and Y coordinates
 */
export class OneEuroFilter2D {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;

  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  public filter(point: Point2D, timestampMs: number): Point2D {
    return {
      x: this.filterX.filter(point.x, timestampMs),
      y: this.filterY.filter(point.y, timestampMs),
    };
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}
