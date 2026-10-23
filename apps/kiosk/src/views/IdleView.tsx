import React from 'react';
import { FloatingLogo } from '../components/FloatingLogo';
import { UserCheck, Sparkles, Touchpad, AlertTriangle, Bell } from 'lucide-react';

interface IdleViewProps {
  onStart: () => void;
  onCallStaff: () => void;
  isDetectorReady?: boolean;
}

export const IdleView: React.FC<IdleViewProps> = ({
  onStart,
  onCallStaff,
  isDetectorReady = false,
}) => {
  return (
    <div
      onClick={isDetectorReady ? onStart : undefined}
      className={`w-full h-full flex flex-col items-center justify-between py-16 px-8 select-none bg-radial from-slate-900/60 via-slate-950 to-slate-950 ${
        isDetectorReady ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      {/* Top hospital banner */}
      <div className="flex items-center gap-2 text-slate-400 text-sm font-medium tracking-wide">
        <Sparkles className="w-4 h-4 text-blue-400" />
        <span>โรงพยาบาลกายภาพบำบัดอัจฉริยะ • ศูนย์ฟื้นฟูข้อต่อและกล้ามเนื้อ</span>
      </div>

      {/* Center floating emblem */}
      <div className="flex flex-col items-center text-center my-auto">
        <FloatingLogo />

        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mt-10 tracking-tight">
          DrTech<span className="text-blue-400">.Care</span>
        </h1>
        <p className="text-xl text-blue-200/80 font-light mt-3">
          ตู้ตรวจประเมินและฝึกกายภาพบำบัดอัจฉริยะ
        </p>

        {/* Fail-closed condition when detector is not available */}
        {!isDetectorReady ? (
          <div className="mt-10 flex flex-col items-center gap-4 max-w-md p-6 rounded-3xl bg-rose-950/40 border border-rose-500/40 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-lg">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
              <span>ระบบสแกนใบหน้ายังไม่พร้อม</span>
            </div>
            <p className="text-sm text-slate-300 text-center leading-relaxed">
              ไม่พบโมเดลตรวจจับใบหน้าหรือกล้องยังไม่พร้อมใช้งาน ระบบปิดการทำงานอัตโนมัติเพื่อความปลอดภัย (Fail-Closed)
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCallStaff();
              }}
              className="mt-2 touch-btn px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base shadow-lg shadow-rose-600/40 flex items-center gap-2 transition"
            >
              <Bell className="w-5 h-5" />
              <span>เรียกเจ้าหน้าที่</span>
            </button>
          </div>
        ) : (
          /* Pulsing Start Cue when detector is ready */
          <div className="mt-12 flex items-center gap-3 px-8 py-4 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 font-semibold text-lg shadow-2xl animate-pulse">
            <Touchpad className="w-6 h-6 text-blue-400" />
            <span>แตะหน้าจอเพื่อเริ่มต้นใช้งาน</span>
          </div>
        )}
      </div>

      {/* Bottom guidance */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <UserCheck className="w-4 h-4 text-emerald-400" />
        <span>ระบบตรวจจับใบหน้าอัตโนมัติเมื่อก้าวมายืนหน้าตู้</span>
      </div>
    </div>
  );
};
