import React from 'react';
import { User, Calendar, Activity, Lock, LogOut } from 'lucide-react';

export default function PatientPortalPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <User className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Patient Portal</h1>
            <p className="text-xs text-slate-400">ระบบติดตามการฟื้นฟูกายภาพสำหรับคนไข้</p>
          </div>
        </div>

        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>ออกจากระบบ</span>
          </button>
        </form>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="mb-8 p-6 rounded-2xl glass-panel">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
            <Lock className="w-3.5 h-3.5" />
            <span>Authenticated as Patient</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">หน้าข้อมูลสุขภาพและการฟื้นฟูของคุณ</h2>
          <p className="text-sm text-slate-400">
            คุณสามารถตรวจสอบประวัติการนัดหมายและตารางฝึกทำกายภาพบำบัดได้ที่นี่ ข้อมูลของคุณได้รับการปกป้องอย่างเคร่งครัดตาม PDPA
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl w-fit mb-4">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-white mb-1">ตารางนัดหมาย & คอร์สฝึก</h3>
            <p className="text-xs text-slate-400">ดูตารางการฝึกประจำสัปดาห์หรือรายเดือนที่นักกายภาพบำบัดกำหนด</p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl w-fit mb-4">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-white mb-1">ความก้าวหน้าการฟื้นฟู</h3>
            <p className="text-xs text-slate-400">สถิติการฝึกและคำแนะนำจากนักกายภาพบำบัด</p>
          </div>
        </div>
      </main>
    </div>
  );
}
