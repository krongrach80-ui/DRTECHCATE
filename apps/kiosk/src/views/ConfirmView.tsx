/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { User, Check, X, ShieldCheck } from 'lucide-react';

interface ConfirmViewProps {
  firstName: string;
  avatarUrl?: string | null;
  onConfirm: () => void;
  onDeny: () => void;
}

export const ConfirmView: React.FC<ConfirmViewProps> = ({
  firstName,
  avatarUrl,
  onConfirm,
  onDeny,
}) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-10 px-8 select-none bg-slate-950">
      {/* Header */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
          ขั้นตอนที่ 3 / 3
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
          ยืนยันความถูกต้องของข้อมูล
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          เพื่อความปลอดภัยและความเป็นส่วนตัวของเวชระเบียน กรุณาตรวจสอบชื่อของท่าน
        </p>
      </div>

      {/* Identity Card (Strict Privacy Minimization: ONLY first name and avatar) */}
      <div className="my-auto w-full max-w-md p-8 rounded-3xl bg-slate-900/90 border-2 border-blue-500/30 shadow-2xl flex flex-col items-center text-center">
        {/* Avatar Thumbnail */}
        <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 p-1 mb-6 shadow-xl shadow-blue-500/20">
          <div className="w-full h-full rounded-full bg-slate-950 overflow-hidden flex items-center justify-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="รูปถ่ายผู้ป่วย"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-14 h-14 text-blue-300" />
            )}
          </div>
        </div>

        {/* First Name Only Prompt */}
        <p className="text-sm text-slate-400">ท่านคือผู้รับบริการชื่อ</p>
        <div className="text-4xl font-extrabold text-white mt-1 tracking-tight">
          คุณ {firstName}
        </div>
        <p className="text-xs text-blue-300/80 mt-2">
          ใช่หรือไม่?
        </p>

        {/* PDPA Badge */}
        <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>ระบบปิดบังนามสกุลและเลข HN เพื่อคุ้มครองข้อมูลส่วนบุคคล</span>
        </div>
      </div>

      {/* Giant Confirmation Buttons */}
      <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
        {/* Deny Button */}
        <button
          onClick={onDeny}
          className="touch-btn py-5 rounded-3xl bg-slate-900 hover:bg-slate-800 text-rose-300 font-bold text-xl border-2 border-rose-500/40 shadow-xl flex items-center justify-center gap-3 order-2 sm:order-1"
        >
          <X className="w-6 h-6 text-rose-400" />
          <span>ไม่ใช่ฉัน (ยกเลิก)</span>
        </button>

        {/* Confirm Button */}
        <button
          onClick={onConfirm}
          className="touch-btn py-5 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-3 order-1 sm:order-2"
        >
          <Check className="w-7 h-7 text-white" />
          <span>ใช่ ข้อมูลถูกต้อง</span>
        </button>
      </div>
    </div>
  );
};
