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

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
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
  const leftHudDotRef = useRef<HTMLSpanElement | null>(null);
  const rightHudDotRef = useRef<HTMLSpanElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Camera & Real Hand Landmarker Detection
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const neutralGateRef = useRef<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);

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
        if (leftHudDotRef.current) leftHudDotRef.current.className = 'w-2 h-2 rounded-full bg-emerald-600 transition-colors';
        if (rightHudDotRef.current) rightHudDotRef.current.className = 'w-2 h-2 rounded-full bg-orange-600 transition-colors';

        if (currentIndex + 1 < filteredList.length) {
          setCurrentIndex((i) => i + 1);
        } else {
          const finalScore = score + (isCorrect ? 1 : 0);
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

  // 1. Initialize MediaPipe HandLandmarker (Local Task and Wasm)
  useEffect(() => {
    let isCancelled = false;

    async function initLandmarker() {
      try {
        setIsModelLoading(true);
        const vision = await import('@mediapipe/tasks-vision');
        const { HandLandmarker, FilesetResolver } = vision;

        const wasmPath = '/models/wasm';
        const fileset = await FilesetResolver.forVisionTasks(wasmPath);

        if (isCancelled) return;

        let landmarker: any = null;
        try {
          landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: '/models/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.7,
            minHandPresenceConfidence: 0.7,
            minTrackingConfidence: 0.7,
          });
        } catch (gpuErr) {
          console.warn('MediaPipe HandLandmarker GPU delegate failed, falling back to CPU:', gpuErr);
          if (isCancelled) return;
          landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: '/models/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.7,
            minHandPresenceConfidence: 0.7,
            minTrackingConfidence: 0.7,
          });
        }

        if (!isCancelled) {
          handLandmarkerRef.current = landmarker;
          setIsModelLoading(false);
        } else {
          landmarker?.close();
        }
      } catch (err) {
        console.warn('Failed to load MediaPipe HandLandmarker:', err);
        if (!isCancelled) {
          setIsModelLoading(false);
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

  // 2. Strict Real Hand Detection Loop with 4-Layer Verification Gate, 600ms Dwell Time, & Neutral Reset
  useEffect(() => {
    if (!cameraActive || isGameOver || answerState !== 'idle') {
      if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
      if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
      if (leftHudDotRef.current) leftHudDotRef.current.className = 'w-2 h-2 rounded-full bg-emerald-600 transition-colors';
      if (rightHudDotRef.current) rightHudDotRef.current.className = 'w-2 h-2 rounded-full bg-orange-600 transition-colors';
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      return;
    }

    let animFrame: number;
    let lastDetectTime = 0;
    const TARGET_INTERVAL_MS = 36; // ~28 FPS: buttery-smooth real-time tracking
    const HOLD_DWELL_MS = 600; // 0.6 seconds continuous hold requirement

    let activeZone: 'LEFT' | 'RIGHT' | null = null;
    let zoneHoldStart = 0;
    let handNeutralFrames = 0;

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

        // Auto-fit canvas dimensions to video feed
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        try {
          const result = landmarker.detectForVideo(video, timestamp);
          const hands = result?.landmarks || [];
          const handedness = result?.handedness || [];

          let bestVerification: ReturnType<typeof verifyRealHandGesture> | null = null;
          let bestLandmarks: HandLandmarkPoint[] | null = null;

          // Check each detected hand
          for (let i = 0; i < hands.length; i++) {
            const handPts = hands[i] as HandLandmarkPoint[];
            const conf = handedness[i]?.[0]?.score ?? 0.85;
            const verification = verifyRealHandGesture(handPts, conf, {
              isMirrored: true,
              minConfidence: 0.75,
            });

            // Prioritize hand in active answer zone (LEFT or RIGHT)
            if (verification.isValidHand && verification.side) {
              bestVerification = verification;
              bestLandmarks = handPts;
              break;
            }

            // Otherwise, keep neutral hand for skeleton rendering feedback
            if (!bestVerification && verification.isHandDetected) {
              bestVerification = verification;
              bestLandmarks = handPts;
            }
          }

          if (bestVerification && bestLandmarks && ctx) {
            // Neutral Hand Reset Gate Check:
            // After answering 1 question, player must lower their hand before answering again
            if (neutralGateRef.current) {
              const isLowered =
                !bestVerification.isOpenPalm ||
                bestVerification.mirroredY > 0.70 ||
                bestVerification.zone === 'CENTER' ||
                bestVerification.zone === 'NONE';

              if (isLowered) {
                handNeutralFrames++;
                if (handNeutralFrames >= 5) {
                  neutralGateRef.current = false;
                  handNeutralFrames = 0;
                }
              } else {
                handNeutralFrames = 0;
              }

              // Clear progress bars while awaiting hand reset
              activeZone = null;
              zoneHoldStart = 0;
              if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
              if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
              if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
              if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
              if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
              if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';

              // Draw neutral cyan skeleton to show camera still tracks their hand
              drawHandSkeleton(ctx, bestLandmarks, canvas.width, canvas.height, 'CENTER', 0);
            } else {
              // Active Answer Verification Mode
              if (bestVerification.isValidHand && bestVerification.side) {
                const zone = bestVerification.zone as 'LEFT' | 'RIGHT';

                if (activeZone === zone) {
                  const elapsed = timestamp - zoneHoldStart;
                  const progress = Math.min(1.0, elapsed / HOLD_DWELL_MS);

                  // Update GPU-accelerated progress bars and horizontal inner indicators
                  const progressScale = progress.toFixed(3);
                  const percentStr = `${Math.round(progress * 100)}%`;
                  if (zone === 'LEFT' && leftProgressRef.current) {
                    leftProgressRef.current.style.transform = `scaleY(${progressScale})`;
                    if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = percentStr;
                    if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = percentStr;
                    if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
                    if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
                    if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
                  } else if (zone === 'RIGHT' && rightProgressRef.current) {
                    rightProgressRef.current.style.transform = `scaleY(${progressScale})`;
                    if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = percentStr;
                    if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = percentStr;
                    if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
                    if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
                    if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
                  }

                  // HUD indicator dots
                  if (leftHudDotRef.current) {
                    leftHudDotRef.current.className =
                      zone === 'LEFT'
                        ? 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 animate-pulse'
                        : 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-600 transition-colors';
                  }
                  if (rightHudDotRef.current) {
                    rightHudDotRef.current.className =
                      zone === 'RIGHT'
                        ? 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-400 animate-pulse'
                        : 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-600 transition-colors';
                  }

                  // Draw 21-point hand skeleton with dynamic hold dwell progress ring
                  drawHandSkeleton(ctx, bestLandmarks, canvas.width, canvas.height, zone, progress);

                  // Trigger answer after holding for 600ms continuously
                  if (progress >= 1.0) {
                    activeZone = null;
                    zoneHoldStart = 0;
                    neutralGateRef.current = true; // Lock until player lowers hand
                    handNeutralFrames = 0;

                    if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
                    if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
                    if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
                    if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
                    if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
                    if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';

                    handleAnswerRef.current(bestVerification.side);
                  }
                } else {
                  // Switched to a new zone
                  activeZone = zone;
                  zoneHoldStart = timestamp;

                  if (zone === 'LEFT') {
                    if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
                    if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
                    if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
                  }
                  if (zone === 'RIGHT') {
                    if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
                    if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
                    if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
                  }

                  drawHandSkeleton(ctx, bestLandmarks, canvas.width, canvas.height, zone, 0);
                }
              } else {
                // Hand in center neutral zone or not fully meeting open-palm criteria
                activeZone = null;
                zoneHoldStart = 0;
                if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
                if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
                if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
                if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
                if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
                if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
                if (leftHudDotRef.current) leftHudDotRef.current.className = 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-600 transition-colors';
                if (rightHudDotRef.current) rightHudDotRef.current.className = 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-600 transition-colors';

                drawHandSkeleton(ctx, bestLandmarks, canvas.width, canvas.height, bestVerification.zone, 0);
              }
            }
          } else {
            // No real hand detected (face, body, shirt motion or background pixels completely ignored)
            activeZone = null;
            zoneHoldStart = 0;
            handNeutralFrames++;
            if (handNeutralFrames >= 5) {
              neutralGateRef.current = false;
            }

            if (leftProgressRef.current) leftProgressRef.current.style.transform = 'scaleY(0)';
            if (rightProgressRef.current) rightProgressRef.current.style.transform = 'scaleY(0)';
            if (leftProgressBarInnerRef.current) leftProgressBarInnerRef.current.style.width = '0%';
            if (rightProgressBarInnerRef.current) rightProgressBarInnerRef.current.style.width = '0%';
            if (leftProgressPercentRef.current) leftProgressPercentRef.current.textContent = '0%';
            if (rightProgressPercentRef.current) rightProgressPercentRef.current.textContent = '0%';
            if (leftHudDotRef.current) leftHudDotRef.current.className = 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-600 transition-colors';
            if (rightHudDotRef.current) rightHudDotRef.current.className = 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-600 transition-colors';
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
    if (leftHudDotRef.current) leftHudDotRef.current.className = 'w-2 h-2 rounded-full bg-emerald-600 transition-colors';
    if (rightHudDotRef.current) rightHudDotRef.current.className = 'w-2 h-2 rounded-full bg-orange-600 transition-colors';
  };

  return (
    <div className="w-full h-full flex flex-col justify-between pt-3 pb-3 px-3 sm:pt-4 sm:pb-4 sm:px-5 md:px-6 bg-[#EDF7F1] text-slate-800 select-none overflow-hidden font-sans relative">
      {/* Top Header Bar (Safe top margin to prevent clipping against modal border) */}
      <div className="w-full max-w-5xl xl:max-w-6xl mx-auto flex items-center justify-between gap-2 shrink-0 pt-0.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-black text-[#134E43] tracking-normal">
            การ์ดกายภาพ
          </h1>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300/80 px-3 py-1 rounded-full shadow-xs">
            ข้อ {currentIndex + 1} / {filteredList.length}
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
            <span className="text-xs sm:text-sm font-bold tracking-wide">คะแนน</span>
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
                  ใช่
                </div>
              </div>

              <div className="w-full mt-auto space-y-2 shrink-0 z-10">
                <span className="inline-block w-full py-1.5 sm:py-2 px-2.5 rounded-full bg-[#DCFCE7] text-[#15803D] text-xs sm:text-sm font-black shadow-xs tracking-wide">
                  ✋ ยกมือซ้าย
                </span>
                {/* Horizontal Mini Progress Track with Percent Indicator */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#15803D] px-1">
                    <span>ค้างมือเพื่อตอบ</span>
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
                className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${
                  cameraActive ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Real Hand Skeleton & Dwell Progress Ring Overlay */}
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
              />

              {/* Left Hand Zone Guide (mirrored x < 0.42) */}
              <div className="absolute top-0 bottom-0 left-0 w-[42%] border-r-2 border-dashed border-emerald-400/40 bg-emerald-500/5 pointer-events-none z-15 p-2.5 sm:p-3">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs text-emerald-300 border border-emerald-500/40 text-[10px] sm:text-xs font-black shadow-md">
                  <span
                    ref={leftHudDotRef}
                    className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 transition-colors"
                  />
                  <span>โซนซ้าย (ใช่)</span>
                </div>
              </div>

              {/* Right Hand Zone Guide (mirrored x > 0.58) */}
              <div className="absolute top-0 bottom-0 right-0 w-[42%] border-l-2 border-dashed border-orange-400/40 bg-orange-500/5 pointer-events-none z-15 p-2.5 sm:p-3 flex justify-end">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs text-orange-300 border border-orange-500/40 text-[10px] sm:text-xs font-black shadow-md">
                  <span>โซนขวา (ไม่)</span>
                  <span
                    ref={rightHudDotRef}
                    className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-500 transition-colors"
                  />
                </div>
              </div>

              {/* Center Floating Question Illustration Badge (อยู่ตรงกลางด้านบน ไม่บังหน้าและมือ) */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-2xl bg-white/95 backdrop-blur-md border border-emerald-200/90 shadow-xl flex items-center gap-2.5 pointer-events-none max-w-[85%]">
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

              {/* When camera is connecting / permission not active */}
              {!cameraActive && (
                <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 text-emerald-300/70 pointer-events-none">
                  <Camera className="w-7 h-7 opacity-60 animate-pulse" />
                  <span className="text-xs sm:text-sm font-semibold">กำลังเชื่อมต่อกล้อง หรือแตะการ์ดบนจอเพื่อตอบ</span>
                </div>
              )}

              {/* Corner Viewfinder HUD Brackets (กรอบ 4 มุมสีเขียวมิ้นต์ตามภาพ) */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-3 border-l-3 border-[#6EE7B7] rounded-tl-lg pointer-events-none z-15" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-3 border-r-3 border-[#6EE7B7] rounded-tr-lg pointer-events-none z-15" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-3 border-l-3 border-[#6EE7B7] rounded-bl-lg pointer-events-none z-15" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-3 border-r-3 border-[#6EE7B7] rounded-br-lg pointer-events-none z-15" />

              {/* Bottom White Pill Banner */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap">
                <div className="px-4 sm:px-5 py-1.5 rounded-full bg-white text-[#0F2D24] text-xs sm:text-sm font-extrabold shadow-lg flex items-center gap-2 border border-emerald-100">
                  <Camera className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>ยืนให้เห็นมือทั้งสองข้าง (ค้างมือ 0.6 วินาทีเพื่อตอบ)</span>
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
                  ไม่
                </div>
              </div>

              <div className="w-full mt-auto space-y-2 shrink-0 z-10">
                <span className="inline-block w-full py-1.5 sm:py-2 px-2.5 rounded-full bg-[#FFEDD5] text-[#C2410C] text-xs sm:text-sm font-black shadow-xs tracking-wide">
                  ✋ ยกมือขวา
                </span>
                {/* Horizontal Mini Progress Track with Percent Indicator */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#C2410C] px-1">
                    <span>ค้างมือเพื่อตอบ</span>
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
            <span>แตะการ์ดบนหน้าจอ หรือยกมือซ้าย/ขวาผ่านกล้องค้างไว้ 0.6 วินาทีเพื่อตอบ</span>
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

