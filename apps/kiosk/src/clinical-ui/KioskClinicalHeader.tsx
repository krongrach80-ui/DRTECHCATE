/**
 * apps/kiosk/src/clinical-ui/KioskClinicalHeader.tsx
 * Master Prompt v5 Section 4: Kiosk Smooth Clinical Header with Staff Portal Trigger
 */

import React, { useState } from 'react';
import {
  HeartPulse,
} from 'lucide-react';
import { StaffLoginModal } from '../../../admin/src/clinical-ui/StaffLoginModal';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

interface KioskClinicalHeaderProps {
  kioskId?: string;
  onCallStaff?: () => void;
  onStaffLoginSuccess?: () => void;
  onOpenNewPatientModal?: () => void;
  onOpenStaffLoginModal?: () => void;
  staffAssistRemainingSec?: number | null;
  onExitStaffAssistMode?: () => void;
  currentStaffUser?: any | null;
}

const formatRemainingTime = (totalSeconds: number) => {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const KioskClinicalHeader: React.FC<KioskClinicalHeaderProps> = ({
  kioskId = 'kiosk-01',
  onCallStaff,
  onStaffLoginSuccess,
  onOpenNewPatientModal,
  onOpenStaffLoginModal,
  staffAssistRemainingSec = null,
  onExitStaffAssistMode,
  currentStaffUser: _currentStaffUser = null,
}) => {
  const { lang, setLanguage } = useClinicalI18n();
  const [isStaffLoginOpen, setIsStaffLoginOpen] = useState(false);

  const handleStaffLogin = async (credentials: { username: string; password: string }) => {
    const res = await defaultApiClient.auth.login(credentials);
    if (res.user) {
      if (onStaffLoginSuccess) {
        onStaffLoginSuccess();
      } else {
        // Open admin portal in window or navigate via client-side SPA routing
        const targetPath = res.role === 'admin' ? '/admin' : '/pt';
        if (typeof window !== 'undefined') {
          window.history.pushState(null, '', targetPath);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }
    }
  };

  const handleTriggerStaffModal = () => {
    if (onOpenStaffLoginModal) {
      onOpenStaffLoginModal();
    } else {
      setIsStaffLoginOpen(true);
    }
  };

  return (
    <>
      <header className="px-4 py-2.5 bg-[#062C24] border-b border-emerald-800/60 flex items-center justify-between text-white shadow-md shrink-0 z-40 select-none font-sans">
        {/* Left Branding */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-400 flex items-center justify-center text-white shadow-md">
            <HeartPulse className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-normal text-white flex items-center gap-1.5">
              <span>Dr.Tech.Care</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-700/80 border border-emerald-500/40 text-[10px] font-bold text-emerald-100">
                AI Kiosk
              </span>
            </h1>
            <p className="text-[10px] text-emerald-300/80">
              สถานีฝึกกายภาพบำบัดอัจฉริยะ • Terminal ID: {kioskId}
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Trilingual Language Switcher (zh-CN | th-TH | en-US) */}
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-[#031E18] border border-emerald-800/60 text-xs select-none">
            <button
              type="button"
              onClick={() => setLanguage('zh-CN')}
              className={`px-2 py-0.5 rounded-md font-bold transition text-[11px] cursor-pointer ${
                lang === 'zh-CN' ? 'bg-blue-600 text-white shadow-xs' : 'text-emerald-300/80 hover:text-white'
              }`}
            >
              CN 中文
            </button>
            <button
              type="button"
              onClick={() => setLanguage('th-TH')}
              className={`px-2 py-0.5 rounded-md font-bold transition text-[11px] cursor-pointer ${
                lang === 'th-TH' ? 'bg-blue-600 text-white shadow-xs' : 'text-emerald-300/80 hover:text-white'
              }`}
            >
              TH ไทย
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en-US')}
              className={`px-2 py-0.5 rounded-md font-bold transition text-[11px] cursor-pointer ${
                lang === 'en-US' ? 'bg-blue-600 text-white shadow-xs' : 'text-emerald-300/80 hover:text-white'
              }`}
            >
              GB EN
            </button>
          </div>

          {/* Cloud Online Status */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#04241D] border border-emerald-700/60 text-xs font-bold text-emerald-300">
            <span>Cloud Online</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          {/* Staff Assisted Active Session Badge */}
          {staffAssistRemainingSec !== null ? (
            <div
              id="kiosk-staff-session-indicator"
              data-testid="kiosk-staff-session-indicator"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-teal-500/20 border border-teal-400/50 text-teal-200 text-xs font-bold animate-pulse"
            >
              <span>👨‍⚕️ โหมดเจ้าหน้าที่ ({formatRemainingTime(staffAssistRemainingSec)})</span>
              {onExitStaffAssistMode && (
                <button
                  type="button"
                  id="kiosk-exit-staff-assist-btn"
                  data-testid="kiosk-exit-staff-assist-btn"
                  onClick={onExitStaffAssistMode}
                  className="ml-1 px-2.5 py-0.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-bold transition shadow-xs cursor-pointer"
                >
                  ออกจากโหมด
                </button>
              )}
            </div>
          ) : (
            /* New Patient Registration Button (Strictly Staff Protected) */
            onOpenNewPatientModal && (
              <button
                type="button"
                id="header-open-new-patient-btn"
                data-testid="header-open-new-patient-btn"
                onClick={onOpenNewPatientModal}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer"
                title="ต้องเข้าสู่ระบบเจ้าหน้าที่ก่อนลงทะเบียนผู้ป่วยใหม่"
              >
                <span>👤+ เจ้าหน้าที่ลงทะเบียนผู้ป่วยใหม่</span>
              </button>
            )
          )}

          {/* Call Staff Button */}
          {onCallStaff && (
            <button
              type="button"
              id="header-call-staff-btn"
              onClick={onCallStaff}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-amber-400/70 bg-amber-950/40 text-amber-300 hover:bg-amber-950/60 font-bold text-xs transition active:scale-95 cursor-pointer"
            >
              <span>🔔 เรียกเจ้าหน้าที่</span>
            </button>
          )}

          {/* Hospital Staff Portal Trigger */}
          <button
            id="header-open-staff-login-btn"
            data-testid="open-staff-login-btn"
            type="button"
            onClick={handleTriggerStaffModal}
            title="เข้าสู่ระบบบุคลากร / รพ."
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-600/50 bg-[#0A3A30] hover:bg-[#0c473b] text-emerald-100 font-bold text-xs transition active:scale-95 cursor-pointer"
          >
            <span>🔑 เข้าสู่ระบบบุคลากร / รพ.</span>
          </button>
        </div>
      </header>

      {/* Staff Login Modal */}
      <StaffLoginModal
        isOpen={isStaffLoginOpen}
        onClose={() => setIsStaffLoginOpen(false)}
        onLogin={handleStaffLogin}
      />
    </>
  );
};
