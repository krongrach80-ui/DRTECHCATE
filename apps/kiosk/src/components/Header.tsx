import React, { useState, useEffect } from 'react';
import { Activity, Bell, Wifi } from 'lucide-react';

interface HeaderProps {
  kioskId?: string;
  onCallStaff?: () => void;
  onOpenPairing?: () => void;
  isPaired?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  kioskId = 'KIOSK-01',
  onCallStaff,
  onOpenPairing,
  isPaired = true,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full h-20 px-8 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md z-30 select-none">
      {/* Brand Identity */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Activity className="w-7 h-7 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white font-['Outfit']">
              DrTech<span className="text-blue-400">.Care</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
              ตู้กายภาพบำบัด
            </span>
          </div>
          <p className="text-xs text-slate-400">ระบบฟื้นฟูสมรรถภาพกายอัจฉริยะ</p>
        </div>
      </div>

      {/* Terminal Info & Live Clock */}
      <div className="flex items-center gap-6">
        <button
          onClick={onOpenPairing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:border-slate-700 transition"
          title="สถานะการเชื่อมต่อตู้"
        >
          <Wifi className={`w-3.5 h-3.5 ${isPaired ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span>{kioskId}</span>
          <span
            className={`w-2 h-2 rounded-full ${
              isPaired ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
        </button>

        <div className="text-right hidden sm:block">
          <div className="text-base font-semibold text-slate-200 font-mono tracking-wider">
            {currentTime}
          </div>
          <div className="text-xs text-slate-500">
            {new Date().toLocaleDateString('th-TH', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>
        </div>

        {/* Emergency Staff Call Button */}
        {onCallStaff && (
          <button
            onClick={onCallStaff}
            className="touch-btn flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-medium text-sm transition shadow-lg shadow-rose-950/40"
          >
            <Bell className="w-4 h-4 text-rose-400 animate-bounce" />
            <span>เรียกเจ้าหน้าที่</span>
          </button>
        )}
      </div>
    </header>
  );
};
