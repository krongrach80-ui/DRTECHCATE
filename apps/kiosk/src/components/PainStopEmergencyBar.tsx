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
    <div className="w-full bg-white border-t-2 border-slate-200 px-6 sm:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-4 z-20 shrink-0 select-none shadow-md">
      {/* 1. Left Large Button: Pause / Resume (WCAG AAA touch target: min-h >= 58px) */}
      <button
        type="button"
        id="kiosk-pause-btn"
        data-testid="kiosk-header-pause-btn"
        onClick={onTogglePause}
        className="min-h-[58px] sm:min-h-[64px] bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300 hover:border-slate-400 font-black px-6 sm:px-8 py-3.5 rounded-2xl transition cursor-pointer text-base sm:text-xl flex items-center gap-2.5 active:scale-95 shadow-xs"
        title={isPaused ? t('resume_session', 'ฝึกต่อ') : t('pause_session', 'พักการฝึก')}
      >
        {isPaused ? (
          <>
            <Play className="w-6 h-6 fill-current text-blue-700" />
            <span className="text-blue-900">{t('resume_session', '▶️ ฝึกต่อ')}</span>
          </>
        ) : (
          <>
            <Pause className="w-6 h-6 text-slate-700" />
            <span>{t('pause_session', '⏸️ พักชั่วคราว')}</span>
          </>
        )}
      </button>

      {/* 2. Center/Right: Skip / Record + Emergency Pain Stop */}
      <div className="flex items-center gap-3 sm:gap-4">
        {onSkipOrFinish && (
          <button
            type="button"
            id="kiosk-skip-btn"
            data-testid="kiosk-skip-btn"
            onClick={onSkipOrFinish}
            className="min-h-[58px] sm:min-h-[64px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-300 font-extrabold px-5 sm:px-7 py-3.5 rounded-2xl transition cursor-pointer text-base sm:text-xl flex items-center gap-2 active:scale-95 shadow-xs"
            title="ข้ามท่านี้ หรือบันทึกผลการฝึก"
          >
            <span>⏭️ ข้ามท่านี้ / บันทึกผล</span>
          </button>
        )}

        <button
          type="button"
          id="pain-stop-emergency-btn"
          data-testid="pain-stop-emergency-btn"
          disabled={isSubmittingPain}
          onClick={handlePainClick}
          className={`min-h-[58px] sm:min-h-[64px] px-7 sm:px-9 py-3.5 rounded-2xl font-black text-base sm:text-xl shadow-lg flex items-center gap-3 transition active:scale-95 cursor-pointer border-2 ${
            isSubmittingPain
              ? 'bg-rose-100 border-rose-300 text-rose-600 cursor-not-allowed opacity-80'
              : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-700 shadow-rose-950/30'
          }`}
          title="หยุดการฝึกทันทีเมื่อรู้สึกเจ็บ"
        >
          {isSubmittingPain ? (
            <>
              <Loader2 className="w-6 h-6 shrink-0 animate-spin text-rose-600" />
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
              <AlertOctagon className="w-6 h-6 shrink-0 text-white" />
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
    </div>
  );
};
