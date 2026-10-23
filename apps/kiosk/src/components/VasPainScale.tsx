import React from 'react';

interface VasPainScaleProps {
  value: number | null;
  onChange: (score: number) => void;
}

const VAS_LEVELS = [
  { score: 0, emoji: '😄', label: 'ไม่ปวดเลย', color: 'from-emerald-600 to-emerald-500' },
  { score: 2, emoji: '🙂', label: 'ปวดเล็กน้อย', color: 'from-emerald-500 to-teal-500' },
  { score: 4, emoji: '😐', label: 'ปวดปานกลาง', color: 'from-amber-500 to-amber-600' },
  { score: 6, emoji: '🙁', label: 'ปวดมาก', color: 'from-orange-500 to-orange-600' },
  { score: 8, emoji: '😣', label: 'ปวดมากที่สุด', color: 'from-rose-500 to-rose-600' },
  { score: 10, emoji: '😭', label: 'ทนไม่ไหว', color: 'from-rose-700 to-red-800' },
];

export const VasPainScale: React.FC<VasPainScaleProps> = ({ value, onChange }) => {
  return (
    <div className="w-full flex flex-col gap-4 select-none">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {VAS_LEVELS.map((item) => {
          const isSelected = value === item.score;
          return (
            <button
              key={item.score}
              type="button"
              onClick={() => onChange(item.score)}
              className={`touch-btn flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                isSelected
                  ? `border-white bg-gradient-to-b ${item.color} text-white shadow-xl scale-105 ring-4 ring-white/20`
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-4xl mb-2 filter drop-shadow">{item.emoji}</span>
              <span className="text-xl font-bold font-mono">{item.score}</span>
              <span className="text-xs font-medium text-center mt-1 opacity-90">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
