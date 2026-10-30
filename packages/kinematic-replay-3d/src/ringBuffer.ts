/**
 * packages/kinematic-replay-3d/src/ringBuffer.ts
 *
 * LOCK-FREE KINEMATIC RING BUFFER (SaMD Class II & Zero-Video Telemetry)
 *
 * 1. Fixed-Capacity Circular Ring Buffer:
 *    - Capacity of 300 frames (approx. 10 seconds at 30 FPS)
 *    - Memory-efficient, zero reallocation, strictly O(1) push complexity
 * 2. Pure Vector Telemetry:
 *    - Stores only 33 coordinates (x, y, z, visibility) + kinematic angles
 *    - 100% HIPAA/GDPR Zero-Video compliant
 * 3. Instant Pain Snapshot Capture:
 *    - Serializes latest chronological frames into compact snapshot on pain event or session completion
 */

export interface KinematicLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface KinematicFrame {
  timestampMs: number;
  landmarks: KinematicLandmark[];
  currentAngleDeg?: number;
  angularVelocityDegPerSec?: number;
  trunkLateralTiltDeg?: number;
  scapularHikingRatio?: number;
  phase?: string;
  isPainEvent?: boolean;
  coachingMessageTh?: string;
}

export interface SnapshotMetadata {
  sessionId?: string;
  patientId?: string;
  exerciseName?: string;
}

export interface KinematicReplaySnapshot {
  sessionId: string;
  patientId: string;
  exerciseName: string;
  capturedAt: string;
  totalFrames: number;
  fps: number;
  frames: KinematicFrame[];
  hasPainEvent: boolean;
}

export class KinematicRingBuffer {
  private readonly capacity: number;
  private readonly buffer: Array<KinematicFrame | null>;
  private head: number = 0;
  private count: number = 0;

  constructor(capacity: number = 300) {
    if (capacity <= 0) {
      throw new Error('RingBuffer capacity must be greater than 0');
    }
    this.capacity = capacity;
    this.buffer = new Array<KinematicFrame | null>(capacity).fill(null);
  }

  /**
   * Pushes a new frame into the circular buffer in O(1) time
   */
  public push(frame: KinematicFrame): void {
    this.buffer[this.head] = frame;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Captures contiguous, chronologically ordered sequence of frames up to current head
   */
  public captureSnapshot(metadata: SnapshotMetadata = {}): KinematicReplaySnapshot {
    const frames: KinematicFrame[] = [];
    const startIndex = this.count < this.capacity ? 0 : this.head;

    for (let i = 0; i < this.count; i++) {
      const idx = (startIndex + i) % this.capacity;
      const frame = this.buffer[idx];
      if (frame) {
        frames.push(frame);
      }
    }

    const hasPainEvent = frames.some((f) => f.isPainEvent === true);

    // Compute empirical FPS from frame timestamps
    let calculatedFps = 30;
    if (frames.length >= 2) {
      const durationSec = (frames[frames.length - 1].timestampMs - frames[0].timestampMs) / 1000;
      if (durationSec > 0.05) {
        calculatedFps = Math.max(1, Math.round((frames.length - 1) / durationSec));
      }
    }

    return {
      sessionId: metadata.sessionId || `sess-${Date.now()}`,
      patientId: metadata.patientId || 'patient-unknown',
      exerciseName: metadata.exerciseName || 'Physical Therapy Session',
      capturedAt: new Date().toISOString(),
      totalFrames: frames.length,
      fps: calculatedFps,
      frames,
      hasPainEvent,
    };
  }

  /**
   * Returns current number of buffered frames
   */
  public size(): number {
    return this.count;
  }

  /**
   * Returns the maximum capacity of the ring buffer
   */
  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Returns latest pushed frame, or null if buffer is empty
   */
  public getLatestFrame(): KinematicFrame | null {
    if (this.count === 0) return null;
    const latestIdx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[latestIdx];
  }

  /**
   * Resets the buffer to empty state
   */
  public clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }
}

/**
 * Creates a physiological 3D kinematic snapshot for testing or demonstration of 360° replay
 */
export function createClinicalReplaySnapshot(
  metadata: { patientId?: string; exerciseName?: string; totalFrames?: number } = {}
): KinematicReplaySnapshot {
  const count = metadata.totalFrames ?? 90;
  const frames: KinematicFrame[] = [];
  const baseTime = Date.now() - count * 33;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    // Harmonic shoulder abduction motion: 25° -> 95° -> 25°
    const angle = 25 + Math.sin(t * Math.PI) * 70;
    const isJerkSpike = i >= 42 && i <= 46;
    const angularVelocity = isJerkSpike ? 240 : 35 + Math.cos(t * Math.PI) * 15;
    const trunkTilt = isJerkSpike ? 16 : 2 + Math.sin(t * Math.PI * 2) * 2;

    const landmarks: KinematicLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.95,
    }));

    // Spine & Pelvis
    landmarks[11] = { x: 0.42, y: 0.28, z: 0.02, visibility: 0.95 }; // L Shoulder
    landmarks[12] = { x: 0.58, y: 0.28, z: -0.02, visibility: 0.95 }; // R Shoulder
    landmarks[23] = { x: 0.45, y: 0.65, z: 0.01, visibility: 0.95 }; // L Hip
    landmarks[24] = { x: 0.55, y: 0.65, z: -0.01, visibility: 0.95 }; // R Hip
    landmarks[25] = { x: 0.45, y: 0.85, z: 0.0, visibility: 0.95 }; // L Knee
    landmarks[26] = { x: 0.55, y: 0.85, z: 0.0, visibility: 0.95 }; // R Knee
    landmarks[27] = { x: 0.45, y: 1.0, z: 0.0, visibility: 0.95 }; // L Ankle
    landmarks[28] = { x: 0.55, y: 1.0, z: 0.0, visibility: 0.95 }; // R Ankle

    // Right arm movement according to angle
    const armRad = (angle * Math.PI) / 180;
    const elbowX = 0.58 + Math.sin(armRad) * 0.18;
    const elbowY = 0.28 + Math.cos(armRad) * 0.18;
    const wristX = elbowX + Math.sin(armRad) * 0.18;
    const wristY = elbowY + Math.cos(armRad) * 0.18;

    landmarks[13] = { x: 0.38, y: 0.44, z: 0.05, visibility: 0.95 }; // L Elbow (resting)
    landmarks[15] = { x: 0.37, y: 0.60, z: 0.05, visibility: 0.95 }; // L Wrist
    landmarks[14] = { x: elbowX, y: elbowY, z: -0.05, visibility: 0.95 }; // R Elbow
    landmarks[16] = { x: wristX, y: wristY, z: -0.08, visibility: 0.95 }; // R Wrist

    frames.push({
      timestampMs: baseTime + i * 33,
      landmarks,
      currentAngleDeg: Math.round(angle * 10) / 10,
      angularVelocityDegPerSec: Math.round(angularVelocity),
      trunkLateralTiltDeg: Math.round(trunkTilt * 10) / 10,
      phase: i < 45 ? 'MOVING_TO_TARGET' : 'RETURNING_TO_START',
      isPainEvent: i === 44,
      coachingMessageTh: isJerkSpike ? 'ตรวจพบแรงกระชากไหล่ขวา' : 'รักษาระดับการเคลื่อนไหวดี',
    });
  }

  return {
    sessionId: `sess-${Date.now()}`,
    patientId: metadata.patientId || 'patient-demo-01',
    exerciseName: metadata.exerciseName || 'Shoulder Abduction (กางข้อไหล่)',
    capturedAt: new Date().toISOString(),
    totalFrames: frames.length,
    fps: 30,
    frames,
    hasPainEvent: true,
  };
}
