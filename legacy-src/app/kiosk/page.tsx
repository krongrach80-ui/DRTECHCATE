'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ScanFace,
  Phone,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  Activity,
  HeartHandshake,
  CheckCircle2,
} from 'lucide-react';
import KioskFaceScanner from '@/components/face/KioskFaceScanner';
import KioskPhoneKeypad from '@/components/kiosk/KioskPhoneKeypad';
import KioskQueueTicket from '@/components/kiosk/KioskQueueTicket';

type KioskView = 'WELCOME' | 'SCAN_FACE' | 'PHONE_FALLBACK' | 'QUEUE_TICKET';

interface QueueTicketData {
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
}

export default function KioskPage() {
  const [currentView, setCurrentView] = useState<KioskView>('WELCOME');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [ticketData, setTicketData] = useState<QueueTicketData | null>(null);

  // Inactivity timeout: 45 seconds in interactive modes
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetToWelcome = useCallback(() => {
    setCurrentView('WELCOME');
    setTicketData(null);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Only run inactivity countdown on interactive non-welcome views
    if (currentView === 'SCAN_FACE' || currentView === 'PHONE_FALLBACK') {
      inactivityTimerRef.current = setTimeout(() => {
        resetToWelcome();
      }, 45000); // 45 seconds
    }
  }, [currentView, resetToWelcome]);

  // Touch listener to reset inactivity timer
  useEffect(() => {
    const handleTouchOrClick = () => {
      resetInactivityTimer();
    };

    window.addEventListener('click', handleTouchOrClick);
    window.addEventListener('touchstart', handleTouchOrClick);

    return () => {
      window.removeEventListener('click', handleTouchOrClick);
      window.removeEventListener('touchstart', handleTouchOrClick);
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    resetInactivityTimer();
  }, [currentView, resetInactivityTimer]);

  // Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
      setCurrentDate(
        now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // When Face or Phone verification succeeds: issue Queue Ticket
  const handleAuthSuccess = async (
    patient: { id: string; full_name: string; username: string },
    queueToken: string
  ) => {
    try {
      const res = await fetch('/api/kiosk/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          queue_token: queueToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'ออกบัตรคิวไม่สำเร็จ');
      }

      setTicketData(data.ticket);
      setCurrentView('QUEUE_TICKET');
    } catch {
      // Fallback ticket representation if queue route encounters issue
      const now = new Date();
      setTicketData({
        queue_number: 'PT-001',
        patient_name: patient.full_name,
        hn: patient.username,
        assigned_pt: 'นักกายภาพบำบัดประจำเวร',
        station: 'ห้องฟื้นฟูสมรรถภาพทางกาย (Station A)',
        scheduled_items: [],
        timestamp: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        date: now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
      });
      setCurrentView('QUEUE_TICKET');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 md:p-10 select-none overflow-hidden relative">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center shadow-lg">
            <HeartHandshake className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="font-extrabold text-white text-base tracking-tight leading-tight">
              โรงพยาบาลกายภาพบำบัด • Physical Therapy Department
            </div>
            <div className="text-xs text-emerald-400 font-medium">ตู้บริการเช็คอินอัตโนมัติ (Self-Service Kiosk)</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end text-xs">
            <span className="font-mono font-bold text-white text-sm">{currentTime} น.</span>
            <span className="text-slate-400">{currentDate}</span>
          </div>

          <Link
            href="/login"
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs bg-slate-900/80 hover:bg-slate-800 border border-slate-800 px-3.5 py-2 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">สำหรับเจ้าหน้าที่</span>
          </Link>
        </div>
      </header>

      {/* Main Content Dynamic Views */}
      <main className="relative z-10 flex-1 flex items-center justify-center my-auto py-6">
        {/* VIEW 1: WELCOME SCREEN */}
        {currentView === 'WELCOME' && (
          <div className="max-w-2xl mx-auto text-center space-y-8 animate-fadeIn">
            {/* Status Pill */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>สถานีเช็คอินพร้อมให้บริการ (Device Online)</span>
            </div>

            {/* Title & Description */}
            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
                ยินดีต้อนรับสู่ <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                  แผนกเวชศาสตร์ฟื้นฟูและกายภาพบำบัด
                </span>
              </h1>
              <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                กรุณาเลือกวิธียืนยันตัวตนด้านล่างเพื่อรับบัตรคิวและตรวจสอบตารางการฝึกมินิเกมประจำวัน
              </p>
            </div>

            {/* Big Touch Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 pt-2">
              {/* PRIMARY: Face Check-in */}
              <button
                type="button"
                onClick={() => setCurrentView('SCAN_FACE')}
                className="w-full sm:w-80 p-6 rounded-3xl bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-95 text-white font-bold shadow-2xl shadow-sky-500/30 border border-sky-400/40 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group"
              >
                <div className="p-4 rounded-2xl bg-white/10 group-hover:scale-110 transition-transform">
                  <ScanFace className="w-10 h-10 text-white" />
                </div>
                <div className="text-center">
                  <div className="text-lg font-extrabold">สแกนใบหน้าเพื่อรับคิว</div>
                  <div className="text-xs text-sky-100 font-normal mt-0.5">Face Verification • สะดวกรวดเร็ว</div>
                </div>
              </button>

              {/* SECONDARY: Phone Fallback */}
              <button
                type="button"
                onClick={() => setCurrentView('PHONE_FALLBACK')}
                className="w-full sm:w-80 p-6 rounded-3xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 text-slate-200 hover:text-white font-bold border-2 border-slate-800 hover:border-slate-700 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group shadow-xl"
              >
                <div className="p-4 rounded-2xl bg-slate-800 group-hover:scale-110 transition-transform text-emerald-400">
                  <Phone className="w-10 h-10" />
                </div>
                <div className="text-center">
                  <div className="text-lg font-extrabold">เช็คอินด้วยเบอร์โทรศัพท์</div>
                  <div className="text-xs text-slate-400 font-normal mt-0.5">Phone Number / HN Fallback</div>
                </div>
              </button>
            </div>

            {/* Features summary chips */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>ยืนยันตัวตนแม่นยำ</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>แจ้งตารางฝึกมินิเกมทันที</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>มาตรฐานความปลอดภัย PDPA</span>
              </span>
            </div>
          </div>
        )}

        {/* VIEW 2: FACE SCANNER */}
        {currentView === 'SCAN_FACE' && (
          <KioskFaceScanner
            onSuccess={handleAuthSuccess}
            onFallback={() => setCurrentView('PHONE_FALLBACK')}
            onCancel={resetToWelcome}
          />
        )}

        {/* VIEW 3: PHONE KEYPAD FALLBACK */}
        {currentView === 'PHONE_FALLBACK' && (
          <KioskPhoneKeypad
            onSuccess={handleAuthSuccess}
            onSwitchToFace={() => setCurrentView('SCAN_FACE')}
            onCancel={resetToWelcome}
          />
        )}

        {/* VIEW 4: QUEUE TICKET */}
        {currentView === 'QUEUE_TICKET' && ticketData && (
          <KioskQueueTicket ticket={ticketData} onFinish={resetToWelcome} />
        )}
      </main>

      {/* Footer Legal & Compliance Notice */}
      <footer className="relative z-10 text-center text-xs text-slate-500 py-3 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>การเก็บข้อมูลชีวมาตรและการยืนยันตัวตนสอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)</span>
        <span className="text-[11px] text-slate-600 font-mono">Hospital PT Kiosk Client v1.0 • Touch Enabled</span>
      </footer>
    </div>
  );
}
