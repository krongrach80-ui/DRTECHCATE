/**
 * packages/face-client/src/camera.ts
 * Camera capture and frame rotation management per Master Prompt v3 Section 7.1 (Line 184)
 * Architecture Invariant: Rotation is applied via canvas pixel manipulation, NEVER CSS alone.
 */

export interface CameraOptions {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  rotation?: 0 | 90 | 180 | 270;
  mirror?: boolean;
}

export class CameraManager {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rotation: 0 | 90 | 180 | 270 = 0;
  private mirror: boolean = false;

  constructor(private options: CameraOptions = {}) {
    this.rotation = options.rotation || 0;
    this.mirror = options.mirror ?? true;
  }

  public async start(videoElement?: HTMLVideoElement): Promise<MediaStream> {
    // 1. Enforce HTTPS check (or localhost in development)
    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!window.isSecureContext && !isLocalhost) {
        throw new Error('Camera access requires HTTPS or localhost context');
      }
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Camera API (mediaDevices.getUserMedia) is not supported in this environment');
    }

    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: this.options.width || 1280 },
        height: { ideal: this.options.height || 720 },
        facingMode: this.options.facingMode || 'user',
      },
      audio: false,
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error('Camera permission was denied by the user or hospital kiosk policy');
      }
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error('No camera hardware was detected on this kiosk terminal');
      }
      throw new Error(`Failed to initialize camera: ${error.message}`);
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
   * Captures the current video frame onto an HTMLCanvasElement with actual pixel rotation.
   * Master Prompt Rule: Sends rotated canvas into model, NOT CSS transform.
   */
  public captureRotatedFrame(sourceVideo?: HTMLVideoElement): HTMLCanvasElement {
    const video = sourceVideo || this.video;
    if (!video || video.readyState < 2) {
      throw new Error('Video stream is not ready for frame capture');
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    if (!this.canvas) {
      this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : ({} as HTMLCanvasElement);
    }

    const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
    const targetWidth = isRotated90or270 ? vh : vw;
    const targetHeight = isRotated90or270 ? vw : vh;

    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;

    if (this.canvas.getContext) {
      this.ctx = this.canvas.getContext('2d');
    }

    if (this.ctx) {
      this.ctx.save();
      // Translate to center
      this.ctx.translate(targetWidth / 2, targetHeight / 2);

      // Apply true pixel rotation
      if (this.rotation !== 0) {
        this.ctx.rotate((this.rotation * Math.PI) / 180);
      }

      // Draw rotated image centered
      const drawW = isRotated90or270 ? targetHeight : targetWidth;
      const drawH = isRotated90or270 ? targetWidth : targetHeight;
      this.ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
      this.ctx.restore();
    }

    return this.canvas;
  }

  public setRotation(rotation: 0 | 90 | 180 | 270): void {
    this.rotation = rotation;
  }

  public getRotation(): number {
    return this.rotation;
  }
}
