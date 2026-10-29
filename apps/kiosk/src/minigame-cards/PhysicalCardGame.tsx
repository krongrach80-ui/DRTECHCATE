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
  Volume2,
  VolumeX,
  RotateCcw,
  Trophy,
  ArrowRight,
  Hand,
  CheckCircle2,
  XCircle,
  HelpCircle,
  X,
  Camera,
} from 'lucide-react';

export interface PhysicalCardGameProps {
  onComplete?: (finalScore: number, totalQuestions: number) => void;
  onExit?: () => void;
  initialCategory?: string;
  maxQuestions?: number;
}

export const PhysicalCardGame: React.FC<PhysicalCardGameProps> = ({
  onComplete,
  onExit,
  initialCategory = 'ทั้งหมด',
  maxQuestions,
}) => {
  // Category state
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Filtered Question list
  const filteredList = React.useMemo(() => {
    let list = ALL_99_PHYSICAL_CARD_QUESTIONS;
    if (selectedCategory !== 'ทั้งหมด') {
      list = list.filter((q) => q.category === selectedCategory);
    }
    if (maxQuestions && maxQuestions > 0) {
      list = list.slice(0, maxQuestions);
    }
    return list;
  }, [selectedCategory, maxQuestions]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no' | null>(null);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [leftHoldProgress, setLeftHoldProgress] = useState<number>(0);
  const [rightHoldProgress, setRightHoldProgress] = useState<number>(0);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  // Camera & Motion Detection
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [detectedHand, setDetectedHand] = useState<'left' | 'right' | null>(null);

  const activeQuestion: PhysicalCardQuestion =
    filteredList[currentIndex] || ALL_99_PHYSICAL_CARD_QUESTIONS[0];

  // Sound Synthesizer via Web Audio API
  const playSound = useCallback(
    (type: 'correct' | 'wrong' | 'pop') => {
      if (!soundEnabled || typeof window === 'undefined') return;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();

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
    [soundEnabled]
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

  // Motion Detection Loop for raising left / right hand in front of camera
  useEffect(() => {
    if (!cameraActive || isGameOver || answerState !== 'idle') return;

    let animFrame: number;
    let prevFrameData: Uint8ClampedArray | null = null;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let leftAccumulator = 0;
    let rightAccumulator = 0;

    const checkMotion = () => {
      if (videoRef.current && ctx && videoRef.current.readyState === 4) {
        // Mirror horizontally on canvas to strictly align with mirrored camera preview and user perspective:
        // Screen Left (User Left hand) -> canvas x: 10 to 65 -> Left Zone ("ใช่")
        // Screen Right (User Right hand) -> canvas x: 95 to 150 -> Right Zone ("ไม่")
        ctx.save();
        ctx.translate(160, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, 160, 120);
        ctx.restore();

        const currentData = ctx.getImageData(0, 0, 160, 120).data;

        if (prevFrameData) {
          let leftMotion = 0;
          let rightMotion = 0;

          // Screen Left Zone (10 to 65 x, 10 to 65 y) -> ยกมือฝั่งซ้าย ตอบข้อทางซ้าย ("ใช่")
          // Screen Right Zone (95 to 150 x, 10 to 65 y) -> ยกมือฝั่งขวา ตอบข้อทางขวา ("ไม่")
          for (let y = 10; y < 65; y += 4) {
            for (let x = 10; x < 65; x += 4) {
              const i = (y * 160 + x) * 4;
              const diff =
                Math.abs(currentData[i] - prevFrameData[i]) +
                Math.abs(currentData[i + 1] - prevFrameData[i + 1]) +
                Math.abs(currentData[i + 2] - prevFrameData[i + 2]);
              if (diff > 55) leftMotion++;
            }
            for (let x = 95; x < 150; x += 4) {
              const i = (y * 160 + x) * 4;
              const diff =
                Math.abs(currentData[i] - prevFrameData[i]) +
                Math.abs(currentData[i + 1] - prevFrameData[i + 1]) +
                Math.abs(currentData[i + 2] - prevFrameData[i + 2]);
              if (diff > 55) rightMotion++;
            }
          }

          // Raise detection hysteresis
          if (leftMotion > 18) {
            leftAccumulator = Math.min(100, leftAccumulator + 18);
            rightAccumulator = Math.max(0, rightAccumulator - 15);
          } else {
            leftAccumulator = Math.max(0, leftAccumulator - 10);
          }

          if (rightMotion > 18) {
            rightAccumulator = Math.min(100, rightAccumulator + 18);
            leftAccumulator = Math.max(0, leftAccumulator - 15);
          } else {
            rightAccumulator = Math.max(0, rightAccumulator - 10);
          }

          setLeftHoldProgress(leftAccumulator / 100);
          setRightHoldProgress(rightAccumulator / 100);

          if (leftAccumulator >= 75) {
            setDetectedHand('left');
            handleAnswer('yes');
            leftAccumulator = 0;
          } else if (rightAccumulator >= 75) {
            setDetectedHand('right');
            handleAnswer('no');
            rightAccumulator = 0;
          } else {
            setDetectedHand(null);
          }
        }
        prevFrameData = new Uint8ClampedArray(currentData);
      }
      animFrame = requestAnimationFrame(checkMotion);
    };

    animFrame = requestAnimationFrame(checkMotion);
    return () => cancelAnimationFrame(animFrame);
  }, [cameraActive, isGameOver, answerState]);

  // Handle user's answer (via gesture or direct click)
  const handleAnswer = (choice: 'yes' | 'no') => {
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
      setLeftHoldProgress(0);
      setRightHoldProgress(0);

      if (currentIndex + 1 < filteredList.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsGameOver(true);
        if (onComplete) {
          onComplete(score + (isCorrect ? 1 : 0), filteredList.length);
        }
      }
    }, 1400);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setAnswerState('idle');
    setSelectedSide(null);
    setIsGameOver(false);
    setShowExplanation(false);
  };

  const categories = [
    'ทั้งหมด',
    'อาหาร & ผลไม้',
    'สิ่งของเครื่องใช้',
    'สัตว์ & ธรรมชาติ',
    'การนับจำนวน',
    'ความปลอดภัย & กิจวัตร',
    'สี รูปทรง & เวลา',
    'ตำแหน่ง & มโนทัศน์',
  ];

  return (
    <div className="w-full h-full flex flex-col justify-between p-4 sm:p-6 bg-[#EDF7F1] text-slate-800 select-none overflow-y-auto font-sans relative">
      {/* Top Header Bar */}
      <div className="w-full max-w-3xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-black text-[#134E43] tracking-normal">
            การ์ดกายภาพ
          </h1>
          <span className="text-[11px] font-semibold text-emerald-800/80 bg-emerald-100/70 border border-emerald-300/60 px-2.5 py-0.5 rounded-full">
            ข้อ {currentIndex + 1} / {filteredList.length}
          </span>
        </div>

        {/* Right Controls: Category filter, Sound, Exit & Score Pill */}
        <div className="flex items-center gap-2">
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

      {/* Category Pills (ช่วยให้เลือกฝึกเฉพาะหมวดหมู่ได้สะดวก) */}
      <div className="w-full max-w-3xl mx-auto flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setSelectedCategory(cat);
              setCurrentIndex(0);
              setScore(0);
            }}
            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
              selectedCategory === cat
                ? 'bg-[#134E43] text-white shadow-sm'
                : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200/60'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Game Screen */}
      {!isGameOver ? (
        <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-between gap-3 sm:gap-4 my-auto">
          {/* Question Banner (ตามแบบภาพ: กล่องขาวมน ข้อความใหญ่ตรงกลาง) */}
          <div className="w-full bg-white rounded-3xl p-4 sm:p-5 text-center shadow-sm border border-emerald-100/80 transition animate-fade-in relative overflow-hidden">
            <h2 className="text-xl sm:text-3xl font-extrabold text-[#113C34] tracking-normal leading-tight">
              {activeQuestion.prompt}
            </h2>

            {/* Answer Result Banner Alert */}
            {answerState !== 'idle' && (
              <div
                className={`absolute inset-0 flex items-center justify-center gap-2 text-base sm:text-lg font-bold text-white transition animate-scale-up ${
                  answerState === 'correct' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                {answerState === 'correct' ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 animate-bounce" />
                    <span>ถูกต้อง! ยอดเยี่ยมมาก 🎉</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-6 h-6" />
                    <span>ยังไม่ถูกต้อง (คำตอบคือ: {activeQuestion.correctAnswer === 'yes' ? 'ใช่' : 'ไม่'})</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 3 Interactive Cards Row (ตามภาพ: ซ้าย=ใช่, กลาง=รูปภาพ, ขวา=ไม่) */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4 items-stretch">
            {/* Card 1: ใช่ (ยกมือซ้าย) */}
            <div
              onClick={() => handleAnswer('yes')}
              className={`bg-white rounded-3xl border-3 flex flex-col items-center justify-between p-3 sm:p-5 text-center cursor-pointer transition-all duration-200 active:scale-95 shadow-sm relative overflow-hidden ${
                selectedSide === 'yes'
                  ? answerState === 'correct'
                    ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-400/30'
                    : 'border-rose-500 bg-rose-50'
                  : 'border-[#16A34A] hover:bg-emerald-50/50 hover:shadow-md'
              }`}
            >
              {/* Detection progress bar */}
              {leftHoldProgress > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-emerald-500/20 transition-all"
                  style={{ height: `${leftHoldProgress * 100}%` }}
                />
              )}

              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-[#16A34A] mb-1">
                <Hand className="w-8 h-8 sm:w-10 sm:h-10 text-[#16A34A] stroke-[2.2]" />
              </div>

              <div className="text-3xl sm:text-5xl font-black text-[#16A34A] tracking-tight my-1 sm:my-2">
                ใช่
              </div>

              <div className="w-full mt-1">
                <span className="inline-block w-full py-1 sm:py-1.5 px-2 rounded-full bg-[#DCFCE7] text-[#15803D] text-[11px] sm:text-xs font-bold shadow-xs">
                  ยกมือซ้าย
                </span>
              </div>
            </div>

            {/* Card 2: รูปภาพประกอบ (แสดงกราฟิกสวยงาม ตรงตามโจทย์) */}
            <div className="bg-white rounded-3xl border border-emerald-100 flex flex-col items-center justify-center p-3 sm:p-4 text-center shadow-sm relative overflow-hidden">
              <PhysicalCardVisual
                visualKey={activeQuestion.visualKey}
                imageDescription={activeQuestion.imageDescription}
              />
            </div>

            {/* Card 3: ไม่ (ยกมือขวา) */}
            <div
              onClick={() => handleAnswer('no')}
              className={`bg-white rounded-3xl border-3 flex flex-col items-center justify-between p-3 sm:p-5 text-center cursor-pointer transition-all duration-200 active:scale-95 shadow-sm relative overflow-hidden ${
                selectedSide === 'no'
                  ? answerState === 'correct'
                    ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-400/30'
                    : 'border-rose-500 bg-rose-50'
                  : 'border-[#EA580C] hover:bg-orange-50/50 hover:shadow-md'
              }`}
            >
              {/* Detection progress bar */}
              {rightHoldProgress > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-orange-500/20 transition-all"
                  style={{ height: `${rightHoldProgress * 100}%` }}
                />
              )}

              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-[#EA580C] mb-1">
                <Hand className="w-8 h-8 sm:w-10 sm:h-10 text-[#EA580C] stroke-[2.2]" />
              </div>

              <div className="text-3xl sm:text-5xl font-black text-[#EA580C] tracking-tight my-1 sm:my-2">
                ไม่
              </div>

              <div className="w-full mt-1">
                <span className="inline-block w-full py-1 sm:py-1.5 px-2 rounded-full bg-[#FFEDD5] text-[#C2410C] text-[11px] sm:text-xs font-bold shadow-xs">
                  ยกมือขวา
                </span>
              </div>
            </div>
          </div>

          {/* Explanation Tooltip (แสดงเมื่อตอบแล้ว) */}
          {showExplanation && (
            <div className="p-2.5 rounded-2xl bg-white border border-emerald-200 text-center text-xs font-semibold text-emerald-900 shadow-sm animate-fade-in flex items-center justify-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{activeQuestion.explanation}</span>
            </div>
          )}

          {/* Bottom Camera Viewport (ตามภาพต้นฉบับ: พื้นหลังเขียวเข้ม มีกรอบมุม HUD และรูปเงาคน) */}
          <div className="w-full h-44 sm:h-52 bg-[#0F2D24] rounded-3xl relative overflow-hidden border-2 border-emerald-900/60 shadow-lg flex items-center justify-center">
            {/* Live Video Feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${
                cameraActive ? 'opacity-70' : 'opacity-0'
              }`}
            />

            {/* Silhouette Person (แสดงตามแบบในภาพ) */}
            <div className="relative z-10 flex flex-col items-center justify-end h-full pb-8 pointer-events-none opacity-85">
              {/* Head */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#244C3F] border border-emerald-600/30 mb-1.5 shadow-inner" />
              {/* Shoulders / Torso */}
              <div className="w-28 h-16 sm:w-36 sm:h-20 rounded-t-full bg-[#244C3F] border-t border-x border-emerald-600/30" />
            </div>

            {/* Corner Viewfinder HUD Brackets (กรอบ 4 มุมสีเขียวมิ้นต์ตามภาพ) */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-3 border-l-3 border-[#6EE7B7] rounded-tl-lg pointer-events-none" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-3 border-r-3 border-[#6EE7B7] rounded-tr-lg pointer-events-none" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-3 border-l-3 border-[#6EE7B7] rounded-bl-lg pointer-events-none" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-3 border-r-3 border-[#6EE7B7] rounded-br-lg pointer-events-none" />

            {/* Live Hand Pose Indicator Hints */}
            <div className="absolute top-2.5 left-4 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 text-emerald-300 text-[10px] font-bold backdrop-blur-xs">
              <span className={`w-2 h-2 rounded-full ${detectedHand === 'left' ? 'bg-emerald-400 animate-ping' : 'bg-emerald-600'}`} />
              <span>โซนซ้าย (ใช่)</span>
            </div>
            <div className="absolute top-2.5 right-4 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 text-orange-300 text-[10px] font-bold backdrop-blur-xs">
              <span>โซนขวา (ไม่)</span>
              <span className={`w-2 h-2 rounded-full ${detectedHand === 'right' ? 'bg-orange-400 animate-ping' : 'bg-orange-600'}`} />
            </div>

            {/* Bottom White Pill Banner (ตรงตามภาพ: "ยืนให้เห็นมือทั้งสองข้าง") */}
            <div className="absolute bottom-3 z-20">
              <div className="px-5 py-1.5 rounded-full bg-white text-[#0F2D24] text-xs sm:text-sm font-extrabold shadow-md flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-emerald-700" />
                <span>ยืนให้เห็นมือทั้งสองข้าง</span>
              </div>
            </div>
          </div>

          {/* Quick Simulation Buttons for Accessibility / Testing without camera */}
          <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-500">
            <span>แตะการ์ดบนหน้าจอ หรือยกมือซ้าย/ขวาเพื่อตอบ</span>
            <span>•</span>
            <button
              type="button"
              onClick={() => handleAnswer('yes')}
              className="text-emerald-700 hover:underline font-semibold cursor-pointer"
            >
              [จำลองยกมือซ้าย]
            </button>
            <button
              type="button"
              onClick={() => handleAnswer('no')}
              className="text-orange-700 hover:underline font-semibold cursor-pointer"
            >
              [จำลองยกมือขวา]
            </button>
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
              ฝึกประสาทสัมผัส การรับรู้ และการเคลื่อนไหวร่างกายส่วนบน
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80">
            <div className="text-xs font-semibold text-emerald-800">คะแนนที่ได้</div>
            <div className="text-4xl font-black text-emerald-600 my-1 font-mono">
              {score} / {filteredList.length}
            </div>
            <div className="text-xs text-emerald-700 font-medium">
              ความแม่นยำ {Math.round((score / filteredList.length) * 100)}%
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={handleRestart}
              className="w-full py-3.5 rounded-xl bg-[#134E43] hover:bg-[#0f3d34] text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>เริ่มเล่นใหม่อีกครั้ง</span>
            </button>

            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                ออกจากมินิเกม
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
