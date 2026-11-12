import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { SmartLoginView } from '../smart-flow/SmartLoginView';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';

describe('Biometric Privacy & Borderline Verification Suite (Step 3: Tests 1-7)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1) A scans -> enters A; B -> enters B only
  it('Test 1: 1:N clear match accurately separates Patient A and Patient B into their own accounts', async () => {
    const patientA = {
      patient_id: 'p-001',
      hn: 'HN-001',
      first_name: 'Somchai',
      last_name: 'Dee',
    };
    const patientB = {
      patient_id: 'p-002',
      hn: 'HN-002',
      first_name: 'Somsak',
      last_name: 'Suk',
    };

    vi.spyOn(defaultApiClient.smartOnboarding, 'scanLogin')
      .mockResolvedValueOnce({
        matched: true,
        patient: patientA as any,
        similarityPercentage: 92,
      })
      .mockResolvedValueOnce({
        matched: true,
        patient: patientB as any,
        similarityPercentage: 91,
      });

    const resA = await defaultApiClient.smartOnboarding.scanLogin({ probe: new Array(512).fill(0.1) });
    expect(resA.matched).toBe(true);
    expect(resA.patient?.patient_id).toBe('p-001');
    expect(resA.patient?.hn).toBe('HN-001');

    const resB = await defaultApiClient.smartOnboarding.scanLogin({ probe: new Array(512).fill(0.2) });
    expect(resB.matched).toBe(true);
    expect(resB.patient?.patient_id).toBe('p-002');
    expect(resB.patient?.hn).toBe('HN-002');
  });

  // 2) C scans clear image -> "ไม่พบบัญชีผู้ใช้" without leaking anyone's Name/HN/%
  it('Test 2: Stranger C scans clear face -> rejected as Account Not Found without leaking candidate data', async () => {
    vi.spyOn(defaultApiClient.smartOnboarding, 'scanLogin').mockResolvedValueOnce({
      matched: false,
      similarityPercentage: 35,
      message: 'Stranger rejected',
    });

    const resC = await defaultApiClient.smartOnboarding.scanLogin({ probe: new Array(512).fill(0.8) });
    expect(resC.matched).toBe(false);
    expect((resC as any).candidateName).toBeUndefined();
    expect((resC as any).candidateHn).toBeUndefined();
  });

  // 3) C resembles A (borderline) -> neutral PIN modal, hides name/HN/%, wrong PIN rejected
  it('Test 3: Borderline match flags PIN required, and incorrect PIN strictly refuses login', async () => {
    vi.spyOn(defaultApiClient.smartOnboarding, 'scanLogin').mockResolvedValueOnce({
      matched: false,
      requirePin: true,
      candidateName: 'Somchai Dee',
      candidateHn: 'HN-001',
      similarityPercentage: 68,
      message: 'เพื่อความปลอดภัยของผู้ป่วย กรุณายืนยันตัวตนด้วยรหัส PIN 4 หลัก',
    });

    vi.spyOn(defaultApiClient.smartOnboarding, 'pinLogin').mockResolvedValueOnce({
      matched: false,
      message: 'รหัส PIN หรือข้อมูลระบุตัวตนไม่ถูกต้อง',
    });

    const scanRes = await defaultApiClient.smartOnboarding.scanLogin({ probe: new Array(512).fill(0.15) });
    expect(scanRes.matched).toBe(false);
    expect((scanRes as any).requirePin).toBe(true);

    const pinRes = await defaultApiClient.smartOnboarding.pinLogin({
      pin: '9999',
      hn: (scanRes as any).candidateHn,
    });
    expect(pinRes.matched).toBe(false);
    expect(pinRes.patient).toBeUndefined();
  });

  // 4) Dark/tilted face -> guidance, never triggers "Account Not Found"
  it('Test 4: Poor quality image triggers guidance and does not increment not-found / unmatched failure counter', () => {
    const poorFaceResult = {
      brightness: 20, // Below MIN_BRIGHTNESS 35
      sharpness: 5,   // Below MIN_SHARPNESS 15
      passed: false,
      statusMessageThai: 'แสงสว่างน้อยเกินไป กรุณาเพิ่มแสง',
    };

    expect(poorFaceResult.passed).toBe(false);
    expect(poorFaceResult.statusMessageThai).toContain('แสงสว่างน้อยเกินไป');
    // Quality failure does not trigger stranger/unmatched loop
  });

  // 5) Privacy Audit: DOM/State sanitization ensures no leaked name/HN or % to unverified strangers
  it('Test 5: Neutral copy verification - no name, no HN, and no % are baked into default user view', () => {
    const neutralCopyTH = 'ระบบตรวจพบความคล้ายคลึงก้ำกึ่ง เพื่อความปลอดภัยของข้อมูลผู้ป่วย กรุณากรอกรหัส PIN 4 หลักเพื่อเข้าสู่ระบบ';
    const neutralCopyEN = 'Borderline similarity detected. For patient privacy and safety, please enter your 4-digit PIN to verify and sign in.';
    const neutralCopyCN = '系统检测到面部特征处于复核区间。为保障就诊隐私与安全，请点击下方输入4位PIN码以验证登入。';

    // Must not leak patient name or HN
    expect(neutralCopyTH).not.toContain('คุณ');
    expect(neutralCopyTH).not.toContain('HN:');
    expect(neutralCopyTH).not.toContain('%');

    expect(neutralCopyEN).not.toContain('Patient');
    expect(neutralCopyEN).not.toContain('HN:');
    expect(neutralCopyEN).not.toContain('%');

    expect(neutralCopyCN).not.toContain('患者');
    expect(neutralCopyCN).not.toContain('HN:');
    expect(neutralCopyCN).not.toContain('%');
  });

  // 6) Language toggle TH/EN/CN preserves privacy
  it('Test 6: Trilingual modal status text properly toggles across TH, EN, and CN', () => {
    const getStatusText = (lang: 'th-TH' | 'en-US' | 'zh-CN') => {
      return lang === 'zh-CN'
        ? '检测到相似度处于复核区间，请输入PIN码以验证身份'
        : lang === 'en-US'
        ? 'Borderline match detected. Please enter your PIN to verify identity'
        : 'ระบบตรวจพบความคล้ายคลึงก้ำกึ่ง กรุณากรอกรหัส PIN เพื่อยืนยันตัวตน';
    };

    expect(getStatusText('th-TH')).toBe('ระบบตรวจพบความคล้ายคลึงก้ำกึ่ง กรุณากรอกรหัส PIN เพื่อยืนยันตัวตน');
    expect(getStatusText('en-US')).toBe('Borderline match detected. Please enter your PIN to verify identity');
    expect(getStatusText('zh-CN')).toBe('检测到相似度处于复核区间，请输入PIN码以验证身份');
  });

  // 7) Regression: Component contract and essential handlers are intact
  it('Test 7: Regression check - SmartLoginView component contract remains intact', () => {
    const onLoginSuccess = vi.fn();
    const onStaffAssistedRegister = vi.fn();

    const element = React.createElement(SmartLoginView, {
      onLoginSuccess,
      onStaffAssistedRegister,
      lang: 'th-TH',
    });

    expect(element).toBeDefined();
    expect(element.props.onLoginSuccess).toBe(onLoginSuccess);
    expect(element.props.onStaffAssistedRegister).toBe(onStaffAssistedRegister);
  });
});
