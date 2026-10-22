'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Printer,
  Home,
  User,
  Clock,
  MapPin,
  Gamepad2,
  Sparkles,
} from 'lucide-react';

interface QueueTicketProps {
  ticket: {
    queue_number: string;
    patient_name: string;
    hn: string;
    assigned_pt: string;
    station: string;
    scheduled_items: Array<{
      id: string;
      title: string;
      type: string;
      bodyArea: string;
      status: string;
    }>;
    timestamp: string;
    date: string;
  };
  onFinish: () => void;
}

export default function KioskQueueTicket({ ticket, onFinish }: QueueTicketProps) {
  const [countdown, setCountdown] = useState(15);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onFinish]);

  const handlePrint = () => {
    setPrinted(true);
    setTimeout(() => setPrinted(false), 3000);
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-[640px] max-w-lg mx-auto w-full p-6 text-white select-none">
      {/* Success Badge */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-4 h-4" />
          <span>เช็คอินสำเร็จ • บัตรคิวเข้ารับการฟื้นฟู</span>
        </div>
        <h2 className="text-xl font-bold">กรุณารอเรียกคิวตามหมายเลข</h2>
      </div>

      {/* Hospital Queue Ticket Card (Thermal Ticket Look) */}
      <div className="w-full my-4 p-6 rounded-3xl bg-slate-900 border-2 border-emerald-500/40 shadow-2xl relative overflow-hidden space-y-5">
        {/* Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400" />

        {/* Big Queue Number */}
        <div className="text-center py-2 border-b border-slate-800">
          <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-1">
            หมายเลขคิวของคุณ (Queue Number)
          </div>
          <div className="text-6xl font-black font-mono tracking-tight text-emerald-400 drop-shadow-md">
            {ticket.queue_number}
          </div>
        </div>

        {/* Patient & PT Details */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
              <User className="w-3 h-3 text-slate-500" />
              <span>ผู้ป่วย:</span>
            </span>
            <div className="font-bold text-white text-sm">{ticket.patient_name}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">HN: {ticket.hn}</div>
          </div>

          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>เวลาเช็คอิน:</span>
            </span>
            <div className="font-bold text-white text-sm">{ticket.timestamp}</div>
            <div className="text-[10px] text-slate-400">{ticket.date}</div>
          </div>

          <div className="col-span-2 p-3 bg-slate-950/70 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
              <MapPin className="w-3 h-3 text-emerald-400" />
              <span>จุดบริการ & นักกายภาพบำบัดผู้รับผิดชอบ:</span>
            </span>
            <div className="font-bold text-emerald-300 text-sm">{ticket.station}</div>
            <div className="text-xs text-slate-300 mt-0.5">{ticket.assigned_pt}</div>
          </div>
        </div>

        {/* Today's Scheduled Exercises / Minigames */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
            <Gamepad2 className="w-4 h-4 text-purple-400" />
            <span>โปรแกรมมินิเกมที่ต้องเข้าฝึกวันนี้:</span>
          </div>

          {ticket.scheduled_items.length === 0 ? (
            <div className="p-2.5 rounded-xl bg-slate-950 text-slate-500 text-xs text-center border border-slate-800">
              ไม่มีตารางฝึกที่กำหนดล่วงหน้าสำหรับวันนี้ (รอรับการประเมินจากนักกายภาพบำบัด)
            </div>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {ticket.scheduled_items.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className="p-2 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-medium text-white">{item.title}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                    รอเข้าฝึก
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="w-full max-w-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{printed ? 'พิมพ์จำลองสำเร็จ ✓' : 'พิมพ์บัตรคิว'}</span>
          </button>

          <button
            type="button"
            onClick={onFinish}
            className="py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Home className="w-4 h-4" />
            <span>เสร็จสิ้น (กลับหน้าแรก)</span>
          </button>
        </div>

        <div className="text-center text-xs text-slate-500">
          ระบบจะกลับสู่หน้าแรกโดยอัตโนมัติใน {countdown} วินาที
        </div>
      </div>
    </div>
  );
}
