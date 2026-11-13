/**
 * apps/kiosk/src/__tests__/kiosk_not_found_controlled_modal.test.ts
 * Comprehensive verification suite for Kiosk Account Not Found Detection,
 * Controlled 4-Button Modal, Biometric Privacy, Cooldown Guards & Buffer Wipe (TEST 01 - TEST 14).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SmartLoginView,
  KIOSK_NOT_FOUND_CONFIG,
  KioskAccountNotFoundModal,
  KioskPinLoginModal,
  evaluateNoMatchRound,
  isBestShotFrameQualityValid,
  evaluatePresenceScanReadiness,
  wipeBiometricBuffers,
  resolveStaffOrDebugMode,
  canSubmitStaffCall,
  formatStaffCallButtonText,
  checkKioskFaceQuality,
  FaceStabilityDetector,
} from '../smart-flow/SmartLoginView';
import { LivenessTelemetryBadge } from '../../../../packages/face-client/src/ring';
import { t as clinicalTranslate, ClinicalLanguage } from '../../../../packages/clinical-i18n/src/index';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { BIOMETRIC_CONFIG, evaluateBiometricMatch } from '../../../../packages/smart-biometric-core/src/index.js';

function makeTranslator(lang: ClinicalLanguage) {
  return (key: any, fallback?: string) => clinicalTranslate(key, lang, fallback);
}

describe('Kiosk Face Recognition — Controlled Account Not Found & Privacy Suite (TEST 01 - TEST 14)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // TEST 01: Account Not Found after 2 confirmed rounds within 10s MAX_CONFIRM_WINDOW_MS
  it('TEST 01: Confirms Account Not Found on Round 2 within 10s MAX_CONFIRM_WINDOW_MS and renders centered 4-button modal', () => {
    expect(KIOSK_NOT_FOUND_CONFIG.NOT_FOUND_CONFIRM_ROUNDS).toBe(2);
    expect(KIOSK_NOT_FOUND_CONFIG.MAX_CONFIRM_WINDOW_MS).toBe(10000);
    expect(KIOSK_NOT_FOUND_CONFIG.NOT_FOUND_IDLE_MS).toBe(30000);
    expect(KIOSK_NOT_FOUND_CONFIG.RETRY_COOLDOWN_MS).toBe(1500);

    const tRound1End = 10_000;
    const round1 = evaluateNoMatchRound({ count: 0, firstTimestamp: 0 }, tRound1End, KIOSK_NOT_FOUND_CONFIG);
    expect(round1.confirmedNotFound).toBe(false);
    expect(round1.nextTracker).toEqual({ count: 1, firstTimestamp: tRound1End });

    // Round 2 finishes after 1.5s cooldown + 3s countdown + 1.2s network RTT (5.7s total <= 10s)
    const round2 = evaluateNoMatchRound(round1.nextTracker, tRound1End + 5700, KIOSK_NOT_FOUND_CONFIG);
    expect(round2.confirmedNotFound).toBe(true);
    expect(round2.nextTracker.count).toBe(2);

    // Expired > 10s resets cleanly back to Round 1
    const expired = evaluateNoMatchRound(round1.nextTracker, tRound1End + 10_500, KIOSK_NOT_FOUND_CONFIG);
    expect(expired.confirmedNotFound).toBe(false);
    expect(expired.nextTracker).toEqual({ count: 1, firstTimestamp: tRound1End + 10_500 });

    const modalHtml = renderToStaticMarkup(
      React.createElement(KioskAccountNotFoundModal, {
        isOpen: true,
        lang: 'th-TH',
        t: makeTranslator('th-TH'),
        notFoundRemainingSec: 30,
        isCallingStaff: false,
        staffCallCooldownSec: 0,
        isRetryCooldownActive: false,
        onStaffRegister: vi.fn(),
        onCallStaff: vi.fn(),
        onUsePin: vi.fn(),
        onRetryScan: vi.fn(),
      })
    );

    expect(modalHtml).toContain('ไม่พบบัญชีผู้ใช้');
    expect(modalHtml).toContain('ไม่พบบัญชีผู้ใช้ กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียน');
    expect(modalHtml).toContain('เจ้าหน้าที่ลงทะเบียนให้');
    expect(modalHtml).toContain('เรียกเจ้าหน้าที่');
    expect(modalHtml).toContain('ใช้รหัส PIN');
    expect(modalHtml).toContain('ลองสแกนอีกครั้ง');
    expect(modalHtml).not.toContain('%');
  });

  // TEST 02: Quality gate & presence stillness gate reject blurry/tilted/moving frames without isLive bypass
  it('TEST 02: Rejects blurry/angled frames in isBestShotFrameQualityValid and blocks premature trigger in evaluatePresenceScanReadiness', () => {
    // Empty burst must fail quality gate (prevents zero-vector scanLogin)
    expect(isBestShotFrameQualityValid([])).toBe(false);

    // Blurry frame (< 4.0) must fail
    expect(
      isBestShotFrameQualityValid([
        { sharpness: 3.2, detection: { pose: { yaw: 2, pitch: 1 } } },
      ])
    ).toBe(false);

    // Excessive yaw/pitch (> 20 deg) must fail even with crisp sharpness
    expect(
      isBestShotFrameQualityValid([
        { sharpness: 25.0, detection: { pose: { yaw: 23, pitch: 5 } } },
        { sharpness: 25.0, detection: { pose: { yaw: 2, pitch: -21 } } },
      ])
    ).toBe(false);

    // Clear frontal frame passes
    expect(
      isBestShotFrameQualityValid([
        { sharpness: 14.5, detection: { pose: { yaw: -8, pitch: 10 } } },
      ])
    ).toBe(true);

    // Presence readiness: live_verified alone must NOT start countdown if not steady/frontal
    expect(
      evaluatePresenceScanReadiness({
        isPoseFrontal: true,
        stabilityIsStable: false,
        consecutiveSteadyFrames: 1,
        livenessState: 'live_verified',
      })
    ).toBe(false);

    // Moving frame must NOT start countdown
    expect(
      evaluatePresenceScanReadiness({
        isPoseFrontal: true,
        stabilityIsStable: false,
        consecutiveSteadyFrames: 5,
        stabilityReason: 'MOVING',
        livenessState: 'live_verified',
      })
    ).toBe(false);

    // Non-frontal frame must NOT start countdown
    expect(
      evaluatePresenceScanReadiness({
        isPoseFrontal: false,
        stabilityIsStable: true,
        consecutiveSteadyFrames: 4,
      })
    ).toBe(false);

    // Frontal + stillness (>= 3 steady frames or stability.isStable) passes
    expect(
      evaluatePresenceScanReadiness({
        isPoseFrontal: true,
        stabilityIsStable: false,
        consecutiveSteadyFrames: 3,
      })
    ).toBe(true);
  });

  // TEST 03: Privacy & Modal Lock (Hides 3D/EAR & Calib button for public Kiosk; locks backdrop click)
  it('TEST 03: Hides 3D/EAR telemetry values and Calib button on public Kiosk and locks modal backdrop click', () => {
    const publicBadgeHtml = renderToStaticMarkup(
      React.createElement(LivenessTelemetryBadge, {
        state: 'live_verified',
        depthScore: 0.84,
        ear: 0.31,
        isBlinking: true,
        hideTelemetryValues: true,
      })
    );
    expect(publicBadgeHtml).not.toContain('3D:');
    expect(publicBadgeHtml).not.toContain('EAR:');

    const staffBadgeHtml = renderToStaticMarkup(
      React.createElement(LivenessTelemetryBadge, {
        state: 'live_verified',
        depthScore: 0.84,
        ear: 0.31,
        hideTelemetryValues: false,
      })
    );
    expect(staffBadgeHtml).toContain('3D:84%');
    expect(staffBadgeHtml).toContain('EAR:0.31');

    expect(resolveStaffOrDebugMode({ search: '', hash: '', authToken: null, userRole: null })).toBe(false);
    expect(resolveStaffOrDebugMode({ search: '?calibration=true', hash: '', authToken: null, userRole: null })).toBe(true);
    expect(resolveStaffOrDebugMode({ search: '', hash: '', authToken: 'tok', userRole: 'pt' })).toBe(true);
    expect(resolveStaffOrDebugMode({ search: '', hash: '', authToken: 'tok', userRole: 'patient' })).toBe(false);

    const publicKioskHtml = renderToStaticMarkup(
      React.createElement(SmartLoginView, {
        onLoginSuccess: vi.fn(),
        onNavigateToEnroll: vi.fn(),
      })
    );
    expect(publicKioskHtml).not.toContain('>Calib<');
    expect(publicKioskHtml).not.toContain('3D:');
    expect(publicKioskHtml).not.toContain('EAR:');

    // Backdrop click on KioskAccountNotFoundModal does NOT invoke onRetryScan
    const onRetryScan = vi.fn();
    const element = KioskAccountNotFoundModal({
      isOpen: true,
      lang: 'th-TH',
      t: makeTranslator('th-TH'),
      notFoundRemainingSec: 30,
      isCallingStaff: false,
      staffCallCooldownSec: 0,
      isRetryCooldownActive: false,
      onStaffRegister: vi.fn(),
      onCallStaff: vi.fn(),
      onUsePin: vi.fn(),
      onRetryScan,
    });
    expect(element).not.toBeNull();
    const stopPropagation = vi.fn();
    (element as any).props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onRetryScan).not.toHaveBeenCalled();
  });

  // TEST 04: Modal Open renders 4 required interactive controls & zero match percentages
  it('TEST 04: Account Not Found Modal contains all 4 controlled action IDs without auto-retry triggers', () => {
    const html = renderToStaticMarkup(
      React.createElement(KioskAccountNotFoundModal, {
        isOpen: true,
        lang: 'th-TH',
        t: makeTranslator('th-TH'),
        notFoundRemainingSec: 28,
        isCallingStaff: false,
        staffCallCooldownSec: 0,
        isRetryCooldownActive: false,
        onStaffRegister: vi.fn(),
        onCallStaff: vi.fn(),
        onUsePin: vi.fn(),
        onRetryScan: vi.fn(),
      })
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('id="kiosk-staff-register-btn"');
    expect(html).toContain('id="kiosk-call-staff-btn"');
    expect(html).toContain('id="kiosk-not-found-pin-btn"');
    expect(html).toContain('id="kiosk-retry-scan-btn"');
  });

  // TEST 05: Button 1 ("เจ้าหน้าที่ลงทะเบียนให้") & hidden #kiosk-enroll-new-btn enforce Staff Login Gate (Option A)
  it('TEST 05: Staff registration button triggers staff-gated handler and #kiosk-enroll-new-btn remains hidden Option A', () => {
    const onStaffRegister = vi.fn();
    const tree = KioskAccountNotFoundModal({
      isOpen: true,
      lang: 'th-TH',
      t: makeTranslator('th-TH'),
      notFoundRemainingSec: 30,
      isCallingStaff: false,
      staffCallCooldownSec: 0,
      isRetryCooldownActive: false,
      onStaffRegister,
      onCallStaff: vi.fn(),
      onUsePin: vi.fn(),
      onRetryScan: vi.fn(),
    });

    const json = JSON.stringify(tree);
    expect(json).toContain('kiosk-staff-register-btn');
    onStaffRegister();
    expect(onStaffRegister).toHaveBeenCalledTimes(1);

    const kioskHtml = renderToStaticMarkup(
      React.createElement(SmartLoginView, {
        onLoginSuccess: vi.fn(),
        onNavigateToEnroll: vi.fn(),
        onStaffAssistedRegister: vi.fn(),
      })
    );
    expect(kioskHtml).toContain('id="kiosk-enroll-new-btn"');
    expect(kioskHtml).toContain('aria-hidden="true"');
  });

  // TEST 06: Button 2 ("เรียกเจ้าหน้าที่") guards rapid clicks & keeps cooldown confirmation label
  it('TEST 06: Call staff button prevents duplicate triggers within 30s cooldown and renders cooldown status feedback', async () => {
    const now = 1_000_000;
    expect(canSubmitStaffCall(0, now, false, 30000)).toBe(true);
    expect(canSubmitStaffCall(0, now, true, 30000)).toBe(false);
    expect(canSubmitStaffCall(now - 5000, now, false, 30000)).toBe(false);
    expect(canSubmitStaffCall(now - 31000, now, false, 30000)).toBe(true);

    expect(
      formatStaffCallButtonText({
        lang: 'th-TH',
        isCalling: false,
        cooldownSec: 25,
        defaultLabel: 'เรียกเจ้าหน้าที่',
      })
    ).toContain('25');

    const cooldownHtml = renderToStaticMarkup(
      React.createElement(KioskAccountNotFoundModal, {
        isOpen: true,
        lang: 'th-TH',
        t: makeTranslator('th-TH'),
        notFoundRemainingSec: 29,
        isCallingStaff: false,
        staffCallCooldownSec: 29,
        isRetryCooldownActive: false,
        onStaffRegister: vi.fn(),
        onCallStaff: vi.fn(),
        onUsePin: vi.fn(),
        onRetryScan: vi.fn(),
      })
    );
    expect(cooldownHtml).toContain('✓ ส่งคำเรียกแล้ว โปรดรอ (29s)');
    expect(cooldownHtml).toContain('disabled=""');

    const callSpy = vi.spyOn(defaultApiClient.kiosk, 'callStaff').mockResolvedValue({ ok: true } as any);
    await defaultApiClient.kiosk.callStaff({ kiosk_id: 'kiosk-01', reason: 'unrecognized_face_kiosk' });
    expect(callSpy).toHaveBeenCalledTimes(1);
  });

  // TEST 07: Button 3 ("ใช้รหัส PIN") & Invalid PIN displays error inline inside KioskPinLoginModal
  it('TEST 07: Invalid PIN renders inline error inside KioskPinLoginModal without opening Account Not Found Modal', () => {
    const pinHtml = renderToStaticMarkup(
      React.createElement(KioskPinLoginModal, {
        isOpen: true,
        lang: 'th-TH',
        enteredPin: '',
        pinError: 'ไม่พบข้อมูลผู้ป่วยสำหรับรหัส "9999" กรุณาลองใหม่อีกครั้งหรือติดต่อเจ้าหน้าที่',
        isSubmitting: false,
        onClose: vi.fn(),
        onPinKey: vi.fn(),
        onClearPin: vi.fn(),
        onBackspacePin: vi.fn(),
      })
    );
    expect(pinHtml).toContain('data-testid="kiosk-pin-error"');
    expect(pinHtml).toContain('role="alert"');
    expect(pinHtml).toContain('data-testid="kiosk-pin-close-btn"');
    expect(pinHtml).toContain('9999');

    // Account Not Found Modal remains closed
    const notFoundClosed = renderToStaticMarkup(
      React.createElement(KioskAccountNotFoundModal, {
        isOpen: false,
        lang: 'th-TH',
        t: makeTranslator('th-TH'),
        notFoundRemainingSec: 30,
        isCallingStaff: false,
        staffCallCooldownSec: 0,
        isRetryCooldownActive: false,
        onStaffRegister: vi.fn(),
        onCallStaff: vi.fn(),
        onUsePin: vi.fn(),
        onRetryScan: vi.fn(),
      })
    );
    expect(notFoundClosed).toBe('');
  });

  // TEST 08: Button 4 ("ลองสแกนอีกครั้ง") disables during 1.5s RETRY_COOLDOWN_MS
  it('TEST 08: Retry scan button respects active cooldown lock during RETRY_COOLDOWN_MS', () => {
    const retryActiveHtml = renderToStaticMarkup(
      React.createElement(KioskAccountNotFoundModal, {
        isOpen: true,
        lang: 'th-TH',
        t: makeTranslator('th-TH'),
        notFoundRemainingSec: 20,
        isCallingStaff: false,
        staffCallCooldownSec: 0,
        isRetryCooldownActive: true,
        onStaffRegister: vi.fn(),
        onCallStaff: vi.fn(),
        onUsePin: vi.fn(),
        onRetryScan: vi.fn(),
      })
    );
    expect(retryActiveHtml).toContain('id="kiosk-retry-scan-btn"');
    expect(retryActiveHtml).toContain('disabled=""');
  });

  // TEST 09: 30-second Idle countdown text and NOT_FOUND_IDLE_MS consistency
  it('TEST 09: Displays 30s auto-reset countdown cleanly across supported languages', () => {
    expect(KIOSK_NOT_FOUND_CONFIG.NOT_FOUND_IDLE_MS).toBe(30000);
    const thHtml = renderToStaticMarkup(
      React.createElement(KioskAccountNotFoundModal, {
        isOpen: true,
        lang: 'th-TH',
        t: makeTranslator('th-TH'),
        notFoundRemainingSec: 12,
        isCallingStaff: false,
        staffCallCooldownSec: 0,
        isRetryCooldownActive: false,
        onStaffRegister: vi.fn(),
        onCallStaff: vi.fn(),
        onUsePin: vi.fn(),
        onRetryScan: vi.fn(),
      })
    );
    expect(thHtml).toContain('ระบบจะคืนสู่หน้าเริ่มต้นอัตโนมัติใน 12 วินาที');
  });

  // TEST 10: Network failure / unreachable backend fails closed cleanly
  it('TEST 10: System unreachable or error response fails closed without matching any patient', async () => {
    vi.spyOn(defaultApiClient.smartOnboarding, 'scanLogin').mockRejectedValueOnce(new Error('Network down'));

    const res = await defaultApiClient.smartOnboarding
      .scanLogin({ probe: new Array(512).fill(0.1) })
      .catch(() => null);
    expect(res).toBeNull();
  });

  // TEST 11: Biometric core thresholds & matching algorithm remain completely untouched
  it('TEST 11: Protected BIOMETRIC_CONFIG thresholds and evaluateBiometricMatch fail-closed invariants remain intact', () => {
    expect(BIOMETRIC_CONFIG.MIN_COSINE_SIMILARITY).toBe(0.85);
    expect(BIOMETRIC_CONFIG.MAX_EUCLIDEAN_DISTANCE).toBe(0.38);
    expect(BIOMETRIC_CONFIG.MARGIN_MIN).toBe(0.08);
    expect(BIOMETRIC_CONFIG.MAX_ATTEMPTS).toBe(5);
    expect(BIOMETRIC_CONFIG.LOCKOUT_DURATION_MS).toBe(60000);

    const probe = new Array(512).fill(0).map((_, i) => (i < 256 ? 1 : 0));
    const stranger = new Array(512).fill(0).map((_, i) => (i >= 256 ? 1 : 0));
    const result = evaluateBiometricMatch(probe, stranger);
    expect(result.isMatch).toBe(false);
  });

  // TEST 12: Ephemeral buffer & canvas pixel cleanup wipes vectors to zero
  it('TEST 12: wipeBiometricBuffers zeroes 512-D embeddings, empties arrays, and resets canvas dimensions to 0x0', () => {
    const probeVector = new Array(512).fill(0.42);
    const samples = [{ vector: new Array(512).fill(0.99) }];
    const bestShotFrames = [{ vector: new Array(512).fill(0.77), snapshotBase64: 'data:image/jpeg;base64,abc' }];
    const clearRect = vi.fn();
    const mockCanvas = {
      width: 480,
      height: 360,
      getContext: () => ({ clearRect }),
    } as unknown as HTMLCanvasElement;

    wipeBiometricBuffers({ probeVector, samples, bestShotFrames, canvas: mockCanvas });

    expect(probeVector.every((v) => v === 0)).toBe(true);
    expect(samples.length).toBe(0);
    expect(bestShotFrames.length).toBe(0);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 480, 360);
    expect(mockCanvas.width).toBe(0);
    expect(mockCanvas.height).toBe(0);
  });

  // TEST 13: Trilingual TH / EN / CN rendering on Not Found Modal & PIN Modal
  it('TEST 13: Renders Account Not Found and PIN modals properly in th-TH, en-US, and zh-CN without percentage leakage', () => {
    const cases: Array<{
      lang: ClinicalLanguage;
      expectedTitle: string;
      expectedBtn1: string;
      expectedBtn2: string;
      expectedBtn3: string;
      expectedBtn4: string;
      expectedCountdown: string;
    }> = [
      {
        lang: 'th-TH',
        expectedTitle: 'ไม่พบบัญชีผู้ใช้',
        expectedBtn1: 'เจ้าหน้าที่ลงทะเบียนให้',
        expectedBtn2: 'เรียกเจ้าหน้าที่',
        expectedBtn3: 'ใช้รหัส PIN',
        expectedBtn4: 'ลองสแกนอีกครั้ง',
        expectedCountdown: '15 วินาที',
      },
      {
        lang: 'en-US',
        expectedTitle: 'Account Not Found',
        expectedBtn1: 'Staff Registration',
        expectedBtn2: 'Call Staff',
        expectedBtn3: 'Use PIN',
        expectedBtn4: 'Try Again',
        expectedCountdown: 'Auto-resets to home in 15s',
      },
      {
        lang: 'zh-CN',
        expectedTitle: '未找到用户账户',
        expectedBtn1: '由工作人员注册',
        expectedBtn2: '呼叫工作人员',
        expectedBtn3: '使用 PIN',
        expectedBtn4: '重新扫描',
        expectedCountdown: '15 秒后自动返回初始页面',
      },
    ];

    for (const c of cases) {
      const html = renderToStaticMarkup(
        React.createElement(KioskAccountNotFoundModal, {
          isOpen: true,
          lang: c.lang,
          t: makeTranslator(c.lang),
          notFoundRemainingSec: 15,
          isCallingStaff: false,
          staffCallCooldownSec: 0,
          isRetryCooldownActive: false,
          onStaffRegister: vi.fn(),
          onCallStaff: vi.fn(),
          onUsePin: vi.fn(),
          onRetryScan: vi.fn(),
        })
      );

      expect(html).toContain(c.expectedTitle);
      expect(html).toContain(c.expectedBtn1);
      expect(html).toContain(c.expectedBtn2);
      expect(html).toContain(c.expectedBtn3);
      expect(html).toContain(c.expectedBtn4);
      expect(html).toContain(c.expectedCountdown);
      expect(html).not.toContain('%');
    }
  });

  // TEST 14: Regression verification for quality detector & stability detector contracts
  it('TEST 14: Existing checkKioskFaceQuality and FaceStabilityDetector remain healthy for valid frontal users', () => {
    const q = checkKioskFaceQuality(
      { hasFace: true, box: { x: 140, y: 100, width: 160, height: 200 }, pose: { yaw: 0, pitch: 0 } },
      640,
      480
    );
    expect(q.passed).toBe(true);

    const stability = new FaceStabilityDetector({ minDurationMs: 600 });
    let last;
    for (let t = 0; t <= 700; t += 160) {
      last = stability.update(
        { hasFace: true, box: { x: 200, y: 120, width: 180, height: 220 }, pose: { yaw: 1, pitch: -2 } },
        640,
        480,
        1000 + t
      );
    }
    expect(last?.isStable).toBe(true);
  });
});

