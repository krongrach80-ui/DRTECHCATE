/**
 * apps/kiosk/src/hooks/useRaiseBothHandsConfirm.ts
 *
 * DRTECH.CARE CLINICAL-GRADE TOUCHLESS READINESS CONFIRMATION HOOK
 * Lifecycle & video stream consumer hook for "Raise Both Hands" confirmation modal:
 * - Reuses existing HTMLVideoElement without duplicate getUserMedia calls.
 * - Manages Web Audio API confirmation chime and Thai speech synthesis.
 * - One-shot debounce lock (hasTriggeredRef).
 * - Immediate cleanup on modal close or "ไม่ใช่ฉัน (สแกนใหม่)".
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  detectRaiseBothHands,
  createInitialRaiseBothHandsState,
  RaiseBothHandsConfig,
  RaiseBothHandsState,
  RaiseBothHandsStatus,
  SpatialIdentityAnchor,
} from '../../../../packages/face-client/src/gesture/raiseBothHandsDetector';

export interface UseRaiseBothHandsConfirmProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isOpen: boolean;
  anchor?: SpatialIdentityAnchor | null;
  onConfirm: () => void;
  config?: Partial<RaiseBothHandsConfig>;
}

export interface UseRaiseBothHandsConfirmReturn {
  progress: number;
  status: RaiseBothHandsStatus;
  thaiMessage: string;
  showAccessibilityFallbackHint: boolean;
  isModelReady: boolean;
  isSeated: boolean;
  handleManualConfirm: () => void;
  resetConfirmation: () => void;
}

// Global cached MediaPipe PoseLandmarker singleton to avoid redundant WASM reloads
let cachedPoseLandmarker: any = null;
let isLandmarkerLoading = false;
const landmarkerWaiters: Array<(landmarker: any) => void> = [];

async function getSharedPoseLandmarker(): Promise<any> {
  if (cachedPoseLandmarker) return cachedPoseLandmarker;

  if (isLandmarkerLoading) {
    return new Promise((resolve) => {
      landmarkerWaiters.push(resolve);
    });
  }

  isLandmarkerLoading = true;
  try {
    const vision = await import('@mediapipe/tasks-vision');
    const { PoseLandmarker, FilesetResolver } = vision;

    // Enforce self-hosted WASM and local models for China GFW immunity
    let fileset: any;
    try {
      fileset = await FilesetResolver.forVisionTasks('/models/wasm');
    } catch {
      fileset = await FilesetResolver.forVisionTasks('/wasm');
    }

    const localModelAssetPath = '/models/pose_landmarker.task';
    const fallbackLiteAssetPath = '/models/pose_landmarker_lite.task';

    let landmarker: any;
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: localModelAssetPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });
    } catch {
      try {
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: fallbackLiteAssetPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 2,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
      } catch (delegateErr) {
        console.warn('PoseLandmarker initialization fallback:', delegateErr);
      }
    }

    cachedPoseLandmarker = landmarker;
    isLandmarkerLoading = false;
    while (landmarkerWaiters.length > 0) {
      const waiter = landmarkerWaiters.shift();
      waiter?.(landmarker);
    }
    return landmarker;
  } catch (err) {
    isLandmarkerLoading = false;
    console.warn('Could not initialize MediaPipe PoseLandmarker in browser:', err);
    return null;
  }
}

/**
 * Synthesizes a medical-grade harmonic ascending chime (E5 -> A5)
 * Pure Web Audio API — zero external MP3 / audio asset dependencies.
 */
function playConfirmationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    // Harmonic frequency progression
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.14); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.5, now); // E6
    osc2.frequency.exponentialRampToValueAtTime(1760.0, now + 0.14); // A6

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch {
    // Audio Context not allowed or muted
  }
}

/**
 * Optional Thai speech prompt: "เริ่มการฝึกค่ะ"
 */
function speakThaiConfirmation() {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('เริ่มการฝึกค่ะ');
      utterance.lang = 'th-TH';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch {
    // Speech synthesis unsupported or blocked
  }
}

export function useRaiseBothHandsConfirm({
  videoRef,
  isOpen,
  anchor,
  onConfirm,
  config,
}: UseRaiseBothHandsConfirmProps): UseRaiseBothHandsConfirmReturn {
  const [progress, setProgress] = useState<number>(0.0);
  const [status, setStatus] = useState<RaiseBothHandsStatus>('searching');
  const [thaiMessage, setThaiMessage] = useState<string>(
    '👀 กำลังมองหามือของคุณ... ยก 2 มือชูขึ้นเหนือไหล่เพื่อเริ่ม'
  );
  const [showAccessibilityFallbackHint, setShowAccessibilityFallbackHint] = useState<boolean>(false);
  const [isModelReady, setIsModelReady] = useState<boolean>(Boolean(cachedPoseLandmarker));
  const [isSeated, setIsSeated] = useState<boolean>(false);

  const detectorStateRef = useRef<RaiseBothHandsState>(createInitialRaiseBothHandsState());
  const hasTriggeredRef = useRef<boolean>(false);
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const anchorRef = useRef(anchor);
  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  // Full reset function
  const resetConfirmation = useCallback(() => {
    hasTriggeredRef.current = false;
    detectorStateRef.current = createInitialRaiseBothHandsState();
    setProgress(0.0);
    setStatus('searching');
    setThaiMessage('👀 กำลังมองหามือของคุณ... ยก 2 มือชูขึ้นเหนือไหล่เพื่อเริ่ม');
    setShowAccessibilityFallbackHint(false);
  }, []);

  // Manual button click alternative
  const handleManualConfirm = useCallback(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    setProgress(1.0);
    setStatus('confirmed');
    setThaiMessage('✅ ยืนยันสำเร็จ! กำลังเข้าสู่หน้าฝึก...');
    playConfirmationChime();
    speakThaiConfirmation();
    onConfirmRef.current();
  }, []);

  // Pre-warm pose model on mount
  useEffect(() => {
    let mounted = true;
    getSharedPoseLandmarker().then((lm) => {
      if (mounted && lm) {
        setIsModelReady(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Main Detection Loop during active modal display
  useEffect(() => {
    if (!isOpen) {
      resetConfirmation();
      return;
    }

    let isCancelled = false;
    let animFrameId: number;
    let lastInferenceTime = 0;
    detectorStateRef.current = createInitialRaiseBothHandsState();

    const loop = (currentTime: number) => {
      if (isCancelled || hasTriggeredRef.current) return;

      const video = videoRef.current;
      const landmarker = cachedPoseLandmarker;

      // Throttle detection to ~30 FPS (33ms) to save CPU/GPU overhead
      if (video && landmarker && currentTime - lastInferenceTime >= 30) {
        if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused) {
          lastInferenceTime = currentTime;
          try {
            const timestampMs = Math.round(performance.now());
            const result = landmarker.detectForVideo(video, timestampMs);

            // Pass multi-pose or empty
            const poses = (result?.landmarks && result.landmarks.length > 0)
              ? result.landmarks
              : null;

            const detectionResult = detectRaiseBothHands(
              poses,
              anchorRef.current,
              config,
              detectorStateRef.current,
              timestampMs
            );

            detectorStateRef.current = detectionResult.nextState;
            setProgress(detectionResult.progress);
            setStatus(detectionResult.status);
            setThaiMessage(detectionResult.thaiMessage);
            setShowAccessibilityFallbackHint(detectionResult.showAccessibilityFallbackHint);
            setIsSeated(detectionResult.isSeated);

            if (detectionResult.detected && !hasTriggeredRef.current) {
              hasTriggeredRef.current = true;
              playConfirmationChime();
              speakThaiConfirmation();
              // Short delay to let user see 100% green state
              setTimeout(() => {
                if (!isCancelled) {
                  onConfirmRef.current();
                }
              }, 250);
              return;
            }
          } catch (detectionErr) {
            console.warn('Pose landmark evaluation warning:', detectionErr);
          }
        }
      }

      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animFrameId);
    };
  }, [isOpen, videoRef, config, resetConfirmation]);

  return {
    progress,
    status,
    thaiMessage,
    showAccessibilityFallbackHint,
    isModelReady,
    isSeated,
    handleManualConfirm,
    resetConfirmation,
  };
}
