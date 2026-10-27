/**
 * apps/kiosk/src/views/VerifyView.tsx
 * Real-Time Face Biometric Verification View per Master Prompt v3 Spec 7.4 & 12
 *
 * Invariants:
 * 1. Camera preview is mirrored for natural user experience via CameraManager.renderPreview().
 * 2. Frames passed to MediaPipe / FaceFlowManager are raw, unmirrored via CameraManager.captureRotatedFrame().
 * 3. Dynamic 2-step challenge (e.g. left -> nod) before collecting 3-5 frontal probe frames.
 * 4. Memory Wipe: Probe vector is wiped (.fill(0)) immediately after submission.
 * 5. Fail-Closed & 3-attempt limit: After 3 failed attempts, automatically creates staff_call and routes to staff.
 */

import React, { useState, useEffect, useRef } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  FaceFlowManager,
  ChallengeStep,
  LivenessTelemetryBadge,
} from '../../../../packages/face-client/src/index.js';
import { getFaceClientServices, FaceClientServices } from '../services/faceClientService';
import { AlertCircle, Bell, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';

interface VerifyViewProps {
  kioskId?: string;
  failedCount?: number;
  errorMessage?: string | null;
  onSuccess: (
    patientId: string,
    firstName: string,
    avatarUrl?: string | null,
    sessionToken?: string
  ) => void;
  onFailure: (error?: string) => void;
  onCallStaff: () => void;
  services?: FaceClientServices;
}

export const VerifyView: React.FC<VerifyViewProps> = ({
  kioskId = 'kiosk-01',
  failedCount = 0,
  errorMessage,
  onSuccess,
  onFailure,
  onCallStaff,
  services: injectedServices,
}) => {
  const [nonce, setNonce] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('กำลังเชื่อมต่อกล้องและเซิร์ฟเวอร์...');
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [currentStepPose, setCurrentStepPose] = useState<ChallengeStep | 'front'>('front');
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [totalSteps, setTotalSteps] = useState<number>(2);
  const [flowPhase, setFlowPhase] = useState<'connecting' | 'challenge' | 'probe' | 'done'>('connecting');
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [livenessState, setLivenessState] = useState<'checking' | 'live_verified' | 'spoof_blocked'>('checking');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const hasFinishedRef = useRef<boolean>(false);

  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);
  const onCallStaffRef = useRef(onCallStaff);
  const failedCountRef = useRef(failedCount);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
    onCallStaffRef.current = onCallStaff;
    failedCountRef.current = failedCount;
  });

  useEffect(() => {
    isMountedRef.current = true;
    hasFinishedRef.current = false;
    const services = injectedServices || getFaceClientServices();
    const { camera, detector, aligner, qualityChecker, embeddingModel } = services;

    let animFrameId: number;

    async function startVerification() {
      try {
        // 1. Start camera feed onto video element
        if (videoRef.current) {
          await camera.start(videoRef.current);
          if (isMountedRef.current) {
            setCameraReady(true);
          }
        }

        // Preview rendering loop (MIRRORED for user preview)
        const renderLoop = () => {
          if (!isMountedRef.current) return;
          if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            camera.renderPreview(previewCanvasRef.current, videoRef.current, true);
          }
          animFrameId = requestAnimationFrame(renderLoop);
        };
        animFrameId = requestAnimationFrame(renderLoop);

        // 2. Request Challenge from Server API
        setStatusText('กำลังขอรหัสความท้าทาย (Nonce & Steps)...');
        const challengeRes = await defaultApiClient.kiosk.requestChallenge(kioskId);

        if (!challengeRes || !challengeRes.nonce) {
          throw new Error('ไม่สามารถรับ Challenge Nonce จากเซิร์ฟเวอร์ได้');
        }

        if (!isMountedRef.current) return;
        const currentNonce = challengeRes.nonce;
        setNonce(currentNonce);

        const rawSteps = challengeRes.steps || ['left', 'nod'];
        const challengeSteps = rawSteps as ChallengeStep[];
        setTotalSteps(challengeSteps.length);

        setStatusText('กรุณาปฏิบัติตามท่าทางที่ปรากฏบนหน้าจอ');
        setFlowPhase('challenge');

        // 3. Execute Verification Probe Flow
        // Capture frame function passes RAW, UNMIRRORED canvas to face detector & aligner
        const captureFrameFn = () => {
          if (!videoRef.current) {
            throw new Error('Video stream is unavailable');
          }
          return camera.captureRotatedFrame(videoRef.current);
        };

        const probeResult = await FaceFlowManager.executeVerificationProbe({
          kioskId,
          nonce: currentNonce,
          challengeSteps,
          detector,
          aligner,
          qualityChecker,
          embeddingModel,
          captureFrameFn,
          onProgress: (info) => {
            if (!isMountedRef.current) return;
            setFlowPhase(info.status);
            setStepIndex(info.stepIndex);
            setCurrentStepPose(info.currentPose);
            setStatusText(info.thaiInstruction);
            if (info.livenessState) setLivenessState(info.livenessState);
          },
        });

        if (!isMountedRef.current || hasFinishedRef.current) {
          probeResult.probe.fill(0);
          return;
        }

        setStatusText('เปรียบเทียบข้อมูลชีวมาตรกับฐานข้อมูล...');

        // 4. Submit Probe Vector to /api/kiosk/verify
        let verifyRes: {
          session_token?: string;
          sessionToken?: string;
          patient_id?: string;
          first_name?: string;
          avatar_url?: string | null;
          candidate?: {
            id: string;
            first_name: string;
            avatar_url: string | null;
          };
        };

        try {
          const resp = await defaultApiClient.kiosk.verifyFace({
            kiosk_id: probeResult.kiosk_id,
            nonce: probeResult.nonce,
            probe: probeResult.probe,
            liveness_score: probeResult.liveness_score,
          });
          verifyRes = resp as typeof verifyRes;
        } finally {
          // Rule 2.5: Zero out probe vector immediately
          probeResult.probe.fill(0);
        }

        if (!isMountedRef.current || hasFinishedRef.current) return;
        hasFinishedRef.current = true;

        const pId = verifyRes.candidate?.id || verifyRes.patient_id || '';
        const fName = verifyRes.candidate?.first_name || verifyRes.first_name || 'ผู้รับบริการ';
        const avUrl = verifyRes.candidate?.avatar_url || verifyRes.avatar_url || null;
        const sToken = verifyRes.session_token || verifyRes.sessionToken || '';

        onSuccessRef.current(pId, fName, avUrl, sToken);
      } catch (err: unknown) {
        if (!isMountedRef.current || hasFinishedRef.current) return;
        const msg = err instanceof Error ? err.message : 'การยืนยันตัวตนล้มเหลว';
        setChallengeError(msg);
        setStatusText(msg);

        const nextFailedCount = failedCountRef.current + 1;
        if (nextFailedCount >= 3) {
          // Automatic staff call on 3 failures (Spec 12 & DoD 3)
          try {
            await defaultApiClient.kiosk.callStaff({
              kiosk_id: kioskId,
              reason: 'ผู้ป่วยสแกนใบหน้าไม่ผ่านครบ 3 ครั้ง',
            });
          } catch {
            // Ignore call failure
          }
          onCallStaffRef.current();
        } else {
          onFailureRef.current?.(msg);
        }
      }
    }

    startVerification();

    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(animFrameId);
      camera.stop();
    };
  }, [kioskId, injectedServices]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950">
      {/* Hidden camera stream source */}
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

      {/* Header instructions */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
          ขั้นตอนที่ 2 / 3 • การยืนยันตัวตนด้วยใบหน้า
        </span>
        <h2 className="text-3xl font-extrabold text-white mt-2">สแกนใบหน้าและท่าทาง</h2>
        <p className="text-sm text-slate-400 mt-1">
          ระบบตรวจสอบใบหน้าจริงและท่าทางป้องกันการปลอมแปลง (Active Liveness Challenge)
        </p>

        <div className="mt-3 flex justify-center">
          <LivenessTelemetryBadge state={livenessState} />
        </div>

        {failedCount > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>
              สแกนไม่สำเร็จครั้งที่ {failedCount} / 3 (หากไม่ผ่าน 3 ครั้งระบบจะเรียกเจ้าหน้าที่อัตโนมัติ)
            </span>
          </div>
        )}

        {(errorMessage || challengeError) && (
          <div className="mt-2 text-rose-400 text-xs font-medium">
            {challengeError || errorMessage}
          </div>
        )}
      </div>

      {/* Mirrored Camera View with Real-time Pose & Quality Overlay */}
      <div className="my-auto w-full max-w-xl h-96 relative flex items-center justify-center">
        <div className="w-full h-full rounded-3xl overflow-hidden border border-slate-700/60 bg-slate-900/90 shadow-2xl relative flex items-center justify-center">
          {/* Live Preview Canvas (Mirror preview rendered via CameraManager) */}
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

          {/* Scanner Reticle and Dynamic Pose Direction Indicator */}
          {cameraReady && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div
                className={`relative w-64 h-80 sm:w-80 sm:h-88 rounded-full border-2 border-dashed transition-all duration-300 flex items-center justify-center ${
                  flowPhase === 'done'
                    ? 'border-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.3)]'
                    : flowPhase === 'probe'
                    ? 'border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.25)]'
                    : 'border-blue-400/60 shadow-[0_0_50px_rgba(59,130,246,0.15)]'
                }`}
              >
                {/* Status Icon in Reticle */}
                {flowPhase === 'done' ? (
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
                ) : (
                  <div className="text-center p-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-300 block mb-1">
                      {flowPhase === 'challenge'
                        ? `ท่าที่ ${stepIndex + 1} / ${totalSteps}`
                        : 'กำลังบันทึกภาพหน้าตรง'}
                    </span>
                    <span className="text-lg font-extrabold text-white">
                      {currentStepPose === 'left' && '👈 หันซ้าย'}
                      {currentStepPose === 'right' && '👉 หันขวา'}
                      {currentStepPose === 'nod' && '👇 พยักหน้า'}
                      {currentStepPose === 'front' && '👀 มองตรง'}
                    </span>
                  </div>
                )}
              </div>

              {/* Real-Time Thai Guidance Prompt */}
              <div className="mt-4 px-6 py-2.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-blue-200 text-sm font-semibold shadow-xl flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>{statusText}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom SOS & PDPA Status */}
      <div className="w-full max-w-xl flex flex-col items-center gap-3">
        <div className="flex items-center justify-between w-full pt-4 border-t border-slate-800/80 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Nonce: {nonce ? nonce.slice(0, 10) + '...' : 'กำลังรอเซิร์ฟเวอร์...'}</span>
          </div>
          <button
            type="button"
            onClick={onCallStaff}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-medium transition"
          >
            <Bell className="w-4 h-4 text-rose-400" />
            <span>สแกนไม่ได้? กดเรียกเจ้าหน้าที่</span>
          </button>
        </div>
      </div>
    </div>
  );
};
