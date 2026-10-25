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
} from 'lucide-react';
import { hospitalTheme } from '../../../../packages/hospital-ui-kit/src/index.js';

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
}

export const ClinicalSidebar: React.FC<ClinicalSidebarProps> = ({
  activeTab,
  onSelectTab,
  queueBadgeCount = 0,
  onLogout,
  onReturnToKiosk,
  isPtMode = false,
}) => {
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
      label: '1. หน้าต้อนรับ',
      icon: <HeartPulse className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'patients',
      label: '2. จัดการคนไข้ของตน',
      icon: <Activity className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'records',
      label: '3. ข้อมูลคนไข้/เวชระเบียน/ฝากเคส',
      icon: <ClipboardList className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'profile',
      label: '4. ข้อมูลตัวเอง',
      icon: <User className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'exercises',
      label: '5. ท่ากายภาพ',
      icon: <Dumbbell className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'schedule',
      label: '6. ตารางนัด',
      icon: <Calendar className="w-4 h-4 shrink-0" />,
      badge: queueBadgeCount > 0 ? queueBadgeCount : undefined,
    },
  ];

  const visibleMenus = isPtMode ? ptMenus : adminMenus;

  return (
    <aside
      style={{
        background: hospitalTheme.colors.sidebarGradient,
      }}
      className="w-64 h-screen flex flex-col justify-between text-slate-200 shadow-2xl select-none shrink-0 z-30 font-sans"
    >
      {/* Brand Logo Header */}
      <div>
        <div className="p-6 border-b border-emerald-900/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-emerald-950/60">
            <HeartPulse className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              <span>Dr.Tech.Care</span>
            </h1>
            <p className="text-[11px] font-medium text-emerald-300/80">
              {isPtMode ? 'นักกายภาพบำบัด (PT)' : 'แอดมิน Admin'}
            </p>
          </div>
        </div>

        {/* 7 Clinical Navigation Menu Items */}
        <nav className="p-3 space-y-1.5">
          {visibleMenus.map((menu) => {
            const isActive = activeTab === menu.id;

            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => onSelectTab(menu.id)}
                style={{
                  background: isActive ? hospitalTheme.colors.activePillGradient : 'transparent',
                  boxShadow: isActive ? hospitalTheme.colors.activePillGlow : 'none',
                  transition: hospitalTheme.animation.springTransition,
                }}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold tracking-wide text-left transition-all duration-200 ${
                  isActive
                    ? 'text-white shadow-md translate-x-1'
                    : 'text-emerald-100/75 hover:bg-emerald-900/40 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <span className={isActive ? 'text-white' : 'text-emerald-400'}>
                    {menu.icon}
                  </span>
                  <span className="truncate">{menu.label}</span>
                </div>

                {menu.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 shrink-0 shadow-sm animate-pulse">
                    {menu.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Controls */}
      <div className="p-4 border-t border-emerald-900/60 space-y-3 bg-[#03201c]/40">
        {/* Cloud DB Status Box */}
        <div className="px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/20 flex items-center justify-between text-xs">
          <span className="text-emerald-300 font-medium">ฐานข้อมูล: Cloud</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>● ปกติ</span>
          </span>
        </div>

        {/* Return to Kiosk Button */}
        {onReturnToKiosk && (
          <button
            type="button"
            onClick={onReturnToKiosk}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-900/50 hover:bg-emerald-800/80 border border-emerald-500/30 text-emerald-200 text-xs font-medium transition active:scale-95"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>← กลับหน้าตู้ Kiosk</span>
          </button>
        )}

        {/* Logout Button */}
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-rose-500/40 hover:bg-rose-500/10 text-rose-300 hover:text-rose-200 text-xs font-bold transition active:scale-95"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
};
