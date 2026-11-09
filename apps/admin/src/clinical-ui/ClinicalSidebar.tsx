/**
 * apps/admin/src/clinical-ui/ClinicalSidebar.tsx
 * Master Prompt v5 Section 4.1: Deep Forest Medical Teal Sidebar with 7 Clinical Menus
 */

import React from 'react';
import {
  Users,
  Activity,
  Calendar,
  UserCheck,
  Gamepad2,
  ShieldAlert,
  LogOut,
  Monitor,
  HeartPulse,
  ClipboardList,
  Dumbbell,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { hospitalTheme } from '../../../../packages/hospital-ui-kit/src/index.js';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

export type ClinicalMenuId =
  | 'users'
  | 'patients'
  | 'pts'
  | 'library'
  | 'schedule'
  | 'audit'
  | 'reception'
  | 'records'
  | 'exercises'
  | 'profile'
  | 'minigames'
  | 'settings';

interface ClinicalSidebarProps {
  activeTab: ClinicalMenuId;
  onSelectTab: (tab: ClinicalMenuId) => void;
  queueBadgeCount?: number;
  onLogout: () => void;
  onReturnToKiosk?: () => void;
  isPtMode?: boolean;
  isLoggingOut?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenMinigames?: () => void;
}

export const ClinicalSidebar: React.FC<ClinicalSidebarProps> = ({
  activeTab,
  onSelectTab,
  queueBadgeCount = 0,
  onLogout,
  onReturnToKiosk,
  isPtMode = false,
  isLoggingOut = false,
  isCollapsed = false,
  onToggleCollapse,
  onOpenMinigames,
}) => {
  const { t } = useClinicalI18n();

  // Master Prompt v3 Spec 8.1: Admin 6 Main Windows
  const adminMenus: Array<{ id: ClinicalMenuId; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: 'users',
      label: '1. จัดการผู้ใช้ staff',
      icon: <Users className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'patients',
      label: '2. ข้อมูลคนไข้',
      icon: <Activity className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'pts',
      label: '3. ข้อมูลนักกายภาพ',
      icon: <UserCheck className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'library',
      label: '4. ท่ากายภาพและมินิเกม/modpack',
      icon: <Gamepad2 className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'schedule',
      label: '5. ตารางนัด',
      icon: <Calendar className="w-4 h-4 shrink-0" />,
      badge: queueBadgeCount > 0 ? queueBadgeCount : undefined,
    },
    {
      id: 'audit',
      label: '6. ประวัติและความปลอดภัย',
      icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
    },
  ];

  // Master Prompt v3 Spec 8.2: PT 5 Windows + Welcome View
  // Strictly isolated: PT CANNOT view/edit other PTs' profiles (pts tab excluded)
  const ptMenus: Array<{ id: ClinicalMenuId; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: 'reception',
      label: t('menu_reception', '1. หน้าต้อนรับ'),
      icon: <HeartPulse className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'patients',
      label: t('menu_my_patients', '2. จัดการคนไข้ของตน'),
      icon: <Activity className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'records',
      label: t('menu_records', '3. ข้อมูลคนไข้/เวชระเบียน/ฝากเคส'),
      icon: <ClipboardList className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'profile',
      label: t('menu_profile', '4. ข้อมูลตัวเอง'),
      icon: <User className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'exercises',
      label: t('menu_exercises', '5. ท่ากายภาพ'),
      icon: <Dumbbell className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'schedule',
      label: t('menu_schedule', '6. ตารางนัด'),
      icon: <Calendar className="w-4 h-4 shrink-0" />,
      badge: queueBadgeCount > 0 ? queueBadgeCount : undefined,
    },
  ];

  const visibleMenus = isPtMode ? ptMenus : adminMenus;

  return (
    <aside
      style={{
        background: 'linear-gradient(180deg, #0A2540 0%, #0D3150 50%, #0A2E36 100%)',
      }}
      className={`${
        isCollapsed ? 'w-20' : 'w-72'
      } h-screen flex flex-col justify-between text-slate-100 shadow-2xl select-none shrink-0 z-30 font-sans border-r border-blue-900/30 transition-all duration-300`}
    >
      {/* Brand Logo Header */}
      <div>
        <div className={`p-4 border-b border-blue-900/40 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} bg-black/15`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-950/60 shrink-0">
              <HeartPulse className="w-5 h-5 animate-pulse" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <h1 className="text-base font-bold tracking-normal text-white flex items-center gap-1.5 truncate">
                  <span>Dr.Tech.Care</span>
                </h1>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{isPtMode ? t('pt_role_badge', 'นักกายภาพ (PT)') : t('admin_role_badge', 'ผู้อำนวยการ (Admin)')}</span>
                </div>
              </div>
            )}
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer shrink-0 ${isCollapsed ? 'mt-2' : ''}`}
              title={isCollapsed ? 'ขยายแถบเมนู (Expand Sidebar)' : 'ย่อแถบเมนู (Collapse Sidebar)'}
            >
              {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Clinical Navigation Menu Items */}
        <nav className={`p-2.5 ${isCollapsed ? 'space-y-3' : 'space-y-1.5'}`}>
          {visibleMenus.map((menu) => {
            const isActive = activeTab === menu.id;

            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => onSelectTab(menu.id)}
                title={isCollapsed ? menu.label : undefined}
                style={{
                  transition: hospitalTheme.animation.springTransition,
                }}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3.5'} py-2.5 rounded-2xl text-[13px] font-semibold tracking-wide text-left transition-all duration-200 cursor-pointer relative overflow-hidden ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-semibold shadow-md shadow-emerald-950/30 border border-white/20 translate-x-0.5'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                {/* Active White Left Indicator Bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-r-full shadow-sm" />
                )}

                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} min-w-0`}>
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-white/25 text-white shadow-inner'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {menu.icon}
                  </div>
                  {!isCollapsed && (
                    <span className={`tracking-normal truncate whitespace-nowrap ${isActive ? 'text-white font-bold' : 'text-slate-200 font-medium'}`}>
                      {menu.label}
                    </span>
                  )}
                </div>

                {!isCollapsed && menu.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 shrink-0 shadow-sm animate-pulse ml-2 whitespace-nowrap">
                    {menu.badge}
                  </span>
                )}
                {isCollapsed && menu.badge !== undefined && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-900 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Controls */}
      <div className={`p-3 border-t border-blue-900/40 space-y-2 bg-[#0A2540]/60 backdrop-blur-md ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
        {/* Docked Physical Cards Minigame Button */}
        {onOpenMinigames && (
          <button
            type="button"
            id="sidebar-docked-minigame-btn"
            onClick={onOpenMinigames}
            title="เปิดแบบฝึกหัดการ์ดกายภาพ (10 ข้อ/รอบ)"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-center gap-2 py-2 px-3'} rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 border border-white/20 text-white font-bold text-xs shadow-md transition active:scale-95 cursor-pointer whitespace-nowrap`}
          >
            <span className="text-sm">🎮</span>
            {!isCollapsed && <span>การ์ดกายภาพ (10 ข้อ)</span>}
          </button>
        )}

        {/* Cloud DB Status Box */}
        <div className={`w-full px-2.5 py-2 rounded-xl bg-blue-950/40 border border-blue-400/20 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} text-xs shadow-sm`}>
          {!isCollapsed && (
            <span className="text-slate-300 font-medium flex items-center gap-1.5 whitespace-nowrap">
              <span>ฐานข้อมูล: Cloud</span>
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold font-mono whitespace-nowrap" title="Cloud DB: ปกติ">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            {!isCollapsed && <span>● ปกติ</span>}
          </span>
        </div>

        {/* Return to Kiosk Button */}
        {onReturnToKiosk && (
          <button
            type="button"
            onClick={onReturnToKiosk}
            title="กลับหน้าตู้ Kiosk"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-center gap-2 py-2 px-3'} rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-200 hover:text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap`}
          >
            <Monitor className="w-4 h-4 text-emerald-300 shrink-0" />
            {!isCollapsed && <span>← {t('return_to_kiosk', 'หน้าตู้ Kiosk')}</span>}
          </button>
        )}

        {/* Logout Button */}
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          title={t('logout', 'ออกจากระบบ')}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-center gap-2 py-2 px-3'} rounded-xl border text-xs font-bold shadow-sm transition active:scale-95 whitespace-nowrap ${
            isLoggingOut
              ? 'bg-rose-500/10 border-rose-400/20 text-rose-300/50 cursor-not-allowed'
              : 'bg-white/5 hover:bg-rose-500/20 border-rose-400/30 text-rose-200 hover:text-white cursor-pointer'
          }`}
        >
          {isLoggingOut ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-rose-300/30 border-t-rose-300 rounded-full animate-spin shrink-0" />
              {!isCollapsed && <span>กำลังออก...</span>}
            </>
          ) : (
            <>
              <LogOut className="w-4 h-4 text-rose-300 shrink-0" />
              {!isCollapsed && <span>{t('logout', 'ออกจากระบบ')}</span>}
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
