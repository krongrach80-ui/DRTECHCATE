/**
 * apps/kiosk/src/components/PainStopEmergencyBar.tsx
 *
 * CLINICAL SAFETY & EMERGENCY PAIN STOP BAR
 * Always rendered at the bottom of the active exercise session.
 * Allows immediate pausing or high-priority pain reporting.
 */

import React, { useState, useRef, useCallback } from 'react';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

interface PainStopEmergencyBarProps {
  isPaused?: boolean;
  onTogglePause?: () => void;
  onReportPainStop: () => void;
  onExitSession?: () => void;
}

export const PainStopEmergencyBar: React.FC<PainStopEmergencyBarProps> = ({
  isPaused: _isPaused,
  onTogglePause: _onTogglePause,
  onReportPainStop,
  onExitSession: _onExitSession,
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
    <div className="w-full bg-slate-950/90 border-t border-slate-800 backdrop-blur-md px-6 py-2.5 flex items-center justify-between z-30 select-none">
      {/* ฝั่งซ้าย: แสดงสถานะระบบ ช่วยลดความกังวลให้ผู้ป่วย */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-medium">
          {lang === 'zh-CN'
            ? '生物力学检测系统已启用'
            : lang === 'en-US'
            ? 'Biomechanics detection active'
            : 'ระบบตรวจจับชีวกลศาสตร์เปิดทำงาน'}
        </span>
      </div>

      {/* ฝั่งขวา: คงเหลือปุ่มฉุกเฉินปุ่มเดียว เด่น ชัดเจน กดง่าย ไม่แย่งพื้นที่ */}
      <button
        type="button"
        id="pain-stop-emergency-btn"
        data-testid="pain-stop-emergency-btn"
        disabled={isSubmittingPain}
        onClick={handlePainClick}
        className={`min-h-[48px] px-6 py-2.5 rounded-xl font-black text-lg shadow-xl flex items-center gap-2.5 transition active:scale-95 cursor-pointer border ${
          isSubmittingPain
            ? 'bg-rose-900/60 border-rose-700 text-rose-200 cursor-not-allowed opacity-80'
            : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/80 border-rose-400/50'
        }`}
      >
        {isSubmittingPain ? (
          <>
            <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
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
            <AlertOctagon className="w-5 h-5 shrink-0 text-white" />
            <span>{t('stopped_pain', '🚨 รู้สึกเจ็บ (หยุดทันที)')}</span>
          </>
        )}
      </button>
    </div>
  );
};

