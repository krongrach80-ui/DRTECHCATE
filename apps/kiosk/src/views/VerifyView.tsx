/**
 * apps/kiosk/src/views/VerifyView.tsx
 * Real-Time Face Biometric Verification View
 *
 * Invariants:
 * 1. Camera preview is mirrored for natural user experience via CameraManager.renderPreview().
 * 2. Frames passed to MediaPipe / FaceFlowManager are raw, unmirrored via CameraManager.captureRotatedFrame().
 * 3. Dynamic 2-step challenge (e.g. left -> nod) before collecting 3-5 frontal probe frames.
 * 4. Memory Wipe: Probe vector is wiped (.fill(0)) immediately after submission or abort.
 * 5. Fail-Closed & Explicit Staff Call: Never auto-triggers staff_call without explicit button click.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  FaceFlowManager,
  ChallengeStep,
  LivenessTelemetryBadge,
} from '../../../../packages/face-client/src/index.js';
import { getFaceClientServices, FaceClientServices } from '../services/faceClientService';
import {
  AlertCircle,
  Bell,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  RotateCcw,
} from 'lucide-react';

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
  lang?: 'th' | 'en' | 'cn';
}

const NOT_FOUND_TEXT = {
  th: {
    title: 'ไม่พบบัญชีผู้ใช้ในระบบ',
    desc: 'กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียนเข้าใช้งาน หรือกดลองสแกนอีกครั้ง',
    callStaffBtn: '🔔 เรียกเจ้าหน้าที่',
    staffNotifiedBtn: '✓ ส่งคำเรียกเจ้าหน้าที่แล้ว',
    retryBtn: '🔄 ลองสแกนอีกครั้ง',
  },
  en: {
    title: 'Account Not Found',
    desc: 'Please contact hospital staff for registration or try scanning again.',
    callStaffBtn: '🔔 Call Staff',
    staffNotifiedBtn: '✓ Staff Notified',
    retryBtn: '🔄 Try Scanning Again',
  },
  cn: {
    title: '未找到用户账户',
    desc: '请联系医护人员办理建档登记，或点击重新扫描。',
    callStaffBtn: '🔔 呼叫医护人员',
    staffNotifiedBtn: '✓ 已呼叫医护人员',
    retryBtn: '🔄 重新扫描',
  },
} as const;

export const VerifyView: React.FC<VerifyViewProps> = ({
  kioskId = 'kiosk-01',
  failedCount = 0,
  errorMessage,
  onSuccess,
  onFailure,
  onCallStaff,
  services: injectedServices,
  lang = 'th',
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
  const [isAccountNotFoundModal, setIsAccountNotFoundModal] = useState<boolean>(false);
  const [staffCallCooldown, setStaffCallCooldown] = useState<boolean>(false);
  const [retrySeq, setRetrySeq] = useState<number>(0);

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

  const handleExplicitCallStaff = useCallback(() => {
    if (staffCallCooldown) return;
    setStaffCallCooldown(true);
    onCallStaffRef.current();
    setTimeout(() => {
      if (isMountedRef.current) {
        setStaffCallCooldown(false);
      }
    }, 15000);
  }, [staffCallCooldown]);

  const handleManualRetry = useCallback(() => {
    setIsAccountNotFoundModal(false);
    setChallengeError(null);
    hasFinishedRef.current = false;
    setTimeout(() => {
      if (isMountedRef.current) {
        setRetrySeq((s) => s + 1);
      }
    }, 500);
  }, []);

  useEffect(() => {
    if (isAccountNotFoundModal) return;

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
          matched?: boolean;
          message?: string;
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

        const pId = verifyRes?.candidate?.id || verifyRes?.patient_id || '';
        const isMatched = verifyRes?.matched !== false && Boolean(pId);

        if (!isMatched) {
          throw new Error(
            verifyRes?.message || 'ไม่พบบัญชีผู้ใช้ กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียนเข้าใช้งาน'
          );
        }

        hasFinishedRef.current = true;
        setFlowPhase('done');

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
        if (nextFailedCount >= 2) {
          // หยุดวนสแกนอัตโนมัติและแสดงหน้าจอไม่พบบัญชีผู้ใช้ (ไม่ยิงคำเรียกเจ้าหน้าที่อัตโนมัติ)
          cancelAnimationFrame(animFrameId);
          camera.stop();
          setCameraReady(false);
          setIsAccountNotFoundModal(true);
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
  }, [kioskId, injectedServices, retrySeq, isAccountNotFoundModal]);

  const nf = NOT_FOUND_TEXT[lang] || NOT_FOUND_TEXT.th;

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950 relative">
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

        {failedCount > 0 && !isAccountNotFoundModal && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>กรุณามองตรงและอยู่นิ่งๆ เพื่อตรวจสอบอีกครั้ง</span>
          </div>
        )}

        {(errorMessage || challengeError) && !isAccountNotFoundModal && (
          <div className="mt-2 text-amber-300 text-xs font-medium">
            {challengeError || errorMessage}
          </div>
        )}
      </div>

      {/* Mirrored Camera View with Real-time Pose & Quality Overlay */}
      <div className="my-auto w-full max-w-xl h-96 relative flex items-center justify-center">
        <div className="w-full h-full rounded-3xl overflow-hidden border border-slate-700/60 bg-slate-900/90 shadow-2xl relative flex items-center justify-center">
          {/* Live Preview Canvas */}
          <canvas
            ref={previewCanvasRef}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              cameraReady ? 'opacity-90' : 'opacity-0'
            }`}
          />

          {!cameraReady && !isAccountNotFoundModal && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950">
              <RefreshCw className="w-10 h-10 text-blue-400 animate-spin mb-4" />
              <p className="text-base font-medium text-slate-300">กำลังเชื่อมต่อกล้องหน้าตู้...</p>
              <p className="text-xs text-slate-500 mt-1">กรุณารอสักครู่</p>
            </div>
          )}

          {/* Scanner Reticle and Dynamic Pose Direction Indicator */}
          {cameraReady && !isAccountNotFoundModal && (
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

              {/* Real-Time Guidance Prompt */}
              <div className="mt-4 px-6 py-2.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-blue-200 text-sm font-semibold shadow-xl flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>{statusText}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal แจ้งเตือนเมื่อไม่พบบัญชีผู้ใช้ (หยุดวนสแกนอัตโนมัติ) */}
      {isAccountNotFoundModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-6"
        >
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-teal-500/30 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
              <UserCheck className="w-8 h-8 text-teal-400" />
            </div>
            <h3 className="text-2xl font-extrabold text-white">{nf.title}</h3>
            <p className="text-sm text-slate-300 mt-2">{nf.desc}</p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleExplicitCallStaff}
                disabled={staffCallCooldown}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold text-base shadow-lg cursor-pointer"
              >
                {staffCallCooldown ? nf.staffNotifiedBtn : nf.callStaffBtn}
              </button>

              <button
                type="button"
                onClick={handleManualRetry}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{nf.retryBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom SOS & PDPA Status */}
      <div className="w-full max-w-xl flex flex-col items-center gap-3">
        <div className="flex items-center justify-between w-full pt-4 border-t border-slate-800/80 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Nonce: {nonce ? nonce.slice(0, 10) + '...' : 'กำลังรอเซิร์ฟเวอร์...'}</span>
          </div>
          <button
            type="button"
            onClick={handleExplicitCallStaff}
            disabled={staffCallCooldown}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:text-rose-300 disabled:opacity-50 font-medium transition cursor-pointer"
          >
            <Bell className="w-4 h-4 text-rose-400" />
            <span>{staffCallCooldown ? nf.staffNotifiedBtn : 'สแกนไม่ได้? กดเรียกเจ้าหน้าที่'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
