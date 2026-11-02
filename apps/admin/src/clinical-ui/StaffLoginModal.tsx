/**
 * apps/admin/src/clinical-ui/StaffLoginModal.tsx
 * Master Prompt v5 Section 4.2: Hospital Staff Portal Authentication Modal
 * 
 * Clinical Security & UX Invariants:
 * - Trilingual support: TH (ไทย), EN (English), CN (中文)
 * - Single intuitive exit: "กลับหน้าหลัก (คนไข้)" / "Back to Main (Patient)" / "返回首页 (患者)"
 * - No "ปิดหน้าต่าง" buttons
 * - Backdrop click & Escape key dismiss back to Kiosk
 * - Production Safe: Dev test shortcuts hidden in production environments
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  User,
  Lock,
  ArrowRight,
  ArrowLeft,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useClinicalI18n, LanguageSwitcher } from '../../../../packages/clinical-i18n/src/index';

interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (credentials: { username: string; password: string }) => Promise<void>;
  onReturnToKiosk?: () => void;
}

const MODAL_I18N = {
  'th-TH': {
    badge: '+ Dr.Tech.Care • Hospital Staff Portal',
    title: 'เข้าสู่ระบบบุคลากร Dr.Tech.Care',
    subtitle: 'เข้าถึงระบบบริหารเวชระเบียนคลินิกและตารางกายภาพบำบัด',
    usernameLabel: 'Username (ชื่อผู้ใช้) *',
    usernamePlaceholder: 'เช่น director หรือ pt_somchai',
    passwordLabel: 'Password (รหัสผ่าน) *',
    passwordPlaceholder: '••••••••••••',
    roleNotice: 'ระบบตรวจสอบสิทธิ์อัตโนมัติ: ผอ.รพ. / Super Admin หรือ นักกายภาพบำบัด PT',
    devShortcuts: 'ทางลัดกรอกข้อมูลทดสอบ (Dev Only):',
    devDirector: '⚡ บัญชี ผอ. (director)',
    devPt: '⚡ บัญชี นักกายภาพ (pt_somchai)',
    loggingIn: 'กำลังเข้าสู่ระบบ...',
    loginBtn: 'เข้าสู่ระบบบุคลากร',
    returnToPatientMain: 'กลับหน้าหลัก (คนไข้)',
    securityNotice: 'Hospital Clinical Grade Security • HttpOnly Session Cookie • Zero-PII Leak',
    requiredFields: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน',
    invalidCreds: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  },
  'en-US': {
    badge: '+ Dr.Tech.Care • Hospital Staff Portal',
    title: 'Dr.Tech.Care Hospital Staff Login',
    subtitle: 'Access clinical medical records and physical therapy schedule management',
    usernameLabel: 'Username *',
    usernamePlaceholder: 'e.g. director or pt_somchai',
    passwordLabel: 'Password *',
    passwordPlaceholder: '••••••••••••',
    roleNotice: 'Automatic Role Detection: Hospital Director / Super Admin or PT Specialist',
    devShortcuts: 'Dev Test Shortcuts (Dev Only):',
    devDirector: '⚡ Director (director)',
    devPt: '⚡ PT (pt_somchai)',
    loggingIn: 'Logging in...',
    loginBtn: 'Sign In to Staff Portal',
    returnToPatientMain: 'Back to Main (Patient)',
    securityNotice: 'Hospital Clinical Grade Security • HttpOnly Session Cookie • Zero-PII Leak',
    requiredFields: 'Please fill in both username and password',
    invalidCreds: 'Invalid username or password',
  },
  'zh-CN': {
    badge: '+ Dr.Tech.Care • Hospital Staff Portal',
    title: 'Dr.Tech.Care 医院员工登录',
    subtitle: '访问临床病历管理系统与物理康复治疗日程',
    usernameLabel: '用户名 (Username) *',
    usernamePlaceholder: '例如 director 或 pt_somchai',
    passwordLabel: '密码 (Password) *',
    passwordPlaceholder: '••••••••••••',
    roleNotice: '自动权限校验：医院院长 / 超级管理员 或 物理康复理疗师 PT',
    devShortcuts: '测试快捷填充 (仅开发环境):',
    devDirector: '⚡ 院长账号 (director)',
    devPt: '⚡ 理疗师账号 (pt_somchai)',
    loggingIn: '正在登录...',
    loginBtn: '登录医护系统',
    returnToPatientMain: '返回首页 (患者)',
    securityNotice: 'Hospital Clinical Grade Security • HttpOnly Session Cookie • Zero-PII Leak',
    requiredFields: '请填写完整的用户名和密码',
    invalidCreds: '用户名或密码错误',
  },
};

export const StaffLoginModal: React.FC<StaffLoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onReturnToKiosk,
}) => {
  const { lang } = useClinicalI18n();
  const text = MODAL_I18N[lang] || MODAL_I18N['th-TH'];

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Determine if running in local development mode
  const isDev = Boolean(
    (import.meta as any)?.env?.DEV ||
      (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname.includes('.local')))
  );

  // Unified return to patient main / Kiosk handler
  const handleReturn = useCallback(() => {
    if (onReturnToKiosk) {
      onReturnToKiosk();
    }
    if (onClose) {
      onClose();
    }
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      // If modal is opened on standalone /admin or /pt portal page, navigate to root Kiosk URL
      if (p.startsWith('/admin') || p.startsWith('/pt')) {
        window.location.href = '/';
      }
    }
  }, [onReturnToKiosk, onClose]);

  // Escape key listener for keyboard accessibility
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleReturn();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleReturn]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg(text.requiredFields);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onLogin({ username: username.trim(), password });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : text.invalidCreds);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        // Backdrop click to return to Kiosk
        if (e.target === e.currentTarget) {
          handleReturn();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        style={{
          boxShadow: '0 25px 60px -15px rgba(6, 57, 50, 0.3)',
        }}
        className="w-full max-w-lg sm:max-w-xl bg-white rounded-3xl border-2 border-emerald-500/25 overflow-hidden shadow-2xl relative max-h-[92dvh] overflow-y-auto"
      >
        {/* Top Header Row with Language Switcher */}
        <div className="absolute top-5 right-5 z-10 flex items-center gap-2">
          <LanguageSwitcher />
        </div>

        {/* Header Branding */}
        <div className="pt-9 pb-4 px-8 sm:px-10 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-xl shadow-emerald-950/20 mb-3.5">
            <Shield className="w-8 h-8" />
          </div>

          <span className="inline-block px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-2.5">
            {text.badge}
          </span>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-normal">
            {text.title}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed max-w-md mx-auto">
            {text.subtitle}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            id="staff-login-error"
            data-testid="staff-login-error"
            className="mx-8 sm:mx-10 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2.5 animate-in fade-in"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
            <span className="leading-relaxed font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 sm:p-10 space-y-5">
          <div>
            <label
              htmlFor="staff-login-username"
              className="block text-sm sm:text-base font-semibold text-slate-700 mb-2"
            >
              {text.usernameLabel}
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10 flex items-center justify-center w-5 h-5">
                <User className="w-5 h-5" />
              </div>
              <input
                id="staff-login-username"
                data-testid="staff-login-username"
                name="username"
                type="text"
                required
                autoComplete="username"
                placeholder={text.usernamePlaceholder}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ paddingLeft: '2.75rem', paddingRight: '1rem' }}
                className="w-full h-13 pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-base text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition shadow-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="staff-login-password"
              className="block text-sm sm:text-base font-semibold text-slate-700 mb-2"
            >
              {text.passwordLabel}
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10 flex items-center justify-center w-5 h-5">
                <Lock className="w-5 h-5" />
              </div>
              <input
                id="staff-login-password"
                data-testid="staff-login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder={text.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.75rem', paddingRight: '1rem' }}
                className="w-full h-13 pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-base text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition shadow-sm"
              />
            </div>
          </div>

          {/* Automatic Role Detection Notice */}
          <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200/70 text-emerald-900 text-xs sm:text-sm flex flex-col gap-2.5">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-relaxed">
                {text.roleNotice}
              </span>
            </div>

            {/* Test shortcuts: Only displayed in local dev mode for security */}
            {isDev && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-200/60">
                <span className="text-xs font-semibold text-emerald-800">{text.devShortcuts}</span>
                <button
                  type="button"
                  onClick={() => {
                    setUsername('director');
                    setPassword('Admin12345678!');
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-emerald-200/70 hover:bg-emerald-200 text-emerald-900 font-bold transition active:scale-95 cursor-pointer"
                >
                  {text.devDirector}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUsername('pt_somchai');
                    setPassword('CorrectPassword123!');
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-emerald-200/70 hover:bg-emerald-200 text-emerald-900 font-bold transition active:scale-95 cursor-pointer"
                >
                  {text.devPt}
                </button>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            id="staff-login-submit-btn"
            data-testid="staff-login-submit-btn"
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 h-13 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-base sm:text-lg shadow-lg shadow-emerald-950/20 transition flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white shrink-0" />
                <span>{text.loggingIn}</span>
              </>
            ) : (
              <>
                <ArrowRight className="w-5 h-5 shrink-0" />
                <span>{text.loginBtn}</span>
              </>
            )}
          </button>

          {/* Sole Return Action Button */}
          <div className="pt-2">
            <button
              id="staff-login-return-kiosk-btn"
              data-testid="staff-login-return-kiosk-btn"
              type="button"
              onClick={handleReturn}
              className="w-full h-12 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>{text.returnToPatientMain}</span>
            </button>
          </div>
        </form>

        {/* Security Footer Badge */}
        <div className="py-3.5 px-8 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500 font-medium">
          {text.securityNotice}
        </div>
      </div>
    </div>
  );
};
