/**
 * packages/hospital-ui-kit/src/components/MedicalCard.tsx
 * Master Prompt v5 Section 1: Standardized Clinical Card Surface
 */

import React from 'react';
import { hospitalTheme } from '../theme';

export interface MedicalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const MedicalCard: React.FC<MedicalCardProps> = ({
  children,
  interactive = false,
  className = '',
  style,
  ...rest
}) => {
  return (
    <div
      {...rest}
      style={{
        boxShadow: hospitalTheme.colors.cardShadow,
        transition: hospitalTheme.animation.springTransition,
        ...style,
      }}
      className={`bg-white rounded-2xl border border-slate-200/90 ${
        interactive
          ? 'hover:border-emerald-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};
