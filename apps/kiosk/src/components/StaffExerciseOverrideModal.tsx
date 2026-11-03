/**
 * apps/kiosk/src/components/StaffExerciseOverrideModal.tsx
 *
 * DRTECH.CARE CLINICAL STAFF EXERCISE OVERRIDE MODAL
 *
 * Requirements:
 * 1. Step 1: Staff Authentication (Admin / Director / PT) with role verification.
 * 2. Step 2: Select Today's Prescribed Exercise & Reason Selection.
 * 3. 2-Minute Inactivity Watchdog: Auto-logout and dismiss after 120s of idle time.
 * 4. Touch-friendly: Buttons height >= 48px, massive contrast for clinical touchscreens.
 * 5. Production Safe: Dev test shortcuts hidden in production (strictly import.meta.env.DEV).
 * 6. Trilingual Support: TH, EN, CN.
 * 7. Zero audio narration.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  KeyRound,
  User,
  Lock,
  Clock,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Sparkles,
  X,
} from 'lucide-react';
import { useClinicalI18n, LanguageSwitcher } from '../../../../packages/clinical-i18n/src/index';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';

export type OverrideReason = 'arm_injured_cannot_raise' | 'camera_hand_detection_failed' | 'other';

export interface StaffExerciseOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    patient_id?: string;
    hn?: string;
    first_name?: string;
    last_name?: string;
  };
  exercises: any[];
  defaultExerciseId?: string;
  onConfirmOverride: (
    selectedExercise: any,
    metadata: {
      staff_user: any;
      override_reason: OverrideReason;
      reason_detail?: string;
    }
  ) => Promise<void>;
}

const MODAL_I18N = {
  'th-TH': {
    badge: '👨‍⚕️ โหมดเจ้าหน้าที่ช่วยเหลือ (Staff Override)',
    step1Title: 'ยืนยันตัวตนเจ้าหน้าที่เพื่อเริ่มท่าแทน',
    step1Subtitle: 'กรุณาเข้าสู่ระบบด้วยบัญชี Admin, ผอ.รพ. หรือ นักกายภาพบำบัด (PT)',
    step2Title: 'เลือกท่าฝึกและระบุเหตุผลในการเริ่มแทน',
    step2Subtitle: 'เลือกท่าที่ได้รับมอบหมายในวันนี้ และระบุเหตุผลเพื่อบันทึกลงเวชระเบียน',
    usernameLabel: 'ชื่อผู้ใช้ (Username) *',
    usernamePlaceholder: 'เช่น director หรือ pt_somchai',
    passwordLabel: 'รหัสผ่าน (Password) *',
    passwordPlaceholder: '••••••••••••',
    loginBtn: 'เข้าสู่ระบบและไปต่อ',
    cancelBtn: 'ยกเลิก / กลับหน้ารายการ',
    backBtn: 'ย้อนกลับ',
    confirmStartBtn: '🚀 ยืนยันเริ่มท่านี้ทันที (Start Exercise)',
    startingBtn: 'กำลังเริ่มเซสชัน...',
    patientInfo: 'ข้อมูลผู้ป่วย:',
    prescribedHeader: 'รายการท่าฝึกที่มอบหมายวันนี้ (เลือก 1 ท่า):',
    reasonHeader: 'เหตุผลที่เจ้าหน้าที่ต้องเริ่มแทน:',
    reasonInjured: 'ผู้ป่วยยกมือไม่ได้ / มีอาการบาดเจ็บที่แขนหรือหัวไหล่',
    reasonCamera: 'กล้องไม่ตรวจจับมือ / สภาพแสงหรือมุมกล้องไม่เอื้ออำนวย',
    reasonOther: 'ผู้ป่วยไม่สะดวก / อื่นๆ (ระบุรายละเอียดเพิ่มเติม)',
    reasonOtherPlaceholder: 'ระบุเหตุผลเพิ่มเติม (ถ้ามี)...',
    unauthorizedRole: '⛔ บัญชีนี้ไม่มีสิทธิ์เริ่มการฝึกแทนผู้ป่วย (อนุญาตเฉพาะ Admin, ผอ.รพ. และนักกายภาพบำบัด PT เท่านั้น)',
    requiredFields: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน',
    invalidCreds: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    noExercisesToday: 'ผู้ป่วยไม่มีท่าฝึกกายภาพสำหรับวันนี้ ไม่สามารถเริ่มแทนได้',
    devShortcuts: 'ทางลัดข้อมูลทดสอบ (Dev Only):',
    devDirector: '⚡ ผอ. (director)',
    devPt: '⚡ นักกายภาพ (pt_somchai)',
    watchdogPrefix: '⏱️ ปิดอัตโนมัติใน',
    watchdogSuffix: 'วินาที',
  },
  'en-US': {
    badge: '👨‍⚕️ Clinical Staff Override Mode',
    step1Title: 'Staff Authentication to Override Start',
    step1Subtitle: 'Please sign in with Admin, Hospital Director, or Physical Therapist (PT) credentials',
    step2Title: 'Select Prescribed Exercise & Override Reason',
    step2Subtitle: 'Choose from today’s assigned exercises and specify reason for audit compliance',
    usernameLabel: 'Username *',
    usernamePlaceholder: 'e.g. director or pt_somchai',
    passwordLabel: 'Password *',
    passwordPlaceholder: '••••••••••••',
    loginBtn: 'Sign In & Continue',
    cancelBtn: 'Cancel / Return to Plan',
    backBtn: 'Back',
    confirmStartBtn: '🚀 Confirm & Start Exercise Now',
    startingBtn: 'Starting session...',
    patientInfo: 'Patient Information:',
    prescribedHeader: "Today's Prescribed Exercises (Select 1):",
    reasonHeader: 'Reason for Staff Override:',
    reasonInjured: 'Patient cannot raise hand / Arm or shoulder injured',
    reasonCamera: 'Camera failed to detect hand / Lighting issue',
    reasonOther: 'Patient preference / Other clinical reason',
    reasonOtherPlaceholder: 'Provide additional clinical details (optional)...',
    unauthorizedRole: '⛔ Insufficient permissions. Only Admin, Director, and Physical Therapists can override.',
    requiredFields: 'Please fill in both username and password',
    invalidCreds: 'Invalid username or password',
    noExercisesToday: 'Patient has no prescribed exercises today. Cannot override.',
    devShortcuts: 'Dev Shortcuts (Dev Only):',
    devDirector: '⚡ Director (director)',
    devPt: '⚡ PT (pt_somchai)',
    watchdogPrefix: '⏱️ Auto-dismiss in',
    watchdogSuffix: 's',
  },
  'zh-CN': {
    badge: '👨‍⚕️ 医护人员协助启动模式',
    step1Title: '医护人员身份验证',
    step1Subtitle: '请使用管理员、院长或物理康复理疗师 (PT) 账号登录以代为启动',
    step2Title: '选择今日训练动作及代启动原因',
    step2Subtitle: '选择今日已指派的动作并记录协助原因以归档',
    usernameLabel: '用户名 (Username) *',
    usernamePlaceholder: '例如 director 或 pt_somchai',
    passwordLabel: '密码 (Password) *',
    passwordPlaceholder: '••••••••••••',
    loginBtn: '登录并继续',
    cancelBtn: '取消 / 返回方案页面',
    backBtn: '返回上一页',
    confirmStartBtn: '🚀 确认并立即开始该动作',
    startingBtn: '正在开始训练...',
    patientInfo: '患者信息:',
    prescribedHeader: '今日指派动作清单 (请选择一项):',
    reasonHeader: '医护人员协助原因:',
    reasonInjured: '患者手臂/肩部受伤无法举手',
    reasonCamera: '摄像头未能检测到手部 / 光线角度问题',
    reasonOther: '患者不便 / 其他临床原因',
    reasonOtherPlaceholder: '请提供更多详细原因 (可选)...',
    unauthorizedRole: '⛔ 权限不足。仅限管理员、院长及物理治疗师 PT 代患者启动。',
    requiredFields: '请填写完整的用户名和密码',
    invalidCreds: '用户名或密码错误',
    noExercisesToday: '该患者今日暂无康复方案，无法启动。',
    devShortcuts: '开发快捷填充 (仅开发环境):',
    devDirector: '⚡ 院长账号 (director)',
    devPt: '⚡ 理疗师 (pt_somchai)',
    watchdogPrefix: '⏱️ 将在',
    watchdogSuffix: '秒后自动关闭',
  },
};

export const StaffExerciseOverrideModal: React.FC<StaffExerciseOverrideModalProps> = ({
  isOpen,
  onClose,
  patient,
  exercises,
  defaultExerciseId,
  onConfirmOverride,
}) => {
  const { lang } = useClinicalI18n();
  const t = MODAL_I18N[lang] || MODAL_I18N['th-TH'];

  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [staffUser, setStaffUser] = useState<any | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<OverrideReason>('arm_injured_cannot_raise');
  const [reasonDetail, setReasonDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 2-Minute Inactivity Watchdog (120 seconds)
  const [remainingSec, setRemainingSec] = useState<number>(120);
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Compile-time DEV check: Hides test shortcuts in production builds
  const isDev = Boolean((import.meta as any)?.env?.DEV);

  // Reset watchdog timer on any interaction
  const resetWatchdog = useCallback(() => {
    setRemainingSec(120);
  }, []);

  // Set default selected exercise
  useEffect(() => {
    if (exercises && exercises.length > 0) {
      if (defaultExerciseId) {
        setSelectedExerciseId(defaultExerciseId);
      } else {
        const first = exercises[0];
        setSelectedExerciseId(first.exercise_id || first.id || '');
      }
    }
  }, [exercises, defaultExerciseId]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setUsername('');
      setPassword('');
      setStaffUser(null);
      setErrorMsg(null);
      setIsSubmitting(false);
      setRemainingSec(120);
      setOverrideReason('arm_injured_cannot_raise');
      setReasonDetail('');
    }
  }, [isOpen]);

  // Watchdog Countdown Effect
  useEffect(() => {
    if (!isOpen) {
      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
      return;
    }

    watchdogTimerRef.current = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Step 1: Handle Staff Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetWatchdog();

    if (!username.trim() || !password) {
      setErrorMsg(t.requiredFields);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await defaultApiClient.auth.login({
        username: username.trim(),
        password,
      });

      const user = res.user;
      if (!user) {
        throw new Error(t.invalidCreds);
      }

      const role = String(user.role || res.role || '').toLowerCase();
      const uname = String(user.username || username || '').toLowerCase();

      const isAllowedStaff =
        role === 'admin' ||
        role === 'super_admin' ||
        role === 'director' ||
        uname === 'director' ||
        uname === 'admin' ||
        role === 'pt' ||
        role === 'therapist' ||
        uname.startsWith('pt');

      if (!isAllowedStaff) {
        throw new Error(t.unauthorizedRole);
      }

      const validatedUser = {
        ...user,
        username: user.username || username.trim(),
        full_name:
          user.full_name ||
          (uname === 'director'
            ? 'ผู้อำนวยการโรงพยาบาล'
            : uname === 'admin'
            ? 'ผู้ดูแลระบบ'
            : 'กภ.สมชาย กายภาพดี'),
        role,
      };

      setStaffUser(validatedUser);
      setStep(2);
      resetWatchdog();
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : t.invalidCreds);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Handle Confirm Override & Start Session
  const handleConfirmStart = async () => {
    resetWatchdog();

    if (!selectedExerciseId) {
      setErrorMsg('กรุณาเลือกท่าฝึกกายภาพที่ต้องการเริ่ม');
      return;
    }

    const matchedExercise = exercises.find(
      (ex) => (ex.exercise_id || ex.id) === selectedExerciseId
    );

    if (!matchedExercise) {
      setErrorMsg('ไม่พบข้อมูลท่าฝึกที่เลือก');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await onConfirmOverride(matchedExercise, {
        staff_user: staffUser,
        override_reason: overrideReason,
        reason_detail: overrideReason === 'other' ? reasonDetail.trim() : undefined,
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเริ่มเซสชันแทน');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        resetWatchdog();
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-y-auto"
    >
      <div
        onClick={resetWatchdog}
        className="w-full max-w-xl bg-slate-900 border-2 border-emerald-500/40 rounded-3xl shadow-2xl overflow-hidden relative text-white flex flex-col max-h-[92vh]"
      >
        {/* Top Bar with Language Switcher, Watchdog Timer, and Close Button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-800 text-amber-300 border border-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {t.watchdogPrefix} {remainingSec} {t.watchdogSuffix}
              </span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-semibold">
              Step {step}/2
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="dark" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
          {/* Header Branding */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 mx-auto mb-3 shadow-lg shadow-emerald-950/50">
              {step === 1 ? <KeyRound className="w-7 h-7" /> : <Activity className="w-7 h-7" />}
            </div>

            <span className="inline-block px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
              {t.badge}
            </span>

            <h2 className="text-xl sm:text-2xl font-black text-white">
              {step === 1 ? t.step1Title : t.step2Title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
              {step === 1 ? t.step1Subtitle : t.step2Subtitle}
            </p>
          </div>

          {/* Patient Quick Info Card */}
          <div className="mb-5 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400">{t.patientInfo}</span>
              <span className="font-bold text-white">
                คุณ {patient.first_name || 'ผู้ป่วย'} {patient.last_name || ''}
              </span>
            </div>
            <div className="font-mono text-slate-400">HN: {patient.hn || patient.patient_id || '-'}</div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div
              id="staff-override-error"
              data-testid="staff-override-error"
              className="mb-5 p-4 rounded-2xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs sm:text-sm flex items-center gap-2.5 animate-fadeIn"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: Staff Authentication Form */}
          {step === 1 && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t.usernameLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="staff-override-username-input"
                    data-testid="staff-override-username-input"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      resetWatchdog();
                    }}
                    placeholder={t.usernamePlaceholder}
                    autoComplete="username"
                    required
                    className="w-full pl-10 pr-4 h-12 sm:h-14 bg-slate-950 border border-slate-700 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-400 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t.passwordLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    id="staff-override-password-input"
                    data-testid="staff-override-password-input"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      resetWatchdog();
                    }}
                    placeholder={t.passwordPlaceholder}
                    autoComplete="current-password"
                    required
                    className="w-full pl-10 pr-4 h-12 sm:h-14 bg-slate-950 border border-slate-700 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-400 transition"
                  />
                </div>
              </div>

              {/* Dev Only Shortcuts: Strictly hidden in production */}
              {isDev && (
                <div className="pt-1">
                  <div className="text-[11px] text-amber-300/80 mb-1.5 font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>{t.devShortcuts}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUsername('director');
                        setPassword('DirectorPass123!');
                        resetWatchdog();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition cursor-pointer"
                    >
                      {t.devDirector}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUsername('pt_somchai');
                        setPassword('PtPass123!');
                        resetWatchdog();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition cursor-pointer"
                    >
                      {t.devPt}
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons: Strictly >= 48px height */}
              <div className="pt-3 space-y-2.5">
                <button
                  type="submit"
                  id="staff-override-login-btn"
                  data-testid="staff-override-login-btn"
                  disabled={isSubmitting}
                  className="w-full h-12 sm:h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>{isSubmitting ? t.startingBtn : t.loginBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-12 sm:h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs sm:text-sm transition cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Select Today's Prescribed Exercise & Reason */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Staff Profile Pill */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                <span className="font-bold">
                  👨‍⚕️ เจ้าหน้าที่: {staffUser?.full_name || staffUser?.username}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/60 uppercase font-mono">
                  {staffUser?.role}
                </span>
              </div>

              {/* Exercise Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  {t.prescribedHeader}
                </label>
                {exercises.length === 0 ? (
                  <p className="text-xs text-rose-400 p-3 rounded-xl bg-rose-950/30 border border-rose-500/30">
                    {t.noExercisesToday}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {exercises.map((ex, idx) => {
                      const exId = ex.exercise_id || ex.id || `ex-${idx}`;
                      const isSelected = selectedExerciseId === exId;
                      const exTitle =
                        lang === 'zh-CN'
                          ? ex.name_cn || ex.name
                          : lang === 'en-US'
                          ? ex.name_en || ex.name
                          : ex.name_th || ex.name || ex.title;

                      return (
                        <div
                          key={exId}
                          onClick={() => {
                            setSelectedExerciseId(exId);
                            resetWatchdog();
                          }}
                          className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-emerald-950/60 border-emerald-400 shadow-md ring-2 ring-emerald-500/40 text-white'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                                isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {idx + 1}
                            </div>
                            <div>
                              <div className="text-sm font-bold">{exTitle}</div>
                              <div className="text-[11px] text-slate-400">
                                {ex.sets || 3} เซ็ต × {ex.reps || 10} ครั้ง • ข้อต่อ: {ex.target_joint || 'ทั่วไป'}
                              </div>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Override Reason Radio Options */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  {t.reasonHeader}
                </label>
                <div className="space-y-2">
                  <label
                    onClick={() => {
                      setOverrideReason('arm_injured_cannot_raise');
                      resetWatchdog();
                    }}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      overrideReason === 'arm_injured_cannot_raise'
                        ? 'bg-slate-800/80 border-emerald-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="override_reason"
                      checked={overrideReason === 'arm_injured_cannot_raise'}
                      onChange={() => setOverrideReason('arm_injured_cannot_raise')}
                      className="mt-1 accent-emerald-500"
                    />
                    <span className="text-xs font-medium leading-relaxed">{t.reasonInjured}</span>
                  </label>

                  <label
                    onClick={() => {
                      setOverrideReason('camera_hand_detection_failed');
                      resetWatchdog();
                    }}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      overrideReason === 'camera_hand_detection_failed'
                        ? 'bg-slate-800/80 border-emerald-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="override_reason"
                      checked={overrideReason === 'camera_hand_detection_failed'}
                      onChange={() => setOverrideReason('camera_hand_detection_failed')}
                      className="mt-1 accent-emerald-500"
                    />
                    <span className="text-xs font-medium leading-relaxed">{t.reasonCamera}</span>
                  </label>

                  <label
                    onClick={() => {
                      setOverrideReason('other');
                      resetWatchdog();
                    }}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      overrideReason === 'other'
                        ? 'bg-slate-800/80 border-emerald-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="override_reason"
                      checked={overrideReason === 'other'}
                      onChange={() => setOverrideReason('other')}
                      className="mt-1 accent-emerald-500"
                    />
                    <span className="text-xs font-medium leading-relaxed">{t.reasonOther}</span>
                  </label>
                </div>

                {overrideReason === 'other' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={reasonDetail}
                      onChange={(e) => {
                        setReasonDetail(e.target.value);
                        resetWatchdog();
                      }}
                      placeholder={t.reasonOtherPlaceholder}
                      className="w-full px-3.5 h-11 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                )}
              </div>

              {/* Step 2 Actions: Strictly >= 48px height */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  id="staff-override-confirm-btn"
                  data-testid="staff-override-confirm-btn"
                  onClick={handleConfirmStart}
                  disabled={isSubmitting || exercises.length === 0}
                  className="w-full h-12 sm:h-14 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Activity className="w-5 h-5 text-emerald-300" />
                  <span>{isSubmitting ? t.startingBtn : t.confirmStartBtn}</span>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      resetWatchdog();
                    }}
                    className="h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t.backBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-12 rounded-2xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs sm:text-sm transition cursor-pointer"
                  >
                    {t.cancelBtn}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
