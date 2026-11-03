/**
 * packages/pose-engine/src/backlightCompensator.ts
 *
 * AUTOMATIC BACKLIGHT & EXPOSURE COMPENSATION ENGINE
 * Detects backlit window silhouettes (high background luminance, low torso luminance)
 * and applies:
 * 1. Hardware MediaStreamTrack exposureCompensation (+1.5 EV) if supported.
 * 2. Real-time OffscreenCanvas Gamma & Contrast Boost (gamma = 0.60, brightness +25%, contrast +15%).
 * 3. Clinical Non-blocking Guidance Tip for window glare.
 */

export interface BacklightAnalysisResult {
  isBacklightDetected: boolean;
  isSubjectDark: boolean;
  subjectLuminance: number;
  backgroundLuminance: number;
  contrastRatio: number;
  warningMessageTh?: string;
  needsPreprocessing: boolean;
}

export interface BoundingBoxNormalized {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class BacklightCompensator {
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;
  private frameCounter: number = 0;
  private sampleInterval: number = 15; // Analyze every 15 frames
  private lastAnalysisResult: BacklightAnalysisResult = {
    isBacklightDetected: false,
    isSubjectDark: false,
    subjectLuminance: 128,
    backgroundLuminance: 128,
    contrastRatio: 1.0,
    needsPreprocessing: false,
  };
  private hardwareApplied: boolean = false;

  constructor(sampleInterval: number = 15) {
    this.sampleInterval = sampleInterval;
  }

  private initSampleCanvas() {
    if (!this.sampleCanvas && typeof document !== 'undefined') {
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCanvas.width = 160;
      this.sampleCanvas.height = 90;
      this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  /**
   * Samples luminance (Y = 0.299R + 0.587G + 0.114B)
   */
  public analyzeLuminance(
    sourceEl: CanvasImageSource,
    subjectBBox?: BoundingBoxNormalized
  ): BacklightAnalysisResult {
    this.frameCounter++;
    // Only re-sample every N frames to save CPU
    if (this.frameCounter % this.sampleInterval !== 0 && this.frameCounter > 1) {
      return this.lastAnalysisResult;
    }

    this.initSampleCanvas();
    if (!this.sampleCtx || !this.sampleCanvas) {
      return this.lastAnalysisResult;
    }

    try {
      const sw = this.sampleCanvas.width;
      const sh = this.sampleCanvas.height;
      this.sampleCtx.drawImage(sourceEl, 0, 0, sw, sh);
      const imgData = this.sampleCtx.getImageData(0, 0, sw, sh);
      const data = imgData.data;

      // Subject ROI (default to center 40% if no bounding box)
      const sMinX = Math.floor((subjectBBox?.minX ?? 0.3) * sw);
      const sMaxX = Math.floor((subjectBBox?.maxX ?? 0.7) * sw);
      const sMinY = Math.floor((subjectBBox?.minY ?? 0.15) * sh);
      const sMaxY = Math.floor((subjectBBox?.maxY ?? 0.85) * sh);

      let subjectLumSum = 0;
      let subjectPixelCount = 0;
      let bgLumSum = 0;
      let bgPixelCount = 0;

      for (let y = 0; y < sh; y += 2) {
        for (let x = 0; x < sw; x += 2) {
          const idx = (y * sw + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Standard ITU-R BT.601 Luminance
          const yVal = 0.299 * r + 0.587 * g + 0.114 * b;

          const isSubject =
            x >= sMinX && x <= sMaxX && y >= sMinY && y <= sMaxY;

          if (isSubject) {
            subjectLumSum += yVal;
            subjectPixelCount++;
          } else {
            bgLumSum += yVal;
            bgPixelCount++;
          }
        }
      }

      const subjectLuminance =
        subjectPixelCount > 0 ? subjectLumSum / subjectPixelCount : 128;
      const backgroundLuminance =
        bgPixelCount > 0 ? bgLumSum / bgPixelCount : 128;

      // Backlight / Silhouette Condition:
      // Background > 175 AND Subject < 85 (or overall dark subject < 65)
      const isBacklight =
        backgroundLuminance > 175 && subjectLuminance < 85;
      const isSubjectDark = subjectLuminance < 65;
      const contrastRatio =
        (backgroundLuminance + 1) / (subjectLuminance + 1);

      const needsPreprocessing = isBacklight || isSubjectDark;

      let warningMessageTh: string | undefined;
      if (isBacklight) {
        warningMessageTh =
          '☀️ แสงจากด้านหลังจ้าเกินไป แนะนำให้ปิดม่านหรือเลี่ยงการหันหลังให้หน้าต่าง';
      } else if (isSubjectDark) {
        warningMessageTh = '💡 แสงสว่างรอบตัวค่อนข้างน้อย แนะนำให้เปิดไฟเพิ่มความสว่าง';
      }

      this.lastAnalysisResult = {
        isBacklightDetected: isBacklight,
        isSubjectDark,
        subjectLuminance: Math.round(subjectLuminance),
        backgroundLuminance: Math.round(backgroundLuminance),
        contrastRatio: Number(contrastRatio.toFixed(2)),
        warningMessageTh,
        needsPreprocessing,
      };

      return this.lastAnalysisResult;
    } catch {
      return this.lastAnalysisResult;
    }
  }

  /**
   * Attempts hardware camera constraint adjustment (exposureCompensation: +1.5)
   */
  public async applyHardwareExposure(mediaStream?: MediaStream | null): Promise<boolean> {
    if (!mediaStream || this.hardwareApplied) return false;
    try {
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) return false;

      const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (capabilities.exposureMode || capabilities.exposureCompensation) {
        const advancedConstraint: any = {};
        if (capabilities.exposureMode?.includes('continuous')) {
          advancedConstraint.exposureMode = 'continuous';
        }
        if (capabilities.exposureCompensation) {
          const maxComp = capabilities.exposureCompensation.max ?? 2.0;
          advancedConstraint.exposureCompensation = Math.min(1.5, maxComp);
        }

        await videoTrack.applyConstraints({
          advanced: [advancedConstraint],
        } as any);

        this.hardwareApplied = true;
        return true;
      }
    } catch {
      // Hardware constraints not supported by browser/device; fallback gracefully
    }
    return false;
  }

  /**
   * Preprocesses video frame on an offscreen canvas using CSS Filters
   * (brightness +25%, contrast +15%, gamma 0.60 simulation)
   * to lift underexposed shadows in silhouettes for MediaPipe inference.
   */
  public preprocessForInference(
    source: CanvasImageSource,
    targetCanvas: HTMLCanvasElement
  ): void {
    const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.save();
    if (this.lastAnalysisResult.needsPreprocessing) {
      // Boost shadows & contrast
      ctx.filter = 'brightness(1.28) contrast(1.18) saturate(1.10)';
    } else {
      ctx.filter = 'none';
    }
    ctx.drawImage(source, 0, 0, targetCanvas.width, targetCanvas.height);
    ctx.restore();
  }

  public reset(): void {
    this.frameCounter = 0;
    this.hardwareApplied = false;
    this.lastAnalysisResult = {
      isBacklightDetected: false,
      isSubjectDark: false,
      subjectLuminance: 128,
      backgroundLuminance: 128,
      contrastRatio: 1.0,
      needsPreprocessing: false,
    };
  }
}

