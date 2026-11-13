/**
 * apps/kiosk/src/smart-flow/SmartLoginView.tsx
 * Centered Smart Kiosk Card Design matching 100% reference design
 * 3-Second Countdown & 250ms Median Aggregator Verification
 * Trilingual (TH/EN/CN), Calibration Mode HUD & Touchless Gesture Verification
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';
import {
  FaceDetector,
  averageAndNormalize,
  aggregateProbeEmbeddings,
  FastLoginLivenessVerifier,
  LivenessTelemetryBadge,
  LivenessVerificationResult,
  SpatialIdentityAnchor,
  purgeStaleBiometricCache,
  purgeAllLocalBiometricCaches,
  removePatientFromLocalCache,
  computeLaplacianVariance,
  FaceLandmarks,
  Point2D,
} from '../../../../packages/face-client/src/index.js';
import { useRaiseBothHandsConfirm } from '../hooks/useRaiseBothHandsConfirm';
import {
  defaultApiClient,
  normalizePatientRecord,
} from '../../../../packages/api-client/src/index.js';
import {
  BIOMETRIC_CONFIG,
  calibrateCosineSimilarity,
} from '../../../../packages/smart-biometric-core/src/index.js';
import { getFaceClientServices, preloadFaceModels } from '../services/faceClientService';
import {
  RefreshCw,
  CheckCircle2,
  UserPlus,
  Info,
  X,
  RotateCw,
  FlipHorizontal,
  Camera,
  Activity,
  Bell,
  UserCheck,
  Clock,
} from 'lucide-react';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';

export interface PendingRegistrationBiometrics {
  probeEmbedding: number[];
  faceCropDataUrl?: string;
  capturedAt: string;
}

interface SmartLoginViewProps {
  onLoginSuccess: (patient: PatientRecordFile) => void;
  onNavigateToEnroll: () => void;
  customDetector?: FaceDetector;
  onOpenStaffLoginModal?: () => void;
  onOpenNewPatientModal?: () => void;
  onStaffAssistedRegister?: (biometrics: PendingRegistrationBiometrics | null) => void;
  isPaused?: boolean;
}

interface BiometricSample {
  vector: number[];
  score: number; // cosine similarity [0.0 - 1.0]
  percent: number; // similarity % [0 - 100]
  distance: number;
  candidateId?: string;
  candidateName?: string;
  candidateHn?: string;
  secondCandidate?: { name: string; hn: string; score: number };
  liveness: LivenessVerificationResult;
  timestamp: number;
}

interface CachedPatientBiometric {
  id: string;
  hn: string;
  name: string;
  vectors: number[][];
}

export interface LockedFaceTarget {
  box: { x: number; y: number; width: number; height: number };
  centerX: number;
  centerY: number;
  lastSeenTimestamp: number;
  lockedAt: number;
}

/**
 * การตั้งค่ามาตรฐานระยะกล้องและสัดส่วนใบหน้าสำหรับตู้ Kiosk (Camera Standardization Config)
 * เพื่อให้สัดส่วนใบหน้าคงที่ 45% บนกล้องทุกรุ่น (เว็บแคมโน้ตบุ๊ก, USB, มือถือ)
 */
export const KIOSK_CAMERA_STANDARDIZATION_CONFIG = {
  // สัดส่วนความสูงของใบหน้าต่อความสูงภาพเป้าหมายที่ป้อนเข้าโมเดล (45% เหมาะสมที่สุดสำหรับ ArcFace 112x112)
  FACE_HEIGHT_RATIO_TARGET: 0.45,
  // สัดส่วนภาพมาตรฐาน (4:3 เพื่อความคมชัดสูงสุดและไม่บิดเบือนสัดส่วน)
  TARGET_ASPECT_RATIO: 4 / 3,
  // ขนาดความสูงของใบหน้าขั้นต่ำในหน่วยพิกเซล (ต่ำกว่านี้ถือว่าอยู่ไกลเกินไป)
  MIN_FACE_SIZE: 80,
  // องศาการหันศีรษะซ้าย-ขวาสูงสุดที่ยอมรับได้ (องศา)
  MAX_YAW: 24,
  // องศาการก้ม-เงยศีรษะสูงสุดที่ยอมรับได้ (องศา)
  MAX_PITCH: 23,
  // ความคมชัดขั้นต่ำ (Laplacian Variance ต่ำกว่านี้คือภาพเบลอจากการเคลื่อนไหว)
  MIN_SHARPNESS: 4.0,
  // ความสว่างเฉลี่ยขั้นต่ำของใบหน้า (0 - 255 ป้องกันภาพมืด)
  MIN_BRIGHTNESS: 35,
  // ความสว่างเฉลี่ยสูงสุดของใบหน้า (0 - 255 ป้องกันแสงจ้า/ย้อนแสง)
  MAX_BRIGHTNESS: 225,
  // ขนาดความกว้างและความสูงคงที่ (พิกเซล) สำหรับป้อนเข้าโมเดล ArcFace / AdaFace
  INPUT_SIZE: 112,
  // ระยะเวลาที่ยอมให้เป้าหมายเดิมหลุดจากกล้องก่อนรีเซ็ต (มิลลิวินาที)
  FACE_LOST_TIMEOUT_MS: 1000,
  // อัตราการขยับจุดกึ่งกลางสูงสุดข้ามเฟรมสำหรับเป้าหมายเดิม (18% ของขนาดภาพ)
  MAX_CENTER_SHIFT_RATIO: 0.18,
  // อัตราการเปลี่ยนแปลงขนาดใบหน้าสูงสุดข้ามเฟรม (35%)
  MAX_SIZE_CHANGE_RATIO: 0.35,
} as const;

/**
 * การตั้งค่าสำหรับระบบจัดการสถานะเมื่อไม่พบบัญชีผู้ใช้ (Account Not Found Configuration)
 * สำหรับควบคุม UX และการจัดการรอบสแกน (ห้ามนำไปปรับความเข้มงวดของ Face Matching)
 */
export const KIOSK_NOT_FOUND_CONFIG = {
  /** จำนวนรอบที่ต้องตรวจพบว่าไม่ตรงกับคนไข้ใดๆ (เมื่อภาพผ่านเกณฑ์คุณภาพและ Liveness) เพื่อยืนยันว่าไม่มีบัญชี (สแกนครั้งเดียวจบ) */
  NOT_FOUND_CONFIRM_ROUNDS: 1,
  /** หน้าต่างเวลาระหว่างรอบสแกนที่ยอมรับได้ (10,000 มิลลิวินาที หรือ 10 วินาที ครอบคลุมคูลดาวน์ 1.5s + นับถอยหลัง 3.0s + หน่วงเวลาเครือข่าย) */
  MAX_CONFIRM_WINDOW_MS: 10000,
  /** แฟล็ก Alias ย้อนหลังสำหรับ MAX_CONFIRM_WINDOW_MS */
  NOT_FOUND_WINDOW_MS: 10000,
  /** เกณฑ์คะแนนคุณภาพภาพต่ำสุด (ความคมชัด Laplacian Variance) ที่ยอมรับเพื่อตัดสินรอบ ป้องกันการนำภาพเบลอมาตัดสิน */
  QUALITY_MIN: 4.0,
  /** จำนวนรอบสูงสุดที่ยอมให้ภาพคุณภาพไม่ผ่านติดกัน ก่อนแจ้งเตือนให้เรียกเจ้าหน้าที่ (3 รอบ) */
  QUALITY_RETRY_MAX: 3,
  /** ระยะเวลาคืนสู่สถานะเริ่มต้นอัตโนมัติเมื่อไม่มีการกดปุ่มใดๆ ใน Modal (30,000 มิลลิวินาที หรือ 30 วินาที) */
  NOT_FOUND_IDLE_MS: 30000,
  /** แฟล็ก Alias ย้อนหลังสำหรับ NOT_FOUND_IDLE_MS */
  NOT_FOUND_IDLE_TIMEOUT_MS: 30000,
  /** ระยะเวลาคูลดาวน์ก่อนเริ่มสแกนใหม่ (1,500 มิลลิวินาที หรือ 1.5 วินาที) */
  RETRY_COOLDOWN_MS: 1500,
} as const;

export const KIOSK_EXPOSURE_CONTROL_CONFIG = {
  TARGET_MIN: 95,              // Minimum target face luminance (0-255 scale)
  TARGET_MAX: 145,             // Maximum target face luminance (0-255 scale)
  DEADBAND_MIN: 90,            // Deadband lower threshold
  DEADBAND_MAX: 150,           // Deadband upper threshold
  MIN_ADJUST_INTERVAL_MS: 700, // Interval between adjustments to prevent oscillation (ms)
  STEP_EV: 0.33,               // Exposure compensation step (1/3 stop)
  SAFE_MIN_EV: -1.5,           // Safe minimum hardware exposure compensation
  SAFE_MAX_EV: 1.5,            // Safe maximum hardware exposure compensation
  BURNOUT_THRESHOLD_LUM: 250,  // Luminance >= 250 considered blown-out/burned
  MAX_BURNOUT_RATIO: 0.25,     // Anti-burnout ceiling (25% max frame burnout)
} as const;

export const KIOSK_CAMERA_STORAGE_KEY = 'kiosk_preferred_camera_id';

/**
 * กรองอุปกรณ์กล้องที่ไม่ใช่กล้องอินฟราเรด (IR / Windows Hello) หรือกล้องเสมือน (OBS / Virtual)
 */
export function isUsableCamera(device: MediaDeviceInfo): boolean {
  const label = (device.label || '').toLowerCase();
  const excludedKeywords = ['ir', 'infrared', 'windows hello', 'virtual', 'obs', 'snap camera'];
  for (const kw of excludedKeywords) {
    if (label.includes(kw)) return false;
  }
  return true;
}

/**
 * เลือกกล้องที่เหมาะสมที่สุดตามลำดับความสำคัญ (Rule 1):
 * (ก) deviceId ที่เจ้าหน้าที่เคยเลือกไว้และยังเสียบอยู่
 * (ข) กล้อง USB / ภายนอก ที่ไม่ใช่ IR หรือกล้องเสมือน
 * (ค) กล้องตัวแรกที่ใช้ได้
 */
export function selectOptimalCamera(
  devices: MediaDeviceInfo[],
  savedDeviceId?: string | null
): MediaDeviceInfo | null {
  if (!devices || devices.length === 0) return null;

  // (ก) deviceId ที่บันทึกไว้
  if (savedDeviceId) {
    const saved = devices.find((d) => d.deviceId === savedDeviceId);
    if (saved) return saved;
  }

  // กรองกล้อง IR / Virtual
  const usableDevices = devices.filter(isUsableCamera);
  const candidates = usableDevices.length > 0 ? usableDevices : devices;

  // (ข) ค้นหากล้องภายนอก (ไม่ใช่กล้องในเครื่องโน้ตบุ๊ก)
  const externalDevice = candidates.find((d) => {
    const l = (d.label || '').toLowerCase();
    const isInternal = l.includes('integrated') || l.includes('internal') || l.includes('built-in');
    return !isInternal;
  });

  if (externalDevice) return externalDevice;

  // (ค) ตัวแรกที่ใช้ได้
  return candidates[0] || null;
}

export interface FaceImageQualityResult {
  brightness: number;
  sharpness: number;
  passed: boolean;
  reason?: string;
  statusMessageThai: string;
}

/**
 * คำนวณความสว่าง (Luminance) และความคมชัด (Laplacian Variance) ของพื้นที่ใบหน้า
 */
export function computeFaceImageQuality(
  canvas: HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number }
): FaceImageQualityResult {
  if (!canvas || !box || box.width < 10 || box.height < 10) {
    return { brightness: 0, sharpness: 0, passed: false, reason: 'INVALID_BOX', statusMessageThai: 'กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น' };
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { brightness: 120, sharpness: 20, passed: true, statusMessageThai: 'คุณภาพภาพพร้อมสำหรับการสแกน' };
  }

  try {
    const bx = Math.max(0, Math.floor(box.x));
    const by = Math.max(0, Math.floor(box.y));
    const bw = Math.min(canvas.width - bx, Math.floor(box.width));
    const bh = Math.min(canvas.height - by, Math.floor(box.height));

    if (bw < 10 || bh < 10) {
      return { brightness: 0, sharpness: 0, passed: false, reason: 'BOX_TOO_SMALL', statusMessageThai: 'กรุณาขยับเข้าใกล้กล้องอีกนิด' };
    }

    const imgData = ctx.getImageData(bx, by, bw, bh);
    const data = imgData.data;

    // 1. ความสว่างเฉลี่ย (Luminance)
    let sumLum = 0;
    const totalPixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sumLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const brightness = totalPixels > 0 ? sumLum / totalPixels : 120;

    // 2. ความคมชัด (Laplacian Variance)
    const sharpness = computeLaplacianVariance(data, bw, bh);

    if (brightness < KIOSK_CAMERA_STANDARDIZATION_CONFIG.MIN_BRIGHTNESS) {
      return { brightness, sharpness, passed: false, reason: 'TOO_DARK', statusMessageThai: 'แสงสว่างน้อยเกินไป กรุณาเพิ่มแสง' };
    }
    if (brightness > KIOSK_CAMERA_STANDARDIZATION_CONFIG.MAX_BRIGHTNESS) {
      return { brightness, sharpness, passed: false, reason: 'TOO_BRIGHT', statusMessageThai: 'แสงสว่างจ้าเกินไป กรุณาปรับแสง' };
    }
    if (sharpness < KIOSK_CAMERA_STANDARDIZATION_CONFIG.MIN_SHARPNESS) {
      return { brightness, sharpness, passed: false, reason: 'BLURRY', statusMessageThai: 'ภาพเบลอ กรุณายืนนิ่งๆ มองตรงที่กล้อง' };
    }

    return { brightness, sharpness, passed: true, statusMessageThai: 'คุณภาพภาพพร้อมสำหรับการสแกน' };
  } catch {
    return { brightness: 120, sharpness: 20, passed: true, statusMessageThai: 'คุณภาพภาพพร้อมสำหรับการสแกน' };
  }
}

export interface StandardizedCropOutput {
  cropCanvas: HTMLCanvasElement;
  scaledLandmarks?: FaceLandmarks;
  originalFaceHeightRatio: number;
  standardizedFaceHeightRatio: number;
}

/**
 * ปรับมาตรฐานสัดส่วนใบหน้า (ROI Crop) ให้มีขนาดและระยะภาพคงที่ (45% face height ratio)
 * เพื่อป้อนเข้าโมเดล ArcFace 112x112 โดยไม่บิดเบือนหรือเปลี่ยนภาพที่แสดงให้ผู้ใช้เห็น
 */
export function createStandardizedROICrop(
  sourceCanvas: HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number },
  landmarks?: FaceLandmarks
): StandardizedCropOutput {
  const fw = sourceCanvas.width;
  const fh = sourceCanvas.height;
  const originalFaceHeightRatio = box.height / (fh || 1);

  // คำนวณขนาดกรอบครอปเพื่อให้ความสูงใบหน้าคิดเป็น 45% ของกรอบครอปพอดี
  const targetRatio = KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_HEIGHT_RATIO_TARGET;
  const cropH = Math.max(1, Math.round(box.height / targetRatio));
  const cropW = cropH; // กรอบสี่เหลี่ยมจัตุรัส 1:1 สอดคล้องกับโมเดล 112x112

  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height * 0.48; // จุดกึ่งกลางศีรษะที่สมมาตร

  const cropX = Math.round(faceCenterX - cropW / 2);
  const cropY = Math.round(faceCenterY - cropH / 2);

  const cropCanvas = document.createElement('canvas');
  const targetSize = KIOSK_CAMERA_STANDARDIZATION_CONFIG.INPUT_SIZE; // 112x112
  cropCanvas.width = targetSize;
  cropCanvas.height = targetSize;

  const ctx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const sx = Math.max(0, cropX);
    const sy = Math.max(0, cropY);
    const sw = Math.min(fw - sx, cropW + Math.min(0, cropX));
    const sh = Math.min(fh - sy, cropH + Math.min(0, cropY));

    const scale = targetSize / cropW;
    const dx = Math.round((sx - cropX) * scale);
    const dy = Math.round((sy - cropY) * scale);
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
      ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  // ปรับพิกัดจุด Landmark ทั้ง 5 จุดให้สอดคล้องกับ cropCanvas
  let scaledLandmarks: FaceLandmarks | undefined;
  if (landmarks) {
    const scale = targetSize / cropW;
    const transformPt = (p: Point2D): Point2D => ({
      x: (p.x - cropX) * scale,
      y: (p.y - cropY) * scale,
    });
    scaledLandmarks = {
      leftEye: transformPt(landmarks.leftEye),
      rightEye: transformPt(landmarks.rightEye),
      noseTip: transformPt(landmarks.noseTip),
      leftMouth: transformPt(landmarks.leftMouth),
      rightMouth: transformPt(landmarks.rightMouth),
    };
  }

  return {
    cropCanvas,
    scaledLandmarks,
    originalFaceHeightRatio,
    standardizedFaceHeightRatio: targetRatio,
  };
}

export function checkKioskFaceQuality(
  detection: any,
  frameWidth: number = 640,
  frameHeight: number = 480,
  imageQuality?: FaceImageQualityResult
): { passed: boolean; reason?: string; statusMessageThai: string } {
  if (!detection || !detection.hasFace || !detection.box) {
    return { passed: false, reason: 'NO_FACE', statusMessageThai: 'กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น' };
  }

  const fw = frameWidth > 0 ? frameWidth : 640;
  const fh = frameHeight > 0 ? frameHeight : 480;
  const faceWidth = detection.box.width;
  const faceWidthRatio = faceWidth / fw;

  // 1. faceWidthRatio >= 0.08 (ขนาดใบหน้าไม่ต่ำกว่า 8% ของจอ เพื่อรองรับทั้งนั่งใกล้และไกล)
  if (faceWidthRatio < 0.08) {
    return { passed: false, reason: 'FACE_TOO_SMALL', statusMessageThai: 'กรุณาขยับเข้าใกล้กล้องอีกนิด' };
  }

  // 2. Frontal Pose: |yaw| <= 24° and |pitch| <= 23°
  const pose = detection.pose;
  if (pose) {
    if (Math.abs(pose.yaw) > 24) {
      return { passed: false, reason: 'HEAD_TURNED', statusMessageThai: 'กรุณามองตรงที่กล้อง' };
    }
    if (Math.abs(pose.pitch) > 23) {
      return { passed: false, reason: 'HEAD_TILTED', statusMessageThai: 'กรุณามองตรงที่กล้อง' };
    }
  }

  // 3. Face bounding box fully inside frame boundaries (no edge clipping)
  const minX = detection.box.x;
  const minY = detection.box.y;
  const maxX = detection.box.x + detection.box.width;
  const maxY = detection.box.y + detection.box.height;
  if (minX < 0 || minY < 0 || maxX > fw || maxY > fh) {
    return { passed: false, reason: 'FACE_CLIPPED', statusMessageThai: 'กรุณาจัดใบหน้าให้อยู่ในกรอบภาพ' };
  }

  if (imageQuality && !imageQuality.passed) {
    return { passed: false, reason: imageQuality.reason, statusMessageThai: imageQuality.statusMessageThai };
  }

  return { passed: true, statusMessageThai: 'ใบหน้าพร้อมสำหรับการสแกน' };
}

export interface FaceStabilityConfig {
  minDurationMs?: number; // default 500ms
  maxDisplacementRatio?: number; // default 0.035 (3.5% screen distance)
  minWidthRatio?: number; // default 0.08 (8% screen width)
  maxWidthRatio?: number; // default 0.65 (65% screen width)
  maxYaw?: number; // default 22°
  maxPitch?: number; // default 20°
}

export interface StabilityCheckResult {
  isStable: boolean;
  reason?: string;
  durationMs: number;
  displacementRatio: number;
  statusMessageThai: string;
}

/**
 * Face Stability Detector (Pose & Positional Stability Gate)
 * Detects when a patient sits still with a frontal face for 500ms without requiring physical motion or gestures.
 */
export class FaceStabilityDetector {
  private config: Required<FaceStabilityConfig>;
  private history: Array<{
    timestamp: number;
    centerX: number;
    centerY: number;
    boxWidth: number;
    yaw: number;
    pitch: number;
  }> = [];
  private stableStartTime: number | null = null;

  constructor(config?: FaceStabilityConfig) {
    this.config = {
      minDurationMs: config?.minDurationMs ?? 600,
      maxDisplacementRatio: config?.maxDisplacementRatio ?? 0.045,
      minWidthRatio: config?.minWidthRatio ?? 0.08,
      maxWidthRatio: config?.maxWidthRatio ?? 0.65,
      maxYaw: config?.maxYaw ?? 24,
      maxPitch: config?.maxPitch ?? 23,
    };
  }

  public reset(): void {
    this.history = [];
    this.stableStartTime = null;
  }

  public update(
    detection: any,
    frameWidth: number = 640,
    frameHeight: number = 480,
    now: number = Date.now()
  ): StabilityCheckResult {
    const fw = frameWidth > 0 ? frameWidth : 640;
    const fh = frameHeight > 0 ? frameHeight : 480;

    if (!detection || !detection.hasFace || !detection.box) {
      this.reset();
      return {
        isStable: false,
        reason: 'NO_FACE',
        durationMs: 0,
        displacementRatio: 1,
        statusMessageThai: 'กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น',
      };
    }

    if (detection.multipleFaces || (typeof detection.faceCount === 'number' && detection.faceCount > 1)) {
      this.reset();
      return {
        isStable: false,
        reason: 'MULTIPLE_FACES',
        durationMs: 0,
        displacementRatio: 1,
        statusMessageThai: '⚠️ กรุณาให้ผู้ใช้ยืนหน้ากล้องทีละคน',
      };
    }

    const { box, pose } = detection;
    const widthRatio = box.width / fw;

    // 1. Width ratio check: between 8% and 65% of screen width
    if (widthRatio < this.config.minWidthRatio) {
      this.reset();
      return {
        isStable: false,
        reason: 'FACE_TOO_FAR',
        durationMs: 0,
        displacementRatio: 1,
        statusMessageThai: 'กรุณาขยับเข้าใกล้กล้องอีกนิด',
      };
    }

    if (widthRatio > this.config.maxWidthRatio) {
      this.reset();
      return {
        isStable: false,
        reason: 'FACE_TOO_CLOSE',
        durationMs: 0,
        displacementRatio: 1,
        statusMessageThai: 'กรุณาถอยห่างจากกล้องเล็กน้อย',
      };
    }

    // 2. Frontal orientation: Head rotation |yaw| <= 22° and |pitch| <= 20°
    const yaw = pose ? Math.abs(pose.yaw) : 0;
    const pitch = pose ? Math.abs(pose.pitch) : 0;
    if (yaw > this.config.maxYaw || pitch > this.config.maxPitch) {
      this.reset();
      return {
        isStable: false,
        reason: 'NOT_FRONTAL',
        durationMs: 0,
        displacementRatio: 1,
        statusMessageThai: 'กรุณามองตรงที่กล้อง',
      };
    }

    // 3. Spatial stability: Bounding box center moves less than maxDisplacementRatio screen distance
    const ptX = box.x + box.width / 2;
    const ptY = box.y + box.height / 2;

    const normPtX = ptX / fw;
    const normPtY = ptY / fh;

    // Keep history within last 1200ms
    this.history = this.history.filter((h) => now - h.timestamp <= 1200);
    this.history.push({
      timestamp: now,
      centerX: normPtX,
      centerY: normPtY,
      boxWidth: widthRatio,
      yaw,
      pitch,
    });

    const windowFrames = this.history.filter((h) => now - h.timestamp <= this.config.minDurationMs);
    if (windowFrames.length < 3) {
      if (this.stableStartTime === null) this.stableStartTime = now;
      return {
        isStable: false,
        reason: 'GATHERING_FRAMES',
        durationMs: now - this.stableStartTime,
        displacementRatio: 0,
        statusMessageThai: 'กรุณามองตรงและอยู่นิ่งๆ...',
      };
    }

    // Measure maximum drift from initial frame in window
    let maxDisp = 0;
    const anchor = windowFrames[0];
    for (let i = 1; i < windowFrames.length; i++) {
      const dx = windowFrames[i].centerX - anchor.centerX;
      const dy = windowFrames[i].centerY - anchor.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDisp) maxDisp = dist;
    }

    // If movement exceeds maxDisplacementRatio (3.5%), reset stillness timer
    if (maxDisp > this.config.maxDisplacementRatio) {
      this.stableStartTime = now;
      return {
        isStable: false,
        reason: 'MOVING',
        durationMs: 0,
        displacementRatio: maxDisp,
        statusMessageThai: 'กรุณายืนนิ่งๆ มองตรงที่กล้อง',
      };
    }

    if (this.stableStartTime === null) {
      this.stableStartTime = windowFrames[0].timestamp;
    }

    const duration = now - this.stableStartTime;
    const isStable = duration >= this.config.minDurationMs;

    return {
      isStable,
      durationMs: duration,
      displacementRatio: maxDisp,
      statusMessageThai: isStable ? 'ใบหน้านิ่งพร้อมสแกน' : 'กำลังตรวจสอบความนิ่ง...',
    };
  }
}

export function isTargetContinuityMatch(
  currentBox: { x: number; y: number; width: number; height: number },
  locked: LockedFaceTarget,
  frameWidth: number = 640,
  frameHeight: number = 480
): boolean {
  const fw = frameWidth > 0 ? frameWidth : 640;
  const fh = frameHeight > 0 ? frameHeight : 480;

  const currentCenterX = currentBox.x + currentBox.width / 2;
  const currentCenterY = currentBox.y + currentBox.height / 2;

  const dx = Math.abs(currentCenterX - locked.centerX) / fw;
  const dy = Math.abs(currentCenterY - locked.centerY) / fh;
  const centerShift = Math.sqrt(dx * dx + dy * dy);

  const sizeChange = Math.abs(currentBox.width - locked.box.width) / (locked.box.width || 1);

  if (centerShift <= KIOSK_CAMERA_STANDARDIZATION_CONFIG.MAX_CENTER_SHIFT_RATIO && sizeChange <= KIOSK_CAMERA_STANDARDIZATION_CONFIG.MAX_SIZE_CHANGE_RATIO) {
    return true;
  }

  // Fallback check: 2D Bounding Box IoU >= 0.40
  const x1 = Math.max(currentBox.x, locked.box.x);
  const y1 = Math.max(currentBox.y, locked.box.y);
  const x2 = Math.min(currentBox.x + currentBox.width, locked.box.x + locked.box.width);
  const y2 = Math.min(currentBox.y + currentBox.height, locked.box.y + locked.box.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  const currentArea = currentBox.width * currentBox.height;
  const lockedArea = locked.box.width * locked.box.height;
  const unionArea = currentArea + lockedArea - interArea;
  const iou = unionArea > 0 ? interArea / unionArea : 0;

  return iou >= 0.40;
}

const CornerOrnament: React.FC<{ position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }> = ({ position }) => {
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4 rotate-90',
    'bottom-left': 'bottom-4 left-4 -rotate-90',
    'bottom-right': 'bottom-4 right-4 rotate-180',
  }[position];

  return (
    <svg
      className={`absolute ${positionClasses} w-7 h-7 pointer-events-none opacity-30 text-[#0284C7]`}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M2 26V8C2 4.68629 4.68629 2 8 2H26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="5" cy="5" r="2" fill="currentColor" />
    </svg>
  );
};

/**
 * Safely extract float embedding array from frame object or vector
 */
export function extractVector(frame: any): number[] | null {
  if (!frame) return null;
  if (Array.isArray(frame)) return frame;
  if (Array.isArray(frame.embedding)) return frame.embedding;
  if (Array.isArray(frame.descriptor)) return frame.descriptor;
  if (Array.isArray(frame.vector)) return frame.vector;
  return null;
}

export interface NoMatchRoundTracker {
  count: number;
  firstTimestamp: number;
}

export interface NoMatchRoundEvaluation {
  nextTracker: NoMatchRoundTracker;
  confirmedNotFound: boolean;
  elapsedMs: number;
}

/**
 * Evaluate consecutive NO_MATCH confirmation rounds within MAX_CONFIRM_WINDOW_MS.
 * Records firstTimestamp when Round 1 completes with NO_MATCH.
 */
export function evaluateNoMatchRound(
  tracker: NoMatchRoundTracker,
  now: number,
  config: { MAX_CONFIRM_WINDOW_MS: number; NOT_FOUND_CONFIRM_ROUNDS: number } = KIOSK_NOT_FOUND_CONFIG
): NoMatchRoundEvaluation {
  const windowMs = config.MAX_CONFIRM_WINDOW_MS;
  const withinWindow = tracker.count > 0 && tracker.firstTimestamp > 0 && now - tracker.firstTimestamp <= windowMs;
  const nextTracker: NoMatchRoundTracker = withinWindow
    ? { count: tracker.count + 1, firstTimestamp: tracker.firstTimestamp }
    : { count: 1, firstTimestamp: now };

  return {
    nextTracker,
    confirmedNotFound: nextTracker.count >= config.NOT_FOUND_CONFIRM_ROUNDS,
    elapsedMs: withinWindow ? now - tracker.firstTimestamp : 0,
  };
}

/**
 * Validate captured best-shot frames for minimum sharpness and frontal pose.
 * Intentionally does NOT allow liveness state to bypass blurry or angled frames.
 */
export function isBestShotFrameQualityValid(
  bestShotFrames: ReadonlyArray<{
    sharpness: number;
    detection?: { pose?: { yaw: number; pitch: number } };
  }>,
  qualityMin: number = KIOSK_NOT_FOUND_CONFIG.QUALITY_MIN
): boolean {
  return bestShotFrames.some(
    (f) =>
      f.sharpness >= qualityMin &&
      (!f.detection?.pose || (Math.abs(f.detection.pose.yaw) <= 20 && Math.abs(f.detection.pose.pitch) <= 20))
  );
}

/**
 * Presence-loop readiness gate: requires BOTH frontal pose and sustained stillness.
 */
export function evaluatePresenceScanReadiness(params: {
  isPoseFrontal: boolean;
  stabilityIsStable: boolean;
  consecutiveSteadyFrames: number;
  stabilityReason?: string;
  livenessState?: string;
}): boolean {
  if (!params.isPoseFrontal) return false;
  if (params.livenessState === 'spoof_blocked') return false;
  if (params.stabilityReason === 'MOVING') return false;
  return params.stabilityIsStable || params.consecutiveSteadyFrames >= 3;
}

/**
 * Explicitly zeroes ephemeral probe embeddings, sample arrays, and temporary canvas pixel buffers.
 */
export function wipeBiometricBuffers(options: {
  probeVector?: number[] | null;
  samples?: Array<{ vector?: number[] }>;
  bestShotFrames?: Array<{ vector?: number[]; snapshotBase64?: string }>;
  canvas?: HTMLCanvasElement | null;
}): void {
  if (Array.isArray(options.probeVector)) {
    options.probeVector.fill(0);
  }
  if (Array.isArray(options.samples)) {
    for (const sample of options.samples) {
      if (Array.isArray(sample.vector)) {
        sample.vector.fill(0);
      }
    }
    options.samples.length = 0;
  }
  if (Array.isArray(options.bestShotFrames)) {
    for (const frame of options.bestShotFrames) {
      if (Array.isArray(frame.vector)) {
        frame.vector.fill(0);
      }
      frame.snapshotBase64 = '';
    }
    options.bestShotFrames.length = 0;
  }
  if (options.canvas) {
    try {
      const ctx = options.canvas.getContext?.('2d');
      if (ctx && options.canvas.width > 0 && options.canvas.height > 0) {
        ctx.clearRect(0, 0, options.canvas.width, options.canvas.height);
      }
      options.canvas.width = 0;
      options.canvas.height = 0;
    } catch {
      // safe cleanup in non-DOM environments
    }
  }
}

/**
 * Determine whether staff/debug diagnostic controls (Calibration HUD, 3D/EAR telemetry) may be shown.
 */
export function resolveStaffOrDebugMode(params?: {
  search?: string;
  hash?: string;
  authToken?: string | null;
  userRole?: string | null;
}): boolean {
  const search = params?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const hash = params?.hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  if (
    search.includes('calibration=true') ||
    search.includes('debug=1') ||
    hash.includes('calibration=true') ||
    hash.includes('debug=1')
  ) {
    return true;
  }

  let token = params?.authToken;
  let role = params?.userRole;
  if (token === undefined) {
    try {
      token = defaultApiClient.getAuthToken?.() ?? null;
    } catch {
      token = null;
    }
  }
  if (role === undefined) {
    try {
      role = (defaultApiClient.getUserProfile?.()?.role as string | undefined) ?? null;
    } catch {
      role = null;
    }
  }

  if (!token || !role) return false;
  const normalizedRole = String(role).toLowerCase();
  return ['admin', 'super_admin', 'director', 'pt', 'therapist', 'staff'].includes(normalizedRole);
}

/**
 * Check whether manual staff-call action is currently allowed (not in progress or within 30s local cooldown).
 */
export function canSubmitStaffCall(
  lastCallTimestamp: number,
  now: number,
  isCalling: boolean,
  cooldownMs: number = 30000
): boolean {
  if (isCalling) return false;
  if (lastCallTimestamp > 0 && now - lastCallTimestamp < cooldownMs) return false;
  return true;
}

/**
 * Render button text for Call Staff button, preserving sent feedback during cooldown.
 */
export function formatStaffCallButtonText(params: {
  lang: string;
  isCalling: boolean;
  cooldownSec: number;
  defaultLabel: string;
}): string {
  if (params.isCalling) {
    return params.lang === 'zh-CN'
      ? '正在呼叫工作人员...'
      : params.lang === 'en-US'
      ? 'Calling staff...'
      : 'กำลังส่งคำเรียกเจ้าหน้าที่...';
  }
  if (params.cooldownSec > 0) {
    return params.lang === 'zh-CN'
      ? `✓ 已呼叫工作人员 (${params.cooldownSec}s)`
      : params.lang === 'en-US'
      ? `✓ Staff Notified (${params.cooldownSec}s)`
      : `✓ ส่งคำเรียกแล้ว โปรดรอ (${params.cooldownSec}s)`;
  }
  return params.defaultLabel;
}

export interface KioskAccountNotFoundModalProps {
  isOpen: boolean;
  lang: string;
  t: (key: any) => string;
  notFoundRemainingSec: number;
  isCallingStaff: boolean;
  staffCallCooldownSec: number;
  isRetryCooldownActive: boolean;
  onStaffRegister: () => void;
  onCallStaff: () => void;
  onRetryScan: () => void;
}

/**
 * Controlled centered modal shown when Account Not Found is confirmed.
 * Locked against backdrop clicks and Escape key; can only exit via the action buttons or 30s idle auto-reset.
 */
export const KioskAccountNotFoundModal: React.FC<KioskAccountNotFoundModalProps> = ({
  isOpen,
  lang,
  t,
  notFoundRemainingSec,
  isCallingStaff,
  staffCallCooldownSec,
  isRetryCooldownActive,
  onStaffRegister,
  onCallStaff,
  onRetryScan,
}) => {
  if (!isOpen) return null;
  const callStaffDisabled = isCallingStaff || staffCallCooldownSec > 0;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="not-found-dialog-title"
      aria-describedby="not-found-dialog-desc"
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 text-center animate-scale-up"
      >
        <div className="w-16 h-16 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto mb-3 shadow-inner">
          <UserCheck className="w-8 h-8 text-teal-600" />
        </div>
        <h3 id="not-found-dialog-title" className="text-xl font-bold text-slate-900">
          {t('kiosk_account_not_found_title')}
        </h3>
        <p id="not-found-dialog-desc" className="text-sm text-slate-600 mt-2 leading-relaxed">
          {t('kiosk_account_not_found_desc')}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            id="kiosk-staff-register-btn"
            data-testid="kiosk-staff-register-btn"
            onClick={onStaffRegister}
            className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-base shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
          >
            <UserCheck className="w-5 h-5 text-white shrink-0" />
            <span>{t('kiosk_btn_staff_register')}</span>
          </button>

          <button
            type="button"
            id="kiosk-call-staff-btn"
            data-testid="kiosk-call-staff-btn"
            disabled={callStaffDisabled}
            onClick={onCallStaff}
            className={`w-full py-3 px-4 rounded-2xl font-bold text-sm shadow-xs flex items-center justify-center gap-2 transition active:scale-[0.98] ${
              callStaffDisabled
                ? 'bg-amber-100 text-amber-900 border border-amber-300 opacity-80 cursor-not-allowed'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 shadow-amber-600/10 cursor-pointer'
            }`}
          >
            <Bell className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {formatStaffCallButtonText({
                lang,
                isCalling: isCallingStaff,
                cooldownSec: staffCallCooldownSec,
                defaultLabel: t('kiosk_btn_call_staff'),
              })}
            </span>
          </button>

          <button
            type="button"
            id="kiosk-retry-scan-btn"
            data-testid="kiosk-retry-scan-btn"
            disabled={isRetryCooldownActive}
            onClick={onRetryScan}
            className={`w-full mt-1 py-3 px-4 rounded-xl border font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
              isRetryCooldownActive
                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-800 cursor-pointer'
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRetryCooldownActive ? 'animate-spin text-slate-400' : 'text-slate-600'} shrink-0`}
            />
            <span>{t('kiosk_btn_try_again')}</span>
          </button>

          <div className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1.5 select-none">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {lang === 'zh-CN'
                ? `${notFoundRemainingSec} 秒后自动返回初始页面`
                : lang === 'en-US'
                ? `Auto-resets to home in ${notFoundRemainingSec}s`
                : `ระบบจะคืนสู่หน้าเริ่มต้นอัตโนมัติใน ${notFoundRemainingSec} วินาที`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface KioskPinLoginModalProps {
  isOpen: boolean;
  lang: string;
  enteredPin: string;
  pinError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onPinKey: (digit: string) => void;
  onClearPin: () => void;
  onBackspacePin: () => void;
}

/**
 * Isolated PIN login modal displaying validation errors inline instead of triggering Account Not Found modal.
 */
export const KioskPinLoginModal: React.FC<KioskPinLoginModalProps> = ({
  isOpen,
  lang,
  enteredPin,
  pinError,
  isSubmitting,
  onClose,
  onPinKey,
  onClearPin,
  onBackspacePin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white border border-emerald-500/30 p-6 text-center shadow-2xl relative animate-scale-up">
        <button
          type="button"
          data-testid="kiosk-pin-close-btn"
          aria-label="Close PIN modal"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
          🔑
        </div>
        <h3 className="text-lg font-bold text-slate-800">
          {lang === 'zh-CN' ? 'PIN码身份验证' : lang === 'en-US' ? 'Verify Identity with PIN' : 'ยืนยันตัวตนด้วยรหัส PIN'}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {lang === 'zh-CN'
            ? '请输入就诊患者的4位PIN码以开始训练'
            : lang === 'en-US'
            ? 'Enter 4-digit patient PIN to begin'
            : 'กรอกรหัส PIN 4 หลักประจำตัวผู้ป่วยเพื่อเริ่มฝึก'}
        </p>

        {pinError && (
          <div
            data-testid="kiosk-pin-error"
            role="alert"
            className="mt-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold"
          >
            {pinError}
          </div>
        )}

        <div className="flex justify-center gap-3 my-5">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                idx < enteredPin.length
                  ? 'bg-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/50 scale-110'
                  : 'border-slate-300 bg-transparent'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={isSubmitting}
              onClick={() => onPinKey(digit)}
              className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold text-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer disabled:opacity-60"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClearPin}
            className="h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-200 active:scale-95 transition cursor-pointer disabled:opacity-60"
          >
            {lang === 'zh-CN' ? '清除' : lang === 'en-US' ? 'Clear' : 'ล้าง'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onPinKey('0')}
            className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold text-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer disabled:opacity-60"
          >
            0
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onBackspacePin}
            className="h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-200 active:scale-95 transition cursor-pointer disabled:opacity-60"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
};

export const SmartLoginView: React.FC<SmartLoginViewProps> = ({
  onLoginSuccess,
  onNavigateToEnroll: _onNavigateToEnroll,
  customDetector,
  onOpenStaffLoginModal,
  onOpenNewPatientModal,
  onStaffAssistedRegister,
  isPaused = false,
}) => {
  const { t, lang } = useClinicalI18n();
  const tRef = useRef(t);
  useLayoutEffect(() => {
    tRef.current = t;
  }, [t]);
  const [presenceDetected, setPresenceDetected] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น');
  const [unrecognizedAlert, setUnrecognizedAlert] = useState<string | null>(null);
  const [isAccountNotFound, setIsAccountNotFound] = useState<boolean>(false);
  const isAccountNotFoundRef = useRef<boolean>(false);
  useEffect(() => {
    isAccountNotFoundRef.current = isAccountNotFound;
  }, [isAccountNotFound]);
  const [notFoundRemainingSec, setNotFoundRemainingSec] = useState<number>(30);
  const [isRetryCooldownActive, setIsRetryCooldownActive] = useState<boolean>(false);
  const consecutiveUnmatchedRoundsRef = useRef<{ count: number; firstTimestamp: number }>({ count: 0, firstTimestamp: 0 });
  const consecutiveQualityFailuresRef = useRef<number>(0);
  const [matchedPatient, setMatchedPatient] = useState<PatientRecordFile | null>(null);
  const [identityAnchor, setIdentityAnchor] = useState<SpatialIdentityAnchor | null>(null);
  const [similarityInfo, setSimilarityInfo] = useState<{ percent: number; distance: number } | null>(null);
  const [livenessResult, setLivenessResult] = useState<LivenessVerificationResult | null>(null);
  const [cameraRotation, setCameraRotation] = useState<0 | 90 | 180 | 270>(0);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [userDisabledCamera, setUserDisabledCamera] = useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  // 3-Second Countdown & Realtime Aggregator states
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [realtimeScore, setRealtimeScore] = useState<number | null>(null);
  const [authRevision, setAuthRevision] = useState<number>(0);
  const isStaffOrDebugMode = React.useMemo(
    () => resolveStaffOrDebugMode(),
    // Re-evaluate when auth state updates via staff login/logout events
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authRevision, isPaused]
  );
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const q = window.location.search;
      return q.includes('calibration=true') || q.includes('debug=1');
    }
    return false;
  });
  const [calibrationStats, setCalibrationStats] = useState<{
    currentCos: number;
    currentDist: number;
    currentPercent: number;
    medianPercent: number;
    minPercent: number;
    maxPercent: number;
    samplesCount: number;
    depthScore: number;
    ear: number;
    top1?: { name: string; hn: string; score: number };
    top2?: { name: string; hn: string; score: number };
  } | null>(null);

  // Multi-camera & device management
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    try {
      return localStorage.getItem(KIOSK_CAMERA_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const selectedCameraIdRef = useRef<string>(selectedCameraId);
  useEffect(() => {
    selectedCameraIdRef.current = selectedCameraId;
  }, [selectedCameraId]);
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('กล้องเริ่มต้น');
  const [activeSettings, setActiveSettings] = useState<MediaTrackSettings | null>(null);
  const [activeCapabilities, setActiveCapabilities] = useState<any>(null);
  const [cameraDisconnectedError, setCameraDisconnectedError] = useState<string | null>(null);

  const [currentTelemetry, setCurrentTelemetry] = useState<{
    faceHeightRatio: number;
    sharpness: number;
    brightness: number;
    zoomLevel?: number;
  }>({
    faceHeightRatio: 0,
    sharpness: 0,
    brightness: 0,
  });

  // Rate Limiting (5 failures/minute -> 30s cooldown)
  const [rateLimitCooldownSec, setRateLimitCooldownSec] = useState<number>(0);
  const [isAutoScanCoolingDown, setIsAutoScanCoolingDown] = useState<boolean>(false);
  const isCoolingDownRef = useRef<boolean>(false);
  const failedScanTimestampsRef = useRef<number[]>([]);

  // Periodic Sampling Refs
  const sampleFramesRef = useRef<BiometricSample[]>([]);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownStartTimeRef = useRef<number>(0);
  const isCountingDownRef = useRef<boolean>(false);
  const lastFaceSeenDuringCountdownRef = useRef<number>(0);
  const lastInferenceTickRef = useRef<number>(0);
  const cachedPatientsRef = useRef<CachedPatientBiometric[]>([]);
  const lockedTargetRef = useRef<LockedFaceTarget | null>(null);
  const isDetectingRef = useRef<boolean>(false);
  const startCountdownRef = useRef<() => void>(() => {});
  const cancelCountdownRef = useRef<(reason?: string) => void>(() => {});
  const finishCountdownAndVerifyRef = useRef<() => Promise<void>>(async () => {});
  const onLoginSuccessRef = useRef(onLoginSuccess);
  useLayoutEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess;
  }, [onLoginSuccess]);
  // Latest language/translator for long-lived callbacks (camera start, face detection loop)
  const langRef = useRef(lang);
  useLayoutEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const fastLivenessVerifierRef = useRef<FastLoginLivenessVerifier>(new FastLoginLivenessVerifier(350));
  const stabilityDetectorRef = useRef<FaceStabilityDetector>(
    new FaceStabilityDetector({ minDurationMs: 600, maxDisplacementRatio: 0.045, minWidthRatio: 0.08, maxWidthRatio: 0.65, maxYaw: 24, maxPitch: 23 })
  );
  const [floatingToast, setFloatingToast] = useState<string | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastProbeVectorRef = useRef<number[] | null>(null);
  // Ephemeral in-memory biometrics buffer for staff-assisted patient onboarding (Zero premature storage)
  const pendingRegistrationBiometricsRef = useRef<PendingRegistrationBiometrics | null>(null);
  const scanFailureCountRef = useRef<number>(0);
  const consecutiveSteadyFramesRef = useRef<number>(0);
  const lowSimFramesRef = useRef<number>(0);
  const isProcessingScanRef = useRef<boolean>(false);

  // Modals inside Kiosk Screen
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [isCallingStaff, setIsCallingStaff] = useState<boolean>(false);
  const [staffCallCooldownSec, setStaffCallCooldownSec] = useState<number>(0);
  const lastManualCallStaffTimeRef = useRef<number>(0);

  // Scan cancellation, live pause synchronization & tracked timers
  const isMountedRef = useRef<boolean>(true);
  const scanGenerationRef = useRef<number>(0);
  const isCameraStartingRef = useRef<boolean>(false);
  const isCameraStartedRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startCameraRef = useRef<(deviceIdToUse?: string) => Promise<void>>(async () => {});
  const wasScanningPausedRef = useRef<boolean>(false);

  // Effective pause state (paused while modal/alert/popup is active)
  const isScanningPaused = Boolean(
    isPaused || isAboutModalOpen || userDisabledCamera || isAccountNotFound || unrecognizedAlert
  );
  const isScanningPausedRef = useRef<boolean>(isScanningPaused);
  useLayoutEffect(() => {
    isScanningPausedRef.current = isScanningPaused;
  }, [isScanningPaused]);

  const clearScanTimers = useCallback((includeTransition: boolean = false) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (includeTransition && transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const wipeTemporaryBiometricBuffers = useCallback((preserveLastProbe: boolean = false) => {
    wipeBiometricBuffers({
      probeVector: preserveLastProbe ? undefined : lastProbeVectorRef.current,
      samples: sampleFramesRef.current,
      canvas: detectCanvasRef.current,
    });
    if (!preserveLastProbe) {
      lastProbeVectorRef.current = null;
    }
    pendingRegistrationBiometricsRef.current = null;
    lockedTargetRef.current = null;
  }, []);

  const triggerRetryCooldown = useCallback(
    (
      message?: string,
      options?: { showToast?: boolean; toastDurationMs?: number; isModalRetry?: boolean }
    ) => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }

      isProcessingScanRef.current = false;
      setIsScanning(false);
      isCountingDownRef.current = false;
      setCountdownValue(null);
      setRealtimeScore(null);
      consecutiveSteadyFramesRef.current = 0;
      stabilityDetectorRef.current.reset();
      isCoolingDownRef.current = true;
      setIsAutoScanCoolingDown(true);
      if (options?.isModalRetry) {
        setIsRetryCooldownActive(true);
      }

      if (message) {
        setStatusText(message);
        if (options?.showToast) {
          setFloatingToast(message);
          if (options.toastDurationMs) {
            const genAtToast = scanGenerationRef.current;
            toastTimerRef.current = setTimeout(() => {
              toastTimerRef.current = null;
              if (isMountedRef.current && scanGenerationRef.current === genAtToast) {
                setFloatingToast(null);
              }
            }, options.toastDurationMs);
          }
        }
      }

      const genAtCooldown = scanGenerationRef.current;
      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = null;
        if (!isMountedRef.current || scanGenerationRef.current !== genAtCooldown || isScanningPausedRef.current) {
          return;
        }
        isCoolingDownRef.current = false;
        setIsAutoScanCoolingDown(false);
        setIsRetryCooldownActive(false);
        setFloatingToast(null);
        stabilityDetectorRef.current.reset();
        fastLivenessVerifierRef.current.start();
        if (options?.isModalRetry) {
          const curLang = langRef.current;
          setStatusText(
            curLang === 'zh-CN'
              ? '请站在摄像头前开始扫描'
              : curLang === 'en-US'
              ? 'Please stand in front of camera to begin'
              : 'กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น'
          );
        }
      }, KIOSK_NOT_FOUND_CONFIG.RETRY_COOLDOWN_MS);
    },
    []
  );

  // Sync scan cancellation & automatic camera resume when returning from PIN / Staff modals
  useEffect(() => {
    if (isScanningPaused) {
      wasScanningPausedRef.current = true;
      scanGenerationRef.current += 1;
      clearScanTimers(false);
      isProcessingScanRef.current = false;
      isCountingDownRef.current = false;
      isDetectingRef.current = false;
      setIsScanning(false);
      setCountdownValue(null);
      setRealtimeScore(null);
      return;
    }

    if (wasScanningPausedRef.current) {
      wasScanningPausedRef.current = false;
      if (!userDisabledCamera && !matchedPatient) {
        if (!isCameraStartedRef.current && !isCameraStartingRef.current) {
          startCameraRef.current?.();
        }
        if (!isCoolingDownRef.current) {
          triggerRetryCooldown(undefined, { isModalRetry: false });
        }
      }
    }
  }, [isScanningPaused, userDisabledCamera, matchedPatient, clearScanTimers, triggerRetryCooldown]);

  // Call Staff 30-second UI cooldown countdown timer
  useEffect(() => {
    if (staffCallCooldownSec <= 0) return;
    const timer = setInterval(() => {
      setStaffCallCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [staffCallCooldownSec]);

  // Complete Not Found 30s Idle Reset cleanly (zero side effects inside React state updaters + 1.5s cooldown)
  const handleNotFoundAutoReset = useCallback(() => {
    scanGenerationRef.current += 1;
    clearScanTimers(false);
    wipeTemporaryBiometricBuffers(false);
    consecutiveUnmatchedRoundsRef.current = { count: 0, firstTimestamp: 0 };
    stabilityDetectorRef.current.reset();
    setIsAccountNotFound(false);
    setUnrecognizedAlert(null);

    if (!userDisabledCamera && !isCameraStartedRef.current && !isCameraStartingRef.current) {
      startCameraRef.current?.();
    }

    const prepMsg =
      langRef.current === 'zh-CN'
        ? '正在准备摄像头...'
        : langRef.current === 'en-US'
        ? 'Preparing camera...'
        : 'กำลังเตรียมความพร้อมของกล้อง...';
    triggerRetryCooldown(prepMsg, { isModalRetry: true });
  }, [clearScanTimers, wipeTemporaryBiometricBuffers, userDisabledCamera, triggerRetryCooldown]);

  // 30-Second Auto-Reset Timer for "Account Not Found" (Dedicated modal auto-closes to idle)
  useEffect(() => {
    if (!isAccountNotFound && !unrecognizedAlert) {
      setNotFoundRemainingSec(Math.round(KIOSK_NOT_FOUND_CONFIG.NOT_FOUND_IDLE_MS / 1000));
      return;
    }

    const totalSec = Math.round(KIOSK_NOT_FOUND_CONFIG.NOT_FOUND_IDLE_MS / 1000);
    setNotFoundRemainingSec(totalSec);
    const startedAt = Date.now();
    let hasTriggeredReset = false;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, Math.ceil((KIOSK_NOT_FOUND_CONFIG.NOT_FOUND_IDLE_MS - elapsed) / 1000));
      setNotFoundRemainingSec(remaining);
      if (elapsed >= KIOSK_NOT_FOUND_CONFIG.NOT_FOUND_IDLE_MS && !hasTriggeredReset) {
        hasTriggeredReset = true;
        clearInterval(timer);
        handleNotFoundAutoReset();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [isAccountNotFound, unrecognizedAlert, handleNotFoundAutoReset]);

  // Clean retry scan handler with 1.5s cooldown and state purge for Account Not Found
  const handleNotFoundRetryScan = useCallback(() => {
    if (isRetryCooldownActive) return;
    scanGenerationRef.current += 1;
    clearScanTimers(false);
    setIsAccountNotFound(false);
    setUnrecognizedAlert(null);
    wipeTemporaryBiometricBuffers(false);
    consecutiveUnmatchedRoundsRef.current = { count: 0, firstTimestamp: 0 };

    if (!userDisabledCamera && !isCameraStartedRef.current && !isCameraStartingRef.current) {
      startCameraRef.current?.();
    }

    const prepMsg =
      langRef.current === 'zh-CN'
        ? '正在准备摄像头...'
        : langRef.current === 'en-US'
        ? 'Preparing camera...'
        : 'กำลังเตรียมความพร้อมของกล้อง...';
    triggerRetryCooldown(prepMsg, { isModalRetry: true });
  }, [isRetryCooldownActive, clearScanTimers, wipeTemporaryBiometricBuffers, userDisabledCamera, triggerRetryCooldown]);

  // Lock Escape key while Account Not Found modal is active (can only exit via 4 buttons or 30s timeout)
  useEffect(() => {
    if (!isAccountNotFound && !unrecognizedAlert) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAccountNotFound, unrecognizedAlert]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Touchless "Raise-Both-Hands" Readiness Confirmation Hook (Reuses active video stream)
  const {
    status: gestureStatus,
    thaiMessage: gestureMessage,
    showAccessibilityFallbackHint,
    handleManualConfirm,
    resetConfirmation,
    topProgressBarRef,
    bottomProgressBarRef,
    spinnerPathRef,
    spinnerContainerRef,
    buttonTextRef,
  } = useRaiseBothHandsConfirm({
    videoRef,
    isOpen: Boolean(matchedPatient),
    anchor: identityAnchor,
    onConfirm: () => {
      if (matchedPatient) {
        setIsTransitioning(true);
        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = setTimeout(() => {
          transitionTimerRef.current = null;
          if (isMountedRef.current) {
            onLoginSuccessRef.current(matchedPatient);
          }
        }, 300);
      }
    },
  });

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRotationRef = useRef(cameraRotation);
  const isMirroredRef = useRef(isMirrored);

  useEffect(() => {
    cameraRotationRef.current = cameraRotation;
    isMirroredRef.current = isMirrored;
  }, [cameraRotation, isMirrored]);

  const customDetectorRef = useRef(customDetector);
  useEffect(() => {
    customDetectorRef.current = customDetector;
  }, [customDetector]);

  // Rate limit cooldown countdown timer
  useEffect(() => {
    if (rateLimitCooldownSec <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCooldownSec]);

  // Load Enrolled Patients for instant local cosine evaluation (<0.1ms per frame)
  // Authoritative Live Supabase Reconcile & Purge (Rule 1 & 2)
  const loadEnrolledPatients = useCallback(async () => {
    try {
      // 0. Sovereign Invariant: Unconditionally wipe all local biometric caches & upgrade vault
      purgeAllLocalBiometricCaches();
      purgeStaleBiometricCache({ force: true });

      const items: CachedPatientBiometric[] = [];

      // 1. Fetch live active patients from backend API when staff token is available
      // (Unauthenticated kiosk verifies matches server-side via /api/smart-onboarding/scan-login)
      let cloudPatients: any[] = [];
      if (defaultApiClient.getAuthToken()) {
        try {
          const apiRes = await defaultApiClient.patients.list({ limit: 100 });
          if (Array.isArray(apiRes)) {
            cloudPatients = apiRes;
          } else if (apiRes && Array.isArray((apiRes as any).patients)) {
            cloudPatients = (apiRes as any).patients;
          } else if (apiRes && Array.isArray((apiRes as any).data)) {
            cloudPatients = (apiRes as any).data;
          }
        } catch {
          cloudPatients = [];
        }
      }

      // 2. Populate verified vectors strictly from Supabase Cloud
      if (Array.isArray(cloudPatients)) {
        for (const p of cloudPatients) {
          const vecs: number[][] = [];
          let h: any = p.history;
          if (typeof h === 'string') {
            try { h = JSON.parse(h); } catch { h = {}; }
          }
          h = h || {};
          if (Array.isArray(h.face_vector) && h.face_vector.length === 512) vecs.push(h.face_vector);
          if (Array.isArray(h.frontal_centroid) && h.frontal_centroid.length === 512) vecs.push(h.frontal_centroid);
          if (Array.isArray(p.face_vector) && p.face_vector.length === 512) vecs.push(p.face_vector);
          if (Array.isArray(p.frontal_centroid) && p.frontal_centroid.length === 512) vecs.push(p.frontal_centroid);

          const rawFrames: any[] = Array.isArray(h.frames) ? h.frames : (Array.isArray(p.frames) ? p.frames : []);
          for (const rawFrame of rawFrames) {
            const storedVector = extractVector(rawFrame);
            if (!storedVector || storedVector.length === 0) continue;
            if (storedVector.length === 512) {
              vecs.push(storedVector);
            }
          }

          // NOTE: Zero adaptive_templates contamination - strictly use enrollment vectors only
          const patientName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.hn || 'ผู้ป่วย';
          if (vecs.length > 0) {
            items.push({
              id: p.id,
              hn: p.hn || '',
              name: patientName,
              vectors: vecs,
            });
          }
        }
      }

      // 3. In-memory cache is populated strictly from live Supabase dataset (Zero localStorage fallback)
      cachedPatientsRef.current = items;
    } catch {
      // safe
    }
  }, []);

  useEffect(() => {
    loadEnrolledPatients();
    const handleRefresh = () => {
      loadEnrolledPatients();
    };
    const handleStaffUpdated = () => {
      setAuthRevision((prev) => prev + 1);
      loadEnrolledPatients();
    };
    window.addEventListener('patient-created', handleRefresh);
    window.addEventListener('patient-deleted', handleRefresh);
    window.addEventListener('staff-updated', handleStaffUpdated);
    return () => {
      window.removeEventListener('patient-created', handleRefresh);
      window.removeEventListener('patient-deleted', handleRefresh);
      window.removeEventListener('staff-updated', handleStaffUpdated);
    };
  }, [loadEnrolledPatients]);

  // Completely Stop & Release Camera hardware and timers
  const stopCamera = useCallback(() => {
    scanGenerationRef.current += 1;
    clearScanTimers(false);
    try {
      const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
      services.camera.stop();
    } catch {}
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        } catch {}
        videoRef.current.srcObject = null;
      }
    }
    isProcessingScanRef.current = false;
    isCountingDownRef.current = false;
    isCoolingDownRef.current = false;
    setIsScanning(false);
    setIsAutoScanCoolingDown(false);
    setCountdownValue(null);
    setRealtimeScore(null);
    consecutiveSteadyFramesRef.current = 0;
    isCameraStartedRef.current = false;
    setCameraReady(false);
    setPresenceDetected(false);
  }, [clearScanTimers]);

  // Request & Initialize Camera with Kiosk Hardware Constraints (Zoom Lock & Focus Stability)
  const startCamera = useCallback(async (deviceIdToUse?: string) => {
    if (isCameraStartingRef.current) return;
    isCameraStartingRef.current = true;
    setCameraDisconnectedError(null);
    setStatusText(
      langRef.current === 'zh-CN'
        ? '请站在摄像头前开始扫描'
        : langRef.current === 'en-US'
        ? 'Please stand in front of camera to begin'
        : 'กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น'
    );

    try {
      const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
      const { camera } = services;

      // 1. Resolve optimal camera device if not explicitly provided
      let devId = deviceIdToUse || selectedCameraIdRef.current;
      try {
        const rawDevices = await (camera as any).getAvailableVideoDevices?.();
        if (Array.isArray(rawDevices) && rawDevices.length > 0) {
          const usable = rawDevices.filter(isUsableCamera);
          const filtered = usable.length > 0 ? usable : rawDevices;
          if (isMountedRef.current) {
            setAvailableCameras(filtered);
          }
          const savedId = localStorage.getItem(KIOSK_CAMERA_STORAGE_KEY) || devId;
          const optimal = selectOptimalCamera(filtered, savedId);
          if (optimal) {
            devId = optimal.deviceId;
          }
        }
      } catch {}

      if (videoRef.current) {
        const stream = await camera.start(videoRef.current, {
          kioskLockConstraints: true,
          width: 640,
          height: 480,
          aspectRatio: KIOSK_CAMERA_STANDARDIZATION_CONFIG.TARGET_ASPECT_RATIO,
          deviceId: devId || undefined,
        });

        // 2. Query active track telemetry & bind lifecycle listeners
        const track = (camera as any).getVideoTrack?.();
        if (track) {
          const actualDevId = track.getSettings?.()?.deviceId || devId || '';
          if (actualDevId) {
            selectedCameraIdRef.current = actualDevId;
            setSelectedCameraId(actualDevId);
            try {
              localStorage.setItem(KIOSK_CAMERA_STORAGE_KEY, actualDevId);
            } catch {}
          }
          setActiveCameraLabel(track.label || 'กล้องหลัก');
          setActiveSettings((camera as any).getSettings?.());
          setActiveCapabilities((camera as any).getCapabilities?.());

          // Listen for hardware disconnection mid-session
          track.onended = () => {
            if (isMountedRef.current) {
              setCameraReady(false);
              setCameraDisconnectedError('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
              setStatusText('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
            }
          };
        }

        // Hardware zoom lock & focus stabilization
        try {
          if (typeof (camera as any).applyHardwareKioskLock === 'function') {
            await (camera as any).applyHardwareKioskLock(stream);
          }
        } catch {
          // non-blocking
        }

        // 5. Query devices again with full labels after user permission granted
        try {
          const freshDevices = await (camera as any).getAvailableVideoDevices?.();
          if (Array.isArray(freshDevices) && freshDevices.length > 0 && isMountedRef.current) {
            const usableFresh = freshDevices.filter(isUsableCamera);
            setAvailableCameras(usableFresh.length > 0 ? usableFresh : freshDevices);
          }
        } catch {}

        isCameraStartedRef.current = true;
        if (isMountedRef.current) {
          setCameraReady(true);
        }
      }
    } catch (camErr) {
      console.warn('Camera start error:', camErr);
      if (isMountedRef.current) {
        setCameraReady(false);
        setCameraDisconnectedError('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
        setStatusText('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
      }
    } finally {
      isCameraStartingRef.current = false;
    }
  }, []);
  useLayoutEffect(() => {
    startCameraRef.current = startCamera;
  }, [startCamera]);

  // Cancel running countdown immediately if face leaves or liveness fails
  const cancelCountdown = useCallback((reason?: string) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    isCountingDownRef.current = false;
    isDetectingRef.current = false;
    lockedTargetRef.current = null;
    setCountdownValue(null);
    setRealtimeScore(null);
    sampleFramesRef.current = [];
    countdownStartTimeRef.current = 0;
    lastFaceSeenDuringCountdownRef.current = 0;
    lastInferenceTickRef.current = 0;
    if (reason) {
      setStatusText(reason);
    }
  }, []);
  useEffect(() => {
    cancelCountdownRef.current = cancelCountdown;
  }, [cancelCountdown]);

  // Complete 3-Second Countdown: Compute Median & Verify Server-Side
  const finishCountdownAndVerify = useCallback(async () => {
    if (
      isProcessingScanRef.current ||
      !isMountedRef.current ||
      isScanningPausedRef.current ||
      isCoolingDownRef.current
    ) {
      return;
    }
    const currentGeneration = scanGenerationRef.current;
    const isCancelled = () =>
      !isMountedRef.current ||
      isScanningPausedRef.current ||
      scanGenerationRef.current !== currentGeneration;

    isProcessingScanRef.current = true;
    setIsScanning(true);
    setStatusText(
      lang === 'zh-CN'
        ? '⚡ 正在验证生物特征身份...'
        : lang === 'en-US'
        ? '⚡ Verifying biometric identity...'
        : '⚡ กำลังตรวจสอบอัตลักษณ์ชีวมาตร...'
    );

    const bestShotFrames: Array<{
      sharpness: number;
      qualityScore: number;
      detection: any;
      vector: number[];
      snapshotBase64: string;
    }> = [];

    try {
      const samples = sampleFramesRef.current.slice();
      if (samples.length < 1) {
        const motionMsg =
          lang === 'zh-CN'
            ? '请直视摄像头，增加光线，并摘下帽子/口罩。'
            : lang === 'en-US'
            ? 'Please look straight, ensure adequate lighting, and remove hat/mask.'
            : 'กรุณามองตรง เพิ่มแสง ถอดหมวก/แมสก์';
        wipeTemporaryBiometricBuffers(false);
        consecutiveUnmatchedRoundsRef.current = { count: 0, firstTimestamp: 0 };
        triggerRetryCooldown(motionMsg);
        return;
      }

      // 1. Group samples by candidate
      const candCounts: Record<string, { cand: CachedPatientBiometric; samples: BiometricSample[] }> = {};
      for (const s of samples) {
        if (s.candidateId) {
          if (!candCounts[s.candidateId]) {
            const foundCand = cachedPatientsRef.current.find((c) => c.id === s.candidateId);
            if (foundCand) {
              candCounts[s.candidateId] = { cand: foundCand, samples: [] };
            }
          }
          if (candCounts[s.candidateId]) {
            candCounts[s.candidateId].samples.push(s);
          }
        }
      }

      const grouped = Object.values(candCounts).sort((a, b) => b.samples.length - a.samples.length);
      const topGroup = grouped[0];

      // 2. Compute Top-3 Highest-Scoring Frames Score
      const livenessPool = (topGroup ? topGroup.samples : samples).filter(
        (s) => s.liveness?.isLive !== false
      );
      const evalPool = livenessPool.length >= 1 ? livenessPool : (topGroup ? topGroup.samples : samples);
      const sortedPool = evalPool.slice().sort((a, b) => b.score - a.score);
      const top3Samples = sortedPool.slice(0, Math.min(3, sortedPool.length));

      const aggregatedScore =
        top3Samples.reduce((sum, s) => sum + s.score, 0) / (top3Samples.length || 1);
      const aggregatedDistance = Math.sqrt(Math.max(0, 2 - 2 * aggregatedScore));

      // Multi-Frame Best-Shot Capture: Collect up to 6 consecutive frames over ~150ms for outlier-filtered probe stabilization
      const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
      const { camera, detector, aligner, embeddingModel } = services;

      for (let i = 0; i < 6; i++) {
        if (isCancelled() || !videoRef.current || videoRef.current.readyState < 2) break;
        const tCanvas = document.createElement('canvas');
        try {
          const raw = camera.captureRotatedFrame(videoRef.current);
          tCanvas.width = raw.width || 640;
          tCanvas.height = raw.height || 480;
          const tctx = tCanvas.getContext('2d', { willReadFrequently: true });
          if (tctx) {
            tctx.filter = 'none';
            tctx.drawImage(raw, 0, 0);
          }

          const det = await detector.detect(tCanvas);
          if (det.hasFace && det.box) {
            const quality = computeFaceImageQuality(tCanvas, det.box);
            const isCleanBurstFrame =
              !det.eyes?.isBlinking &&
              det.liveness?.is3dLive !== false &&
              (!det.pose || (Math.abs(det.pose.yaw) <= 20 && Math.abs(det.pose.pitch) <= 20));
            let frameVec: number[] | null = null;
            if (isCleanBurstFrame && det.landmarks) {
              const aligned = aligner.align(tCanvas, det.landmarks);
              frameVec = await embeddingModel.embed(aligned, det.landmarks);
              const actx = aligned.getContext?.('2d');
              if (actx) actx.clearRect(0, 0, aligned.width, aligned.height);
              aligned.width = 0;
              aligned.height = 0;
            } else if (isCleanBurstFrame) {
              frameVec = await embeddingModel.embed(tCanvas);
            }

            const sharpNorm = Math.min(1, Math.max(0.15, (quality.sharpness || 25) / 85));
            bestShotFrames.push({
              sharpness: quality.sharpness,
              qualityScore: frameVec && frameVec.length === 512 ? sharpNorm : 0,
              detection: det,
              vector: frameVec && frameVec.length === 512 ? frameVec : [],
              snapshotBase64: '',
            });
          }
        } catch {
          // non-blocking single frame error
        } finally {
          try {
            const cctx = tCanvas.getContext?.('2d');
            if (cctx && tCanvas.width > 0 && tCanvas.height > 0) {
              cctx.clearRect(0, 0, tCanvas.width, tCanvas.height);
            }
            tCanvas.width = 0;
            tCanvas.height = 0;
          } catch {}
        }

        if (i < 5) {
          await new Promise((resolve) => setTimeout(resolve, 26));
          if (isCancelled()) break;
        }
      }

      if (isCancelled()) {
        wipeBiometricBuffers({ bestShotFrames });
        wipeTemporaryBiometricBuffers(false);
        return;
      }

      let bestShotVector: number[] | null = null;
      let snapshotBase64: string | undefined;

      if (bestShotFrames.length > 0) {
        // Sort descending by sharpness (highest Laplacian variance = sharpest frame)
        bestShotFrames.sort((a, b) => b.sharpness - a.sharpness);
        const sharpestEmbedded = bestShotFrames.find((f) => f.vector && f.vector.length === 512);
        bestShotVector = sharpestEmbedded ? sharpestEmbedded.vector.slice() : null;
        snapshotBase64 = bestShotFrames[0].snapshotBase64 || bestShotFrames.find((f) => f.snapshotBase64)?.snapshotBase64;
      }

      // State (ก) Quality & Pose Validation:
      // Strictly validate sharpness >= QUALITY_MIN (4.0) and frontal pose (|yaw| <= 20° and |pitch| <= 20°)
      // without allowing liveness status to bypass blurry or angled frames.
      const hasValidQualityFrame = isBestShotFrameQualityValid(bestShotFrames);

      if (!hasValidQualityFrame) {
        // Quality insufficient: Blurry, too dark/bright, face lost during burst, or turned face > 20°
        // Show brief guidance and do NOT count towards "Account Not Found"
        wipeBiometricBuffers({ bestShotFrames, probeVector: bestShotVector });
        snapshotBase64 = undefined;
        wipeTemporaryBiometricBuffers(false);

        consecutiveQualityFailuresRef.current++;
        let qualityAdvice: string;
        if (consecutiveQualityFailuresRef.current >= KIOSK_NOT_FOUND_CONFIG.QUALITY_RETRY_MAX) {
          qualityAdvice =
            lang === 'zh-CN'
              ? '图像质量持续不达标，建议联系或呼叫医护人员协助。'
              : lang === 'en-US'
              ? 'Persistent image quality issue. Please ask staff for assistance.'
              : 'ภาพไม่ชัดเจนต่อเนื่อง กรุณาติดต่อหรือเรียกเจ้าหน้าที่';
        } else {
          qualityAdvice = t('kiosk_msg_quality_insufficient');
        }
        triggerRetryCooldown(qualityAdvice, { showToast: true });
        return;
      }

      // Valid quality frame passed: reset quality failure counter
      consecutiveQualityFailuresRef.current = 0;

      // Outlier-rejected, quality-weighted probe fusion built strictly from the fresh 6-frame best-shot burst
      // (only falling back to samplePool if bestShotFrames yielded no valid 512-D descriptors)
      const probeSamples: Array<{ embedding: number[]; qualityScore: number }> = [];
      for (const bf of bestShotFrames) {
        if (bf.vector && bf.vector.length === 512 && bf.qualityScore > 0) {
          probeSamples.push({ embedding: bf.vector, qualityScore: bf.qualityScore });
        }
      }
      const samplePool = top3Samples.length > 0 ? top3Samples : samples;
      if (probeSamples.length === 0) {
        for (const sm of samplePool) {
          if (sm.vector && sm.vector.length === 512) {
            probeSamples.push({
              embedding: sm.vector,
              qualityScore: Math.min(0.85, Math.max(0.25, sm.score * 0.75)),
            });
          }
        }
      }

      if (probeSamples.length === 0) {
        wipeBiometricBuffers({ bestShotFrames, probeVector: bestShotVector });
        snapshotBase64 = undefined;
        wipeTemporaryBiometricBuffers(false);
        consecutiveQualityFailuresRef.current++;
        triggerRetryCooldown(t('kiosk_msg_quality_insufficient'), { showToast: true });
        return;
      }

      let finalProbe: number[];
      try {
        finalProbe = aggregateProbeEmbeddings(probeSamples).centroid;
      } catch {
        const fallbackVecs = [
          ...(bestShotVector ? [bestShotVector] : []),
          ...samplePool.map((s) => s.vector).filter((v) => v && v.length === 512),
        ];
        finalProbe = averageAndNormalize(fallbackVecs);
      }

      // Wipe raw burst frames immediately after constructing finalProbe
      wipeBiometricBuffers({ bestShotFrames, probeVector: bestShotVector });
      bestShotVector = null;
      wipeTemporaryBiometricBuffers(false);

      // Server-Side Verification call (descriptor only - zero face snapshot image transmitted)
      const res = await defaultApiClient.smartOnboarding
        .scanLogin({
          probe: finalProbe,
        })
        .catch(() => null);

      finalProbe.fill(0);
      snapshotBase64 = undefined;

      if (isCancelled()) {
        wipeTemporaryBiometricBuffers(false);
        return;
      }

      // Fail-closed invariant: Reject authentication if Supabase/API could not be reached
      if (!res) {
        wipeTemporaryBiometricBuffers(false);
        const unreachableMsg =
          lang === 'zh-CN'
            ? '⚠️ 无法连接到医院系统，正在自动重试...'
            : lang === 'en-US'
            ? '⚠️ System unreachable, auto-retrying...'
            : '⚠️ เชื่อมต่อระบบไม่ได้ กำลังลองใหม่อัตโนมัติ...';
        triggerRetryCooldown(unreachableMsg, { showToast: true, toastDurationMs: 2000 });
        return;
      }

      if ((res as any)?.error || (res as any).ok === false) {
        wipeTemporaryBiometricBuffers(false);
        const errorMsg = (res as any).message || (res as any).error?.message || 'เชื่อมต่อระบบไม่ได้ ลองใหม่หรือเรียกเจ้าหน้าที่';
        triggerRetryCooldown(`⚠️ ${errorMsg}`, { showToast: true, toastDurationMs: 2000 });
        return;
      }

      const hasRawCosine = typeof (res as any)?.rawCosineSimilarity === 'number';
      const reportedSimilarity =
        typeof res?.similarity === 'number'
          ? res.similarity
          : typeof (res as any)?.cosineSimilarity === 'number'
          ? (res as any).cosineSimilarity
          : 0;
      const reportedRawCosine = hasRawCosine ? (res as any).rawCosineSimilarity : reportedSimilarity;
      const reportedPercentage =
        typeof res?.similarityPercentage === 'number'
          ? res.similarityPercentage
          : Math.round(reportedRawCosine * 100);

      const isServerMatch = Boolean(
        res &&
        res.matched === true &&
        (res as any).patient &&
        reportedPercentage >= 85 &&
        (!hasRawCosine || reportedRawCosine >= 0.85)
      );

      // Case A: Confirmed Authoritative Genuine Match
      // Client-side auto-matching is strictly banned: browser client MUST NEVER unilaterally decide a match.
      if (isServerMatch) {
        consecutiveUnmatchedRoundsRef.current = { count: 0, firstTimestamp: 0 };
        scanFailureCountRef.current = 0;
        wipeTemporaryBiometricBuffers(false);
        isProcessingScanRef.current = true;
        const rawPatient = (res as any)?.patient;
        const patient = normalizePatientRecord(rawPatient);
        const pId = patient.id || patient.patient_id;

        // Server-side scanLogin already verified live DB state; ensure record is active and not archived
        const isVerifiedLive = Boolean(
          pId &&
            rawPatient &&
            (rawPatient as any).registration_status !== 'archived'
        );
        const authoritativePatient = patient;

        if (!isVerifiedLive) {
          // GHOST PATIENT DETECTED: Immediately purge and refuse login
          removePatientFromLocalCache(pId);
          cachedPatientsRef.current = cachedPatientsRef.current.filter(
            (c) => c.id !== pId && c.hn !== patient.hn
          );
          scanGenerationRef.current += 1;
          clearScanTimers(false);
          isProcessingScanRef.current = false;
          setIsScanning(false);
          setMatchedPatient(null);
          setUnrecognizedAlert(
            lang === 'zh-CN'
              ? '未找到系统有效账户，该就诊人档案可能已在医院系统中被注销或删除。'
              : lang === 'en-US'
              ? 'No active patient account found. Profile may have been deleted or archived by hospital admin.'
              : 'ไม่พบบัญชีในระบบ หรือข้อมูลผู้ป่วยนี้ถูกลบออกจากฐานข้อมูลโรงพยาบาลแล้ว กรุณาติดต่อเจ้าหน้าที่'
          );
          setStatusText(
            lang === 'zh-CN'
              ? '未找到系统有效账户'
              : lang === 'en-US'
              ? 'Active Account Not Found'
              : 'ไม่พบบัญชีในระบบ'
          );
          return;
        }

        const rawCalculated = typeof res?.similarityPercentage === 'number' ? res.similarityPercentage : 0;
        const finalPercent = Math.min(100, Math.max(0, rawCalculated));
        const finalDistance = typeof res?.distance === 'number' ? res.distance : aggregatedDistance;

        setUnrecognizedAlert(null);
        setMatchedPatient(authoritativePatient);
        setSimilarityInfo({
          percent: finalPercent,
          distance: finalDistance,
        });
        const welcomeMsg =
          lang === 'zh-CN'
            ? `欢迎，คุณ ${authoritativePatient.first_name} (${finalPercent}%)`
            : lang === 'en-US'
            ? `Welcome, คุณ ${authoritativePatient.first_name} (${finalPercent}%)`
            : `ยินดีต้อนรับ คุณ ${authoritativePatient.first_name} (${finalPercent}%)`;
        setStatusText(welcomeMsg);
        setIsTransitioning(true);
        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = setTimeout(() => {
          transitionTimerRef.current = null;
          if (isMountedRef.current) {
            onLoginSuccessRef.current(authoritativePatient);
          }
        }, 600);
        return;
      }

      // NO_MATCH Path: Fail-closed identity rejection & Round 1/2 Account Not Found confirmation
      wipeTemporaryBiometricBuffers(false);
      setMatchedPatient(null);
      scanFailureCountRef.current++;
      const now = Date.now();
      failedScanTimestampsRef.current.push(now);
      failedScanTimestampsRef.current = failedScanTimestampsRef.current.filter((ts) => now - ts <= 60000);

      // Rate limit check: >= MAX_ATTEMPTS (5) failed attempts in 1 minute
      if (failedScanTimestampsRef.current.length >= BIOMETRIC_CONFIG.MAX_ATTEMPTS) {
        consecutiveUnmatchedRoundsRef.current = { count: 0, firstTimestamp: 0 };
        setRateLimitCooldownSec(Math.round(BIOMETRIC_CONFIG.LOCKOUT_DURATION_MS / 1000));
        const cooldownMsg = lang === 'zh-CN'
          ? '⚠️ 1分钟内连续扫描失败超过5次，系统已锁定60秒或联系前台工作人员'
          : lang === 'en-US'
          ? '⚠️ More than 5 failed scans detected. System locked for 60s cooldown.'
          : '⚠️ สแกนไม่สำเร็จติดต่อกัน 5 ครั้ง ระบบล็อกการสแกนชั่วคราว 60 วินาที หรือติดต่อเจ้าหน้าที่';
        setStatusText(cooldownMsg);
        setFloatingToast(cooldownMsg);
        isProcessingScanRef.current = false;
        setIsScanning(false);
        return;
      }

      // Record Round 1 firstTimestamp at completion of NO_MATCH and verify Round 2 within 10s MAX_CONFIRM_WINDOW_MS
      const roundEval = evaluateNoMatchRound(consecutiveUnmatchedRoundsRef.current, now, KIOSK_NOT_FOUND_CONFIG);
      consecutiveUnmatchedRoundsRef.current = roundEval.nextTracker;

      if (roundEval.confirmedNotFound) {
        // CONFIRMED ACCOUNT_NOT_FOUND: Halt scanning loop immediately, wipe buffers, and show controlled modal
        consecutiveUnmatchedRoundsRef.current = { count: 0, firstTimestamp: 0 };
        scanGenerationRef.current += 1;
        clearScanTimers(false);
        wipeTemporaryBiometricBuffers(false);
        consecutiveSteadyFramesRef.current = 0;
        isProcessingScanRef.current = false;
        setIsScanning(false);
        isCountingDownRef.current = false;
        setCountdownValue(null);
        setRealtimeScore(null);
        setFloatingToast(null);
        stabilityDetectorRef.current.reset();

        const notFoundMsg = t('kiosk_account_not_found_desc');
        setStatusText(notFoundMsg);
        setIsAccountNotFound(true);
        return;
      }

      // Round 1 (1st unmatched attempt): Neutral prompt WITHOUT any % or candidate clue + 1.5s cooldown
      const round1Msg =
        lang === 'zh-CN'
          ? '请直视摄像头并保持静止，正在再次验证...'
          : lang === 'en-US'
          ? 'Please look straight and hold still to verify again...'
          : 'กรุณามองตรงและอยู่นิ่งๆ เพื่อตรวจสอบอีกครั้ง...';

      triggerRetryCooldown(round1Msg, { showToast: true });
    } catch (err: unknown) {
      wipeBiometricBuffers({ bestShotFrames });
      wipeTemporaryBiometricBuffers(false);
      if (isCancelled()) return;
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการประมวลผลใบหน้า';
      triggerRetryCooldown(msg, { showToast: true, toastDurationMs: 2000 });
    } finally {
      if (isMountedRef.current && scanGenerationRef.current === currentGeneration) {
        isProcessingScanRef.current = false;
        setIsScanning(false);
        isCountingDownRef.current = false;
      }
    }
  }, [clearScanTimers, lang, t, triggerRetryCooldown, wipeTemporaryBiometricBuffers]);
  useEffect(() => {
    finishCountdownAndVerifyRef.current = finishCountdownAndVerify;
  }, [finishCountdownAndVerify]);

  // Start Auto Countdown 3..2..1 & periodic embedding extraction
  const startCountdown = useCallback(() => {
    if (
      isCountingDownRef.current ||
      isScanning ||
      isProcessingScanRef.current ||
      isScanningPaused ||
      isCoolingDownRef.current ||
      matchedPatient ||
      rateLimitCooldownSec > 0
    ) {
      return;
    }

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    isCountingDownRef.current = true;
    const now = Date.now();
    countdownStartTimeRef.current = now;
    lastFaceSeenDuringCountdownRef.current = now;
    lastInferenceTickRef.current = 0;
    sampleFramesRef.current = [];
    lowSimFramesRef.current = 0;
    lockedTargetRef.current = null;
    setMatchedPatient(null);
    setUnrecognizedAlert(null);
    setCountdownValue(3);
    setRealtimeScore(null);
    setFloatingToast(null);
    setStatusText(
      lang === 'zh-CN'
        ? '⏱️ 请直视摄像头并保持静止，正在自动扫描...'
        : lang === 'en-US'
        ? '⏱️ Please look straight and hold still, auto-scanning...'
        : '⏱️ กรุณามองตรงและอยู่นิ่ง ๆ กำลังสแกนอัตโนมัติ...'
    );

    const interval = setInterval(() => {
      if (!isMountedRef.current || isScanningPausedRef.current) {
        cancelCountdownRef.current?.('การสแกนหยุดชั่วคราว');
        return;
      }

      const elapsed = Date.now() - countdownStartTimeRef.current;
      const remainingSec = Math.max(1, 3 - Math.floor(elapsed / 1000));

      if (elapsed >= 3000) {
        clearInterval(interval);
        countdownIntervalRef.current = null;
        setCountdownValue(null);
        isCountingDownRef.current = false;
        finishCountdownAndVerifyRef.current?.();
        return;
      }

      setCountdownValue(remainingSec);

      // Periodic 250ms feature extraction & local matching with Target Face Lock (Async Non-Blocking)
      const currentTick = Date.now();
      if (
        currentTick - lastInferenceTickRef.current >= 250 &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        if (isDetectingRef.current) return;
        lastInferenceTickRef.current = currentTick;
        isDetectingRef.current = true;

        (async () => {
          try {
            const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
            const { camera, detector, aligner, embeddingModel } = services;
            const rawFrame = camera.captureRotatedFrame(videoRef.current || undefined);

            // Downscale to 480px width detectCanvas to eliminate inference lag (25-35ms instead of 120ms+)
            let dCanvas = detectCanvasRef.current;
            if (!dCanvas) {
              dCanvas = document.createElement('canvas');
              detectCanvasRef.current = dCanvas;
            }
            const targetW = 480;
            const scale = Math.min(1.0, targetW / (rawFrame.width || 640));
            const dw = Math.round((rawFrame.width || 640) * scale);
            const dh = Math.round((rawFrame.height || 480) * scale);
            if (dCanvas.width !== dw || dCanvas.height !== dh) {
              dCanvas.width = dw;
              dCanvas.height = dh;
            }
            const dctx = dCanvas.getContext('2d', { willReadFrequently: true });
            if (dctx) {
              dctx.filter = 'none';
              dctx.drawImage(rawFrame, 0, 0, dw, dh);
            }

            const detection = await detector.detect(dCanvas);

            // Face Lost Check with 1000ms Grace Period
            if (!detection.hasFace || !detection.box) {
              if (Date.now() - lastFaceSeenDuringCountdownRef.current > KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_LOST_TIMEOUT_MS) {
                lockedTargetRef.current = null;
                cancelCountdown(langRef.current === 'zh-CN' ? '未检测到人脸，已重置' : langRef.current === 'en-US' ? 'Face lost, reset' : 'ไม่พบใบหน้า ระบบได้รีเซ็ตการสแกน');
                stabilityDetectorRef.current.reset();
              }
              return;
            }

            // Severe Pose Tilt Check with 1000ms Grace Period
            const isSeverelyTilted = detection.pose && (Math.abs(detection.pose.yaw) > 32 || Math.abs(detection.pose.pitch) > 32);
            if (isSeverelyTilted) {
              if (Date.now() - lastFaceSeenDuringCountdownRef.current > KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_LOST_TIMEOUT_MS) {
                lockedTargetRef.current = null;
                cancelCountdownRef.current?.(langRef.current === 'zh-CN' ? '请直视摄像头，已重置' : langRef.current === 'en-US' ? 'Please look straight, reset' : 'กรุณามองตรงที่กล้อง ระบบได้รีเซ็ตการสแกน');
                stabilityDetectorRef.current.reset();
              }
              return;
            }

            // Valid face seen within normal boundaries: update heartbeat timestamp
            lastFaceSeenDuringCountdownRef.current = Date.now();

            // Compute Image Quality (Sharpness & Luminance) on Face Region
            const imageQuality = computeFaceImageQuality(dCanvas, detection.box);
            setCurrentTelemetry({
              faceHeightRatio: detection.box.height / dh,
              sharpness: imageQuality.sharpness,
              brightness: imageQuality.brightness,
            });

            const quality = checkKioskFaceQuality(detection, dw, dh, imageQuality);
            if (!quality.passed) {
              if (quality.reason === 'NO_FACE' && Date.now() - lastFaceSeenDuringCountdownRef.current > KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_LOST_TIMEOUT_MS) {
                lockedTargetRef.current = null;
                cancelCountdown(quality.statusMessageThai);
                stabilityDetectorRef.current.reset();
              }
              return;
            }

            // Strict Target Face Lock & Spatial Continuity Verification
            const checkNow = Date.now();
            if (!lockedTargetRef.current) {
              lockedTargetRef.current = {
                box: { ...detection.box },
                centerX: detection.box.x + detection.box.width / 2,
                centerY: detection.box.y + detection.box.height / 2,
                lastSeenTimestamp: checkNow,
                lockedAt: checkNow,
              };
            } else {
              const isMatch = isTargetContinuityMatch(detection.box, lockedTargetRef.current, dw, dh);
              if (isMatch) {
                lockedTargetRef.current.box = { ...detection.box };
                lockedTargetRef.current.centerX = detection.box.x + detection.box.width / 2;
                lockedTargetRef.current.centerY = detection.box.y + detection.box.height / 2;
                lockedTargetRef.current.lastSeenTimestamp = checkNow;
              } else {
                // Different face appeared in frame (e.g. background face or passerby)
                if (checkNow - lockedTargetRef.current.lastSeenTimestamp > KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_LOST_TIMEOUT_MS) {
                  lockedTargetRef.current = null;
                  cancelCountdown('เป้าหมายหลุดจากกล้อง ระบบได้รีเซ็ตการสแกน');
                  stabilityDetectorRef.current.reset();
                  return;
                }
                // Ignore passerby, do not collect probe embedding from non-locked subject
                return;
              }
            }

            const liv = fastLivenessVerifierRef.current.evaluate(detection);
            setLivenessResult(liv);
            if (liv.state === 'spoof_blocked') {
              lockedTargetRef.current = null;
              cancelCountdown(t('kiosk_spoof_blocked'));
              stabilityDetectorRef.current.reset();
              return;
            }

            // Software & Hardware Camera Standardization:
            // 1. Hardware Zoom auto-adjustment (if supported by webcam capabilities)
            try {
              const currentRatio = detection.box.height / dh;
              const targetRatio = KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_HEIGHT_RATIO_TARGET;
              // CameraManager declares applyHardwareZoom, so no cast or typeof check is needed.
              if (currentRatio < 0.35) {
                const zoomFactor = Math.min(2.5, targetRatio / currentRatio);
                camera.applyHardwareZoom(zoomFactor);
              }
            } catch {}

            // Extract 512-D hybrid (2D texture + 3D craniofacial geometry) embedding
            const isPoseAcceptable =
              !detection.pose ||
              (Math.abs(detection.pose.yaw) <= 18 && Math.abs(detection.pose.pitch) <= 18);
            const isCleanSampleFrame =
              !detection.eyes?.isBlinking &&
              detection.liveness?.is3dLive !== false &&
              isPoseAcceptable;

            let vector: number[] | null = null;
            if (isCleanSampleFrame && detection.landmarks) {
              const aligned = aligner.align(dCanvas, detection.landmarks);
              vector = await embeddingModel.embed(aligned, detection.landmarks);
              const actx = aligned.getContext?.('2d');
              if (actx) actx.clearRect(0, 0, aligned.width, aligned.height);
              aligned.width = 0;
              aligned.height = 0;
            } else if (isCleanSampleFrame) {
              vector = await embeddingModel.embed(dCanvas);
            }

            if (vector && vector.length === 512) {
              // Match against cached patients for live diagnostic telemetry only;
              // final authentication always runs multi-frame best-shot burst + server scanLogin RPC.
              let bestCandidate: CachedPatientBiometric | null = null;
              let highestSimilarity = 0;
              let top2Cand: CachedPatientBiometric | null = null;
              let top2Sim = 0;

              for (const cand of cachedPatientsRef.current) {
                let candBestSim = 0;
                for (const storedVector of cand.vectors) {
                  if (storedVector && storedVector.length === 512) {
                    let dot = 0;
                    for (let i = 0; i < 512; i++) {
                      dot += vector[i] * storedVector[i];
                    }
                    const calDot = calibrateCosineSimilarity(dot);
                    if (calDot > candBestSim) candBestSim = calDot;
                  }
                }
                if (candBestSim > highestSimilarity) {
                  top2Sim = highestSimilarity;
                  top2Cand = bestCandidate;
                  highestSimilarity = candBestSim;
                  if (candBestSim >= 0.78) {
                    bestCandidate = cand;
                  }
                } else if (candBestSim > top2Sim) {
                  top2Sim = candBestSim;
                  top2Cand = cand;
                }
              }

              const top1Cand = bestCandidate || null;
              const top1Sim = highestSimilarity;

              const currentPercent = Math.max(0, Math.min(100, Math.round(top1Sim * 100)));
              const currentDist = Math.sqrt(Math.max(0, 2 - 2 * top1Sim));
              const isCandidateLikely = currentPercent >= 68;

              sampleFramesRef.current.push({
                vector,
                score: top1Sim,
                percent: currentPercent,
                distance: currentDist,
                candidateId: isCandidateLikely ? top1Cand?.id : undefined,
                candidateName: isCandidateLikely ? top1Cand?.name : undefined,
                candidateHn: isCandidateLikely ? top1Cand?.hn : undefined,
                secondCandidate: top2Cand && (top2Sim * 100 >= 50) ? { name: top2Cand.name, hn: top2Cand.hn, score: Math.round(top2Sim * 100) } : undefined,
                liveness: liv,
                timestamp: Date.now(),
              });

              // Zero information disclosure for unauthenticated strangers (Part 5 & Part 6)
              // Only expose realtime score if user was already verified/matched
              if (matchedPatient) {
                setRealtimeScore(currentPercent);
              } else {
                setRealtimeScore(null);
              }

              const allPercents = sampleFramesRef.current.map((s) => s.percent).sort((a, b) => a - b);
              const medPerc = allPercents[Math.floor(allPercents.length / 2)] || currentPercent;
              setCalibrationStats({
                currentCos: top1Sim,
                currentDist: currentDist,
                currentPercent: matchedPatient ? currentPercent : 0,
                medianPercent: matchedPatient ? medPerc : 0,
                minPercent: matchedPatient ? (allPercents[0] || currentPercent) : 0,
                maxPercent: matchedPatient ? (allPercents[allPercents.length - 1] || currentPercent) : 0,
                samplesCount: sampleFramesRef.current.length,
                depthScore: liv.depthScore,
                ear: liv.ear || 0.30,
                top1: matchedPatient && top1Cand ? { name: top1Cand.name, hn: top1Cand.hn, score: currentPercent } : undefined,
                top2: undefined,
              });
            }
          } catch (err) {
            console.warn('[FaceScan] inference error:', err);
          } finally {
            isDetectingRef.current = false;
          }
        })();
      }
    }, 100);

    countdownIntervalRef.current = interval;
  }, [cancelCountdown, isScanning, isScanningPaused, matchedPatient, rateLimitCooldownSec, lang, t, wipeTemporaryBiometricBuffers]);
  useEffect(() => {
    startCountdownRef.current = startCountdown;
  }, [startCountdown]);

  // Trigger manual scan (activates countdown if face is aligned or restarts camera if inactive)
  const executeScanLogin = useCallback(() => {
    if (!cameraReady || userDisabledCamera) {
      setUserDisabledCamera(false);
      isCameraStartedRef.current = false;
      startCamera();
      return;
    }
    if (rateLimitCooldownSec > 0) {
      alert(`กรุณารอระบบคูลดาวน์ ${rateLimitCooldownSec} วินาที`);
      return;
    }
    // Force reset any stalled or cooling state
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    isCountingDownRef.current = false;
    isProcessingScanRef.current = false;
    isCoolingDownRef.current = false;
    setIsAutoScanCoolingDown(false);
    setIsScanning(false);
    startCountdownRef.current?.();
  }, [cameraReady, userDisabledCamera, rateLimitCooldownSec, startCamera]);

  // ISOLATED CAMERA LIFECYCLE
  useEffect(() => {
    isMountedRef.current = true;
    preloadFaceModels();
    startCamera();

    return () => {
      isMountedRef.current = false;
      scanGenerationRef.current += 1;
      clearScanTimers(true);
      wipeTemporaryBiometricBuffers(false);
      stopCamera();
    };
  }, [startCamera, stopCamera, clearScanTimers, wipeTemporaryBiometricBuffers]);

  // Tab visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && !isCameraStartedRef.current && !userDisabledCamera) {
        startCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startCamera, userDisabledCamera]);

  // Cycle to the next available camera (used by the on-screen camera switch button)
  const handleSwitchCamera = useCallback(() => {
    const idx = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIdx = (Math.max(0, idx) + 1) % availableCameras.length;
    const next = availableCameras[nextIdx];
    if (next) {
      setSelectedCameraId(next.deviceId);
      try {
        localStorage.setItem(KIOSK_CAMERA_STORAGE_KEY, next.deviceId);
      } catch {}
      startCamera(next.deviceId);
    }
  }, [availableCameras, selectedCameraId, startCamera]);

  // Multi-camera enumeration & dynamic hotplug listener
  useEffect(() => {
    let isSubscribed = true;
    const fetchDevices = async () => {
      try {
        const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
        const devices = await (services.camera as any).getAvailableVideoDevices?.();
        if (isSubscribed && Array.isArray(devices) && devices.length > 0) {
          const usable = devices.filter(isUsableCamera);
          setAvailableCameras(usable.length > 0 ? usable : devices);
        }
      } catch {}
    };

    fetchDevices();

    const handleDeviceChange = async () => {
      try {
        const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
        const devices = await (services.camera as any).getAvailableVideoDevices?.();
        if (!isSubscribed || !Array.isArray(devices)) return;
        const usable = devices.filter(isUsableCamera);
        const filtered = usable.length > 0 ? usable : devices;
        setAvailableCameras(filtered);

        // If no cameras at all are detected
        if (devices.length === 0) {
          setCameraReady(false);
          setCameraDisconnectedError('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
          setStatusText('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
          return;
        }

        // If active camera was unplugged/disconnected, fall back to next optimal camera
        const isCurrentStillAttached = devices.some((d) => d.deviceId === selectedCameraIdRef.current);
        if (!isCurrentStillAttached) {
          const savedId = localStorage.getItem(KIOSK_CAMERA_STORAGE_KEY);
          const nextOptimal = selectOptimalCamera(devices, savedId);
          if (nextOptimal) {
            selectedCameraIdRef.current = nextOptimal.deviceId;
            setSelectedCameraId(nextOptimal.deviceId);
            try {
              localStorage.setItem(KIOSK_CAMERA_STORAGE_KEY, nextOptimal.deviceId);
            } catch {}
            if (!userDisabledCamera) {
              startCamera(nextOptimal.deviceId);
            }
          } else {
            setCameraReady(false);
            setCameraDisconnectedError('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
            setStatusText('ไม่พบกล้อง กรุณาตรวจสอบการเชื่อมต่อ');
          }
        } else {
          setCameraDisconnectedError(null);
        }
      } catch {}
    };

    if (navigator?.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }
    return () => {
      isSubscribed = false;
      if (navigator?.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [startCamera, userDisabledCamera]);

  // PREVIEW CANVAS RENDER LOOP (Runs on requestAnimationFrame)
  useEffect(() => {
    if (isScanningPaused || !cameraReady) return;

    let animId: number;
    const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
    const { camera } = services;

    const renderLoop = () => {
      if (!isMountedRef.current || isScanningPaused) return;
      // Freeze preview canvas rendering while matchedPatient modal is active to save GPU backdrop-blur
      if (matchedPatient) {
        animId = requestAnimationFrame(renderLoop);
        return;
      }
      if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        camera.setRotation(cameraRotationRef.current);
        camera.setMirrorPreview(isMirroredRef.current);
        camera.renderPreview(previewCanvasRef.current, videoRef.current, isMirroredRef.current);
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [cameraReady, isScanningPaused, matchedPatient]);

  // DETECTION & PRESENCE LOOP (160ms throttled)
  const prevPresenceDetectedRef = useRef<boolean>(false);
  const prevLivenessStateRef = useRef<string>('');
  const lastLivenessBadgeUpdateRef = useRef<number>(0);
  const prevStatusTextRef = useRef<string>('');

  useEffect(() => {
    if (isScanningPaused || !cameraReady) return;

    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
    const { detector, inputManager } = services;

    inputManager.setIdleMode(true);

    const unsubscribe = inputManager.subscribe((event) => {
      if (!isMountedRef.current || isScanningPaused) return;
      if (event.type === 'PRESENCE_DETECTED') {
        if (!prevPresenceDetectedRef.current) {
          prevPresenceDetectedRef.current = true;
          setPresenceDetected(true);
        }
        const text = 'ตรวจพบผู้ป่วย จัดท่านั่งและมองกล้อง';
        if (prevStatusTextRef.current !== text) {
          prevStatusTextRef.current = text;
          setStatusText(text);
        }
      }
    });

    const presenceInterval = setInterval(async () => {
      // Watchdog: If countdown flag was stuck for > 4.5s, forcibly clean up and release lock
      if (isCountingDownRef.current && Date.now() - countdownStartTimeRef.current > 4500) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        isCountingDownRef.current = false;
        setCountdownValue(null);
        setRealtimeScore(null);
        countdownStartTimeRef.current = 0;
      }

      // Guard against overlapping inferences: never run presence detection while counting down, scanning, paused, cooling down, or hidden
      if (
        !isMountedRef.current ||
        (typeof document !== 'undefined' && document.hidden) ||
        isScanningPausedRef.current ||
        isScanning ||
        isProcessingScanRef.current ||
        isCoolingDownRef.current ||
        isCountingDownRef.current ||
        isDetectingRef.current ||
        Boolean(matchedPatient)
      ) {
        return;
      }

      if (videoRef.current && videoRef.current.readyState >= 2) {
        isDetectingRef.current = true;
        try {
          const vw = videoRef.current.videoWidth || 640;
          const vh = videoRef.current.videoHeight || 480;

          let dCanvas = detectCanvasRef.current;
          if (!dCanvas) {
            dCanvas = document.createElement('canvas');
            detectCanvasRef.current = dCanvas;
          }
          const targetW = 480;
          const scale = Math.min(1.0, targetW / vw);
          const dw = Math.round(vw * scale);
          const dh = Math.round(vh * scale);
          if (dCanvas.width !== dw || dCanvas.height !== dh) {
            dCanvas.width = dw;
            dCanvas.height = dh;
          }
          const dctx = dCanvas.getContext('2d', { willReadFrequently: true });
          if (dctx) {
            dctx.filter = 'none';
            dctx.drawImage(videoRef.current, 0, 0, dw, dh);
          }

          const res = await detector.detect(dCanvas);

          if (res.hasFace && res.box) {
            // 1. Multi-person rejection at start
            if (res.multipleFaces && !lockedTargetRef.current) {
              consecutiveSteadyFramesRef.current = 0;
              const msg = '⚠️ กรุณาให้ผู้ใช้ยืนหน้ากล้องทีละคน';
              if (prevStatusTextRef.current !== msg) {
                prevStatusTextRef.current = msg;
                setStatusText(msg);
              }
              return;
            }

            // Compute Image Quality (Sharpness & Luminance) on Face Region
            const imageQuality = computeFaceImageQuality(dCanvas, res.box);
            setCurrentTelemetry({
              faceHeightRatio: res.box.height / dh,
              sharpness: imageQuality.sharpness,
              brightness: imageQuality.brightness,
            });

            // 2. Automated Pose & Size Quality Gate
            const quality = checkKioskFaceQuality(res, dw, dh, imageQuality);
            if (!quality.passed) {
              consecutiveSteadyFramesRef.current = 0;
              lockedTargetRef.current = null;
              if (prevStatusTextRef.current !== quality.statusMessageThai) {
                prevStatusTextRef.current = quality.statusMessageThai;
                setStatusText(quality.statusMessageThai);
              }
              inputManager.processFaceDetection(null, performance.now());
              return;
            }

            // 3. Target Face Lock & Spatial Continuity Verification
            const now = Date.now();
            if (!lockedTargetRef.current) {
              lockedTargetRef.current = {
                box: { ...res.box },
                centerX: res.box.x + res.box.width / 2,
                centerY: res.box.y + res.box.height / 2,
                lastSeenTimestamp: now,
                lockedAt: now,
              };
            } else {
              const isMatch = isTargetContinuityMatch(res.box, lockedTargetRef.current, dw, dh);
              if (isMatch) {
                lockedTargetRef.current.box = { ...res.box };
                lockedTargetRef.current.centerX = res.box.x + res.box.width / 2;
                lockedTargetRef.current.centerY = res.box.y + res.box.height / 2;
                lockedTargetRef.current.lastSeenTimestamp = now;
              } else {
                if (now - lockedTargetRef.current.lastSeenTimestamp > KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_LOST_TIMEOUT_MS) {
                  lockedTargetRef.current = null;
                  consecutiveSteadyFramesRef.current = 0;
                  return;
                }
                // Ignore different face in background
                return;
              }
            }

            // 4. Liveness Verification & Anti-Spoofing
            const liv = fastLivenessVerifierRef.current.evaluate(res);
            const nowTelemetryMs = performance.now();
            if (
              prevLivenessStateRef.current !== liv.state ||
              nowTelemetryMs - lastLivenessBadgeUpdateRef.current > 120
            ) {
              prevLivenessStateRef.current = liv.state;
              lastLivenessBadgeUpdateRef.current = nowTelemetryMs;
              setLivenessResult(liv);
            }

            if (liv.state === 'spoof_blocked') {
              lockedTargetRef.current = null;
              stabilityDetectorRef.current.reset();
              consecutiveSteadyFramesRef.current = 0;
              if (isCountingDownRef.current) {
                cancelCountdownRef.current?.(tRef.current('kiosk_spoof_blocked'));
              }
              const msg = tRef.current('kiosk_spoof_blocked');
              if (prevStatusTextRef.current !== msg) {
                prevStatusTextRef.current = msg;
                setStatusText(msg);
              }
              return;
            }

            // 5. Face Stability Auto-Trigger (อยู่นิ่งหน้าตรงแล้วเริ่มนับทันที)
            const stability = stabilityDetectorRef.current.update(res, dw, dh);

            if (prevPresenceDetectedRef.current !== true) {
              prevPresenceDetectedRef.current = true;
              setPresenceDetected(true);
            }

            const isPoseFrontal = !res.pose || (Math.abs(res.pose.yaw) <= 24 && Math.abs(res.pose.pitch) <= 23);
            if (isPoseFrontal && stability.reason !== 'MOVING') {
              consecutiveSteadyFramesRef.current = (consecutiveSteadyFramesRef.current || 0) + 1;
            } else {
              consecutiveSteadyFramesRef.current = 0;
            }

            // Strict Readiness Gate:
            // Must pass BOTH frontal pose AND stillness (stability.isStable OR >= 3 steady frontal frames)
            const isReadyToScan = evaluatePresenceScanReadiness({
              isPoseFrontal,
              stabilityIsStable: stability.isStable,
              consecutiveSteadyFrames: consecutiveSteadyFramesRef.current,
              stabilityReason: stability.reason,
              livenessState: liv.state,
            });

            if (isReadyToScan) {
              // Face is still and frontal -> Autonomous Zero-Touch Auto-Scan
              if (
                !isCountingDownRef.current &&
                !isScanning &&
                !isProcessingScanRef.current &&
                !isScanningPausedRef.current &&
                !isCoolingDownRef.current &&
                !matchedPatient &&
                rateLimitCooldownSec === 0
              ) {
                startCountdownRef.current?.();
              }
            } else if (!isCountingDownRef.current && !isScanning && !isCoolingDownRef.current) {
              let promptMsg = '🔍 ตรวจพบใบหน้า กรุณามองตรงและอยู่นิ่งๆ...';
              if (stability.reason === 'MOVING') {
                promptMsg = langRef.current === 'zh-CN' ? '👤 请保持静止并直视摄像头...' : langRef.current === 'en-US' ? '👤 Please hold still and look straight...' : '👤 กรุณายืนนิ่งๆ มองตรงที่กล้อง';
              } else if (stability.reason === 'FACE_TOO_FAR') {
                promptMsg = langRef.current === 'zh-CN' ? '请靠近摄像头...' : langRef.current === 'en-US' ? 'Please move closer...' : 'กรุณาขยับเข้าใกล้กล้องอีกนิด';
              } else if (stability.reason === 'FACE_TOO_CLOSE') {
                promptMsg = langRef.current === 'zh-CN' ? '请稍微后退...' : langRef.current === 'en-US' ? 'Please step back slightly...' : 'กรุณาถอยห่างจากกล้องเล็กน้อย';
              } else if (stability.reason === 'NOT_FRONTAL') {
                promptMsg = langRef.current === 'zh-CN' ? '请直视摄像头...' : langRef.current === 'en-US' ? 'Please look straight at camera...' : 'กรุณามองตรงที่กล้อง';
              }
              if (prevStatusTextRef.current !== promptMsg) {
                prevStatusTextRef.current = promptMsg;
                setStatusText(promptMsg);
              }
            }

            inputManager.processFaceDetection(
              {
                x: res.box.x / dw,
                y: res.box.y / dh,
                width: res.box.width / dw,
                height: res.box.height / dh,
              },
              performance.now()
            );
          } else {
            stabilityDetectorRef.current.reset();
            if (lockedTargetRef.current && Date.now() - lockedTargetRef.current.lastSeenTimestamp > KIOSK_CAMERA_STANDARDIZATION_CONFIG.FACE_LOST_TIMEOUT_MS) {
              lockedTargetRef.current = null;
            }
            consecutiveSteadyFramesRef.current = 0;
            const noFaceMsg =
              langRef.current === 'zh-CN'
                ? '👤 请站在摄像头前以自动登录'
                : langRef.current === 'en-US'
                ? '👤 Please stand in front of camera for auto-login'
                : '👤 กรุณาก้าวยืนหน้ากล้องเพื่อเข้าสู่ระบบอัตโนมัติ';
            if (isCountingDownRef.current) {
              cancelCountdownRef.current?.(noFaceMsg);
            }
            if (prevPresenceDetectedRef.current !== false) {
              prevPresenceDetectedRef.current = false;
              setPresenceDetected(false);
            }
            if (prevStatusTextRef.current !== noFaceMsg && !isCoolingDownRef.current) {
              prevStatusTextRef.current = noFaceMsg;
              setStatusText(noFaceMsg);
            }

            inputManager.processFaceDetection(null, performance.now());
          }
        } catch (err) {
          console.warn('[FaceScan] presence inference error:', err);
        } finally {
          isDetectingRef.current = false;
        }
      }
    }, 160);

    return () => {
      clearInterval(presenceInterval);
      unsubscribe();
    };
  }, [cameraReady, isScanningPaused, customDetector, isScanning, matchedPatient, rateLimitCooldownSec]);

  const handleResetScan = () => {
    scanGenerationRef.current += 1;
    clearScanTimers(true);
    wipeTemporaryBiometricBuffers(false);
    stabilityDetectorRef.current.reset();
    isDetectingRef.current = false;
    resetConfirmation();
    setIdentityAnchor(null);
    setFloatingToast(null);
    setUnrecognizedAlert(null);
    setIsAccountNotFound(false);
    consecutiveUnmatchedRoundsRef.current = { count: 0, firstTimestamp: 0 };
    setMatchedPatient(null);
    setLivenessResult(null);
    setSimilarityInfo(null);
    try {
      sessionStorage.removeItem('active_patient_id');
      sessionStorage.removeItem('patient_id');
      sessionStorage.removeItem('drtech_user_profile');
      sessionStorage.removeItem('drtech_auth_token');
      localStorage.removeItem('active_patient_id');
      localStorage.removeItem('patient_id');
      localStorage.removeItem('drtech_user_profile');
    } catch {}
    fastLivenessVerifierRef.current.start();
    consecutiveSteadyFramesRef.current = 0;
    isProcessingScanRef.current = false;
    scanFailureCountRef.current = 0;
    cancelCountdown();
    setStatusText('พร้อมสแกนใบหน้าใหม่...');
  };

  const handleRetryCamera = () => {
    setUserDisabledCamera(false);
    isCameraStartedRef.current = false;
    startCamera();
  };

  // Enforce staff login gate for both Not Found "เจ้าหน้าที่ลงทะเบียนให้" and hidden enroll hook
  const triggerStaffAssistedRegistration = useCallback(() => {
    scanGenerationRef.current += 1;
    clearScanTimers(false);
    wipeTemporaryBiometricBuffers(false);
    setIsAccountNotFound(false);
    setUnrecognizedAlert(null);
    stopCamera();
    if (onStaffAssistedRegister) {
      onStaffAssistedRegister(null);
    } else if (onOpenStaffLoginModal) {
      onOpenStaffLoginModal();
    } else if (onOpenNewPatientModal) {
      onOpenNewPatientModal();
    }
  }, [
    clearScanTimers,
    wipeTemporaryBiometricBuffers,
    stopCamera,
    onStaffAssistedRegister,
    onOpenStaffLoginModal,
    onOpenNewPatientModal,
  ]);

  const handleCallStaffFromModal = useCallback(() => {
    const now = Date.now();
    if (!canSubmitStaffCall(lastManualCallStaffTimeRef.current, now, isCallingStaff, 30000)) {
      return;
    }
    lastManualCallStaffTimeRef.current = now;
    setIsCallingStaff(true);
    setStaffCallCooldownSec(30);
    defaultApiClient.kiosk
      .callStaff({ kiosk_id: 'kiosk-01', reason: 'unrecognized_face_kiosk' })
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current) {
          setIsCallingStaff(false);
        }
      });
    setStatusText(
      lang === 'zh-CN'
        ? '🔔 已呼叫医护人员，请稍候...'
        : lang === 'en-US'
        ? '🔔 Staff alerted, please wait...'
        : '🔔 เรียกเจ้าหน้าที่เรียบร้อยแล้ว กรุณารอสักครู่...'
    );
  }, [isCallingStaff, lang]);

  return (
    <div className="w-full h-full min-h-full flex flex-col justify-center items-center p-3 sm:p-4 md:p-6 bg-gradient-to-b from-[#EBF5FA] via-[#F2F9FC] to-[#E6F4F8] text-slate-900 select-none overflow-hidden font-sans relative">
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '320px',
          height: '240px',
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* Decorative Technical Corner Filigree Frame Ornaments */}
      <CornerOrnament position="top-left" />
      <CornerOrnament position="top-right" />
      <CornerOrnament position="bottom-left" />
      <CornerOrnament position="bottom-right" />

      {/* Unified Master Kiosk Shell Card */}
      <div className="w-full max-w-5xl h-full min-h-[calc(100vh-140px)] sm:min-h-[calc(100vh-160px)] md:min-h-[calc(100vh-180px)] bg-white/95 backdrop-blur-md rounded-[32px] border border-blue-100 shadow-2xl p-4 sm:p-6 flex flex-col justify-between gap-3 sm:gap-4 relative z-10">
        
        {/* 🎥 Hero Camera Scanning Stage (Full Width & Generous Height - Clean Vision Without Frames) */}
        <div className="flex-1 w-full min-h-[460px] md:min-h-[540px] bg-gradient-to-br from-[#07192B] via-[#0B2740] to-[#062826] rounded-3xl border-4 border-white shadow-xl relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
          {cameraDisconnectedError ? (
            /* Camera Disconnected Error State (เมื่อถอดกล้องออก: ไม่ขึ้นจอขาว ไม่ค้าง แสดงข้อความภาษาไทยชัดเจน และมีปุ่มให้กดลองใหม่เมื่อเสียบกลับ) */
            <div
              className="w-full h-full flex flex-col items-center justify-center relative p-6 text-center select-none z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center mb-4 shadow-[0_0_25px_rgba(244,63,94,0.3)]">
                <Camera className="w-10 h-10 text-rose-300" />
              </div>
              <h3 className="text-white text-lg sm:text-xl font-bold mb-2">
                {cameraDisconnectedError}
              </h3>
              <p className="text-rose-200/80 text-xs sm:text-sm max-w-md mb-6">
                ระบบตรวจไม่พบสัญญาณกล้อง โปรดตรวจสอบสายเชื่อมต่อ USB ของกล้องเว็บแคม หรือเสียบใหม่อีกครั้ง
              </p>
              <button
                type="button"
                onClick={() => {
                  setCameraDisconnectedError(null);
                  handleRetryCamera();
                }}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-teal-500/30 flex items-center gap-2 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>ลองใหม่ (ค้นหากล้อง)</span>
              </button>
            </div>
          ) : !cameraReady || userDisabledCamera || isScanningPaused ? (
            /* Standby / Idle State: Center Glowing Scanner Ring */
            <div
              onClick={() => {
                handleRetryCamera();
                executeScanLogin();
              }}
              className="w-full h-full flex flex-col items-center justify-center cursor-pointer group relative p-6 text-center select-none"
              title="แตะเพื่อเปิดกล้องและเริ่มสแกนใบหน้า"
            >
              {/* Subtle ambient lighting & grid */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.18)_0%,rgba(14,165,233,0.1)_40%,transparent_70%)] pointer-events-none" />
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

              {/* Center Glowing Scanner Ring */}
              <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-teal-500/15 border-2 border-teal-400/60 flex flex-col items-center justify-center gap-2.5 shadow-[0_0_35px_rgba(20,184,166,0.25)] group-hover:scale-105 group-hover:border-teal-300 transition-all duration-300 relative z-10">
                <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-300/40 flex items-center justify-center shadow-inner group-hover:bg-teal-500/30 transition">
                  <Camera className="w-8 h-8 sm:w-9 sm:h-9 text-teal-300 group-hover:text-white transition-colors" />
                </div>
                <span className="text-white font-extrabold text-xs sm:text-sm tracking-wide bg-teal-950/90 px-3.5 py-1.5 rounded-full border border-teal-400/50 shadow-sm whitespace-nowrap">
                  แตะเพื่อเปิดกล้องสแกนใบหน้า
                </span>
              </div>

              <div className="mt-4 text-teal-200/80 text-xs sm:text-sm font-medium z-10 flex items-center gap-1.5 whitespace-nowrap">
                <span>🙌</span>
                <span>หรือยกมือทั้งสองข้างขึ้นหน้ากล้องเพื่อเริ่มสแกนอัตโนมัติ</span>
              </div>
            </div>
          ) : (
            /* Active Live Camera Stream */
            <div
              onClick={() => executeScanLogin()}
              className="w-full h-full relative flex items-center justify-center cursor-pointer group"
              title="แตะที่นี่เพื่อสแกนใบหน้าทันที"
            >
              <canvas
                ref={previewCanvasRef}
                className="w-full h-full object-cover transition-all duration-300"
                style={{
                  filter: 'none',
                }}
              />

              {/* Real-time Liveness Telemetry Badge (Hides 3D/EAR numbers on public Kiosk) */}
              <div className="absolute top-3 inset-x-0 flex justify-center z-20 pointer-events-none">
                <LivenessTelemetryBadge
                  state={livenessResult?.state || 'checking'}
                  statusMessageThai={livenessResult?.statusMessageThai}
                  depthScore={livenessResult?.depthScore}
                  ear={livenessResult?.ear}
                  isBlinking={livenessResult?.blinkVerified}
                  hideTelemetryValues={!isStaffOrDebugMode}
                />
              </div>

              {/* Clean Floating Countdown & Score Badge (No obscuring frame) */}
              {countdownValue !== null && (
                <div className="absolute top-16 inset-x-0 flex justify-center pointer-events-none z-20">
                  <div className="px-5 py-2.5 rounded-full bg-emerald-600/95 backdrop-blur-md text-white font-black text-base sm:text-lg shadow-2xl border border-emerald-300/80 flex items-center gap-2.5 animate-bounce">
                    <span className="text-xl">⏱️</span>
                    <span>
                      {lang === 'zh-CN' ? `正在自动扫描 ${countdownValue}...` : lang === 'en-US' ? `Auto-scanning in ${countdownValue}...` : `กำลังสแกนอัตโนมัติใน ${countdownValue}...`}
                    </span>
                    {realtimeScore !== null && isStaffOrDebugMode && isCalibrationOpen && Boolean(matchedPatient) && (
                      <span className="ml-1 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-400">
                        {realtimeScore}%
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Floating Non-Intrusive Diagnostics Toast (Zero-Touch Auto-Retry) */}
              {floatingToast && countdownValue === null && (
                <div className="absolute top-16 inset-x-3 mx-auto max-w-md z-30 pointer-events-none transition-all duration-300">
                  <div className="px-4 py-3 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-amber-400/80 shadow-[0_10px_35px_rgba(245,158,11,0.25)] flex items-center gap-2.5 text-white text-xs sm:text-sm font-semibold">
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-amber-300" />
                    <span className="text-amber-100">{floatingToast}</span>
                  </div>
                </div>
              )}

              {/* Status Pill Badge at bottom of camera box (interactive: click/tap to scan) */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  executeScanLogin();
                }}
                className="absolute bottom-4 px-4 py-2.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-teal-500/40 text-xs sm:text-sm font-bold text-teal-300 flex items-center gap-2 shadow-xl max-w-[90%] truncate z-20 cursor-pointer pointer-events-auto hover:bg-slate-900/95 active:scale-95 transition"
                title="แตะเพื่อเริ่มสแกนใบหน้าทันที"
              >
                {isAutoScanCoolingDown ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
                    <span className="text-amber-200 truncate font-semibold">
                      {statusText || (lang === 'zh-CN' ? '🔄 正在准备重新扫描...' : lang === 'en-US' ? '🔄 Preparing to scan again...' : '🔄 กำลังเตรียมสแกนอีกครั้ง...')}
                    </span>
                  </>
                ) : isScanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-300 shrink-0" />
                    <span className="text-cyan-200 truncate font-bold">
                      {lang === 'zh-CN' ? '⚡ 正在验证生物特征身份...' : lang === 'en-US' ? '⚡ Verifying biometric identity...' : '⚡ กำลังตรวจสอบอัตลักษณ์ชีวมาตร...'}
                    </span>
                  </>
                ) : countdownValue !== null ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-300 shrink-0" />
                    <span className="text-emerald-300 truncate font-bold">
                      {lang === 'zh-CN'
                        ? '⏱️ 请直视摄像头并保持静止，正在自动扫描...'
                        : lang === 'en-US'
                        ? '⏱️ Please look straight and hold still, auto-scanning...'
                        : '⏱️ กรุณามองตรงและอยู่นิ่ง ๆ กำลังสแกนอัตโนมัติ...'}
                    </span>
                  </>
                ) : matchedPatient ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">{t('kiosk_identity_verified')}: คุณ {matchedPatient.first_name}</span>
                  </>
                ) : rateLimitCooldownSec > 0 ? (
                  <>
                    <span className="text-amber-300 font-bold shrink-0">⏳ คูลดาวน์ {rateLimitCooldownSec}s</span>
                  </>
                ) : livenessResult?.state === 'spoof_blocked' ? (
                  <>
                    <span className="text-rose-300 font-semibold truncate">{t('kiosk_spoof_blocked')}</span>
                  </>
                ) : presenceDetected ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-300 shrink-0" />
                    <span className="text-emerald-300 font-semibold truncate">
                      {statusText || (lang === 'zh-CN' ? '🔍 已检测到人脸，正在开始自动扫描...' : lang === 'en-US' ? '🔍 Face detected. Auto-scanning...' : '🔍 ตรวจพบใบหน้า กำลังเริ่มสแกนอัตโนมัติ...')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-300 font-medium truncate">
                      {lang === 'zh-CN' ? '👤 请站在摄像头前以自动登录' : lang === 'en-US' ? '👤 Please stand in front of camera for auto-login' : '👤 กรุณาก้าวยืนหน้ากล้องเพื่อเข้าสู่ระบบอัตโนมัติ'}
                    </span>
                  </>
                )}
              </div>

              {/* Calibration Mode HUD Overlay (Staff/Debug mode only) */}
              {isStaffOrDebugMode && isCalibrationOpen && (
                <div
                  className="absolute top-10 left-3 right-3 bg-slate-950/95 backdrop-blur-md border border-cyan-400/50 rounded-xl p-3 text-xs font-mono text-cyan-200 z-30 shadow-2xl space-y-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-cyan-500/30 pb-1">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      🎯 Staff Biometric & Camera Standardization HUD
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCalibrationOpen(false)}
                      className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-[10px] text-cyan-300 pb-0.5 border-b border-slate-800 flex items-center justify-between">
                    <span>Host: <b className="text-white">{typeof window !== 'undefined' ? window.location.host : 'kiosk-local'}</b></span>
                    <span>Camera: <b className="text-emerald-400 truncate max-w-[150px] inline-block align-bottom">{activeCameraLabel}</b></span>
                  </div>
                  <div className="text-[10px] text-slate-300 pb-0.5 border-b border-slate-800 grid grid-cols-2 gap-x-2 gap-y-0.5">
                    <div>Stream: <b className="text-white">{activeSettings?.width || 640}x{activeSettings?.height || 480} (4:3)</b></div>
                    <div>Face Ratio: <b className="text-cyan-300">{(currentTelemetry.faceHeightRatio * 100).toFixed(1)}%</b> <span className="text-[9px] text-slate-400">(Std: 45%)</span></div>
                    <div>Sharpness: <b className={currentTelemetry.sharpness >= 15 ? 'text-emerald-400' : 'text-amber-400'}>{currentTelemetry.sharpness.toFixed(1)}</b> <span className="text-[9px] text-slate-400">(min 15)</span></div>
                    <div>Brightness: <b className={currentTelemetry.brightness >= 35 && currentTelemetry.brightness <= 225 ? 'text-emerald-400' : 'text-amber-400'}>{currentTelemetry.brightness.toFixed(0)}</b> <span className="text-[9px] text-slate-400">(35-225)</span></div>
                    <div>HW Zoom: <b className="text-white">{activeCapabilities?.zoom ? `${activeCapabilities.zoom.min}-${activeCapabilities.zoom.max}x` : 'N/A (Active 112px ROI Lock)'}</b></div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    <div>cos(θ): <b className="text-white">{calibrationStats?.currentCos.toFixed(3) ?? '0.000'}</b></div>
                    <div>Euclid: <b className="text-white">{calibrationStats?.currentDist.toFixed(3) ?? '2.000'}</b></div>
                    <div>Score: <b className="text-emerald-400">{calibrationStats?.currentPercent ?? 0}%</b></div>
                    <div>3D Depth: <b className="text-white">{livenessResult?.depthScore.toFixed(3) ?? '0.000'}</b></div>
                    <div>EAR: <b className="text-white">{livenessResult?.ear?.toFixed(2) ?? '0.00'}</b></div>
                    <div>Liveness: <b className={livenessResult?.isLive ? 'text-emerald-400' : 'text-amber-400'}>{livenessResult?.state ?? 'idle'}</b></div>
                  </div>
                  <div className="text-[10px] text-slate-300 pt-0.5 border-t border-slate-800">
                    Samples: <b className="text-white">{calibrationStats?.samplesCount ?? 0}</b> | Median: <b className="text-emerald-300">{calibrationStats?.medianPercent ?? 0}%</b> (Min: {calibrationStats?.minPercent ?? 0}% / Max: {calibrationStats?.maxPercent ?? 0}%)
                  </div>
                  {calibrationStats?.top1 && (
                    <div className="text-[11px] text-emerald-300 truncate">
                      Top 1: {calibrationStats.top1.name} ({calibrationStats.top1.hn}) - {calibrationStats.top1.score}%
                    </div>
                  )}
                  {calibrationStats?.top2 && (
                    <div className="text-[11px] text-slate-400 truncate">
                      Top 2: {calibrationStats.top2.name} ({calibrationStats.top2.hn}) - {calibrationStats.top2.score}%
                    </div>
                  )}
                </div>
              )}

              {/* Camera Orientation Controls & Calibration Button */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 z-20" onClick={(e) => e.stopPropagation()}>
                {availableCameras.length > 1 && (() => {
                  const currentIdx = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
                  const displayIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
                  return (
                    <button
                      type="button"
                      onClick={handleSwitchCamera}
                      className="px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-white text-[11px] font-semibold flex items-center gap-1.5 backdrop-blur-sm transition border border-white/20 cursor-pointer"
                      title={`สลับกล้อง (${activeCameraLabel})`}
                    >
                      <Camera className="w-3.5 h-3.5 text-cyan-300" />
                      <span>กล้อง {displayIdx}/{availableCameras.length}</span>
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => {
                    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
                    const next = rotations[(rotations.indexOf(cameraRotation) + 1) % rotations.length];
                    setCameraRotation(next);
                    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
                    services.camera.setRotation(next);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-white text-[11px] font-semibold flex items-center gap-1 backdrop-blur-sm transition border border-white/20 cursor-pointer"
                  title="หมุนกล้อง 90 องศา"
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-300" />
                  <span>{cameraRotation}°</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMirrored((prev) => !prev);
                    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
                    services.camera.setMirrorPreview(!isMirrored);
                  }}
                  className={`p-1.5 rounded-lg text-white text-[11px] font-semibold flex items-center backdrop-blur-sm transition border border-white/20 cursor-pointer ${
                    isMirrored ? 'bg-emerald-600/70' : 'bg-black/60'
                  }`}
                  title="สลับกลับหัว / กระจก"
                >
                  <FlipHorizontal className="w-3.5 h-3.5 text-emerald-300" />
                </button>
                {isStaffOrDebugMode && (
                  <button
                    type="button"
                    onClick={() => setIsCalibrationOpen((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-white text-[11px] font-semibold flex items-center gap-1 backdrop-blur-sm transition border border-white/20 cursor-pointer ${
                      isCalibrationOpen ? 'bg-cyan-600/80 border-cyan-400' : 'bg-black/60 hover:bg-black/80'
                    }`}
                    title="เปิด/ปิดโหมดสอบเทียบ (Calibration Mode)"
                  >
                    <Activity className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Calib</span>
                  </button>
                )}
              </div>

              {/* Close/Toggle Camera button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserDisabledCamera(true);
                  stopCamera();
                }}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-rose-600 transition cursor-pointer z-20"
                title="หยุดสแกน / พักกล้อง"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* 🧭 Action Dock Below Camera */}
        <div className="w-full flex flex-col gap-3 shrink-0">
          {/* Hidden from patient view per UX Option A (Always routes through staff login gate) */}
          <button
            type="button"
            id="kiosk-enroll-new-btn"
            data-testid="kiosk-enroll-new-btn"
            aria-hidden="true"
            onClick={triggerStaffAssistedRegistration}
            className="hidden"
          >
            <UserPlus className="w-5 h-5 text-blue-600 shrink-0" />
            <span className="whitespace-nowrap">สมัครคนไข้ใหม่</span>
          </button>

          {/* Security Footer Line */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500 gap-2 select-none shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <span>🛡️</span>
              <span className="truncate">มาตรฐานชีวมาตร • เชื่อมต่อ Supabase Cloud สด</span>
            </div>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setIsAboutModalOpen(true);
              }}
              className="px-3 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 font-medium text-xs transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>เกี่ยวกับระบบ</span>
            </button>
          </div>
        </div>

      </div>

      {/* Modal: Identity Confirmation when Matched */}
      {matchedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border-2 border-emerald-500/50 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-24 h-24 rounded-full mx-auto p-1 bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-xl mb-4 flex items-center justify-center overflow-hidden">
              {matchedPatient.biometrics?.registered_face_url ? (
                <img
                  src={matchedPatient.biometrics.registered_face_url}
                  alt="Profile Face"
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-emerald-700 text-white flex items-center justify-center text-3xl font-black">
                  {matchedPatient.first_name?.[0] || 'P'}
                </div>
              )}
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>ความแม่นยำชีวมาตร {similarityInfo?.percent}% (ผ่านเกณฑ์)</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              คุณ {matchedPatient.first_name}{matchedPatient.last_name && matchedPatient.last_name !== '-' ? ` ${matchedPatient.last_name}` : ''}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              HN: <span className="font-mono text-blue-600">{matchedPatient.hn}</span> • อายุ: {matchedPatient.age} ปี
            </p>

            {/* Gesture Prompt & Real-time Thai Feedback */}
            <div
              className={`my-4 p-3.5 rounded-2xl border transition-all duration-200 relative overflow-hidden ${
                gestureStatus === 'holding' || gestureStatus === 'confirmed'
                  ? 'bg-emerald-50/90 border-emerald-400 shadow-sm'
                  : gestureStatus === 'single_hand_detected'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : gestureStatus === 'low_visibility_or_out_of_frame'
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <div
                ref={topProgressBarRef}
                className="absolute inset-y-0 left-0 bg-emerald-200/50 pointer-events-none origin-left"
                style={{
                  transform: 'scaleX(0)',
                  willChange: 'transform',
                  width: '100%',
                }}
              />

              <div className="relative z-10 flex items-center justify-center gap-2 text-xs font-bold">
                <span className={`text-xl ${gestureStatus === 'holding' ? 'animate-pulse' : ''}`}>
                  {gestureStatus === 'holding'
                    ? '⏳'
                    : gestureStatus === 'single_hand_detected'
                      ? '🙋'
                      : gestureStatus === 'low_visibility_or_out_of_frame'
                        ? '📐'
                        : gestureStatus === 'confirmed'
                          ? '✅'
                          : '🙌'}
                </span>
                <span className="leading-snug text-center">{gestureMessage}</span>
              </div>
            </div>

            {/* Clinical Accessibility Fallback */}
            {showAccessibilityFallbackHint && (
              <div className="mb-3 p-3 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-900 text-xs font-medium text-left flex items-start gap-2 animate-fade-in shadow-xs">
                <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
                <span className="leading-relaxed">
                  หากยกมือไม่สะดวก กดปุ่มสีเขียวด้านล่างเพื่อเริ่มได้ทันที (ไม่จำเป็นต้องฝืนยกแขน)
                </span>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-3">
              <button
                type="button"
                id="kiosk-confirm-ready-btn"
                data-testid="kiosk-confirm-ready-btn"
                onClick={handleManualConfirm}
                className="touch-btn relative overflow-hidden w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-base shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99] transition select-none"
              >
                <div
                  ref={bottomProgressBarRef}
                  className="absolute inset-y-0 left-0 bg-emerald-400/40 backdrop-brightness-110 pointer-events-none origin-left"
                  style={{
                    transform: 'scaleX(0)',
                    willChange: 'transform',
                    width: '100%',
                  }}
                />

                <div className="relative z-10 flex items-center gap-2">
                  <span
                    ref={spinnerContainerRef}
                    style={{ display: 'none' }}
                  >
                    <svg className="w-5 h-5 -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-emerald-800/40"
                        strokeWidth="4"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        ref={spinnerPathRef}
                        className="text-white"
                        strokeDasharray="0, 100"
                        strokeWidth="4"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        style={{ willChange: 'stroke-dasharray' }}
                      />
                    </svg>
                  </span>
                  <span ref={buttonTextRef}>
                    👐 ยก 2 มือขึ้น หรือ กดที่นี่เพื่อเริ่มฝึก ➔
                  </span>
                </div>
              </button>

              <button
                type="button"
                id="kiosk-reset-scan-btn"
                data-testid="kiosk-reset-scan-btn"
                onClick={handleResetScan}
                className="text-xs text-slate-500 hover:text-slate-700 underline py-1 transition cursor-pointer"
              >
                ไม่ใช่ฉัน (สแกนใหม่)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Account Not Found (Dedicated Stranger / Unmatched Screen) */}
      <KioskAccountNotFoundModal
        isOpen={Boolean(isAccountNotFound || unrecognizedAlert)}
        lang={lang}
        t={t}
        notFoundRemainingSec={notFoundRemainingSec}
        isCallingStaff={isCallingStaff}
        staffCallCooldownSec={staffCallCooldownSec}
        isRetryCooldownActive={isRetryCooldownActive}
        onStaffRegister={triggerStaffAssistedRegistration}
        onCallStaff={handleCallStaffFromModal}
        onRetryScan={handleNotFoundRetryScan}
      />

      {/* Modal: About System */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-emerald-500/30 p-6 text-center shadow-2xl relative animate-scale-up">
            <button
              type="button"
              onClick={() => setIsAboutModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
              🏥
            </div>
            <h3 className="text-lg font-bold text-slate-800">เกี่ยวกับระบบ Dr.Tech.Care</h3>
            <p className="text-xs text-slate-500 mt-0.5">Enterprise Hospital Physical Therapy Platform v6.0</p>

            <div className="space-y-2 mt-4 text-left">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🟢</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">3D Hybrid Face Recognition &amp; Multi-Frame Aggregation</div>
                  <div className="text-[11px] text-slate-500">วิเคราะห์โครงสร้าง 3 มิติ 478 จุดร่วมกับ Burst Frame ที่คมชัดที่สุด</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🛡️</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">3D Depth & Active Liveness Guard</div>
                  <div className="text-[11px] text-slate-500">ระบบตรวจสอบความมีชีวิต ป้องกันภาพถ่าย วิดีโอ และการสวมรอย</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🙌</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">Touchless Clinical Gesture Readiness</div>
                  <div className="text-[11px] text-slate-500">ยืนยันความพร้อมด้วยการยกมือทั้งสองข้างแบบไร้สัมผัส</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAboutModalOpen(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}

      {/* Loading / Transitioning Screen */}
      {isTransitioning && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-6 shadow-2xl">
            <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {lang === 'zh-CN' ? '正在准备康复方案...' : lang === 'en-US' ? 'Preparing Rehab Program...' : 'กำลังเตรียมข้อมูลและดึงตารางกายภาพบำบัด...'}
          </h2>
          <p className="text-sm text-slate-400 max-w-md">
            {lang === 'zh-CN' ? `欢迎，${matchedPatient?.first_name || ''}。正在同步今日训练计划` : lang === 'en-US' ? `Welcome, ${matchedPatient?.first_name || ''}. Syncing today's schedule.` : `ยินดีต้อนรับ คุณ ${matchedPatient?.first_name || ''} ระบบกำลังซิงค์ตารางฝึกประจำวันนี้`}
          </p>
        </div>
      )}
    </div>
  );
};
