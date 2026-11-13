import React, { useEffect, useRef, useCallback } from 'react';
import { Check, Sparkles } from 'lucide-react';

interface TickViewProps {
  onDone?: () => void;
  autoAdvanceMs?: number;
  lang?: 'th' | 'en' | 'cn';
}

const I18N = {
  th: {
    saved: 'บันทึกความก้าวหน้าเรียบร้อย',
    great: 'ยอดเยี่ยมมากครับ!',
    preparing: 'กำลังเตรียมขั้นตอนถัดไป...',
  },
  en: {
    saved: 'Progress Saved Successfully',
    great: 'Great Job!',
    preparing: 'Preparing the next step...',
  },
  cn: {
    saved: '训练进度已保存',
    great: '做得非常棒！',
    preparing: '正在准备下一步...',
  },
} as const;

export const TickView: React.FC<TickViewProps> = ({
  onDone,
  autoAdvanceMs = 2200,
  lang = 'th',
}) => {
  const t = I18N[lang] || I18N.th;
  const hasTriggeredRef = useRef<boolean>(false);

  const triggerDone = useCallback(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    onDone?.();
  }, [onDone]);

  // เดินหน้าสู่ขั้นตอนถัดไปอัตโนมัติโดยไม่ต้องแตะหน้าจอ
  useEffect(() => {
    if (!onDone) return;
    const timer = setTimeout(() => {
      triggerDone();
    }, autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [onDone, autoAdvanceMs, triggerDone]);

  return (
    <div
      onClick={triggerDone}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') triggerDone();
      }}
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
          <span>{t.saved}</span>
        </div>

        <h2 className="text-4xl sm:text-5xl font-black text-white tracking-normal">
          {t.great}
        </h2>
        <p className="text-lg text-slate-400 mt-2">{t.preparing}</p>
      </div>
    </div>
  );
};
