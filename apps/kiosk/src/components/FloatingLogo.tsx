import React from 'react';
import { Activity, Sparkles } from 'lucide-react';

export const FloatingLogo: React.FC = () => {
  return (
    <div className="relative flex flex-col items-center justify-center select-none animate-float">
      {/* Background radial halo */}
      <div className="absolute -inset-10 bg-gradient-to-tr from-blue-600/20 via-indigo-500/20 to-teal-400/10 rounded-full blur-3xl opacity-75" />

      {/* Main emblem */}
      <div className="relative w-44 h-44 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-1 shadow-2xl shadow-blue-500/30 flex items-center justify-center glow-blue">
        <div className="w-full h-full rounded-[22px] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <Activity className="w-20 h-20 text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.6)]" />
          <div className="flex items-center gap-1 mt-2 text-blue-300 font-['Outfit'] font-bold text-lg">
            <span>DrTech</span>
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin-slow" />
          </div>
        </div>
      </div>
    </div>
  );
};
