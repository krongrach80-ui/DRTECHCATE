/**
 * apps/pt/src/auth/AuthGuard.tsx
 *
 * STRICT CLINICAL AUTH & INACTIVITY GUARD
 * Protects Physical Therapy Routes & Patient PHI Data:
 * - Prevents unauthorized Kiosk access to patient charts
 * - Zero-Flicker Declarative Fallback (No window.location.href hard reload)
 * - Clinical Inactivity Lock Screen with quick Re-Authentication
 */

import React from 'react';
import { usePTState, spaNavigate } from './PTStateProvider';
import { StaffLoginModal } from '../../../admin/src/clinical-ui/StaffLoginModal';
import { Lock } from 'lucide-react';

export interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const {
    currentUser,
    isLoading,
    isLockedDueToInactivity,
    login,
    unlock,
  } = usePTState();

  // 1. Loading Splash Screen (Hospital Mint-White Theme)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F0FDF9] via-[#FFFFFF] to-[#EFF6FF] flex flex-col items-center justify-center text-[#063932]">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-emerald-900 tracking-wide">
          กำลังเข้าสู่ระบบนักกายภาพบำบัด DrTech.Care...
        </p>
      </div>
    );
  }

  // 2. Inactivity Lock Screen for Clinical Privacy
  if (isLockedDueToInactivity && currentUser) {
    return (
      <div className="min-h-screen bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-bold text-slate-800 mb-1">
            ระบบล็อกอัตโนมัติเพื่อความปลอดภัย
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            ไม่มีการใช้งานเกิน 15 นาทีตามมาตรฐานความปลอดภัยข้อมูลผู้ป่วย (HIPAA/GDPR)
          </p>

          <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0">
              {currentUser.full_name?.charAt(0) || 'PT'}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {currentUser.full_name}
              </div>
              <div className="text-xs text-emerald-700 font-medium">
                @{currentUser.username} • นักกายภาพบำบัด
              </div>
            </div>
          </div>

          <StaffLoginModal
            isOpen={true}
            onClose={() => spaNavigate('/')}
            onLogin={async (creds) => {
              await unlock(creds);
            }}
            onReturnToKiosk={() => spaNavigate('/')}
          />
        </div>
      </div>
    );
  }

  // 3. Unauthenticated Staff Login Modal
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F0FDF9] via-[#FFFFFF] to-[#EFF6FF] flex items-center justify-center p-4">
        <StaffLoginModal
          isOpen={true}
          onClose={() => spaNavigate('/')}
          onLogin={login}
          onReturnToKiosk={() => spaNavigate('/')}
        />
      </div>
    );
  }

  // 4. Authenticated Presentation
  return <>{children}</>;
};
