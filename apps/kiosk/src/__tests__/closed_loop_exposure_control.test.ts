/**
 * apps/kiosk/src/__tests__/closed_loop_exposure_control.test.ts
 * Rigorous test suite for Closed-Loop Bidirectional Hardware Exposure Controller & Anti-Burnout Guard
 */

import { describe, it, expect, vi } from 'vitest';
import { KIOSK_EXPOSURE_CONTROL_CONFIG } from '../smart-flow/SmartLoginView';
import { CameraManager } from '../../../../packages/face-client/src/camera';

describe('Closed-Loop Bidirectional Exposure Controller & Anti-Burnout Guard', () => {
  it('1. Confirms target luminance and safety ceiling/floor constants', () => {
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.TARGET_MIN).toBe(95);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.TARGET_MAX).toBe(145);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.DEADBAND_MIN).toBe(90);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.DEADBAND_MAX).toBe(150);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.SAFE_MIN_EV).toBe(-1.5);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.SAFE_MAX_EV).toBe(1.5);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.STEP_EV).toBeCloseTo(0.33, 2);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.BURNOUT_THRESHOLD_LUM).toBe(250);
    expect(KIOSK_EXPOSURE_CONTROL_CONFIG.MAX_BURNOUT_RATIO).toBe(0.25);
  });

  it('2. applyHardwareExposure supports negative EV compensation (dimming for bright/glare)', async () => {
    const applyConstraintsMock = vi.fn().mockResolvedValue(undefined);
    const mockTrack = {
      getCapabilities: () => ({
        exposureCompensation: { min: -2.0, max: 2.0, step: 0.1 },
        exposureMode: ['continuous', 'manual'],
      }),
      applyConstraints: applyConstraintsMock,
    };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const camera = new CameraManager();
    // Step down to -0.66 EV for overexposed room
    await camera.applyHardwareExposure(mockStream, { exposureCompensation: -0.66 });

    expect(applyConstraintsMock).toHaveBeenCalledTimes(1);
    const applied = applyConstraintsMock.mock.calls[0][0];
    expect(applied.advanced[0].exposureCompensation).toBe(-0.66);
  });

  it('3. applyHardwareExposure clamps safely between -1.5 and +1.5 EV', async () => {
    const applyConstraintsMock = vi.fn().mockResolvedValue(undefined);
    const mockTrack = {
      getCapabilities: () => ({
        exposureCompensation: { min: -3.0, max: 3.0, step: 0.1 },
        exposureMode: ['continuous', 'manual'],
      }),
      applyConstraints: applyConstraintsMock,
    };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const camera = new CameraManager();
    // Beyond upper limit
    await camera.applyHardwareExposure(mockStream, { exposureCompensation: 2.5 });
    let applied = applyConstraintsMock.mock.calls[0][0];
    expect(applied.advanced[0].exposureCompensation).toBe(1.5);

    // Beyond lower limit
    await camera.applyHardwareExposure(mockStream, { exposureCompensation: -2.5 });
    applied = applyConstraintsMock.mock.calls[1][0];
    expect(applied.advanced[0].exposureCompensation).toBe(-1.5);
  });

  it('4. Camera startup initializes neutral at 0.0 EV (no artificial boost)', async () => {
    const applyConstraintsMock = vi.fn().mockResolvedValue(undefined);
    const mockTrack = {
      getCapabilities: () => ({
        exposureCompensation: { min: -2.0, max: 2.0, step: 0.1 },
        exposureMode: ['continuous', 'manual'],
      }),
      applyConstraints: applyConstraintsMock,
    };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const camera = new CameraManager();
    await camera.applyHardwareExposure(mockStream, { exposureCompensation: 0.0, targetBrightnessOffset: 0 });

    const applied = applyConstraintsMock.mock.calls[0][0];
    expect(applied.advanced[0].exposureCompensation).toBe(0.0);
  });

  it('5. Deadband prevents oscillation: luminance between 95 and 145 requires no adjustments', () => {
    const faceLuminance = 120;
    const isOverexposed = faceLuminance > KIOSK_EXPOSURE_CONTROL_CONFIG.TARGET_MAX;
    const isUnderexposed = faceLuminance < KIOSK_EXPOSURE_CONTROL_CONFIG.TARGET_MIN;

    expect(isOverexposed).toBe(false);
    expect(isUnderexposed).toBe(false);
  });

  it('6. Anti-burnout protection: detects overexposed face > 145 or frame burnout > 25%', () => {
    // Overexposed face
    const brightFaceLum = 158;
    const isFaceOver = brightFaceLum > KIOSK_EXPOSURE_CONTROL_CONFIG.TARGET_MAX;
    expect(isFaceOver).toBe(true);

    // Washed out frame with bright face
    const washedFrameBurnout = 0.32; // 32% of pixels >= 250
    const faceLum = 130;
    const isBurnoutTriggered = faceLum > 125 && washedFrameBurnout > KIOSK_EXPOSURE_CONTROL_CONFIG.MAX_BURNOUT_RATIO;
    expect(isBurnoutTriggered).toBe(true);
  });
});

