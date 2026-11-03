/**
 * apps/kiosk/src/minigame-cards/PhysicalCardGame.tsx
 * มินิเกม "การ์ดกายภาพ" สำหรับฝึกสมองและการเคลื่อนไหว (Physical & Cognitive Cards)
 * ออกแบบตามภาพตัวอย่าง 100%:
 * - หัวข้อ "การ์ดกายภาพ" และแถบคะแนน
 * - การ์ดคำถามด้านบน "รูปนี้ใช่ผลไม้หรือไม่" / คำถามประจำข้อ
 * - 3 การ์ด: "ใช่ (ยกมือซ้าย)" | "รูปภาพ" | "ไม่ (ยกมือขวา)"
 * - จอกล้องด้านล่างพร้อมกรอบมุม "ยืนให้เห็นมือทั้งสองข้าง" และระบบตรวจจับการยกมือ / สัมผัสหน้าจอ
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';
import {
  PhysicalCardQuestion,
  ALL_99_PHYSICAL_CARD_QUESTIONS,
} from './PhysicalCardGameData.js';
import { PhysicalCardVisual } from './PhysicalCardVisuals.js';
import {
  verifyRealHandGesture,
  drawHandSkeleton,
  HandLandmarkPoint,
} from './HandGestureVerifier.js';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Trophy,
  Hand,
  CheckCircle2,
  XCircle,
  HelpCircle,
  X,
  Camera,
  AlertTriangle,
} from 'lucide-react';

export const QUESTIONS_PER_ROUND = 10;

export interface PhysicalCardGameProps {
  onComplete?: (finalScore: number, totalQuestions: number) => void;
  onExit?: () => void;
  initialCategory?: string;
  maxQuestions?: number;
  patientId?: string;
}

export const PhysicalCardGame: React.FC<PhysicalCardGameProps> = ({
  onComplete,
  onExit,
  initialCategory = 'ทั้งหมด',
  maxQuestions,
  patientId,
}) => {
  const { t, lang } = useClinicalI18n();
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [sessionSeed, setSessionSeed] = useState<number>(0);

  // Filtered Question list (สุ่ม 10 ข้อจากคลังคำถามทั้งหมดต่อรอบ)
  const [filteredList, setFilteredList] = useState<PhysicalCardQuestion[]>(() => {
    let list = ALL_99_PHYSICAL_CARD_QUESTIONS;
    if (initialCategory !== 'ทั้งหมด') {
      list = list.filter((q) => q.category === initialCategory);
    }
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    const limit = maxQuestions && maxQuestions > 0 ? maxQuestions : QUESTIONS_PER_ROUND;
    return shuffled.slice(0, Math.min(limit, shuffled.length));
  });

  useEffect(() => {
    let list = ALL_99_PHYSICAL_CARD_QUESTIONS;
    if (initialCategory !== 'ทั้งหมด') {
      list = list.filter((q) => q.category === initialCategory);
    }
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    const limit = maxQuestions && maxQuestions > 0 ? maxQuestions : QUESTIONS_PER_ROUND;
    setFilteredList(shuffled.slice(0, Math.min(limit, shuffled.length)));
  }, [initialCategory, maxQuestions, sessionSeed]);

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem('kiosk_card_game_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.currentIndex === 'number') return parsed.currentIndex;
      }
    } catch {}
    return 0;
  });
  const [score, setScore] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem('kiosk_card_game_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.score === 'number') return parsed.score;
      }
    } catch {}
    return 0;
  });
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no' | null>(null);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  // High-performance DOM Refs (Zero React re-renders during motion detection)
  const leftProgressRef = useRef<HTMLDivElement | null>(null);
  const rightProgressRef = useRef<HTMLDivElement | null>(null);
  const leftProgressBarInnerRef = useRef<HTMLDivElement | null>(null);
  const rightProgressBarInnerRef = useRef<HTMLDivElement | null>(null);
  const leftProgressPercentRef = useRef<HTMLSpanElement | null>(null);
  const rightProgressPercentRef = useRef<HTMLSpanElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Camera & Real Hand Landmarker Detection
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const neutralGateRef = useRef<boolean>(false);
  const lastTimestampRef = useRef<number>(0);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [activeHandZone, setActiveHandZone] = useState<'LEFT' | 'RIGHT' | 'CENTER' | 'BOTH' | 'NONE'>('NONE');
  const [isBothHandsWarning, setIsBothHandsWarning] = useState<boolean>(false);

  const activeQuestion: PhysicalCardQuestion =
    filteredList[currentIndex] || ALL_99_PHYSICAL_CARD_QUESTIONS[0];

  // Cached AudioContext singleton to prevent audio hardware stuttering
  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Sound Synthesizer via Web Audio API
  const playSound = useCallback(
    (type: 'correct' | 'wrong' | 'pop') => {
      if (!soundEnabled) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        if (type === 'correct') {
          // Cheerful chime: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
          const notes = [523.25, 659.25, 783.99];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
            gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.08);
            osc.stop(ctx.currentTime + idx * 0.08 + 0.4);
          });
        } else if (type === 'wrong') {
          // Gentle soft buzz
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(240, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.25);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        } else {
          // Tap pop
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        }
      } catch {
        // audio non-blocking
      }
    },
    [soundEnabled, getAudioContext]
  );

  // Initialize camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isCancelled = false;

    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user',
            },
            audio: false,
          });
          if (!isCancelled && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
            setCameraActive(true);
          }
        }
      } catch {
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      isCancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Save score to database if patient is logged in
  const saveSessionScore = useCallback(
    async (finalScore: number, totalQuestions: number) => {
      try {
        const activePatientId =
          patientId ||
          (typeof window !== 'undefined'
            ? sessionStorage.getItem('active_patient_id') ||
              sessionStorage.getItem('patient_id') ||
              localStorage.getItem('active_patient_id') ||
              localStorage.getItem('patient_id') ||
              ''
            : '');

        if (activePatientId) {
          const calculatedPoints = Math.round((finalScore / totalQuestions) * 100);
          await defaultApiClient.smartOnboarding.saveRehabScore({
            patient_id: activePatientId,
            score: {
              timestamp: new Date().toISOString(),
              completion_rate: 100,
              exercises_completed: 0,
              minigame_score: calculatedPoints,
              total_score: calculatedPoints,
            },
          });
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'last_physical_card_score',
            JSON.stringify({
              score: finalScore,
              total: totalQuestions,
              percentage: Math.round((finalScore / totalQuestions) * 100),
              timestamp: new Date().toISOString(),
            })
          );
        }
      } catch {
        // Non-blocking save
      }
    },
    [patientId]
  );

  // Handle user's answer (via gesture or direct click)
  const handleAnswer = useCallback(
    (choice: 'yes' | 'no') => {
      if (answerState !== 'idle') return;

      setSelectedSide(choice);
      const isCorrect = choice === activeQuestion.correctAnswer;

      if (isCorrect) {
        setAnswerState('correct');
        setScore((prev) => prev + 1);
        playSound('correct');
      } else {
        setAnswerState('wrong');
        playSound('wrong');
      }

      setShowExplanation(true);

      // Auto transition to next question after 1.4s
      setTimeout(() => {
        setShowExplanation(false);
        setAnswerState('idle');
        setSelectedSide(null);
        if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
        if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
        if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
        if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
        if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
        if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';

        if (currentIndex + 1 < filteredList.length) {
          const nextIdx = currentIndex + 1;
          const nextScore = score + (isCorrect ? 1 : 0);
          setCurrentIndex(nextIdx);
          try {
            sessionStorage.setItem(
              'kiosk_card_game_state',
              JSON.stringify({ currentIndex: nextIdx, score: nextScore })
            );
          } catch {}
        } else {
          const finalScore = score + (isCorrect ? 1 : 0);
          try {
            sessionStorage.removeItem('kiosk_card_game_state');
          } catch {}
          setIsGameOver(true);
          if (onComplete) {
            onComplete(finalScore, filteredList.length);
          }
          saveSessionScore(finalScore, filteredList.length);
        }
      }, 1400);
    },
    [
      answerState,
      activeQuestion.correctAnswer,
      currentIndex,
      filteredList.length,
      onComplete,
      playSound,
      saveSessionScore,
      score,
    ]
  );

  const handleAnswerRef = useRef(handleAnswer);
  useEffect(() => {
    handleAnswerRef.current = handleAnswer;
  }, [handleAnswer]);

  // 1. Initialize MediaPipe HandLandmarker (Multi-tier WASM & Model Resolver + GPU-to-CPU Fallback)
  useEffect(() => {
    let isCancelled = false;

    async function initLandmarker() {
      try {
        setIsModelLoading(true);
        setModelError(null);
        const vision = await import('@mediapipe/tasks-vision');
        const { HandLandmarker, FilesetResolver } = vision;

        const baseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL)
          ? (import.meta as any).env.BASE_URL
          : '/';
        const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

        const wasmSources = [
          `${cleanBase}models/wasm`,
          '/models/wasm',
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        ];

        const modelSources = [
          `${cleanBase}models/hand_landmarker.task`,
          '/models/hand_landmarker.task',
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        ];

        let fileset: any = null;
        for (const wSource of wasmSources) {
          if (isCancelled) return;
          try {
            fileset = await FilesetResolver.forVisionTasks(wSource);
            if (fileset) break;
          } catch {
            // Try next wasm source
          }
        }

        if (!fileset) {
          throw new Error('ไม่สามารถโหลดโมดูล WASM ของ MediaPipe ได้จากทุกแหล่ง');
        }

        if (isCancelled) return;

        let landmarker: any = null;
        let lastError: Error | null = null;

        for (const mSource of modelSources) {
          if (isCancelled) return;
          // 1. Try GPU delegate
          try {
            landmarker = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: mSource,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.45,
              minHandPresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            if (landmarker) break;
          } catch (gpuErr) {
            // 2. Fallback to CPU delegate
            try {
              landmarker = await HandLandmarker.createFromOptions(fileset, {
                baseOptions: {
                  modelAssetPath: mSource,
                  delegate: 'CPU',
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.45,
                minHandPresenceConfidence: 0.45,
                minTrackingConfidence: 0.45,
              });
              if (landmarker) break;
            } catch (cpuErr: any) {
              lastError = cpuErr;
            }
          }
        }

        if (!landmarker) {
          throw lastError || new Error('ไม่สามารถโหลดโมเดล hand_landmarker.task ได้');
        }

        if (!isCancelled) {
          handLandmarkerRef.current = landmarker;
          setIsModelLoading(false);
          // Warm-up inference once so first frame doesn't stutter or freeze
          try {
            const warmUpCanvas = document.createElement('canvas');
            warmUpCanvas.width = 160;
            warmUpCanvas.height = 120;
            const now = performance.now();
            lastTimestampRef.current = now;
            landmarker.detectForVideo(warmUpCanvas, now);
          } catch {
            // Warm-up non-blocking
          }
        } else {
          landmarker?.close();
        }
      } catch (err: any) {
        console.warn('MediaPipe HandLandmarker init error:', err);
        if (!isCancelled) {
          setIsModelLoading(false);
          setModelError(err?.message || 'โมเดลตรวจจับมือขัดข้อง แตะการ์ดเพื่อตอบได้ทันที');
        }
      }
    }

    initLandmarker();

    return () => {
      isCancelled = true;
      if (handLandmarkerRef.current) {
        try {
          handLandmarkerRef.current.close();
        } catch {
          // cleanup safe
        }
        handLandmarkerRef.current = null;
      }
    };
  }, []);

  // 2. Strict Real Hand Detection Loop with Downscaling (480px), 20 FPS Throttle, Hysteresis & 600ms Dwell
  useEffect(() => {
    if (!cameraActive || isGameOver || answerState !== 'idle') {
      if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
      if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
      if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
      if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
      if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
      if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      return;
    }

    let animFrame: number;
    let lastDetectTime = 0;
    const TARGET_INTERVAL_MS = 50; // ~20 FPS: optimal for ML tracking without GPU overload
    const HOLD_DWELL_MS = 600; // 0.6 seconds continuous hold requirement
    const GRACE_PERIOD_MS = 200; // 200ms grace period tolerance for brief occlusion

    let activeZone: 'LEFT' | 'RIGHT' | null = null;
    let zoneHoldStart = 0;
    let lastValidSeenTime = 0;
    let handNeutralFrames = 0;
    let candidateZone: 'LEFT' | 'RIGHT' | null = null;
    let candidateCount = 0;
    const smoothXHistory: number[] = [];

    const resetProgressDom = () => {
      if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
      if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
      if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
      if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
      if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
      if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
    };

    const detectHands = (timestamp: number) => {
      const video = videoRef.current;
      const landmarker = handLandmarkerRef.current;
      const canvas = overlayCanvasRef.current;

      if (
        video &&
        landmarker &&
        canvas &&
        video.readyState >= 2 &&
        !video.paused &&
        timestamp - lastDetectTime >= TARGET_INTERVAL_MS
      ) {
        lastDetectTime = timestamp;

        // Auto-fit overlay canvas dimensions to video feed
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        try {
          // Downscale input frame to 480px width canvas to dramatically reduce ML latency and avoid lag
          let dCanvas = detectCanvasRef.current;
          if (!dCanvas) {
            dCanvas = document.createElement('canvas');
            detectCanvasRef.current = dCanvas;
          }
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

          // Strict monotonic timestamp guard
          const monotonicTimestamp = Math.max(timestamp, (lastTimestampRef.current || 0) + 1);
          lastTimestampRef.current = monotonicTimestamp;

          const result = landmarker.detectForVideo(dCanvas, monotonicTimestamp);
          const hands = result?.landmarks || [];

          // Verify all detected hands without early break
          const verifiedList = hands.map((handPts: HandLandmarkPoint[]) => ({
            handPts,
            verification: verifyRealHandGesture(handPts, 0.85, {
              isMirrored,
              minConfidence: 0.45,
              leftZoneThreshold: 0.46,
              rightZoneThreshold: 0.54,
              maxYThreshold: 0.88,
              raisedTipMargin: 0.02,
            }),
          }));

          const leftHand = verifiedList.find((h: any) => h.verification.isValidHand && h.verification.zone === 'LEFT');
          const rightHand = verifiedList.find((h: any) => h.verification.isValidHand && h.verification.zone === 'RIGHT');

          // Bilateral Ambiguity Check: Both hands raised in active answer zones simultaneously
          if (leftHand && rightHand) {
            activeZone = null;
            candidateZone = null;
            candidateCount = 0;
            zoneHoldStart = 0;
            resetProgressDom();
            setIsBothHandsWarning(true);
            setActiveHandZone('BOTH');

            if (ctx) {
              drawHandSkeleton(ctx, leftHand.handPts, canvas.width, canvas.height, 'CENTER', 0);
              drawHandSkeleton(ctx, rightHand.handPts, canvas.width, canvas.height, 'CENTER', 0);
            }
          } else {
            setIsBothHandsWarning(false);
            const activeCandidate = leftHand || rightHand;
            const neutralCandidate = verifiedList.find((h: any) => h.verification.isHandDetected);
            const chosen = activeCandidate || neutralCandidate;

            if (chosen && chosen.handPts && ctx) {
              const { verification, handPts } = chosen;

              // Neutral Hand Reset Gate Check: Must lower hand before next question
              if (neutralGateRef.current) {
                const isLowered =
                  !verification.isOpenPalm ||
                  verification.mirroredY > 0.70 ||
                  verification.zone === 'CENTER' ||
                  verification.zone === 'NONE';

                if (isLowered) {
                  handNeutralFrames++;
                  if (handNeutralFrames >= 4) {
                    neutralGateRef.current = false;
                    handNeutralFrames = 0;
                  }
                } else {
                  handNeutralFrames = 0;
                }

                activeZone = null;
                candidateZone = null;
                candidateCount = 0;
                zoneHoldStart = 0;
                resetProgressDom();
                setActiveHandZone('CENTER');
                drawHandSkeleton(ctx, handPts, canvas.width, canvas.height, 'CENTER', 0);
              } else if (verification.isValidHand && verification.side) {
                // Apply 3-frame smoothing to X coordinate
                smoothXHistory.push(verification.mirroredX);
                if (smoothXHistory.length > 3) smoothXHistory.shift();
                const avgX = smoothXHistory.reduce((a: number, b: number) => a + b, 0) / smoothXHistory.length;
                const detectedZone = (avgX < 0.46 ? 'LEFT' : avgX > 0.54 ? 'RIGHT' : 'CENTER') as 'LEFT' | 'RIGHT' | 'CENTER';

                if (detectedZone === 'LEFT' || detectedZone === 'RIGHT') {
                  lastValidSeenTime = monotonicTimestamp;
                  setActiveHandZone(detectedZone);

                  if (activeZone === detectedZone) {
                    const elapsed = monotonicTimestamp - zoneHoldStart;
                    const progress = Math.min(1.0, elapsed / HOLD_DWELL_MS);

                    const progressScale = progress.toFixed(3);
                    const percentStr = `${Math.round(progress * 100)}%`;
                    if (detectedZone === 'LEFT' && leftProgressRef.current) {
                      leftProgressRef.current.style.transform = `scaleY(${progressScale})`;
                      if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = percentStr;
                      if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = percentStr;
                      if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
                      if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
                      if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
                    } else if (detectedZone === 'RIGHT' && rightProgressRef.current) {
                      rightProgressRef.current.style.transform = `scaleY(${progressScale})`;
                      if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = percentStr;
                      if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = percentStr;
                      if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
                      if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
                      if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
                    }

                    drawHandSkeleton(ctx, handPts, canvas.width, canvas.height, detectedZone, progress);

                    if (progress >= 1.0) {
                      activeZone = null;
                      candidateZone = null;
                      candidateCount = 0;
                      zoneHoldStart = 0;
                      neutralGateRef.current = true;
                      handNeutralFrames = 0;
                      resetProgressDom();
                      handleAnswerRef.current(verification.side);
                    }
                  } else {
                    // Hysteresis: Require 2 consecutive frames before switching activeZone
                    if (candidateZone === detectedZone) {
                      candidateCount++;
                      if (candidateCount >= 2) {
                        activeZone = detectedZone;
                        zoneHoldStart = monotonicTimestamp;
                        candidateCount = 0;
                        if (detectedZone === 'LEFT') {
                          if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
                          if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
                          if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
                        }
                        if (detectedZone === 'RIGHT') {
                          if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
                          if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
                          if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
                        }
                      }
                    } else {
                      candidateZone = detectedZone;
                      candidateCount = 1;
                    }

                    drawHandSkeleton(ctx, handPts, canvas.width, canvas.height, detectedZone, 0);
                  }
                } else {
                  // Center neutral zone
                  setActiveHandZone('CENTER');
                  if (activeZone && monotonicTimestamp - lastValidSeenTime < GRACE_PERIOD_MS) {
                    // Hold progress during brief grace period
                  } else {
                    activeZone = null;
                    candidateZone = null;
                    candidateCount = 0;
                    zoneHoldStart = 0;
                    resetProgressDom();
                  }
                  drawHandSkeleton(ctx, handPts, canvas.width, canvas.height, 'CENTER', 0);
                }
              } else {
                // Hand detected but not raised or in neutral posture
                setActiveHandZone('CENTER');
                if (activeZone && monotonicTimestamp - lastValidSeenTime < GRACE_PERIOD_MS) {
                  // Grace period tolerance
                } else {
                  activeZone = null;
                  candidateZone = null;
                  candidateCount = 0;
                  zoneHoldStart = 0;
                  resetProgressDom();
                }
                drawHandSkeleton(ctx, handPts, canvas.width, canvas.height, verification.zone || 'CENTER', 0);
              }
            } else {
              // No hand detected
              setActiveHandZone('NONE');
              if (activeZone && monotonicTimestamp - lastValidSeenTime < GRACE_PERIOD_MS) {
                // Grace period tolerance
              } else {
                activeZone = null;
                candidateZone = null;
                candidateCount = 0;
                zoneHoldStart = 0;
                handNeutralFrames++;
                if (handNeutralFrames >= 4) {
                  neutralGateRef.current = false;
                }
                resetProgressDom();
              }
            }
          }
        } catch {
          // Graceful skip on frame error
        }
      }

      animFrame = requestAnimationFrame(detectHands);
    };

    animFrame = requestAnimationFrame(detectHands);

    const leftEl = leftProgressRef.current;
    const rightEl = rightProgressRef.current;
    const leftInnerEl = leftProgressBarInnerRef.current;
    const rightInnerEl = rightProgressBarInnerRef.current;
    const leftPercentEl = leftProgressPercentRef.current;
    const rightPercentEl = rightProgressPercentRef.current;
    const canvasEl = overlayCanvasRef.current;

    return () => {
      cancelAnimationFrame(animFrame);
      if (leftEl) leftEl.style.transform = 'scaleY(0)';
      if (rightEl) rightEl.style.transform = 'scaleY(0)';
      if (leftInnerEl) leftInnerEl.style.width = '0%';
      if (rightInnerEl) rightInnerEl.style.width = '0%';
      if (leftPercentEl) leftPercentEl.textContent = '0%';
      if (rightPercentEl) rightPercentEl.textContent = '0%';
      if (canvasEl) {
        const ctx = canvasEl.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      }
    };
  }, [cameraActive, isGameOver, answerState]);

  const handleRestart = () => {
    try {
      sessionStorage.removeItem('kiosk_card_game_state');
    } catch {}
    setSessionSeed((s) => s + 1);
    setCurrentIndex(0);
    setScore(0);
    setAnswerState('idle');
    setSelectedSide(null);
    setIsGameOver(false);
    setShowExplanation(false);
    if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
    if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
    if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
    if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
    if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
    if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
  };

  return (
    <div className="w-full h-full flex flex-col justify-between pt-3 pb-3 px-3 sm:pt-4 sm:pb-4 sm:px-5 md:px-6 bg-[#EDF7F1] text-slate-800 select-none overflow-hidden font-sans relative">
      {/* Top Header Bar (Safe top margin to prevent clipping against modal border) */}
      <div className="w-full max-w-5xl xl:max-w-6xl mx-auto flex items-center justify-between gap-2 shrink-0 pt-0.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-black text-[#134E43] tracking-normal">
            {t('card_minigame_title')}
          </h1>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300/80 px-3 py-1 rounded-full shadow-xs">
            {lang === 'zh-CN'
              ? `题目 ${currentIndex + 1} / ${filteredList.length}`
              : lang === 'en-US'
              ? `Question ${currentIndex + 1} / ${filteredList.length}`
              : `ข้อ ${currentIndex + 1} / ${filteredList.length}`}
          </span>
        </div>

        {/* Right Controls: Sound, Exit & Score Pill */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="w-9 h-9 rounded-full bg-white border border-emerald-200/80 shadow-sm flex items-center justify-center text-emerald-800 hover:bg-emerald-50 transition cursor-pointer"
            title={soundEnabled ? 'ปิดเสียง' : 'เปิดเสียง'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          {/* Score Pill Badge (ตามภาพต้นฉบับ: แถบสีเขียวเข้มพร้อมวงกลมคะแนนสีขาว) */}
          <div className="flex items-center gap-2 bg-[#134E43] text-white pl-4 pr-1.5 py-1 rounded-full shadow-md border border-emerald-800">
            <span className="text-xs sm:text-sm font-bold tracking-wide">{t('card_score_label')}</span>
            <div className="w-7 h-7 rounded-full bg-white text-[#134E43] font-black flex items-center justify-center text-sm shadow-inner">
              {score}
            </div>
          </div>

          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="w-8 h-8 rounded-full bg-emerald-900/10 hover:bg-emerald-900/20 text-emerald-900 flex items-center justify-center transition cursor-pointer"
              title="ออกจากมินิเกม"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Game Screen */}
      {!isGameOver ? (
        <div className="w-full max-w-5xl xl:max-w-6xl mx-auto flex-1 flex flex-col justify-between gap-2.5 sm:gap-3 my-auto min-h-0">
          {/* Question Banner (ตามแบบภาพ: กล่องขาวมน ข้อความใหญ่ตรงกลาง พร้อม safe margins ไม่ให้ตัวหนังสือถูกตัดทับ) */}
          <div className="w-full bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 text-center shadow-xs border border-emerald-100/90 transition animate-fade-in relative overflow-hidden min-h-[64px] sm:min-h-[72px] flex items-center justify-center shrink-0">
            <h2 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-[#113C34] tracking-normal leading-tight">
              {activeQuestion.prompt}
            </h2>

            {/* Answer Result Banner Alert - safe padding to ensure no text clipping */}
            {answerState !== 'idle' && (
              <div
                className={`absolute inset-0 flex items-center justify-center gap-2 text-base sm:text-lg font-bold text-white transition animate-scale-up px-4 py-3 z-30 ${
                  answerState === 'correct' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                {answerState === 'correct' ? (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <CheckCircle2 className="w-6 h-6 animate-bounce shrink-0" />
                    <span className="leading-normal tracking-wide">ถูกต้อง! ยอดเยี่ยมมาก 🎉</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <XCircle className="w-6 h-6 shrink-0" />
                    <span className="leading-normal tracking-wide">
                      ยังไม่ถูกต้อง (คำตอบคือ: {activeQuestion.correctAnswer === 'yes' ? 'ใช่' : 'ไม่'})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Explanation Tooltip (แสดงเมื่อตอบแล้ว) */}
          {showExplanation && (
            <div className="p-2 rounded-xl bg-white border border-emerald-200 text-center text-xs font-semibold text-emerald-900 shadow-xs animate-fade-in flex items-center justify-center gap-1.5 shrink-0">
              <HelpCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{activeQuestion.explanation}</span>
            </div>
          )}

          {/* 3-Column Zero-Scroll Layout (Left: ใช่ | Center: Full Camera Viewport | Right: ไม่) */}
          <div className="w-full flex-1 min-h-0 grid grid-cols-12 gap-2.5 sm:gap-4 items-stretch my-auto">
            {/* Card 1 (Column 1): ใช่ (ยกมือซ้าย) - cols 3 */}
            <div
              onClick={() => handleAnswer('yes')}
              className={`col-span-3 bg-white rounded-3xl border-3 flex flex-col items-center justify-between p-3 sm:p-5 text-center cursor-pointer transition-all duration-200 active:scale-98 shadow-sm relative overflow-hidden select-none hover:shadow-md ${
                selectedSide === 'yes'
                  ? answerState === 'correct'
                    ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-400/40'
                    : 'border-rose-500 bg-rose-50'
                  : 'border-[#16A34A] hover:bg-emerald-50/40'
              }`}
            >
              {/* GPU-Accelerated Detection progress bar */}
              <div
                ref={leftProgressRef}
                className="absolute bottom-0 left-0 right-0 h-full bg-emerald-500/25 origin-bottom pointer-events-none will-change-transform"
                style={{ transform: 'scaleY(0)' }}
              />

              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#16A34A] shadow-inner mb-1 sm:mb-2 shrink-0">
                <Hand className="w-8 h-8 sm:w-10 sm:h-10 text-[#16A34A] stroke-[2.3]" />
              </div>

              <div className="flex-1 flex flex-col items-center justify-center my-1 sm:my-2">
                <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#16A34A] tracking-tight">
                  {t('card_yes_label')}
                </div>
              </div>

              <div className="w-full mt-auto space-y-2 shrink-0 z-10">
                <span className="inline-block w-full py-1.5 sm:py-2 px-2.5 rounded-full bg-[#DCFCE7] text-[#15803D] text-xs sm:text-sm font-black shadow-xs tracking-wide">
                  {t('card_raise_left_hand')}
                </span>
                {/* Horizontal Mini Progress Track with Percent Indicator */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#15803D] px-1">
                    <span>{t('card_hold_to_answer')}</span>
                    <span ref={leftProgressPercentRef} className="font-mono font-black">0%</span>
                  </div>
                  <div className="w-full bg-emerald-100/90 rounded-full h-2 sm:h-2.5 overflow-hidden border border-emerald-200">
                    <div
                      ref={leftProgressBarInnerRef}
                      className="h-full bg-[#16A34A] rounded-full transition-all duration-75"
                      style={{ width: '0%' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Full Center Camera Viewport - cols 6 */}
            <div className="col-span-6 bg-[#0B231C] rounded-3xl relative overflow-hidden border-2 border-emerald-900/70 shadow-xl flex items-center justify-center">
              {/* Live Video Feed */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transform ${
                  isMirrored ? 'scale-x-[-1]' : ''
                } transition-opacity duration-500 ${
                  cameraActive ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Mirror Toggle Button */}
              <button
                type="button"
                onClick={() => setIsMirrored((prev) => !prev)}
                title="สลับมุมมองกล้องกระจก"
                className="absolute top-3 right-3 z-25 px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/30 text-[11px] font-bold flex items-center gap-1 shadow-md transition active:scale-95 cursor-pointer"
              >
                <span>🪞 {isMirrored ? 'กระจก (เปิด)' : 'กระจก (ปิด)'}</span>
              </button>

              {/* Real Hand Skeleton & Dwell Progress Ring Overlay */}
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
              />

              {/* Subtle Center Guide Line (เส้นแบ่งโซนกึ่งกลางจาง ๆ ไม่บดบังภาพ) */}
              <div className="absolute top-4 bottom-14 left-1/2 -translate-x-1/2 w-px border-l border-dashed border-white/20 pointer-events-none z-10" />

              {/* Center Floating Question Illustration Badge (อยู่ตรงกลางด้านบน ไม่บังหน้าและมือ) */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-2xl bg-white/95 border border-emerald-200/90 shadow-lg flex items-center gap-2.5 pointer-events-none max-w-[85%]">
                <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 bg-emerald-50/80 rounded-xl flex items-center justify-center p-0.5 border border-emerald-100 overflow-hidden">
                  <PhysicalCardVisual
                    visualKey={activeQuestion.visualKey}
                    imageDescription={activeQuestion.imageDescription}
                    compact
                  />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">ภาพประกอบโจทย์</span>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-800 line-clamp-1 leading-snug">
                    {activeQuestion.imageDescription || activeQuestion.prompt}
                  </span>
                </div>
              </div>

              {/* Model Loading Status Badge */}
              {cameraActive && isModelLoading && (
                <div className="absolute top-16 z-20 px-3 py-1 rounded-full bg-emerald-950/85 text-emerald-200 border border-emerald-700/60 text-[10px] sm:text-xs font-bold flex items-center gap-1.5 shadow-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>กำลังเตรียมระบบตรวจจับมือจริง...</span>
                </div>
              )}

              {/* Model Error Fallback Alert Banner */}
              {modelError && (
                <div className="absolute top-16 z-25 px-3.5 py-1.5 rounded-full bg-amber-500/90 text-amber-950 border border-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-lg max-w-[90%]">
                  <AlertTriangle className="w-4 h-4 text-amber-900 shrink-0" />
                  <span className="truncate">{modelError} (แตะการ์ดบนจอเพื่อตอบแทนได้)</span>
                </div>
              )}

              {/* When camera is connecting / permission not active */}
              {!cameraActive && (
                <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 text-emerald-300/70 pointer-events-none">
                  <Camera className="w-7 h-7 opacity-60 animate-pulse" />
                  <span className="text-xs sm:text-sm font-semibold">กำลังเชื่อมต่อกล้อง หรือแตะการ์ดบนจอเพื่อตอบ</span>
                </div>
              )}

              {/* Corner Viewfinder HUD Brackets (กรอบ 4 มุมสีเขียวมิ้นต์ตามภาพ) */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-3 border-l-3 border-[#6EE7B7] rounded-tl-lg pointer-events-none z-15" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-3 border-l-3 border-[#6EE7B7] rounded-bl-lg pointer-events-none z-15" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-3 border-r-3 border-[#6EE7B7] rounded-br-lg pointer-events-none z-15" />

              {/* Bottom Dynamic Pill Banner */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap">
                <div
                  className={`px-4 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-extrabold shadow-lg flex items-center gap-2 border transition-all ${
                    isBothHandsWarning
                      ? 'bg-rose-600 text-white border-rose-400 animate-bounce'
                      : activeHandZone === 'LEFT'
                      ? 'bg-emerald-600 text-white border-emerald-400'
                      : activeHandZone === 'RIGHT'
                      ? 'bg-orange-600 text-white border-orange-400'
                      : activeHandZone === 'CENTER'
                      ? 'bg-teal-50 text-teal-900 border-teal-300'
                      : 'bg-white text-[#0F2D24] border-emerald-100'
                  }`}
                >
                  {isBothHandsWarning ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                      <span>
                        {lang.startsWith('zh')
                          ? '⚠️ 请仅举起一只手作答（左右手不可同时举起）'
                          : lang.startsWith('en')
                          ? '⚠️ Please raise only ONE hand to answer'
                          : '⚠️ กรุณายกมือเพียงข้างเดียวเพื่อตอบ (ห้ามยกพร้อมกันสองข้าง)'}
                      </span>
                    </>
                  ) : activeHandZone === 'LEFT' ? (
                    <>
                      <Hand className="w-4 h-4 text-emerald-200 shrink-0" />
                      <span>
                        {lang.startsWith('zh')
                          ? '🟢 正在选择“是”：保持举手 0.6 秒以确认'
                          : lang.startsWith('en')
                          ? '🟢 Holding Left: Confirming "Yes"...'
                          : '🟢 ค้างมือซ้าย 0.6 วินาที เพื่อตอบ "ใช่"'}
                      </span>
                    </>
                  ) : activeHandZone === 'RIGHT' ? (
                    <>
                      <Hand className="w-4 h-4 text-orange-200 shrink-0" />
                      <span>
                        {lang.startsWith('zh')
                          ? '🟠 正在选择“否”：保持举手 0.6 秒以确认'
                          : lang.startsWith('en')
                          ? '🟠 Holding Right: Confirming "No"...'
                          : '🟠 ค้างมือขวา 0.6 วินาที เพื่อตอบ "ไม่"'}
                      </span>
                    </>
                  ) : activeHandZone === 'CENTER' ? (
                    <>
                      <Hand className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>
                        {lang.startsWith('zh')
                          ? '👋 举起左手以选“是” | 举起右手以选“否”'
                          : lang.startsWith('en')
                          ? '👋 Raise Left for "Yes" | Raise Right for "No"'
                          : '👋 ยกมือไปทางซ้าย (ใช่) หรือขวา (ไม่)'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>{t('card_stand_visible_hint')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3 (Column 3): ไม่ (ยกมือขวา) - cols 3 */}
            <div
              onClick={() => handleAnswer('no')}
              className={`col-span-3 bg-white rounded-3xl border-3 flex flex-col items-center justify-between p-3 sm:p-5 text-center cursor-pointer transition-all duration-200 active:scale-98 shadow-sm relative overflow-hidden select-none hover:shadow-md ${
                selectedSide === 'no'
                  ? answerState === 'correct'
                    ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-400/40'
                    : 'border-rose-500 bg-rose-50'
                  : 'border-[#EA580C] hover:bg-orange-50/40'
              }`}
            >
              {/* GPU-Accelerated Detection progress bar */}
              <div
                ref={rightProgressRef}
                className="absolute bottom-0 left-0 right-0 h-full bg-orange-500/25 origin-bottom pointer-events-none will-change-transform"
                style={{ transform: 'scaleY(0)' }}
              />

              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#FFEDD5] flex items-center justify-center text-[#EA580C] shadow-inner mb-1 sm:mb-2 shrink-0">
                <Hand className="w-8 h-8 sm:w-10 sm:h-10 text-[#EA580C] stroke-[2.3]" />
              </div>

              <div className="flex-1 flex flex-col items-center justify-center my-1 sm:my-2">
                <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#EA580C] tracking-tight">
                  {t('card_no_label')}
                </div>
              </div>

              <div className="w-full mt-auto space-y-2 shrink-0 z-10">
                <span className="inline-block w-full py-1.5 sm:py-2 px-2.5 rounded-full bg-[#FFEDD5] text-[#C2410C] text-xs sm:text-sm font-black shadow-xs tracking-wide">
                  {t('card_raise_right_hand')}
                </span>
                {/* Horizontal Mini Progress Track with Percent Indicator */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#C2410C] px-1">
                    <span>{t('card_hold_to_answer')}</span>
                    <span ref={rightProgressPercentRef} className="font-mono font-black">0%</span>
                  </div>
                  <div className="w-full bg-orange-100/90 rounded-full h-2 sm:h-2.5 overflow-hidden border border-orange-200">
                    <div
                      ref={rightProgressBarInnerRef}
                      className="h-full bg-[#EA580C] rounded-full transition-all duration-75"
                      style={{ width: '0%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Assistive Hint */}
          <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-500 font-medium shrink-0">
            <span>{t('card_bottom_hint')}</span>
          </div>
        </div>
      ) : (
        /* Game Over / Summary Screen */
        <div className="w-full max-w-md mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-white border border-emerald-200 text-center shadow-xl animate-scale-up space-y-4">
          <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-3xl shadow-inner">
            <Trophy className="w-10 h-10" />
          </div>

          <div>
            <h3 className="text-2xl font-black text-slate-900">ยอดเยี่ยมมาก! จบรอบฝึกแล้ว</h3>
            <p className="text-xs text-slate-500 mt-1">
              ฝึกประสาทสัมผัส การรับรู้ และการเคลื่อนไหวร่างกายครบ {filteredList.length} ข้อ
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80">
            <div className="text-xs font-semibold text-emerald-800">ผลการประเมิน</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-700 my-1 font-mono">
              คะแนนที่ได้: {score} / {filteredList.length} คะแนน
            </div>
            <div className="text-xs text-emerald-700 font-semibold">
              ความถูกต้อง {Math.round((score / filteredList.length) * 100)}%
            </div>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleRestart}
              className="w-full py-3.5 rounded-xl bg-[#134E43] hover:bg-[#0f3d34] text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>🔄 เล่นรอบใหม่ (สุ่ม 10 ข้อใหม่)</span>
            </button>

            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>✅ เสร็จสิ้น / ปิดหน้าต่าง</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

