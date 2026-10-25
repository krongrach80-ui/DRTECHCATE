/**
 * apps/kiosk/src/views/ConfirmView.tsx
 * Identity Confirmation View with Hands-Free Head Nod Detector (Spec 13.3)
 *
 * Invariants:
 * 1. Privacy Minimization: Displays ONLY first name and signed avatar URL (Rule 7.4 Line 205).
 * 2. Hands-Free Accessibility: Head nod (downward pitch >= 12 deg + recovery) triggers onConfirm().
 * 3. Fallback: Always-available touch buttons ("ใช่ ข้อมูลถูกต้อง" and "ไม่ใช่ฉัน").
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { User, Check, X, ShieldCheck, Sparkles } from 'lucide-react';
import { getFaceClientServices } from '../services/faceClientService';
import { KioskInputEvent } from '../../../../packages/kiosk-input/src/index.js';

interface ConfirmViewProps {
  firstName: string;
  avatarUrl?: string | null;
  onConfirm: () => void;
  onDeny: () => void;
}

export const ConfirmView: React.FC<ConfirmViewProps> = ({
  firstName,
  avatarUrl,
  onConfirm,
  onDeny,
}) => {
  const [nodConfirmed, setNodConfirmed] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const hasConfirmedRef = useRef<boolean>(false);

  const handleConfirm = useCallback(() => {
    if (hasConfirmedRef.current) return;
    hasConfirmedRef.current = true;
    onConfirm();
  }, [onConfirm]);

  const handleDeny = useCallback(() => {
    if (hasConfirmedRef.current) return;
    hasConfirmedRef.current = true;
    onDeny();
  }, [onDeny]);

  useEffect(() => {
    isMountedRef.current = true;
    const services = getFaceClientServices();
    const { camera, detector, inputManager } = services;
    inputManager.setIdleMode(false);

    const unsubscribe = inputManager.subscribe((event: KioskInputEvent) => {
      if (hasConfirmedRef.current || !isMountedRef.current) return;
      if (event.type === 'HEAD_NOD_CONFIRMED') {
        setNodConfirmed(true);
        setTimeout(() => {
          handleConfirm();
        }, 350);
      }
    });

    let loopActive = true;
    let nodInterval: NodeJS.Timeout | null = null;

    async function initHeadNodTracker() {
      try {
        if (videoRef.current) {
          await camera.start(videoRef.current);
        }

        const checkNod = async () => {
          if (!loopActive || !isMountedRef.current || hasConfirmedRef.current) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            try {
              const res = await detector.detect(video);
              if (res.hasFace && res.landmarks?.noseTip) {
                const vw = video.videoWidth || 640;
                const vh = video.videoHeight || 480;
                inputManager.processHeadPose(
                  {
                    x: res.landmarks.noseTip.x / vw,
                    y: res.landmarks.noseTip.y / vh,
                  },
                  performance.now()
                );
              } else {
                inputManager.processHeadPose(null, performance.now());
              }
            } catch {
              // Frame evaluation pass
            }
          }
        };

        nodInterval = setInterval(checkNod, 60);
      } catch {
        // Fallback to touch only
      }
    }

    initHeadNodTracker();

    return () => {
      isMountedRef.current = false;
      loopActive = false;
      if (nodInterval) clearInterval(nodInterval);
      unsubscribe();
    };
  }, [handleConfirm]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-10 px-8 select-none bg-slate-950">
      {/* Hidden camera preview for head nod detection */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>ขั้นตอนที่ 3 / 3 • ยืนยันข้อมูลด้วยการสัมผัส หรือพยักหน้า</span>
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
          ยืนยันความถูกต้องของข้อมูล
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          เพื่อความปลอดภัยและความเป็นส่วนตัวของเวชระเบียน กรุณาตรวจสอบชื่อของท่าน
        </p>
      </div>

      {/* Identity Card (Strict Privacy Minimization: ONLY first name and avatar) */}
      <div
        className={`my-auto w-full max-w-md p-8 rounded-3xl bg-slate-900/90 border-2 transition-all duration-300 shadow-2xl flex flex-col items-center text-center ${
          nodConfirmed
            ? 'border-emerald-400 ring-4 ring-emerald-500/40 scale-105'
            : 'border-blue-500/30'
        }`}
      >
        {/* Avatar Thumbnail */}
        <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 p-1 mb-6 shadow-xl shadow-blue-500/20">
          <div className="w-full h-full rounded-full bg-slate-950 overflow-hidden flex items-center justify-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="รูปถ่ายผู้ป่วย"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-14 h-14 text-blue-300" />
            )}
          </div>
        </div>

        {/* First Name Only Prompt */}
        <p className="text-sm text-slate-400">ท่านคือผู้รับบริการชื่อ</p>
        <div className="text-4xl font-extrabold text-white mt-1 tracking-normal">
          คุณ {firstName}
        </div>
        <p className="text-xs text-blue-300/80 mt-2">
          ใช่หรือไม่?
        </p>

        {/* Head Nod Status Badge */}
        {nodConfirmed ? (
          <div className="mt-4 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-bounce">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>ตรวจพบการพยักหน้า ยืนยันข้อมูลถูกต้อง!</span>
          </div>
        ) : (
          <div className="mt-4 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-medium flex items-center gap-1.5">
            <span>💡 สามารถพยักหน้า (ก้ม-เงย) เพื่อยืนยันได้โดยไม่ต้องสัมผัสจอ</span>
          </div>
        )}

        {/* PDPA Badge */}
        <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>ระบบปิดบังนามสกุลและเลข HN เพื่อคุ้มครองข้อมูลส่วนบุคคล</span>
        </div>
      </div>

      {/* Giant Confirmation Buttons */}
      <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
        {/* Deny Button */}
        <button
          onClick={handleDeny}
          className="touch-btn py-5 rounded-3xl bg-slate-900 hover:bg-slate-800 text-rose-300 font-bold text-xl border-2 border-rose-500/40 shadow-xl flex items-center justify-center gap-3 order-2 sm:order-1"
        >
          <X className="w-6 h-6 text-rose-400" />
          <span>ไม่ใช่ฉัน (ยกเลิก)</span>
        </button>

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          className="touch-btn py-5 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-3 order-1 sm:order-2"
        >
          <Check className="w-7 h-7 text-white" />
          <span>ใช่ ข้อมูลถูกต้อง</span>
        </button>
      </div>
    </div>
  );
};
