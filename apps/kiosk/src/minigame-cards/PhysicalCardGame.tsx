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
} from './PhysicalCardGameData.js';
import { PhysicalCardVisual } from './PhysicalCardVisuals.js';
import {
  HAND_ANSWER_MAP,
  MinigameHandEvaluation,
  MinigameFrameResult,
  evaluateMinigameFrame,
  drawAllMinigameHands,
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

  // Animated Dynamic Popup States
  const [activeHandState, setActiveHandState] = useState<{
    anatomicalSide: 'left' | 'right';
    answerSide: 'yes' | 'no';
  } | null>(null);
  const [isBothHandsWarning, setIsBothHandsWarning] = useState<boolean>(false);
  const [isNearEdge, setIsNearEdge] = useState<boolean>(false);
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
  const popupProgressBarRef = useRef<HTMLDivElement | null>(null);
  const popupProgressPercentRef = useRef<HTMLSpanElement | null>(null);
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
      setConfirmedAnswer(choice);

      // Auto transition to next question after 1.4s
      setTimeout(() => {
        setShowExplanation(false);
        setAnswerState('idle');
        setSelectedSide(null);
        setConfirmedAnswer(null);
        setActiveHandState(null);
        setIsBothHandsWarning(false);
        setIsNearEdge(false);
        if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
        if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';

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

  // 1. Initialize MediaPipe HandLandmarker with 2-Hand Detection (GPU + CPU fallback)
  useEffect(() => {
    let isCancelled = false;

    async function initLandmarker() {
      try {
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
          setModelError(err?.message || 'โมเดลตรวจจับมือขัดข้อง แตะปุ่มด้านล่างเพื่อตอบได้ทันที');
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

  // 2. Two-Hand Detection Loop: 480px Downscale, ~20 FPS Throttle, Anatomical Left/Right, Inverted Mapping & 600ms Dwell
  useEffect(() => {
    if (!cameraActive || isGameOver || answerState !== 'idle') {
      if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
      if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      return;
    }

    let animFrame: number;
    let lastDetectTime = 0;
    const TARGET_INTERVAL_MS = 50; // ~20 FPS throttle
    const HOLD_DWELL_MS = 600; // 0.6 seconds continuous hold requirement
    const GRACE_PERIOD_MS = 200; // 200ms grace period tolerance for frame drops

    let activeSide: 'left' | 'right' | null = null;
    let sideHoldStart = 0;
    let lastValidSeenTime = 0;
    let handNeutralFrames = 0;
    let candidateSide: 'left' | 'right' | null = null;
    let candidateCount = 0;

    const resetProgressDom = () => {
      if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
      if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
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
          // Downscale input frame to 480px width canvas to keep ML inference smooth
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
          const rawHands = result?.landmarks || [];
          const handednessList = result?.handednesses || [];

          // Multi-hand evaluation using anatomical left/right and inverted mapping
          const frameResult: MinigameFrameResult = evaluateMinigameFrame(rawHands, handednessList, {
            isMirrored,
            minConfidence: 0.5,
            maxYThreshold: 0.82,
            raisedTipMargin: 0.03,
          });

          // Edge detection state
          setIsNearEdge((prev) => (prev !== frameResult.hasNearEdgeHand ? frameResult.hasNearEdgeHand : prev));

          // 1. Bilateral Ambiguity Check: Both hands raised simultaneously
          if (frameResult.isBothHandsRaised) {
            activeSide = null;
            candidateSide = null;
            candidateCount = 0;
            sideHoldStart = 0;
            resetProgressDom();
            setIsBothHandsWarning(true);
            setActiveHandState(null);

            if (ctx) {
              drawAllMinigameHands(ctx, frameResult.allHands, canvas.width, canvas.height, null, 0, true);
            }
          } else {
            setIsBothHandsWarning(false);

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
              resetProgressDom();
              setActiveHandState(null);

              if (ctx) {
                drawAllMinigameHands(ctx, frameResult.allHands, canvas.width, canvas.height, null, 0, false);
              }
            } else if (frameResult.activeHand) {
              // 3. One hand raised
              const currentHand = frameResult.activeHand;
              const detectedSide = currentHand.anatomicalSide; // 'left' | 'right'
              lastValidSeenTime = monotonicTimestamp;

              if (activeSide === detectedSide) {
                const elapsed = monotonicTimestamp - sideHoldStart;
                const progress = Math.min(1.0, elapsed / HOLD_DWELL_MS);
                const percentStr = `${Math.round(progress * 100)}%`;

                if (popupProgressBarRef.current) {
                  popupProgressBarRef.current.style.width = percentStr;
                }
                if (popupProgressPercentRef.current) {
                  popupProgressPercentRef.current.textContent = percentStr;
                }

                if (ctx) {
                  drawAllMinigameHands(ctx, frameResult.allHands, canvas.width, canvas.height, currentHand, progress, false);
                }

                if (progress >= 1.0) {
                  const finalAnswer = currentHand.answerSide; // 'yes' or 'no'
                  activeSide = null;
                  candidateSide = null;
                  candidateCount = 0;
                  sideHoldStart = 0;
                  neutralGateRef.current = true;
                  handNeutralFrames = 0;
                  resetProgressDom();
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
                    resetProgressDom();
                    setActiveHandState({
                      anatomicalSide: activeSide,
                      answerSide: currentHand.answerSide,
                    });
                  }
                } else {
                  candidateSide = detectedSide;
                  candidateCount = 1;
                }

                if (ctx) {
                  drawAllMinigameHands(ctx, frameResult.allHands, canvas.width, canvas.height, currentHand, 0, false);
                }
              }
            } else {
              // 4. No hand raised (hands neutral or absent)
              if (activeSide && monotonicTimestamp - lastValidSeenTime < GRACE_PERIOD_MS) {
                // Grace period tolerance: hold active state for brief frame drops
                if (ctx) {
                  drawAllMinigameHands(ctx, frameResult.allHands, canvas.width, canvas.height, null, 0, false);
                }
              } else {
                activeSide = null;
                candidateSide = null;
                candidateCount = 0;
                sideHoldStart = 0;
                resetProgressDom();
                setActiveHandState(null);

                if (ctx) {
                  drawAllMinigameHands(ctx, frameResult.allHands, canvas.width, canvas.height, null, 0, false);
                }
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

    return () => {
      cancelAnimationFrame(animFrame);
      if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
      if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    };
  }, [cameraActive, isGameOver, answerState, isMirrored]);

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
    setActiveHandState(null);
    setIsBothHandsWarning(false);
    setIsNearEdge(false);
    setShowIntroBanner(true);
    setIsGameOver(false);
    setShowExplanation(false);
    if (popupProgressBarRef.current) popupProgressBarRef.current.style.width = '0%';
    if (popupProgressPercentRef.current) popupProgressPercentRef.current.textContent = '0%';
  };

  return (
    <div className="w-full h-full flex flex-col justify-between pt-3 pb-3 px-3 sm:pt-4 sm:pb-4 sm:px-5 md:px-6 bg-[#EDF7F1] text-slate-800 select-none overflow-hidden font-sans relative">
      {/* Top Header Bar */}
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
        <div className="w-full max-w-5xl xl:max-w-6xl mx-auto flex-1 flex flex-col justify-between gap-2 sm:gap-2.5 my-auto min-h-0">
          {/* Question Banner */}
          <div className="w-full bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 text-center shadow-xs border border-emerald-100/90 transition animate-fade-in relative overflow-hidden min-h-[60px] sm:min-h-[68px] flex items-center justify-center shrink-0">
            <h2 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-[#113C34] tracking-normal leading-tight">
              {activeQuestion.prompt}
            </h2>

            {/* Answer Result Banner Alert */}
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

          {/* Center Area: Full Camera Viewport with Top Animated Dynamic Popups (No Sidebars) */}
          <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-center relative my-auto">
            <div className="w-full h-full max-h-[60vh] sm:max-h-[64vh] aspect-video bg-[#0B231C] rounded-3xl relative overflow-hidden border-2 border-emerald-900/70 shadow-xl flex items-center justify-center">
              {/* Live Video Feed (Uncropped object-contain) */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-contain transform ${
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
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
              />

              {/* Question Illustration (Docked at bottom-left corner inside camera) */}
              <div className="absolute bottom-3 left-4 z-20 px-3 py-1.5 rounded-2xl bg-white/95 border border-emerald-200/90 shadow-lg flex items-center gap-2.5 pointer-events-none max-w-[48%] sm:max-w-[42%]">
                <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-emerald-50/80 rounded-xl flex items-center justify-center p-0.5 border border-emerald-100 overflow-hidden">
                  <PhysicalCardVisual
                    visualKey={activeQuestion.visualKey}
                    imageDescription={activeQuestion.imageDescription}
                    compact
                  />
                </div>
                <div className="flex flex-col text-left overflow-hidden">
                  <span className="text-[9px] sm:text-[10px] font-bold text-emerald-800 uppercase tracking-wider">ภาพประกอบโจทย์</span>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-800 truncate leading-snug">
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

              {/* ANIMATED DYNAMIC POPUPS (Floating Top-Center above camera, >= 28px font, high contrast) */}
              <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center gap-2 max-w-[90%]">
                {/* 1. Confirmed Answer Banner */}
                {confirmedAnswer && (
                  <div
                    className={`px-6 sm:px-8 py-3 rounded-2xl text-white shadow-2xl flex items-center gap-3 animate-scale-up border-2 ${
                      confirmedAnswer === 'yes'
                        ? 'bg-emerald-600 border-emerald-300'
                        : 'bg-orange-600 border-orange-300'
                    }`}
                  >
                    <CheckCircle2 className="w-8 h-8 text-white shrink-0 animate-bounce" />
                    <span className="text-[28px] sm:text-3xl md:text-4xl font-black">
                      {confirmedAnswer === 'yes' ? t('card_confirmed_yes') : t('card_confirmed_no')}
                    </span>
                  </div>
                )}

                {/* 2. Both Hands Warning Banner */}
                {!confirmedAnswer && isBothHandsWarning && (
                  <div className="px-6 sm:px-8 py-3 rounded-2xl bg-rose-600 text-white border-2 border-rose-300 shadow-2xl flex items-center gap-3 animate-bounce">
                    <AlertTriangle className="w-8 h-8 text-amber-300 shrink-0" />
                    <span className="text-[28px] sm:text-3xl md:text-4xl font-black">
                      {t('card_both_hands_warning')}
                    </span>
                  </div>
                )}

                {/* 3. Active Hand Raised Dwell Progress Popup */}
                {!confirmedAnswer && !isBothHandsWarning && activeHandState && (
                  <div
                    className={`px-6 sm:px-8 py-3 rounded-2xl text-white shadow-2xl flex flex-col items-center gap-2 border-2 min-w-[280px] sm:min-w-[340px] animate-fade-in ${
                      activeHandState.answerSide === 'yes'
                        ? 'bg-emerald-600 border-emerald-300'
                        : 'bg-orange-600 border-orange-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Hand className="w-8 h-8 text-white shrink-0 animate-pulse" />
                      <span className="text-[28px] sm:text-3xl md:text-4xl font-black tracking-wide">
                        {activeHandState.answerSide === 'yes'
                          ? t('card_right_hand_yes')
                          : t('card_left_hand_no')}
                      </span>
                      <span ref={popupProgressPercentRef} className="text-xl sm:text-2xl font-black font-mono ml-2">
                        0%
                      </span>
                    </div>
                    {/* 0.6s Progress Bar */}
                    <div className="w-full bg-black/25 rounded-full h-3 overflow-hidden border border-white/40">
                      <div
                        ref={popupProgressBarRef}
                        className="h-full bg-white rounded-full transition-[width] duration-75"
                        style={{ width: '0%' }}
                      />
                    </div>
                  </div>
                )}

                {/* 4. Question 1 Intro Banner (3 seconds) */}
                {!confirmedAnswer && !isBothHandsWarning && !activeHandState && showIntroBanner && (
                  <div className="px-6 py-2.5 rounded-2xl bg-white/95 border-2 border-emerald-500 shadow-2xl flex items-center gap-3 animate-fade-in">
                    <span className="text-[24px] sm:text-[28px] font-black text-[#134E43]">
                      {t('card_intro_popup_hint')}
                    </span>
                  </div>
                )}
              </div>

              {/* Near Edge Warning (Floating at bottom-center) */}
              {!confirmedAnswer && !isBothHandsWarning && isNearEdge && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-25 px-4 py-1.5 rounded-full bg-amber-500/90 text-amber-950 border border-amber-300 text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-lg pointer-events-none animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-amber-950 shrink-0" />
                  <span>{t('card_move_to_center')}</span>
                </div>
              )}
            </div>

            {/* Compact Touch Fallback Buttons under camera */}
            <div className="flex items-center justify-center gap-3 sm:gap-6 mt-3 shrink-0">
              <button
                type="button"
                onClick={() => handleAnswer('no')}
                className={`px-5 sm:px-8 py-2.5 sm:py-3 rounded-2xl border-2 font-extrabold text-base sm:text-lg shadow-sm hover:shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer ${
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
                className={`px-5 sm:px-8 py-2.5 sm:py-3 rounded-2xl border-2 font-extrabold text-base sm:text-lg shadow-sm hover:shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer ${
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
            <div className="flex items-center justify-center gap-2 pt-2 text-xs sm:text-sm text-slate-600 font-bold shrink-0">
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
