/**
 * packages/hospital-ui-kit/src/__tests__/responsive_viewport_v7.test.ts
 * Master Prompt v7: Universal Adaptive Responsive Engine & Embedded Thai-Latin Typography Tests
 * Strictly Isolated Presentation & Viewport Layer (Zero Backend / Core Mutation)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectDeviceTier,
  calculateFluidFontSize,
  getTouchTargetMinSize,
  getResponsiveGridColumns,
  applyDocumentFontStack,
  MEDICAL_FONT_STACK,
  FLUID_TYPOGRAPHY_DEFINITIONS,
} from '../responsive/viewportAdapter';

describe('Universal Adaptive Responsive Engine & Embedded Thai-Latin Typography (Master Prompt v7)', () => {
  describe('1. 4-Tier Universal Device Adaptation Engine (detectDeviceTier)', () => {
    it('should detect smartphone portrait as "mobile" (< 768px)', () => {
      const tier = detectDeviceTier(375, 667, true);
      expect(tier).toBe('mobile');
    });

    it('should detect smartphone landscape as "mobile" (< 768px)', () => {
      const tier = detectDeviceTier(667, 375, true);
      expect(tier).toBe('mobile');
    });

    it('should detect tablet / iPad in portrait as "tablet" (768px - 1024px)', () => {
      const tier = detectDeviceTier(768, 1024, true);
      expect(tier).toBe('tablet');
    });

    it('should detect tablet / iPad in landscape as "tablet" (768px - 1024px)', () => {
      const tier = detectDeviceTier(1024, 768, true);
      expect(tier).toBe('tablet');
    });

    it('should detect physical Touchscreen Kiosk portrait (1080x1920 with touch)', () => {
      const tier = detectDeviceTier(1080, 1920, true);
      expect(tier).toBe('kiosk-portrait');
    });

    it('should detect physical Touchscreen Kiosk landscape (1920x1080 with touch)', () => {
      const tier = detectDeviceTier(1920, 1080, true);
      expect(tier).toBe('kiosk-landscape');
    });

    it('should detect desktop computer without touch as "desktop" (> 1024px)', () => {
      const tier = detectDeviceTier(1440, 900, false);
      expect(tier).toBe('desktop');
    });

    it('should detect large 4K / Ultrawide desktop as "desktop"', () => {
      const tier = detectDeviceTier(2560, 1440, false);
      expect(tier).toBe('desktop');
    });
  });

  describe('2. Touch-Friendly Target Dimensions (getTouchTargetMinSize)', () => {
    it('should enforce 56px minimum touch target for touchscreen kiosks (elderly & patients)', () => {
      expect(getTouchTargetMinSize('kiosk-portrait')).toBe(56);
      expect(getTouchTargetMinSize('kiosk-landscape')).toBe(56);
    });

    it('should enforce 48px minimum touch target for mobile smartphones and tablets', () => {
      expect(getTouchTargetMinSize('mobile')).toBe(48);
      expect(getTouchTargetMinSize('tablet')).toBe(48);
    });

    it('should maintain standard 40px minimum target on desktop mice/pointers', () => {
      expect(getTouchTargetMinSize('desktop')).toBe(40);
    });
  });

  describe('3. Responsive Card & Form Grids Adaptation (getResponsiveGridColumns)', () => {
    it('should collapse cards to 1 column on mobile and kiosk-portrait', () => {
      expect(getResponsiveGridColumns('mobile')).toBe(1);
      expect(getResponsiveGridColumns('kiosk-portrait')).toBe(1);
    });

    it('should adapt cards to 2 columns on tablet / iPad devices', () => {
      expect(getResponsiveGridColumns('tablet')).toBe(2);
    });

    it('should maintain 3 columns (or default) on desktop and kiosk-landscape', () => {
      expect(getResponsiveGridColumns('desktop')).toBe(3);
      expect(getResponsiveGridColumns('kiosk-landscape')).toBe(3);
      expect(getResponsiveGridColumns('desktop', 4)).toBe(4);
    });
  });

  describe('4. Unified Embedded Thai Medical Typography & Fluid Clamp Scaling', () => {
    it('should include Prompt, Inter, and Sarabun in the global medical font stack', () => {
      expect(MEDICAL_FONT_STACK).toContain('Prompt');
      expect(MEDICAL_FONT_STACK).toContain('Inter');
      expect(MEDICAL_FONT_STACK).toContain('Sarabun');
    });

    it('should define precise fluid clamp typography bounds for H1, H2, Body, Button', () => {
      // H1: clamp(1.35rem, 2.2vw + 0.5rem, 2.25rem)
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h1.minRem).toBe(1.35);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h1.maxRem).toBe(2.25);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h1.vwRate).toBe(2.2);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h1.baseRem).toBe(0.5);

      // H2: clamp(1.15rem, 1.6vw + 0.4rem, 1.65rem)
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h2.minRem).toBe(1.15);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h2.maxRem).toBe(1.65);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h2.vwRate).toBe(1.6);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.h2.baseRem).toBe(0.4);

      // Body & Button: clamp(0.875rem, 0.9vw + 0.3rem, 1.05rem)
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.body.minRem).toBe(0.875);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.body.maxRem).toBe(1.05);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.button.minRem).toBe(0.875);
      expect(FLUID_TYPOGRAPHY_DEFINITIONS.button.maxRem).toBe(1.05);
    });

    it('should calculate clamped H1 font size accurately across viewports', () => {
      const baseFontSize = 16;
      const minH1Px = 1.35 * baseFontSize; // 21.6px
      const maxH1Px = 2.25 * baseFontSize; // 36.0px

      // On narrow mobile (320px): clamped to min
      const mobileH1 = calculateFluidFontSize('h1', 320, baseFontSize);
      expect(mobileH1).toBe(minH1Px);

      // On wide desktop (1920px): clamped to max
      const desktopH1 = calculateFluidFontSize('h1', 1920, baseFontSize);
      expect(desktopH1).toBe(maxH1Px);

      // On tablet (900px): fluid in-between
      const tabletH1 = calculateFluidFontSize('h1', 900, baseFontSize);
      // (2.2 / 100) * 900 + 0.5 * 16 = 19.8 + 8 = 27.8px
      expect(tabletH1).toBe(27.8);
      expect(tabletH1).toBeGreaterThanOrEqual(minH1Px);
      expect(tabletH1).toBeLessThanOrEqual(maxH1Px);
    });

    it('should calculate clamped Body and Button font size accurately across viewports', () => {
      const baseFontSize = 16;
      const minBodyPx = 0.875 * baseFontSize; // 14.0px
      const maxBodyPx = 1.05 * baseFontSize; // 16.8px

      const mobileBody = calculateFluidFontSize('body', 360, baseFontSize);
      expect(mobileBody).toBe(minBodyPx);

      const desktopBody = calculateFluidFontSize('body', 1600, baseFontSize);
      expect(desktopBody).toBe(maxBodyPx);

      const tabletBody = calculateFluidFontSize('body', 800, baseFontSize);
      // (0.9 / 100) * 800 + 0.3 * 16 = 7.2 + 4.8 = 12.0px -> clamped to min 14.0px
      expect(tabletBody).toBe(minBodyPx);
    });

    it('should apply CSS variable --font-medical-sans to documentElement when present', () => {
      const mockSetProperty = vi.fn();
      const originalDoc = global.document;

      // Mock document for testing DOM environment
      (global as unknown as { document: unknown }).document = {
        documentElement: {
          style: {
            setProperty: mockSetProperty,
          },
        },
      };

      applyDocumentFontStack();
      expect(mockSetProperty).toHaveBeenCalledWith(
        '--font-medical-sans',
        expect.stringContaining('Prompt')
      );

      // Restore document
      (global as unknown as { document: unknown }).document = originalDoc;
    });
  });
});
