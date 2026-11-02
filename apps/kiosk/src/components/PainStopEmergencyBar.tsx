/**
 * apps/kiosk/src/components/PainStopEmergencyBar.tsx
 *
 * CLINICAL SAFETY & EMERGENCY PAIN STOP BAR
 * Always rendered at the bottom of the active exercise session.
 * Allows immediate pausing or high-priority pain reporting.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Pause, Play, AlertOctagon, LogOut, Loader2 } from 'lucide-react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

interface PainStopEmergencyBarProps {
  isPaused: boolean;
  onTogglePause: () => void;
  onReportPainStop: () => void;
  onExitSession: () => void;
}

export const PainStopEmergencyBar: React.FC<PainStopEmergencyBarProps> = ({
  isPaused,
  onTogglePause,
  onReportPainStop,
  onExitSession,
}) => {
  const { lang, t } = useClinicalI18n();
  const [isSubmittingPain, setIsSubmittingPain] = useState(false);
  const lastClickTimeRef = useRef<number>(0);

  const handlePainClick = useCallback(() => {
    const now = Date.now();
    // 2500ms debounce guard to prevent accidental repeated presses
    if (now - lastClickTimeRef.current < 2500 || isSubmittingPain) {
      return;
    }
    lastClickTimeRef.current = now;
    setIsSubmittingPain(true);

    try {
      onReportPainStop();
    } finally {
      // Release lock after 3000ms if session didn't unmount
      setTimeout(() => {
        setIsSubmittingPain(false);
      }, 3000);
    }
  }, [onReportPainStop, isSubmittingPain]);

  return (
    <div className="w-full bg-slate-950/95 border-t border-slate-800 backdrop-blur-md px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4 z-30 select-none">
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <button
          type="button"
          onClick={onExitSession}
          className="min-h-[56px] px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-lg font-black flex items-center gap-2.5 transition active:scale-95 cursor-pointer border border-slate-700/90 shadow-md"
          title="ออกจากการฝึก"
        >
          <LogOut className="w-6 h-6 shrink-0 text-slate-400" />
          <span>{t('exit_exercise', '⬅️ ออกจากการฝึก')}</span>
        </button>

        <button
          type="button"
          onClick={onTogglePause}
          className={`min-h-[56px] px-6 py-3.5 rounded-2xl text-lg font-black flex items-center gap-2.5 transition active:scale-95 cursor-pointer border shadow-md ${
            isPaused
              ? 'bg-amber-500/25 border-amber-400 text-amber-200 hover:bg-amber-500/35'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700/90'
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-6 h-6 fill-amber-300 text-amber-300 shrink-0" />
              <span>{t('resume_session', '▶️ ฝึกต่อ')}</span>
            </>
          ) : (
            <>
              <Pause className="w-6 h-6 text-amber-300 shrink-0" />
              <span>{t('pause_session', '⏸️ พักชั่วคราว')}</span>
            </>
          )}
        </button>
      </div>

      {/* Prominent Red Emergency Pain Stop Button (Senior-Friendly, min-h-[60px], text-xl sm:text-2xl) */}
      <button
        type="button"
        id="pain-stop-emergency-btn"
        data-testid="pain-stop-emergency-btn"
        disabled={isSubmittingPain}
        onClick={handlePainClick}
        className={`min-h-[60px] px-8 py-4 rounded-2xl font-black text-xl sm:text-2xl shadow-2xl flex items-center gap-3.5 transition active:scale-95 cursor-pointer border-2 leading-relaxed ${
          isSubmittingPain
            ? 'bg-rose-900/60 border-rose-700 text-rose-200 cursor-not-allowed opacity-80'
            : 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-950/80 border-rose-400/50 animate-pulse'
        }`}
      >
        {isSubmittingPain ? (
          <>
            <Loader2 className="w-7 h-7 shrink-0 animate-spin" />
            <span>
              {lang === 'zh-CN'
                ? '正在呼叫医护人员...'
                : lang === 'en-US'
                ? 'Notifying therapist...'
                : 'กำลังแจ้งเจ้าหน้าที่...'}
            </span>
          </>
        ) : (
          <>
            <AlertOctagon className="w-7 h-7 shrink-0 text-white" />
            <span>{t('stopped_pain', '🚨 รู้สึกเจ็บ (หยุดทันที)')}</span>
          </>
        )}
      </button>
    </div>
  );
};

