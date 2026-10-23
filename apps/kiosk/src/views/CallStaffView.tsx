import React from 'react';
import { BellRing, CheckCircle, Home } from 'lucide-react';

interface CallStaffViewProps {
  ticketId?: string | null;
  errorMessage?: string | null;
  onReset: () => void;
}

export const CallStaffView: React.FC<CallStaffViewProps> = ({
  ticketId,
  errorMessage,
  onReset,
}) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-12 px-8 select-none bg-slate-950">
      <div className="my-auto w-full max-w-lg p-10 rounded-3xl bg-slate-900/90 border border-rose-500/30 shadow-2xl flex flex-col items-center text-center">
        {/* Pulsing Bell Icon */}
        <div className="w-24 h-24 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center mb-6 text-rose-400">
          <BellRing className="w-12 h-12 animate-bounce" />
        </div>

        <h2 className="text-3xl font-extrabold text-white">
          กำลังส่งสัญญาณเรียกเจ้าหน้าที่
        </h2>

        <p className="text-base text-slate-300 mt-3 leading-relaxed">
          {errorMessage || 'ระบบได้ส่งสัญญาณแจ้งเตือนไปยังเคาน์เตอร์และนักกายภาพบำบัดแล้ว เจ้าหน้าที่กำลังเดินทางมาอำนวยความสะดวกให้ท่านที่หน้าตู้'}
        </p>

        {ticketId && (
          <div className="mt-6 px-5 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-300">
            หมายเลขคำเรียก: <span className="text-blue-400 font-bold">{ticketId}</span>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 text-emerald-400 text-sm font-semibold">
          <CheckCircle className="w-5 h-5" />
          <span>เชื่อมต่อเจ้าหน้าที่ประจำตึกสำเร็จ</span>
        </div>
      </div>

      {/* Cancel Action */}
      <div className="w-full max-w-md pb-4">
        <button
          onClick={onReset}
          className="touch-btn w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-base flex items-center justify-center gap-2"
        >
          <Home className="w-5 h-5" />
          <span>ยกเลิกและกลับสู่หน้าหลัก</span>
        </button>
      </div>
    </div>
  );
};
