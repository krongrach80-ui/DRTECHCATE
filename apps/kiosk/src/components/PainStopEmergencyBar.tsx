/**
 * apps/kiosk/src/components/PainStopEmergencyBar.tsx
 *
 * SENIOR-FRIENDLY CLINICAL SAFETY & EMERGENCY BOTTOM BAR (FDA SaMD Class II)
 * Houses 2 large, high-visibility, senior-accessible buttons:
 * 1. Left: "⏸️ พัก" / "▶️ ฝึกต่อ" (Pause / Resume) (min-h >= 56px)
 * 2. Right: "🚨 รู้สึกเจ็บ (หยุดและแจ้งนักกายภาพ)" (Pain Stop Emergency) (min-h >= 56px)
 * Completely free of clutter, telemetry text, and small buttons.
 */

import React, { useState, useRef, useCallback } from 'react';
import { AlertOctagon, Loader2, Pause, Play } from 'lucide-react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

export interface PainStopEmergencyBarProps {
  onReportPainStop: () => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
}

export const PainStopEmergencyBar: React.FC<PainStopEmergencyBarProps> = ({
  onReportPainStop,
  isPaused = false,
  onTogglePause,
}) => {
  const { lang, t } = useClinicalI18n();
  const [isSubmittingPain, setIsSubmittingPain] = useState(false);
  const lastClickTimeRef = useRef<number>(0);

  const handlePainClick = useCallback(() => {
    const now = Date.now();
    // 2500ms debounce guard to prevent accidental double-tap
    if (now - lastClickTimeRef.current < 2500 || isSubmittingPain) {
      return;
    }
    lastClickTimeRef.current = now;
    setIsSubmittingPain(true);

    try {
      onReportPainStop();
    } finally {
      setTimeout(() => {
        setIsSubmittingPain(false);
      }, 3000);
    }
  }, [onReportPainStop, isSubmittingPain]);

  return (
    <div className="w-full bg-slate-950/95 border-t border-slate-800 backdrop-blur-md px-6 sm:px-10 py-3.5 sm:py-4 flex items-center justify-between z-30 select-none gap-4">
      {/* 1. Left Large Button: Pause / Resume (min-h >= 56px) */}
      <button
        type="button"
        id="kiosk-pause-btn"
        data-testid="kiosk-header-pause-btn"
        onClick={onTogglePause}
        className={`min-h-[56px] sm:min-h-[62px] px-7 sm:px-9 py-3 rounded-2xl font-black text-xl sm:text-2xl flex items-center gap-3 transition active:scale-95 cursor-pointer border-2 shadow-xl ${
          isPaused
            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30'
            : 'bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border-slate-700 shadow-slate-950/60'
        }`}
        title={isPaused ? t('resume_session', 'ฝึกต่อ') : t('pause_session', 'พักการฝึก')}
      >
        {isPaused ? (
          <>
            <Play className="w-7 h-7 fill-current shrink-0 text-slate-950" />
            <span>{t('resume_session', '▶️ ฝึกต่อ')}</span>
          </>
        ) : (
          <>
            <Pause className="w-7 h-7 shrink-0 text-amber-300" />
            <span>{t('pause_session', '⏸️ พัก')}</span>
          </>
        )}
      </button>

      {/* 2. Right Large Button: Emergency Pain Stop (min-h >= 56px) */}
      <button
        type="button"
        id="pain-stop-emergency-btn"
        data-testid="pain-stop-emergency-btn"
        disabled={isSubmittingPain}
        onClick={handlePainClick}
        className={`min-h-[56px] sm:min-h-[62px] px-7 sm:px-9 py-3 rounded-2xl font-black text-xl sm:text-2xl shadow-2xl flex items-center gap-3 transition active:scale-95 cursor-pointer border-2 ${
          isSubmittingPain
            ? 'bg-rose-900/60 border-rose-700 text-rose-200 cursor-not-allowed opacity-80'
            : 'bg-gradient-to-r from-rose-600 via-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-950/80 border-rose-400/50'
        }`}
        title="หยุดการฝึกทันทีเมื่อรู้สึกเจ็บ"
      >
        {isSubmittingPain ? (
          <>
            <Loader2 className="w-7 h-7 shrink-0 animate-spin" />
            <span>
              {lang === 'zh-CN'
                ? '正在呼叫治疗师...'
                : lang === 'en-US'
                ? 'Notifying therapist...'
                : 'กำลังแจ้งเจ้าหน้าที่...'}
            </span>
          </>
        ) : (
          <>
            <AlertOctagon className="w-7 h-7 shrink-0 text-white" />
            <span>
              {lang === 'zh-CN'
                ? '🚨 感到疼痛 (停止并呼叫治疗师)'
                : lang === 'en-US'
                ? '🚨 Feeling Pain (Stop & Alert PT)'
                : '🚨 รู้สึกเจ็บ (หยุดและแจ้งนักกายภาพ)'}
            </span>
          </>
        )}
      </button>
    </div>
  );
};
