/**
 * packages/hospital-ui-kit/src/responsive/ResponsiveShellWrapper.tsx
 * Master Prompt v7: Universal Responsive Shell Wrapper & Mobile Drawer Adapter
 */

import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useViewportAdapter } from './viewportAdapter';
import './responsiveTypography.css';
import './deviceLayout.css';

export interface ResponsiveShellWrapperProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  headerTitle?: string;
  className?: string;
}

export const ResponsiveShellWrapper: React.FC<ResponsiveShellWrapperProps> = ({
  children,
  sidebar,
  headerTitle = 'Dr.Tech.Care',
  className = '',
}) => {
  const { isMobile, deviceTier, touchTargetMinSize } = useViewportAdapter();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  return (
    <div
      data-device-tier={deviceTier}
      className={`min-h-screen w-screen overflow-x-hidden safe-viewport touch-friendly font-sans select-none relative ${className}`}
      style={{
        fontFamily: 'var(--font-medical-sans)',
      }}
    >
      {/* Mobile Top App Bar with Drawer Toggle Button (only on mobile) */}
      {isMobile && sidebar && (
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#063932] text-white border-b border-emerald-900/60 sticky top-0 z-40 shadow-md">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="btn-toggle-mobile-drawer"
              onClick={() => setMobileDrawerOpen((prev) => !prev)}
              style={{ minHeight: `${touchTargetMinSize}px`, minWidth: `${touchTargetMinSize}px` }}
              className="p-2 rounded-xl bg-emerald-900/50 hover:bg-emerald-800 text-emerald-200 flex items-center justify-center transition active:scale-95"
              aria-label="เมนูหลัก"
            >
              {mobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="font-bold text-sm tracking-tight text-white">{headerTitle}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/80">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Mobile Mode</span>
          </div>
        </div>
      )}

      {/* Main Layout Area */}
      <div className="flex h-full w-full overflow-hidden relative">
        {/* Mobile Slide-Out Drawer Overlay */}
        {isMobile && sidebar && mobileDrawerOpen && (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 md:hidden animate-fade-in"
            onClick={() => setMobileDrawerOpen(false)}
          >
            <div
              className="w-72 max-w-[85vw] h-full bg-[#063932] text-white shadow-2xl flex flex-col justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex items-center justify-between border-b border-emerald-900/60">
                <span className="text-sm font-bold text-emerald-200">เมนูนำทางคลินิก</span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-emerald-900 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto" onClick={() => setMobileDrawerOpen(false)}>
                {sidebar}
              </div>
            </div>
          </div>
        )}

        {/* Desktop Sidebar (Left) */}
        {!isMobile && sidebar && (
          <div className="hidden md:block shrink-0">{sidebar}</div>
        )}

        {/* Main Content Workspace */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
