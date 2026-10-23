import React from 'react';
import {
  Users,
  UserCheck,
  Activity,
  Calendar,
  ShieldAlert,
  LogOut,
  Bell,
  Radio,
  Dumbbell
} from 'lucide-react';
import { AdminViewTab } from '../types';
import { UserProfile } from '../../../../packages/api-client/src/index.js';

interface SidebarProps {
  currentTab: AdminViewTab;
  onSelectTab: (tab: AdminViewTab) => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
  pendingStaffCallsCount: number;
  sseConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onLogout,
  pendingStaffCallsCount,
  sseConnected,
}) => {
  const navItems: Array<{ id: AdminViewTab; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: 'staff',
      label: 'จัดการเจ้าหน้าที่',
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: 'patients',
      label: 'ทะเบียนคนไข้',
      icon: <Activity className="w-5 h-5" />,
    },
    {
      id: 'pts',
      label: 'รายชื่อนักกายภาพ',
      icon: <UserCheck className="w-5 h-5" />,
    },
    {
      id: 'library',
      label: 'คลังท่าและมินิเกม',
      icon: <Dumbbell className="w-5 h-5" />,
    },
    {
      id: 'schedule',
      label: 'จัดการตารางนัด',
      icon: <Calendar className="w-5 h-5" />,
    },
    {
      id: 'security',
      label: 'ประวัติและความปลอดภัย',
      icon: <ShieldAlert className="w-5 h-5" />,
      badge: pendingStaffCallsCount > 0 ? pendingStaffCallsCount : undefined,
    },
  ];

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-screen text-slate-200 select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-lg border border-teal-500/30">
              DT
            </div>
            <div>
              <h1 className="font-bold text-base tracking-wide text-white">DrTech.Care</h1>
              <p className="text-xs text-teal-400 font-medium">ผอ.รพ. (Admin Portal)</p>
            </div>
          </div>
        </div>

        {/* Live SSE Pulse */}
        <div
          title={sseConnected ? 'ระบบเชื่อมต่อสตรีมข้อมูลสด (SSE Active)' : 'ขาดการเชื่อมต่อสตรีม'}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
            sseConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
        >
          <Radio className={`w-3 h-3 ${sseConnected ? 'animate-pulse text-emerald-400' : 'text-rose-400'}`} />
          <span>{sseConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          เมนูหลักโรงพยาบาล (6 หมวด)
        </div>
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30 shadow-sm shadow-teal-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className={isActive ? 'text-teal-400' : 'text-slate-400'}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-bounce">
                  <Bell className="w-3 h-3 inline" />
                  <span>{item.badge}</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300">
              {currentUser?.full_name?.charAt(0) || 'A'}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 truncate">{currentUser?.full_name || 'ผู้อำนวยการ'}</p>
              <p className="text-[11px] text-slate-500 truncate">@{currentUser?.username || 'admin'}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="ออกจากระบบ"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-slate-600 text-center">
          DrTech.Care Hospital PT System v3.0
        </div>
      </div>
    </aside>
  );
};
