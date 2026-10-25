import React from 'react';
import { Check, Sparkles } from 'lucide-react';

interface TickViewProps {
  onDone?: () => void;
}

export const TickView: React.FC<TickViewProps> = ({ onDone }) => {
  return (
    <div
      onClick={onDone}
      className="w-full h-full flex flex-col items-center justify-center p-8 select-none bg-slate-950 cursor-pointer"
    >
      <div className="flex flex-col items-center text-center animate-pop">
        {/* Giant Green Checkmark Bubble */}
        <div className="w-36 h-36 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-500/40 p-2 mb-8">
          <div className="w-full h-full rounded-full bg-emerald-500/20 backdrop-blur-sm border-4 border-white flex items-center justify-center">
            <Check className="w-20 h-20 text-white stroke-[3.5]" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-lg mb-2">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <span>บันทึกความก้าวหน้าเรียบร้อย</span>
        </div>

        <h2 className="text-4xl sm:text-5xl font-black text-white tracking-normal">
          ยอดเยี่ยมมากครับ!
        </h2>
        <p className="text-lg text-slate-400 mt-2">
          กำลังเตรียมขั้นตอนถัดไป...
        </p>
      </div>
    </div>
  );
};
