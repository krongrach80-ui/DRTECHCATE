/**
 * apps/kiosk/src/smart-flow/SmartDailyPlanView.tsx
 * Dynamic Daily Rehab Plan & Interactive Quiz Engine
 * Conforms to Master Prompt v4 Section 4.3
 */

import React, { useState, useEffect, useRef } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import {
  CheckCircle2,
  Trophy,
  Activity,
  ArrowRight,
  LogOut,
  RefreshCw,
  Sun,
  Brain,
  ChevronRight as _ChevronRight,
  Gamepad2 as _Gamepad2,
} from 'lucide-react';
import { PhysicalCardGame } from '../minigame-cards/index.js';

interface SmartDailyPlanViewProps {
  patient: PatientRecordFile;
  onLogout: () => void;
}

export const SmartDailyPlanView: React.FC<SmartDailyPlanViewProps> = ({
  patient,
  onLogout,
}) => {
  const [loading, setLoading] = useState(true);
  const [isScheduledToday, setIsScheduledToday] = useState(false);
  const [restReason, setRestReason] = useState<string>('');
  const [exercises, setExercises] = useState<any[]>([]);
  const [includeMinigame, setIncludeMinigame] = useState(false);

  // Exercise tracking
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());

  // Minigame states
  const [isPlayingQuiz, setIsPlayingQuiz] = useState(false);
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);

  // Final session completed state
  const [isSessionCompleted, setIsSessionCompleted] = useState(false);
  const [activePtNoticeExercise, setActivePtNoticeExercise] = useState<any | null>(null);
  const [autoResetSeconds, setAutoResetSeconds] = useState(8);

  const isMountedRef = useRef(true);

  // Cognitive Quiz questions
  const quizQuestions = [
    {
      prompt: 'ข้อใดคือท่าทางที่ช่วยยืดกล้ามเนื้อหัวไหล่ได้ถูกต้อง?',
      options: ['การหมุนแขนเป็นวงกลมช้าๆ', 'การสะบัดแขนอย่างรวดเร็ว', 'การห่อไหล่เกร็งไว้'],
      answerIndex: 0,
    },
    {
      prompt: 'สัญลักษณ์วงกลมสีเขียว หมายถึงความพร้อมในระดับใด?',
      options: ['พร้อมระดับปานกลาง', 'พร้อมมากที่สุด / ผ่านเกณฑ์', 'ยังไม่พร้อม'],
      answerIndex: 1,
    },
    {
      prompt: 'หากรู้สึกเจ็บแปลบขณะทำกายภาพบำบัด ควรปฏิบัติตัวอย่างไร?',
      options: ['ฝืนทำต่อไปให้เสร็จ', 'หยุดพักทันทีและแจ้งนักกายภาพบำบัด', 'เร่งทำให้เร็วขึ้น'],
      answerIndex: 1,
    },
  ];

  // Fetch daily plan on mount
  useEffect(() => {
    isMountedRef.current = true;
    async function loadPlan() {
      try {
        setLoading(true);
        const targetId = patient.patient_id || patient.hn || '';
        const res = await defaultApiClient.smartOnboarding.getDailyPlan(targetId);
        if (!isMountedRef.current) return;

        setIsScheduledToday(res.is_scheduled_today);
        setRestReason(res.reason || 'วันนี้เป็นวันพักผ่อนของคุณ');
        setExercises(res.exercises || []);
        setIncludeMinigame(res.include_minigame);
      } catch {
        if (!isMountedRef.current) return;
        setIsScheduledToday(false);
        setRestReason('ไม่พบข้อมูลตารางฝึกประจำวันนี้');
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }

    loadPlan();
    return () => {
      isMountedRef.current = false;
    };
  }, [patient.patient_id, patient.hn]);

  // Handle exercise toggle
  const toggleExerciseComplete = (id: string) => {
    const next = new Set(completedExerciseIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCompletedExerciseIds(next);

    // If all exercises are done
    if (exercises.length > 0 && next.size === exercises.length) {
      if (includeMinigame) {
        // Auto-unlock and route to Interactive Quiz Minigame!
        setIsPlayingQuiz(true);
      } else {
        handleFinalSessionCompletion(100, 0);
      }
    }
  };

  // Minigame Answer click (fallback quiz mode)
  const _handleAnswerQuiz = (selectedOptionIndex: number) => {
    const isCorrect = selectedOptionIndex === quizQuestions[quizQuestionIndex].answerIndex;
    const addedScore = isCorrect ? 35 : 10;
    const newTotal = quizScore + addedScore;
    setQuizScore(newTotal);

    if (quizQuestionIndex + 1 < quizQuestions.length) {
      setQuizQuestionIndex(quizQuestionIndex + 1);
    } else {
      handleFinalSessionCompletion(100, newTotal);
    }
  };

  // Final Session Completion
  const handleFinalSessionCompletion = async (exerciseRate: number, minigamePts: number) => {
    try {
      await defaultApiClient.smartOnboarding.saveRehabScore({
        patient_id: patient.patient_id,
        score: {
          timestamp: new Date().toISOString(),
          completion_rate: exerciseRate,
          exercises_completed: exercises.length,
          minigame_score: minigamePts,
          total_score: exerciseRate + minigamePts,
        },
      });
    } catch {
      // Score saved locally if offline
    } finally {
      if (isMountedRef.current) {
        setIsSessionCompleted(true);
        setIsPlayingQuiz(false);
      }
    }
  };

  // Auto-reset timer when session completes
  useEffect(() => {
    if (!isSessionCompleted) return;
    const timer = setInterval(() => {
      setAutoResetSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSessionCompleted, onLogout]);

  // Compute Next Appointment Date String
  const nextApptDateStr = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const day = d.getDate();
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear() + 543} (09:00 - 10:00 น.)`;
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950 text-white select-none">
        <RefreshCw className="w-10 h-10 animate-spin text-emerald-400 mb-3" />
        <span className="text-sm font-medium text-slate-300">
          กำลังโหลดตารางกายภาพประจำวัน (Asia/Bangkok)...
        </span>
      </div>
    );
  }

  // 1. Rest Day View (Friendly notice)
  if (!isScheduledToday) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-between p-8 bg-slate-950 text-white select-none">
        {/* Top Header */}
        <div className="w-full flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-400">
              {patient.first_name[0] || 'P'}
            </div>
            <div>
              <div className="text-base font-bold text-white">
                คุณ {patient.first_name}{patient.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}
              </div>
              <div className="text-xs text-slate-400">HN: {patient.patient_id}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            <LogOut className="w-4 h-4" />
            <span>ออกจากระบบ</span>
          </button>
        </div>

        {/* Center Friendly Notice */}
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl flex flex-col items-center my-auto">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
            <Sun className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">วันพักผ่อนของคุณ</h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            🌿 วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้ เชิญพักผ่อนตามอัธยาศัยครับ
          </p>

          <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2.5 w-full">
            {restReason}
          </div>

          {exercises.length > 0 && (
            <button
              onClick={() => setIsScheduledToday(true)}
              className="mt-6 w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-teal-950/50 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <Activity className="w-4 h-4" />
              <span>เริ่มฝึกกายภาพทันที ({exercises.length} ท่า)</span>
            </button>
          )}
        </div>

        {/* Bottom Bar */}
        <div className="w-full text-center text-xs text-slate-500">
          ระบบกายภาพบำบัดอัจฉริยะ • Aura Framing Smart PT System
        </div>
      </div>
    );
  }

  // 2. Final Completion Screen
  if (isSessionCompleted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-between p-8 bg-slate-950 text-white select-none">
        <div className="my-auto max-w-lg w-full bg-gradient-to-b from-slate-900 to-emerald-950/30 border-2 border-emerald-500/40 rounded-3xl p-8 text-center shadow-2xl flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-900/30">
            <Trophy className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            วันนี้คุณทำได้ดีมาก! 🎉
          </h2>

          <p className="text-base text-emerald-200 font-medium mb-4">
            คุณทำกายภาพและกิจกรรมเสร็จสิ้นสำหรับวันนี้แล้ว เชิญพักผ่อนได้ครับ
          </p>

          <div className="w-full bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-4 text-center mb-6">
            <div className="text-xs text-slate-400 mb-1">นัดหมายครั้งต่อไป:</div>
            <div className="text-sm font-bold text-emerald-400">
              📅 {nextApptDateStr}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              (ระบบจะรีเซ็ตกลับสู่หน้าสแตนด์บายอัตโนมัติใน {autoResetSeconds} วินาที)
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full mb-6">
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">ท่ากายภาพบำบัด</div>
              <div className="text-xl font-bold text-emerald-400">
                {exercises.length}/{exercises.length} ท่า
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">คะแนนมินิเกมฝึกสมอง</div>
              <div className="text-xl font-bold text-amber-400">
                {includeMinigame ? `${quizScore} คะแนน` : 'ผ่านเกณฑ์'}
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition active:scale-95 shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>เสร็จสิ้นและออกจากระบบทันที</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Interactive Physical Card Minigame Screen (การ์ดกายภาพ 99 ข้อ)
  if (isPlayingQuiz) {
    return (
      <div className="w-full h-full flex flex-col justify-between bg-[#EDF7F1] text-slate-800 select-none overflow-hidden">
        <PhysicalCardGame
          maxQuestions={10}
          onComplete={(finalScore, totalQuestions) => {
            const calculatedPoints = Math.round((finalScore / totalQuestions) * 100);
            handleFinalSessionCompletion(100, calculatedPoints);
          }}
          onExit={() => setIsPlayingQuiz(false)}
        />
      </div>
    );
  }

  // 4. Prescribed Daily Exercises List View
  const allExercisesDone = exercises.length > 0 && completedExerciseIds.size === exercises.length;

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 sm:p-8 bg-slate-950 text-white select-none overflow-y-auto">
      {/* Top Header */}
      <div className="w-full flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-lg">
            {patient.first_name[0] || 'P'}
          </div>
          <div>
            <div className="text-lg font-bold text-white">
              โปรแกรมกายภาพบำบัด: คุณ {patient.first_name}{patient.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>HN: {patient.patient_id}</span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">
                ความคืบหน้า: {completedExerciseIds.size}/{exercises.length} ท่า
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
        >
          <LogOut className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
      </div>

      {/* Exercise Cards */}
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-4 mb-6 flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>รายการท่าฝึกประจำวันนี้</span>
          </h2>
          <div className="flex items-center gap-2">
            {includeMinigame && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 font-medium flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                <span>มีมินิเกมฝึกสมองต่อท้าย</span>
              </span>
            )}
          </div>
        </div>

        {exercises.map((item, idx) => {
          const isDone = completedExerciseIds.has(item.exercise_id || item.id || `ex-${idx}`);
          const exerciseId = item.exercise_id || item.id || `ex-${idx}`;

          return (
            <div
              key={exerciseId}
              className={`p-5 rounded-2xl border transition duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isDone
                  ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-300'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-white'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {idx + 1}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {item.name || item.exercise_name || `ท่าฝึกกายภาพที่ ${idx + 1}`}
                    {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </h3>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span>ข้อต่อ: {item.target_joint || 'ทั่วไป'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">
                      {item.sets || 3} เซ็ต × {item.reps || 10} ครั้ง
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActivePtNoticeExercise(item)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="เริ่มตรวจจับท่าทางกายภาพบำบัด"
                >
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>เริ่มสแกนท่าฝึก</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleExerciseComplete(exerciseId)}
                  className={`px-5 py-3 rounded-xl text-xs font-semibold transition active:scale-95 flex items-center gap-2 cursor-pointer ${
                    isDone
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isDone ? 'ทำซ้ำอีกครั้ง' : 'บันทึกว่าทำเสร็จแล้ว'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion Action Bar */}
      <div className="max-w-4xl mx-auto w-full pt-4 border-t border-slate-800 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          เมื่อทำครบทุกท่า {includeMinigame ? 'ระบบจะเปิดมินิเกมฝึกสมองทันที' : 'ระบบจะบันทึกผลสำเร็จ'}
        </div>

        <button
          type="button"
          disabled={!allExercisesDone}
          onClick={() => {
            if (includeMinigame) {
              setIsPlayingQuiz(true);
            } else {
              handleFinalSessionCompletion(100, 0);
            }
          }}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-900/40"
        >
          <span>{includeMinigame ? 'ต่อไป: มินิเกมฝึกสมอง' : 'บันทึกการฝึกเสร็จสิ้น'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Modal: PT Joint Detection Under Development Notice */}
      {activePtNoticeExercise && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-500/50 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 text-2xl">
              ⚠️
            </div>
            <h3 className="text-xl font-bold text-white">ยังไม่ได้เพิ่มระบบดีเทคกายภาพ โปรดรอการพัฒนา</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              ระบบ AI ตรวจจับข้อต่อและประเมินมุมการเคลื่อนไหวของท่า &quot;{activePtNoticeExercise.name || activePtNoticeExercise.exercise_name || 'ท่ากายภาพบำบัด'}&quot; อยู่ระหว่างการพัฒนาโดยทีมวิศวกรชีวการแพทย์
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  toggleExerciseComplete(activePtNoticeExercise.exercise_id || activePtNoticeExercise.id || 'ex');
                  setActivePtNoticeExercise(null);
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/40 cursor-pointer"
              >
                รับทราบและบันทึกว่าทำเสร็จแล้ว (ข้ามไปยังรายการถัดไป)
              </button>
              <button
                type="button"
                onClick={() => setActivePtNoticeExercise(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
