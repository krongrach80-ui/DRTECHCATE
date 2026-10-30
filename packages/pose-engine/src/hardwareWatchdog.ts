/**
 * packages/pose-engine/src/hardwareWatchdog.ts
 *
 * CAMERA HARDWARE WATCHDOG & AUTO-RECOVERY ENGINE
 * SaMD Class II & 24/7 Kiosk Stability Standards:
 *
 * 1. Frozen Frame Detector:
 *    - Detects camera sensor lockups / frozen video frames by verifying whether key landmarks (0, 11, 12)
 *      remain exactly identical (Δ = 0) for >= 60-90 consecutive frames.
 *
 * 2. Adaptive FPS Throttling:
 *    - Computes high-precision Rolling FPS across frame deltas.
 *    - Automatically toggles `lowPerformanceMode: true` when FPS < 15 to drop canvas particle effects
 *      and safeguard real-time biomechanics kinematics from input lag.
 *
 * 3. Auto-Reconnect Recovery:
 *    - Gracefully handles USB camera disconnects / dead streams via exponential backoff (up to 3 retries).
 */

import { PoseEngineLandmark } from './types/exerciseConfig';

export interface WatchdogConfig {
  maxFrozenFrames?: number; // default: 60 frames
  minFpsThreshold?: number; // default: 15.0 FPS
  rollingWindowSize?: number; // default: 30 frames
  maxReconnectAttempts?: number; // default: 3
  baseReconnectDelayMs?: number; // default: 1000 ms
  keypointsToCheck?: number[]; // default: [0, 11, 12] (Nose, Left Shoulder, Right Shoulder)
}

export interface WatchdogHealthStatus {
  isHealthy: boolean;
  isFrozen: boolean;
  consecutiveFrozenFrames: number;
  rollingFps: number;
  lowPerformanceMode: boolean;
  reconnectAttempts: number;
  isReconnecting: boolean;
  needsReconnect: boolean;
  statusMessageTh: string;
}

export type MediaStreamReconnectFactory = () => Promise<MediaStream | null>;

export class CameraStreamWatchdog {
  private maxFrozenFrames: number;
  private minFpsThreshold: number;
  private rollingWindowSize: number;
  private maxReconnectAttempts: number;
  private baseReconnectDelayMs: number;
  private keypointsToCheck: number[];

  private lastCheckedPoints: Array<{ x: number; y: number }> | null = null;
  private consecutiveFrozenFrames: number = 0;
  private isFrozen: boolean = false;

  private frameTimestamps: number[] = [];
  private rollingFps: number = 30.0;
  private lowPerformanceMode: boolean = false;

  private reconnectAttempts: number = 0;
  private isReconnecting: boolean = false;

  constructor(config: WatchdogConfig = {}) {
    this.maxFrozenFrames = config.maxFrozenFrames ?? 60;
    this.minFpsThreshold = config.minFpsThreshold ?? 15.0;
    this.rollingWindowSize = config.rollingWindowSize ?? 30;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 3;
    this.baseReconnectDelayMs = config.baseReconnectDelayMs ?? 1000;
    this.keypointsToCheck = config.keypointsToCheck ?? [0, 11, 12];
  }

  /**
   * Updates watchdog metrics with each camera frame
   */
  public update(
    landmarks: PoseEngineLandmark[],
    timestampMs: number = Date.now()
  ): WatchdogHealthStatus {
    // 1. Calculate Rolling FPS
    this.frameTimestamps.push(timestampMs);
    if (this.frameTimestamps.length > this.rollingWindowSize) {
      this.frameTimestamps.shift();
    }

    if (this.frameTimestamps.length >= 2) {
      const first = this.frameTimestamps[0];
      const last = this.frameTimestamps[this.frameTimestamps.length - 1];
      const durationSec = (last - first) / 1000.0;
      if (durationSec > 0.05) {
        this.rollingFps = Math.round(((this.frameTimestamps.length - 1) / durationSec) * 10) / 10;
      }
    }

    // Toggle lowPerformanceMode
    if (this.rollingFps < this.minFpsThreshold) {
      this.lowPerformanceMode = true;
    } else if (this.rollingFps >= 22.0) {
      this.lowPerformanceMode = false;
    }

    // 2. Frozen Frame Detection
    const currentPoints: Array<{ x: number; y: number }> = [];
    for (const idx of this.keypointsToCheck) {
      if (landmarks.length > idx && landmarks[idx]) {
        currentPoints.push({ x: landmarks[idx].x, y: landmarks[idx].y });
      }
    }

    if (this.lastCheckedPoints && currentPoints.length === this.lastCheckedPoints.length && currentPoints.length > 0) {
      let totalDelta = 0;
      for (let i = 0; i < currentPoints.length; i++) {
        totalDelta +=
          Math.abs(currentPoints[i].x - this.lastCheckedPoints[i].x) +
          Math.abs(currentPoints[i].y - this.lastCheckedPoints[i].y);
      }

      if (totalDelta < 1e-7) {
        this.consecutiveFrozenFrames++;
      } else {
        this.consecutiveFrozenFrames = 0;
      }
    } else {
      this.consecutiveFrozenFrames = 0;
    }

    this.lastCheckedPoints = currentPoints;
    this.isFrozen = this.consecutiveFrozenFrames >= this.maxFrozenFrames;

    const needsReconnect = this.isFrozen && this.reconnectAttempts < this.maxReconnectAttempts;
    const isHealthy = !this.isFrozen && !this.isReconnecting;

    let statusMessageTh = 'กล้องทำงานปกติ';
    if (this.isFrozen) {
      statusMessageTh =
        this.reconnectAttempts >= this.maxReconnectAttempts
          ? '⚠️ สัญญาณกล้องค้าง กรุณาตรวจสอบสายเชื่อมต่อ USB'
          : '⚠️ สัญญาณกล้องไม่เคลื่อนไหว กำลังเชื่อมต่อใหม่...';
    } else if (this.lowPerformanceMode) {
      statusMessageTh = 'เปิดโหมดประหยัดพลังงาน (FPS ต่ำ)';
    }

    return {
      isHealthy,
      isFrozen: this.isFrozen,
      consecutiveFrozenFrames: this.consecutiveFrozenFrames,
      rollingFps: this.rollingFps,
      lowPerformanceMode: this.lowPerformanceMode,
      reconnectAttempts: this.reconnectAttempts,
      isReconnecting: this.isReconnecting,
      needsReconnect,
      statusMessageTh,
    };
  }

  /**
   * Executes automatic camera reconnection with exponential backoff
   */
  public async attemptReconnect(
    reconnectFactory: MediaStreamReconnectFactory
  ): Promise<{ success: boolean; stream: MediaStream | null; error?: string }> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return {
        success: false,
        stream: null,
        error: `Exceeded maximum reconnect attempts (${this.maxReconnectAttempts})`,
      };
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // Exponential backoff delay: 1s, 2s, 4s...
    const backoffMs = this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    try {
      const newStream = await reconnectFactory();
      if (newStream && newStream.active) {
        this.isFrozen = false;
        this.consecutiveFrozenFrames = 0;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        return { success: true, stream: newStream };
      }
      this.isReconnecting = false;
      return { success: false, stream: null, error: 'Reconnected stream was inactive' };
    } catch (err: unknown) {
      this.isReconnecting = false;
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, stream: null, error: errorMessage };
    }
  }

  /**
   * Resets watchdog state
   */
  public reset(): void {
    this.lastCheckedPoints = null;
    this.consecutiveFrozenFrames = 0;
    this.isFrozen = false;
    this.frameTimestamps = [];
    this.rollingFps = 30.0;
    this.lowPerformanceMode = false;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
  }
}
