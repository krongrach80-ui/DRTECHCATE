'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, CheckCircle2, X, ShieldAlert, Sun } from 'lucide-react';
import { FacePose } from '@/types/database';

interface EnrolledFrameData {
  pose: FacePose;
  embedding: number[];
  image_base64: string;
}

interface FaceEnrollmentScannerProps {
  userId?: string;
  userName: string;
  onComplete: (frames: EnrolledFrameData[]) => void;
  onCancel: () => void;
}

// 10 Frame Enrollment Sequence: Front x4 -> Left x2 -> Right x2 -> Nod x2
const ENROLL_STEPS: { pose: FacePose; targetCount: number; label: string; subLabel: string }[] = [
  { pose: 'front', targetCount: 4, label: 'มองตรงที่กล้อง', subLabel: 'มองตรงมาที่กล้องและลืมตาค้างไว้' },
  { pose: 'left', targetCount: 2, label: 'หันหน้าไปทางซ้าย', subLabel: 'ค่อยๆ หันศีรษะไปทางซ้ายช้าๆ' },
  { pose: 'right', targetCount: 2, label: 'หันหน้าไปทางขวา', subLabel: 'ค่อยๆ หันศีรษะไปทางขวาช้าๆ' },
  { pose: 'nod', targetCount: 2, label: 'พยักหน้า', subLabel: 'ก้มและเงยศีรษะเล็กน้อย' },
];

const TOTAL_FRAMES = 10;

export default function FaceEnrollmentScanner({
  userName,
  onComplete,
  onCancel,
}: FaceEnrollmentScannerProps) {
  const [consentGranted, setConsentGranted] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [capturedFrames, setCapturedFrames] = useState<EnrolledFrameData[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [guidanceTip, setGuidanceTip] = useState<string>('กรุณาจัดใบหน้าให้อยู่ในกรอบวงกลม');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 1. Start Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('การเปิดกล้องต้องทำงานภายใต้ HTTPS หรือ Localhost ที่ปลอดภัย');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
        setCameraError('ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาเปิดสิทธิ์การใช้งานกล้องในเบราว์เซอร์');
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setCameraError('ไม่พบอุปกรณ์กล้องบนเครื่องนี้');
      } else {
        setCameraError(`ไม่สามารถเปิดกล้องได้: ${msg}`);
      }
    }
  };

  // Stop camera stream on unmount
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (consentGranted) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [consentGranted, stopCamera]);

  // Frame quality evaluation (Laplacian Variance for blur + Brightness)
  const evaluateFrameQuality = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): { brightness: number; isGoodLight: boolean; isSharp: boolean } => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let totalBrightness = 0;
    const pixelCount = width * height;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const avgBrightness = totalBrightness / pixelCount;
    const isGoodLight = avgBrightness >= 40 && avgBrightness <= 235;

    // Laplacian edge contrast approximation for sharpness
    let laplacianVar = 0;
    for (let i = 0; i < data.length - 8; i += 16) {
      const diff = Math.abs(data[i] - data[i + 4]);
      laplacianVar += diff * diff;
    }
    const isSharp = laplacianVar / (pixelCount / 4) > 8.0;

    return { brightness: avgBrightness, isGoodLight, isSharp };
  };

  // Generate deterministic 128-dim normalized embedding from facial landmarks/canvas crop
  const generateSimulatedEmbedding = (cropCanvas: HTMLCanvasElement): number[] => {
    const ctx = cropCanvas.getContext('2d');
    const rawVector: number[] = [];
    if (!ctx) return Array(128).fill(0.01);

    const data = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height).data;
    const step = Math.max(1, Math.floor(data.length / (128 * 4)));

    for (let i = 0; i < 128; i++) {
      const idx = (i * step * 4) % data.length;
      // Combine color channels to extract features
      const val = (data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11) / 255.0 - 0.5;
      rawVector.push(Number(val.toFixed(5)));
    }

    // L2 Normalize
    const norm = Math.sqrt(rawVector.reduce((acc, v) => acc + v * v, 0)) || 1;
    return rawVector.map((v) => Number((v / norm).toFixed(5)));
  };

  // Frame capture loop when camera is active
  useEffect(() => {
    if (!cameraActive || isCompleted || capturedFrames.length >= TOTAL_FRAMES) return;

    let lastCaptureTime = 0;
    const captureInterval = 600; // Capture each frame after ~600ms of holding position

    const processFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const now = Date.now();
        if (now - lastCaptureTime > captureInterval) {
          const width = 320;
          const height = 320;
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Draw mirrored crop
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(video, -width, 0, width, height);
            ctx.restore();

            const quality = evaluateFrameQuality(ctx, width, height);

            if (!quality.isGoodLight) {
              setGuidanceTip(quality.brightness < 40 ? 'แสงน้อยเกินไป กรุณาเพิ่มแสงสว่าง' : 'แสงจ้าเกินไป');
            } else if (!quality.isSharp) {
              setGuidanceTip('ภาพเบลอ กรุณาอยู่นิ่งๆ สักครู่');
            } else {
              setGuidanceTip('ยอดเยี่ยม! ถือศีรษะนิ่งๆ');

              // Determine current pose step
              const currentPose = ENROLL_STEPS[currentStepIndex].pose;
              const cropDataUrl = canvas.toDataURL('image/jpeg', 0.85);
              const embedding = generateSimulatedEmbedding(canvas);

              const newFrame: EnrolledFrameData = {
                pose: currentPose,
                embedding,
                image_base64: cropDataUrl,
              };

              setCapturedFrames((prev) => {
                const next = [...prev, newFrame];
                lastCaptureTime = now;

                // Check step progress
                const currentStepTarget = ENROLL_STEPS.slice(0, currentStepIndex + 1).reduce(
                  (sum, s) => sum + s.targetCount,
                  0
                );

                if (next.length >= currentStepTarget && currentStepIndex < ENROLL_STEPS.length - 1) {
                  setCurrentStepIndex((idx) => idx + 1);
                }

                if (next.length === TOTAL_FRAMES) {
                  setIsCompleted(true);
                  setTimeout(() => {
                    onComplete(next);
                  }, 800);
                }

                return next;
              });
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [cameraActive, capturedFrames.length, currentStepIndex, isCompleted, onComplete]);

  // If Consent is not yet granted, show the PDPA Biometric Consent dialog
  if (!consentGranted) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-5">
            <Camera className="w-7 h-7" />
          </div>

          <h3 className="text-xl font-bold text-white mb-2">
            ความยินยอมการเก็บข้อมูลชีวมาตร (Biometric Consent)
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            โรงพยาบาลจำเป็นต้องจัดเก็บข้อมูลภาพใบหน้าและแบบจำลองเวกเตอร์ชีวมาตร (Biometric Template) สำหรับคนไข้{' '}
            <span className="text-sky-400 font-semibold">{userName}</span> เพื่อใช้ในการยืนยันตัวตนอัตโนมัติที่ตู้ Kiosk เช็คอิน
          </p>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 space-y-2 mb-6">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>ภาพสแกน 10 เฟรมจะถูกเข้ารหัสและจัดเก็บในพื้นที่ความปลอดภัยสูง (Private Storage)</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>ใช้เพื่อการยืนยันตัวตนเข้ารับบริการกายภาพบำบัดเท่านั้น ไม่เปิดเผยต่อบุคคลภายนอก</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>เจ้าของข้อมูลมีสิทธิขอให้ลบข้อมูลชีวมาตรได้ตลอดเวลาตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              ข้ามการลงทะเบียนใบหน้า
            </button>
            <button
              type="button"
              onClick={() => setConsentGranted(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 glow-btn transition-all cursor-pointer flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ยินยอมและเปิดกล้อง</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStep = ENROLL_STEPS[currentStepIndex];
  const progressRatio = capturedFrames.length / TOTAL_FRAMES;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between p-6 select-none animate-in fade-in duration-300">
      {/* Top Header & Instruction */}
      <div className="w-full max-w-md flex items-center justify-between text-white pt-2">
        <div>
          <span className="text-xs uppercase tracking-widest text-sky-400 font-semibold">Face Enrollment</span>
          <h2 className="text-xl font-bold">{currentStep.label}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{currentStep.subLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onCancel();
          }}
          className="p-2.5 rounded-full bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Face Circle Viewport */}
      <div className="relative my-auto flex flex-col items-center justify-center">
        {/* Outer 10-Tick Gauge Ring */}
        <div className="relative w-80 h-80 flex items-center justify-center">
          {/* SVG Circular 10-Tick Gauge */}
          <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            {/* Background ticks */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#1e293b"
              strokeWidth="5"
              strokeDasharray="6 3.42"
            />
            {/* Filled green ticks */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#10b981"
              strokeWidth="5"
              strokeDasharray="6 3.42"
              strokeDashoffset={289 * (1 - progressRatio)}
              className="transition-all duration-300 ease-out"
            />
          </svg>

          {/* Video Circle Container */}
          <div className="w-64 h-64 rounded-full overflow-hidden border-2 border-slate-700/60 shadow-2xl relative bg-slate-950 flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 text-center text-rose-400 text-xs">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                <span>{cameraError}</span>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}

            {/* Success Overlay Checkmark */}
            {isCompleted && (
              <div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-sm flex items-center justify-center animate-in zoom-in-75 duration-300">
                <CheckCircle2 className="w-20 h-20 text-emerald-400 animate-bounce" />
              </div>
            )}
          </div>
        </div>

        {/* Guidance tip badge below circle */}
        <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
          <Sun className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{guidanceTip}</span>
        </div>
      </div>

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Bottom Progress Stats */}
      <div className="w-full max-w-md pb-4 text-center">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>ความคืบหน้าการลงทะเบียน</span>
          <span className="font-semibold text-emerald-400">
            {capturedFrames.length} / {TOTAL_FRAMES} เฟรม
          </span>
        </div>

        {/* Linear progress bar for accessibility */}
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${(capturedFrames.length / TOTAL_FRAMES) * 100}%` }}
          />
        </div>

        <div className="mt-4 text-xs text-slate-500">
          ตรง 4 เฟรม ➔ ซ้าย 2 ➔ ขวา 2 ➔ พยักหน้า 2
        </div>
      </div>
    </div>
  );
}
