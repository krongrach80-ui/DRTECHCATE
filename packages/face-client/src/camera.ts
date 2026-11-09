/**
 * packages/face-client/src/camera.ts
 * Camera capture and frame rotation management per Master Prompt v3 Section 7.1.5 (Line 184)
 * Architecture Invariant:
 * - Rotation is applied via canvas pixel manipulation, NEVER CSS alone.
 * - STRICT RULE: Never mirror (ctx.scale(-1, 1)) on the canvas sent to face detection/models,
 *   as mirroring inverts left/right yaw and invalidates head pose tracking.
 * - Mirroring is strictly for user preview display canvas only.
 */

export interface CameraOptions {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  rotation?: 0 | 90 | 180 | 270;
  mirror?: boolean;
  kioskLockConstraints?: boolean;
  deviceId?: string;
  aspectRatio?: number;
}

export class CameraManager {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rotation: 0 | 90 | 180 | 270 = 0;
  private mirrorPreview: boolean = true;
  private options: CameraOptions = {};

  constructor(options: CameraOptions = {}) {
    this.options = options;
    this.rotation = options.rotation || 0;
    this.mirrorPreview = options.mirror ?? true;
  }

  public async start(videoElement?: HTMLVideoElement, startOptions?: CameraOptions): Promise<MediaStream> {
    // 1. Enforce HTTPS check (or localhost in development)
    if (typeof window !== 'undefined') {
      const isLocalhost =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!window.isSecureContext && !isLocalhost) {
        throw new Error('Camera access requires HTTPS or localhost context');
      }
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Camera API (mediaDevices.getUserMedia) is not supported in this environment');
    }

    const effectiveOptions = { ...this.options, ...startOptions };
    const isKioskLock = Boolean(effectiveOptions.kioskLockConstraints);
    const targetWidth = effectiveOptions.width || (isKioskLock ? 640 : 1280);
    const targetHeight = effectiveOptions.height || (isKioskLock ? 480 : 720);

    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: targetWidth },
        height: { ideal: targetHeight },
        frameRate: { ideal: 30 },
        facingMode: effectiveOptions.deviceId ? undefined : (effectiveOptions.facingMode || 'user'),
        ...(effectiveOptions.deviceId ? { deviceId: { exact: effectiveOptions.deviceId } } : {}),
        ...(effectiveOptions.aspectRatio ? { aspectRatio: { ideal: effectiveOptions.aspectRatio } } : {}),
      },
      audio: false,
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: unknown) {
      // If exact deviceId failed (e.g. OverconstrainedError), fallback to ideal deviceId
      if (effectiveOptions.deviceId) {
        try {
          const fallbackConstraints: MediaStreamConstraints = {
            video: {
              width: { ideal: targetWidth },
              height: { ideal: targetHeight },
              frameRate: { ideal: 30 },
              deviceId: { ideal: effectiveOptions.deviceId },
              ...(effectiveOptions.aspectRatio ? { aspectRatio: { ideal: effectiveOptions.aspectRatio } } : {}),
            },
            audio: false,
          };
          this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        } catch {
          // fall through to standard error handling
        }
      }

      if (!this.stream) {
        const error = err as Error;
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw new Error('Camera permission was denied by the user or hospital kiosk policy');
        }
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          throw new Error('No camera hardware was detected on this kiosk terminal');
        }
        throw new Error(`Failed to initialize camera: ${error.message}`);
      }
    }

    // Hardware exposure and backlight compensation for kiosks facing windows
    try {
      await this.applyHardwareExposure(this.stream);
    } catch {
      // non-blocking
    }

    // Hardware zoom & autofocus lock (Dedicated for kiosk face scan; non-breaking on unsupported webcams)
    if (isKioskLock) {
      try {
        await this.applyHardwareKioskLock(this.stream);
      } catch {
        // non-blocking
      }
    }

    if (videoElement) {
      this.video = videoElement;
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
    }

    return this.stream;
  }

  public stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  /**
   * Attempts hardware MediaStreamTrack exposure, brightness and backlight compensation.
   * Automatically adapts to device capabilities (exposureCompensation or brightness/contrast)
   * and clamps within safe bounds.
   */
  public async applyHardwareExposure(
    mediaStream?: MediaStream | null,
    options?: { exposureBoostStep?: number; targetBrightnessOffset?: number }
  ): Promise<boolean> {
    const stream = mediaStream || this.stream;
    if (!stream) return false;
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return false;

      const capabilities: any = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : {};
      const advancedConstraint: any = {};
      let hasAdvanced = false;

      // 1. Exposure mode: continuous
      if (capabilities.exposureMode && Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
        advancedConstraint.exposureMode = 'continuous';
        hasAdvanced = true;
      }

      // 2. White balance mode: continuous
      if (capabilities.whiteBalanceMode && Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
        advancedConstraint.whiteBalanceMode = 'continuous';
        hasAdvanced = true;
      }

      // 3. Hardware exposure compensation (EV stops) - Optimal method for UVC webcams
      if (capabilities.exposureCompensation) {
        const minComp = typeof capabilities.exposureCompensation.min === 'number' ? capabilities.exposureCompensation.min : -2.0;
        const maxComp = typeof capabilities.exposureCompensation.max === 'number' ? capabilities.exposureCompensation.max : 2.0;
        const targetComp = typeof options?.exposureBoostStep === 'number' ? options.exposureBoostStep : 1.2;
        // Clamp to safe ceiling (+1.5 EV or device max)
        const safeMax = Math.min(maxComp, 1.5);
        advancedConstraint.exposureCompensation = Math.max(minComp, Math.min(targetComp, safeMax));
        hasAdvanced = true;
      }

      // 4. Hardware brightness (For UVC webcams, e.g. Sunplus, Realtek, Logitech)
      // Range can be [0, 255] (midpoint 128), [-64, 64] (midpoint 0), or [0, 100] (midpoint 50)
      if (capabilities.brightness && typeof capabilities.brightness.min === 'number' && typeof capabilities.brightness.max === 'number') {
        const minB = capabilities.brightness.min;
        const maxB = capabilities.brightness.max;
        const spanB = maxB - minB;
        if (spanB > 0) {
          const midB = minB + spanB / 2;
          const currentSettings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : ({} as any);
          // Only trust currentSettings.brightness if it's a realistic value above 20% of range (avoid undefined or 0 fallback)
          const curB = (typeof currentSettings.brightness === 'number' && currentSettings.brightness > minB + spanB * 0.20)
            ? currentSettings.brightness
            : midB;

          // Scale offset proportionally to device span (normalized against standard 128-unit span)
          const rawOffset = typeof options?.targetBrightnessOffset === 'number' ? options.targetBrightnessOffset : 18;
          const scaleFactor = spanB / 128.0;
          const boostAmount = rawOffset * scaleFactor;

          // Safe upper clamp: never exceed 85% of span to prevent blowing out highlights
          const safeMaxB = Math.round(minB + spanB * 0.85);
          const targetB = Math.max(minB, Math.min(Math.round(curB + boostAmount), safeMaxB));

          advancedConstraint.brightness = targetB;
          hasAdvanced = true;
        }
      }

      // 5. Hardware contrast: maintain natural balanced midpoint to prevent shadow crushing
      if (capabilities.contrast && typeof capabilities.contrast.min === 'number' && typeof capabilities.contrast.max === 'number') {
        const minC = capabilities.contrast.min;
        const maxC = capabilities.contrast.max;
        const spanC = maxC - minC;
        if (spanC > 0) {
          const midC = minC + spanC / 2;
          const currentSettings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : ({} as any);
          const curC = (typeof currentSettings.contrast === 'number' && currentSettings.contrast > minC + spanC * 0.20)
            ? currentSettings.contrast
            : midC;
          advancedConstraint.contrast = Math.round(Math.max(minC, Math.min(curC, maxC)));
          hasAdvanced = true;
        }
      }

      if (hasAdvanced && typeof videoTrack.applyConstraints === 'function') {
        await videoTrack.applyConstraints({
          advanced: [advancedConstraint],
        } as any);
        return true;
      }
    } catch {
      // Hardware constraints not supported by browser/device; fallback gracefully
    }
    return false;
  }

  /**
   * Locks camera zoom to minimum and stabilizes focus to prevent lens breathing / auto-zooming.
   * Only applied when hardware capabilities support it; wrapped in try-catch to guarantee zero failure.
   */
  public async applyHardwareKioskLock(mediaStream?: MediaStream | null): Promise<boolean> {
    const stream = mediaStream || this.stream;
    if (!stream) return false;
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return false;

      const capabilities: any = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : {};
      const advancedConstraint: any = {};
      let hasAdvanced = false;

      // 1. Lock zoom to minimum (1.0 or capabilities.zoom.min) to prevent digital zooming/cropping
      if (capabilities.zoom) {
        const minZoom = typeof capabilities.zoom.min === 'number' ? capabilities.zoom.min : 1.0;
        advancedConstraint.zoom = minZoom;
        hasAdvanced = true;
      }

      // 2. Prevent autofocus hunting/lens breathing:
      // If manual focus is supported, lock focus distance to normal kiosk standing range (~0.6m)
      if (capabilities.focusMode && Array.isArray(capabilities.focusMode)) {
        if (capabilities.focusMode.includes('manual')) {
          advancedConstraint.focusMode = 'manual';
          if (capabilities.focusDistance && typeof capabilities.focusDistance.min === 'number') {
            const minD = capabilities.focusDistance.min;
            const maxD = capabilities.focusDistance.max;
            advancedConstraint.focusDistance = Math.max(minD, Math.min(0.65, maxD));
          }
          hasAdvanced = true;
        } else if (capabilities.focusMode.includes('continuous')) {
          advancedConstraint.focusMode = 'continuous';
          hasAdvanced = true;
        }
      }

      if (hasAdvanced && typeof videoTrack.applyConstraints === 'function') {
        await videoTrack.applyConstraints({
          advanced: [advancedConstraint],
        } as any);
        return true;
      }
    } catch {
      // Hardware constraints not supported by browser/device; fallback gracefully
    }
    return false;
  }

  /**
   * Retrieves active MediaStreamTrack for camera telemetry & capabilities inspection.
   */
  public getVideoTrack(): MediaStreamTrack | null {
    if (!this.stream) return null;
    return this.stream.getVideoTracks()[0] || null;
  }

  /**
   * Returns current active settings (resolution, frameRate, aspectRatio, etc.).
   */
  public getSettings(): MediaTrackSettings | null {
    const track = this.getVideoTrack();
    if (!track || typeof track.getSettings !== 'function') return null;
    return track.getSettings();
  }

  /**
   * Returns hardware capabilities (zoom min/max, focus modes, resolution boundaries).
   */
  public getCapabilities(): any {
    const track = this.getVideoTrack();
    if (!track || typeof track.getCapabilities !== 'function') return {};
    try {
      return track.getCapabilities();
    } catch {
      return {};
    }
  }

  /**
   * Enumerates all video input cameras connected to the terminal.
   */
  public async getAvailableVideoDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator?.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  /**
   * Applies hardware optical or digital zoom if supported by the camera device.
   */
  public async applyHardwareZoom(targetZoom: number): Promise<boolean> {
    const track = this.getVideoTrack();
    if (!track) return false;
    try {
      const capabilities: any = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
      if (capabilities.zoom) {
        const minZ = typeof capabilities.zoom.min === 'number' ? capabilities.zoom.min : 1.0;
        const maxZ = typeof capabilities.zoom.max === 'number' ? capabilities.zoom.max : 1.0;
        const clampedZoom = Math.max(minZ, Math.min(targetZoom, maxZ));
        await track.applyConstraints({
          advanced: [{ zoom: clampedZoom }],
        } as any);
        return true;
      }
    } catch {
      // Hardware zoom constraint failed or unsupported; fallback to software ROI
    }
    return false;
  }

  /**
   * Captures the current video frame onto an HTMLCanvasElement with actual pixel rotation.
   * STRICT SPEC INVARIANT (Spec 7.1.5):
   * Do NOT apply mirror (ctx.scale(-1, 1)) on this canvas. It is passed into detection models.
   */
  public captureRotatedFrame(sourceVideo?: HTMLVideoElement): HTMLCanvasElement {
    const video = sourceVideo || this.video;
    if (!video || video.readyState < 2) {
      throw new Error('Video stream is not ready for frame capture');
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    if (!this.canvas) {
      this.canvas =
        typeof document !== 'undefined'
          ? document.createElement('canvas')
          : ({} as HTMLCanvasElement);
    }

    const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
    const targetWidth = isRotated90or270 ? vh : vw;
    const targetHeight = isRotated90or270 ? vw : vh;

    // Invariant: ONLY update canvas dimensions when width/height actually changes
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    if (this.canvas.getContext) {
      this.ctx = this.canvas.getContext('2d');
    }

    if (this.ctx) {
      this.ctx.save();
      // Translate to center
      this.ctx.translate(targetWidth / 2, targetHeight / 2);

      // Apply true pixel rotation (NO mirror!)
      if (this.rotation !== 0) {
        this.ctx.rotate((this.rotation * Math.PI) / 180);
      }

      // Draw original unmirrored video centered
      this.ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
      this.ctx.restore();
    }

    return this.canvas;
  }

  /**
   * Renders preview frame for patient/staff UI display on screen.
   * Can be mirrored for natural user experience without affecting model input.
   */
  public renderPreview(
    previewCanvas: HTMLCanvasElement,
    sourceVideo?: HTMLVideoElement,
    mirrorOverride?: boolean
  ): void {
    const video = sourceVideo || this.video;
    if (!video || video.readyState < 2) return;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
    const targetWidth = isRotated90or270 ? vh : vw;
    const targetHeight = isRotated90or270 ? vw : vh;

    // Invariant: ONLY update canvas dimensions when width/height actually changes
    // Mutating canvas.width or canvas.height on every frame flushes the GPU backing store buffer and causes severe stutter
    if (previewCanvas.width !== targetWidth || previewCanvas.height !== targetHeight) {
      previewCanvas.width = targetWidth;
      previewCanvas.height = targetHeight;
    }

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const shouldMirror = mirrorOverride ?? this.mirrorPreview;

    ctx.save();
    ctx.translate(targetWidth / 2, targetHeight / 2);

    if (shouldMirror) {
      ctx.scale(-1, 1);
    }

    if (this.rotation !== 0) {
      ctx.rotate((this.rotation * Math.PI) / 180);
    }

    ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    ctx.restore();
  }

  public setRotation(rotation: 0 | 90 | 180 | 270): void {
    this.rotation = rotation;
  }

  public getRotation(): 0 | 90 | 180 | 270 {
    return this.rotation;
  }

  public setMirrorPreview(mirror: boolean): void {
    this.mirrorPreview = mirror;
  }
}
