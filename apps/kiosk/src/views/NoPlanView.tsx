import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CalendarX, Home, Bell, CheckCircle2 } from 'lucide-react';

interface NoPlanViewProps {
  onReset: () => void;
  onCallStaff: () => void;
  lang?: 'th' | 'en' | 'cn';
}

const I18N = {
  th: {
    title: 'ยังไม่มีโปรแกรมฝึกในวันนี้ กรุณาติดต่อนักกายภาพบำบัด',
    desc: 'ระบบตรวจสอบไม่พบคอร์สฝึกกายภาพบำบัดที่กำหนดไว้สำหรับท่านในวันนี้ กรุณาติดต่อเคาน์เตอร์ต้อนรับ หรือกดปุ่มเรียกเจ้าหน้าที่ด้านล่าง',
    countdownText: (sec: number) => `จะกลับสู่หน้าพักจออัตโนมัติใน ${sec} วินาที`,
    staffCalledNotice: 'ส่งคำเรียกเจ้าหน้าที่แล้ว กรุณารอสักครู่',
    homeBtn: 'กลับสู่หน้าหลัก',
    callStaffBtn: 'เรียกเจ้าหน้าที่',
    staffNotifiedBtn: 'แจ้งเจ้าหน้าที่แล้ว',
  },
  en: {
    title: 'No exercise program scheduled for today. Please contact your physical therapist.',
    desc: 'No active rehabilitation program was found for you today. Please contact the reception desk or press the Call Staff button below.',
    countdownText: (sec: number) => `Returning to home screen in ${sec}s`,
    staffCalledNotice: 'Staff has been notified. Please wait a moment.',
    homeBtn: 'Back to Home',
    callStaffBtn: 'Call Staff',
    staffNotifiedBtn: 'Staff Notified',
  },
  cn: {
    title: '今日暂无康复训练方案，请联系物理治疗师。',
    desc: '系统未查询到您今日的康复训练计划。请联系前台或点击下方按钮呼叫医护人员。',
    countdownText: (sec: number) => `将在 ${sec} 秒后自动返回主屏幕`,
    staffCalledNotice: '已通知医护人员，请稍候。',
    homeBtn: '返回主页',
    callStaffBtn: '呼叫医护人员',
    staffNotifiedBtn: '已呼叫医护人员',
  },
} as const;

export const NoPlanView: React.FC<NoPlanViewProps> = ({
  onReset,
  onCallStaff,
  lang = 'th',
}) => {
  const t = I18N[lang] || I18N.th;
  const [countdown, setCountdown] = useState<number>(15);
  const [staffCalled, setStaffCalled] = useState<boolean>(false);
  const hasResetRef = useRef<boolean>(false);
  const onResetRef = useRef(onReset);

  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  const handleSafeReset = useCallback(() => {
    if (hasResetRef.current) return;
    hasResetRef.current = true;
    onResetRef.current();
  }, []);

  // แยกการนับเวลาออกจากผลข้างเคียง onReset เพื่อไม่ให้กระทบ React 18 StrictMode
  useEffect(() => {
    if (staffCalled) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [staffCalled]);

  useEffect(() => {
    if (!staffCalled && countdown === 0) {
      handleSafeReset();
    }
  }, [countdown, staffCalled, handleSafeReset]);

  const handleCallStaffClick = useCallback(() => {
    if (staffCalled) return;
    setStaffCalled(true);
    onCallStaff();
  }, [staffCalled, onCallStaff]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-12 px-8 select-none bg-slate-950">
      <div className="my-auto w-full max-w-lg p-10 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center mb-6 text-amber-400">
          <CalendarX className="w-12 h-12" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-snug">
          {t.title}
        </h2>

        <p className="text-base text-slate-300 mt-4 leading-relaxed">
          {t.desc}
        </p>

        {/* Countdown or Staff Called Pill */}
        <div className="mt-8 px-5 py-2 rounded-full bg-slate-800 text-xs text-slate-300 font-mono flex items-center gap-2">
          {staffCalled ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300 font-semibold">{t.staffCalledNotice}</span>
            </>
          ) : (
            <span>{t.countdownText(countdown)}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-md flex items-center gap-4 pb-4">
        <button
          type="button"
          onClick={handleSafeReset}
          className="touch-btn flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-base flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Home className="w-5 h-5" />
          <span>{t.homeBtn}</span>
        </button>

        <button
          type="button"
          onClick={handleCallStaffClick}
          disabled={staffCalled}
          className={`touch-btn flex-1 py-4 rounded-2xl border font-semibold text-base flex items-center justify-center gap-2 transition cursor-pointer ${
            staffCalled
              ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300 cursor-default'
              : 'bg-rose-600/20 hover:bg-rose-600/30 border-rose-500/30 text-rose-300'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span>{staffCalled ? t.staffNotifiedBtn : t.callStaffBtn}</span>
        </button>
      </div>
    </div>
  );
};
