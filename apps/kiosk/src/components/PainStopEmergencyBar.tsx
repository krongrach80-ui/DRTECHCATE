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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExitSession}
          className="min-h-[48px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-base font-bold flex items-center gap-2 transition active:scale-95 cursor-pointer border border-slate-700/80 shadow-sm"
          title="ออกจากเซสชันนี้"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span>{t('exit_exercise', 'ออกจากการฝึก')}</span>
        </button>

        <button
          type="button"
          onClick={onTogglePause}
          className={`min-h-[48px] px-5 py-3 rounded-2xl text-base font-bold flex items-center gap-2.5 transition active:scale-95 cursor-pointer border shadow-sm ${
            isPaused
              ? 'bg-amber-500/25 border-amber-500/60 text-amber-300 hover:bg-amber-500/35'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-5 h-5 fill-amber-300 shrink-0" />
              <span>{t('resume_session', 'ทำต่อ (Resume)')}</span>
            </>
          ) : (
            <>
              <Pause className="w-5 h-5 shrink-0" />
              <span>{t('pause_session', '🛑 พักสักครู่')}</span>
            </>
          )}
        </button>
      </div>

      {/* Prominent Red Emergency Pain Stop Button with Idempotency Lock (Min height 52px, text >= 16px) */}
      <button
        type="button"
        id="pain-stop-emergency-btn"
        data-testid="pain-stop-emergency-btn"
        disabled={isSubmittingPain}
        onClick={handlePainClick}
        className={`min-h-[52px] px-6 py-3.5 rounded-2xl font-black text-base sm:text-lg shadow-xl flex items-center gap-3 transition active:scale-95 cursor-pointer border leading-relaxed ${
          isSubmittingPain
            ? 'bg-rose-900/60 border-rose-700 text-rose-200 cursor-not-allowed opacity-80'
            : 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-950/70 border-rose-400/40 animate-pulse'
        }`}
      >
        {isSubmittingPain ? (
          <>
            <Loader2 className="w-6 h-6 shrink-0 animate-spin" />
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
            <AlertOctagon className="w-6 h-6 shrink-0" />
            <span>{t('stopped_pain', '🚨 รู้สึกเจ็บ (หยุดฉุกเฉินและแจ้งนักกายภาพ)')}</span>
          </>
        )}
      </button>
    </div>
  );
};

