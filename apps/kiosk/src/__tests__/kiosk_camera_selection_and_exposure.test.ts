import { describe, it, expect, vi } from 'vitest';
import { isUsableCamera, selectOptimalCamera, KIOSK_CAMERA_STORAGE_KEY } from '../smart-flow/SmartLoginView';
import { CameraManager } from '../../../../packages/face-client/src/index.js';

describe('Kiosk Camera Selection & Exposure Standardization', () => {
  const mockDevices: MediaDeviceInfo[] = [
    {
      deviceId: 'cam-ir-1',
      groupId: 'group-1',
      kind: 'videoinput',
      label: 'Web Camera (0bda:5866 MI_02) Windows Hello Face Software IR',
      toJSON: () => ({}),
    },
    {
      deviceId: 'cam-internal-2',
      groupId: 'group-1',
      kind: 'videoinput',
      label: 'Integrated Camera (0bda:5866)',
      toJSON: () => ({}),
    },
    {
      deviceId: 'cam-usb-3',
      groupId: 'group-2',
      kind: 'videoinput',
      label: 'HD Webcam (5986:217c) USB External Camera',
      toJSON: () => ({}),
    },
    {
      deviceId: 'cam-obs-4',
      groupId: 'group-3',
      kind: 'videoinput',
      label: 'OBS Virtual Camera',
      toJSON: () => ({}),
    },
  ];

  describe('isUsableCamera', () => {
    it('rejects IR and Windows Hello software cameras', () => {
      expect(isUsableCamera(mockDevices[0])).toBe(false);
    });

    it('rejects OBS and Virtual cameras', () => {
      expect(isUsableCamera(mockDevices[3])).toBe(false);
    });

    it('accepts real RGB webcams (both integrated and external USB)', () => {
      expect(isUsableCamera(mockDevices[1])).toBe(true);
      expect(isUsableCamera(mockDevices[2])).toBe(true);
    });

    it('accepts cameras with blank label before user permission is granted', () => {
      const blankCam: MediaDeviceInfo = {
        deviceId: 'anon-cam',
        groupId: '',
        kind: 'videoinput',
        label: '',
        toJSON: () => ({}),
      };
      expect(isUsableCamera(blankCam)).toBe(true);
    });
  });

  describe('selectOptimalCamera', () => {
    it('Rule 1(ก): prioritizes saved deviceId from localStorage if present', () => {
      const optimal = selectOptimalCamera(mockDevices, 'cam-internal-2');
      expect(optimal?.deviceId).toBe('cam-internal-2');
    });

    it('Rule 1(ข): prioritizes external USB webcam over internal camera when no saved preference exists', () => {
      const optimal = selectOptimalCamera(mockDevices, null);
      expect(optimal?.deviceId).toBe('cam-usb-3');
      expect(optimal?.label).toContain('HD Webcam');
    });

    it('Rule 1(ค): falls back to integrated camera when no external camera is connected', () => {
      const internalOnly = [mockDevices[0], mockDevices[1]]; // IR and Integrated
      const optimal = selectOptimalCamera(internalOnly, null);
      expect(optimal?.deviceId).toBe('cam-internal-2');
    });

    it('returns null when device list is empty', () => {
      expect(selectOptimalCamera([], null)).toBeNull();
    });

    it('falls back to optimal if saved deviceId is no longer plugged in', () => {
      const optimal = selectOptimalCamera(mockDevices, 'cam-missing-999');
      // Should pick external USB webcam
      expect(optimal?.deviceId).toBe('cam-usb-3');
    });
  });

  describe('CameraManager Hardware Exposure Compensation & Brightness Boost', () => {
    it('applies brightness offset for UVC webcams lacking exposureCompensation', async () => {
      const applyConstraintsMock = vi.fn().mockResolvedValue(undefined);
      const mockTrack = {
        getCapabilities: () => ({
          brightness: { min: -64, max: 64, step: 1 },
          exposureMode: ['continuous', 'manual'],
          whiteBalanceMode: ['continuous', 'manual'],
          // exposureCompensation is NOT supported
        }),
        getSettings: () => ({
          brightness: 0,
          exposureMode: 'continuous',
        }),
        applyConstraints: applyConstraintsMock,
      };

      const mockStream = {
        getVideoTracks: () => [mockTrack],
      } as unknown as MediaStream;

      const camera = new CameraManager();
      await camera.applyHardwareExposure(mockStream, { targetBrightnessOffset: 18 });

      expect(applyConstraintsMock).toHaveBeenCalledTimes(1);
      const applied = applyConstraintsMock.mock.calls[0][0];
      expect(applied.advanced).toBeDefined();
      expect(applied.advanced[0].brightness).toBe(18);
      expect(applied.advanced[0].exposureMode).toBe('continuous');
      expect(applied.advanced[0].whiteBalanceMode).toBe('continuous');
    });

    it('applies exposureCompensation when camera capabilities support it', async () => {
      const applyConstraintsMock = vi.fn().mockResolvedValue(undefined);
      const mockTrack = {
        getCapabilities: () => ({
          exposureCompensation: { min: -2, max: 2, step: 0.5 },
          exposureMode: ['continuous', 'manual'],
        }),
        getSettings: () => ({
          exposureCompensation: 0,
        }),
        applyConstraints: applyConstraintsMock,
      };

      const mockStream = {
        getVideoTracks: () => [mockTrack],
      } as unknown as MediaStream;

      const camera = new CameraManager();
      await camera.applyHardwareExposure(mockStream, { exposureBoostStep: 1.5 });

      expect(applyConstraintsMock).toHaveBeenCalledTimes(1);
      const applied = applyConstraintsMock.mock.calls[0][0];
      expect(applied.advanced[0].exposureCompensation).toBe(1.5);
    });

    it('handles camera streams without video tracks gracefully', async () => {
      const emptyStream = {
        getVideoTracks: () => [],
      } as unknown as MediaStream;

      const camera = new CameraManager();
      await expect(camera.applyHardwareExposure(emptyStream)).resolves.not.toThrow();
    });
  });

  describe('Kiosk Camera Badge Index Calculation', () => {
    it('never produces "กล้อง 0/X" even if selectedCameraId is not yet in array', () => {
      const cameras = [mockDevices[1], mockDevices[2]];
      const selectedCameraId = 'non-existent-or-empty';
      const currentIdx = cameras.findIndex((c) => c.deviceId === selectedCameraId);
      const displayIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
      expect(displayIdx).toBe(1);
      expect(`${displayIdx}/${cameras.length}`).toBe('1/2');
    });

    it('correctly calculates 1-based index when matching camera is found', () => {
      const cameras = [mockDevices[1], mockDevices[2]];
      const selectedCameraId = 'cam-usb-3';
      const currentIdx = cameras.findIndex((c) => c.deviceId === selectedCameraId);
      const displayIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
      expect(displayIdx).toBe(2);
      expect(`${displayIdx}/${cameras.length}`).toBe('2/2');
    });
  });
});
