/**
 * apps/admin/src/smart-portal/LiveMotionCaptureCalibrator.tsx
 *
 * PT LIVE WEBCAM MOTION-CAPTURE CALIBRATOR
 * Allows physical therapists to record 2-3 sample repetitions via webcam
 * to automatically calibrate joint angles and hold duration.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Play, CheckCircle2, RotateCcw, ArrowRight, X, Activity } from 'lucide-react';
import {
  CalibrationRecorder,
  CalibrationResult,
} from '../../../../packages/pose-engine/src/engine/calibrationRecorder';
import { LandmarkTriplet, PoseEngineLandmark } from '../../../../packages/pose-engine/src/types/exerciseConfig';

interface LiveMotionCaptureCalibratorProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCalibration: (result: CalibrationResult) => void;
  triplet: LandmarkTriplet;
  jointNameTh: string;
}

export const LiveMotionCaptureCalibrator: React.FC<LiveMotionCaptureCalibratorProps> = ({
  isOpen,
  onClose,
  onApplyCalibration,
  triplet,
  jointNameTh,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<CalibrationRecorder>(new CalibrationRecorder());
  const isMountedRef = useRef(true);
  const animFrameIdRef = useRef<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [currentAngle, setCurrentAngle] = useState<number>(0);
  const [calibrationResult, setCalibrationResult] = useState<CalibrationResult | null>(null);
  const [samplesCount, setSamplesCount] = useState<number>(0);

  const drawJointOnCanvas = useCallback(
    (landmarks: PoseEngineLandmark[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      if (
        landmarks.length > triplet.pointA &&
        landmarks.length > triplet.vertex &&
        landmarks.length > triplet.pointB
      ) {
        const pA = landmarks[triplet.pointA];
        const pV = landmarks[triplet.vertex];
        const pB = landmarks[triplet.pointB];

        // Draw lines
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(pA.x * w, pA.y * h);
        ctx.lineTo(pV.x * w, pV.y * h);
        ctx.lineTo(pB.x * w, pB.y * h);
        ctx.stroke();

        // Draw vertex circle
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(pV.x * w, pV.y * h, 8, 0, 2 * Math.PI);
        ctx.fill();
      }
    },
    [triplet]
  );

  // Initialize camera and tracking loop
  useEffect(() => {
    if (!isOpen) return;
    isMountedRef.current = true;
    let stream: MediaStream | null = null;
    let landmarker: any = null;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false,
        });
        if (videoRef.current && isMountedRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const vision = await import('@mediapipe/tasks-vision');
        let filesetResolver: any;
        try {
          filesetResolver = await vision.FilesetResolver.forVisionTasks('/models/wasm');
        } catch {
          filesetResolver = await vision.FilesetResolver.forVisionTasks('/wasm');
        }

        try {
          landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath: '/models/pose_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        } catch {
          try {
            landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: '/models/pose_landmarker.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
            });
          } catch {
            landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: '/models/pose_landmarker_lite.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
            });
          }
        }

        startLoop(landmarker);
      } catch (err) {
        console.warn('Camera calibrator warning:', err);
      }
    }

    const startLoop = (detector: any) => {
      let lastTime = 0;
      const loop = () => {
        if (!isMountedRef.current) return;
        const now = Date.now();

        if (videoRef.current && videoRef.current.readyState >= 2 && now - lastTime >= 33) {
          lastTime = now;
          try {
            const results = detector.detectForVideo(videoRef.current, now);
            if (results.landmarks && results.landmarks[0]) {
              const rawLandmarks: PoseEngineLandmark[] = results.landmarks[0].map((lm: any) => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
                visibility: lm.visibility ?? 0.9,
              }));

              const angle = recorderRef.current.recordFrame(rawLandmarks, triplet, now);
              if (angle !== null) {
                setCurrentAngle(Math.round(angle));
                setSamplesCount(recorderRef.current.getSampleCount());
              }

              drawJointOnCanvas(rawLandmarks);
            }
          } catch {
            // non-blocking
          }
        }
        animFrameIdRef.current = requestAnimationFrame(loop);
      };
      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    initCamera();

    return () => {
      isMountedRef.current = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (landmarker && typeof landmarker.close === 'function') landmarker.close();
    };
  }, [isOpen, triplet, drawJointOnCanvas]);

  const handleStartRecording = () => {
    recorderRef.current.start();
    setIsRecording(true);
    setCalibrationResult(null);
  };

  const handleStopRecording = () => {
    const result = recorderRef.current.stop();
    setIsRecording(false);
    setCalibrationResult(result);
  };

  const handleReset = () => {
    recorderRef.current.reset();
    setIsRecording(false);
    setCalibrationResult(null);
    setSamplesCount(0);
  };

  const handleApply = () => {
    if (calibrationResult) {
      onApplyCalibration(calibrationResult);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border-2 border-emerald-500/50 shadow-2xl p-6 text-white flex flex-col justify-between max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                บันทึกท่าต้นแบบจากกล้อง (Motion-Capture Studio)
              </h2>
              <div className="text-xs text-slate-400">
                ตรวจจับข้อต่อ: <span className="text-emerald-400 font-bold">{jointNameTh}</span> (Landmarks {triplet.pointA}-{triplet.vertex}-{triplet.pointB})
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden mb-4 border border-slate-800 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none"
          />

          {/* Real-time Angle HUD */}
          <div className="absolute top-4 left-4 px-3.5 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700 text-xs font-mono font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>มุมปัจจุบัน: {currentAngle}°</span>
          </div>

          {/* Recording Badge */}
          {isRecording && (
            <div className="absolute top-4 right-4 px-3.5 py-1.5 rounded-xl bg-rose-600/90 text-white text-xs font-bold flex items-center gap-2 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span>กำลังบันทึก ({samplesCount} เฟรม)...</span>
            </div>
          )}
        </div>

        {/* Calibration Instruction Box */}
        {!calibrationResult ? (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 mb-4 leading-relaxed">
            <div className="font-bold text-emerald-300 mb-1">📋 วิธีการบันทึกท่าต้นแบบ:</div>
            <div>
              1. กดปุ่ม <span className="text-emerald-400 font-bold">&quot;เริ่มบันทึก&quot;</span> ด้านล่าง<br />
              2. ให้นักกายภาพบำบัดเคลื่อนไหวท่าที่ต้องการ 2 - 3 ครั้งอย่างช้าๆ และค้างไว้ที่มุมสูงสุด<br />
              3. กด <span className="text-emerald-400 font-bold">&quot;เสร็จสิ้นการบันทึก&quot;</span> เพื่อให้อัลกอริทึมคำนวณมุมเริ่มต้น มุมเป้าหมาย และเวลาค้างท่าให้อัตโนมัติ
            </div>
          </div>
        ) : (
          /* Auto-Extracted Parameters Result Card */
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 mb-4 animate-scale-up">
            <div className="flex items-center gap-2 text-emerald-300 text-sm font-bold mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>คำนวณค่าตัวแปรจากท่าต้นแบบสำเร็จ! ({calibrationResult.sampleCount} เฟรม)</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">มุมเริ่มต้น (Start)</div>
                <div className="text-base font-extrabold text-white mt-0.5">{calibrationResult.startAngleDeg}°</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">มุมเป้าหมายขั้นต่ำ</div>
                <div className="text-base font-extrabold text-emerald-400 mt-0.5">{calibrationResult.targetMinDeg}°</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">มุมเป้าหมายสูงสุด</div>
                <div className="text-base font-extrabold text-teal-400 mt-0.5">{calibrationResult.targetMaxDeg}°</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">เวลาค้างท่า (Hold)</div>
                <div className="text-base font-extrabold text-amber-400 mt-0.5">{calibrationResult.holdDurationSec} วิ</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>รีเซ็ต</span>
          </button>

          <div className="flex items-center gap-2">
            {!isRecording && !calibrationResult && (
              <button
                type="button"
                onClick={handleStartRecording}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/40 flex items-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>เริ่มบันทึกท่าต้นแบบ</span>
              </button>
            )}

            {isRecording && (
              <button
                type="button"
                onClick={handleStopRecording}
                className="px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-rose-950/40 flex items-center gap-2 transition active:scale-98 cursor-pointer animate-pulse"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>เสร็จสิ้นและคำนวณค่า</span>
              </button>
            )}

            {calibrationResult && (
              <button
                type="button"
                onClick={handleApply}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-950/50 flex items-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <span>ยอมรับค่าที่คำนวณได้ (Apply to Form)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
