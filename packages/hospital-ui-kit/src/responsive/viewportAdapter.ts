/**
 * packages/hospital-ui-kit/src/responsive/viewportAdapter.ts
 * Master Prompt v7 Section 1 & 2: Universal Adaptive Responsive Engine & Medical Typography
 * Strictly Isolated Presentation & Viewport Layer (Zero Backend / Core Mutation)
 */

import { useState, useEffect, useCallback } from 'react';

export type DeviceTier =
  | 'mobile'
  | 'tablet'
  | 'kiosk-portrait'
  | 'kiosk-landscape'
  | 'desktop';

export const MEDICAL_FONT_STACK =
  "'Prompt', 'Sarabun', 'Noto Sans Thai', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const FLUID_TYPOGRAPHY_DEFINITIONS = {
  h1: { minRem: 1.35, maxRem: 2.25, vwRate: 2.2, baseRem: 0.5 },
  h2: { minRem: 1.15, maxRem: 1.65, vwRate: 1.6, baseRem: 0.4 },
  body: { minRem: 0.875, maxRem: 1.05, vwRate: 0.9, baseRem: 0.3 },
  button: { minRem: 0.875, maxRem: 1.05, vwRate: 0.9, baseRem: 0.3 },
} as const;

/**
 * Detects device tier based on viewport dimensions and touch capabilities
 * 1. Mobile: < 768px
 * 2. Tablet: 768px - 1024px
 * 3. Kiosk: 1080x1920 or 1920x1080 touchscreen
 * 4. Desktop: > 1024px
 */
export function detectDeviceTier(
  width: number,
  height: number,
  isTouchDevice?: boolean
): DeviceTier {
  // Check for dedicated Kiosk resolutions first
  if (isTouchDevice) {
    if (width >= 1080 && height >= 1920 && height > width) {
      return 'kiosk-portrait';
    }
    if (width >= 1920 && height >= 1080 && width > height) {
      return 'kiosk-landscape';
    }
    if (height >= 1400 && height / width >= 1.6) {
      return 'kiosk-portrait';
    }
  }

  if (width < 768) {
    return 'mobile';
  }
  if (width >= 768 && width <= 1024) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Calculates exact fluid pixel font-size matching CSS clamp formula:
 * clamp(minRem, (vwRate * vw + baseRem), maxRem)
 */
export function calculateFluidFontSize(
  type: keyof typeof FLUID_TYPOGRAPHY_DEFINITIONS,
  viewportWidth: number,
  baseFontSize = 16
): number {
  const config = FLUID_TYPOGRAPHY_DEFINITIONS[type];
  const preferredPx = (config.vwRate / 100) * viewportWidth + config.baseRem * baseFontSize;
  const minPx = config.minRem * baseFontSize;
  const maxPx = config.maxRem * baseFontSize;
  return Math.round(Math.max(minPx, Math.min(maxPx, preferredPx)) * 100) / 100;
}

/**
 * Returns minimum touch target dimension in pixels (48px - 56px) for seniors & patients
 */
export function getTouchTargetMinSize(device: DeviceTier): number {
  switch (device) {
    case 'kiosk-portrait':
    case 'kiosk-landscape':
      return 56;
    case 'mobile':
      return 48;
    case 'tablet':
      return 48;
    case 'desktop':
    default:
      return 40;
  }
}

/**
 * Returns responsive column count for grids:
 * - Mobile: 1 column
 * - Tablet: 2 columns
 * - Desktop: default (3 columns)
 */
export function getResponsiveGridColumns(device: DeviceTier, defaultDesktopCols = 3): number {
  switch (device) {
    case 'mobile':
    case 'kiosk-portrait':
      return 1;
    case 'tablet':
      return 2;
    case 'kiosk-landscape':
    case 'desktop':
    default:
      return defaultDesktopCols;
  }
}

/**
 * Sets document attributes and CSS variable for typography
 */
export function applyDocumentFontStack(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--font-medical-sans', MEDICAL_FONT_STACK);
}

export interface ViewportAdapterState {
  width: number;
  height: number;
  deviceTier: DeviceTier;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isKiosk: boolean;
  isTouch: boolean;
  touchTargetMinSize: number;
}

/**
 * React Hook for real-time viewport adaptation
 */
export function useViewportAdapter(): ViewportAdapterState {
  const getSnapshot = useCallback((): ViewportAdapterState => {
    if (typeof window === 'undefined') {
      return {
        width: 1440,
        height: 900,
        deviceTier: 'desktop',
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isKiosk: false,
        isTouch: false,
        touchTargetMinSize: 40,
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const isTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    const deviceTier = detectDeviceTier(width, height, isTouch);

    return {
      width,
      height,
      deviceTier,
      isMobile: deviceTier === 'mobile',
      isTablet: deviceTier === 'tablet',
      isDesktop: deviceTier === 'desktop',
      isKiosk: deviceTier === 'kiosk-portrait' || deviceTier === 'kiosk-landscape',
      isTouch,
      touchTargetMinSize: getTouchTargetMinSize(deviceTier),
    };
  }, []);

  const [state, setState] = useState<ViewportAdapterState>(getSnapshot);

  useEffect(() => {
    applyDocumentFontStack();

    const handleResize = () => {
      setState(getSnapshot());
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [getSnapshot]);

  return state;
}
