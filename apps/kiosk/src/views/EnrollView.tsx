import React, { useState, useEffect } from 'react';
import { MirrorCanvas } from '../components/MirrorCanvas';
import { Camera, ShieldCheck } from 'lucide-react';

interface EnrollViewProps {
  ticketId?: string | null;
  framesCount: number;
  onFrameCaptured: () => void;
  onComplete: () => void;
}

export const EnrollView: React.FC<EnrollViewProps> = ({
  ticketId,
  framesCount,
  onFrameCaptured,
  onComplete,
}) => {
  const [guideStep, setGuideStep] = useState<string>('กรุณามองตรงที่กล้อง');

  useEffect(() => {
    if (framesCount >= 10) {
      onComplete();
      return;
    }
    if (framesCount < 3) {
      setGuideStep('มองตรงที่กล้อง (หน้าตรง)');
    } else if (framesCount < 6) {
      setGuideStep('เอียงศีรษะไปทางซ้ายเล็กน้อย');
    } else if (framesCount < 9) {
      setGuideStep('เอียงศีรษะไปทางขวาเล็กน้อย');
    } else {
      setGuideStep('พยักหน้าช้าๆ เพื่อยืนยันชีวมาตร');
    }
  }, [framesCount, onComplete]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950">
      {/* Header */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
          ลงทะเบียนใบหน้าครั้งแรก (10 Frames Enrollment)
        </span>
        <h2 className="text-3xl font-extrabold text-white mt-2">
          บันทึกข้อมูลใบหน้าผู้ป่วยใหม่
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          บัตรคิว: <span className="font-mono text-blue-400">{ticketId || 'เคาน์เตอร์ต้อนรับ'}</span>
        </p>
      </div>

      {/* Mirrored Camera View with 10-Tick Progress Arc */}
      <div className="my-auto w-full max-w-xl h-96">
        <MirrorCanvas
          showRing={true}
          ringProgress={framesCount}
          guidanceText={`${guideStep} (${framesCount}/10 เฟรม)`}
          className="w-full h-full"
        />
      </div>

      {/* Manual / Auto Capture Controls */}
      <div className="w-full max-w-xl flex flex-col items-center gap-3 pb-2">
        <button
          onClick={onFrameCaptured}
          className="touch-btn w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-lg shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2"
        >
          <Camera className="w-5 h-5" />
          <span>บันทึกภาพเฟรมที่ {framesCount + 1} / 10</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>ข้อมูลเวกเตอร์ชีวมาตรจะถูกจัดเก็บตามมาตรฐานความปลอดภัย PDPA</span>
        </div>
      </div>
    </div>
  );
};
