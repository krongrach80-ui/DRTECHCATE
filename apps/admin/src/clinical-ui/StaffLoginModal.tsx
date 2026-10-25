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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        style={{
          boxShadow: '0 20px 50px -10px rgba(6, 57, 50, 0.25)',
        }}
        className="w-full max-w-md bg-white rounded-3xl border-2 border-emerald-500/20 overflow-hidden shadow-2xl relative font-sans"
      >
        {/* Top Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          title="ปิดหน้าต่าง"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Branding */}
        <div className="pt-8 pb-4 px-8 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-emerald-950/20 mb-3">
            <Shield className="w-7 h-7" />
          </div>

          <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold uppercase tracking-wider mb-2">
            + Dr.Tech.Care • Hospital Staff Portal
          </span>

          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            เข้าสู่ระบบบุคลากร Dr.Tech.Care
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            เข้าถึงระบบบริหารเวชระเบียนคลินิกและตารางกายภาพบำบัด
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-8 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Username (ชื่อผู้ใช้) *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="เช่น admin หรือ pt_staff"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Password (รหัสผ่าน) *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition"
              />
            </div>
          </div>

          {/* Automatic Role Detection Notice */}
          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/60 text-emerald-800 text-[11px] flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-relaxed">
              ระบบตรวจสอบสิทธิ์อัตโนมัติ: Admin (7 เมนู) หรือ นักกายภาพ (5 เมนู)
            </span>
          </div>

          {/* Primary Action Button */}
          <SmoothButton
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            loadingText="กำลังตรวจสอบสิทธิ์อย่างปลอดภัย..."
            className="w-full mt-2"
            icon={<ArrowRight className="w-4 h-4" />}
          >
            <span>➔ เข้าสู่ระบบบุคลากร</span>
          </SmoothButton>

          {/* Secondary Action Buttons */}
          <div className="pt-2 flex flex-col gap-2">
            {onReturnToKiosk && (
              <button
                type="button"
                onClick={onReturnToKiosk}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>← กลับหน้าหลัก (คนไข้)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold text-center transition"
            >
              ✕ ปิดหน้าต่าง (กลับสู่หน้าหลักตู้ Kiosk)
            </button>
          </div>
        </form>

        {/* Security Footer Badge */}
        <div className="py-3 px-8 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-400">
          Hospital Clinical Grade Security • HttpOnly Session Cookie • Zero-PII Leak
        </div>
      </div>
    </div>
  );
};
