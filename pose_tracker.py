#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ระบบตรวจจับท่าทางร่างกายความแม่นยำสูงแบบเรียลไทม์ (ศีรษะและแขนทั้งสองข้าง)
ด้วย OpenCV + MediaPipe Pose Landmarker (Tasks API - Heavy Model)

จุดเด่น:
1. ภาพกล้องสะอาด 100% (ไม่วาดเส้นโครงกระดูกหรือข้อความใดๆ ลงบนภาพ ยกเว้นเปิด --debug)
2. ใช้ One Euro Filter (1€ Filter) ลดอาการสั่น (Jitter) โดยไม่เกิดความหน่วง (Zero Lag)
3. คำนวณมุม 3 มิติจาก World Landmarks (หน่วยเมตร) ไม่เพี้ยนตามระยะห่างจากกล้อง
4. ระบบกรองค่าผิดปกติ (Outlier Rejection) เมื่อความยาวท่อนแขนยืด/หดผิดธรรมชาติ
5. แยก Thread ดึงภาพจากกล้องเว็บแคมเพื่อลดความหน่วงสะสมของ Buffer
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

# =====================================================================
# ค่าคงที่และดัชนีจุดสำคัญ (Landmark Indices)
# =====================================================================
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
DEFAULT_MODEL_PATH = "pose_landmarker_heavy.task"

# ดัชนีส่วนศีรษะ
LM_NOSE = 0
LM_LEFT_EYE = 2
LM_RIGHT_EYE = 5
LM_LEFT_EAR = 7
LM_RIGHT_EAR = 8
LM_MOUTH_LEFT = 9
LM_MOUTH_RIGHT = 10

# ดัชนีส่วนแขนและมือ
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

# ดัชนีสะโพก (ใช้ภายในเพื่อสร้างแกนอ้างอิงลำตัว 3 มิติสำหรับคำนวณมุมไหล่)
LM_LEFT_HIP = 23
LM_RIGHT_HIP = 24

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


# =====================================================================
# 1. One Euro Filter (1€ Filter) สำหรับลดอาการสั่นแบบไร้ความหน่วง
# =====================================================================
class OneEuroFilter1D:
    """ตัวกรองสัญญาณ One Euro Filter สำหรับข้อมูล 1 มิติ"""

    def __init__(
        self,
        min_cutoff: float = 1.2,
        beta: float = 0.04,
        d_cutoff: float = 1.0,
    ) -> None:
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        self.x_prev: Optional[float] = None
        self.dx_prev: float = 0.0
        self.t_prev: Optional[float] = None

    @staticmethod
    def _smoothing_factor(t_e: float, cutoff: float) -> float:
        r = 2.0 * math.pi * cutoff * t_e
        return r / (r + 1.0)

    def filter(self, x: float, t: float) -> float:
        """กรองค่า x ณ เวลา t (วินาที)"""
        if self.t_prev is None or self.x_prev is None:
            self.x_prev = x
            self.t_prev = t
            return x

        t_e = t - self.t_prev
        if t_e <= 1e-6:
            return self.x_prev

        # คำนวณอนุพันธ์ (ความเร็วของการเปลี่ยนแปลง)
        a_d = self._smoothing_factor(t_e, self.d_cutoff)
        dx = (x - self.x_prev) / t_e
        dx_hat = a_d * dx + (1.0 - a_d) * self.dx_prev

        # ปรับความถี่ Cutoff ตามความเร็ว: อยู่นิ่งกรองละเอียด ขยับเร็วเกาะติดทันที
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a = self._smoothing_factor(t_e, cutoff)
        x_hat = a * x + (1.0 - a) * self.x_prev

        self.x_prev = x_hat
        self.dx_prev = dx_hat
        self.t_prev = t
        return x_hat


class OneEuroFilter3D:
    """ตัวกรอง One Euro Filter สำหรับพิกัด 3 มิติ (x, y, z)"""

    def __init__(
        self,
        min_cutoff: float = 1.2,
        beta: float = 0.04,
        d_cutoff: float = 1.0,
    ) -> None:
        self.fx = OneEuroFilter1D(min_cutoff, beta, d_cutoff)
        self.fy = OneEuroFilter1D(min_cutoff, beta, d_cutoff)
        self.fz = OneEuroFilter1D(min_cutoff, beta, d_cutoff)

    def filter(self, pt: np.ndarray, t: float) -> np.ndarray:
        return np.array([
            self.fx.filter(float(pt[0]), t),
            self.fy.filter(float(pt[1]), t),
            self.fz.filter(float(pt[2]), t),
        ], dtype=np.float64)


# =====================================================================
# 2. โครงสร้างเก็บสถานะ Landmark และการตรวจสอบความสมเหตุสมผลทางกายวิภาค
# =====================================================================
@dataclass
class LandmarkState:
    world_xyz: np.ndarray      # พิกัด 3 มิติหน่วยเมตร (x, y, z)
    norm_xyz: np.ndarray       # พิกัด Normalized บนภาพ (0..1)
    visibility: float          # ค่าความชัดเจน (0..1)
    presence: float            # ค่าการปรากฏในเฟรม (0..1)
    last_valid_time: float     # เวลาล่าสุดที่จุดนี้มีความน่าเชื่อถือผ่านเกณฑ์
    is_currently_valid: bool   # สถานะว่าผ่านเกณฑ์ในเฟรมปัจจุบันหรือไม่


class AnatomicalSanityTracker:
    """
    ตรวจสอบความสมเหตุสมผลของความยาวท่อนแขน (ไหล่-ศอก และ ศอก-ข้อมือ)
    เพื่อกรองค่ากระโดดผิดปกติ (Outliers) เช่น ตอนยื่นแขนชี้เข้าหากล้องตรงๆ
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
        ตรวจสอบความยาวท่อนแขนบนและท่อนแขนล่าง หากยืด/หดผิดปกติเกินเกณฑ์
        จะถือว่าเป็น Outlier และคืนค่าพิกัดเดิมที่เชื่อถือได้แทน
        """
        upper_len = float(np.linalg.norm(elbow - shoulder))
        forearm_len = float(np.linalg.norm(wrist - elbow))
        outlier_detected = False

        upper_key = f"{side}_upper"
        forearm_key = f"{side}_forearm"

        # ตรวจสอบความเร็วการกระโดดของจุด (ป้องกัน Spike)
        if dt > 1e-4 and prev_elbow is not None and prev_wrist is not None:
            elbow_vel = float(np.linalg.norm(elbow - prev_elbow)) / dt
            wrist_vel = float(np.linalg.norm(wrist - prev_wrist)) / dt
            if elbow_vel > self.max_velocity_ms or wrist_vel > self.max_velocity_ms:
                outlier_detected = True

        # ตรวจสอบเทียบกับค่ามัธยฐานความยาวท่อนแขนจริงของผู้ใช้
        if len(self.history_lengths[upper_key]) >= 10:
            ref_upper = float(np.median(self.history_lengths[upper_key]))
            ref_forearm = float(np.median(self.history_lengths[forearm_key]))

            if ref_upper > 0.05 and abs(upper_len - ref_upper) / ref_upper > self.max_relative_deviation:
                outlier_detected = True
            if ref_forearm > 0.05 and abs(forearm_len - ref_forearm) / ref_forearm > self.max_relative_deviation:
                outlier_detected = True

        # หากเป็น Outlier ให้ใช้ค่าก่อนหน้าแทน
        if outlier_detected and prev_elbow is not None and prev_wrist is not None:
            return prev_elbow.copy(), prev_wrist.copy(), True

        # บันทึกค่าอ้างอิงเฉพาะเมื่อความมั่นใจสูงและอยู่ในช่วงขนาดแขนมนุษย์จริง (12cm - 50cm)
        if high_confidence and 0.12 <= upper_len <= 0.50 and 0.12 <= forearm_len <= 0.50:
            self.history_lengths[upper_key].append(upper_len)
            self.history_lengths[forearm_key].append(forearm_len)
            if len(self.history_lengths[upper_key]) > 90:
                self.history_lengths[upper_key].pop(0)
                self.history_lengths[forearm_key].pop(0)

        return elbow, wrist, False


# =====================================================================
# 3. ฟังก์ชันคำนวณทางเรขาคณิต 3 มิติ และชีวกลศาสตร์
# =====================================================================
def calculate_3d_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """
    คำนวณมุม 3 มิติ (องศา) ที่จุดยอด b จากจุด a -> b <- c
    ใช้พิกัด World Landmarks (หน่วยเมตร)
    """
    ba = a - b
    bc = c - b
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 0.0
    cos_angle = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_angle)))


def compute_head_kinematics(states: Dict[int, LandmarkState]) -> Dict[str, Any]:
    """
    คำนวณมุมเอียงศีรษะ (Roll/Tilt), ทิศทางการหันซ้าย-ขวา (Yaw), และมุมก้ม-เงย (Pitch)
    """
    required = [LM_NOSE, LM_LEFT_EAR, LM_RIGHT_EAR, LM_LEFT_EYE, LM_RIGHT_EYE]
    visible = all(
        idx in states and states[idx].is_currently_valid
        for idx in [LM_NOSE, LM_LEFT_EAR, LM_RIGHT_EAR]
    )

    if not all(idx in states for idx in required):
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

    # 1. คำนวณมุมเอียงศีรษะ (Head Tilt / Roll) จากเส้นเชื่อมหูซ้าย-ขวา และตาซ้าย-ขวา
    # ในระบบพิกัด MediaPipe World: แกน Y ชี้ลงพื้น, แกน X ชี้ไปทางซ้ายของภาพ (ขวาของตัวคน)
    ear_vec = l_ear - r_ear
    eye_vec = l_eye - r_eye
    horiz_dist_ear = math.hypot(float(ear_vec[0]), float(ear_vec[2]))
    horiz_dist_eye = math.hypot(float(eye_vec[0]), float(eye_vec[2]))

    tilt_ear = math.degrees(math.atan2(-float(ear_vec[1]), max(horiz_dist_ear, 1e-5)))
    tilt_eye = math.degrees(math.atan2(-float(eye_vec[1]), max(horiz_dist_eye, 1e-5)))
    tilt_deg = 0.65 * tilt_ear + 0.35 * tilt_eye

    # 2. คำนวณมุมหันซ้าย-ขวา (Head Yaw) จากตำแหน่งจมูกเทียบกับกึ่งกลางระหว่างหูสองข้าง
    ear_mid = 0.5 * (l_ear + r_ear)
    head_width = float(np.linalg.norm(l_ear - r_ear))
    forward_vec = nose - ear_mid

    # สร้างแกนซ้าย-ขวาของศีรษะบนระนาบแนวนอน
    ear_unit = ear_vec / max(head_width, 1e-5)
    lateral_offset = float(np.dot(forward_vec, ear_unit))
    forward_depth = max(abs(float(forward_vec[2])), 0.04)
    yaw_deg = math.degrees(math.atan2(lateral_offset, forward_depth))

    if yaw_deg > 10.0:
        yaw_dir = "left"
    elif yaw_deg < -10.0:
        yaw_dir = "right"
    else:
        yaw_dir = "center"

    # 3. คำนวณมุมก้ม-เงย (Head Pitch)
    pitch_deg = math.degrees(math.atan2(-float(forward_vec[1]), forward_depth))

    return {
        "tilt_deg": round(tilt_deg, 2),
        "yaw_deg": round(yaw_deg, 2),
        "yaw_direction": yaw_dir,
        "pitch_deg": round(pitch_deg, 2),
        "visible": bool(visible),
    }


def compute_arm_kinematics(
    side: str,
    states: Dict[int, LandmarkState],
    outlier_flag: bool,
) -> Dict[str, Any]:
    """
    คำนวณมุมข้อศอก (ไหล่-ศอก-ข้อมือ), มุมข้อไหล่ (เทียบกับแกนลำตัว), และมุมข้อมือ
    """
    if side == "left":
        idx_s, idx_e, idx_w = LM_LEFT_SHOULDER, LM_LEFT_ELBOW, LM_LEFT_WRIST
        idx_pinky, idx_index, idx_thumb = LM_LEFT_PINKY, LM_LEFT_INDEX, LM_LEFT_THUMB
        idx_hip = LM_LEFT_HIP
    else:
        idx_s, idx_e, idx_w = LM_RIGHT_SHOULDER, LM_RIGHT_ELBOW, LM_RIGHT_WRIST
        idx_pinky, idx_index, idx_thumb = LM_RIGHT_PINKY, LM_RIGHT_INDEX, LM_RIGHT_THUMB
        idx_hip = LM_RIGHT_HIP

    if not all(k in states for k in (idx_s, idx_e, idx_w)):
        return {
            "elbow_angle_deg": None,
            "shoulder_angle_deg": None,
            "wrist_angle_deg": None,
            "upper_arm_length_m": None,
            "forearm_length_m": None,
            "outlier_rejected": outlier_flag,
            "visible": False,
        }

    s_state = states[idx_s]
    e_state = states[idx_e]
    w_state = states[idx_w]

    arm_visible = (
        s_state.is_currently_valid
        and e_state.is_currently_valid
        and w_state.is_currently_valid
    )

    s_pt = s_state.world_xyz
    e_pt = e_state.world_xyz
    w_pt = w_state.world_xyz

    # 1. มุมข้อศอก (ไหล่ - ศอก - ข้อมือ): 180° = เหยียดตรง, ~30° = งอพับสุด
    elbow_angle = calculate_3d_angle(s_pt, e_pt, w_pt)

    # 2. มุมข้อไหล่ (สะโพก/แกนลำตัวดิ่ง - ไหล่ - ศอก): 0° = แขนแนบลำตัว, 90° = กางตั้งฉาก, 180° = ชูเหนือศีรษะ
    if idx_hip in states and states[idx_hip].visibility >= 0.4:
        trunk_down_pt = states[idx_hip].world_xyz
    else:
        # กรณีไม่เห็นสะโพก ใช้เวกเตอร์ดิ่งลงตามแกน Y ของ World Coordinate (+Y ชี้ลงพื้น)
        trunk_down_pt = s_pt + np.array([0.0, 0.5, 0.0], dtype=np.float64)

    shoulder_angle = calculate_3d_angle(trunk_down_pt, s_pt, e_pt)

    # 3. มุมข้อมือ (ศอก - ข้อมือ - กึ่งกลางฝ่ามือจากนิ้วชี้และนิ้วก้อย)
    wrist_angle: Optional[float] = None
    if idx_index in states and idx_pinky in states:
        palm_center = 0.5 * (states[idx_index].world_xyz + states[idx_pinky].world_xyz)
        wrist_angle = round(calculate_3d_angle(e_pt, w_pt, palm_center), 2)

    # 4. ความยาวท่อนแขนจริง (หน่วยเมตร)
    upper_len = float(np.linalg.norm(e_pt - s_pt))
    forearm_len = float(np.linalg.norm(w_pt - e_pt))

    # 5. ข้อมูลตำแหน่งมือและนิ้ว (ระยะห่างนิ้วโป้ง-นิ้วชี้)
    pinch_dist_m: Optional[float] = None
    if idx_thumb in states and idx_index in states:
        pinch_dist_m = round(
            float(np.linalg.norm(states[idx_thumb].world_xyz - states[idx_index].world_xyz)),
            3,
        )

    return {
        "shoulder_angle_deg": round(shoulder_angle, 2),
        "elbow_angle_deg": round(elbow_angle, 2),
        "wrist_angle_deg": wrist_angle,
        "upper_arm_length_m": round(upper_len, 2),
        "forearm_length_m": round(forearm_len, 2),
        "hand_pinch_distance_m": pinch_dist_m,
        "outlier_rejected": bool(outlier_flag),
        "visible": bool(arm_visible),
    }


# =====================================================================
# 4. คลาสดึงภาพจากกล้องแบบแยก Thread เพื่อลด Latency
# =====================================================================
class ThreadedWebcam:
    """ดึงภาพจากกล้องเว็บแคมใน Thread แยกเพื่อให้ได้เฟรมล่าสุดเสมอโดยไม่ติด Buffer ค้าง"""

    def __init__(self, camera_index: int = 0, width: int = 1280, height: int = 720) -> None:
        # ใช้ CAP_DSHOW บน Windows เพื่อเปิดกล้องเร็วและเสถียรขึ้น
        if sys.platform.startswith("win"):
            self.cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
        else:
            self.cap = cv2.VideoCapture(camera_index)

        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.cap.set(cv2.CAP_PROP_FPS, 30)

        if not self.cap.isOpened():
            raise RuntimeError(f"ไม่สามารถเปิดกล้องเว็บแคมหมายเลข {camera_index} ได้")

        self.lock = threading.Lock()
        self.running = True
        self.latest_frame: Optional[np.ndarray] = None
        self.frame_id: int = 0

        # อ่านเฟรมแรกทันที
        ret, frame = self.cap.read()
        if ret:
            self.latest_frame = frame
            self.frame_id = 1

        self.thread = threading.Thread(target=self._update_loop, daemon=True)
        self.thread.start()

    def _update_loop(self) -> None:
        while self.running:
            ret, frame = self.cap.read()
            if ret:
                with self.lock:
                    self.latest_frame = frame
                    self.frame_id += 1
            else:
                time.sleep(0.005)

    def read_latest(self) -> Tuple[Optional[np.ndarray], int]:
        with self.lock:
            if self.latest_frame is None:
                return None, self.frame_id
            return self.latest_frame.copy(), self.frame_id

    def release(self) -> None:
        self.running = False
        if self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self.cap.release()


# =====================================================================
# 5. ฟังก์ชันดาวน์โหลดโมเดลและวาด Debug (ใช้เฉพาะเมื่อเปิด --debug เท่านั้น)
# =====================================================================
def ensure_model_exists(model_path: str) -> str:
    """ตรวจสอบว่ามีไฟล์โมเดล .task หรือไม่ หากไม่มีจะดาวน์โหลดอัตโนมัติ"""
    if os.path.exists(model_path) and os.path.getsize(model_path) > 1_000_000:
        return model_path

    print(f"[INFO] ไม่พบไฟล์โมเดล '{model_path}' กำลังดาวน์โหลดจาก Google MediaPipe...", file=sys.stderr)
    urllib.request.urlretrieve(MODEL_URL, model_path)
    print(f"[INFO] ดาวน์โหลดโมเดลสำเร็จ: {model_path}", file=sys.stderr)
    return model_path


def render_debug_overlay(frame: np.ndarray, states: Dict[int, LandmarkState]) -> None:
    """
    วาดจุดและเส้นเชื่อมเฉพาะเมื่อผู้ใช้ระบุ flag --debug เท่านั้น
    (โดยค่าเริ่มต้นฟังก์ชันนี้จะไม่ถูกเรียกใช้เด็ดขาด)
    """
    h, w = frame.shape[:2]
    edges = [
        (LM_LEFT_EAR, LM_LEFT_EYE), (LM_LEFT_EYE, LM_NOSE),
        (LM_NOSE, LM_RIGHT_EYE), (LM_RIGHT_EYE, LM_RIGHT_EAR),
        (LM_LEFT_SHOULDER, LM_RIGHT_SHOULDER),
        (LM_LEFT_SHOULDER, LM_LEFT_ELBOW), (LM_LEFT_ELBOW, LM_LEFT_WRIST),
        (LM_RIGHT_SHOULDER, LM_RIGHT_ELBOW), (LM_RIGHT_ELBOW, LM_RIGHT_WRIST),
        (LM_LEFT_WRIST, LM_LEFT_INDEX), (LM_LEFT_WRIST, LM_LEFT_PINKY), (LM_LEFT_WRIST, LM_LEFT_THUMB),
        (LM_RIGHT_WRIST, LM_RIGHT_INDEX), (LM_RIGHT_WRIST, LM_RIGHT_PINKY), (LM_RIGHT_WRIST, LM_RIGHT_THUMB),
    ]
    for idx_a, idx_b in edges:
        if idx_a in states and idx_b in states:
            pt_a = (int(states[idx_a].norm_xyz[0] * w), int(states[idx_a].norm_xyz[1] * h))
            pt_b = (int(states[idx_b].norm_xyz[0] * w), int(states[idx_b].norm_xyz[1] * h))
            cv2.line(frame, pt_a, pt_b, (0, 255, 180), 2, cv2.LINE_AA)

    for idx, st in states.items():
        if idx in (LM_LEFT_HIP, LM_RIGHT_HIP):
            continue
        cx, cy = int(st.norm_xyz[0] * w), int(st.norm_xyz[1] * h)
        color = (0, 255, 0) if st.is_currently_valid else (0, 165, 255)
        cv2.circle(frame, (cx, cy), 4, color, -1, cv2.LINE_AA)


# =====================================================================
# 6. ฟังก์ชันหลัก (Main Real-Time Tracking Loop)
# =====================================================================
def main() -> None:
    parser = argparse.ArgumentParser(
        description="โปรแกรมตรวจจับท่าทางศีรษะและแขนแบบเรียลไทม์ด้วย MediaPipe Pose Heavy (Tasks API)"
    )
    parser.add_argument("--camera", type=int, default=0, help="หมายเลขกล้องเว็บแคม (ค่าเริ่มต้น: 0)")
    parser.add_argument("--width", type=int, default=1280, help="ความกว้างของภาพ (ค่าเริ่มต้น: 1280)")
    parser.add_argument("--height", type=int, default=720, help="ความสูงของภาพ (ค่าเริ่มต้น: 720)")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL_PATH, help="พาธไฟล์ pose_landmarker_heavy.task")
    parser.add_argument("--visibility-threshold", type=float, default=0.5, help="เกณฑ์ความชัดเจนขั้นต่ำ (ค่าเริ่มต้น: 0.5)")
    parser.add_argument("--debug", action="store_true", default=False, help="เปิดการวาดเส้นเพื่อทดสอบ (ปิดเป็นค่าเริ่มต้น)")
    parser.add_argument("--pretty", action="store_true", default=False, help="พิมพ์ JSON แบบจัดย่อหน้าอ่านง่าย")
    args = parser.parse_args()

    # 1. เตรียมโมเดลและตั้งค่า PoseLandmarkerOptions
    model_path = ensure_model_exists(args.model)
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.6,
        min_pose_presence_confidence=0.6,
        min_tracking_confidence=0.6,
        output_segmentation_masks=False,
    )

    # 2. เตรียมตัวกรอง One Euro Filter แยกตามจุด Landmark
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

    # 3. เปิดกล้องเว็บแคม
    webcam = ThreadedWebcam(camera_index=args.camera, width=args.width, height=args.height)
    last_processed_frame_id = -1
    last_timestamp_ms = 0
    prev_loop_time = time.perf_counter()

    print("[INFO] เริ่มต้นการตรวจจับท่าทาง (กด 'q' บนหน้าต่างภาพกล้องเพื่อออกจากโปรแกรม)", file=sys.stderr)

    try:
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            while True:
                frame_bgr, frame_id = webcam.read_latest()
                if frame_bgr is None or frame_id == last_processed_frame_id:
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                    continue

                last_processed_frame_id = frame_id
                now_sec = time.perf_counter()
                dt = max(now_sec - prev_loop_time, 1e-4)
                prev_loop_time = now_sec
                fps = 1.0 / dt

                # สร้าง Monotonic Timestamp (หน่วยมิลลิวินาที) ที่เพิ่มขึ้นเสมอสำหรับโหมด VIDEO
                timestamp_ms = int(now_sec * 1000)
                if timestamp_ms <= last_timestamp_ms:
                    timestamp_ms = last_timestamp_ms + 1
                last_timestamp_ms = timestamp_ms

                # แปลงภาพจาก BGR เป็น RGB ก่อนส่งเข้าโมเดล MediaPipe
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

                # ประมวลผลตรวจจับท่าทาง
                result = landmarker.detect_for_video(mp_image, timestamp_ms)

                left_outlier = False
                right_outlier = False

                if result.pose_landmarks and result.pose_world_landmarks:
                    norm_lms = result.pose_landmarks[0]
                    world_lms = result.pose_world_landmarks[0]

                    # เก็บค่าก่อนหน้าของศอกและข้อมือไว้ตรวจสอบความสมเหตุสมผลทางกายวิภาค
                    prev_l_elbow = trusted_states[LM_LEFT_ELBOW].world_xyz.copy() if LM_LEFT_ELBOW in trusted_states else None
                    prev_l_wrist = trusted_states[LM_LEFT_WRIST].world_xyz.copy() if LM_LEFT_WRIST in trusted_states else None
                    prev_r_elbow = trusted_states[LM_RIGHT_ELBOW].world_xyz.copy() if LM_RIGHT_ELBOW in trusted_states else None
                    prev_r_wrist = trusted_states[LM_RIGHT_WRIST].world_xyz.copy() if LM_RIGHT_WRIST in trusted_states else None

                    # ขั้นตอนที่ 1 & 2: กรองด้วย Visibility/Presence และทำ Smoothing ด้วย One Euro Filter
                    for idx in TARGET_LANDMARKS:
                        nlm = norm_lms[idx]
                        wlm = world_lms[idx]

                        vis = float(getattr(nlm, "visibility", 1.0) or 0.0)
                        pres = float(getattr(nlm, "presence", 1.0) or 0.0)

                        if vis >= args.visibility_threshold and pres >= args.visibility_threshold:
                            raw_world = np.array([wlm.x, wlm.y, wlm.z], dtype=np.float64)
                            raw_norm = np.array([nlm.x, nlm.y, nlm.z], dtype=np.float64)

                            smooth_world = world_filters[idx].filter(raw_world, now_sec)
                            smooth_norm = norm_filters[idx].filter(raw_norm, now_sec)

                            trusted_states[idx] = LandmarkState(
                                world_xyz=smooth_world,
                                norm_xyz=smooth_norm,
                                visibility=vis,
                                presence=pres,
                                last_valid_time=now_sec,
                                is_currently_valid=True,
                            )
                        else:
                            # หาก Visibility ต่ำกว่าเกณฑ์ ให้ใช้ค่าล่าสุดที่เชื่อถือได้แทน (คงค่าไว้ไม่เกิน 0.5 วินาที)
                            if idx in trusted_states:
                                hold_age = now_sec - trusted_states[idx].last_valid_time
                                trusted_states[idx].visibility = vis
                                trusted_states[idx].presence = pres
                                trusted_states[idx].is_currently_valid = (hold_age <= 0.5)

                    # ขั้นตอนที่ 6: ตรวจสอบความสมเหตุสมผลของความยาวท่อนแขนซ้ายและขวา (Outlier Rejection)
                    if all(k in trusted_states for k in (LM_LEFT_SHOULDER, LM_LEFT_ELBOW, LM_LEFT_WRIST)):
                        l_high_conf = min(
                            trusted_states[LM_LEFT_SHOULDER].visibility,
                            trusted_states[LM_LEFT_ELBOW].visibility,
                            trusted_states[LM_LEFT_WRIST].visibility,
                        ) >= 0.75
                        clamped_le, clamped_lw, left_outlier = sanity_tracker.validate_and_clamp_limb(
                            side="left",
                            shoulder=trusted_states[LM_LEFT_SHOULDER].world_xyz,
                            elbow=trusted_states[LM_LEFT_ELBOW].world_xyz,
                            wrist=trusted_states[LM_LEFT_WRIST].world_xyz,
                            prev_elbow=prev_l_elbow,
                            prev_wrist=prev_l_wrist,
                            dt=dt,
                            high_confidence=l_high_conf,
                        )
                        trusted_states[LM_LEFT_ELBOW].world_xyz = clamped_le
                        trusted_states[LM_LEFT_WRIST].world_xyz = clamped_lw

                    if all(k in trusted_states for k in (LM_RIGHT_SHOULDER, LM_RIGHT_ELBOW, LM_RIGHT_WRIST)):
                        r_high_conf = min(
                            trusted_states[LM_RIGHT_SHOULDER].visibility,
                            trusted_states[LM_RIGHT_ELBOW].visibility,
                            trusted_states[LM_RIGHT_WRIST].visibility,
                        ) >= 0.75
                        clamped_re, clamped_rw, right_outlier = sanity_tracker.validate_and_clamp_limb(
                            side="right",
                            shoulder=trusted_states[LM_RIGHT_SHOULDER].world_xyz,
                            elbow=trusted_states[LM_RIGHT_ELBOW].world_xyz,
                            wrist=trusted_states[LM_RIGHT_WRIST].world_xyz,
                            prev_elbow=prev_r_elbow,
                            prev_wrist=prev_r_wrist,
                            dt=dt,
                            high_confidence=r_high_conf,
                        )
                        trusted_states[LM_RIGHT_ELBOW].world_xyz = clamped_re
                        trusted_states[LM_RIGHT_WRIST].world_xyz = clamped_rw
                else:
                    # กรณีไม่พบคนในเฟรมเลย ให้ปรับสถานะความน่าเชื่อถือตามเวลาที่หายไป
                    for st in trusted_states.values():
                        st.is_currently_valid = False

                # คำนวณข้อมูลท่าทางของศีรษะ แขนซ้าย และแขนขวา
                head_data = compute_head_kinematics(trusted_states)
                left_arm_data = compute_arm_kinematics("left", trusted_states, left_outlier)
                right_arm_data = compute_arm_kinematics("right", trusted_states, right_outlier)

                telemetry_payload = {
                    "timestamp_ms": timestamp_ms,
                    "fps": round(fps, 1),
                    "head": head_data,
                    "left_arm": left_arm_data,
                    "right_arm": right_arm_data,
                }

                # พิมพ์ผลลัพธ์ JSON ออกทางคอนโซล
                if args.pretty:
                    print(json.dumps(telemetry_payload, ensure_ascii=False, indent=2), flush=True)
                else:
                    print(json.dumps(telemetry_payload, ensure_ascii=False), flush=True)

                # วาดเส้นทดสอบเฉพาะเมื่อระบุ --debug เท่านั้น (ค่าเริ่มต้นจะไม่วาดอะไรลงบนภาพเลย)
                if args.debug and trusted_states:
                    render_debug_overlay(frame_bgr, trusted_states)

                # แสดงภาพจากกล้องตามปกติ
                cv2.imshow("Camera Feed (Press 'q' to quit)", frame_bgr)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    except KeyboardInterrupt:
        print("\n[INFO] หยุดการทำงานโดยผู้ใช้", file=sys.stderr)
    finally:
        webcam.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
