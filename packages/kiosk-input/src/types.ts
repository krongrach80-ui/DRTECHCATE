/**
 * DrTech.Care Kiosk Input - Types & Configurations
 * Master Prompt v3 Section 10 (ระบบ 13: Kiosk Input)
 *
 * Invariants:
 * 1. Single-hand operation: Never require or force two hands.
 * 2. Tremor suppression: One Euro filter for noisy coordinates.
 * 3. Fallback: Always provide screen touch & staff call alternatives.
 * 4. Privacy: Zero image recording during screensaver/idle.
 */

export interface KioskInputConfig {
  // 1. Face Presence & Sitting Detection (Hysteresis)
  facePresenceMinDurationMs: number; // Duration face must remain stable before declaring presence (default: 1000ms)
  faceAbsenceHysteresisMs: number;   // Delay before declaring presence lost to prevent flicker (default: 2000ms)
  minFaceSizeRatio: number;          // Minimum bounding box area ratio relative to frame (default: 0.10)
  maxFaceMotionVariance: number;     // Maximum allowable center shift to be considered "still" (default: 0.05)
  captureImagesDuringIdle: boolean;  // Strict Privacy: MUST be false in screensaver/idle state (default: false)

  // 2. Single-Hand Gesture & Edge-Zone Hover
  handHoldDurationMs: number;        // Hold duration to trigger selection in edge zone (default: 1000ms)
  leftZoneRatio: number;             // X boundary for Left zone: x < leftZoneRatio (default: 0.25)
  rightZoneRatio: number;            // X boundary for Right zone: x > rightZoneRatio (default: 0.75)

  // 3. One Euro Filter Parameters (Jitter vs Lag tuning)
  oneEuroMinCutoff: number;          // Minimum cutoff frequency in Hz (default: 1.0)
  oneEuroBeta: number;               // Speed coefficient to eliminate lag at high speeds (default: 0.007)
  oneEuroDCutoff: number;            // Derivative cutoff frequency (default: 1.0)

  // 4. Hands-Free Head Nod Alternative
  nodAngleThresholdDeg: number;      // Downward pitch movement in degrees to detect nod (default: 12.0)
  nodHoldDurationMs: number;         // Minimum duration of nod gesture (default: 300ms)
}

export const DEFAULT_KIOSK_INPUT_CONFIG: KioskInputConfig = {
  facePresenceMinDurationMs: 1000,
  faceAbsenceHysteresisMs: 2000,
  minFaceSizeRatio: 0.10,
  maxFaceMotionVariance: 0.05,
  captureImagesDuringIdle: false,

  handHoldDurationMs: 1000,
  leftZoneRatio: 0.25,
  rightZoneRatio: 0.75,

  oneEuroMinCutoff: 1.0,
  oneEuroBeta: 0.007,
  oneEuroDCutoff: 1.0,

  nodAngleThresholdDeg: 12.0,
  nodHoldDurationMs: 300,
};

export interface Point2D {
  x: number; // Normalized coordinate [0.0, 1.0]
  y: number; // Normalized coordinate [0.0, 1.0]
}

export interface Point3D extends Point2D {
  z?: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HoverZone = 'left' | 'right' | 'none';

/**
 * Standard MediaPipe Hand Landmark Indices (21 landmarks)
 */
export const HAND_LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_FINGER_MCP: 5,
  INDEX_FINGER_PIP: 6,
  INDEX_FINGER_DIP: 7,
  INDEX_FINGER_TIP: 8,
  MIDDLE_FINGER_MCP: 9,
  MIDDLE_FINGER_PIP: 10,
  MIDDLE_FINGER_DIP: 11,
  MIDDLE_FINGER_TIP: 12,
  RING_FINGER_MCP: 13,
  RING_FINGER_PIP: 14,
  RING_FINGER_DIP: 15,
  RING_FINGER_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export type KioskInputEvent =
  | { type: 'PRESENCE_DETECTED'; timestamp: number }
  | { type: 'PRESENCE_LOST'; timestamp: number }
  | { type: 'ZONE_HOVER_START'; zone: 'left' | 'right'; timestamp: number; rawPoint: Point2D; filteredPoint: Point2D }
  | { type: 'ZONE_HOVER_PROGRESS'; zone: 'left' | 'right'; progress: number; elapsedMs: number }
  | { type: 'ZONE_HOVER_EXIT'; zone: 'left' | 'right'; timestamp: number }
  | { type: 'ZONE_SELECTED'; zone: 'left' | 'right'; timestamp: number }
  | { type: 'HEAD_NOD_CONFIRMED'; timestamp: number; pitchDeltaDeg: number }
  | { type: 'TOUCH_FALLBACK'; action: string; timestamp: number }
  | { type: 'CALL_STAFF_FALLBACK'; timestamp: number };

export type KioskInputEventListener = (event: KioskInputEvent) => void;
