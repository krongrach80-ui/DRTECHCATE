/**
 * packages/hospital-ui-kit/src/components/FluidProgressBar.tsx
 * Master Prompt v5 Section 2.2 #2: Fluid Shimmer Progress Bar (60FPS requestAnimationFrame & Glossy Shimmer)
 */

import React, { useEffect, useState, useRef } from 'react';

export interface FluidProgressBarProps {
  value: number; // 0 to 100
  height?: number;
  label?: string;
  showPercent?: boolean;
  status?: 'normal' | 'success' | 'warning' | 'danger';
  className?: string;
}

export const FluidProgressBar: React.FC<FluidProgressBarProps> = ({
  value,
  height = 10,
  label,
  showPercent = true,
  status = 'normal',
  className = '',
}) => {
  const [animatedValue, setAnimatedValue] = useState(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const target = Math.min(100, Math.max(0, value));

    const step = () => {
      setAnimatedValue((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.2) {
          return target;
        }
        return prev + diff * 0.14; // Smooth spring interpolation
      });

      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [value]);

  // Color mapping
  let barGradient = 'from-emerald-500 via-teal-400 to-sky-500';
  if (status === 'success') barGradient = 'from-emerald-500 to-emerald-400';
  if (status === 'warning') barGradient = 'from-amber-500 to-amber-400';
  if (status === 'danger') barGradient = 'from-rose-500 to-rose-400';

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>{label}</span>
          {showPercent && <span className="font-mono text-emerald-700">{Math.round(animatedValue)}%</span>}
        </div>
      )}

      <div
        className="w-full bg-slate-200/80 rounded-full overflow-hidden relative shadow-inner"
        style={{ height }}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-75 relative overflow-hidden`}
          style={{ width: `${animatedValue}%` }}
        >
          {/* Animated Glossy Shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[glossyShimmer_1.8s_infinite] pointer-events-none" />
        </div>
      </div>
    </div>
  );
};
