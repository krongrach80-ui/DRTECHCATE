/**
 * packages/hospital-ui-kit/src/components/TopProgressBar.tsx
 * Master Prompt v5 Section 2.2 #1: Top Navigation Progress Bar (3px high, emerald-to-sky gradient)
 */

import React, { useEffect, useState } from 'react';

export interface TopProgressBarProps {
  isLoading: boolean;
}

export const TopProgressBar: React.FC<TopProgressBarProps> = ({ isLoading }) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      setVisible(true);
      setProgress(20);
      timer = setTimeout(() => {
        setProgress(75);
      }, 150);
    } else {
      setProgress(100);
      timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }

    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-transparent pointer-events-none overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-500 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(14,165,233,0.6)]"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
};
