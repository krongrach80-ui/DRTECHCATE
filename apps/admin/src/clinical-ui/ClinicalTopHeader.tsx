/**
 * apps/admin/src/clinical-ui/ClinicalTopHeader.tsx
 * Master Prompt v5 Section 4.1: Clean White Top Header Bar with Clinical Actions
 */

import React from 'react';
import {
  UserPlus,
  Zap,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';
import { SmoothButton } from '../../../../packages/hospital-ui-kit/src/index.js';

interface ClinicalTopHeaderProps {
  title: string;
  subtitleEn: string;
  userName?: string;
  userRoleTitle?: string;
  onOpenNewPatientModal: () => void;
  onFastCheckIn: () => void;
  onLogout: () => void;
  isPtMode?: boolean;
}

export const ClinicalTopHeader: React.FC<ClinicalTopHeaderProps> = ({
  title,
  subtitleEn,
  userName = 'นพ. วรชัย อมรเวช',
  userRoleTitle = 'ผู้อำนวยการโรงพยาบาล (Hospital Director)',
  onOpenNewPatientModal,
  onFastCheckIn,
  onLogout,
  isPtMode = false,
}) => {
  return (
    <header className="h-20 bg-white border-b border-slate-200/90 px-8 flex items-center justify-between shadow-sm shrink-0 z-20">
      {/* Left Title with English Subtitle */}
      <div>
        <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <span>{title}</span>
        </h2>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {subtitleEn}
        </p>
      </div>

      {/* Right Action Bar */}
      <div className="flex items-center gap-3.5">
        {/* Supabase Status Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-emerald-800 select-none">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>● Supabase Cloud</span>
        </div>

        {/* Primary Action Button: + ต้อนรับ & สแกนหน้า */}
        <SmoothButton
          variant="primary"
          size="sm"
          onClick={onOpenNewPatientModal}
          icon={<UserPlus className="w-3.5 h-3.5" />}
        >
          <span>+ ต้อนรับ & สแกนหน้า</span>
        </SmoothButton>

        {/* Quick Check-in Button: + เช็คอินเร่งด่วน */}
        <button
          type="button"
          onClick={onFastCheckIn}
          className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold transition active:scale-95"
        >
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span>+ เช็คอินเร่งด่วน</span>
        </button>

        {/* User Profile Badge */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-emerald-500/30">
            {isPtMode ? <User className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </div>
          <div className="hidden lg:block text-left select-none">
            <div className="text-xs font-bold text-slate-800 truncate max-w-[170px]">
              {userName}
            </div>
            <div className="text-[10px] text-slate-400 truncate max-w-[170px]">
              {userRoleTitle}
            </div>
          </div>

          {/* Logout Quick Button */}
          <button
            type="button"
            onClick={onLogout}
            title="ออกจากระบบ"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition active:scale-95"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
