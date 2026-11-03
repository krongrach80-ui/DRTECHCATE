/**
 * apps/kiosk/src/hooks/useTouchlessGestureStarter.ts
 *
 * DRTECH.CARE CLINICAL TOUCHLESS EXERCISE LAUNCHER (ZERO-TOUCH REHAB KINEMATICS)
 *
 * Core Features:
 * 1. Automatically selects next uncompleted exercise from today's plan.
 * 2. Cryptographically secure random prompt ("Left" or "Right") using crypto.getRandomValues.
 * 3. Clinical Safety Override: Honors patient's allowedSide setting ('left', 'right', 'both').
 * 4. Continuous ~0.6s (600ms) hold dwell with smooth progress (0% -> 100%).
 * 5. 15-Second challenge timer with automatic re-randomization on expiration.
 * 6. 3-Attempt failure guard: Offers localized guidance and staff assistance.
 * 7. Dual-hand and multi-person anti-spoofing (rejects simultaneous 2 hands, picks largest central palm).
 * 8. GPU-downscaled 480px video frame at ~20 FPS for silky-smooth performance without thermal throttling.
 * 9. Resource-safe camera lifecycle (stops stream when inactive or transitioning to exercise session).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  evaluateAnatomicalHand,
  AnatomicalHandEvaluation,
  HandLandmarkPoint,
} from '../minigame-cards/HandGestureVerifier.js';

export interface UseTouchlessGestureStarterOptions {
  enabled: boolean;
  targetExercise: any | null;
  allowedSide?: 'both' | 'left' | 'right';
  onStartExercise: (exercise: any, mode: 'gesture' | 'staff_override', metadata: Record<string, unknown>) => void;
  onCallStaff?: () => void;
  lang?: 'th-TH' | 'en-US' | 'zh-CN';
}

export function pickRandomSide(allowedSide: 'both' | 'left' | 'right' = 'both'): 'left' | 'right' {
  if (allowedSide === 'left') return 'left';
  if (allowedSide === 'right') return 'right';
  try {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % 2 === 0 ? 'left' : 'right';
  } catch {
    return Math.random() < 0.5 ? 'left' : 'right';
  }
}

export function useTouchlessGestureStarter({
  enabled,
  targetExercise,
  allowedSide = 'both',
  onStartExercise,
  onCallStaff,
  lang = 'th-TH',
}: UseTouchlessGestureStarterOptions) {
  const [targetSide, setTargetSide] = useState<'left' | 'right'>(() => pickRandomSide(allowedSide));
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [detectedSide, setDetectedSide] = useState<'left' | 'right' | 'both' | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(15);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  const [showFailureHelp, setShowFailureHelp] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const holdStartTimeRef = useRef<number>(0);
  const isTriggeredRef = useRef<boolean>(false);
  const lastDetectTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize or re-roll target side when targetExercise or allowedSide changes
  const rollNewChallenge = useCallback(() => {
    isTriggeredRef.current = false;
    holdStartTimeRef.current = 0;
    setHoldProgress(0);
    setDetectedSide(null);
    setSecondsLeft(15);
    const newSide = pickRandomSide(allowedSide);
    setTargetSide(newSide);
  }, [allowedSide]);

  useEffect(() => {
    if (enabled && targetExercise) {
      rollNewChallenge();
      setAttemptCount(0);
      setShowFailureHelp(false);
    }
  }, [enabled, targetExercise, rollNewChallenge]);

  // 15-Second challenge countdown timer
  useEffect(() => {
    if (!enabled || !targetExercise || showFailureHelp || isTriggeredRef.current) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Time expired for this challenge attempt
          setAttemptCount((currAttempts) => {
            const nextAttempts = currAttempts + 1;
            if (nextAttempts >= 3) {
              setShowFailureHelp(true);
            } else {
              rollNewChallenge();
            }
            return nextAttempts;
          });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [enabled, targetExercise, showFailureHelp, rollNewChallenge]);

  // MediaPipe HandLandmarker Lazy Preloader
  useEffect(() => {
    if (!enabled || !targetExercise) return;
    let isCancelled = false;

    async function loadModel() {
      if (handLandmarkerRef.current) return;
      setIsModelLoading(true);
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const { HandLandmarker, FilesetResolver } = vision;
        const wasmPath = '/models/wasm';
        const fileset = await FilesetResolver.forVisionTasks(wasmPath);
        if (isCancelled) return;

        let landmarker: any;
        try {
          landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: '/models/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.65,
            minHandPresenceConfidence: 0.65,
            minTrackingConfidence: 0.65,
          });
        } catch {
          if (isCancelled) return;
          landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: '/models/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.65,
            minHandPresenceConfidence: 0.65,
            minTrackingConfidence: 0.65,
          });
        }

        if (!isCancelled) {
          handLandmarkerRef.current = landmarker;
          setIsModelLoading(false);
        }
      } catch (err) {
        console.warn('MediaPipe HandLandmarker init error:', err);
        if (!isCancelled) setIsModelLoading(false);
      }
    }

    void loadModel();
    return () => {
      isCancelled = true;
    };
  }, [enabled, targetExercise]);

  // Camera Lifecycle Controller
  useEffect(() => {
    if (!enabled || !targetExercise || showFailureHelp) {
      // Clean up camera immediately if not in touchless gesture mode
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
      return;
    }

    let isCancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (!isCancelled) {
              videoRef.current?.play().catch(() => {});
              setIsCameraActive(true);
            }
          };
        }
      } catch (err) {
        console.warn('Camera access error in touchless starter:', err);
      }
    }

    const currentVideo = videoRef.current;
    void startCamera();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (currentVideo) {
        currentVideo.srcObject = null;
      }
      setIsCameraActive(false);
    };
  }, [enabled, targetExercise, showFailureHelp]);

  // Real-Time 20 FPS Hand Gesture Detection & 600ms Hold Loop
  useEffect(() => {
    if (!enabled || !targetExercise || !isCameraActive || showFailureHelp) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const TARGET_INTERVAL_MS = 50; // ~20 FPS: Optimal for low-end Kiosk CPUs and GPU stability
    const HOLD_DWELL_MS = 600;     // Strictly 0.6 seconds hold requirement

    const processFrame = (timestamp: number) => {
      const video = videoRef.current;
      const landmarker = handLandmarkerRef.current;

      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        !video.paused &&
        timestamp - lastDetectTimeRef.current >= TARGET_INTERVAL_MS
      ) {
        lastDetectTimeRef.current = timestamp;

        try {
          // Downscale to 480px width for fast inference
          let dCanvas = detectCanvasRef.current;
          if (!dCanvas) {
            dCanvas = document.createElement('canvas');
            detectCanvasRef.current = dCanvas;
          }
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          const targetW = 480;
          const targetH = Math.round((targetW * vh) / vw);

          if (dCanvas.width !== targetW || dCanvas.height !== targetH) {
            dCanvas.width = targetW;
            dCanvas.height = targetH;
          }

          const dctx = dCanvas.getContext('2d', { willReadFrequently: true });
          if (dctx) {
            dctx.drawImage(video, 0, 0, targetW, targetH);
          }

          // Run inference on raw un-mirrored frame
          const result = landmarker.detectForVideo(dCanvas, timestamp);
          const rawHands: HandLandmarkPoint[][] = result?.landmarks || [];
          const handednessList = result?.handedness || [];

          // Evaluate all hands
          const evaluatedHands: AnatomicalHandEvaluation[] = [];
          for (let i = 0; i < rawHands.length; i++) {
            const hPts = rawHands[i];
            const catName = handednessList[i]?.[0]?.categoryName || '';
            const conf = handednessList[i]?.[0]?.score ?? 0.85;
            const evalRes = evaluateAnatomicalHand(hPts, catName, conf, {
              isMirrored: true,
              minConfidence: 0.65,
              maxYThreshold: 0.78, // comfortable chest level
            });
            if (evalRes.isValid && evalRes.anatomicalSide) {
              evaluatedHands.push(evalRes);
            }
          }

          // Case A: Two hands detected simultaneously -> REJECT
          if (evaluatedHands.length >= 2) {
            const hasLeft = evaluatedHands.some((h) => h.anatomicalSide === 'left');
            const hasRight = evaluatedHands.some((h) => h.anatomicalSide === 'right');
            if (hasLeft && hasRight) {
              setDetectedSide('both');
              holdStartTimeRef.current = 0;
              setHoldProgress(0);
              setStatusMessage(
                lang === 'zh-CN'
                  ? '⚠️ 检测到同时举起双手，请只举起一只手'
                  : lang === 'en-US'
                  ? '⚠️ Both hands detected! Please raise only ONE hand'
                  : '⚠️ ตรวจพบการยก 2 มือพร้อมกัน กรุณายกมือข้างเดียวตามคำสั่งครับ'
              );
              animFrameRef.current = requestAnimationFrame(processFrame);
              return;
            }
          }

          // Case B: No valid hand detected
          if (evaluatedHands.length === 0) {
            setDetectedSide(null);
            holdStartTimeRef.current = 0;
            setHoldProgress(0);
            setStatusMessage(
              lang === 'zh-CN'
                ? `请举起${targetSide === 'left' ? '左' : '右'}手`
                : lang === 'en-US'
                ? `Please raise your ${targetSide.toUpperCase()} hand`
                : `กรุณายกมือ${targetSide === 'left' ? 'ซ้าย' : 'ขวา'}ระดับอก`
            );
            animFrameRef.current = requestAnimationFrame(processFrame);
            return;
          }

          // Case C: Multi-person arbitration -> Pick largest palm closest to horizontal center
          evaluatedHands.sort((a, b) => {
            const scoreA = a.palmSize * 2.0 - Math.abs(a.palmCenter.mirroredX - 0.5);
            const scoreB = b.palmSize * 2.0 - Math.abs(b.palmCenter.mirroredX - 0.5);
            return scoreB - scoreA;
          });

          const primaryHand = evaluatedHands[0];
          if (!primaryHand || !primaryHand.anatomicalSide) {
            setDetectedSide(null);
            holdStartTimeRef.current = 0;
            setHoldProgress(0);
            animFrameRef.current = requestAnimationFrame(processFrame);
            return;
          }

          const primarySide = primaryHand.anatomicalSide;
          setDetectedSide(primarySide);

          // Check if primary hand matches target side
          if (primarySide === targetSide) {
            if (!holdStartTimeRef.current) {
              holdStartTimeRef.current = timestamp;
            }
            const elapsed = timestamp - holdStartTimeRef.current;
            const progress = Math.min(1.0, elapsed / HOLD_DWELL_MS);
            setHoldProgress(progress);

            setStatusMessage(
              lang === 'zh-CN'
                ? `✅ 检测到${primarySide === 'left' ? '左' : '右'}手！请保持静止...`
                : lang === 'en-US'
                ? `✅ ${primarySide.toUpperCase()} hand detected! Hold steady...`
                : `✅ ตรวจพบมือ${primarySide === 'left' ? 'ซ้าย' : 'ขวา'}! กรุณาค้างไว้นิ่งๆ...`
            );

            // Trigger Launch on 100% (600ms continuous hold)
            if (progress >= 1.0 && !isTriggeredRef.current) {
              isTriggeredRef.current = true;
              // Clean up camera stream immediately before transitioning
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
              }
              if (videoRef.current) {
                videoRef.current.srcObject = null;
              }
              setIsCameraActive(false);

              // Dispatch start with audit metadata
              onStartExercise(targetExercise, 'gesture', {
                target_hand: targetSide,
                detected_hand: primarySide,
                hold_duration_ms: HOLD_DWELL_MS,
                attempts: attemptCount + 1,
                started_by: 'patient_touchless_gesture',
                timestamp: new Date().toISOString(),
              });
              return;
            }
          } else {
            // Wrong hand raised -> Reset hold progress
            holdStartTimeRef.current = 0;
            setHoldProgress(0);
            setStatusMessage(
              lang === 'zh-CN'
                ? `⚠️ 举错方向（检测到${primarySide === 'left' ? '左' : '右'}手，请举${targetSide === 'left' ? '左' : '右'}手）`
                : lang === 'en-US'
                ? `⚠️ Wrong hand (${primarySide.toUpperCase()} raised, please raise ${targetSide.toUpperCase()})`
                : `⚠️ ยกผิดข้าง (กำลังยกมือ${primarySide === 'left' ? 'ซ้าย' : 'ขวา'} แต่ระบบขอให้ยกมือ${targetSide === 'left' ? 'ซ้าย' : 'ขวา'})`
            );
          }
        } catch {
          // non-blocking
        }
      }

      if (!isTriggeredRef.current) {
        animFrameRef.current = requestAnimationFrame(processFrame);
      }
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [enabled, targetExercise, isCameraActive, targetSide, showFailureHelp, attemptCount, onStartExercise, lang]);

  // Handle Retry after 3 failed attempts
  const handleRetry = useCallback(() => {
    setAttemptCount(0);
    setShowFailureHelp(false);
    rollNewChallenge();
  }, [rollNewChallenge]);

  // Handle Staff Override (discrete bypass button)
  const handleStaffOverride = useCallback((staffName = 'เจ้าหน้าที่') => {
    isTriggeredRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);

    onStartExercise(targetExercise, 'staff_override', {
      target_hand: targetSide,
      detected_hand: 'override',
      started_by: staffName,
      attempts: attemptCount + 1,
      timestamp: new Date().toISOString(),
    });
  }, [targetExercise, targetSide, attemptCount, onStartExercise]);

  return {
    targetSide,
    holdProgress,
    detectedSide,
    secondsLeft,
    attemptCount,
    showFailureHelp,
    isCameraActive,
    isModelLoading,
    statusMessage,
    videoRef,
    handleRetry,
    handleStaffOverride,
    onCallStaff,
  };
}
