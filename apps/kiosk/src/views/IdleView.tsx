import React from 'react';
import { FloatingLogo } from '../components/FloatingLogo';
import { UserCheck, Sparkles, Touchpad } from 'lucide-react';

interface IdleViewProps {
  onStart: () => void;
  onSimulateFaceDetect: () => void;
}

export const IdleView: React.FC<IdleViewProps> = ({ onStart, onSimulateFaceDetect }) => {
  return (
    <div
      onClick={onStart}
      className="w-full h-full flex flex-col items-center justify-between py-16 px-8 cursor-pointer select-none bg-radial from-slate-900/60 via-slate-950 to-slate-950"
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

        {/* Pulsing Start Cue */}
        <div className="mt-12 flex items-center gap-3 px-8 py-4 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 font-semibold text-lg shadow-2xl animate-pulse">
          <Touchpad className="w-6 h-6 text-blue-400" />
          <span>แตะหน้าจอเพื่อเริ่มต้นใช้งาน</span>
        </div>
      </div>

      {/* Bottom guidance & simulated face trigger */}
      <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span>ระบบตรวจจับใบหน้าอัตโนมัติเมื่อก้าวมายืนหน้าตู้</span>
        </div>
        <span className="hidden sm:inline text-slate-700">•</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSimulateFaceDetect();
          }}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
        >
          [จำลองตรวจพบใบหน้านิ่ง 1 วินาที]
        </button>
      </div>
    </div>
  );
};
