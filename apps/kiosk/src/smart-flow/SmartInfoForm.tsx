/**
 * apps/kiosk/src/smart-flow/SmartInfoForm.tsx
 * Dual-Channel Parallel Info Input Form (Option A: Kiosk Touchscreen)
 * Master Prompt v4 Step 2.3 & Step 2.4 (First-Finisher Wins & Auto Reset)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  CheckCircle2,
  User,
  Phone,
  FileText,
  AlertCircle,
  Sparkles,
  Check,
  RefreshCw,
} from 'lucide-react';

interface SmartInfoFormProps {
  patientId: string;
  onCompleted: () => void;
  onCancel?: () => void;
}

export const SmartInfoForm: React.FC<SmartInfoFormProps> = ({
  patientId,
  onCompleted,
  onCancel,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState<string>('60');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [phone, setPhone] = useState('');
  const [initialSymptoms, setInitialSymptoms] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(3);
  const [finishedByStaff, setFinishedByStaff] = useState(false);

  const isMountedRef = useRef(true);
  const hasFinishedRef = useRef(false);

  // Auto finish handler
  const triggerSuccessSequence = useCallback((byStaff: boolean = false) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    setIsSuccess(true);
    setFinishedByStaff(byStaff);

    let count = 3;
    setResetCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (isMountedRef.current) {
        setResetCountdown(count);
      }
      if (count <= 0) {
        clearInterval(interval);
        if (isMountedRef.current) {
          onCompleted();
        }
      }
    }, 1000);
  }, [onCompleted]);

  // Real-time EventSource listener: First-Finisher Wins (Option B: Staff on PC)
  useEffect(() => {
    isMountedRef.current = true;

    // Listen to SSE events for parallel completion by staff
    const unsubscribe = defaultApiClient.connectEvents((eventPayload) => {
      const { event, data } = eventPayload;
      if (
        (event === 'patient_info_completed' || event === 'patient_status') &&
        data &&
        typeof data === 'object'
      ) {
        const payloadObj = data as { patient_id?: string; id?: string };
        const updatedId = payloadObj.patient_id || payloadObj.id;
        if (updatedId === patientId) {
          triggerSuccessSequence(true);
        }
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [patientId, triggerSuccessSequence]);

  // Form submission: Option A (Directly at Kiosk)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSuccess) return;

    if (!firstName.trim()) {
      setErrorMsg('กรุณาระบุชื่อผู้ป่วย');
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum <= 0 || ageNum > 130) {
      setErrorMsg('กรุณาระบุอายุให้ถูกต้อง');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await defaultApiClient.smartOnboarding.completeInfo({
        patient_id: patientId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: ageNum,
        gender,
        phone: phone.trim() || undefined,
        initial_symptoms: initialSymptoms.trim() || undefined,
      });

      triggerSuccessSequence(false);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  // Success view with 3s countdown
  if (isSuccess) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950 text-white select-none">
        <div className="max-w-md w-full bg-emerald-950/40 border-2 border-emerald-500/50 rounded-3xl p-8 text-center shadow-2xl flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-5 text-emerald-400">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            ✅ ลงทะเบียน/สมัครบัญชีสำเร็จ!
          </h2>

          <p className="text-sm text-emerald-200/90 mb-4 leading-relaxed">
            {finishedByStaff
              ? 'เจ้าหน้าที่ที่เคาน์เตอร์ได้ลงข้อมูลของท่านเรียบร้อยแล้ว'
              : 'บันทึกข้อมูลส่วนตัวของท่านเข้าสู่ระบบเวชระเบียนเรียบร้อยแล้ว'}
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            <span>กำลังกลับหน้าแรกเพื่อสแกนใบหน้าใน {resetCountdown} วินาที...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col justify-between py-6 px-8 select-none bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Step 2.3: กรอกข้อมูลส่วนตัว (ทางเลือก A หน้าตู้คีออส)</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          กรอกข้อมูลส่วนตัวผู้ป่วย
        </h1>
        <p className="text-xs text-slate-400">
          รหัสประจำตัว: <span className="font-mono text-emerald-400 font-semibold">{patientId}</span> • หรือให้เจ้าหน้าที่ช่วยกรอกที่คอมพิวเตอร์หลังบ้านได้พร้อมกัน
        </p>
      </div>

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4"
      >
        {errorMsg && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-200 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* First Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>ชื่อ <span className="text-red-400">*</span></span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="เช่น ธนกฤต"
              required
              className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white text-base focus:outline-none"
            />
          </div>

          {/* Last Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">
              นามสกุล
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="เช่น ใจดี"
              className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white text-base focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Age */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">
              อายุ (ปี) <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="125"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
                className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white text-base focus:outline-none flex-1"
              />
              <div className="flex gap-1">
                {[50, 60, 70].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAge(String(v))}
                    className="px-2.5 py-3 rounded-lg bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gender */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">
              เพศ <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['male', 'female', 'other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`py-3 rounded-xl text-xs font-medium border transition ${
                    gender === g
                      ? 'bg-emerald-600 border-emerald-500 text-white font-semibold'
                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {g === 'male' ? 'ชาย' : g === 'female' ? 'หญิง' : 'อื่นๆ'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span>เบอร์โทรศัพท์ (ทางเลือก)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="เช่น 081-234-5678"
            className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white text-base focus:outline-none"
          />
        </div>

        {/* Symptoms */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>อาการเบื้องต้น / บริเวณที่ต้องการฟื้นฟู</span>
          </label>
          <input
            type="text"
            value={initialSymptoms}
            onChange={(e) => setInitialSymptoms(e.target.value)}
            placeholder="เช่น ข้อไหล่ติด ยกแขนไม่ขึ้น, ปวดเข่าเรื้อรัง"
            className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white text-base focus:outline-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-6 py-3.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-medium transition active:scale-95 disabled:opacity-50"
            >
              ยกเลิก
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-900/40 transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>กำลังบันทึกข้อมูล...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>บันทึกข้อมูลส่วนตัว (เสร็จสิ้น)</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Footer Banner */}
      <div className="w-full max-w-2xl mx-auto mt-3 py-2 px-4 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center text-xs text-slate-400">
        💡 ระบบ Dual-Channel Sync: เจ้าหน้าที่ที่คอมพิวเตอร์แอดมินสามารถกรอกข้อมูลให้ท่านได้พร้อมกันทันที
      </div>
    </div>
  );
};
