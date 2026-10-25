/**
 * apps/kiosk/src/views/AskAccountView.tsx
 * Option Selection View with Single-Hand Edge-Zone Gesture Tracker (Spec 13.2)
 *
 * Invariants:
 * 1. Single-hand operation: Never require or force two hands (shoulder/arm injury safe).
 * 2. OneEuroFilter2D tremor suppression: Cancels jitter and resting tremor.
 * 3. 1,000ms edge-zone dwell: Left zone (x < 0.25) -> No Account, Right zone (x > 0.75) -> Has Account.
 * 4. Touch fallback: Direct touch/click is always active and triggers immediately.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserCheck, UserPlus, Ticket, ArrowRight, ShieldCheck, Hand, Sparkles } from 'lucide-react';
import { getFaceClientServices } from '../services/faceClientService';
import { KioskInputEvent } from '../../../../packages/kiosk-input/src/index.js';

interface AskAccountViewProps {
  onHasAccount: () => void;
  onNoAccount: (ticketId?: string) => void;
  onCallStaff: () => void;
}

export const AskAccountView: React.FC<AskAccountViewProps> = ({
  onHasAccount,
  onNoAccount,
  onCallStaff,
}) => {
  const [ticketInput, setTicketInput] = useState<string>('');
  const [showTicketInput, setShowTicketInput] = useState<boolean>(false);
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0); // 0.0 to 1.0

  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredRef = useRef<boolean>(false);

  const handleHasAccount = useCallback(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    onHasAccount();
  }, [onHasAccount]);

  const handleNoAccount = useCallback(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    onNoAccount();
  }, [onNoAccount]);

  useEffect(() => {
    const services = getFaceClientServices();
    const { inputManager } = services;
    inputManager.setIdleMode(false);

    const unsubscribe = inputManager.subscribe((event: KioskInputEvent) => {
      if (hasTriggeredRef.current) return;

      if (event.type === 'ZONE_HOVER_START') {
        setHoverZone(event.zone);
        setHoverProgress(0);
      } else if (event.type === 'ZONE_HOVER_PROGRESS') {
        setHoverZone(event.zone);
        setHoverProgress(event.progress);
      } else if (event.type === 'ZONE_HOVER_EXIT') {
        setHoverZone(null);
        setHoverProgress(0);
      } else if (event.type === 'ZONE_SELECTED') {
        setHoverProgress(1.0);
        if (event.zone === 'right') {
          handleHasAccount();
        } else if (event.zone === 'left') {
          handleNoAccount();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [handleHasAccount, handleNoAccount]);

  // Handle pointer / mouse movement to feed One Euro Filter & Hand Tracker
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (hasTriggeredRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const normalizedPoint = {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      };
      const services = getFaceClientServices();
      services.inputManager.processHandLandmarks(normalizedPoint, performance.now());
    }
  };

  const handlePointerLeave = () => {
    const services = getFaceClientServices();
    services.inputManager.processHandLandmarks(null, performance.now());
    setHoverZone(null);
    setHoverProgress(0);
  };

  const handleTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticketInput.trim()) {
      hasTriggeredRef.current = true;
      onNoAccount(ticketInput.trim());
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative w-full h-full flex flex-col items-center justify-between py-10 px-8 select-none bg-slate-950 overflow-hidden"
    >
      {/* Left Edge Zone Hover Overlay (Dwell Indicator for No Account) */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-24 pointer-events-none transition-all duration-300 flex items-center justify-center ${
          hoverZone === 'left' ? 'bg-indigo-600/20 border-r-4 border-indigo-400' : 'opacity-0'
        }`}
      >
        {hoverZone === 'left' && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-400 flex items-center justify-center relative">
              <svg className="w-12 h-12 -rotate-90 absolute inset-0" viewBox="0 0 48 48">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="4"
                  strokeDasharray="126"
                  strokeDashoffset={126 - 126 * hoverProgress}
                  strokeLinecap="round"
                />
              </svg>
              <Hand className="w-5 h-5 text-indigo-300 animate-pulse" />
            </div>
            <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider">
              {Math.round(hoverProgress * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Right Edge Zone Hover Overlay (Dwell Indicator for Has Account) */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-24 pointer-events-none transition-all duration-300 flex items-center justify-center ${
          hoverZone === 'right' ? 'bg-blue-600/20 border-l-4 border-blue-400' : 'opacity-0'
        }`}
      >
        {hoverZone === 'right' && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full border-4 border-blue-400 flex items-center justify-center relative">
              <svg className="w-12 h-12 -rotate-90 absolute inset-0" viewBox="0 0 48 48">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="4"
                  strokeDasharray="126"
                  strokeDashoffset={126 - 126 * hoverProgress}
                  strokeLinecap="round"
                />
              </svg>
              <Hand className="w-5 h-5 text-blue-300 animate-pulse" />
            </div>
            <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">
              {Math.round(hoverProgress * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="text-center max-w-xl z-10">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>ขั้นตอนที่ 1 / 3 • สัมผัสจอหรือชี้มือที่ขอบจอเพื่อเลือก</span>
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
          กรุณาเลือกสถานะการนัดหมายของท่าน
        </h2>
        <p className="text-base text-slate-400 mt-2">
          แตะปุ่มบนจอ หรือชี้มือข้างเดียวค้างที่โซนขอบจอ 1 วินาทีเพื่อเลือก (รองรับการใช้งานมือเดียว)
        </p>
      </div>

      {/* Giant Touch Buttons with Edge Zone Alignment */}
      <div className="w-full max-w-2xl flex flex-col gap-6 my-auto z-10">
        {/* Choice 1: Has Account (Right Zone) */}
        <button
          onClick={handleHasAccount}
          className={`touch-btn w-full p-8 rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 hover:from-blue-600 hover:to-indigo-500 text-white flex items-center justify-between shadow-2xl transition-all border ${
            hoverZone === 'right'
              ? 'border-cyan-300 ring-4 ring-cyan-400/50 scale-[1.02]'
              : 'border-blue-400/30'
          } shadow-blue-600/30 group`}
        >
          <div className="flex items-center gap-6 text-left">
            <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
              <UserCheck className="w-10 h-10 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-white">
                  มีประวัติแล้ว / มีนัดวันนี้
                </span>
                {hoverZone === 'right' && (
                  <span className="text-xs bg-cyan-400 text-slate-950 font-bold px-2 py-0.5 rounded-full">
                    ชี้ค้าง {Math.round(hoverProgress * 100)}%
                  </span>
                )}
              </div>
              <p className="text-base text-blue-100/90 mt-1">
                สแกนใบหน้าเพื่อเข้าสู่คอร์สกายภาพบำบัดประจำวัน (ชี้ขอบจอขวา)
              </p>
            </div>
          </div>
          <ArrowRight className="w-8 h-8 text-white/80 group-hover:translate-x-2 transition" />
        </button>

        {/* Choice 2: No Account / First Time (Left Zone) */}
        <button
          onClick={() => {
            if (!showTicketInput) {
              handleNoAccount();
            }
          }}
          className={`touch-btn w-full p-8 rounded-3xl bg-slate-900 hover:bg-slate-800 text-slate-200 flex items-center justify-between border-2 transition-all shadow-xl ${
            hoverZone === 'left'
              ? 'border-indigo-400 ring-4 ring-indigo-400/50 scale-[1.02]'
              : 'border-slate-800'
          } group`}
        >
          <div className="flex items-center gap-6 text-left">
            <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
              <UserPlus className="w-10 h-10 text-slate-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-white">
                  มาครั้งแรก / ยังไม่มีประวัติ
                </span>
                {hoverZone === 'left' && (
                  <span className="text-xs bg-indigo-400 text-slate-950 font-bold px-2 py-0.5 rounded-full">
                    ชี้ค้าง {Math.round(hoverProgress * 100)}%
                  </span>
                )}
              </div>
              <p className="text-base text-slate-400 mt-1">
                ติดต่อเจ้าหน้าที่เคาน์เตอร์ต้อนรับ หรือลงทะเบียนด้วยบัตรคิว (ชี้ขอบจอซ้าย)
              </p>
            </div>
          </div>
          <ArrowRight className="w-8 h-8 text-slate-500 group-hover:translate-x-2 transition" />
        </button>
      </div>

      {/* Bottom options: Ticket code fallback and Staff Help */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800/80 z-10">
        {!showTicketInput ? (
          <button
            onClick={() => setShowTicketInput(true)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition"
          >
            <Ticket className="w-4 h-4 text-blue-400" />
            <span>มีรหัสบัตรคิวลงทะเบียนจากเคาน์เตอร์? (10-min Ticket)</span>
          </button>
        ) : (
          <form onSubmit={handleTicketSubmit} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={ticketInput}
              onChange={(e) => setTicketInput(e.target.value)}
              placeholder="กรอกรหัสบัตรคิว 10 นาที..."
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"
            >
              ใช้บัตรคิว
            </button>
          </form>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>รองรับสัมผัสจอ & ท่าทางมือเดียว</span>
          </div>
          <button
            onClick={onCallStaff}
            className="text-xs font-medium text-rose-400 hover:text-rose-300 underline"
          >
            ขอความช่วยเหลือจากเจ้าหน้าที่
          </button>
        </div>
      </div>
    </div>
  );
};
