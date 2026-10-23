import React from 'react';
import {
  Sparkles,
  ClipboardList,
  Users,
  FileText,
  Dumbbell,
  Calendar,
  UserCheck,
  BellRing,
  LogOut,
  Radio
} from 'lucide-react';
import { PtViewTab } from '../types';
import { UserProfile, defaultApiClient } from '../../../../packages/api-client/src/index.js';

interface PtSidebarProps {
  currentTab: PtViewTab;
  onTabChange: (tab: PtViewTab) => void;
  currentUser: UserProfile;
  staffCallCount: number;
  sseConnected: boolean;
}

export const PtSidebar: React.FC<PtSidebarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  staffCallCount,
  sseConnected,
}) => {
  const handleLogout = async () => {
    try {
      await defaultApiClient.auth.logout();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const navItems: Array<{
    id: PtViewTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    {
      id: 'reception',
      label: 'หน้าต้อนรับ & คิวสด',
      description: 'ส่งตู้ เช็คอิน เรียกเจ้าหน้าที่',
      icon: ClipboardList,
      badge: staffCallCount > 0 ? staffCallCount : undefined,
    },
    {
      id: 'patients',
      label: 'คนไข้ในความรับผิดชอบ',
      description: 'คนไข้ตนเอง & เคสฝาก',
      icon: Users,
    },
    {
      id: 'records',
      label: 'เวชระเบียนคลินิก',
      description: 'โน้ตต่อท้าย & ผลการรักษา',
      icon: FileText,
    },
    {
      id: 'exercises',
      label: 'คลังท่ากายภาพ',
      description: 'ท่าที่สร้าง & คลังส่วนกลาง',
      icon: Dumbbell,
    },
    {
      id: 'schedule',
      label: 'ตารางนัดหมาย & แผน',
      description: 'คิวประจำวัน & ปฏิทินนัด',
      icon: Calendar,
    },
    {
      id: 'profile',
      label: 'ข้อมูลส่วนตัว & ใบอนุญาต',
      description: 'ความเชี่ยวชาญ & ติดต่อ',
      icon: UserCheck,
    },
  ];

  return (
    <aside className="w-72 bg-slate-900/95 border-r border-slate-800 flex flex-col h-screen select-none">
      {/* Brand & Hospital Banner */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>DrTech.Care</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                PT
              </span>
            </h1>
            <p className="text-xs text-slate-400">เว็บนักกายภาพบำบัด</p>
          </div>
        </div>

        {/* Real-time SSE Live Indicator */}
        <div className="mt-4 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${sseConnected ? 'text-teal-400 animate-pulse' : 'text-amber-400'}`} />
            <span className="text-slate-300">
              {sseConnected ? 'Realtime Connected' : 'Connecting SSE...'}
            </span>
          </div>
          <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-teal-400' : 'bg-amber-400'}`} />
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/10 text-white border border-teal-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <div>
                  <div className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-slate-500 group-hover:text-slate-400">
                    {item.description}
                  </div>
                </div>
              </div>

              {item.badge !== undefined && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse shadow-sm">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* PT Profile & Logout Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-xs font-bold text-teal-300">
              {currentUser.full_name?.charAt(0) || 'P'}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-slate-200 truncate">
                {currentUser.full_name}
              </div>
              <div className="text-[10px] text-teal-400 font-mono truncate">
                {currentUser.pt_details?.license_no ? `วภ. ${currentUser.pt_details.license_no}` : 'นักกายภาพบำบัด'}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {staffCallCount > 0 && (
          <div
            onClick={() => onTabChange('reception')}
            className="cursor-pointer px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs hover:bg-rose-500/20 transition"
          >
            <BellRing className="w-4 h-4 text-rose-400 animate-bounce" />
            <span className="font-semibold">{staffCallCount} คำเรียกเจ้าหน้าที่</span>
          </div>
        )}
      </div>
    </aside>
  );
};
