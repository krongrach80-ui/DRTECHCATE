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
        background: 'linear-gradient(180deg, #0A2540 0%, #0D3150 50%, #0A2E36 100%)',
      }}
      className="w-72 h-screen flex flex-col justify-between text-slate-100 shadow-2xl select-none shrink-0 z-30 font-sans border-r border-blue-900/30"
    >
      {/* Brand Logo Header */}
      <div>
        <div className="p-5 border-b border-blue-900/40 flex items-center gap-3.5 bg-black/15">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-950/60 shrink-0">
            <HeartPulse className="w-6 h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-normal text-white flex items-center gap-1.5 truncate">
              <span>Dr.Tech.Care</span>
            </h1>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isPtMode ? 'นักกายภาพบำบัด (PT)' : 'ผู้อำนวยการ (Admin)'}</span>
            </div>
          </div>
        </div>

        {/* Clinical Navigation Menu Items */}
        <nav className="p-3.5 space-y-2">
          {visibleMenus.map((menu) => {
            const isActive = activeTab === menu.id;

            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => onSelectTab(menu.id)}
                style={{
                  transition: hospitalTheme.animation.springTransition,
                }}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-[13.5px] font-semibold tracking-wide text-left transition-all duration-200 cursor-pointer relative overflow-hidden ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-semibold shadow-md shadow-emerald-950/30 border border-white/20 translate-x-1'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                {/* Active White Left Indicator Bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-r-full shadow-sm" />
                )}

                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-white/25 text-white shadow-inner'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {menu.icon}
                  </div>
                  <span className={`tracking-normal truncate ${isActive ? 'text-white font-bold' : 'text-slate-200 font-medium'}`}>
                    {menu.label}
                  </span>
                </div>

                {menu.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 shrink-0 shadow-sm animate-pulse ml-2">
                    {menu.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Controls */}
      <div className="p-4 border-t border-blue-900/40 space-y-2.5 bg-[#0A2540]/60 backdrop-blur-md">
        {/* Cloud DB Status Box */}
        <div className="px-3.5 py-2.5 rounded-xl bg-blue-950/40 border border-blue-400/20 flex items-center justify-between text-xs shadow-sm">
          <span className="text-slate-300 font-medium flex items-center gap-1.5">
            <span>ฐานข้อมูล: Cloud</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>● ปกติ</span>
          </span>
        </div>

        {/* Return to Kiosk Button */}
        {onReturnToKiosk && (
          <button
            type="button"
            onClick={onReturnToKiosk}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-200 hover:text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Monitor className="w-4 h-4 text-emerald-300" />
            <span>← กลับหน้าตู้ Kiosk</span>
          </button>
        )}

        {/* Logout Button: Clean outlined surface instead of muddy brown */}
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-rose-500/20 border border-rose-400/30 text-rose-200 hover:text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-rose-300" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
};
