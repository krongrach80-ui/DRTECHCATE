/**
 * apps/admin/src/clinical-ui/StaffLoginModal.tsx
 * Master Prompt v5 Section 4.2: Hospital Staff Portal Authentication Modal
 */

import React, { useState } from 'react';
import {
  Shield,
  User,
  Lock,
  ArrowRight,
  ArrowLeft,
  X,
  Info,
  AlertTriangle,
} from 'lucide-react';
import {
  SmoothButton,
} from '../../../../packages/hospital-ui-kit/src/index.js';

interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (credentials: { username: string; password: string }) => Promise<void>;
  onReturnToKiosk?: () => void;
}

export const StaffLoginModal: React.FC<StaffLoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onReturnToKiosk,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onLogin({ username: username.trim(), password });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        style={{
          boxShadow: '0 25px 60px -15px rgba(6, 57, 50, 0.3)',
        }}
        className="w-full max-w-lg sm:max-w-xl bg-white rounded-3xl border-2 border-emerald-500/25 overflow-hidden shadow-2xl relative max-h-[92dvh] overflow-y-auto"
      >
        {/* Top Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          title="ปิดหน้าต่าง"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Branding */}
        <div className="pt-9 pb-4 px-8 sm:px-10 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-xl shadow-emerald-950/20 mb-3.5">
            <Shield className="w-8 h-8" />
          </div>

          <span className="inline-block px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-2.5">
            + Dr.Tech.Care • Hospital Staff Portal
          </span>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-normal">
            เข้าสู่ระบบบุคลากร Dr.Tech.Care
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed max-w-md mx-auto">
            เข้าถึงระบบบริหารเวชระเบียนคลินิกและตารางกายภาพบำบัด
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-8 sm:mx-10 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
            <span className="leading-relaxed font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 sm:p-10 space-y-5">
          <div>
            <label className="block text-sm sm:text-base font-semibold text-slate-700 mb-2">
              Username (ชื่อผู้ใช้) *
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                placeholder="เช่น admin หรือ pt_staff"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-13 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-base text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition shadow-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm sm:text-base font-semibold text-slate-700 mb-2">
              Password (รหัสผ่าน) *
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-13 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-base text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition shadow-sm"
              />
            </div>
          </div>

          {/* Automatic Role Detection Notice */}
          <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200/70 text-emerald-900 text-xs sm:text-sm flex items-start gap-3">
            <Info className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-relaxed">
              ระบบตรวจสอบสิทธิ์อัตโนมัติ: ผอ.รพ. / Super Admin หรือ นักกายภาพบำบัด PT
            </span>
          </div>

          {/* Primary Action Button */}
          <SmoothButton
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            loadingText="กำลังตรวจสอบสิทธิ์อย่างปลอดภัย..."
            className="w-full mt-3 h-13 text-base sm:text-lg font-bold shadow-lg shadow-emerald-900/15"
            icon={<ArrowRight className="w-5 h-5" />}
          >
            <span>เข้าสู่ระบบบุคลากร</span>
          </SmoothButton>

          {/* Secondary Action Buttons */}
          <div className="pt-2 flex flex-col gap-2.5">
            {onReturnToKiosk && (
              <button
                type="button"
                onClick={onReturnToKiosk}
                className="w-full h-12 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>← กลับหน้าหลัก (คนไข้)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 text-slate-500 hover:text-slate-800 text-sm font-semibold text-center transition cursor-pointer"
            >
              ✕ ปิดหน้าต่าง (กลับสู่หน้าหลักตู้ Kiosk)
            </button>
          </div>
        </form>

        {/* Security Footer Badge */}
        <div className="py-3.5 px-8 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500 font-medium">
          Hospital Clinical Grade Security • HttpOnly Session Cookie • Zero-PII Leak
        </div>
      </div>
    </div>
  );
};
