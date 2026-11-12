/**
 * apps/admin/src/clinical-ui/ClinicalTopHeader.tsx
 * Master Prompt v5 Section 4.1: Clean White Top Header Bar with Clinical Actions
 */

import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Zap,
  LogOut,
  ShieldCheck,
  Menu,
  Monitor,
} from 'lucide-react';
import { SmoothButton } from '../../../../packages/hospital-ui-kit/src/index.js';
import { LanguageSwitcher, useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from '../../../../packages/api-client/src/index.js';

interface ClinicalTopHeaderProps {
  title: string;
  subtitleEn: string;
  userName?: string;
  userRoleTitle?: string;
  avatarUrl?: string | null;
  onOpenNewPatientModal: () => void;
  onFastCheckIn: () => void;
  onLogout: () => void;
  onReturnToKiosk?: () => void;
  isPtMode?: boolean;
  onToggleMobileMenu?: () => void;
  isLoggingOut?: boolean;
}

export const ClinicalTopHeader: React.FC<ClinicalTopHeaderProps> = ({
  title,
  subtitleEn,
  userName = 'ผู้ใช้งานระบบ',
  userRoleTitle = 'เจ้าหน้าที่โรงพยาบาล (Hospital Staff)',
  avatarUrl = null,
  onOpenNewPatientModal,
  onFastCheckIn,
  onLogout,
  onReturnToKiosk,
  isPtMode = false,
  onToggleMobileMenu,
  isLoggingOut = false,
}) => {
  const { t } = useClinicalI18n();
  const [supabaseOnline, setSupabaseOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkSupabase = async () => {
      try {
        const res = await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/exercises?select=id&limit=1`, {
          headers: {
            apikey: DEFAULT_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${DEFAULT_SUPABASE_ANON_KEY}`,
          },
        });
        if (isMounted) setSupabaseOnline(res.ok);
      } catch {
        if (isMounted) setSupabaseOnline(false);
      }
    };

    checkSupabase();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden')) return;
      checkSupabase();
    }, 60000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="min-h-16 py-3 px-4 sm:px-6 md:px-8 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
      {/* Left Title with English Subtitle & Mobile Hamburger */}
      <div className="flex items-center gap-3 shrink-0 min-w-0">
        {onToggleMobileMenu && (
          <button
            type="button"
            id="btn-mobile-menu-toggle"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="เมนูหลัก"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-base md:text-xl font-bold text-slate-800 tracking-normal flex items-center gap-2 truncate">
            <span className="truncate">{title}</span>
          </h2>
          <p className="text-[10px] md:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate max-w-[240px] sm:max-w-none">
            {subtitleEn}
          </p>
        </div>
      </div>

      {/* Right Action Bar */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap justify-end shrink-0">
        {/* Trilingual Language Switcher (zh-CN, th-TH, en-US) */}
        <div className="shrink-0">
          <LanguageSwitcher />
        </div>

        {/* Dynamic Supabase Status Pill */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold select-none whitespace-nowrap shrink-0 transition-all ${
            supabaseOnline === true
              ? 'bg-emerald-50 border border-emerald-200/80 text-emerald-800'
              : supabaseOnline === false
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-slate-50 border border-slate-200 text-slate-600'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              supabaseOnline === true
                ? 'bg-emerald-500 animate-pulse'
                : supabaseOnline === false
                ? 'bg-rose-500'
                : 'bg-slate-400'
            }`}
          />
          <span>
            {supabaseOnline === true
              ? t('header_status_online', '● Supabase Cloud')
              : supabaseOnline === false
              ? t('header_status_offline', '○ ออฟไลน์')
              : t('header_status_checking', 'กำลังตรวจสอบ...')}
          </span>
        </div>

        {/* Primary Action Button: + ต้อนรับ & สแกนหน้า */}
        <div className="shrink-0 whitespace-nowrap">
          <SmoothButton
            variant="primary"
            size="sm"
            onClick={onOpenNewPatientModal}
            icon={<UserPlus className="w-3.5 h-3.5 shrink-0" />}
            className="whitespace-nowrap shrink-0 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <span className="whitespace-nowrap">{t('header_action_reception_enroll', '+ ต้อนรับ & สแกนหน้า')}</span>
          </SmoothButton>
        </div>

        {/* Quick Check-in Button: + เช็คอินเร่งด่วน */}
        <button
          type="button"
          onClick={onFastCheckIn}
          className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="whitespace-nowrap">{t('header_action_fast_checkin', '+ เช็คอินเร่งด่วน')}</span>
        </button>

        {/* Return to Kiosk Quick Action Button */}
        {onReturnToKiosk && (
          <button
            type="button"
            onClick={onReturnToKiosk}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold whitespace-nowrap shrink-0 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
            title={t('return_to_kiosk', 'กลับสู่หน้าตู้ Kiosk')}
          >
            <Monitor className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">{t('header_action_kiosk_mode', 'หน้า Kiosk')}</span>
          </button>
        )}

        {/* User Profile Badge */}
        <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-200 shrink-0">
          <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-emerald-500/30 shrink-0 overflow-hidden">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={userName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : isPtMode ? (
              <span>{userName?.charAt(0) || 'P'}</span>
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
          <div className="hidden lg:block text-left select-none max-w-[150px]">
            <div className="text-xs font-bold text-slate-800 truncate">
              {userName}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {userRoleTitle}
            </div>
          </div>

          {/* Logout Quick Button */}
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            title={isLoggingOut ? t('sidebar_logging_out', 'กำลังออกจากระบบ...') : t('logout', 'ออกจากระบบ')}
            className={`p-2 rounded-xl transition active:scale-95 shrink-0 ${
              isLoggingOut
                ? 'text-rose-400 bg-rose-50 cursor-not-allowed'
                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
            }`}
          >
            {isLoggingOut ? (
              <div className="w-4 h-4 border-2 border-rose-400/30 border-t-rose-600 rounded-full animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
