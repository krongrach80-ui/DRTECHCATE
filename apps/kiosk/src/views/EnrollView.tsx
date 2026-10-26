/**
 * apps/kiosk/src/views/EnrollView.tsx
 * Real-Time 10-Frame Biometric Enrollment View per Master Prompt v3 Spec 7.3, 10, 12
 *
 * Invariants:
 * 1. Collects strictly 10 frames in order: front(4) -> left(2) -> right(2) -> nod(2).
 * 2. Visual feedback with 10-tick EnrollmentProgressRing and Thai guidance.
 * 3. Embeddings extracted from 112x112 ArcFace aligned face before JPEG compression.
 * 4. Memory Wipe: All 10 embeddings are wiped (.fill(0)) immediately after submission.
 * 5. Calls /api/kiosk/enroll to record templates and update registration status.
 */

import React, { useState, useEffect, useRef } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  FaceFlowManager,
  EnrollmentProgressRing,
  RequiredPose,
  REQUIRED_ENROLL_POSES,
  LivenessTelemetryBadge,
} from '../../../../packages/face-client/src/index.js';
import { getFaceClientServices, FaceClientServices } from '../services/faceClientService';
import { ShieldCheck, RefreshCw, Bell, AlertCircle, CheckCircle2 } from 'lucide-react';

interface EnrollViewProps {
  ticketId?: string | null;
  patientId?: string;
  framesCount?: number;
  onFrameCaptured?: () => void;
  onComplete: () => void;
  onCallStaff?: () => void;
  services?: FaceClientServices;
}

export const EnrollView: React.FC<EnrollViewProps> = ({
  ticketId,
  patientId = 'patient-kiosk-new',
  framesCount: _framesCount = 0,
  onFrameCaptured,
  onComplete,
  onCallStaff,
  services: injectedServices,
}) => {
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [currentPose, setCurrentPose] = useState<RequiredPose>('front');
  const [statusText, setStatusText] = useState<string>('กำลังเปิดกล้องสำหรับการลงทะเบียน...');
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

  useEffect(() => {
    isMountedRef.current = true;
    hasFinishedRef.current = false;
    const services = injectedServices || getFaceClientServices();
    const { camera, detector, aligner, qualityChecker, embeddingModel } = services;

    let animFrameId: number;

    async function startEnrollmentFlow() {
      try {
        // 1. Start camera feed
        if (videoRef.current) {
          await camera.start(videoRef.current);
          if (isMountedRef.current) {
            setCameraReady(true);
          }
        }

        // Preview rendering loop (Mirrored preview for user comfort)
        const renderLoop = () => {
          if (!isMountedRef.current) return;
          if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            camera.renderPreview(previewCanvasRef.current, videoRef.current, true);
          }
          animFrameId = requestAnimationFrame(renderLoop);
        };
        animFrameId = requestAnimationFrame(renderLoop);

        setStatusText('มองตรงที่กล้อง (หน้าตรง 4 เฟรม)');

        // 2. Execute Face Flow Enrollment (Strictly 10 frames)
        const captureFrameFn = () => {
          if (!videoRef.current) {
            throw new Error('Video stream is unavailable');
          }
          return camera.captureRotatedFrame(videoRef.current);
        };

        const enrollResult = await FaceFlowManager.executeEnrollment({
          patientId: patientId || `patient-${ticketId || Date.now()}`,
          ticketId: ticketId || undefined,
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
            onFrameCaptured?.();
          },
        });

        if (!isMountedRef.current || hasFinishedRef.current) {
          enrollResult.frames.forEach((f) => f.embedding.fill(0));
          return;
        }

        setIsSubmitting(true);
        setStatusText('บันทึกข้อมูลใบหน้าลงทะเบียนเข้าสู่ระบบ...');

        // 3. Submit 10 Frames to Server API
        try {
          await defaultApiClient.kiosk.enroll({
            patient_id: enrollResult.patient_id,
            ticket: enrollResult.ticket_id,
            frames: enrollResult.frames,
            model_version: 'w600k_r50',
          });
        } finally {
          // Rule 2.5: Zero out all biometric embedding arrays immediately
          enrollResult.frames.forEach((f) => f.embedding.fill(0));
        }

        if (!isMountedRef.current || hasFinishedRef.current) return;
        hasFinishedRef.current = true;

        setIsCompleted(true);
        setStatusText('ลงทะเบียนใบหน้าสำเร็จเรียบร้อยแล้ว!');

        setTimeout(() => {
          onComplete();
        }, 1200);
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
  }, [ticketId, patientId, onFrameCaptured, onComplete, injectedServices]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950">
      {/* Hidden camera stream */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
          ลงทะเบียนใบหน้าครั้งแรก (10 Frames Enrollment)
        </span>
        <h2 className="text-3xl font-extrabold text-white mt-2">
          บันทึกข้อมูลใบหน้าผู้ป่วยใหม่
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          บัตรคิว:{' '}
          <span className="font-mono text-blue-400 font-bold">{ticketId || 'เคาน์เตอร์ต้อนรับ'}</span>
          {' • '}
          <span className="text-slate-300">
            เก็บ {currentFrameIndex} / {REQUIRED_ENROLL_POSES.length} เฟรม
          </span>
        </p>

        <div className="mt-2.5 flex justify-center">
          <LivenessTelemetryBadge
            state={livenessState}
            depthScore={livenessDepthScore}
            ear={livenessEar}
          />
        </div>

        {enrollError && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
            <AlertCircle className="w-4 h-4" />
            <span>{enrollError}</span>
          </div>
        )}
      </div>

      {/* Mirrored Camera View with 10-Tick Enrollment Progress Ring Overlay */}
      <div className="my-auto w-full max-w-xl h-96 relative flex items-center justify-center">
        <div className="w-full h-full rounded-3xl overflow-hidden border border-slate-700/60 bg-slate-900/90 shadow-2xl relative flex items-center justify-center">
          {/* Mirrored Canvas Preview */}
          <canvas
            ref={previewCanvasRef}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              cameraReady ? 'opacity-90' : 'opacity-0'
            }`}
          />

          {!cameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950">
              <RefreshCw className="w-10 h-10 text-blue-400 animate-spin mb-4" />
              <p className="text-base font-medium text-slate-300">กำลังเชื่อมต่อกล้องหน้าตู้...</p>
              <p className="text-xs text-slate-500 mt-1">กรุณารอสักครู่</p>
            </div>
          )}

          {/* 10-Tick Progress Ring & Pose Guidance Overlay */}
          {cameraReady && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {isCompleted ? (
                <div className="flex flex-col items-center justify-center bg-slate-950/80 p-8 rounded-full border-2 border-emerald-400 shadow-2xl animate-scale-up">
                  <CheckCircle2 className="w-20 h-20 text-emerald-400 animate-bounce" />
                  <span className="mt-2 text-base font-extrabold text-white">ลงทะเบียนสำเร็จ</span>
                </div>
              ) : (
                <EnrollmentProgressRing
                  currentFrameIndex={currentFrameIndex}
                  currentPose={currentPose}
                  statusMessage={statusText}
                  size={320}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls / Status Bar */}
      <div className="w-full max-w-xl flex flex-col items-center gap-3 pb-2">
        <div className="flex items-center justify-between w-full pt-4 border-t border-slate-800/80 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              {isSubmitting
                ? 'กำลังส่งข้อมูลเข้าสู่ระบบ...'
                : 'ข้อมูลเวกเตอร์ชีวมาตรได้รับการคุ้มครองตามมาตรฐาน PDPA'}
            </span>
          </div>

          {onCallStaff && (
            <button
              type="button"
              onClick={onCallStaff}
              className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 transition"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>ขอความช่วยเหลือ</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
