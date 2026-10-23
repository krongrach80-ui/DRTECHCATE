import React from 'react';
import { MirrorCanvas } from '../components/MirrorCanvas';
import { ArrowRight, User } from 'lucide-react';

interface PresentViewProps {
  onContinue: () => void;
}

export const PresentView: React.FC<PresentViewProps> = ({ onContinue }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950">
      {/* Top Greeting Banner */}
      <div className="text-center animate-fade-in">
        <h2 className="text-3xl font-extrabold text-white">
          สวัสดีครับ ยินดีต้อนรับสู่ <span className="text-blue-400">DrTech.Care</span>
        </h2>
        <p className="text-base text-slate-400 mt-1">
          ระบบพร้อมให้บริการกายภาพบำบัดประจำวันของท่านแล้ว
        </p>
      </div>

      {/* Mirrored Camera View with Head Silhouette */}
      <div className="my-auto w-full max-w-xl h-96">
        <MirrorCanvas
          showRing={true}
          ringProgress={5}
          guidanceText="ตรวจพบผู้ใช้งาน • กรุณามองตรง"
          className="w-full h-full"
        />
      </div>

      {/* Continue Action */}
      <div className="w-full max-w-md pb-4">
        <button
          onClick={onContinue}
          className="touch-btn w-full py-5 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xl shadow-xl shadow-blue-600/30 flex items-center justify-center gap-3"
        >
          <User className="w-6 h-6" />
          <span>เข้าสู่การยืนยันตัวตน</span>
          <ArrowRight className="w-6 h-6 ml-1" />
        </button>
      </div>
    </div>
  );
};
