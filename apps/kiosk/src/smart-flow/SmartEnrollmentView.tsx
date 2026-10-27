/**
 * apps/kiosk/src/smart-flow/SmartEnrollmentView.tsx
 * Instant Face-First 10-Snap Biometric Capture View
 * Master Prompt v4 Step 2.1 & Step 2.2
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  FaceFlowManager,
  EnrollmentProgressRing,
  RequiredPose,
  FaceDetector,
  LivenessTelemetryBadge,
} from '../../../../packages/face-client/src/index.js';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { getFaceClientServices } from '../services/faceClientService';
import { ShieldCheck, RefreshCw, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';

interface SmartEnrollmentViewProps {
  onEnrollSuccess: (patientId: string) => void;
  onCancel: () => void;
  customDetector?: FaceDetector;
}

export const SmartEnrollmentView: React.FC<SmartEnrollmentViewProps> = ({
  onEnrollSuccess,
  onCancel,
  customDetector,
}) => {
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [currentPose, setCurrentPose] = useState<RequiredPose>('front');
  const [statusText, setStatusText] = useState<string>('กำลังเปิดกล้องสำหรับการลงทะเบียนใบหน้า...');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [livenessState, setLivenessState] = useState<'checking' | 'live_verified' | 'spoof_blocked'>('checking');
  const [livenessDepthScore, setLivenessDepthScore] = useState<number | undefined>(undefined);
  const [livenessEar, setLivenessEar] = useState<number | undefined>(undefined);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const hasFinishedRef = useRef<boolean>(false);

  const onEnrollSuccessRef = useRef(onEnrollSuccess);
  useEffect(() => {
    onEnrollSuccessRef.current = onEnrollSuccess;
  });

  useEffect(() => {
    isMountedRef.current = true;
    hasFinishedRef.current = false;
    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
    const { camera, detector, aligner, qualityChecker, embeddingModel } = services;

    let animFrameId: number;

    async function startEnrollmentFlow() {
      try {
        if (videoRef.current) {
          await camera.start(videoRef.current);
          if (isMountedRef.current) {
            setCameraReady(true);
          }
        }

        const renderLoop = () => {
          if (!isMountedRef.current) return;
          if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            camera.renderPreview(previewCanvasRef.current, videoRef.current, true);
          }
          animFrameId = requestAnimationFrame(renderLoop);
        };
        animFrameId = requestAnimationFrame(renderLoop);

        setStatusText('มองตรงที่กล้อง (หน้าตรง 4 เฟรม)');

        const captureFrameFn = () => {
          if (!videoRef.current) {
            throw new Error('Video stream is unavailable');
          }
          return camera.captureRotatedFrame(videoRef.current);
        };

        // Execute Face Flow Enrollment (Strictly 10 frames: front 4, left 2, right 2, nod 2)
        const enrollResult = await FaceFlowManager.executeEnrollment({
          patientId: `temp-${Date.now()}`,
          detector,
          aligner,
          qualityChecker,
          embeddingModel,
          captureFrameFn,
          onProgress: (info) => {
            if (!isMountedRef.current) return;
            setCurrentFrameIndex(info.frameIndex);
            setCurrentPose(info.currentPose);
            setStatusText(info.thaiInstruction);
            if (info.livenessState) setLivenessState(info.livenessState);
            if (info.depthScore !== undefined) setLivenessDepthScore(info.depthScore);
            if (info.ear !== undefined) setLivenessEar(info.ear);
          },
        });

        if (!isMountedRef.current || hasFinishedRef.current) {
          enrollResult.frames.forEach((f) => f.embedding.fill(0));
          return;
        }

        setIsSubmitting(true);
        setStatusText('กำลังสกัดเวกเตอร์ชีวมาตรและสร้างแฟ้มข้อมูลผู้ป่วยใหม่...');

        // Convert frames to API format with snapshot for front frame
        const framesPayload = enrollResult.frames.map((frame, index) => {
          let jpeg_base64: string | undefined;
          if (index === 0 && videoRef.current) {
            try {
              const canvas = camera.captureRotatedFrame(videoRef.current);
              jpeg_base64 = canvas.toDataURL('image/jpeg', 0.85);
            } catch {
              // Ignore
            }
          }
          return {
            pose: frame.pose,
            embedding: Array.from(frame.embedding),
            jpeg_base64,
          };
        });

        let createdPatientId: string;
        try {
          const res = await defaultApiClient.smartOnboarding.createPending({
            frames: framesPayload,
            model_version: 'w600k_r50',
          });
          createdPatientId = res.patient_id;
        } finally {
          // Zero out memory embedding buffers immediately
          enrollResult.frames.forEach((f) => f.embedding.fill(0));
        }

        if (!isMountedRef.current || hasFinishedRef.current) return;
        hasFinishedRef.current = true;

        setIsCompleted(true);
        setStatusText('ลงทะเบียนใบหน้า 10 เฟรมเสร็จสมบูรณ์!');

        setTimeout(() => {
          if (isMountedRef.current) {
            onEnrollSuccessRef.current(createdPatientId);
          }
        }, 800);
      } catch (err: unknown) {
        if (!isMountedRef.current || hasFinishedRef.current) return;
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียนใบหน้า';
        setEnrollError(msg);
        setStatusText(msg);
      }
    }

    startEnrollmentFlow();

    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(animFrameId);
      camera.stop();
    };
  }, [customDetector]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950 text-slate-100">
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '320px',
          height: '240px',
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="text-center max-w-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Face-First High-Precision Enrollment (10 Frames)</span>
        </div>
        <h1 className="text-2xl font-bold tracking-normal text-white mb-1">
          สมัครบัญชีใหม่ด้วยใบหน้า
        </h1>
        <p className="text-sm text-slate-400">
          ระบบสแกนอัตลักษณ์ 10 เฟรมตามมาตรฐาน ISO/IEC 30107-3 เพื่อความปลอดภัยระดับการแพทย์
        </p>
        <div className="mt-3 flex justify-center">
          <LivenessTelemetryBadge
            state={livenessState}
            depthScore={livenessDepthScore}
            ear={livenessEar}
          />
        </div>
      </div>

      {/* Camera Feed & 10-Tick Ring */}
      <div className="relative flex items-center justify-center my-auto">
        <EnrollmentProgressRing
          currentPose={currentPose}
          currentFrameIndex={currentFrameIndex}
          size={340}
        />

        <div className="absolute w-[280px] h-[280px] rounded-full overflow-hidden bg-slate-900 border-2 border-slate-700/50 shadow-2xl flex items-center justify-center">
          <canvas
            ref={previewCanvasRef}
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {!cameraReady && !enrollError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
              <span className="text-xs">กำลังเตรียมกล้อง...</span>
            </div>
          )}

          {isSubmitting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm text-white">
              <RefreshCw className="w-10 h-10 animate-spin text-emerald-400 mb-3" />
              <span className="text-sm font-medium">กำลังสกัดเวกเตอร์...</span>
            </div>
          )}

          {isCompleted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 backdrop-blur-sm text-white">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2" />
              <span className="text-sm font-semibold">สแกนสำเร็จ 10/10</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer Instructions / Error */}
      <div className="w-full max-w-md flex flex-col items-center gap-4">
        {enrollError ? (
          <div className="w-full bg-red-950/40 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 text-red-200">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="text-xs leading-relaxed">{enrollError}</div>
          </div>
        ) : (
          <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
              คำแนะนำท่าทาง ({currentFrameIndex}/10)
            </div>
            <div className="text-base font-medium text-slate-100">{statusText}</div>
          </div>
        )}

        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-medium transition active:scale-95 disabled:opacity-50"
          >
            ยกเลิก / กลับ
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>ISO/IEC 30107-3 Liveness & ArcFace 512-D Isolated Storage</span>
        </div>
      </div>
    </div>
  );
};
