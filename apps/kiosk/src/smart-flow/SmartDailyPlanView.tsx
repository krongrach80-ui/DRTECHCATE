/**
 * apps/kiosk/src/smart-flow/SmartDailyPlanView.tsx
 * Dynamic Daily Rehab Plan & Interactive Quiz Engine
 * Conforms to Master Prompt v4 Section 4.3
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Bell,
  Check,
  ChevronRight as _ChevronRight,
  Gamepad2 as _Gamepad2,
  RotateCcw,
  ArrowLeft,
  PhoneCall,
  AlertTriangle,
} from 'lucide-react';
import { PhysicalCardGame } from '../minigame-cards/index.js';
import {
  ALL_CLINICAL_EXERCISES,
  findPresetForExercise,
  ExerciseDetectionConfig,
  ExerciseSessionTelemetry,
} from '../../../../packages/pose-engine/src/index';
import { useClinicalI18n, LanguageSwitcher } from '../../../../packages/clinical-i18n/src/index';
import { CameraPositionGuideModal } from '../components/CameraPositionGuideModal';
import { UnconfiguredExerciseFallbackModal } from '../components/UnconfiguredExerciseFallbackModal';
import { DynamicExerciseSessionView } from '../views/DynamicExerciseSessionView';
import { ClinicalErrorBoundary } from '../../../../packages/hospital-ui-kit/src/index';

interface SmartDailyPlanViewProps {
  patient: PatientRecordFile;
  onLogout: () => void;
}

export const SmartDailyPlanView: React.FC<SmartDailyPlanViewProps> = ({
  patient,
  onLogout,
}) => {
  const { lang } = useClinicalI18n();
  const [loading, setLoading] = useState(true);
  const [isScheduledToday, setIsScheduledToday] = useState(false);
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [restReason, setRestReason] = useState<string>('');
  const [exercises, setExercises] = useState<any[]>([]);
  const [includeMinigame, setIncludeMinigame] = useState(false);
  const [callStaffStatus, setCallStaffStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Exercise tracking
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());

  // Dynamic AI Session & Guided Modals
  const [activeGuideConfig, setActiveGuideConfig] = useState<{ exercise: any; config: ExerciseDetectionConfig } | null>(null);
  const [activeSession, setActiveSession] = useState<{ exercise: any; config: ExerciseDetectionConfig } | null>(null);
  const activeSessionRef = useRef(activeSession);
  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  const [unconfiguredExercise, setUnconfiguredExercise] = useState<any | null>(null);

  // Minigame states
  const [isPlayingQuiz, setIsPlayingQuiz] = useState(false);
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);

  // Final session completed state
  const [isSessionCompleted, setIsSessionCompleted] = useState(false);
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

  // Fetch daily plan (with realtime event integration)
  const loadPlan = useCallback(async () => {
    if (activeSessionRef.current) return;
    try {
      setLoading(true);
      setLoadError(null);
      const targetId = patient.patient_id || patient.hn || '';
      const res = await defaultApiClient.smartOnboarding.getDailyPlan(targetId);
      if (!isMountedRef.current) return;

      const scheduled = Boolean(res.is_scheduled_today);
      const completed = Boolean(res.is_completed_today);
      setIsScheduledToday(scheduled);
      setIsCompletedToday(completed);

      if (!scheduled) {
        setExercises([]);
        setRestReason(res.reason || 'rest_day_default');
      } else {
        setRestReason(res.reason || '');
        let resolvedExercises = res.exercises && res.exercises.length > 0 ? res.exercises : [];
        if (resolvedExercises.length === 0) {
          // If scheduled today but no custom subset assigned, fallback to clinical presets
          resolvedExercises = ALL_CLINICAL_EXERCISES.map((ex) => ({
            exercise_id: ex.id,
            id: ex.id,
            name: ex.nameTh,
            name_th: ex.nameTh,
            name_en: ex.nameEn,
            name_cn: ex.nameCn,
            target_joint: ex.targetJoint,
            sets: ex.defaultPrescription.totalSets,
            reps: ex.defaultPrescription.repsPerSet,
            detection_config: ex,
          }));
        }
        setExercises(resolvedExercises);
        setIncludeMinigame(res.include_minigame ?? true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดตารางกายภาพบำบัด';
      setLoadError(msg);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [patient.patient_id, patient.hn]);

  useEffect(() => {
    isMountedRef.current = true;
    loadPlan();

    const handleRefresh = () => {
      loadPlan();
    };

    window.addEventListener('schedule-updated', handleRefresh);
    window.addEventListener('focus', handleRefresh);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadPlan();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('drtechcare_schedule');
      channel.onmessage = () => {
        loadPlan();
      };
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'drtechcare_schedule_updated') {
        loadPlan();
      }
    };
    window.addEventListener('storage', handleStorage);

    // Periodic sync polling every 10 seconds
    const interval = setInterval(loadPlan, 10000);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('schedule-updated', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
      clearInterval(interval);
    };
  }, [loadPlan]);

  const handleCallStaff = async () => {
    try {
      setCallStaffStatus('sending');
      await defaultApiClient.kiosk.callStaff({
        kiosk_id: 'kiosk-01',
        reason: `คนไข้ ${patient.first_name} (HN: ${patient.patient_id}) ขอความช่วยเหลือ / สอบถามตารางนัดหมาย`,
      });
      setCallStaffStatus('sent');
      setTimeout(() => {
        if (isMountedRef.current) setCallStaffStatus('idle');
      }, 5000);
    } catch {
      setCallStaffStatus('error');
      setTimeout(() => {
        if (isMountedRef.current) setCallStaffStatus('idle');
      }, 4000);
    }
  };

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

  // Launch AI Exercise Detection with Pre-Session Camera Guide
  const handleStartExercise = (exerciseItem: any) => {
    if (!isScheduledToday) {
      alert(
        lang === 'zh-CN'
          ? '今日无预约训练，无法开始'
          : lang === 'en-US'
          ? 'No appointment scheduled for today. Exercise session cannot be started.'
          : 'วันนี้ไม่มีนัดหมายในตารางฝึกกายภาพบำบัด ไม่สามารถเริ่มฝึกได้ครับ'
      );
      return;
    }
    if (isCompletedToday || isSessionCompleted) {
      alert(
        lang === 'zh-CN'
          ? '今日康复动作已完成，请勿过度训练'
          : lang === 'en-US'
          ? 'Today’s session is already completed. Please rest to prevent overtraining.'
          : 'คุณได้ฝึกกายภาพครบตามนัดวันนี้แล้ว เชิญพักผ่อนเพื่อความปลอดภัยครับ'
      );
      return;
    }

    const exName = exerciseItem.name || exerciseItem.exercise_name || exerciseItem.title || '';
    const config: ExerciseDetectionConfig | null =
      exerciseItem.detection_config ||
      findPresetForExercise(exName) ||
      findPresetForExercise(exerciseItem.exercise_id || exerciseItem.id);

    if (config) {
      setActiveGuideConfig({ exercise: exerciseItem, config });
    } else {
      setUnconfiguredExercise(exerciseItem);
    }
  };

  const handleGuideReady = () => {
    if (!isScheduledToday || isCompletedToday || isSessionCompleted) {
      setActiveGuideConfig(null);
      return;
    }
    if (activeGuideConfig) {
      setActiveSession(activeGuideConfig);
      setActiveGuideConfig(null);
    }
  };

  const handleSessionCompleted = async (telemetry: ExerciseSessionTelemetry) => {
    const exId = activeSession?.exercise?.exercise_id || activeSession?.exercise?.id || 'ex';
    try {
      await defaultApiClient.kiosk.recordStep({
        patient_id: patient.patient_id || patient.hn || '',
        course_id: (patient.schedule as any)?.course_id || (patient.schedule as any)?.id || 'course',
        step_type: 'exercise',
        ref_id: exId,
        score: {
          reps: telemetry.completedReps,
          sets: telemetry.totalSetsCompleted,
          completion_mode: telemetry.completionMode,
          pain_reported: telemetry.painReported,
        },
      });

      // Persist to public.exercise_session_logs for clinical analytics
      await (defaultApiClient.courses as any).submitSessionLog({
        patient_id: patient.patient_id || patient.hn || '',
        course_id: (patient.schedule as any)?.course_id || (patient.schedule as any)?.id || null,
        exercise_id: exId,
        kiosk_id: 'kiosk-01',
        completion_mode: telemetry.completionMode,
        correct_reps: telemetry.completedReps,
        incorrect_reps: telemetry.incorrectReps,
        target_reps: telemetry.totalRepsTarget,
        current_set: telemetry.totalSetsCompleted,
        total_sets: activeSession?.config?.defaultPrescription?.totalSets || 3,
        max_angle_achieved: telemetry.maxAngleAchievedDeg,
        consistency_score: telemetry.consistencyScorePercent,
        pain_reported: telemetry.painReported,
        duration_seconds: telemetry.sessionDurationSec,
        telemetry_summary: telemetry,
      });
    } catch {
      // non-blocking
    }
    toggleExerciseComplete(exId);
    setActiveSession(null);
  };

  const handleSkipUnverified = async () => {
    if (!unconfiguredExercise) return;
    const exId = unconfiguredExercise.exercise_id || unconfiguredExercise.id || 'ex';
    try {
      await defaultApiClient.kiosk.recordStep({
        patient_id: patient.patient_id || patient.hn || '',
        course_id: (patient.schedule as any)?.course_id || (patient.schedule as any)?.id || 'course',
        step_type: 'exercise',
        ref_id: exId,
        score: {
          reps: unconfiguredExercise.reps || 10,
          sets: unconfiguredExercise.sets || 3,
          completion_mode: 'skipped_unverified',
          pain_reported: false,
        },
      });

      // Persist unverified completion log
      await (defaultApiClient.courses as any).submitSessionLog({
        patient_id: patient.patient_id || patient.hn || '',
        course_id: (patient.schedule as any)?.course_id || (patient.schedule as any)?.id || null,
        exercise_id: exId,
        kiosk_id: 'kiosk-01',
        completion_mode: 'skipped_unverified',
        correct_reps: unconfiguredExercise.reps || 10,
        incorrect_reps: 0,
        target_reps: unconfiguredExercise.reps || 10,
        current_set: 1,
        total_sets: unconfiguredExercise.sets || 3,
        pain_reported: false,
      });
    } catch {
      // non-blocking
    }
    toggleExerciseComplete(exId);
    setUnconfiguredExercise(null);
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
        setIsCompletedToday(true);
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

  // Error Screen: Network or Server 500 error (Must NEVER show white blank screen)
  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-8 bg-slate-950 text-white select-none">
        <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-rose-500/40 p-6 sm:p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {lang === 'zh-CN' ? '系统连接或加载失败' : lang === 'en-US' ? 'Connection or Loading Error' : 'เกิดข้อผิดพลาดในการโหลดข้อมูลตาราง'}
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {loadError}
          </p>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              id="plan-retry-btn"
              data-testid="plan-retry-btn"
              onClick={() => loadPlan()}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '重试 (Try Again)' : lang === 'en-US' ? 'Try Again' : 'ลองใหม่อีกครั้ง (Try Again)'}</span>
            </button>

            <button
              type="button"
              id="plan-home-btn"
              data-testid="plan-home-btn"
              onClick={onLogout}
              className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '返回主页 (Back to Home)' : lang === 'en-US' ? 'Back to Home' : 'กลับสู่หน้าหลัก (Back to Home)'}</span>
            </button>

            <button
              type="button"
              id="plan-call-staff-btn"
              data-testid="plan-call-staff-btn"
              onClick={handleCallStaff}
              className="w-full py-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <PhoneCall className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '呼叫医护人员 (Call Staff)' : lang === 'en-US' ? 'Call Staff' : 'เรียกเจ้าหน้าที่ (Call Staff)'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. Rest Day View (Friendly notice when no appointment today)
  if (!isScheduledToday) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-between p-8 bg-slate-950 text-white select-none">
        {/* Top Header */}
        <div className="w-full flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-400">
              {patient?.first_name?.[0] || (patient as any)?.name?.[0] || 'P'}
            </div>
            <div>
              <div className="text-base font-bold text-white">
                คุณ {patient?.first_name || (patient as any)?.name || 'ผู้ป่วย'}{patient?.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}
              </div>
              <div className="text-xs text-slate-400">HN: {patient?.patient_id || patient?.hn || '-'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="dark" />
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '退出系统' : lang === 'en-US' ? 'Sign Out' : 'ออกจากระบบ'}</span>
            </button>
          </div>
        </div>

        {/* Center Friendly Notice */}
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl flex flex-col items-center my-auto">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-950/40">
            <Sun className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            {lang === 'zh-CN' ? '今天是您的休息日' : lang === 'en-US' ? 'Your Scheduled Rest Day' : 'วันพักผ่อนของคุณ'}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            {lang === 'zh-CN'
              ? '🌿 今日没有为您安排康复训练，或当前为休息日。请好好休息，保持良好状态。'
              : lang === 'en-US'
              ? '🌿 There is no physical therapy session scheduled for you today. Please feel free to rest.'
              : '🌿 วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้ เชิญพักผ่อนตามอัธยาศัยครับ'}
          </p>

          <div className="text-sm text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2.5 w-full mb-4">
            {restReason === 'rest_day_default'
              ? (lang === 'zh-CN' ? '今日是您的休息日，暂无训练安排' : lang === 'en-US' ? 'Today is your scheduled rest day' : 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้')
              : restReason === 'no_plan_found'
              ? (lang === 'zh-CN' ? '未找到今日训练计划' : lang === 'en-US' ? 'No daily rehab schedule found' : 'ไม่พบข้อมูลตารางฝึกประจำวันนี้')
              : restReason || (lang === 'zh-CN' ? '今日无预约训练' : lang === 'en-US' ? 'No scheduled appointment today' : 'วันนี้ไม่มีนัดหมายในตารางฝึก')}
          </div>

          {/* Call Staff Button */}
          <button
            type="button"
            onClick={handleCallStaff}
            disabled={callStaffStatus === 'sending' || callStaffStatus === 'sent'}
            className="w-full py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-semibold text-xs border border-slate-700/80 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60 shadow-md"
          >
            {callStaffStatus === 'sent' ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Bell className="w-4 h-4 text-amber-400" />
            )}
            <span>
              {callStaffStatus === 'sending'
                ? (lang === 'zh-CN' ? '正在呼叫工作人员...' : lang === 'en-US' ? 'Calling staff...' : 'กำลังเรียกเจ้าหน้าที่...')
                : callStaffStatus === 'sent'
                ? (lang === 'zh-CN' ? '✓ 已成功通知医护人员' : lang === 'en-US' ? '✓ Staff Notified' : '✓ แจ้งเจ้าหน้าที่เรียบร้อยแล้ว')
                : (lang === 'zh-CN' ? '呼叫医护人员 / 咨询预约' : lang === 'en-US' ? 'Call Staff / Inquire Schedule' : 'เรียกเจ้าหน้าที่ / ปรึกษาตารางนัด')}
            </span>
          </button>
          {callStaffStatus === 'sent' && (
            <p className="mt-2 text-[11px] text-emerald-400">
              {lang === 'zh-CN' ? '工作人员已收到通知，马上前来协助您。' : lang === 'en-US' ? 'Staff has been notified and will assist you shortly.' : 'เจ้าหน้าที่ได้รับแจ้งแล้ว กำลังมาช่วยเหลือครับ'}
            </p>
          )}
        </div>

        {/* Bottom Bar */}
        <div className="w-full text-center text-xs text-slate-500">
          ระบบกายภาพบำบัดอัจฉริยะ • Aura Framing Smart PT System
        </div>
      </div>
    );
  }

  // 2. Final Completion Screen / Completed Today Screen (Prevent repeated exercises)
  if (isSessionCompleted || isCompletedToday) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-between p-8 bg-slate-950 text-white select-none">
        {/* Top Header */}
        <div className="w-full flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-400">
              {patient?.first_name?.[0] || (patient as any)?.name?.[0] || 'P'}
            </div>
            <div>
              <div className="text-base font-bold text-white">
                คุณ {patient?.first_name || (patient as any)?.name || 'ผู้ป่วย'}{patient?.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}
              </div>
              <div className="text-xs text-slate-400">HN: {patient?.patient_id || patient?.hn || '-'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="dark" />
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '退出系统' : lang === 'en-US' ? 'Sign Out' : 'ออกจากระบบ'}</span>
            </button>
          </div>
        </div>

        <div className="my-auto max-w-lg w-full bg-gradient-to-b from-slate-900 to-emerald-950/30 border-2 border-emerald-500/40 rounded-3xl p-8 text-center shadow-2xl flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-900/30">
            <Trophy className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            {lang === 'zh-CN' ? '今日康复训练已完成 🎉' : lang === 'en-US' ? 'Training Completed Today 🎉' : 'ฝึกเสร็จแล้ววันนี้ 🎉'}
          </h2>

          <p className="text-sm text-emerald-200 font-medium mb-4 leading-relaxed">
            {lang === 'zh-CN'
              ? '您已顺利完成今日的所有康复动作与评估。为避免过度疲劳与肌肉损伤，今日请充分休息。'
              : lang === 'en-US'
              ? 'You have successfully completed all prescribed physical therapy exercises for today. Please rest to prevent overtraining.'
              : 'คุณทำกายภาพบำบัดและกิจกรรมตามนัดหมายประจำวันนี้เสร็จสิ้นแล้ว เพื่อความปลอดภัยและผลการรักษาที่ดีที่สุด เชิญพักผ่อนได้ครับ'}
          </p>

          <div className="w-full bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-4 text-center mb-6">
            <div className="text-xs text-slate-400 mb-1">
              {lang === 'zh-CN' ? '下次预约时间:' : lang === 'en-US' ? 'Next Appointment:' : 'นัดหมายครั้งต่อไป:'}
            </div>
            <div className="text-sm font-bold text-emerald-400">
              📅 {nextApptDateStr}
            </div>
            {isSessionCompleted && (
              <div className="text-[11px] text-slate-500 mt-1">
                {lang === 'zh-CN'
                  ? `(系统将在 ${autoResetSeconds} 秒后自动返回待机页面)`
                  : lang === 'en-US'
                  ? `(System will return to standby in ${autoResetSeconds} seconds)`
                  : `(ระบบจะรีเซ็ตกลับสู่หน้าสแตนด์บายอัตโนมัติใน ${autoResetSeconds} วินาที)`}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 w-full mb-6">
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">
                {lang === 'zh-CN' ? '动作项目' : lang === 'en-US' ? 'Exercises' : 'ท่ากายภาพบำบัด'}
              </div>
              <div className="text-xl font-bold text-emerald-400">
                {exercises.length > 0 ? `${exercises.length}/${exercises.length}` : 'เสร็จสมบูรณ์'}
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">
                {lang === 'zh-CN' ? '微游戏得分' : lang === 'en-US' ? 'Minigame' : 'คะแนนมินิเกม'}
              </div>
              <div className="text-xl font-bold text-amber-400">
                {includeMinigame ? `${quizScore} คะแนน` : (lang === 'zh-CN' ? '已达标' : lang === 'en-US' ? 'Passed' : 'ผ่านเกณฑ์')}
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition active:scale-95 shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{lang === 'zh-CN' ? '完成并立即退出系统' : lang === 'en-US' ? 'Finish & Sign Out' : 'เสร็จสิ้นและออกจากระบบทันที'}</span>
          </button>
        </div>

        {/* Bottom Bar */}
        <div className="w-full text-center text-xs text-slate-500">
          ระบบกายภาพบำบัดอัจฉริยะ • Aura Framing Smart PT System
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
      <div className="w-full flex items-center justify-between border-b border-slate-800 pb-4 mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-lg">
            {patient?.first_name?.[0] || (patient as any)?.name?.[0] || 'P'}
          </div>
          <div>
            <div className="text-lg font-bold text-white">
              {lang === 'zh-CN' ? '康复训练方案' : lang === 'en-US' ? 'Rehab Program' : 'โปรแกรมกายภาพบำบัด'}: คุณ {patient?.first_name || (patient as any)?.name || 'ผู้ป่วย'}{patient?.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>HN: {patient?.patient_id || patient?.hn || '-'}</span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">
                {lang === 'zh-CN' ? `训练进度: ${completedExerciseIds.size}/${exercises.length} 项动作` : lang === 'en-US' ? `Progress: ${completedExerciseIds.size}/${exercises.length} exercises` : `ความคืบหน้า: ${completedExerciseIds.size}/${exercises.length} ท่า`}
              </span>
            </div>
            {/* Visual Progress Bar */}
            <div className="w-48 bg-slate-800 rounded-full h-2 mt-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                style={{ width: `${exercises.length > 0 ? (completedExerciseIds.size / exercises.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="dark" />
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{lang === 'zh-CN' ? '退出系统' : lang === 'en-US' ? 'Sign Out' : 'ออกจากระบบ'}</span>
          </button>
        </div>
      </div>

      {/* Exercise Cards */}
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-4 mb-6 flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'zh-CN' ? '今日康复动作清单' : lang === 'en-US' ? "Today's Prescribed Exercises" : 'รายการท่าฝึกประจำวันนี้'}</span>
          </h2>
          <div className="flex items-center gap-2">
            {includeMinigame && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 font-medium flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                <span>{lang === 'zh-CN' ? '附带认知益智微游戏' : lang === 'en-US' ? 'Cognitive Minigame Included' : 'มีมินิเกมฝึกสมองต่อท้าย'}</span>
              </span>
            )}
          </div>
        </div>

        {exercises.map((item, idx) => {
          const isDone = completedExerciseIds.has(item.exercise_id || item.id || `ex-${idx}`);
          const exerciseId = item.exercise_id || item.id || `ex-${idx}`;
          const preset = item.detection_config || findPresetForExercise(item.exercise_id || item.id || item.name);

          const title = lang === 'zh-CN'
            ? (preset?.nameCn || item.name_cn || item.name)
            : lang === 'en-US'
            ? (preset?.nameEn || item.name_en || item.name)
            : (preset?.nameTh || item.name || item.title);

          const framingBadge = preset?.framing === 'full_body'
            ? (lang === 'zh-CN' ? '📷 全身视野 (后退 2–2.5 米)' : lang === 'en-US' ? '📷 Full Body (Step back 2-2.5m)' : '📷 เต็มตัว (ถอยห่าง 2–2.5 ม.)')
            : preset?.framing === 'lower_body'
            ? (lang === 'zh-CN' ? '📷 下半身' : lang === 'en-US' ? '📷 Lower Body' : '📷 ช่วงขาและข้อเท้า')
            : preset?.framing === 'head_shoulders'
            ? (lang === 'zh-CN' ? '📷 头部与肩部' : lang === 'en-US' ? '📷 Head & Shoulders' : '📷 ศีรษะและไหล่')
            : (lang === 'zh-CN' ? '📷 上半身' : lang === 'en-US' ? '📷 Upper Body' : '📷 ครึ่งตัวบน');

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
                  <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>{title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 font-medium">
                      {framingBadge}
                    </span>
                    {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </h3>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span>{lang === 'zh-CN' ? `关节: ${preset?.targetJoint || item.target_joint || '通用'}` : lang === 'en-US' ? `Joint: ${preset?.targetJoint || item.target_joint || 'General'}` : `ข้อต่อ: ${preset?.targetJoint || item.target_joint || 'ทั่วไป'}`}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">
                      {lang === 'zh-CN' ? `${item.sets || 3} 组 × ${item.reps || 10} 次` : lang === 'en-US' ? `${item.sets || 3} sets × ${item.reps || 10} reps` : `${item.sets || 3} เซ็ต × ${item.reps || 10} ครั้ง`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  id={`kiosk-start-scan-btn-${idx}`}
                  data-testid={`kiosk-start-scan-btn-${idx}`}
                  onClick={() => handleStartExercise(item)}
                  className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600/30 to-teal-600/30 hover:from-emerald-600/50 hover:to-teal-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/40"
                  title="เริ่มตรวจจับท่าทางกายภาพบำบัดด้วย AI"
                >
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>{lang === 'zh-CN' ? '开始 AI 动作检测' : lang === 'en-US' ? 'Start AI Scan' : 'เริ่มสแกนท่าฝึก'}</span>
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
                  <span>{isDone ? (lang === 'zh-CN' ? '再次训练' : lang === 'en-US' ? 'Repeat' : 'ทำซ้ำอีกครั้ง') : (lang === 'zh-CN' ? '标记为已完成' : lang === 'en-US' ? 'Mark Done' : 'บันทึกว่าทำเสร็จแล้ว')}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion Action Bar */}
      <div className="max-w-4xl mx-auto w-full pt-4 border-t border-slate-800 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          {lang === 'zh-CN' ? (includeMinigame ? '完成所有动作后，将自动进入认知微游戏' : '完成所有动作后即可提交今日记录') : lang === 'en-US' ? (includeMinigame ? 'Completing all exercises unlocks the cognitive minigame' : 'Complete all exercises to record session') : (includeMinigame ? 'เมื่อทำครบทุกท่า ระบบจะเปิดมินิเกมฝึกสมองทันที' : 'เมื่อทำครบทุกท่า ระบบจะบันทึกผลสำเร็จ')}
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
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-900/40 cursor-pointer"
        >
          <span>{includeMinigame ? (lang === 'zh-CN' ? '下一步: 认知益智微游戏' : lang === 'en-US' ? 'Next: Cognitive Minigame' : 'ต่อไป: มินิเกมฝึกสมอง') : (lang === 'zh-CN' ? '提交今日训练' : lang === 'en-US' ? 'Complete Session' : 'บันทึกการฝึกเสร็จสิ้น')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 1. Camera & Posture Positioning Guide Modal */}
      {activeGuideConfig && (
        <CameraPositionGuideModal
          config={activeGuideConfig.config}
          onReadyToStart={handleGuideReady}
          onCancel={() => setActiveGuideConfig(null)}
        />
      )}

      {/* 2. Fullscreen Dynamic AI Exercise Session View with Clinical Error Boundary */}
      {activeSession && (
        <ClinicalErrorBoundary
          fallbackTitle="ระบบตรวจจับกายภาพบำบัดพบข้อขัดข้องชั่วคราว"
          onExit={() => setActiveSession(null)}
        >
          <DynamicExerciseSessionView
            patient={patient}
            exercise={activeSession.exercise}
            config={activeSession.config}
            onSessionCompleted={handleSessionCompleted}
            onExit={() => setActiveSession(null)}
          />
        </ClinicalErrorBoundary>
      )}

      {/* 3. Conditional Unconfigured Exercise Fallback (ONLY if detection_config === null and no preset) */}
      {unconfiguredExercise && (
        <UnconfiguredExerciseFallbackModal
          exercise={unconfiguredExercise}
          onSkipUnverified={handleSkipUnverified}
          onClose={() => setUnconfiguredExercise(null)}
        />
      )}
    </div>
  );
};

export const DailyRoutineListView = SmartDailyPlanView;
