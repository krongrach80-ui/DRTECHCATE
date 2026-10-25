/**
 * packages/hospital-ui-kit/src/components/SmoothButton.tsx
 * Master Prompt v5 Section 2.1: Tactile Spring Click, Ripple Feedback & Anti-Double-Click Lock
 */

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { hospitalTheme } from '../theme';

export interface SmoothButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  preventDoubleClick?: boolean;
  icon?: React.ReactNode;
}

export const SmoothButton: React.FC<SmoothButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText = 'กำลังซิงค์ข้อมูลอย่างปลอดภัย...',
  preventDoubleClick = true,
  icon,
  onClick,
  disabled,
  className = '',
  style,
  ...rest
}) => {
  const [internalSubmitting, setInternalSubmitting] = useState(false);

  const isBusy = isLoading || internalSubmitting;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isBusy || disabled) {
      e.preventDefault();
      return;
    }

    if (preventDoubleClick) {
      setInternalSubmitting(true);
    }

    try {
      if (onClick) {
        await onClick(e);
      }
    } finally {
      if (preventDoubleClick) {
        // Soft unlock after short delay to prevent double-tap bursts
        setTimeout(() => setInternalSubmitting(false), 600);
      }
    }
  };

  // Base sizing
  let sizeClasses = 'px-4 py-2.5 text-sm gap-2';
  if (size === 'sm') sizeClasses = 'px-3 py-1.5 text-xs gap-1.5';
  if (size === 'lg') sizeClasses = 'px-6 py-3.5 text-base gap-2.5 font-semibold';

  // Base variant styles
  let variantClasses = 'text-white shadow-md';
  let customStyle: React.CSSProperties = {
    transition: hospitalTheme.animation.springTransition,
    ...style,
  };

  if (variant === 'primary') {
    customStyle = {
      ...customStyle,
      background: hospitalTheme.colors.primaryGradient,
      boxShadow: hospitalTheme.colors.primaryShadow,
    };
    variantClasses += ' hover:brightness-105 active:scale-[0.97]';
  } else if (variant === 'secondary') {
    variantClasses = 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 active:scale-[0.97]';
  } else if (variant === 'outline') {
    variantClasses = 'bg-white hover:bg-emerald-50 text-emerald-800 border-2 border-emerald-500/40 hover:border-emerald-500 active:scale-[0.97]';
  } else if (variant === 'danger') {
    variantClasses = 'bg-rose-600 hover:bg-rose-500 text-white shadow-md active:scale-[0.97]';
  } else if (variant === 'ghost') {
    variantClasses = 'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 active:scale-[0.97]';
  }

  return (
    <button
      {...rest}
      disabled={disabled || isBusy}
      onClick={handleClick}
      style={customStyle}
      className={`inline-flex items-center justify-center font-medium rounded-xl select-none relative overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${className}`}
    >
      {isBusy ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" />
          <span>{loadingText}</span>
        </>
      ) : (
        <>
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{children}</span>
        </>
      )}
    </button>
  );
};
