/**
 * apps/kiosk/src/components/PainStopEmergencyBar.tsx
 *
 * SENIOR-FRIENDLY CLINICAL SAFETY & EMERGENCY BOTTOM BAR (FDA SaMD Class II)
 * High-visibility, senior-accessible buttons for Kiosk Portrait (1080x1920) & Landscape:
 * 1. Left: "⏸️ พักชั่วคราว" / "▶️ ฝึกต่อ" (Pause / Resume) (min-h >= 58px, WCAG AAA contrast)
 * 2. Center/Right: "⏭️ ข้ามท่านี้ / บันทึกผล" (Skip / Save) (min-h >= 58px)
 * 3. Right: "🚨 รู้สึกเจ็บ (หยุดและแจ้งนักกายภาพ)" (Emergency Pain Stop) (min-h >= 58px, large bold typography)
 */

import React, { useState, useRef, useCallback } from 'react';
import { AlertOctagon, Loader2, Pause, Play } from 'lucide-react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

export interface PainStopEmergencyBarProps {
  onReportPainStop: () => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onSkipOrFinish?: () => void;
}

export const PainStopEmergencyBar: React.FC<PainStopEmergencyBarProps> = ({
  onReportPainStop,
  isPaused = false,
  onTogglePause,
  onSkipOrFinish,
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
    <div className="w-full bg-white border-t-2 border-slate-200 px-[clamp(0.75rem,2vw,2rem)] py-[clamp(0.5rem,1.2dvh,1rem)] flex flex-wrap items-center justify-between gap-[clamp(0.5rem,1.2vw,1rem)] z-20 shrink-0 select-none shadow-md">
      {/* 1. Left Large Button: Pause / Resume (WCAG AAA touch target >= 44px) */}
      <button
        type="button"
        id="kiosk-pause-btn"
        data-testid="kiosk-header-pause-btn"
        onClick={onTogglePause}
        className="exercise-touch-btn min-h-[2.75rem] sm:min-h-[3.5rem] bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300 hover:border-slate-400 font-black px-[clamp(0.75rem,2vw,1.75rem)] py-[clamp(0.5rem,1dvh,0.875rem)] rounded-2xl cursor-pointer text-[clamp(0.875rem,1.6vw,1.25rem)] flex items-center gap-2 shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        title={isPaused ? t('resume_session', 'ฝึกต่อ') : t('pause_session', 'พักการฝึก')}
      >
        {isPaused ? (
          <>
            <Play className="w-[1.25rem] h-[1.25rem] sm:w-[1.5rem] sm:h-[1.5rem] shrink-0 fill-current text-blue-700" />
            <span className="text-blue-900 truncate">{t('resume_session', '▶️ ฝึกต่อ')}</span>
          </>
        ) : (
          <>
            <Pause className="w-[1.25rem] h-[1.25rem] sm:w-[1.5rem] sm:h-[1.5rem] shrink-0 text-slate-700" />
            <span className="truncate">{t('pause_session', '⏸️ พักชั่วคราว')}</span>
          </>
        )}
      </button>

      {/* 2. Center/Right: Skip / Record + Emergency Pain Stop */}
      <div className="flex flex-wrap items-center justify-end gap-[clamp(0.5rem,1vw,1rem)] flex-1 min-w-0">
        {onSkipOrFinish && (
          <button
            type="button"
            id="kiosk-skip-btn"
            data-testid="kiosk-skip-btn"
            onClick={onSkipOrFinish}
            className="exercise-touch-btn min-h-[2.75rem] sm:min-h-[3.5rem] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-300 hover:border-emerald-400 font-extrabold px-[clamp(0.75rem,1.8vw,1.5rem)] py-[clamp(0.5rem,1dvh,0.875rem)] rounded-2xl cursor-pointer text-[clamp(0.875rem,1.6vw,1.25rem)] flex items-center gap-2 shadow-xs max-w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            title="ข้ามท่านี้ หรือบันทึกผลการฝึก"
          >
            <span className="truncate">⏭️ ข้ามท่านี้ / บันทึกผล</span>
          </button>
        )}

        <button
          type="button"
          id="pain-stop-emergency-btn"
          data-testid="pain-stop-emergency-btn"
          disabled={isSubmittingPain}
          onClick={handlePainClick}
          className={`exercise-touch-btn min-h-[2.75rem] sm:min-h-[3.5rem] px-[clamp(0.875rem,2.2vw,2rem)] py-[clamp(0.5rem,1dvh,0.875rem)] rounded-2xl font-black text-[clamp(0.875rem,1.6vw,1.25rem)] shadow-lg flex items-center gap-2.5 cursor-pointer border-2 max-w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 ${
            isSubmittingPain
              ? 'bg-rose-100 border-rose-300 text-rose-600 cursor-not-allowed opacity-80'
              : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-700 shadow-rose-950/30'
          }`}
          title="หยุดการฝึกทันทีเมื่อรู้สึกเจ็บ"
        >
          {isSubmittingPain ? (
            <>
              <Loader2 className="w-[1.25rem] h-[1.25rem] sm:w-[1.5rem] sm:h-[1.5rem] shrink-0 animate-spin text-rose-600" />
              <span className="truncate">
                {lang === 'zh-CN'
                  ? '正在呼叫治疗师...'
                  : lang === 'en-US'
                  ? 'Notifying therapist...'
                  : 'กำลังแจ้งเจ้าหน้าที่...'}
              </span>
            </>
          ) : (
            <>
              <AlertOctagon className="w-[1.25rem] h-[1.25rem] sm:w-[1.5rem] sm:h-[1.5rem] shrink-0 text-white" />
              <span className="truncate">
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
    </div>
  );
};
