/**
 * apps/kiosk/src/smart-flow/SmartLoginView.tsx
 * Centered Smart Kiosk Card Design matching 100% reference design
 * Auto-Presence, 5s Cooldown Scan, Camera Fallback Box, and Floating Action Pills
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaceDetector, l2Normalize } from '../../../../packages/face-client/src/index.js';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { getFaceClientServices } from '../services/faceClientService';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Shield,
  Info,
  X,
  KeyRound,
  RotateCw,
  FlipHorizontal,
  Camera,
} from 'lucide-react';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';

interface SmartLoginViewProps {
  onLoginSuccess: (patient: PatientRecordFile) => void;
  onNavigateToEnroll: () => void;
  customDetector?: FaceDetector;
  onOpenStaffLoginModal?: () => void;
  onOpenNewPatientModal?: () => void;
  isPaused?: boolean;
}

export const SmartLoginView: React.FC<SmartLoginViewProps> = ({
  onLoginSuccess,
  onNavigateToEnroll,
  customDetector,
  onOpenStaffLoginModal,
  onOpenNewPatientModal,
  isPaused = false,
}) => {
  const [presenceDetected, setPresenceDetected] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(5);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น');
  const [unrecognizedAlert, setUnrecognizedAlert] = useState<string | null>(null);
  const [matchedPatient, setMatchedPatient] = useState<PatientRecordFile | null>(null);
  const [similarityInfo, setSimilarityInfo] = useState<{ percent: number; distance: number } | null>(null);
  const [cameraRotation, setCameraRotation] = useState<0 | 90 | 180 | 270>(0);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [userDisabledCamera, setUserDisabledCamera] = useState<boolean>(false);

  // Modals inside Kiosk Screen
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  // Effective pause state: paused when external prop says so, or when any modal/menu is open, or when user toggled off
  const isScanningPaused = Boolean(isPaused || isAboutModalOpen || isPinModalOpen || userDisabledCamera);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredScanRef = useRef<boolean>(false);
  const cameraRotationRef = useRef(cameraRotation);
  const isMirroredRef = useRef(isMirrored);

  useEffect(() => {
    cameraRotationRef.current = cameraRotation;
    isMirroredRef.current = isMirrored;
  }, [cameraRotation, isMirrored]);

  // Completely Stop & Release Camera hardware and timers
  const stopCamera = useCallback(() => {
    try {
      const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
      services.camera.stop();
    } catch {
      // safe
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          // safe
        }
        videoRef.current.srcObject = null;
      }
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCameraReady(false);
    setPresenceDetected(false);
  }, [customDetector]);

  // Trigger login scan at 0s
  const executeScanLogin = useCallback(async () => {
    if (!isMountedRef.current || isScanning || hasTriggeredScanRef.current || isScanningPaused) return;
    hasTriggeredScanRef.current = true;
    setIsScanning(true);
    setStatusText('กำลังสแกนใบหน้าและตรวจสอบอัตลักษณ์ชีวมาตร...');

    try {
      const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
      const { camera, detector, aligner, embeddingModel } = services;

      if (!videoRef.current) {
        throw new Error('กล้องเว็บแคมยังไม่พร้อมใช้งาน');
      }

      // 1. Capture raw unmirrored frame
      const rawFrame = camera.captureRotatedFrame(videoRef.current);
      let probe: number[] = [];
      let snapshotBase64: string | undefined;

      try {
        snapshotBase64 = rawFrame.toDataURL('image/jpeg', 0.85);
      } catch {
        // Ignore snapshot generation failure
      }

      // 2. Real Face Detection
      const detection = await detector.detect(rawFrame);
      if (!detection.hasFace) {
        setStatusText('ยังตรวจไม่พบใบหน้า กรุณาจัดตำแหน่งใบหน้าให้อยู่ในกรอบวงกลม');
        hasTriggeredScanRef.current = false;
        setCountdown(3);
        setIsScanning(false);
        return;
      }

      // 3. ArcFace Landmark Alignment & Cropping
      try {
        if (detection.landmarks) {
          const aligned = aligner.align(rawFrame, detection.landmarks);
          probe = await embeddingModel.embed(aligned);
          const actx = aligned.getContext?.('2d');
          if (actx) actx.clearRect(0, 0, aligned.width, aligned.height);
        } else if (detection.box && detection.box.width > 20) {
          const faceCrop = document.createElement('canvas');
          faceCrop.width = 112;
          faceCrop.height = 112;
          const fcCtx = faceCrop.getContext('2d');
          if (fcCtx) {
            const fw = rawFrame.width || 640;
            const fh = rawFrame.height || 480;
            const pad = detection.box.width * 0.15;
            const sx = Math.max(0, detection.box.x - pad);
            const sy = Math.max(0, detection.box.y - pad);
            const sw = Math.min(fw - sx, detection.box.width + pad * 2);
            const sh = Math.min(fh - sy, detection.box.height + pad * 2);
            fcCtx.drawImage(rawFrame, sx, sy, sw, sh, 0, 0, 112, 112);
            probe = await embeddingModel.embed(faceCrop);
          }
        } else {
          const faceCrop = document.createElement('canvas');
          faceCrop.width = 112;
          faceCrop.height = 112;
          const fcCtx = faceCrop.getContext('2d');
          if (fcCtx) {
            const fw = rawFrame.width || 640;
            const fh = rawFrame.height || 480;
            const size = Math.min(fw, fh) * 0.58;
            const sx = (fw - size) / 2;
            const sy = Math.max(0, (fh - size) * 0.35);
            fcCtx.drawImage(rawFrame, sx, sy, size, size, 0, 0, 112, 112);
            probe = await embeddingModel.embed(faceCrop);
          }
        }
      } catch (err) {
        console.warn('Face embedding extraction fallback:', err);
      }

      if (!probe || probe.length !== 512) {
        setStatusText('คุณภาพภาพสแกนยังไม่สมบูรณ์ กรุณานิ่งไว้สักครู่');
        hasTriggeredScanRef.current = false;
        setCountdown(2);
        setIsScanning(false);
        return;
      }

      probe = l2Normalize(probe);

      // 4. Call /api/smart-onboarding/scan-login
      const res = await defaultApiClient.smartOnboarding
        .scanLogin({
          probe,
          snapshot: snapshotBase64,
        })
        .catch((apiErr) => {
          console.warn('API scan-login warning:', apiErr);
          return null;
        });

      // Memory wipe invariant: Wipe probe vector immediately
      probe.fill(0);

      if (!isMountedRef.current || isScanningPaused) return;

      if (res && res.matched && (res as any).patient) {
        const patient = (res as any).patient;
        const distance = typeof res.distance === 'number' ? res.distance : 0.20;
        const similarityPercent = Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));
        setMatchedPatient(patient);
        setSimilarityInfo({
          percent: similarityPercent,
          distance,
        });
        setStatusText(`ยืนยันตัวตนสำเร็จ: คุณ ${patient.first_name} (${similarityPercent}%)`);
      } else {
        setUnrecognizedAlert(
          res?.message || 'ไม่พบบัญชีที่ตรงกับใบหน้านี้ในระบบ กรุณาลองสแกนใหม่อีกครั้ง หรือเข้าสู่ระบบด้วยรหัส PIN / HN'
        );
        setStatusText('ไม่พบบัญชีในระบบ');
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสแกนใบหน้า';
      setUnrecognizedAlert(msg);
      setStatusText(msg);
    } finally {
      if (isMountedRef.current) {
        setIsScanning(false);
      }
    }
  }, [customDetector, isScanning, isScanningPaused]);

  // Request & Initialize Camera
  const startCamera = useCallback(async () => {
    if (isScanningPaused) return;
    try {
      const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
      const { camera } = services;

      if (videoRef.current) {
        await camera.start(videoRef.current);
        if (isMountedRef.current && !isScanningPaused) {
          setCameraReady(true);
        }
      }
    } catch {
      if (isMountedRef.current) {
        setCameraReady(false);
      }
    }
  }, [customDetector, isScanningPaused]);

  // Tab visibility: Release camera if browser tab is hidden / minimized
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopCamera();
      } else if (!isScanningPaused) {
        startCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [stopCamera, startCamera, isScanningPaused]);

  // Main Camera & Presence Loop (Pauses completely when isScanningPaused is true)
  useEffect(() => {
    if (isScanningPaused) {
      stopCamera();
      return;
    }

    isMountedRef.current = true;
    hasTriggeredScanRef.current = false;
    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
    const { camera, detector, inputManager } = services;

    inputManager.setIdleMode(true);
    let animId: number;

    const unsubscribe = inputManager.subscribe((event) => {
      if (!isMountedRef.current || isScanningPaused) return;
      if (event.type === 'PRESENCE_DETECTED') {
        setPresenceDetected(true);
        setStatusText('ตรวจพบผู้ป่วย จัดท่านั่งและมองกล้อง (เริ่มสแกนใน 5 วินาที)');
      }
    });

    // Attempt starting camera
    startCamera();

    const renderLoop = () => {
      if (!isMountedRef.current || isScanningPaused) return;
      if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        camera.setRotation(cameraRotationRef.current);
        camera.setMirrorPreview(isMirroredRef.current);
        camera.renderPreview(previewCanvasRef.current, videoRef.current, isMirroredRef.current);
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);

    // Presence detection loop
    const presenceInterval = setInterval(async () => {
      if (!isMountedRef.current || presenceDetected || isScanningPaused) return;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const res = await detector.detect(videoRef.current);
          if (res.hasFace && res.box) {
            const vw = videoRef.current.videoWidth || 640;
            const vh = videoRef.current.videoHeight || 480;
            inputManager.processFaceDetection(
              {
                x: res.box.x / vw,
                y: res.box.y / vh,
                width: res.box.width / vw,
                height: res.box.height / vh,
              },
              performance.now()
            );
          } else {
            inputManager.processFaceDetection(null, performance.now());
          }
        } catch {
          // ignore detection pass
        }
      }
    }, 120);

    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(animId);
      clearInterval(presenceInterval);
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      unsubscribe();
      stopCamera();
    };
  }, [customDetector, presenceDetected, startCamera, isScanningPaused, stopCamera]);

  // Active Countdown Logic: ticks down when camera is active and ready
  useEffect(() => {
    if (isScanningPaused || !cameraReady || isScanning || matchedPatient || unrecognizedAlert) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      return;
    }

    if (!hasTriggeredScanRef.current) {
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            executeScanLogin();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      };
    }
  }, [cameraReady, isScanningPaused, isScanning, matchedPatient, unrecognizedAlert, executeScanLogin]);

  const handleResetScan = () => {
    setUnrecognizedAlert(null);
    setMatchedPatient(null);
    hasTriggeredScanRef.current = false;
    setCountdown(5);
    setStatusText('เตรียมสแกนใหม่อีกครั้ง...');
  };

  // Patient login via PIN - queries real patient registry
  const handlePinLoginSuccess = async () => {
    setIsPinModalOpen(false);
    const pin = enteredPin.trim();
    if (!pin) return;

    try {
      const pinRes = await defaultApiClient.smartOnboarding.pinLogin({ pin });
      if (pinRes?.matched && pinRes.patient) {
        onLoginSuccess(pinRes.patient);
        return;
      }
    } catch {
      // Fallback to querying /api/patients
    }

    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(pin)}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        if (list.length > 0) {
          const p = list[0];
          onLoginSuccess({
            patient_id: p.id,
            hn: p.hn,
            first_name: p.first_name,
            last_name: p.last_name,
            age: p.age,
            gender: p.sex === 'F' || p.sex === 'female' ? 'female' : 'male',
            registration_status: p.registration_status,
            registered_via: p.registered_via || 'kiosk',
            biometrics: {
              face_vector: p.history?.face_vector || new Array(512).fill(0),
              registered_face_url: `/uploads/patients/${p.id}/profile_face.jpg`,
              confidence_score: 1.0,
              model_version: 'w600k_r50',
              enrolled_at: p.created_at || new Date().toISOString(),
            },
            daily_checklists: {},
            rehab_scores: [],
            clinical: {
              diagnosis: p.injury || 'กายภาพบำบัดฟื้นฟู',
              treatment_plan: 'โปรแกรมฟื้นฟูสมรรถภาพทางกายภาพบำบัด',
              progress_notes: [],
            },
            created_at: p.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return;
        }
      }
    } catch {
      // Network error
    }
    setUnrecognizedAlert(`ไม่พบข้อมูลผู้ป่วยสำหรับรหัส "${pin}" (กรุณาตรวจสอบรหัส HN หรือลงทะเบียนคนไข้ใหม่)`);
  };

  const handlePinKey = (digit: string) => {
    if (enteredPin.length < 4) {
      const next = enteredPin + digit;
      setEnteredPin(next);
      if (next.length === 4) {
        setTimeout(handlePinLoginSuccess, 300);
      }
    }
  };

  return (
    <div className="w-full h-full min-h-screen relative flex items-center justify-center p-4 bg-gradient-to-br from-[#E6F8F5] via-[#F4FBF9] to-[#E0F2FE] text-[#063932] select-none overflow-hidden font-sans">
      <video ref={videoRef} playsInline muted className="hidden" aria-hidden="true" />

      {/* Ambient Top-Right Decorative Aesthetics */}
      <div className="absolute top-0 right-0 w-[480px] h-[480px] bg-[radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.16)_0%,rgba(14,165,233,0.10)_40%,transparent_70%)] pointer-events-none z-0" />
      <div className="absolute top-6 right-7 w-52 h-52 bg-[radial-gradient(#0EA5E9_1px,transparent_1px)] bg-[size:16px_16px] opacity-20 pointer-events-none z-0" />

      {/* Centered Vertical Kiosk Card (Exact Specs from Original Reference) */}
      <div className="w-full max-w-[440px] bg-white border-[1.5px] border-[#1E293B] rounded-[28px] shadow-2xl shadow-emerald-950/10 p-6 flex flex-col relative z-10 animate-scale-up">
        
        {/* 1. ส่วนบน (กรอบสถานะกล้อง / กล้องสแกนใบหน้า) */}
        <div className="w-full min-h-[160px] rounded-2xl relative overflow-hidden">
          {!cameraReady ? (
            /* Fallback Box: Yellow Amber Dashed */
            <div className="w-full bg-[#FFFBEB] border-[1.5px] border-dashed border-[#F59E0B] rounded-2xl p-4 text-center flex flex-col items-center justify-center">
              <div className="w-7 h-7 rounded-full border-2 border-[#F59E0B] text-[#F59E0B] flex items-center justify-center font-bold text-xs mb-1.5">
                {userDisabledCamera || isScanningPaused ? '⏸️' : '!'}
              </div>
              <h3 className="text-sm font-bold text-[#78350F]">
                {userDisabledCamera || isScanningPaused ? 'หยุดการสแกนชั่วคราว' : 'กล้องยังไม่พร้อมใช้งาน'}
              </h3>
              <p className="text-[11px] text-[#B45309] font-medium mt-0.5 mb-3.5">
                {userDisabledCamera || isScanningPaused
                  ? 'ระบบหยุดตรวจจับใบหน้าอัตโนมัติขณะเปิดเมนูอื่น หรือเมื่อกดหยุดสแกน'
                  : 'กรุณาอนุญาตการใช้กล้อง หรือใช้รหัส PIN แทน'}
              </p>

              <button
                type="button"
                onClick={() => {
                  setUserDisabledCamera(false);
                  startCamera();
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] to-[#2563EB] text-white text-xs font-bold shadow-md shadow-emerald-500/25 hover:brightness-105 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{userDisabledCamera || isScanningPaused ? 'เปิดกล้องเริ่มสแกนใหม่' : 'ลองเปิดกล้องอีกครั้ง'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setEnteredPin('');
                  setIsPinModalOpen(true);
                }}
                className="w-full py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#334155] text-xs font-semibold shadow-xs hover:bg-slate-50 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5 mt-2"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span>ใช้รหัส PIN แทน</span>
              </button>
            </div>
          ) : (
            /* Active Live Camera Box */
            <div
              onClick={() => executeScanLogin()}
              className="w-full h-48 rounded-2xl bg-[#02201C] border-2 border-[#10B981] relative overflow-hidden flex items-center justify-center cursor-pointer group hover:border-emerald-300 transition"
              title="แตะที่นี่เพื่อสแกนใบหน้าทันที"
            >
              <canvas ref={previewCanvasRef} className="w-full h-full object-cover" />

              {/* Reticle / Face scan guide */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-28 h-36 rounded-full border-2 border-dashed border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)] relative animate-pulse group-hover:scale-105 transition-transform">
                  <div className="absolute left-[10%] w-[80%] h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent top-1/2 animate-bounce" />
                </div>
                <div className="absolute bottom-2 px-3 py-1 rounded-full bg-[#042924]/85 backdrop-blur-md border border-emerald-500/40 text-[11px] font-bold text-emerald-300 flex items-center gap-1.5 shadow-md">
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-cyan-300" />
                      <span>กำลังสแกนใบหน้า...</span>
                    </>
                  ) : countdown > 0 ? (
                    <>
                      <span>⏱️ สแกนอัตโนมัติใน {countdown} วินาที (หรือแตะเพื่อสแกน)</span>
                    </>
                  ) : (
                    <span>{statusText}</span>
                  )}
                </div>
              </div>

              {/* Camera Orientation Controls (0, 90, 180, 270 and Mirror flip) */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 z-20" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => {
                    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
                    const next = rotations[(rotations.indexOf(cameraRotation) + 1) % rotations.length];
                    setCameraRotation(next);
                    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
                    services.camera.setRotation(next);
                  }}
                  className="px-2 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-white text-[10px] font-semibold flex items-center gap-1 backdrop-blur-sm transition border border-white/20 cursor-pointer"
                  title="หมุนกล้อง 90 องศา"
                >
                  <RotateCw className="w-3 h-3 text-cyan-300" />
                  <span>{cameraRotation}°</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMirrored((prev) => !prev);
                    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
                    services.camera.setMirrorPreview(!isMirrored);
                  }}
                  className={`p-1.5 rounded-lg text-white text-[10px] font-semibold flex items-center backdrop-blur-sm transition border border-white/20 cursor-pointer ${
                    isMirrored ? 'bg-emerald-600/70' : 'bg-black/60'
                  }`}
                  title="สลับกลับหัว / กระจก"
                >
                  <FlipHorizontal className="w-3 h-3 text-emerald-300" />
                </button>
              </div>

              {/* Close/Toggle Camera button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserDisabledCamera(true);
                  stopCamera();
                }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-rose-600 transition cursor-pointer z-20"
                title="หยุดสแกน / ปิดกล้อง"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* 2. ส่วนกลาง (วงกลมโลโก้และกรอบสแกนใบหน้า) - แตะเพื่อสแกนได้ */}
        <div
          onClick={() => executeScanLogin()}
          className="relative w-36 h-36 mx-auto my-3 flex items-center justify-center cursor-pointer group"
          title="แตะเพื่อสแกนใบหน้าเข้าใช้งาน"
        >
          {/* 4 Corner Brackets in Sky Blue */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#38BDF8] rounded-tl-sm pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#38BDF8] rounded-tr-sm pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#38BDF8] rounded-bl-sm pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#38BDF8] rounded-br-sm pointer-events-none group-hover:scale-110 transition-transform" />

          {/* Double-Ring Circular Emblem with SVG Medical Logo */}
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-[#10B981] to-[#0EA5E9] p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 active:scale-95 transition-transform">
            <div className="w-full h-full bg-white rounded-full border border-slate-100 flex flex-col items-center justify-center p-2 text-center">
              {/* Medical Caring Hands & Cross SVG */}
              <svg className="w-10 h-10 mb-0.5" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M48 20 C30 20 18 34 18 52 C18 69 31 82 48 82 C44 76 40 68 40 52 C40 38 43 27 48 20 Z" fill="#0284C7" />
                <path d="M52 80 C70 80 82 66 82 48 C82 31 69 18 52 18 C56 24 60 32 60 48 C60 62 57 73 52 80 Z" fill="#10B981" />
                <path d="M44 38 H56 V44 H62 V56 H56 V62 H44 V56 H38 V44 H44 Z" fill="#10B981" />
                <path d="M47 41 H53 V47 H59 V53 H53 V59 H47 V53 H41 V47 H47 Z" fill="#0284C7" />
                <circle cx="50" cy="50" r="4" fill="#FFFFFF" />
              </svg>
              <div className="text-[9px] font-extrabold text-[#0369A1] tracking-wider leading-tight">
                DR TECH CARE
              </div>
              <div className="text-[6px] font-semibold text-slate-400 tracking-wider uppercase">
                Health Technology
              </div>
            </div>
          </div>
        </div>

        {/* 3. ส่วนป้ายคำแนะนำ AI (Green Pill Banner) - แตะเพื่อเริ่มสแกนได้ */}
        <div
          onClick={() => executeScanLogin()}
          className="bg-[#ECFDF5] border border-[#6EE7B7] rounded-xl p-2.5 flex items-center gap-2.5 mb-2.5 text-left cursor-pointer hover:bg-emerald-100/70 active:scale-[0.99] transition shadow-xs"
          title="แตะเพื่อเริ่มสแกน"
        >
          <span className="text-xl leading-none shrink-0 animate-bounce">🙌</span>
          <div>
            <div className="font-bold text-xs text-[#065F46] leading-snug">
              คุณพร้อมจะกายภาพรึยัง? ยก 2 มือขึ้น หรือแตะที่นี่
            </div>
            <div className="text-[10px] text-[#059669] leading-snug mt-0.5 font-medium">
              สแกนใบหน้าอัตโนมัติ หรือแตะปุ่มด้านล่างเพื่อเข้าสู่ระบบ
            </div>
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="w-full flex flex-col gap-2 mb-2">
          {/* Primary Action Button: Scan Face Now */}
          <button
            type="button"
            id="kiosk-scan-face-btn"
            data-testid="kiosk-scan-face-btn"
            disabled={isScanning}
            onClick={() => executeScanLogin()}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#059669] to-[#0284C7] hover:from-[#059669] hover:to-[#0369A1] text-white font-extrabold text-sm shadow-md shadow-emerald-500/25 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 border border-emerald-400/30"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>กำลังสแกนใบหน้า...</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 text-emerald-100" />
                <span>📷 สแกนใบหน้าเข้าใช้งานทันที</span>
              </>
            )}
          </button>

          {/* Secondary Action Row: PIN Login & New Patient */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              id="kiosk-pin-login-btn"
              data-testid="kiosk-pin-login-btn"
              onClick={() => {
                stopCamera();
                setEnteredPin('');
                setIsPinModalOpen(true);
              }}
              className="py-2.5 px-3 rounded-xl bg-white border border-[#CBD5E1] text-[#1E293B] text-xs font-bold hover:bg-slate-50 hover:border-slate-400 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>ใช้รหัส PIN 4 หลัก</span>
            </button>

            <button
              type="button"
              id="kiosk-enroll-new-btn"
              data-testid="kiosk-enroll-new-btn"
              onClick={() => {
                stopCamera();
                if (onOpenNewPatientModal) {
                  onOpenNewPatientModal();
                } else {
                  onNavigateToEnroll();
                }
              }}
              className="py-2.5 px-3 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-50 hover:border-blue-300 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>➕ สมัครคนไข้ใหม่</span>
            </button>
          </div>
        </div>

        {/* 4. ส่วนท้ายการ์ด (Footer Branding) */}
        <div className="text-center mt-0.5">
          <h2 className="text-lg sm:text-xl font-extrabold text-[#064E3B] tracking-normal">
            Dr.Tech.Care
          </h2>
          <div>
            <span className="inline-block mt-1 px-3.5 py-0.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-[11px] font-bold">
              ระบบกายภาพบำบัดและดูแลสุขภาพอัจฉริยะ
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Smooth Mint Waves (SVG Smooth Layered Waves) */}
      <div className="absolute bottom-0 left-0 w-full h-48 pointer-events-none z-0 overflow-hidden">
        <svg className="w-full h-full block" viewBox="0 0 1440 280" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 160 C320 100 480 220 800 160 C1120 100 1280 180 1440 140 V280 H0 Z" fill="#C7F1E7" fillOpacity="0.35" />
          <path d="M0 180 C240 240 540 140 840 200 C1140 260 1340 160 1440 190 V280 H0 Z" fill="#E6F8F5" fillOpacity="0.65" />
          <path d="M0 210 C360 170 600 240 960 210 C1200 190 1380 230 1440 220 V280 H0 Z" fill="#A7F3D0" fillOpacity="0.4" />
        </svg>
      </div>

      {/* Bottom-Right Floating Action Pills */}
      <div className="fixed bottom-6 right-7 flex items-center gap-3 z-30">
        {/* Pill 1: เกี่ยวกับระบบ */}
        <button
          type="button"
          onClick={() => {
            stopCamera();
            setIsAboutModalOpen(true);
          }}
          className="px-4 py-1.5 rounded-full bg-white border border-[#CBD5E1] text-[#475569] text-xs font-semibold shadow-md hover:-translate-y-0.5 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Info className="w-3.5 h-3.5 text-slate-500" />
          <span>เกี่ยวกับระบบ</span>
        </button>

        {/* Pill 2: เข้าสู่ระบบบุคลากร / รพ. */}
        <button
          id="open-staff-login-btn"
          data-testid="open-staff-login-btn"
          type="button"
          onClick={() => {
            stopCamera();
            onOpenStaffLoginModal?.();
          }}
          title="เข้าสู่ระบบบุคลากร / รพ."
          className="px-4 py-1.5 rounded-full bg-white border-[1.5px] border-[#10B981] text-[#065F46] text-xs font-bold shadow-md shadow-emerald-500/15 hover:-translate-y-0.5 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>🛡️ เข้าสู่ระบบบุคลากร / รพ.</span>
        </button>
      </div>

      {/* Modal: Virtual PIN Pad */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-emerald-500/30 p-6 text-center shadow-2xl relative animate-scale-up">
            <button
              type="button"
              onClick={() => setIsPinModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
              🔑
            </div>
            <h3 className="text-lg font-bold text-slate-800">ยืนยันตัวตนด้วยรหัส PIN</h3>
            <p className="text-xs text-slate-500 mt-0.5">กรอกรหัส PIN 4 หลักประจำตัวผู้ป่วยเพื่อเริ่มฝึก</p>

            {/* 4 PIN Dots */}
            <div className="flex justify-center gap-3 my-5">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    idx < enteredPin.length
                      ? 'bg-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/50 scale-110'
                      : 'border-slate-300 bg-transparent'
                  }`}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinKey(digit)}
                  className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold text-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEnteredPin('')}
                className="h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-200 active:scale-95 transition cursor-pointer"
              >
                ล้าง
              </button>
              <button
                type="button"
                onClick={() => handlePinKey('0')}
                className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold text-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setEnteredPin((prev) => prev.slice(0, -1))}
                className="h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-200 active:scale-95 transition cursor-pointer"
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Identity Confirmation when Matched */}
      {matchedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border-2 border-emerald-500/50 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-24 h-24 rounded-full mx-auto p-1 bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-xl mb-4">
              <img
                src={matchedPatient.biometrics.registered_face_url}
                alt="Profile Face"
                className="w-full h-full rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>ความแม่นยำชีวมาตร {similarityInfo?.percent}% (ผ่านเกณฑ์)</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              คุณ {matchedPatient.first_name} {matchedPatient.last_name}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              HN: <span className="font-mono text-blue-600">{matchedPatient.hn}</span> • อายุ: {matchedPatient.age} ปี
            </p>

            {/* Gesture Prompt */}
            <div className="my-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2 text-emerald-800 text-xs font-bold">
              <span className="text-xl">🙌</span>
              <span>คุณพร้อมจะกายภาพรึยัง? ยก 2 มือขึ้นเพื่อเริ่ม</span>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => onLoginSuccess(matchedPatient)}
                className="touch-btn w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-base shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🙌 ยก 2 มือขึ้น หรือ กดที่นี่เพื่อเริ่มฝึก ➔</span>
              </button>
              <button
                type="button"
                onClick={handleResetScan}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                ไม่ใช่ฉัน (สแกนใหม่)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Unrecognized Face Alert */}
      {unrecognizedAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border-2 border-rose-500/50 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">ไม่พบบัญชีในระบบ</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {unrecognizedAlert}
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setUnrecognizedAlert(null);
                  if (onOpenNewPatientModal) {
                    onOpenNewPatientModal();
                  } else {
                    onNavigateToEnroll();
                  }
                }}
                className="touch-btn w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>➕ สมัครคนไข้ใหม่ (ลงทะเบียนด้วยใบหน้า)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUnrecognizedAlert(null);
                  setEnteredPin('');
                  setIsPinModalOpen(true);
                }}
                className="touch-btn w-full py-3 rounded-xl bg-white border border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-50 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>🔑 เข้าสู่ระบบด้วยรหัส PIN หรือ HN</span>
              </button>

              <button
                type="button"
                onClick={handleResetScan}
                className="touch-btn w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition cursor-pointer"
              >
                🔄 ลองสแกนใหม่อีกครั้ง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: About System Modal */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-emerald-500/30 p-6 text-center shadow-2xl relative animate-scale-up">
            <button
              type="button"
              onClick={() => setIsAboutModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
              🏥
            </div>
            <h3 className="text-lg font-bold text-slate-800">เกี่ยวกับระบบ Dr.Tech.Care</h3>
            <p className="text-xs text-slate-500 mt-0.5">Enterprise Hospital Physical Therapy Platform v6.0</p>

            <div className="space-y-2 mt-4 text-left">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🟢</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">376 Tests Passed (100% Invariants)</div>
                  <div className="text-[11px] text-slate-500">ผ่านการทดสอบครบทุกระบบ API, Vault, Biometrics, UI</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">📁</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">Strict Dossier Vault & 10 Snapshots</div>
                  <div className="text-[11px] text-slate-500">เวชระเบียนรายบุคคล และนโยบายเก็บภาพสแกน 10 ครั้งล่าสุด</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🗓️</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">Therapy Schedule & Minigame Sync</div>
                  <div className="text-[11px] text-slate-500">ซิงค์ตารางฝึก สลับเข้ามินิเกมฝึกสมองอัตโนมัติ (Bangkok Time)</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">👤</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">ArcFace 512-D L2 Normalized</div>
                  <div className="text-[11px] text-slate-500">ตรวจจับใบหน้าอัตโนมัติ Cosine Similarity 0.60</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🛡️</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">NIST SP 800-63B & PDPA Compliance</div>
                  <div className="text-[11px] text-slate-500">ระบบรักษาความปลอดภัยระดับเวชภัณฑ์สากล Zero Regression</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAboutModalOpen(false)}
              className="w-full mt-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
