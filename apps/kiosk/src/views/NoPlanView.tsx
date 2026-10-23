import React, { useState, useEffect } from 'react';
import { CalendarX, Home, Bell } from 'lucide-react';

interface NoPlanViewProps {
  onReset: () => void;
  onCallStaff: () => void;
}

export const NoPlanView: React.FC<NoPlanViewProps> = ({ onReset, onCallStaff }) => {
  const [countdown, setCountdown] = useState<number>(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onReset]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-12 px-8 select-none bg-slate-950">
      <div className="my-auto w-full max-w-lg p-10 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center mb-6 text-amber-400">
          <CalendarX className="w-12 h-12" />
        </div>

        <h2 className="text-3xl font-extrabold text-white">
          วันนี้ไม่มีนัดหมายกายภาพบำบัด
        </h2>

        <p className="text-base text-slate-300 mt-4 leading-relaxed">
          ระบบตรวจสอบไม่พบคอร์สฝึกกายภาพบำบัดที่กำหนดไว้สำหรับท่านในวันนี้
          กรุณาติดต่อเคาน์เตอร์ต้อนรับ หรือปรึกษานักกายภาพบำบัดประจำตัวท่าน
        </p>

        {/* Countdown Pill */}
        <div className="mt-8 px-5 py-2 rounded-full bg-slate-800 text-xs text-slate-400 font-mono">
          จะกลับสู่หน้าพักจออัตโนมัติใน {countdown} วินาที
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-md flex items-center gap-4 pb-4">
        <button
          onClick={onReset}
          className="touch-btn flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-base flex items-center justify-center gap-2"
        >
          <Home className="w-5 h-5" />
          <span>กลับสู่หน้าหลัก</span>
        </button>

        <button
          onClick={onCallStaff}
          className="touch-btn flex-1 py-4 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-semibold text-base flex items-center justify-center gap-2"
        >
          <Bell className="w-5 h-5" />
          <span>ติดต่อเจ้าหน้าที่</span>
        </button>
      </div>
    </div>
  );
};
