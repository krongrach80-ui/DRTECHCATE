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
    <div className="w-full bg-white border-t border-blue-100 px-6 py-3.5 flex items-center justify-between gap-4 z-20 shrink-0 select-none shadow-xs">
      {/* 1. Left Large Button: Pause / Resume */}
      <button
        type="button"
        id="kiosk-pause-btn"
        data-testid="kiosk-header-pause-btn"
        onClick={onTogglePause}
        className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-extrabold px-6 py-3.5 rounded-2xl transition cursor-pointer text-sm sm:text-base flex items-center gap-2 active:scale-95 shadow-xs"
        title={isPaused ? t('resume_session', 'ฝึกต่อ') : t('pause_session', 'พักการฝึก')}
      >
        {isPaused ? (
          <>
            <Play className="w-5 h-5 fill-current text-blue-800" />
            <span>{t('resume_session', '▶️ ฝึกต่อ')}</span>
          </>
        ) : (
          <>
            <Pause className="w-5 h-5 text-blue-800" />
            <span>{t('pause_session', '⏸️ พักชั่วคราว')}</span>
          </>
        )}
      </button>

      {/* 2. Center/Right: Skip / Record + Emergency Pain Stop */}
      <div className="flex items-center gap-3">
        {onSkipOrFinish && (
          <button
            type="button"
            id="kiosk-skip-btn"
            data-testid="kiosk-skip-btn"
            onClick={onSkipOrFinish}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-5 py-3.5 rounded-2xl transition cursor-pointer text-sm sm:text-base flex items-center gap-2 active:scale-95 shadow-xs"
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
          className={`px-6 py-3.5 rounded-2xl font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2.5 transition active:scale-95 cursor-pointer border ${
            isSubmittingPain
              ? 'bg-rose-100 border-rose-300 text-rose-500 cursor-not-allowed opacity-80'
              : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-rose-950/20'
          }`}
          title="หยุดการฝึกทันทีเมื่อรู้สึกเจ็บ"
        >
          {isSubmittingPain ? (
            <>
              <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
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
              <AlertOctagon className="w-5 h-5 shrink-0 text-white" />
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
