/**
 * apps/kiosk/src/minigame-cards/PhysicalCardGame.tsx
 * มินิเกม "การ์ดกายภาพ" สำหรับฝึกสมองและการเคลื่อนไหว (Physical & Cognitive Cards)
 * ปรับปรุงระบบใหม่:
 * 1. ตรวจจับมือ 2 ข้างพร้อมกัน (Two-hand detection) ผ่าน MediaPipe HandLandmarker (numHands: 2)
 *    - วาด skeleton ให้ทุกมือที่ตรวจพบ
 *    - แยกซ้าย/ขวาตามกายวิภาคจริงของผู้เล่น (Anatomical Handedness)
 *    - ป้องกันมือถูกตัดขอบภาพด้วย object-contain
 *    - กรองเฉพาะผู้เล่นหลัก (largest palm) ป้องกันคนเดินผ่านข้างหลัง
 * 2. นำแผงด้านข้าง "ใช่" & "ไม่" ออก ขยายจอกล้องเต็มพื้นที่
 *    - สลับการตอบ: ยกมือขวา = "ใช่", ยกมือซ้าย = "ไม่"
 *    - ค้างไว้ 0.6 วินาทีเพื่อยืนยันคำตอบ
 *    - หากยก 2 ข้างพร้อมกัน ระบบจะไม่ตอบ
 *    - ปุ่มสัมผัสสำรองขนาดกะทัดรัดใต้กล้อง
 * 3. Animated Dynamic Popup แจ้งเตือนมือกำลังตอบ
 *    - ตัวอักษรขนาดใหญ่ >= 28px คอนทราสต์สูง มองเห็นชัดจากระยะ 1-2 เมตร
 *    - ลอยอยู่กึ่งกลางด้านบนกล้อง ไม่บังใบหน้าและมือ
 *    - แสดงหลอดความคืบหน้า 0.6 วินาที
 *    - ป้ายเตือนยกมือข้างเดียว / ป้ายขยับเข้ากลางภาพ / ป้ายยืนยันคำตอบ
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';
import {
  PhysicalCardQuestion,
  ALL_99_PHYSICAL_CARD_QUESTIONS,
  getLocalizedImageDescription,
} from './PhysicalCardGameData.js';
import { PhysicalCardVisual } from './PhysicalCardVisuals.js';
import {
  HAND_ANSWER_MAP,
  MinigameHandEvaluation,
  MinigameFrameResult,
  evaluateMinigameFrame,
  drawAllMinigameHands,
  interpolateHands,
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

// Module-level Singleton cache for MediaPipe HandLandmarker to avoid re-allocating 7.46 MB model
let cachedFileset: any = null;
let cachedHandLandmarker: any = null;
let landmarkerInitPromise: Promise<any> | null = null;

export const QUESTIONS_PER_ROUND = 10;
export const MAX_CROP_RATIO = 0.15; // ขีดจำกัดการครอปภาพสูงสุด 15% เพื่อให้เห็นศีรษะและมือครบถ้วน

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
  const [cameraAspectRatio, setCameraAspectRatio] = useState<number>(16 / 9);
  const [illustrationError, setIllustrationError] = useState<boolean>(false);

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

  // Animated Dynamic Popup States (Only state changes that require high-level UI updates)
  const [confirmedAnswer, setConfirmedAnswer] = useState<'yes' | 'no' | null>(null);
  const [showIntroBanner, setShowIntroBanner] = useState<boolean>(true);

  // Question 1 intro banner (3s fade out)
  useEffect(() => {
    if (currentIndex === 0) {
      setShowIntroBanner(true);
      const timer = setTimeout(() => {
        setShowIntroBanner(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowIntroBanner(false);
    }
  }, [currentIndex]);

  // High-performance DOM Refs (Zero React re-renders during motion detection)
  const popupContainerRef = useRef<HTMLDivElement | null>(null);
  const popupTitleRef = useRef<HTMLSpanElement | null>(null);
  const popupProgressBarRef = useRef<HTMLDivElement | null>(null);
  const popupProgressPercentRef = useRef<HTMLSpanElement | null>(null);
  const warningContainerRef = useRef<HTMLDivElement | null>(null);
  const nearEdgeContainerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Camera & Real Hand Landmarker Detection
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const neutralGateRef = useRef<boolean>(false);
  const lastTimestampRef = useRef<number>(0);
  const isDetectingRef = useRef<boolean>(false);
  const latestLandmarksRef = useRef<MinigameHandEvaluation[]>([]);
  const prevLandmarksRef = useRef<MinigameHandEvaluation[]>([]);
  const targetActiveHandRef = useRef<MinigameHandEvaluation | null>(null);
  const currentDwellProgressRef = useRef<number>(0);
  const isBothHandsWarningRef = useRef<boolean>(false);
  const rafIdRef = useRef<number>(0);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  const activeQuestion: PhysicalCardQuestion =
    filteredList[currentIndex] || ALL_99_PHYSICAL_CARD_QUESTIONS[0];

  // Reset illustration error when question changes
  useEffect(() => {
    setIllustrationError(false);
  }, [currentIndex, activeQuestion?.id]);

  const hasIllustration = Boolean(
    !illustrationError &&
    activeQuestion &&
    (activeQuestion.visualKey || activeQuestion.imageDescription || activeQuestion.iconEmoji)
  );

  const localizedCaption = getLocalizedImageDescription(activeQuestion, lang);

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

  // Handle video metadata to adapt camera aspect ratio
  const handleVideoMetadata = useCallback(() => {
    if (videoRef.current) {
      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      if (vw > 0 && vh > 0) {
        setCameraAspectRatio(vw / vh);
      }
    }
  }, []);

  // Initialize camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isCancelled = false;

    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 },
              facingMode: 'user',
            },
            audio: false,
          });
          if (!isCancelled && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              if (videoRef.current) {
                const vw = videoRef.current.videoWidth;
                const vh = videoRef.current.videoHeight;
                if (vw > 0 && vh > 0) {
                  setCameraAspectRatio(vw / vh);
                }
              }
            };
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
      setConfirmedAnswer(choice);

      // Auto transition to next question after 1.4s
      setTimeout(() => {
        setShowExplanation(false);
        setAnswerState('idle');
        setSelectedSide(null);
        setConfirmedAnswer(null);
        if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
        if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
        if (popupContainerRef.current) {
          popupContainerRef.current.style.opacity = '0';
          popupContainerRef.current.style.pointerEvents = 'none';
        }
        if (warningContainerRef.current) {
          warningContainerRef.current.style.opacity = '0';
          warningContainerRef.current.style.pointerEvents = 'none';
        }
        if (nearEdgeContainerRef.current) {
          nearEdgeContainerRef.current.style.opacity = '0';
        }

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

  // 1. Initialize MediaPipe HandLandmarker with Singleton Reuse (GPU + CPU fallback)
  useEffect(() => {
    let isCancelled = false;

    async function initLandmarker() {
      // 1. Check singleton reuse (0 ms reload when reopening modal)
      if (cachedHandLandmarker) {
        handLandmarkerRef.current = cachedHandLandmarker;
        setIsModelLoading(false);
        return;
      }

      if (landmarkerInitPromise) {
        try {
          const lm = await landmarkerInitPromise;
          if (!isCancelled && lm) {
            handLandmarkerRef.current = lm;
            setIsModelLoading(false);
            return;
          }
        } catch {
          // Fall through to retry init
        }
      }

      landmarkerInitPromise = (async () => {
        setIsModelLoading(true);
        setModelError(null);
        const vision = await import('@mediapipe/tasks-vision');
        const { HandLandmarker, FilesetResolver } = vision;

        const baseUrl = typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL
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

        let fileset = cachedFileset;
        if (!fileset) {
          for (const wSource of wasmSources) {
            try {
              fileset = await FilesetResolver.forVisionTasks(wSource);
              if (fileset) {
                cachedFileset = fileset;
                break;
              }
            } catch {
              // Try next wasm source
            }
          }
        }

        if (!fileset) {
          throw new Error('ไม่สามารถโหลดโมดูล WASM ของ MediaPipe ได้จากทุกแหล่ง');
        }

        let landmarker: any = null;
        let lastError: Error | null = null;

        for (const mSource of modelSources) {
          // 1. Try GPU delegate with numHands = 2, confidence 0.5
          try {
            landmarker = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: mSource,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
            if (landmarker) break;
          } catch {
            // 2. Fallback to CPU delegate with numHands = 2, confidence 0.5
            try {
              landmarker = await HandLandmarker.createFromOptions(fileset, {
                baseOptions: {
                  modelAssetPath: mSource,
                  delegate: 'CPU',
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
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

        cachedHandLandmarker = landmarker;
        return landmarker;
      })();

      try {
        const lm = await landmarkerInitPromise;
        if (!isCancelled && lm) {
          handLandmarkerRef.current = lm;
          setIsModelLoading(false);
        }
      } catch (err: any) {
        console.warn('MediaPipe HandLandmarker init error:', err);
        cachedHandLandmarker = null;
        landmarkerInitPromise = null;
        if (!isCancelled) {
          setIsModelLoading(false);
          setModelError(err?.message || 'โมเดลตรวจจับมือขัดข้อง แตะปุ่มด้านล่างเพื่อตอบได้ทันที');
        }
      }
    }

    initLandmarker();

    return () => {
      isCancelled = true;
      // Do not dispose cached singleton to enable instant 0ms reopening
      handLandmarkerRef.current = null;
    };
  }, []);

  // 2. High-Performance Decoupled Vision Loop:
  // - 60 FPS Canvas Overlay Render with Landmark Interpolation (Lerp)
  // - ~25 FPS Throttled Inference Cycle with Monotonic Timestamps
  // - Persistent DOM Updates (Zero React State Thrashing, Zero 0% Stuck)
  useEffect(() => {
    const resetProgressDom = () => {
      if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
      if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
      if (popupContainerRef.current) {
        popupContainerRef.current.style.opacity = '0';
        popupContainerRef.current.style.pointerEvents = 'none';
      }
      if (warningContainerRef.current) {
        warningContainerRef.current.style.opacity = '0';
        warningContainerRef.current.style.pointerEvents = 'none';
      }
      if (nearEdgeContainerRef.current) {
        nearEdgeContainerRef.current.style.opacity = '0';
      }
    };

    if (!cameraActive || isGameOver || answerState !== 'idle') {
      resetProgressDom();
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      return;
    }

    let animFrame: number;
    let lastDetectTime = 0;
    const TARGET_INTERVAL_MS = 40; // ~25 FPS detection rate
    const HOLD_DWELL_MS = 600; // 0.6 seconds continuous hold requirement
    const GRACE_PERIOD_MS = 200; // 200ms grace period tolerance for frame drops

    let activeSide: 'left' | 'right' | null = null;
    let sideHoldStart = 0;
    let lastValidSeenTime = 0;
    let handNeutralFrames = 0;
    let candidateSide: 'left' | 'right' | null = null;
    let candidateCount = 0;
    let currentDwellProgress = 0;
    let isBothHandsWarningActive = false;

    const frameLoop = (timestamp: number) => {
      const video = videoRef.current;
      const landmarker = handLandmarkerRef.current;
      const canvas = overlayCanvasRef.current;

      if (!video || video.readyState < 2 || video.paused || !canvas) {
        animFrame = requestAnimationFrame(frameLoop);
        return;
      }

      // Auto-fit overlay canvas dimensions to video feed (maintaining 100% adaptive camera layout)
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }

      // -------------------------------------------------------------
      // PART A: INFERENCE CYCLE (~25 FPS Throttle, Fixed 320x180 GPU Canvas)
      // -------------------------------------------------------------
      if (landmarker && !isDetectingRef.current && timestamp - lastDetectTime >= TARGET_INTERVAL_MS) {
        lastDetectTime = timestamp;
        isDetectingRef.current = true;

        try {
          // Downscale input frame to fixed 320x180 canvas with willReadFrequently: false (GPU accelerated)
          let dCanvas = detectCanvasRef.current;
          let dctx = detectContextRef.current;
          if (!dCanvas) {
            dCanvas = document.createElement('canvas');
            dCanvas.width = 320;
            dCanvas.height = 180;
            detectCanvasRef.current = dCanvas;
            dctx = dCanvas.getContext('2d', { willReadFrequently: false });
            detectContextRef.current = dctx;
          }
          if (dctx) {
            dctx.drawImage(video, 0, 0, 320, 180);
          }

          // Strict monotonic timestamp guard
          const monotonicTimestamp = Math.max(timestamp, (lastTimestampRef.current || 0) + 1);
          lastTimestampRef.current = monotonicTimestamp;

          const result = landmarker.detectForVideo(dCanvas, monotonicTimestamp);
          const rawHands = result?.landmarks || [];
          const handednessList = result?.handednesses || [];

          // Multi-hand evaluation using anatomical left/right and inverted mapping
          const frameResult: MinigameFrameResult = evaluateMinigameFrame(rawHands, handednessList, {
            isMirrored,
            minConfidence: 0.45,
            maxYThreshold: 0.78,
            raisedTipMargin: 0.03,
          });

          // Edge detection state (Direct DOM)
          if (nearEdgeContainerRef.current) {
            nearEdgeContainerRef.current.style.opacity = frameResult.hasNearEdgeHand ? '1' : '0';
          }

          // 1. Bilateral Ambiguity Check: Both hands raised simultaneously
          if (frameResult.isBothHandsRaised) {
            activeSide = null;
            candidateSide = null;
            candidateCount = 0;
            sideHoldStart = 0;
            currentDwellProgress = 0;
            isBothHandsWarningActive = true;

            // Direct DOM updates
            if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
            if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
            if (popupContainerRef.current) {
              popupContainerRef.current.style.opacity = '0';
              popupContainerRef.current.style.pointerEvents = 'none';
            }
            if (warningContainerRef.current) {
              warningContainerRef.current.style.opacity = '1';
              warningContainerRef.current.style.pointerEvents = 'auto';
            }
          } else {
            isBothHandsWarningActive = false;
            if (warningContainerRef.current) {
              warningContainerRef.current.style.opacity = '0';
              warningContainerRef.current.style.pointerEvents = 'none';
            }

            // 2. Neutral Hand Reset Gate Check: Must lower hands between questions
            if (neutralGateRef.current) {
              const isLowered = frameResult.raisedHands.length === 0;
              if (isLowered) {
                handNeutralFrames++;
                if (handNeutralFrames >= 3) {
                  neutralGateRef.current = false;
                  handNeutralFrames = 0;
                }
              } else {
                handNeutralFrames = 0;
              }

              activeSide = null;
              candidateSide = null;
              candidateCount = 0;
              sideHoldStart = 0;
              currentDwellProgress = 0;

              if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
              if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
              if (popupContainerRef.current) {
                popupContainerRef.current.style.opacity = '0';
                popupContainerRef.current.style.pointerEvents = 'none';
              }
            } else if (frameResult.activeHand) {
              // 3. One hand raised
              const currentHand = frameResult.activeHand;
              const detectedSide = currentHand.anatomicalSide; // 'left' | 'right'
              lastValidSeenTime = monotonicTimestamp;

              if (activeSide === detectedSide) {
                const elapsed = monotonicTimestamp - sideHoldStart;
                currentDwellProgress = Math.min(1.0, elapsed / HOLD_DWELL_MS);
                const percentStr = `${Math.round(currentDwellProgress * 100)}%`;

                if (popupProgressBarRef.current) {
                  popupProgressBarRef.current.style.width = percentStr;
                }
                if (popupProgressPercentRef.current) {
                  popupProgressPercentRef.current.textContent = percentStr;
                }

                // Show popup container directly
                if (popupContainerRef.current) {
                  popupContainerRef.current.style.opacity = '1';
                  popupContainerRef.current.style.pointerEvents = 'auto';
                  const isScreenRight = isMirrored
                    ? detectedSide === 'right'
                    : detectedSide === 'left';
                  popupContainerRef.current.className = `absolute z-30 pointer-events-none px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-white shadow-xl flex items-center gap-2.5 border h-[42px] sm:h-[44px] whitespace-nowrap transition-all duration-150 opacity-100 ${
                    isScreenRight
                      ? 'top-10 sm:top-11 right-2.5 sm:right-3'
                      : 'top-2.5 sm:top-3 left-2.5 sm:left-3'
                  } ${
                    currentHand.answerSide === 'yes'
                      ? 'bg-emerald-600/95 border-emerald-300'
                      : 'bg-orange-600/95 border-orange-300'
                  }`;
                }
                if (popupTitleRef.current) {
                  popupTitleRef.current.textContent =
                    currentHand.answerSide === 'yes'
                      ? t('card_right_hand_yes')
                      : t('card_left_hand_no');
                }

                if (currentDwellProgress >= 1.0) {
                  const finalAnswer = currentHand.answerSide; // 'yes' or 'no'
                  activeSide = null;
                  candidateSide = null;
                  candidateCount = 0;
                  sideHoldStart = 0;
                  currentDwellProgress = 0;
                  neutralGateRef.current = true;
                  handNeutralFrames = 0;
                  if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
                  if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
                  if (popupContainerRef.current) {
                    popupContainerRef.current.style.opacity = '0';
                    popupContainerRef.current.style.pointerEvents = 'none';
                  }
                  handleAnswerRef.current(finalAnswer);
                }
              } else {
                // Hysteresis: Require 2 consecutive frames before switching activeSide
                if (candidateSide === detectedSide) {
                  candidateCount++;
                  if (candidateCount >= 2) {
                    activeSide = detectedSide;
                    sideHoldStart = monotonicTimestamp;
                    candidateCount = 0;
                    currentDwellProgress = 0.05; // เริ่มต้นที่ 5% ทันที ไม่ค้างที่ 0%
                    if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '5%';
                    if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '5%';
                    if (popupContainerRef.current) {
                      popupContainerRef.current.style.opacity = '1';
                      popupContainerRef.current.style.pointerEvents = 'auto';
                      const isScreenRight = isMirrored
                        ? activeSide === 'right'
                        : activeSide === 'left';
                      popupContainerRef.current.className = `absolute z-30 pointer-events-none px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-white shadow-xl flex items-center gap-2.5 border h-[42px] sm:h-[44px] whitespace-nowrap transition-all duration-150 opacity-100 ${
                        isScreenRight
                          ? 'top-10 sm:top-11 right-2.5 sm:right-3'
                          : 'top-2.5 sm:top-3 left-2.5 sm:left-3'
                      } ${
                        currentHand.answerSide === 'yes'
                          ? 'bg-emerald-600/95 border-emerald-300'
                          : 'bg-orange-600/95 border-orange-300'
                      }`;
                    }
                    if (popupTitleRef.current) {
                      popupTitleRef.current.textContent =
                        currentHand.answerSide === 'yes'
                          ? t('card_right_hand_yes')
                          : t('card_left_hand_no');
                    }
                  }
                } else {
                  candidateSide = detectedSide;
                  candidateCount = 1;
                }
              }
            } else {
              // 4. No hand raised (hands neutral or absent)
              if (activeSide && monotonicTimestamp - lastValidSeenTime < GRACE_PERIOD_MS) {
                // Grace period tolerance: keep hold dwell timing alive during brief frame drops
                const elapsed = monotonicTimestamp - sideHoldStart;
                currentDwellProgress = Math.min(1.0, elapsed / HOLD_DWELL_MS);
                const percentStr = `${Math.round(currentDwellProgress * 100)}%`;
                if (popupProgressBarRef.current) {
                  popupProgressBarRef.current.style.width = percentStr;
                }
                if (popupProgressPercentRef.current) {
                  popupProgressPercentRef.current.textContent = percentStr;
                }
              } else {
                activeSide = null;
                candidateSide = null;
                candidateCount = 0;
                sideHoldStart = 0;
                currentDwellProgress = 0;
                if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
                if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
                if (popupContainerRef.current) {
                  popupContainerRef.current.style.opacity = '0';
                  popupContainerRef.current.style.pointerEvents = 'none';
                }
              }
            }
          }

          // Target hands for continuous 60 FPS interpolation
          latestLandmarksRef.current = frameResult.allHands;
          targetActiveHandRef.current = frameResult.activeHand;
          currentDwellProgressRef.current = currentDwellProgress;
          isBothHandsWarningRef.current = isBothHandsWarningActive;
        } catch {
          // Frame skip safe
        } finally {
          isDetectingRef.current = false;
        }
      }

      // -------------------------------------------------------------
      // PART B: 60 FPS CANVAS OVERLAY RENDER WITH LERP INTERPOLATION
      // -------------------------------------------------------------
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Smooth multi-hand landmarks at display refresh rate using polymorphic Lerp
        const currentTargets = latestLandmarksRef.current;
        if (currentTargets && currentTargets.length > 0) {
          const smoothedHands = interpolateHands(
            prevLandmarksRef.current,
            currentTargets,
            0.45
          );
          prevLandmarksRef.current = smoothedHands;

          const activeHandToDraw = targetActiveHandRef.current
            ? smoothedHands.find((h) => h.anatomicalSide === targetActiveHandRef.current?.anatomicalSide) || targetActiveHandRef.current
            : null;

          drawAllMinigameHands(
            ctx,
            smoothedHands,
            canvas.width,
            canvas.height,
            activeHandToDraw,
            currentDwellProgressRef.current,
            isBothHandsWarningRef.current,
            isMirrored
          );
        } else {
          prevLandmarksRef.current = [];
        }
      }

      animFrame = requestAnimationFrame(frameLoop);
    };

    animFrame = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(animFrame);
      resetProgressDom();
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    };
  }, [cameraActive, isGameOver, answerState, isMirrored, t]);

  const handleRestart = () => {
    try {
      sessionStorage.removeItem('kiosk_card_game_state');
    } catch {}
    setSessionSeed((s) => s + 1);
    setCurrentIndex(0);
    setScore(0);
    setAnswerState('idle');
    setSelectedSide(null);
    setConfirmedAnswer(null);
    setShowIntroBanner(true);
    setIsGameOver(false);
    setShowExplanation(false);
    if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
    if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
    if (popupContainerRef.current) {
      popupContainerRef.current.style.opacity = '0';
      popupContainerRef.current.style.pointerEvents = 'none';
    }
    if (warningContainerRef.current) {
      warningContainerRef.current.style.opacity = '0';
      warningContainerRef.current.style.pointerEvents = 'none';
    }
    if (nearEdgeContainerRef.current) {
      nearEdgeContainerRef.current.style.opacity = '0';
    }
  };

  // Centralized CSS variables for single-line hand popups
  const popupCssVars: React.CSSProperties = {
    '--popup-max-h': '44px',
    '--popup-font-size': '20px',
    '--popup-icon-size': '22px',
    '--popup-percent-size': '15px',
    '--popup-bar-h': '4px',
    '--popup-pad-y': '8px',
    '--popup-pad-x': '14px',
  } as React.CSSProperties;

  return (
    <div className="w-full h-full flex flex-col justify-between pt-2.5 pb-2.5 px-3 sm:pt-3 sm:pb-3 sm:px-5 md:px-6 bg-[#EDF7F1] text-slate-800 select-none overflow-hidden font-sans relative">
      {/* Top Header Bar */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between gap-2 shrink-0 pt-0.5">
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

          {/* Score Pill Badge */}
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
        <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col items-center justify-between gap-1.5 sm:gap-2 my-auto min-h-0">
          {/* Question Banner */}
          <div className="w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 text-center shadow-xs border border-emerald-100/90 transition animate-fade-in relative overflow-hidden min-h-[50px] sm:min-h-[56px] flex items-center justify-center shrink-0">
            <h2 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-[#113C34] tracking-normal leading-tight">
              {activeQuestion.prompt}
            </h2>

            {/* Answer Result Banner Alert */}
            {answerState !== 'idle' && (
              <div
                className={`absolute inset-0 flex items-center justify-center gap-2 text-base sm:text-lg font-bold text-white transition animate-scale-up px-4 py-2 z-30 ${
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

          {/* 🆕 Question Illustration Section (Hug Content, Centered directly below Question Box) */}
          {hasIllustration && (
            <div
              className="mx-auto w-fit max-w-[640px] h-[112px] sm:h-[118px] flex items-center justify-center gap-5 sm:gap-6 px-6 py-2.5 sm:py-3 bg-white border-2 border-emerald-200/90 rounded-2xl shadow-sm shrink-0 transition-all duration-300"
              role="region"
              aria-label={t('card_illustration_label')}
            >
              <div
                className="w-[96px] h-[96px] sm:w-[104px] sm:h-[104px] flex items-center justify-center shrink-0 select-none overflow-hidden"
                role="img"
                aria-label={`${t('card_illustration_label')}: ${localizedCaption}`}
              >
                <PhysicalCardVisual
                  visualKey={activeQuestion.visualKey}
                  imageDescription={activeQuestion.imageDescription}
                  size="large"
                />
              </div>
              <div className="flex flex-col items-start justify-center text-left overflow-hidden">
                <span className="text-[13px] sm:text-[14px] font-bold text-emerald-700 uppercase tracking-wider leading-tight">
                  {t('card_illustration_label')}
                </span>
                <span className="text-[30px] sm:text-[32px] font-black text-slate-900 leading-tight tracking-tight">
                  {localizedCaption}
                </span>
              </div>
            </div>
          )}

          {/* Center Area: Full Camera Viewport with Top Animated Dynamic Popups (Locked to ~665x375px) */}
          <div className="w-full flex flex-col items-center justify-center relative shrink-0">
            <div
              className="w-[665px] max-w-full h-[375px] max-h-[375px] bg-[#0B231C] rounded-3xl relative overflow-hidden border-2 border-emerald-900/70 shadow-xl flex items-center justify-center shrink-0"
              style={{
                aspectRatio: `${cameraAspectRatio}`,
                ...popupCssVars,
              }}
            >
              {/* Live Video Feed (Adaptive Aspect Ratio & Zero Pillarbox) */}
              <video
                ref={videoRef}
                playsInline
                muted
                onLoadedMetadata={handleVideoMetadata}
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

              {/* Model Loading Status Badge */}
              {cameraActive && isModelLoading && (
                <div className="absolute top-14 z-20 px-3 py-1 rounded-full bg-emerald-950/85 text-emerald-200 border border-emerald-700/60 text-[10px] sm:text-xs font-bold flex items-center gap-1.5 shadow-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>กำลังเตรียมระบบตรวจจับมือจริง...</span>
                </div>
              )}

              {/* Model Error Fallback Alert Banner */}
              {modelError && (
                <div className="absolute top-14 z-25 px-3.5 py-1.5 rounded-full bg-amber-500/90 text-amber-950 border border-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-lg max-w-[90%]">
                  <AlertTriangle className="w-4 h-4 text-amber-900 shrink-0" />
                  <span className="truncate">{modelError} (แตะปุ่มด้านล่างเพื่อตอบแทนได้)</span>
                </div>
              )}

              {/* Camera Inactive placeholder */}
              {!cameraActive && (
                <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 text-emerald-300/70 pointer-events-none">
                  <Camera className="w-7 h-7 opacity-60 animate-pulse" />
                  <span className="text-xs sm:text-sm font-semibold">กำลังเชื่อมต่อกล้อง หรือแตะปุ่มด้านล่างเพื่อตอบ</span>
                </div>
              )}

              {/* Corner Viewfinder HUD Brackets */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-3 border-l-3 border-[#6EE7B7] rounded-tl-lg pointer-events-none z-15" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-3 border-l-3 border-[#6EE7B7] rounded-bl-lg pointer-events-none z-15" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-3 border-r-3 border-[#6EE7B7] rounded-br-lg pointer-events-none z-15" />

              {/* ANIMATED DYNAMIC POPUPS (Single-line pills, <= 44-48px height, 220-340px width) */}
              {/* 1. Confirmed Answer Banner (Top Center, Single-line) */}
              {confirmedAnswer && (
                <div
                  className={`absolute top-2.5 sm:top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-4 py-2 rounded-full text-white shadow-xl flex items-center gap-2 animate-scale-up border max-w-[90%] whitespace-nowrap h-[42px] sm:h-[44px] ${
                    confirmedAnswer === 'yes'
                      ? 'bg-emerald-600/95 border-emerald-300'
                      : 'bg-orange-600/95 border-orange-300'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5 text-white shrink-0 animate-bounce" />
                  <span className="text-[20px] sm:text-[21px] font-black leading-none">
                    {confirmedAnswer === 'yes' ? t('card_confirmed_yes') : t('card_confirmed_no')}
                  </span>
                </div>
              )}

              {/* 2. Both Hands Warning Banner (Always Mounted DOM, Controlled via Ref) */}
              <div
                ref={warningContainerRef}
                className="absolute top-2.5 sm:top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-4 py-2 rounded-full bg-rose-600/95 text-white border border-rose-300 shadow-xl flex items-center gap-2 max-w-[90%] whitespace-nowrap h-[42px] sm:h-[44px] transition-all duration-150 opacity-0 pointer-events-none"
              >
                <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
                <span className="text-[20px] sm:text-[21px] font-black leading-none">
                  {t('card_both_hands_warning')}
                </span>
              </div>

              {/* 3. Active Hand Raised Dwell Progress Popup (Always Mounted DOM, Zero 0% Stuck) */}
              <div
                ref={popupContainerRef}
                className="absolute z-30 pointer-events-none px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-white shadow-xl flex items-center gap-2.5 border h-[42px] sm:h-[44px] whitespace-nowrap transition-all duration-150 opacity-0 pointer-events-none top-2.5 sm:top-3 left-2.5 sm:left-3 bg-emerald-600/95 border-emerald-300"
              >
                <Hand className="w-5 h-5 text-white shrink-0 animate-pulse" />
                <span ref={popupTitleRef} className="text-[20px] sm:text-[21px] font-black tracking-wide leading-none">
                  {t('card_right_hand_yes')}
                </span>
                {/* 4px Progress Bar */}
                <div className="w-12 sm:w-16 bg-black/30 rounded-full h-1 overflow-hidden border border-white/40 shrink-0">
                  <div
                    ref={popupProgressBarRef}
                    className="h-full bg-white rounded-full transition-[width] duration-75"
                    style={{ width: '0%' }}
                  />
                </div>
                <span ref={popupProgressPercentRef} className="text-sm sm:text-[15px] font-black font-mono shrink-0">
                  0%
                </span>
              </div>

              {/* 4. Question 1 Intro Banner (3 seconds, Single-line, Top Center) */}
              {!confirmedAnswer && showIntroBanner && (
                <div className="absolute top-2.5 sm:top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-4 py-2 sm:px-5 sm:py-2 rounded-full bg-white/95 border border-emerald-400 shadow-xl flex items-center gap-2 animate-fade-in whitespace-nowrap h-[42px] sm:h-[44px]">
                  <span className="text-[20px] sm:text-[21px] font-extrabold text-[#134E43] leading-none">
                    {t('card_intro_popup_hint')}
                  </span>
                </div>
              )}

              {/* Near Edge Warning (Floating at bottom-center) */}
              <div
                ref={nearEdgeContainerRef}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-25 px-4 py-1.5 rounded-full bg-amber-500/90 text-amber-950 border border-amber-300 text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-lg pointer-events-none transition-opacity duration-150 opacity-0"
              >
                <AlertTriangle className="w-4 h-4 text-amber-950 shrink-0" />
                <span>{t('card_move_to_center')}</span>
              </div>
            </div>

            {/* Compact Touch Fallback Buttons under camera */}
            <div className="flex items-center justify-center gap-3 sm:gap-6 mt-2 shrink-0">
              <button
                type="button"
                onClick={() => handleAnswer('no')}
                className={`px-5 sm:px-8 py-2 sm:py-2.5 rounded-2xl border-2 font-extrabold text-base sm:text-lg shadow-sm hover:shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer ${
                  selectedSide === 'no'
                    ? answerState === 'correct'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-rose-500 bg-rose-50 text-rose-800'
                    : 'bg-white hover:bg-orange-50 border-[#EA580C] text-[#EA580C]'
                }`}
              >
                <Hand className="w-5 h-5 text-[#EA580C]" />
                <span>{t('card_btn_tap_no')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleAnswer('yes')}
                className={`px-5 sm:px-8 py-2 sm:py-2.5 rounded-2xl border-2 font-extrabold text-base sm:text-lg shadow-sm hover:shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer ${
                  selectedSide === 'yes'
                    ? answerState === 'correct'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-rose-500 bg-rose-50 text-rose-800'
                    : 'bg-white hover:bg-emerald-50 border-[#16A34A] text-[#16A34A]'
                }`}
              >
                <Hand className="w-5 h-5 text-[#16A34A]" />
                <span>{t('card_btn_tap_yes')}</span>
              </button>
            </div>

            {/* Assistive Hint */}
            <div className="flex items-center justify-center gap-2 pt-1.5 text-xs sm:text-sm text-slate-600 font-bold shrink-0">
              <span>{t('card_bottom_hint')}</span>
            </div>
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
