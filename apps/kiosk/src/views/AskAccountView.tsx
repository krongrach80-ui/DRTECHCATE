import React, { useState } from 'react';
import { UserCheck, UserPlus, Ticket, ArrowRight, ShieldCheck } from 'lucide-react';

interface AskAccountViewProps {
  onHasAccount: () => void;
  onNoAccount: (ticketId?: string) => void;
  onCallStaff: () => void;
}

export const AskAccountView: React.FC<AskAccountViewProps> = ({
  onHasAccount,
  onNoAccount,
  onCallStaff,
}) => {
  const [ticketInput, setTicketInput] = useState<string>('');
  const [showTicketInput, setShowTicketInput] = useState<boolean>(false);

  const handleTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticketInput.trim()) {
      onNoAccount(ticketInput.trim());
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-10 px-8 select-none bg-slate-950">
      {/* Title */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
          ขั้นตอนที่ 1 / 3
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
          กรุณาเลือกสถานะการนัดหมายของท่าน
        </h2>
        <p className="text-base text-slate-400 mt-2">
          เลือกตัวเลือกที่ตรงกับการมาโรงพยาบาลของท่านในวันนี้
        </p>
      </div>

      {/* Giant Touch Buttons */}
      <div className="w-full max-w-2xl flex flex-col gap-6 my-auto">
        {/* Choice 1: Has Account */}
        <button
          onClick={onHasAccount}
          className="touch-btn w-full p-8 rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 hover:from-blue-600 hover:to-indigo-500 text-white flex items-center justify-between shadow-2xl shadow-blue-600/30 border border-blue-400/30 group"
        >
          <div className="flex items-center gap-6 text-left">
            <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
              <UserCheck className="w-10 h-10 text-white" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white">
                มีประวัติแล้ว / มีนัดวันนี้
              </div>
              <p className="text-base text-blue-100/90 mt-1">
                สแกนใบหน้าเพื่อเข้าสู่คอร์สกายภาพบำบัดประจำวัน
              </p>
            </div>
          </div>
          <ArrowRight className="w-8 h-8 text-white/80 group-hover:translate-x-2 transition" />
        </button>

        {/* Choice 2: No Account / First Time */}
        <button
          onClick={() => {
            if (!showTicketInput) {
              onNoAccount();
            }
          }}
          className="touch-btn w-full p-8 rounded-3xl bg-slate-900 hover:bg-slate-800 text-slate-200 flex items-center justify-between border-2 border-slate-800 shadow-xl group"
        >
          <div className="flex items-center gap-6 text-left">
            <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
              <UserPlus className="w-10 h-10 text-slate-300" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white">
                มาครั้งแรก / ยังไม่มีประวัติ
              </div>
              <p className="text-base text-slate-400 mt-1">
                ติดต่อเจ้าหน้าที่เคาน์เตอร์ต้อนรับ หรือลงทะเบียนด้วยบัตรคิว
              </p>
            </div>
          </div>
          <ArrowRight className="w-8 h-8 text-slate-500 group-hover:translate-x-2 transition" />
        </button>
      </div>

      {/* Bottom options: Ticket code fallback and Staff Help */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
        {!showTicketInput ? (
          <button
            onClick={() => setShowTicketInput(true)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition"
          >
            <Ticket className="w-4 h-4 text-blue-400" />
            <span>มีรหัสบัตรคิวลงทะเบียนจากเคาน์เตอร์? (10-min Ticket)</span>
          </button>
        ) : (
          <form onSubmit={handleTicketSubmit} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={ticketInput}
              onChange={(e) => setTicketInput(e.target.value)}
              placeholder="กรอกรหัสบัตรคิว 10 นาที..."
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"
            >
              ใช้บัตรคิว
            </button>
          </form>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>คุ้มครองข้อมูลส่วนบุคคล PDPA</span>
          </div>
          <button
            onClick={onCallStaff}
            className="text-xs font-medium text-rose-400 hover:text-rose-300 underline"
          >
            ขอความช่วยเหลือจากเจ้าหน้าที่
          </button>
        </div>
      </div>
    </div>
  );
};
