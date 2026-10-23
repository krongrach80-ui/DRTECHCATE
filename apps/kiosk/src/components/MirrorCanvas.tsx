import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';

interface MirrorCanvasProps {
  showRing?: boolean;
  ringProgress?: number; // 0 to 10
  guidanceText?: string;
  className?: string;
}

export const MirrorCanvas: React.FC<MirrorCanvasProps> = ({
  showRing = true,
  ringProgress = 0,
  guidanceText = 'กรุณามองตรงที่กล้อง',
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<boolean>(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            },
            audio: false,
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            setCameraActive(true);
          }
        } else {
          setCameraError(true);
        }
      } catch {
        // Fallback gracefully to simulated mirror environment
        setCameraError(true);
      }
    }

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/90 shadow-2xl flex items-center justify-center ${className}`}
    >
      {/* Live Video Mirror Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${
          cameraActive ? 'opacity-90' : 'opacity-0'
        }`}
      />

      {/* Simulated Mirror Feed Fallback (when camera permission not granted or in virtual environment) */}
      {!cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-slate-900 to-slate-950">
          <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
            <Camera className="w-10 h-10 text-blue-400 animate-pulse" />
          </div>
          <p className="text-base font-medium text-slate-300">
            {cameraError ? 'กำลังจำลองสัญญาณภาพหน้ากระจก (Mirror Simulation)' : 'กำลังเชื่อมต่อกล้องหน้าตู้...'}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            ระบบรองรับทั้งกล้องเว็บแคมความละเอียดสูงและอุปกรณ์ตรวจจับใบหน้าอัตโนมัติ
          </p>
        </div>
      )}

      {/* 10-Tick Biometric Ring & Head Silhouette Overlay */}
      {showRing && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="relative w-64 h-80 sm:w-80 sm:h-96 rounded-full border-2 border-dashed border-blue-400/50 flex items-center justify-center shadow-[0_0_50px_rgba(59,130,246,0.15)]">
            {/* 10-Tick Progress Arc */}
            <div className="absolute -inset-4">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="4"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="rgb(59, 130, 246)"
                  strokeWidth="4"
                  strokeDasharray="289"
                  strokeDashoffset={289 - (289 * Math.min(10, ringProgress)) / 10}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
              </svg>
            </div>

            {/* Inner scanner reticle */}
            <div className="w-48 h-64 rounded-full border border-blue-500/20 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-blue-400/40 animate-spin-slow" />
            </div>
          </div>

          {/* Thai Guidance Prompt Badge */}
          {guidanceText && (
            <div className="mt-6 px-6 py-2.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700/80 text-blue-200 text-base font-semibold shadow-xl">
              {guidanceText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
