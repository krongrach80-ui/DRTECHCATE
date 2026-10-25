/**
 * packages/hospital-ui-kit/src/components/StatusBadge.tsx
 * Master Prompt v5 Section 1: Standardized Clinical Status Badges with Pulsing Dot
 */

import React from 'react';

export type StatusVariant = 'active' | 'pending' | 'danger' | 'neutral';

export interface StatusBadgeProps {
  variant?: StatusVariant;
  text: string;
  hasDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant = 'active',
  text,
  hasDot = true,
  className = '',
}) => {
  let bgClass = 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]/50';
  let dotColor = '#22C55E';

  if (variant === 'pending') {
    bgClass = 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]/60';
    dotColor = '#F59E0B';
  } else if (variant === 'danger') {
    bgClass = 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]/60';
    dotColor = '#EF4444';
  } else if (variant === 'neutral') {
    bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
    dotColor = '#94A3B8';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border select-none transition-all duration-200 ${bgClass} ${className}`}
    >
      {hasDot && (
        <span
          className="w-2 h-2 rounded-full shrink-0 animate-[softPulseDot_2s_infinite]"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <span>{text}</span>
    </span>
  );
};
