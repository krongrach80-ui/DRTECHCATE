/**
 * apps/kiosk/src/clinical-ui/KioskClinicalHeader.tsx
 * Master Prompt v5 Section 4: Kiosk Smooth Clinical Header with Staff Portal Trigger
 */

import React, { useState } from 'react';
import {
  HeartPulse,
  Shield,
  Wifi,
  PhoneCall,
} from 'lucide-react';
import { StaffLoginModal } from '../../../admin/src/clinical-ui/StaffLoginModal';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';

interface KioskClinicalHeaderProps {
  kioskId?: string;
  onCallStaff?: () => void;
  onStaffLoginSuccess?: () => void;
  onOpenNewPatientModal?: () => void;
  onOpenStaffLoginModal?: () => void;
}

export const KioskClinicalHeader: React.FC<KioskClinicalHeaderProps> = ({
  kioskId = 'kiosk-01',
  onCallStaff,
  onStaffLoginSuccess,
  onOpenNewPatientModal,
  onOpenStaffLoginModal,
}) => {
  const [isStaffLoginOpen, setIsStaffLoginOpen] = useState(false);

  const handleStaffLogin = async (credentials: { username: string; password: string }) => {
    const res = await defaultApiClient.auth.login(credentials);
    if (res.user) {
      if (onStaffLoginSuccess) {
        onStaffLoginSuccess();
      } else {
        // Open admin portal in window or navigate
        window.location.href = res.role === 'admin' ? '/admin' : '/pt';
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
      <header className="h-16 px-6 bg-[#042924] border-b border-emerald-900/40 flex items-center justify-between text-white shadow-md shrink-0 z-40 select-none font-sans">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-400 flex items-center justify-center text-white shadow-md">
            <HeartPulse className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-normal text-white flex items-center gap-1.5">
              <span>Dr.Tech.Care</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-bold text-emerald-300">
                AI Kiosk
              </span>
            </h1>
            <p className="text-[10px] text-emerald-300/70">
              สถานีฝึกกายภาพบำบัดอัจฉริยะ • Terminal ID: {kioskId}
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          {/* Cloud Online Status */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cloud Online ●</span>
          </div>

          {/* New Patient Registration Button */}
          {onOpenNewPatientModal && (
            <button
              type="button"
              onClick={onOpenNewPatientModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-md shadow-emerald-950/30 transition active:scale-95 cursor-pointer"
            >
              <span>+ ลงทะเบียนคนไข้ใหม่</span>
            </button>
          )}

          {/* Call Staff Emergency Button */}
          {onCallStaff && (
            <button
              type="button"
              onClick={onCallStaff}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>เรียกเจ้าหน้าที่</span>
            </button>
          )}

          {/* Hospital Staff Portal Trigger */}
          <button
            id="header-open-staff-login-btn"
            data-testid="header-open-staff-login-btn"
            type="button"
            onClick={handleTriggerStaffModal}
            title="เข้าสู่ระบบบุคลากร / รพ."
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#063932] hover:bg-[#084c43] border border-emerald-500/40 text-emerald-100 text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>🛡️ เข้าสู่ระบบบุคลากร / รพ.</span>
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
