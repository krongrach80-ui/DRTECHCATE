/**
 * apps/kiosk/src/views/IdleView.tsx
 * Screensaver / IDLE View with Real-Time Face Presence Detection (Spec 13.1)
 *
 * Privacy Invariant:
 * - Zero image recording during screensaver/idle state (Rule 13.1 Line 291).
 * - Only bounding box coordinates are evaluated by FacePresenceTracker.
 * - Minimum face size ratio: 0.10.
 * - Stable holding duration: 1,000ms before declaring presence.
 * - Absence hysteresis: 2,000ms to eliminate flicker.
 * - Always-available Touch fallback.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FloatingLogo } from '../components/FloatingLogo';
import { UserCheck, Sparkles, Touchpad, AlertTriangle, Bell, RefreshCw } from 'lucide-react';
import { getFaceClientServices } from '../services/faceClientService';
import { FaceDetector } from '../../../../packages/face-client/src/index.js';
import { KioskInputEvent } from '../../../../packages/kiosk-input/src/index.js';

interface IdleViewProps {
  onStart: () => void;
  onCallStaff: () => void;
  isDetectorReady?: boolean;
  onDetectorReadyChange?: (ready: boolean) => void;
  customDetector?: FaceDetector;
}

export const IdleView: React.FC<IdleViewProps> = ({
  onStart,
  onCallStaff,
  isDetectorReady: initialDetectorReady = false,
  onDetectorReadyChange,
  customDetector,
}) => {
  const [detectorReady, setDetectorReady] = useState<boolean>(initialDetectorReady);
  const [isInitializing, setIsInitializing] = useState<boolean>(!initialDetectorReady);
  const [initError, setInitError] = useState<string | null>(null);
  const [staffCalled, setStaffCalled] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isDetectingRef = useRef<boolean>(false);
  const hasStartedRef = useRef<boolean>(false);
  const onStartRef = useRef(onStart);

  useEffect(() => {
    onStartRef.current = onStart;
  }, [onStart]);

  const handleSafeStart = useCallback(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    onStartRef.current();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    hasStartedRef.current = false;
    isDetectingRef.current = false;

    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
    const { camera, detector, inputManager } = services;

    inputManager.setIdleMode(true);

    // Subscribe to presence events
    const unsubscribe = inputManager.subscribe((event: KioskInputEvent) => {
      if (!isMountedRef.current) return;
      if (event.type === 'PRESENCE_DETECTED') {
        handleSafeStart();
      }
    });

    let loopActive = true;
    let detectionTimer: ReturnType<typeof setInterval> | null = null;
    const videoElement = videoRef.current;

    async function initIdleTracker() {
      try {
        setIsInitializing(true);
        setInitError(null);

        if (videoRef.current) {
          await camera.start(videoRef.current);
        }

        if (isMountedRef.current) {
          setDetectorReady(true);
          setIsInitializing(false);
          onDetectorReadyChange?.(true);
        }

        // Real-time detection loop with mutex guard (prevents overlapping async calls)
        const checkFace = async () => {
          if (
            !loopActive ||
            !isMountedRef.current ||
            isDetectingRef.current ||
            (typeof document !== 'undefined' && document.hidden)
          ) {
            return;
          }

          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            isDetectingRef.current = true;
            try {
              const res = await detector.detect(video);
              const now = performance.now();
              if (res.hasFace && res.box) {
                const vw = video.videoWidth || 640;
                const vh = video.videoHeight || 480;
                inputManager.processFaceDetection(
                  {
                    x: res.box.x / vw,
                    y: res.box.y / vh,
                    width: res.box.width / vw,
                    height: res.box.height / vh,
                  },
                  now
                );
              } else {
                inputManager.processFaceDetection(null, now);
              }
            } catch {
              // Ignore transient frame evaluation error
            } finally {
              isDetectingRef.current = false;
            }
          }
        };

        detectionTimer = setInterval(checkFace, 150);
      } catch (err: unknown) {
        if (isMountedRef.current) {
          const msg = err instanceof Error ? err.message : 'Camera or detector initialization failed';
          setInitError(msg);
          setDetectorReady(false);
          setIsInitializing(false);
          onDetectorReadyChange?.(false);
        }
      }
    }

    initIdleTracker();

    return () => {
      isMountedRef.current = false;
      loopActive = false;
      if (detectionTimer) clearInterval(detectionTimer);
      unsubscribe();
      camera.stop();
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoElement.srcObject = null;
      }
    };
  }, [handleSafeStart, onDetectorReadyChange, customDetector]);

  return (
    <div
      onClick={detectorReady ? handleSafeStart : undefined}
      className={`w-full h-full flex flex-col items-center justify-between py-16 px-8 select-none bg-radial from-slate-900/60 via-slate-950 to-slate-950 ${
        detectorReady ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      {/* Hidden background video element for presence stream (NO recording) */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
        aria-hidden="true"
      />

      {/* Top hospital banner */}
      <div className="flex items-center gap-2 text-slate-400 text-sm font-medium tracking-wide">
        <Sparkles className="w-4 h-4 text-blue-400" />
        <span>โรงพยาบาลกายภาพบำบัดอัจฉริยะ • ศูนย์ฟื้นฟูข้อต่อและกล้ามเนื้อ</span>
      </div>

      {/* Center floating emblem */}
      <div className="flex flex-col items-center text-center my-auto">
        <FloatingLogo />

        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mt-10 tracking-normal">
          DrTech<span className="text-blue-400">.Care</span>
        </h1>
        <p className="text-xl text-blue-200/80 font-light mt-3">
          ตู้ตรวจประเมินและฝึกกายภาพบำบัดอัจฉริยะ
        </p>

        {/* Loading state vs Fail-closed condition vs Ready state */}
        {isInitializing && !initError ? (
          <div className="mt-12 flex items-center gap-3 px-8 py-4 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300 font-semibold text-base shadow-xl">
            <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
            <span>กำลังเตรียมระบบกล้องตรวจจับอัตโนมัติ...</span>
          </div>
        ) : !detectorReady ? (
          <div className="mt-10 flex flex-col items-center gap-4 max-w-md p-6 rounded-3xl bg-rose-950/40 border border-rose-500/40 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-lg">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
              <span>ระบบสแกนใบหน้ายังไม่พร้อม</span>
            </div>
            <p className="text-sm text-slate-300 text-center leading-relaxed">
              {initError ||
                'ไม่พบโมเดลตรวจจับใบหน้าหรือกล้องยังไม่พร้อมใช้งาน ระบบปิดการทำงานอัตโนมัติเพื่อความปลอดภัย (Fail-Closed)'}
            </p>
            <button
              type="button"
              disabled={staffCalled}
              onClick={(e) => {
                e.stopPropagation();
                if (staffCalled) return;
                setStaffCalled(true);
                onCallStaff();
              }}
              className="mt-2 touch-btn px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-base shadow-lg shadow-rose-600/40 flex items-center gap-2 transition"
            >
              <Bell className="w-5 h-5" />
              <span>{staffCalled ? 'แจ้งเจ้าหน้าที่แล้ว' : 'เรียกเจ้าหน้าที่'}</span>
            </button>
          </div>
        ) : (
          /* Pulsing Start Cue when detector is ready */
          <div className="mt-12 flex items-center gap-3 px-8 py-4 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 font-semibold text-lg shadow-2xl animate-pulse">
            <Touchpad className="w-6 h-6 text-blue-400" />
            <span>แตะหน้าจอหรือนั่งหน้าตู้เพื่อเริ่มต้น</span>
          </div>
        )}
      </div>

      {/* Bottom guidance */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <UserCheck className="w-4 h-4 text-emerald-400" />
        <span>ระบบตรวจจับใบหน้านิ่งอัตโนมัติ 1 วินาที (Privacy Preserved: ไม่มีการบันทึกภาพ)</span>
      </div>
    </div>
  );
};
