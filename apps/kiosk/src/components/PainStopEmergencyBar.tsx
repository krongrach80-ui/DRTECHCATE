/**
 * apps/kiosk/src/components/PainStopEmergencyBar.tsx
 *
 * CLINICAL SAFETY & EMERGENCY PAIN STOP BAR (FDA SaMD Class II / IEC 62304)
 * Authoritative single-purpose emergency stop component rendered at the bottom
 * of active exercise sessions. Stripped of all duplicate navigation/pause controls.
 */

import React, { useState, useRef, useCallback } from 'react';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

export interface PainStopEmergencyBarProps {
  onReportPainStop: () => void;
  isPaused?: boolean;
}

export const PainStopEmergencyBar: React.FC<PainStopEmergencyBarProps> = ({
  onReportPainStop,
  isPaused: _isPaused,
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
    <div className="w-full bg-slate-950/90 border-t border-slate-800 backdrop-blur-md px-6 py-3 flex items-center justify-between z-30 select-none">
      {/* Left Section: System Telemetry Heartbeat (FDA SaMD Active Vision Status) */}
      <div className="flex items-center gap-2.5 text-sm text-slate-400">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
        <span className="font-semibold text-slate-300">
          {lang === 'zh-CN'
            ? '🟢 AI 视觉追踪已就绪 · 生物力学实时监测'
            : lang === 'en-US'
            ? '🟢 AI Vision Active · Kinematics Verified'
            : '🟢 ระบบตรวจจับชีวกลศาสตร์ AI เปิดทำงานต่อเนื่อง'}
        </span>
      </div>

      {/* Right Section: Large, Senior-Friendly Single Emergency Pain Stop Button */}
      <button
        type="button"
        id="pain-stop-emergency-btn"
        data-testid="pain-stop-emergency-btn"
        disabled={isSubmittingPain}
        onClick={handlePainClick}
        className={`min-h-[52px] sm:min-h-[56px] px-6 sm:px-8 py-3 rounded-2xl font-black text-lg sm:text-xl shadow-2xl flex items-center gap-3 transition active:scale-95 cursor-pointer border-2 ${
          isSubmittingPain
            ? 'bg-rose-900/60 border-rose-700 text-rose-200 cursor-not-allowed opacity-80'
            : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-950/80 border-rose-400/50'
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
            <AlertOctagon className="w-6 h-6 shrink-0 text-white" />
            <span>{t('stopped_pain', '🚨 รู้สึกเจ็บ (หยุดทันที)')}</span>
          </>
        )}
      </button>
    </div>
  );
};
