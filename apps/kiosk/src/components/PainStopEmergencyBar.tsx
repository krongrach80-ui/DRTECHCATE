/**
 * apps/kiosk/src/components/PainStopEmergencyBar.tsx
 *
 * CLINICAL SAFETY & EMERGENCY PAIN STOP BAR
 * Always rendered at the bottom of the active exercise session.
 * Allows immediate pausing or high-priority pain reporting.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Pause, Play, AlertOctagon, LogOut, Loader2 } from 'lucide-react';

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
    <div className="w-full bg-slate-950/90 border-t border-slate-800 backdrop-blur-md px-4 sm:px-8 pr-32 sm:pr-40 py-3.5 flex flex-wrap items-center justify-between gap-3 z-30 select-none">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExitSession}
          className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer border border-slate-800"
          title="ออกจากเซสชันนี้"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">ออกจากการฝึก</span>
        </button>

        <button
          type="button"
          onClick={onTogglePause}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition active:scale-95 cursor-pointer border ${
            isPaused
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4 fill-amber-300" />
              <span>ทำต่อ (Resume)</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              <span>🛑 พักสักครู่</span>
            </>
          )}
        </button>
      </div>

      {/* Prominent Red Emergency Pain Stop Button with Idempotency Lock */}
      <button
        type="button"
        id="pain-stop-emergency-btn"
        data-testid="pain-stop-emergency-btn"
        disabled={isSubmittingPain}
        onClick={handlePainClick}
        className={`px-5 py-3 rounded-2xl font-extrabold text-xs sm:text-sm shadow-lg flex items-center gap-2.5 transition active:scale-95 cursor-pointer border ${
          isSubmittingPain
            ? 'bg-rose-900/60 border-rose-700 text-rose-200 cursor-not-allowed opacity-80'
            : 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-950/60 border-rose-400/30 animate-pulse'
        }`}
      >
        {isSubmittingPain ? (
          <>
            <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
            <span>กำลังแจ้งเจ้าหน้าที่...</span>
          </>
        ) : (
          <>
            <AlertOctagon className="w-5 h-5 shrink-0" />
            <span>🚨 รู้สึกเจ็บ (หยุดและแจ้งนักกายภาพ)</span>
          </>
        )}
      </button>
    </div>
  );
};

