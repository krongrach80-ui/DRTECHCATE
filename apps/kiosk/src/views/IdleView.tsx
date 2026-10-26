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

import React, { useEffect, useRef, useState } from 'react';
import { FloatingLogo } from '../components/FloatingLogo';
import { UserCheck, Sparkles, Touchpad, AlertTriangle, Bell } from 'lucide-react';
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
  const [initError, setInitError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
    const { camera, detector, inputManager } = services;

    inputManager.setIdleMode(true);

    // Subscribe to presence events
    const unsubscribe = inputManager.subscribe((event: KioskInputEvent) => {
      if (!isMountedRef.current) return;
      if (event.type === 'PRESENCE_DETECTED') {
        onStart();
      }
    });

    let loopActive = true;
    let detectionTimer: NodeJS.Timeout | null = null;

    async function initIdleTracker() {
      try {
        if (videoRef.current) {
          await camera.start(videoRef.current);
        }

        if (isMountedRef.current) {
          setDetectorReady(true);
          onDetectorReadyChange?.(true);
        }

        // Real-time detection loop (evaluates bounding box only, NO image capture)
        const checkFace = async () => {
          if (!loopActive || !isMountedRef.current) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            try {
              const res = await detector.detect(video);
              const now = performance.now();
              if (res.hasFace && res.box) {
                const vw = video.videoWidth || 640;
                const vh = video.videoHeight || 480;
                // Normalized bounding box [0.0 - 1.0]
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
              // Frame evaluation error
            }
          }
        };

        detectionTimer = setInterval(checkFace, 150);
      } catch (err: unknown) {
        if (isMountedRef.current) {
          const msg = err instanceof Error ? err.message : 'Camera or detector initialization failed';
          setInitError(msg);
          setDetectorReady(false);
          onDetectorReadyChange?.(false);
        }
      }
    }

    const videoElement = videoRef.current;
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
  }, [onStart, onDetectorReadyChange, customDetector]);

  return (
    <div
      onClick={detectorReady ? onStart : undefined}
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

        {/* Fail-closed condition when detector is not available */}
        {!detectorReady ? (
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
              onClick={(e) => {
                e.stopPropagation();
                onCallStaff();
              }}
              className="mt-2 touch-btn px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base shadow-lg shadow-rose-600/40 flex items-center gap-2 transition"
            >
              <Bell className="w-5 h-5" />
              <span>เรียกเจ้าหน้าที่</span>
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
