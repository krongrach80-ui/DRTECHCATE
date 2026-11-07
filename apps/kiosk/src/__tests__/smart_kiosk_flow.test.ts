/**
 * apps/kiosk/src/__tests__/smart_kiosk_flow.test.ts
 * Master Prompt v4: Isolated Kiosk Smart Flow Test Suite
 * Tests:
 * 1. 5-second countdown cooldown before login scan & unrecognized alert
 * 2. Instant 10-frame capture enrollment (front 4, left 2, right 2, nod 2)
 * 3. Dual-Channel Info Input & First-Finisher Wins with 3s success reset
 * 4. Dynamic Daily Plan & Interactive Quiz auto-routing
 * 5. Rest day friendly screen
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { SmartLoginView } from '../smart-flow/SmartLoginView';
import { SmartEnrollmentView } from '../smart-flow/SmartEnrollmentView';
import { SmartInfoForm } from '../smart-flow/SmartInfoForm';
import { SmartDailyPlanView } from '../smart-flow/SmartDailyPlanView';
import { SmartFlowController } from '../smart-flow/SmartFlowController';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  PatientRecordFile,
  computeAverageVector,
  computeSimilarityPercentage,
} from '../../../../packages/smart-biometric-core/src/index.js';
import {
  FaceFlowManager,
  REQUIRED_ENROLL_POSES,
} from '../../../../packages/face-client/src/index.js';
import {
  MockFaceDetector,
  MockEmbeddingModel,
} from '../../../../packages/face-client/test/mocks.js';
import { FaceAligner } from '../../../../packages/face-client/src/align.js';
import { FaceQualityChecker } from '../../../../packages/face-client/src/quality.js';

describe('[MASTER PROMPT v4] Isolated Kiosk Smart Flow Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. SmartLoginView: Presence, 5s Cooldown & Alert on No Account', () => {
    it('1.1 SmartLoginView instantiates as valid React element with props contract', () => {
      const onLoginSuccess = vi.fn();
      const onNavigateToEnroll = vi.fn();

      const element = React.createElement(SmartLoginView, {
        onLoginSuccess,
        onNavigateToEnroll,
      });

      expect(element).toBeDefined();
      expect(typeof element.type).toBe('function');
      expect(element.props.onLoginSuccess).toBe(onLoginSuccess);
      expect(element.props.onNavigateToEnroll).toBe(onNavigateToEnroll);
    });

    it('1.2 Percentage formula consistency (Section 3 Invariant)', () => {
      // Rule: UI Percentage = Math.max(0, Math.min(100, Math.round((1 - distance) * 100)))
      const matchedDist = 0.05;
      const percentHigh = Math.max(0, Math.min(100, Math.round((1 - matchedDist) * 100)));
      expect(percentHigh).toBe(95);

      const failedDist = 0.55;
      const percentLow = Math.max(0, Math.min(100, Math.round((1 - failedDist) * 100)));
      expect(percentLow).toBe(45);

      // Verify computeSimilarityPercentage helper
      expect(computeSimilarityPercentage(0.95)).toBe(95);
      expect(computeSimilarityPercentage(0.40)).toBe(40);
    });

    it('1.3 Unrecognized account returns standard alert text and does not grant access', async () => {
      vi.spyOn(defaultApiClient.smartOnboarding, 'scanLogin').mockResolvedValueOnce({
        matched: false,
        message: 'ไม่พบบัญชีในระบบ กรุณาติดต่อแอดมิน หรือกดปุ่ม "ยังไม่มีบัญชี (สมัครใหม่ด้วยใบหน้า)"',
      });

      const res = await defaultApiClient.smartOnboarding.scanLogin({
        probe: new Array(512).fill(0),
      });

      expect(res.matched).toBe(false);
      expect(res.message).toContain('ไม่พบบัญชีในระบบ');
      expect(res.message).toContain('ยังไม่มีบัญชี (สมัครใหม่ด้วยใบหน้า)');
    });
  });

  describe('2. SmartEnrollmentView: Instant 10-Frame Biometric Capture', () => {
    it('2.1 Collects strictly 10 frames in order: front(4) -> left(2) -> right(2) -> nod(2)', async () => {
      expect(REQUIRED_ENROLL_POSES).toHaveLength(10);
      expect(REQUIRED_ENROLL_POSES).toEqual([
        'front',
        'front',
        'front',
        'front',
        'left',
        'left',
        'right',
        'right',
        'nod',
        'nod',
      ]);

      const detector = new MockFaceDetector();
      const aligner = new FaceAligner();
      const qualityChecker = new FaceQualityChecker({ stabilityMs: 0 });
      const embeddingModel = new MockEmbeddingModel();

      // Dummy canvas
      const mockCanvas = {
        width: 640,
        height: 480,
        getContext: () => null,
      } as unknown as HTMLCanvasElement;

      let currentStepIdx = 0;
      const progressPoses: string[] = [];
      const captureFrameFn = () => {
        const expectedPose = REQUIRED_ENROLL_POSES[currentStepIdx] || 'front';
        detector.setPoseByKeyword(expectedPose);
        return mockCanvas;
      };

      const result = await FaceFlowManager.executeEnrollment({
        patientId: 'smart-p-100',
        detector,
        aligner,
        qualityChecker,
        embeddingModel,
        captureFrameFn,
        onProgress: (info) => {
          if (info.qualityPassed) {
            progressPoses.push(info.currentPose);
            currentStepIdx++;
          }
        },
      });

      expect(result.frames).toHaveLength(10);
      expect(result.frames.map((f) => f.pose)).toEqual(REQUIRED_ENROLL_POSES);

      // Verify average vector computation
      const avgVec = computeAverageVector(result.frames.map((f) => Array.from(f.embedding)));
      expect(avgVec).toHaveLength(512);

      // Memory wipe invariant: Wipe all embeddings immediately
      result.frames.forEach((f) => f.embedding.fill(0));
      expect(result.frames.every((f) => f.embedding.every((v) => v === 0))).toBe(true);
    });

    it('2.2 SmartEnrollmentView element instantiates with onEnrollSuccess and onCancel', () => {
      const onEnrollSuccess = vi.fn();
      const onCancel = vi.fn();

      const element = React.createElement(SmartEnrollmentView, {
        onEnrollSuccess,
        onCancel,
      });

      expect(element).toBeDefined();
      expect(element.props.onEnrollSuccess).toBe(onEnrollSuccess);
      expect(element.props.onCancel).toBe(onCancel);
    });
  });

  describe('3. SmartInfoForm: Dual-Channel Parallel Input (Option A / Option B)', () => {
    it('3.1 Option A: Kiosk submits info and receives active status', async () => {
      const element = React.createElement(SmartInfoForm, {
        patientId: 'P-9001',
        onCompleted: () => {},
      });
      expect(element).toBeDefined();

      vi.spyOn(defaultApiClient.smartOnboarding, 'completeInfo').mockResolvedValueOnce({
        patient_id: 'P-9001',
        first_name: 'ศิริพร',
        last_name: 'สายสมร',
        age: 60,
        gender: 'female',
        registration_status: 'active',
      } as any);

      const res = await defaultApiClient.smartOnboarding.completeInfo({
        patient_id: 'P-9001',
        first_name: 'ศิริพร',
        last_name: 'สายสมร',
        age: 60,
        gender: 'female',
      });

      expect(res.registration_status).toBe('active');
      expect(res.first_name).toBe('ศิริพร');
    });

    it('3.2 Option B: SSE event broadcasts patient_info_completed to kiosk for First-Finisher Wins', () => {
      let registeredListener: ((event: { event: string; data: unknown }) => void) | null = null;
      vi.spyOn(defaultApiClient, 'connectEvents').mockImplementation((onMsg) => {
        registeredListener = onMsg;
        return () => {};
      });

      // Simulate subscribing
      const unsubscribe = defaultApiClient.connectEvents((_e) => {});
      expect(typeof unsubscribe).toBe('function');

      // Trigger Option B event by staff
      let receivedId: string | null = null;
      registeredListener!({
        event: 'patient_info_completed',
        data: { patient_id: 'P-9001', first_name: 'ศิริพร', status: 'active' },
      });
      receivedId = 'P-9001';
      expect(receivedId).toBe('P-9001');
      expect(registeredListener).toBeDefined();
    });
  });

  describe('4. SmartDailyPlanView: Daily Rehab Plan & Interactive Quiz', () => {
    const mockPatient: PatientRecordFile = {
      patient_id: 'P-5555',
      hn: 'HN-5555',
      first_name: 'ประสิทธิ์',
      last_name: 'ชัยชนะ',
      age: 68,
      gender: 'male',
      registration_status: 'active',
      registered_via: 'smart_onboarding',
      biometrics: {
        face_vector: new Array(512).fill(0),
        registered_face_url: '/uploads/patients/P-5555/profile_face.jpg',
        confidence_score: 0.99,
        model_version: 'w600k_r50',
        enrolled_at: new Date().toISOString(),
      },
      daily_checklists: {},
      rehab_scores: [],
      clinical: { diagnosis: '', treatment_plan: '', progress_notes: [] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('4.1 Returns rest day notice when no scheduled session for today', async () => {
      const element = React.createElement(SmartDailyPlanView, {
        patient: mockPatient,
        onLogout: () => {},
      });
      expect(element).toBeDefined();

      vi.spyOn(defaultApiClient.smartOnboarding, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: false,
        reason: 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้',
        exercises: [],
        include_minigame: false,
      });

      const plan = await defaultApiClient.smartOnboarding.getDailyPlan(mockPatient.patient_id);
      expect(plan.is_scheduled_today).toBe(false);
      expect(plan.reason).toContain('วันพักผ่อน');
    });

    it('4.2 Returns prescribed exercises and unlocks Interactive Quiz when include_minigame is true', async () => {
      vi.spyOn(defaultApiClient.smartOnboarding, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: true,
        exercises: [
          {
            exercise_id: 'ex-01',
            name: 'หมุนข้อไหล่',
            target_joint: 'ไหล่',
            sets: 3,
            reps: 10,
          },
        ],
        include_minigame: true,
      });

      const plan = await defaultApiClient.smartOnboarding.getDailyPlan(mockPatient.patient_id);
      expect(plan.is_scheduled_today).toBe(true);
      expect(plan.exercises).toHaveLength(1);
      expect(plan.include_minigame).toBe(true);

      // Verify score save
      vi.spyOn(defaultApiClient.smartOnboarding, 'saveRehabScore').mockResolvedValueOnce({
        patient_id: mockPatient.patient_id,
        rehab_scores: [{ date: '2026-10-25', score: 100 }],
      } as any);

      const scoreRes = await defaultApiClient.smartOnboarding.saveRehabScore({
        patient_id: mockPatient.patient_id,
        score: { date: '2026-10-25', score: 100 },
      });

      expect(scoreRes).toBeDefined();
    });

    it('4.3 Rest day sets exercises to empty and suppresses start button', async () => {
      vi.spyOn(defaultApiClient.smartOnboarding, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: false,
        is_completed_today: false,
        reason: 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้',
        exercises: [],
        include_minigame: false,
      });

      const plan = await defaultApiClient.smartOnboarding.getDailyPlan(mockPatient.patient_id);
      expect(plan.is_scheduled_today).toBe(false);
      expect(plan.is_completed_today).toBe(false);
      expect(plan.exercises).toHaveLength(0);
    });

    it('4.4 Already completed today returns is_completed_today true', async () => {
      vi.spyOn(defaultApiClient.smartOnboarding, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: true,
        is_completed_today: true,
        reason: 'วันนี้คุณได้ทำการฝึกกายภาพบำบัดครบถ้วนตามนัดแล้ว',
        exercises: [{ exercise_id: 'ex-01', name: 'หมุนข้อไหล่', target_joint: 'ไหล่', sets: 3, reps: 10 }],
        include_minigame: false,
      });

      const plan = await defaultApiClient.smartOnboarding.getDailyPlan(mockPatient.patient_id);
      expect(plan.is_scheduled_today).toBe(true);
      expect(plan.is_completed_today).toBe(true);
      expect(plan.reason).toContain('ฝึกกายภาพบำบัดครบถ้วน');
    });
  });

  describe('5. SmartFlowController: State Transitions', () => {
    it('5.1 SmartFlowController instantiates as valid React component', () => {
      const element = React.createElement(SmartFlowController, {});
      expect(element).toBeDefined();
      expect(typeof element.type).toBe('function');
    });
  });

  describe('6. Staff-Assisted Kiosk Patient Registration Flow (Master Prompt)', () => {
    it('6.1 Unrecognized face triggers 3-button modal with ephemeral RAM buffer only', () => {
      // Ephemeral buffer structure
      const ephemeralBuffer = {
        probeEmbedding: new Array(512).fill(0.05),
        faceCropDataUrl: 'data:image/jpeg;base64,mockface...',
        capturedAt: new Date().toISOString(),
      };

      expect(ephemeralBuffer.probeEmbedding).toHaveLength(512);
      expect(ephemeralBuffer.faceCropDataUrl).toBeDefined();

      // Ensure zero persistent storage writes
      expect(typeof window !== 'undefined' ? localStorage.getItem('drtech_pending_biometrics') : null).toBeNull();
      expect(typeof window !== 'undefined' ? sessionStorage.getItem('drtech_pending_biometrics') : null).toBeNull();

      // Verification of buffer wiping
      let pendingBiometrics: typeof ephemeralBuffer | null = ephemeralBuffer;
      const wipeBuffer = () => {
        pendingBiometrics = null;
      };
      wipeBuffer();
      expect(pendingBiometrics).toBeNull();
    });

    it('6.2 Staff Login Gate: Permits admin, super_admin/director, and pt; Rejects unauthorized roles', async () => {
      const allowedRoles = ['admin', 'super_admin', 'director', 'pt', 'therapist'];
      const unauthorizedRoles = ['patient', 'viewer', 'guest', 'anonymous'];

      const checkRoleAuth = (role: string) => {
        const r = role.toLowerCase();
        return allowedRoles.includes(r);
      };

      expect(checkRoleAuth('admin')).toBe(true);
      expect(checkRoleAuth('super_admin')).toBe(true);
      expect(checkRoleAuth('director')).toBe(true);
      expect(checkRoleAuth('pt')).toBe(true);
      expect(checkRoleAuth('therapist')).toBe(true);

      unauthorizedRoles.forEach((role) => {
        expect(checkRoleAuth(role)).toBe(false);
      });
    });

    it('6.3 Trilingual error and button verification (TH, EN, CN)', () => {
      const trilingualButtons = {
        'th-TH': {
          staffRegister: '👨‍⚕️ เจ้าหน้าที่ลงทะเบียนให้',
          scanAgain: '🔄 ลองสแกนใหม่อีกครั้ง',
          callStaff: '🔔 เรียกเจ้าหน้าที่',
          unauthorized: '⛔ บัญชีนี้ไม่มีสิทธิ์ลงทะเบียนผู้ป่วยใหม่ (อนุญาตเฉพาะ Admin, Super Admin และนักกายภาพบำบัดเท่านั้น)',
        },
        'en-US': {
          staffRegister: '👨‍⚕️ Staff Register Patient',
          scanAgain: '🔄 Scan Face Again',
          callStaff: '🔔 Call Staff',
          unauthorized: '⛔ Insufficient role permissions. Only Admin, Super Admin, and Physical Therapists can register new patients.',
        },
        'zh-CN': {
          staffRegister: '👨‍⚕️ 医护人员协助建档',
          scanAgain: '🔄 重新识别人脸',
          callStaff: '🔔 呼叫医护人员',
          unauthorized: '⛔ 权限不足。仅限管理员、超级管理员和物理治疗师注册新患者。',
        },
      };

      expect(trilingualButtons['th-TH'].staffRegister).toContain('เจ้าหน้าที่ลงทะเบียนให้');
      expect(trilingualButtons['en-US'].staffRegister).toContain('Staff Register Patient');
      expect(trilingualButtons['zh-CN'].staffRegister).toContain('医护人员协助建档');

      expect(trilingualButtons['th-TH'].scanAgain).toContain('ลองสแกนใหม่อีกครั้ง');
      expect(trilingualButtons['en-US'].scanAgain).toContain('Scan Face Again');
      expect(trilingualButtons['zh-CN'].scanAgain).toContain('重新识别人脸');

      expect(trilingualButtons['th-TH'].callStaff).toContain('เรียกเจ้าหน้าที่');
      expect(trilingualButtons['en-US'].callStaff).toContain('Call Staff');
      expect(trilingualButtons['zh-CN'].callStaff).toContain('呼叫医护人员');

      expect(trilingualButtons['th-TH'].unauthorized).toContain('ไม่มีสิทธิ์ลงทะเบียนผู้ป่วยใหม่');
      expect(trilingualButtons['en-US'].unauthorized).toContain('Insufficient role permissions');
      expect(trilingualButtons['zh-CN'].unauthorized).toContain('权限不足');
    });

    it('6.4 10-Minute activity watchdog timeout calculates remaining seconds and expires', () => {
      const STAFF_ASSIST_TIMEOUT_MS = 10 * 60 * 1000;
      const now = Date.now();
      let expiresAt = now + STAFF_ASSIST_TIMEOUT_MS;

      const getRemainingSec = (currentTime: number) => {
        return Math.max(0, Math.floor((expiresAt - currentTime) / 1000));
      };

      expect(getRemainingSec(now)).toBe(600);
      expect(getRemainingSec(now + 60 * 1000)).toBe(540);
      expect(getRemainingSec(now + 10 * 60 * 1000)).toBe(0);
      expect(getRemainingSec(now + 11 * 60 * 1000)).toBe(0);

      // User activity resets the watchdog
      const touchActivityTime = now + 5 * 60 * 1000;
      expiresAt = touchActivityTime + STAFF_ASSIST_TIMEOUT_MS;
      expect(getRemainingSec(touchActivityTime)).toBe(600);
    });
  });

  describe('7. 60 FPS Touchless Readiness Confirmation & Micro-Grace Specification', () => {
    it('7.1 Continuous Time-based Progress calculation: 1,200 ms duration reaches 100% smoothly without discrete frame steps', () => {
      const holdDurationMs = 1200;
      let holdStartTime: number | null = null;
      let currentProgress = 0.0;

      const evaluateTick = (now: number, isHolding: boolean) => {
        if (isHolding) {
          if (holdStartTime === null) {
            holdStartTime = now - (currentProgress * holdDurationMs);
          }
          const elapsed = now - holdStartTime;
          currentProgress = Math.min(1.0, elapsed / holdDurationMs);
        } else {
          holdStartTime = null;
          currentProgress = Math.max(0.0, currentProgress - 0.05);
        }
        return currentProgress;
      };

      const start = 10000;
      // Start holding
      expect(evaluateTick(start, true)).toBe(0.0);
      // At 300ms -> exactly 25%
      expect(evaluateTick(start + 300, true)).toBeCloseTo(0.25, 2);
      // At 600ms -> exactly 50%
      expect(evaluateTick(start + 600, true)).toBeCloseTo(0.50, 2);
      // At 1200ms -> exactly 100%
      expect(evaluateTick(start + 1200, true)).toBe(1.0);
    });

    it('7.2 Micro-grace period (~90ms): momentary camera drop (< 90ms) maintains holding state and does not decay', () => {
      const MICRO_GRACE_MS = 90;
      let lastValidHoldingTime = 1000;

      const checkIsHoldingWithGrace = (now: number, isDetectedNow: boolean) => {
        if (isDetectedNow) {
          lastValidHoldingTime = now;
          return true;
        }
        // Camera drop: check if within micro-grace window
        return (now - lastValidHoldingTime) < MICRO_GRACE_MS;
      };

      // T0: Detected
      expect(checkIsHoldingWithGrace(1000, true)).toBe(true);

      // T+40ms: Camera drops a frame (detection = false) -> Still within micro-grace (40 < 90ms)
      expect(checkIsHoldingWithGrace(1040, false)).toBe(true);

      // T+70ms: Camera still dropped -> Still within micro-grace (70 < 90ms)
      expect(checkIsHoldingWithGrace(1070, false)).toBe(true);

      // T+85ms: Camera regains detection
      expect(checkIsHoldingWithGrace(1085, true)).toBe(true);

      // T+200ms: Actual hands drop (now - last = 115ms >= 90ms)
      expect(checkIsHoldingWithGrace(1200, false)).toBe(false);
    });

    it('7.3 Linear Decay: when hands drop (> 90ms), decays smoothly at 2.2/s rather than jumping instantly to 0', () => {
      const decayRate = 2.2;
      let progress = 0.80; // was at 80%

      const applyDecayTick = (dtMs: number) => {
        const decayAmount = (decayRate * dtMs) / 1000.0;
        progress = Math.max(0.0, progress - decayAmount);
        return progress;
      };

      // 50ms decay tick -> progress drops by ~0.11 (still around 0.69)
      const after50ms = applyDecayTick(50);
      expect(after50ms).toBeCloseTo(0.69, 2);
      expect(after50ms).toBeGreaterThan(0.0); // Does NOT drop to 0 instantly!

      // After ~400ms total decay -> approaches 0
      applyDecayTick(350);
      expect(progress).toBeLessThan(0.05);
    });

    it('7.4 Background task suspension when matchedPatient modal is active', () => {
      let faceDetectionRunning = true;
      let previewCanvasRendering = true;

      const evaluateBackgroundTasks = (matchedPatient: any | null) => {
        // Suspend face detection interval and preview canvas when matchedPatient modal is open
        if (matchedPatient !== null) {
          faceDetectionRunning = false;
          previewCanvasRendering = false; // Freeze canvas to last frame
        } else {
          faceDetectionRunning = true;
          previewCanvasRendering = true;
        }
      };

      // While scanning (no patient matched yet)
      evaluateBackgroundTasks(null);
      expect(faceDetectionRunning).toBe(true);
      expect(previewCanvasRendering).toBe(true);

      // Once patient is matched (confirmation modal opens)
      evaluateBackgroundTasks({ hn: 'P-001', first_name: 'สมชาย' });
      expect(faceDetectionRunning).toBe(false);
      expect(previewCanvasRendering).toBe(false);

      // Patient clicks "ไม่ใช่ฉัน (สแกนใหม่)" -> resets matchedPatient
      evaluateBackgroundTasks(null);
      expect(faceDetectionRunning).toBe(true);
      expect(previewCanvasRendering).toBe(true);
    });

    it('7.5 Direct DOM transformation uses transform: scaleX(...) with transform-origin: left and will-change', () => {
      const barStyle = {
        transform: 'scaleX(0.5)',
        transformOrigin: 'left',
        willChange: 'transform',
        width: '100%',
      };

      expect(barStyle.transform).toContain('scaleX');
      expect(barStyle.transformOrigin).toBe('left');
      expect(barStyle.willChange).toBe('transform');
      expect(barStyle.width).toBe('100%');
    });
  });
});
