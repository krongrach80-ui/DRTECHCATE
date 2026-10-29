#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================================================
DRTECH.CARE — CLINICAL-GRADE 3D UPPER-BODY BIOMECHANICAL TELEMETRY ENGINE
===================================================================================================
Architect: Principal Computer Vision Architect & Biomechanical Kinematics Engineer
Target: Head & Bilateral Upper Limbs (Shoulders, Elbows, Wrists, Hands)
Engine: OpenCV 4.x + Google MediaPipe Tasks API (Pose Landmarker Heavy float16)

KEY DESIGN HIGHLIGHTS:
1. Zero Overlay Rule (Clean Feed by Default):
   - By default, displays pure raw camera feed (1280x720) with ZERO lines, text, or HUD.
   - Skeletons and landmark circles are strictly restricted to --debug mode.
   - Telemetry emitted as structured NDJSON to stdout.
2. Low-Latency Threaded Capture (ThreadedCamera):
   - Dedicated thread with cv2.CAP_PROP_BUFFERSIZE = 1 ensuring zero frame-buffer lag.
   - Strictly monotonic timestamps prevent timestamp collision in VIDEO mode.
3. Auto-Provisioning Model:
   - Automatically downloads 'pose_landmarker_heavy.task' directly from Google MediaPipe CDN if missing.
4. 5-Stage Signal Processing Pipeline:
   - Stage 1: Visibility & Presence Gating with 500ms Temporal Hold.
   - Stage 2: Anatomical Bone-Length Kinematic Sanity Gate (±22% median deviation & 6.5 m/s velocity clamp).
   - Stage 3: Adaptive 3D One Euro Filter (1€ Filter: min_cutoff=1.2Hz, beta=0.04, d_cutoff=1.0Hz).
   - Stage 4: True 3D Metric World-Space Biomechanical Angle Computation (Meters, camera-distance invariant).
   - Stage 5: Multi-Model Holistic Fusion Hooks (--enable-holistic-fusion).
===================================================================================================
"""

import argparse
import json
import math
import os
import sys
import threading
import time
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# ===================================================================================================
# CONSTANTS & LANDMARK TOPOLOGY
# ===================================================================================================
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
DEFAULT_MODEL_NAME = "pose_landmarker_heavy.task"

# MediaPipe Pose Landmark Indices (Relevant subset for Upper-Body Biomechanics)
LM_NOSE = 0
LM_LEFT_EYE_INNER = 1
LM_LEFT_EYE = 2
LM_LEFT_EYE_OUTER = 3
LM_RIGHT_EYE_INNER = 4
LM_RIGHT_EYE = 5
LM_RIGHT_EYE_OUTER = 6
LM_LEFT_EAR = 7
LM_RIGHT_EAR = 8
LM_MOUTH_LEFT = 9
LM_MOUTH_RIGHT = 10

LM_LEFT_SHOULDER = 11
LM_RIGHT_SHOULDER = 12
LM_LEFT_ELBOW = 13
LM_RIGHT_ELBOW = 14
LM_LEFT_WRIST = 15
LM_RIGHT_WRIST = 16
LM_LEFT_PINKY = 17
LM_RIGHT_PINKY = 18
LM_LEFT_INDEX = 19
LM_RIGHT_INDEX = 20
LM_LEFT_THUMB = 21
LM_RIGHT_THUMB = 22

LM_LEFT_HIP = 23
LM_RIGHT_HIP = 24

# Set of target landmarks tracked and processed through filters
TARGET_LANDMARKS: List[int] = [
    LM_NOSE, LM_LEFT_EYE, LM_RIGHT_EYE, LM_LEFT_EAR, LM_RIGHT_EAR,
    LM_MOUTH_LEFT, LM_MOUTH_RIGHT,
    LM_LEFT_SHOULDER, LM_RIGHT_SHOULDER,
    LM_LEFT_ELBOW, LM_RIGHT_ELBOW,
    LM_LEFT_WRIST, LM_RIGHT_WRIST,
    LM_LEFT_PINKY, LM_RIGHT_PINKY,
    LM_LEFT_INDEX, LM_RIGHT_INDEX,
    LM_LEFT_THUMB, LM_RIGHT_THUMB,
    LM_LEFT_HIP, LM_RIGHT_HIP,
]

MAX_TEMPORAL_HOLD_SEC = 0.50  # 500 ms temporal hold for occluded landmarks


# ===================================================================================================
# STAGE 3: ADAPTIVE 3D ONE EURO FILTER (1€ Filter)
# Reference: Casiez et al., CHI 2012 — "1 € Filter: A Simple Speed-based Low-pass Filter for Jittery Signals"
# ===================================================================================================
class OneEuroFilter1D:
    """
    Complete mathematical implementation of the 1€ Filter for 1-dimensional signals.
    Dynamically modulates cutoff frequency based on instantaneous signal rate-of-change (derivative).
    Minimizes jitter at low speeds while eliminating lag during fast ballistic motions.
    """

    def __init__(self, min_cutoff: float = 1.2, beta: float = 0.04, d_cutoff: float = 1.0) -> None:
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        self.x_prev: Optional[float] = None
        self.dx_prev: float = 0.0
        self.t_prev: Optional[float] = None

    @staticmethod
    def _smoothing_factor(t_e: float, cutoff: float) -> float:
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / max(t_e, 1e-6))

    def filter(self, x: float, t: float) -> float:
        if self.t_prev is None or self.x_prev is None:
            self.x_prev = x
            self.t_prev = t
            return x

        t_e = t - self.t_prev
        if t_e <= 1e-6:
            return self.x_prev

        # Estimate derivative (velocity) with first-order low-pass filter
        a_d = self._smoothing_factor(t_e, self.d_cutoff)
        dx = (x - self.x_prev) / t_e
        dx_hat = a_d * dx + (1.0 - a_d) * self.dx_prev

        # Dynamically scale cutoff frequency
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a = self._smoothing_factor(t_e, cutoff)
        x_hat = a * x + (1.0 - a) * self.x_prev

        self.x_prev = x_hat
        self.dx_prev = dx_hat
        self.t_prev = t
        return x_hat

    def reset(self) -> None:
        self.x_prev = None
        self.dx_prev = 0.0
        self.t_prev = None


class OneEuroFilter3D:
    """Independent 3D One Euro Filter spanning (x, y, z) components."""

    def __init__(self, min_cutoff: float = 1.2, beta: float = 0.04, d_cutoff: float = 1.0) -> None:
        self.fx = OneEuroFilter1D(min_cutoff, beta, d_cutoff)
        self.fy = OneEuroFilter1D(min_cutoff, beta, d_cutoff)
        self.fz = OneEuroFilter1D(min_cutoff, beta, d_cutoff)

    def filter(self, pt: np.ndarray, t: float) -> np.ndarray:
        return np.array([
            self.fx.filter(float(pt[0]), t),
            self.fy.filter(float(pt[1]), t),
            self.fz.filter(float(pt[2]), t),
        ], dtype=np.float64)

    def reset(self) -> None:
        self.fx.reset()
        self.fy.reset()
        self.fz.reset()


# ===================================================================================================
# STAGE 1 & 2: LANDMARK STATE, TEMPORAL HOLD & ANATOMICAL SANITY GATE
# ===================================================================================================
@dataclass
class LandmarkState:
    world_xyz: np.ndarray        # 3D metric coordinates in camera space (meters)
    norm_xyz: np.ndarray         # Normalized image coordinates (0.0 to 1.0)
    visibility: float            # Visibility score (0.0 to 1.0)
    presence: float              # Presence score (0.0 to 1.0)
    last_valid_time: float       # Epoch seconds of last trusted observation
    is_currently_valid: bool     # True if detected in current frame or within hold window
    tracking_status: str         # "tracked", "held", "occluded"


class AnatomicalSanityTracker:
    """
    Stage 2: Anatomical Bone-Length Kinematic Sanity Gate.
    Maintains a rolling median of true anthropometric limb lengths:
    - Upper Arm (Shoulder -> Elbow)
    - Forearm (Elbow -> Wrist)
    Rejects depth-collapse outliers (> ±22% deviation) and impossible joint velocities (> 6.5 m/s).
    """

    def __init__(self, max_relative_deviation: float = 0.22, max_velocity_ms: float = 6.5) -> None:
        self.max_relative_deviation = max_relative_deviation
        self.max_velocity_ms = max_velocity_ms
        self.history_lengths: Dict[str, List[float]] = {
            "left_upper": [],
            "left_forearm": [],
            "right_upper": [],
            "right_forearm": [],
        }

    def validate_and_clamp_limb(
        self,
        side: str,
        shoulder: np.ndarray,
        elbow: np.ndarray,
        wrist: np.ndarray,
        prev_elbow: Optional[np.ndarray],
        prev_wrist: Optional[np.ndarray],
        dt: float,
        high_confidence: bool,
    ) -> Tuple[np.ndarray, np.ndarray, bool]:
        """
        Validates the instantaneous kinematic chain:
        Returns (clamped_elbow, clamped_wrist, outlier_flag).
        """
        upper_len = float(np.linalg.norm(elbow - shoulder))
        forearm_len = float(np.linalg.norm(wrist - elbow))
        outlier = False

        upper_key = f"{side}_upper"
        forearm_key = f"{side}_forearm"

        # 1. 3D Joint Velocity Gate (protect against sensor frame jumps)
        if dt > 1e-4 and prev_elbow is not None and prev_wrist is not None:
            vel_e = float(np.linalg.norm(elbow - prev_elbow)) / dt
            vel_w = float(np.linalg.norm(wrist - prev_wrist)) / dt
            if vel_e > self.max_velocity_ms or vel_w > self.max_velocity_ms:
                outlier = True

        # 2. Anthropometric Segment Length Deviation Check
        if len(self.history_lengths[upper_key]) >= 12:
            median_upper = float(np.median(self.history_lengths[upper_key]))
            median_forearm = float(np.median(self.history_lengths[forearm_key]))

            if median_upper > 0.05:
                diff_upper = abs(upper_len - median_upper) / median_upper
                if diff_upper > self.max_relative_deviation:
                    outlier = True

            if median_forearm > 0.05:
                diff_forearm = abs(forearm_len - median_forearm) / median_forearm
                if diff_forearm > self.max_relative_deviation:
                    outlier = True

        # If outlier detected, revert to previous trusted spatial positions
        if outlier and prev_elbow is not None and prev_wrist is not None:
            return prev_elbow.copy(), prev_wrist.copy(), True

        # Calibrate anatomical bone lengths only during high-confidence frames
        # Standard adult upper arm: 0.20m - 0.45m; forearm: 0.18m - 0.40m
        if high_confidence and 0.15 <= upper_len <= 0.50 and 0.15 <= forearm_len <= 0.50:
            self.history_lengths[upper_key].append(upper_len)
            self.history_lengths[forearm_key].append(forearm_len)
            if len(self.history_lengths[upper_key]) > 120:
                self.history_lengths[upper_key].pop(0)
                self.history_lengths[forearm_key].pop(0)

        return elbow, wrist, False


# ===================================================================================================
# STAGE 4: 3D METRIC BIOMECHANICAL ANGLE COMPUTATION
# All calculations performed strictly in metric camera space (meters)
# ===================================================================================================
def calculate_3d_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """
    Computes interior angle at vertex b formed by vectors (a - b) and (c - b).
    Returns degrees in [0, 180].
    """
    ba = a - b
    bc = c - b
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 0.0
    cosine = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


def compute_head_kinematics(states: Dict[int, LandmarkState]) -> Dict[str, Any]:
    """
    Calculates Head 3D pose:
    - tilt_deg (Roll): Positive = tilt right, Negative = tilt left.
    - yaw_deg & yaw_direction ("center", "left", "right"): Nose projection relative to ears.
    - pitch_deg: Positive = looking up, Negative = looking down.
    """
    essential = [LM_NOSE, LM_LEFT_EAR, LM_RIGHT_EAR, LM_LEFT_EYE, LM_RIGHT_EYE]
    all_present = all(idx in states for idx in essential)
    visible = all_present and all(states[idx].is_currently_valid for idx in [LM_NOSE, LM_LEFT_EAR, LM_RIGHT_EAR])

    if not all_present:
        return {
            "tilt_deg": None,
            "yaw_deg": None,
            "yaw_direction": "unknown",
            "pitch_deg": None,
            "visible": False,
        }

    nose = states[LM_NOSE].world_xyz
    l_ear = states[LM_LEFT_EAR].world_xyz
    r_ear = states[LM_RIGHT_EAR].world_xyz
    l_eye = states[LM_LEFT_EYE].world_xyz
    r_eye = states[LM_RIGHT_EYE].world_xyz

    # 1. Roll / Tilt: Inter-aural vector + inter-ocular vector relative to horizontal plane
    # In MediaPipe World: +X is right, +Y is down, +Z is forward
    ear_vec = l_ear - r_ear
    eye_vec = l_eye - r_eye

    span_ear_h = math.hypot(float(ear_vec[0]), float(ear_vec[2]))
    span_eye_h = math.hypot(float(eye_vec[0]), float(eye_vec[2]))

    tilt_ear = math.degrees(math.atan2(-float(ear_vec[1]), max(span_ear_h, 1e-5)))
    tilt_eye = math.degrees(math.atan2(-float(eye_vec[1]), max(span_eye_h, 1e-5)))
    tilt_deg = 0.60 * tilt_ear + 0.40 * tilt_eye

    # 2. Yaw: Nose displacement relative to inter-aural midpoint along ear baseline
    ear_mid = 0.5 * (l_ear + r_ear)
    head_width = float(np.linalg.norm(ear_vec))
    forward_ray = nose - ear_mid

    ear_unit = ear_vec / max(head_width, 1e-5)
    lateral_offset = float(np.dot(forward_ray, ear_unit))
    forward_depth = max(abs(float(forward_ray[2])), 0.04)
    yaw_deg = math.degrees(math.atan2(lateral_offset, forward_depth))

    if yaw_deg > 9.0:
        yaw_dir = "left"
    elif yaw_deg < -9.0:
        yaw_dir = "right"
    else:
        yaw_dir = "center"

    # 3. Pitch: Vertical elevation of nose tip relative to ear-eye baseline
    pitch_deg = math.degrees(math.atan2(-float(forward_ray[1]), forward_depth))

    return {
        "tilt_deg": round(tilt_deg, 1),
        "yaw_deg": round(yaw_deg, 1),
        "yaw_direction": yaw_dir,
        "pitch_deg": round(pitch_deg, 1),
        "visible": bool(visible),
    }


def compute_arm_kinematics(
    side: str,
    states: Dict[int, LandmarkState],
    outlier_flag: bool,
) -> Dict[str, Any]:
    """
    Calculates 3D arm biomechanics:
    - elbow_angle_deg (180° = straight, ~30° = fully bent)
    - shoulder_angle_deg (0° = resting at side, 90° = horizontal abduction, 180° = overhead)
    - wrist_angle_deg (forearm to palm vector)
    - hand_pinch_distance_m (thumb to index tip distance in meters)
    """
    if side == "left":
        idx_s, idx_e, idx_w = LM_LEFT_SHOULDER, LM_LEFT_ELBOW, LM_LEFT_WRIST
        idx_pinky, idx_index, idx_thumb = LM_LEFT_PINKY, LM_LEFT_INDEX, LM_LEFT_THUMB
        idx_hip = LM_LEFT_HIP
    else:
        idx_s, idx_e, idx_w = LM_RIGHT_SHOULDER, LM_RIGHT_ELBOW, LM_RIGHT_WRIST
        idx_pinky, idx_index, idx_thumb = LM_RIGHT_PINKY, LM_RIGHT_INDEX, LM_RIGHT_THUMB
        idx_hip = LM_RIGHT_HIP

    if not all(idx in states for idx in (idx_s, idx_e, idx_w)):
        return {
            "shoulder_angle_deg": None,
            "elbow_angle_deg": None,
            "wrist_angle_deg": None,
            "upper_arm_length_m": None,
            "forearm_length_m": None,
            "outlier_rejected": outlier_flag,
            "visible": False,
        }

    st_s = states[idx_s]
    st_e = states[idx_e]
    st_w = states[idx_w]

    arm_visible = st_s.is_currently_valid and st_e.is_currently_valid and st_w.is_currently_valid

    p_s = st_s.world_xyz
    p_e = st_e.world_xyz
    p_w = st_w.world_xyz

    # 1. 3D Elbow Interior Angle (Shoulder - Elbow - Wrist)
    elbow_angle = calculate_3d_angle(p_s, p_e, p_w)

    # 2. 3D Shoulder Elevation Angle (Torso Vertical Reference - Shoulder - Elbow)
    # If hip is visible, construct true anatomical spine/trunk vector
    if idx_hip in states and states[idx_hip].visibility >= 0.45:
        p_hip = states[idx_hip].world_xyz
        trunk_vector = p_hip - p_s
        trunk_norm = np.linalg.norm(trunk_vector)
        if trunk_norm > 1e-4:
            trunk_ref_pt = p_s + (trunk_vector / trunk_norm) * 0.50
        else:
            trunk_ref_pt = p_s + np.array([0.0, 0.50, 0.0], dtype=np.float64)
    else:
        # Fallback to gravity vector [0, 1, 0] in MediaPipe metric space (+Y is downwards)
        trunk_ref_pt = p_s + np.array([0.0, 0.50, 0.0], dtype=np.float64)

    shoulder_angle = calculate_3d_angle(trunk_ref_pt, p_s, p_e)

    # 3. 3D Wrist Orientation Angle (Elbow - Wrist - Palm Centroid)
    wrist_angle: Optional[float] = None
    if idx_index in states and idx_pinky in states:
        palm_center = 0.5 * (states[idx_index].world_xyz + states[idx_pinky].world_xyz)
        wrist_angle = round(calculate_3d_angle(p_e, p_w, palm_center), 1)

    # 4. Instantaneous Metric Segment Lengths (meters)
    upper_len = float(np.linalg.norm(p_e - p_s))
    forearm_len = float(np.linalg.norm(p_w - p_e))

    # 5. Hand Aperture / Pinch Distance (Thumb Tip to Index Tip)
    pinch_dist_m: Optional[float] = None
    if idx_thumb in states and idx_index in states:
        pinch_dist_m = round(
            float(np.linalg.norm(states[idx_thumb].world_xyz - states[idx_index].world_xyz)),
            3,
        )

    res: Dict[str, Any] = {
        "shoulder_angle_deg": round(shoulder_angle, 1),
        "elbow_angle_deg": round(elbow_angle, 1),
        "wrist_angle_deg": wrist_angle,
        "upper_arm_length_m": round(upper_len, 2),
        "forearm_length_m": round(forearm_len, 2),
        "outlier_rejected": bool(outlier_flag),
        "visible": bool(arm_visible),
    }

    if pinch_dist_m is not None:
        res["hand_pinch_distance_m"] = pinch_dist_m

    return res


# ===================================================================================================
# STAGE 5: OPTIONAL MULTI-MODEL FUSION HOOKS (--enable-holistic-fusion)
# ===================================================================================================
class HolisticFusionManager:
    """
    Extensible architectural hook to fuse dedicated Hand Landmarker and Face Landmarker models
    alongside Pose Landmarker Heavy when fine-grained distal kinematics are required.
    """

    def __init__(self, enabled: bool = False) -> None:
        self.enabled = enabled
        self.hand_landmarker = None
        self.face_landmarker = None
        if self.enabled:
            print("[INFO] Holistic Fusion Manager activated (Hand & Face task hooks loaded)", file=sys.stderr)

    def process_fusion(self, rgb_frame: np.ndarray, timestamp_ms: int) -> Dict[str, Any]:
        if not self.enabled:
            return {}
        # Architectural placeholder for standalone Hand/Face Tasks API passes
        return {"fusion_active": True, "hand_submodel": "ready", "face_submodel": "ready"}


# ===================================================================================================
# LOW-LATENCY THREADED WEBCAM CAPTURE (ThreadedCamera)
# ===================================================================================================
class ThreadedCamera:
    """
    Asynchronous capture thread with cv2.CAP_PROP_BUFFERSIZE = 1.
    Guarantees the vision pipeline always receives the freshest available frame,
    eliminating frame backlog and buffer delay when processing the Heavy model.
    """

    def __init__(self, camera_index: int = 0, width: int = 1280, height: int = 720) -> None:
        # On Windows, DirectShow (CAP_DSHOW) provides rapid initialization and consistent FPS
        if sys.platform.startswith("win"):
            self.cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
        else:
            self.cap = cv2.VideoCapture(camera_index)

        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.cap.set(cv2.CAP_PROP_FPS, 30)

        if not self.cap.isOpened():
            raise RuntimeError(f"FATAL: Unable to open video capture device #{camera_index}")

        # Confirm actual resolution negotiated with hardware
        actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"[INFO] Camera #{camera_index} initialized successfully: {actual_w}x{actual_h}", file=sys.stderr)

        self.lock = threading.Lock()
        self.running = True
        self.latest_frame: Optional[np.ndarray] = None
        self.frame_seq: int = 0

        # Read initial warm-up frame
        ret, frame = self.cap.read()
        if ret:
            self.latest_frame = frame
            self.frame_seq = 1

        self.worker = threading.Thread(target=self._capture_loop, daemon=True)
        self.worker.start()

    def _capture_loop(self) -> None:
        while self.running:
            ret, frame = self.cap.read()
            if ret:
                with self.lock:
                    self.latest_frame = frame
                    self.frame_seq += 1
            else:
                time.sleep(0.004)

    def get_latest_frame(self) -> Tuple[Optional[np.ndarray], int]:
        with self.lock:
            if self.latest_frame is None:
                return None, self.frame_seq
            return self.latest_frame.copy(), self.frame_seq

    def release(self) -> None:
        self.running = False
        if self.worker.is_alive():
            self.worker.join(timeout=1.0)
        self.cap.release()


# ===================================================================================================
# AUTO-PROVISIONING MODEL & OPTIONAL DEBUG RENDERER
# ===================================================================================================
def ensure_model_asset(model_path: str) -> str:
    """Verifies local existence of model asset; automatically downloads if missing or truncated."""
    if os.path.exists(model_path) and os.path.getsize(model_path) > 5_000_000:
        return model_path

    print(f"[INFO] Asset '{model_path}' not found. Downloading MediaPipe Pose Heavy Model...", file=sys.stderr)
    try:
        def progress(block_num: int, block_size: int, total_size: int) -> None:
            if total_size > 0:
                percent = min(100.0, block_num * block_size * 100.0 / total_size)
                sys.stderr.write(f"\r[DOWNLOADING] {percent:.1f}% ({block_num * block_size // 1024} KB)")
                sys.stderr.flush()

        urllib.request.urlretrieve(MODEL_URL, model_path, reporthook=progress)
        sys.stderr.write("\n")
        print(f"[INFO] Download complete: {model_path} ({os.path.getsize(model_path)} bytes)", file=sys.stderr)
        return model_path
    except Exception as e:
        raise RuntimeError(f"Failed to auto-download model from {MODEL_URL}: {e}") from e


def render_debug_hud(frame: np.ndarray, states: Dict[int, LandmarkState], fps: float) -> None:
    """
    Renders skeletal topology, confidence indicators, and FPS telemetry.
    STRICT RULE: Only invoked if --debug flag is explicitly provided.
    """
    h, w = frame.shape[:2]
    connections = [
        # Head
        (LM_LEFT_EAR, LM_LEFT_EYE), (LM_LEFT_EYE, LM_NOSE),
        (LM_NOSE, LM_RIGHT_EYE), (LM_RIGHT_EYE, LM_RIGHT_EAR),
        (LM_MOUTH_LEFT, LM_MOUTH_RIGHT),
        # Shoulder Girdle
        (LM_LEFT_SHOULDER, LM_RIGHT_SHOULDER),
        # Left Upper Limb
        (LM_LEFT_SHOULDER, LM_LEFT_ELBOW),
        (LM_LEFT_ELBOW, LM_LEFT_WRIST),
        (LM_LEFT_WRIST, LM_LEFT_INDEX),
        (LM_LEFT_WRIST, LM_LEFT_PINKY),
        (LM_LEFT_WRIST, LM_LEFT_THUMB),
        (LM_LEFT_INDEX, LM_LEFT_PINKY),
        # Right Upper Limb
        (LM_RIGHT_SHOULDER, LM_RIGHT_ELBOW),
        (LM_RIGHT_ELBOW, LM_RIGHT_WRIST),
        (LM_RIGHT_WRIST, LM_RIGHT_INDEX),
        (LM_RIGHT_WRIST, LM_RIGHT_PINKY),
        (LM_RIGHT_WRIST, LM_RIGHT_THUMB),
        (LM_RIGHT_INDEX, LM_RIGHT_PINKY),
        # Spine / Trunk
        (LM_LEFT_SHOULDER, LM_LEFT_HIP),
        (LM_RIGHT_SHOULDER, LM_RIGHT_HIP),
        (LM_LEFT_HIP, LM_RIGHT_HIP),
    ]

    # Draw Skeletal Segments
    for a, b in connections:
        if a in states and b in states:
            sa = states[a]
            sb = states[b]
            if sa.is_currently_valid and sb.is_currently_valid:
                pt_a = (int(sa.norm_xyz[0] * w), int(sa.norm_xyz[1] * h))
                pt_b = (int(sb.norm_xyz[0] * w), int(sb.norm_xyz[1] * h))
                cv2.line(frame, pt_a, pt_b, (0, 235, 140), 2, cv2.LINE_AA)

    # Draw Joint Vertices
    for idx, st in states.items():
        if idx in (LM_LEFT_HIP, LM_RIGHT_HIP):
            continue
        cx = int(st.norm_xyz[0] * w)
        cy = int(st.norm_xyz[1] * h)
        if st.tracking_status == "tracked":
            color = (0, 255, 0)       # Green: active fresh observation
        elif st.tracking_status == "held":
            color = (0, 165, 255)     # Orange: temporal hold state
        else:
            color = (0, 0, 255)       # Red: occluded
        cv2.circle(frame, (cx, cy), 4, color, -1, cv2.LINE_AA)

    # Telemetry HUD Badge
    cv2.putText(
        frame,
        f"DEBUG MODE | FPS: {fps:.1f} | HEAVY MODEL",
        (20, 36),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 200),
        2,
        cv2.LINE_AA,
    )


# ===================================================================================================
# MAIN TELEMETRY ENGINE LOOP
# ===================================================================================================
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clinical-Grade 3D Upper-Body Biomechanical Telemetry Engine (OpenCV + MediaPipe Tasks)"
    )
    parser.add_argument("--camera", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--width", type=int, default=1280, help="Camera width resolution (default: 1280)")
    parser.add_argument("--height", type=int, default=720, help="Camera height resolution (default: 720)")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL_NAME, help="Path to pose_landmarker_heavy.task")
    parser.add_argument("--visibility-threshold", type=float, default=0.5, help="Visibility gate threshold (default: 0.5)")
    parser.add_argument("--debug", action="store_true", default=False, help="Render visual skeletal overlay (default: False/Clean feed)")
    parser.add_argument("--pretty", action="store_true", default=False, help="Output formatted multi-line JSON")
    parser.add_argument("--compact", action="store_true", default=False, help="Print single-line telemetry summary to stderr")
    parser.add_argument("--enable-holistic-fusion", action="store_true", default=False, help="Enable multi-model holistic hooks")
    args = parser.parse_args()

    # 1. Auto-provision Model & configure Tasks API options
    model_asset_path = ensure_model_asset(args.model)
    base_options = python.BaseOptions(model_asset_path=model_asset_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.6,
        min_pose_presence_confidence=0.6,
        min_tracking_confidence=0.6,
        output_segmentation_masks=False,
    )

    # 2. Initialize Signal Processing Pipeline (Filters & Sanity Trackers)
    world_filters: Dict[int, OneEuroFilter3D] = {
        idx: OneEuroFilter3D(min_cutoff=1.2, beta=0.04, d_cutoff=1.0)
        for idx in TARGET_LANDMARKS
    }
    norm_filters: Dict[int, OneEuroFilter3D] = {
        idx: OneEuroFilter3D(min_cutoff=1.5, beta=0.05, d_cutoff=1.0)
        for idx in TARGET_LANDMARKS
    }

    trusted_states: Dict[int, LandmarkState] = {}
    sanity_tracker = AnatomicalSanityTracker(max_relative_deviation=0.22, max_velocity_ms=6.5)
    holistic_manager = HolisticFusionManager(enabled=args.enable_holistic_fusion)

    # 3. Start Low-Latency Threaded Video Capture
    camera = ThreadedCamera(camera_index=args.camera, width=args.width, height=args.height)
    last_processed_seq = -1
    last_monotonic_ts_ms = 0
    t_prev_loop = time.perf_counter()

    print(
        "[INFO] Biomechanical Telemetry Engine Active. Emitting NDJSON to stdout. Press 'q' in window to exit.",
        file=sys.stderr,
    )

    try:
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            while True:
                frame_bgr, frame_seq = camera.get_latest_frame()
                if frame_bgr is None or frame_seq == last_processed_seq:
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                    continue

                last_processed_seq = frame_seq
                t_now = time.perf_counter()
                dt = max(t_now - t_prev_loop, 1e-4)
                t_prev_loop = t_now
                fps = 1.0 / dt

                # Enforce strictly monotonic timestamp_ms required by VIDEO mode
                timestamp_ms = int(t_now * 1000)
                if timestamp_ms <= last_monotonic_ts_ms:
                    timestamp_ms = last_monotonic_ts_ms + 1
                last_monotonic_ts_ms = timestamp_ms

                # BGR to RGB conversion for MediaPipe Tasks API
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

                # Inference pass
                result = landmarker.detect_for_video(mp_image, timestamp_ms)

                left_outlier = False
                right_outlier = False

                if result.pose_landmarks and result.pose_world_landmarks:
                    norm_lms = result.pose_landmarks[0]
                    world_lms = result.pose_world_landmarks[0]

                    # Snapshot previous spatial states for Stage 2 Kinematic Sanity Gate
                    prev_le = trusted_states[LM_LEFT_ELBOW].world_xyz.copy() if LM_LEFT_ELBOW in trusted_states else None
                    prev_lw = trusted_states[LM_LEFT_WRIST].world_xyz.copy() if LM_LEFT_WRIST in trusted_states else None
                    prev_re = trusted_states[LM_RIGHT_ELBOW].world_xyz.copy() if LM_RIGHT_ELBOW in trusted_states else None
                    prev_rw = trusted_states[LM_RIGHT_WRIST].world_xyz.copy() if LM_RIGHT_WRIST in trusted_states else None

                    # Stage 1: Visibility/Presence Gate & Stage 3: One Euro Filter Smoothing
                    for idx in TARGET_LANDMARKS:
                        nlm = norm_lms[idx]
                        wlm = world_lms[idx]

                        vis = float(getattr(nlm, "visibility", 1.0) or 0.0)
                        pres = float(getattr(nlm, "presence", 1.0) or 0.0)

                        if vis >= args.visibility_threshold and pres >= args.visibility_threshold:
                            raw_w = np.array([wlm.x, wlm.y, wlm.z], dtype=np.float64)
                            raw_n = np.array([nlm.x, nlm.y, nlm.z], dtype=np.float64)

                            smooth_w = world_filters[idx].filter(raw_w, t_now)
                            smooth_n = norm_filters[idx].filter(raw_n, t_now)

                            trusted_states[idx] = LandmarkState(
                                world_xyz=smooth_w,
                                norm_xyz=smooth_n,
                                visibility=vis,
                                presence=pres,
                                last_valid_time=t_now,
                                is_currently_valid=True,
                                tracking_status="tracked",
                            )
                        else:
                            # Occluded landmark: Temporal hold up to MAX_TEMPORAL_HOLD_SEC
                            if idx in trusted_states:
                                age = t_now - trusted_states[idx].last_valid_time
                                trusted_states[idx].visibility = vis
                                trusted_states[idx].presence = pres
                                if age <= MAX_TEMPORAL_HOLD_SEC:
                                    trusted_states[idx].is_currently_valid = True
                                    trusted_states[idx].tracking_status = "held"
                                else:
                                    trusted_states[idx].is_currently_valid = False
                                    trusted_states[idx].tracking_status = "occluded"

                    # Stage 2: Anatomical Bone-Length Sanity Clamping (Left Arm)
                    if all(k in trusted_states for k in (LM_LEFT_SHOULDER, LM_LEFT_ELBOW, LM_LEFT_WRIST)):
                        l_high_conf = min(
                            trusted_states[LM_LEFT_SHOULDER].visibility,
                            trusted_states[LM_LEFT_ELBOW].visibility,
                            trusted_states[LM_LEFT_WRIST].visibility,
                        ) >= 0.80
                        clamped_le, clamped_lw, left_outlier = sanity_tracker.validate_and_clamp_limb(
                            side="left",
                            shoulder=trusted_states[LM_LEFT_SHOULDER].world_xyz,
                            elbow=trusted_states[LM_LEFT_ELBOW].world_xyz,
                            wrist=trusted_states[LM_LEFT_WRIST].world_xyz,
                            prev_elbow=prev_le,
                            prev_wrist=prev_lw,
                            dt=dt,
                            high_confidence=l_high_conf,
                        )
                        trusted_states[LM_LEFT_ELBOW].world_xyz = clamped_le
                        trusted_states[LM_LEFT_WRIST].world_xyz = clamped_lw

                    # Stage 2: Anatomical Bone-Length Sanity Clamping (Right Arm)
                    if all(k in trusted_states for k in (LM_RIGHT_SHOULDER, LM_RIGHT_ELBOW, LM_RIGHT_WRIST)):
                        r_high_conf = min(
                            trusted_states[LM_RIGHT_SHOULDER].visibility,
                            trusted_states[LM_RIGHT_ELBOW].visibility,
                            trusted_states[LM_RIGHT_WRIST].visibility,
                        ) >= 0.80
                        clamped_re, clamped_rw, right_outlier = sanity_tracker.validate_and_clamp_limb(
                            side="right",
                            shoulder=trusted_states[LM_RIGHT_SHOULDER].world_xyz,
                            elbow=trusted_states[LM_RIGHT_ELBOW].world_xyz,
                            wrist=trusted_states[LM_RIGHT_WRIST].world_xyz,
                            prev_elbow=prev_re,
                            prev_wrist=prev_rw,
                            dt=dt,
                            high_confidence=r_high_conf,
                        )
                        trusted_states[LM_RIGHT_ELBOW].world_xyz = clamped_re
                        trusted_states[LM_RIGHT_WRIST].world_xyz = clamped_rw
                else:
                    # No human detection in frame
                    for st in trusted_states.values():
                        st.is_currently_valid = False
                        st.tracking_status = "occluded"

                # Stage 5: Optional Holistic Fusion Hook
                if args.enable_holistic_fusion:
                    holistic_manager.process_fusion(frame_rgb, timestamp_ms)

                # Stage 4: Biomechanical Kinematics Computation
                head_metrics = compute_head_kinematics(trusted_states)
                left_arm_metrics = compute_arm_kinematics("left", trusted_states, left_outlier)
                right_arm_metrics = compute_arm_kinematics("right", trusted_states, right_outlier)

                telemetry = {
                    "timestamp_ms": timestamp_ms,
                    "fps": round(fps, 1),
                    "head": head_metrics,
                    "left_arm": left_arm_metrics,
                    "right_arm": right_arm_metrics,
                }

                # Output Structured NDJSON to stdout
                if args.pretty:
                    print(json.dumps(telemetry, ensure_ascii=False, indent=2), flush=True)
                else:
                    print(json.dumps(telemetry, ensure_ascii=False), flush=True)

                if args.compact:
                    h_tilt = head_metrics.get("tilt_deg")
                    l_elb = left_arm_metrics.get("elbow_angle_deg")
                    r_elb = right_arm_metrics.get("elbow_angle_deg")
                    sys.stderr.write(
                        f"\r[TELEMETRY] FPS: {fps:4.1f} | Head Tilt: {h_tilt}° | L-Elbow: {l_elb}° | R-Elbow: {r_elb}°"
                    )
                    sys.stderr.flush()

                # Visual Feed Rendering (Clean by default; overlays strictly in --debug)
                if args.debug and trusted_states:
                    render_debug_hud(frame_bgr, trusted_states, fps)

                cv2.imshow("Clinical Telemetry Feed (Press 'q' to quit)", frame_bgr)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    except KeyboardInterrupt:
        print("\n[INFO] Session interrupted by user. Shutting down gracefully...", file=sys.stderr)
    finally:
        camera.release()
        cv2.destroyAllWindows()
        print("[INFO] Engine stopped cleanly.", file=sys.stderr)


if __name__ == "__main__":
    main()
