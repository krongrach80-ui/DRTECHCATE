/**
 * apps/kiosk/src/smart-flow/SmartDailyPlanView.tsx
 * Dynamic Daily Rehab Plan & Interactive Quiz Engine
 * Conforms to Master Prompt v4 Section 4.3 & Clinical Touchless Kinematic Starter
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import {
  CheckCircle2,
  Activity,
  ArrowRight,
  LogOut,
  Sun,
  Brain,
  Bell,
  Check,
  ChevronRight as _ChevronRight,
  Gamepad2 as _Gamepad2,
  PhoneCall,
  AlertTriangle,
  Sparkles,
  KeyRound,
  ShieldAlert,
  Video,
  Clock,
  RotateCcw,
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
import { useTouchlessGestureStarter } from '../hooks/useTouchlessGestureStarter';
import {
  StaffExerciseOverrideModal,
  OverrideReason,
} from '../components/StaffExerciseOverrideModal';

// Elderly-Friendly Kiosk Ergonomic Typography (~1.4-1.6x Scale) & High-Contrast Side Highlight
const KIOSK_GESTURE_DESC_CLASS = 'text-base sm:text-2xl text-slate-800 font-medium leading-relaxed';
const KIOSK_GESTURE_STATUS_CLASS = 'text-sm sm:text-xl text-slate-700 font-semibold';
const KIOSK_GESTURE_SIDE_HIGHLIGHT = 'font-black text-blue-700';

const renderHighlightedStatus = (msg: string) => {
  if (!msg) return null;
  const regex = /(ทั้งสองข้าง|2 มือ|มือซ้าย|มือขวา|ซ้าย|ขวา|RIGHT|LEFT|BOTH|右手|左手|双手)/i;
  const parts = msg.split(regex);
  return parts.map((part, idx) => {
    if (regex.test(part)) {
      return (
        <strong key={idx} className={KIOSK_GESTURE_SIDE_HIGHLIGHT}>
          {part}
        </strong>
      );
    }
    return part;
  });
};

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
  const [, setRestReason] = useState<string>('');
  const [exercises, setExercises] = useState<any[]>([]);
  const [includeMinigame, setIncludeMinigame] = useState(false);
  const [callStaffStatus, setCallStaffStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dailyPlanResponse, setDailyPlanResponse] = useState<any>(null);
  const [painAlertActive, setPainAlertActive] = useState<boolean>(false);
  const [isStaffOverrideModalOpen, setIsStaffOverrideModalOpen] = useState<boolean>(false);

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
  const isPlayingQuizRef = useRef(isPlayingQuiz);
  useEffect(() => {
    isPlayingQuizRef.current = isPlayingQuiz;
  }, [isPlayingQuiz]);
  const isInitialLoadRef = useRef(true);
  const [_quizQuestionIndex, _setQuizQuestionIndex] = useState(0);
  const [, _setQuizScore] = useState(0);

  // Final session completed state
  const [isSessionCompleted, setIsSessionCompleted] = useState(false);
  const [autoResetSeconds, setAutoResetSeconds] = useState(15);

  const isMountedRef = useRef(true);

  // Next target uncompleted exercise for touchless starter
  const nextUncompletedExercise = React.useMemo(() => {
    if (!isScheduledToday || isCompletedToday || isSessionCompleted) return null;
    return exercises.find((item) => {
      const exId = item.exercise_id || item.id || '';
      return !completedExerciseIds.has(exId);
    }) || null;
  }, [exercises, completedExerciseIds, isScheduledToday, isCompletedToday, isSessionCompleted]);

  // Allowed hand side from patient's prescription schedule
  const allowedHandSide: 'both' | 'left' | 'right' =
    dailyPlanResponse?.allowed_start_hand ||
    dailyPlanResponse?.schedule?.allowed_start_hand ||
    (patient?.schedule as any)?.allowed_start_hand ||
    (patient as any)?.allowed_start_hand ||
    'both';

  // Cognitive Quiz questions
  const _quizQuestions = [
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
  // Primitive copies so loadPlan depends on values, not on a new patient object per render
  const patientAltId = (patient as any).id as string | undefined;
  const patientTargetJoint = (patient as any).target_joint as string | undefined;

  const loadPlan = useCallback(async () => {
    if (activeSessionRef.current || isPlayingQuizRef.current) return;
    try {
      if (isInitialLoadRef.current) {
        setLoading(true);
      }
      setLoadError(null);
      const targetId = patient.patient_id || patient.hn || patientAltId || '';
      const res = await defaultApiClient.smartOnboarding.getDailyPlan(targetId);
      if (!isMountedRef.current) return;

      if (!res || (res as any).ok === false) {
        throw new Error((res as any)?.message || (res as any)?.error || 'ไม่สามารถโหลดตารางกายภาพบำบัดได้');
      }

      setDailyPlanResponse(res);
      const scheduled = Boolean(res?.is_scheduled_today);
      const completed = Boolean(res?.is_completed_today);
      const exercisesList = Array.isArray(res?.exercises) ? res.exercises : [];

      // Hydrate completed exercise IDs from server response
      if (Array.isArray((res as any)?.completed_exercise_ids) && (res as any).completed_exercise_ids.length > 0) {
        setCompletedExerciseIds((prev) => {
          const merged = new Set(prev);
          (res as any).completed_exercise_ids.forEach((id: string) => merged.add(id));
          return merged;
        });
      }

      // Authoritative Server-Driven: strictly rely on server response without synthetic fallback or snapshot resurrection
      const isEffectivelyScheduled = scheduled && exercisesList.length > 0;
      setIsScheduledToday(isEffectivelyScheduled);
      setIsCompletedToday(completed);

      if (!isEffectivelyScheduled) {
        setExercises([]);
        setRestReason(res?.reason || 'no_plan_scheduled');
      } else {
        setRestReason(res?.reason || '');
        const resolvedExercises = exercisesList.map((ex: any) => ({
          exercise_id: ex.exercise_id || ex.id,
          id: ex.exercise_id || ex.id,
          name: ex.name || ex.name_th || 'ท่ากายภาพบำบัด',
          name_th: ex.name_th || ex.name || 'ท่ากายภาพบำบัด',
          name_en: ex.name_en || ex.name || 'Physical Therapy Exercise',
          name_cn: ex.name_cn || ex.name || '康复动作',
          target_joint: ex.target_joint || patientTargetJoint || 'general',
          sets: Number(ex.sets) || 3,
          reps: Number(ex.reps) || 10,
          side: ex.side || 'both',
          hold_duration_sec: ex.hold_duration_sec,
          target_max_deg: ex.target_max_deg,
          target_min_deg: ex.target_min_deg,
          detection_config: ex.detection_config || ALL_CLINICAL_EXERCISES.find((c) => c.id === (ex.exercise_id || ex.id)),
        }));

        setExercises(resolvedExercises);
        setIncludeMinigame(res?.include_minigame ?? true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดตารางกายภาพบำบัด';
      setLoadError(msg);
    } finally {
      if (isMountedRef.current) {
        isInitialLoadRef.current = false;
        setLoading(false);
      }
    }
  }, [patient.patient_id, patient.hn, patientAltId, patientTargetJoint]);

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

    // Periodic sync polling (60 seconds minimum when active, paused when tab is hidden)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden')) return;
      loadPlan();
    }, 60000);

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
        reason: `คนไข้ ${patient.first_name} (HN: ${patient.hn || patient.patient_id || '-'}) ขอความช่วยเหลือ / สอบถามตารางนัดหมาย`,
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

  const handlePainEmergency = async () => {
    try {
      setPainAlertActive(true);
      await defaultApiClient.kiosk.callStaff({
        kiosk_id: 'kiosk-01',
        reason: `[🚨 รู้สึกเจ็บ] ผู้ป่วย ${patient.first_name || ''} (HN: ${patient.hn || patient.patient_id || '-'}) กดหยุดฉุกเฉินเนื่องจากรู้สึกเจ็บปวด`,
      });
    } catch {
      // non-blocking
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
  const handleStartExercise = (
    exerciseItem: any,
    mode: 'gesture' | 'staff_override' | 'manual' = 'manual',
    meta?: Record<string, unknown>
  ) => {
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
      // Merge custom angle overrides, side, and sets/reps from prescription builder
      const mergedConfig: ExerciseDetectionConfig = {
        ...config,
        side: (exerciseItem.side as any) || (exerciseItem.target_side as any) || (exerciseItem.prescribed_side as any) || config.side,
        angleMechanics: config.angleMechanics
          ? {
              ...config.angleMechanics,
              ...(typeof exerciseItem.start_angle_deg === 'number' ? { startAngleDeg: exerciseItem.start_angle_deg } : {}),
              ...(typeof exerciseItem.target_min_deg === 'number' ? { targetMinDeg: exerciseItem.target_min_deg } : {}),
              ...(typeof exerciseItem.target_max_deg === 'number' ? { targetMaxDeg: exerciseItem.target_max_deg } : {}),
              ...(typeof exerciseItem.hold_duration_sec === 'number' ? { holdDurationSec: exerciseItem.hold_duration_sec } : {}),
            }
          : undefined,
        defaultPrescription: {
          ...config.defaultPrescription,
          totalSets: Number(exerciseItem.sets) || config.defaultPrescription?.totalSets || 3,
          repsPerSet: Number(exerciseItem.reps) || config.defaultPrescription?.repsPerSet || 10,
        },
      };

      // Non-blocking audit log of gesture / staff initiation
      if (meta) {
        try {
          void (defaultApiClient.courses as any)?.submitSessionLog?.({
            patient_id: patient.patient_id || patient.hn || '',
            course_id: (patient.schedule as any)?.course_id || (patient.schedule as any)?.id || null,
            exercise_id: exerciseItem.exercise_id || exerciseItem.id || 'ex',
            kiosk_id: 'kiosk-01',
            completion_mode: mode === 'gesture' ? 'patient_touchless_gesture' : 'staff_override',
            telemetry_summary: meta,
          });
        } catch {
          // non-blocking
        }
      }

      // If launched via touchless hand gesture or staff override, start session directly without blocking modals!
      if (mode === 'gesture' || mode === 'staff_override') {
        setActiveGuideConfig(null);
        setActiveSession({ exercise: exerciseItem, config: mergedConfig });
      } else {
        setActiveGuideConfig({ exercise: exerciseItem, config: mergedConfig });
      }
    } else {
      setUnconfiguredExercise(exerciseItem);
    }
  };

  // Authoritative Staff Override Confirmation: Clears staff credentials & launches session directly
  const handleConfirmStaffOverride = async (
    selectedExercise: any,
    metadata: {
      staff_user: any;
      override_reason: OverrideReason;
      reason_detail?: string;
    }
  ) => {
    try {
      await (defaultApiClient.courses as any)?.staffOverrideStart?.({
        patient_id: patient.patient_id || patient.hn || '',
        exercise_id: selectedExercise.exercise_id || selectedExercise.id || 'ex',
        override_reason: metadata.override_reason,
        reason_detail: metadata.reason_detail,
        staff_user: metadata.staff_user,
        kiosk_id: 'kiosk-01',
      });
    } catch (err: any) {
      if (
        err?.status === 409 ||
        err?.statusCode === 409 ||
        err?.code === 'ALREADY_COMPLETED_TODAY' ||
        (err?.message && String(err.message).includes('วันนี้คุณทำกายภาพไปแล้ว'))
      ) {
        alert(err.message || 'วันนี้ผู้ป่วยทำกายภาพไปแล้ว (ทำได้วันละครั้ง)');
        setIsStaffOverrideModalOpen(false);
        return;
      }
      console.warn('Server staff override notice (handled with resilient fallback):', err);
    }

    // Immediately clear staff credentials from browser storage to prevent kiosk privilege lingering
    try {
      localStorage.removeItem('drtech_user_profile');
      sessionStorage.removeItem('drtech_user_profile');
    } catch {
      // non-blocking
    }

    // Close modal and transition directly to the exercise session in patient mode
    setIsStaffOverrideModalOpen(false);

    handleStartExercise(selectedExercise, 'staff_override', {
      target_hand: targetSide,
      detected_hand: 'override',
      started_by: metadata.staff_user?.full_name || metadata.staff_user?.username || 'เจ้าหน้าที่',
      staff_role: metadata.staff_user?.role || 'pt',
      override_reason: metadata.override_reason,
      reason_detail: metadata.reason_detail,
      timestamp: new Date().toISOString(),
    });
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

  // Auto-reset timer when session completes or already completed today
  useEffect(() => {
    if (!isSessionCompleted && !isCompletedToday) return;
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
  }, [isSessionCompleted, isCompletedToday, onLogout]);

  // Compute Next Appointment Date String
  const nextApptDateStr = React.useMemo(() => {
    const nextDate = dailyPlanResponse?.next_appointment_date;
    const timeSlot = dailyPlanResponse?.time_slot || dailyPlanResponse?.schedule?.time_slot || '09:00 - 10:00 น.';
    if (nextDate) {
      const parts = nextDate.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dateObj = new Date(y, m, d);
        if (!isNaN(dateObj.getTime())) {
          if (lang === 'zh-CN') {
            const weekdaysZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return `${y}年${m + 1}月${d}日 (${weekdaysZh[dateObj.getDay()]}) ${timeSlot}`;
          }
          if (lang === 'en-US') {
            const weekdaysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${weekdaysEn[dateObj.getDay()]}, ${d} ${monthsEn[m]} ${y} (${timeSlot})`;
          }
          const weekdaysTh = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
          const monthsTh = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          return `${weekdaysTh[dateObj.getDay()]}ที่ ${d} ${monthsTh[m]} ${y + 543} (${timeSlot})`;
        }
      }
    }
    return null;
  }, [dailyPlanResponse?.next_appointment_date, dailyPlanResponse?.time_slot, dailyPlanResponse?.schedule?.time_slot, lang]);

  // Clinical Touchless Gesture Starter Hook
  const isGestureStarterEnabled = Boolean(
    isScheduledToday &&
    exercises.length > 0 &&
    !isCompletedToday &&
    !isSessionCompleted &&
    !activeSession &&
    !isPlayingQuiz &&
    Boolean(nextUncompletedExercise)
  );

  const {
    targetSide,
    holdProgress,
    detectedSide,
    secondsLeft,
    isCameraActive,
    statusMessage,
    videoRef,
    handleStaffOverride: _handleStaffOverride,
  } = useTouchlessGestureStarter({
    enabled: isGestureStarterEnabled,
    targetExercise: nextUncompletedExercise,
    allowedSide: allowedHandSide,
    onStartExercise: (ex, mode, meta) => handleStartExercise(ex, mode, meta),
    onCallStaff: handleCallStaff,
    lang: (lang as any) || 'th-TH',
  });

  if (loading) {
    return (
      <div className="w-full min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-8 bg-gradient-to-b from-[#EBF5FA] via-[#F4F9FC] to-[#E6F4F8] text-slate-900 select-none">
        <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-lg font-bold text-slate-800">
          {lang === 'zh-CN' ? '正在载入今日康复方案...' : lang === 'en-US' ? 'Loading daily rehab plan...' : 'กำลังโหลดตารางกายภาพบำบัดประจำวัน...'}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-8 bg-gradient-to-b from-[#EBF5FA] via-[#F4F9FC] to-[#E6F4F8] text-slate-900 select-none">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-3xl p-6 text-center shadow-xl">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">
            {lang === 'zh-CN' ? '无法载入康复数据' : lang === 'en-US' ? 'Unable to load schedule' : 'ไม่สามารถโหลดข้อมูลได้'}
          </h2>
          <p className="text-sm text-slate-600 mb-6">{loadError}</p>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={loadPlan}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:brightness-105 text-white text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '重试 (Retry)' : lang === 'en-US' ? 'Retry' : 'ลองใหม่อีกครั้ง (Retry)'}</span>
            </button>
            <button
              data-testid="plan-call-staff-btn"
              onClick={handleCallStaff}
              className="w-full py-3 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
            >
              <PhoneCall className="w-4 h-4 text-amber-600" />
              <span>{lang === 'zh-CN' ? '呼叫医护人员 (Call Staff)' : lang === 'en-US' ? 'Call Staff' : 'เรียกเจ้าหน้าที่ (Call Staff)'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. Neutral Empty State / No Scheduled Program View (3 Languages TH/EN/CN)
  if (!isScheduledToday || exercises.length === 0) {
    return (
      <div className="w-full min-h-[calc(100vh-64px)] flex flex-col justify-between bg-gradient-to-b from-[#EBF5FA] via-[#F4F9FC] to-[#E6F4F8] text-slate-900 select-none">
        {/* Patient Top Bar (Clean White Card Bar & Language Switcher) */}
        <div className="w-full bg-white border-b border-blue-100 px-6 py-3.5 shadow-xs flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-extrabold text-lg flex items-center justify-center shadow-xs">
              {patient?.first_name?.[0] || (patient as any)?.name?.[0] || 'P'}
            </div>
            <div>
              <div className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                คุณ {patient?.first_name || (patient as any)?.name || 'ผู้ป่วย'}{patient?.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200/80">
                  HN: {patient?.hn || patient?.patient_id || '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 font-bold text-xs sm:text-sm transition cursor-pointer active:scale-95 shadow-xs"
              title="ออกจากระบบ หรือ สลับผู้ป่วย"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '退出 / 切换患者' : lang === 'en-US' ? 'Sign Out / Switch' : '🚪 ออกจากระบบ / สลับผู้ป่วย'}</span>
            </button>
          </div>
        </div>

        {/* Center Friendly Notice Bento Card */}
        <div className="max-w-2xl w-full bg-white rounded-[32px] border border-blue-100 shadow-xl p-8 sm:p-10 text-center space-y-6 my-auto mx-auto animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 rounded-3xl bg-blue-50 border-2 border-blue-200 text-blue-600 mx-auto flex items-center justify-center shadow-sm">
            <Sun className="w-10 h-10" />
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {lang === 'zh-CN'
                ? '今日暂无康复训练方案'
                : lang === 'en-US'
                ? 'No Exercise Program Scheduled Today'
                : 'ยังไม่มีโปรแกรมฝึกในวันนี้'}
            </h2>
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed font-medium">
              {lang === 'zh-CN'
                ? '今日暂无康复训练方案，请联系物理治疗师。'
                : lang === 'en-US'
                ? 'No exercise program scheduled for today. Please contact your physical therapist.'
                : 'ยังไม่มีโปรแกรมฝึกในวันนี้ กรุณาติดต่อนักกายภาพบำบัด'}
            </p>
          </div>

          {/* Next Appointment Highlight Box (Only if there is an actual next appointment date) */}
          {nextApptDateStr && (
            <div className="w-full bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-2 border-emerald-200 rounded-2xl p-5 text-center shadow-xs">
              <div className="text-sm text-teal-800 font-bold flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>
                  {lang === 'zh-CN' ? '📅 下次康复训练预约时间' : lang === 'en-US' ? '📅 Your Next Scheduled Session' : '📅 วันนัดฝึกกายภาพบำบัดครั้งถัดไปของคุณ'}
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-blue-950 mt-1.5">
                {nextApptDateStr}
              </div>
            </div>
          )}

          {/* Pain Alert Banner Notification if user clicked pain button */}
          {painAlertActive && (
            <div className="w-full p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 flex items-center justify-between gap-4 shadow-sm animate-bounce">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
                <div className="text-sm font-bold text-left">
                  {lang === 'zh-CN'
                    ? '🚨 已接收到疼痛反馈！工作人员与物理治疗师已收到提醒，请坐下休息。'
                    : lang === 'en-US'
                    ? '🚨 Pain alert triggered! Clinical staff notified. Please sit down and rest comfortably.'
                    : '🚨 แจ้งอาการเจ็บเรียบร้อยแล้ว! เจ้าหน้าที่และนักกายภาพบำบัดกำลังมาดูแล กรุณานั่งพักผ่อนครับ'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPainAlertActive(false)}
                className="text-xs px-3 py-1.5 rounded-lg bg-rose-200 hover:bg-rose-300 text-rose-800 font-bold cursor-pointer"
              >
                {lang === 'zh-CN' ? '关闭提示' : lang === 'en-US' ? 'Dismiss' : 'ปิดการแจ้งเตือน'}
              </button>
            </div>
          )}

          {/* 3 Main Action Buttons: Call Staff, Feel Pain Emergency, and Sign Out */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
            <button
              type="button"
              onClick={handleCallStaff}
              disabled={callStaffStatus === 'sending' || callStaffStatus === 'sent'}
              className="py-3.5 px-4 rounded-2xl font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 text-sm sm:text-base shadow-xs"
            >
              {callStaffStatus === 'sent' ? (
                <Check className="w-5 h-5 text-emerald-600" />
              ) : (
                <Bell className="w-5 h-5 text-amber-500" />
              )}
              <span>
                {callStaffStatus === 'sending'
                  ? (lang === 'zh-CN' ? '呼叫中...' : lang === 'en-US' ? 'Calling...' : 'กำลังเรียก...')
                  : callStaffStatus === 'sent'
                  ? (lang === 'zh-CN' ? '✓ 已通知' : lang === 'en-US' ? '✓ Notified' : '✓ แจ้งแล้ว')
                  : (lang === 'zh-CN' ? '🔔 呼叫人员' : lang === 'en-US' ? '🔔 Call Staff' : '🔔 เรียกเจ้าหน้าที่')}
              </span>
            </button>

            <button
              type="button"
              onClick={handlePainEmergency}
              className="py-3.5 px-4 rounded-2xl font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer text-sm sm:text-base shadow-xs"
            >
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>
                {lang === 'zh-CN' ? '🚨 感觉疼痛' : lang === 'en-US' ? '🚨 Feel Pain' : '🚨 รู้สึกเจ็บ'}
              </span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="py-3.5 px-4 rounded-2xl font-extrabold text-white bg-gradient-to-r from-emerald-600 to-blue-600 hover:brightness-105 active:scale-98 shadow-md transition flex items-center justify-center gap-2 cursor-pointer text-sm sm:text-base"
            >
              <LogOut className="w-5 h-5" />
              <span>{lang === 'zh-CN' ? '🚪 退出系统' : lang === 'en-US' ? '🚪 Sign Out' : '🚪 ออกจากระบบ'}</span>
            </button>
          </div>

          {callStaffStatus === 'sent' && (
            <p className="text-xs text-emerald-700 font-semibold animate-pulse">
              {lang === 'zh-CN' ? '工作人员已收到通知，马上前来协助您。' : lang === 'en-US' ? 'Staff has been notified and will assist you shortly.' : 'เจ้าหน้าที่ได้รับแจ้งแล้ว กำลังมาช่วยเหลือครับ'}
            </p>
          )}
        </div>

        {/* Bottom Bar */}
        <div className="w-full text-center text-xs text-slate-400 py-3">
          ระบบกายภาพบำบัดอัจฉริยะ • Dr.Tech.Care Clinical Smart Kiosk
        </div>
      </div>
    );
  }

  // 2. Final Completion Screen / Completed Today Screen (Prevent repeated exercises)
  if (isSessionCompleted || isCompletedToday) {
    const patientDisplayName = patient?.first_name || (patient as any)?.name || 'ผู้ป่วย';
    const patientFullName = `${patientDisplayName}${patient?.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}`;

    return (
      <div className="w-full min-h-[calc(100vh-64px)] flex flex-col justify-between bg-gradient-to-b from-[#EBF5FA] via-[#F4F9FC] to-[#E6F4F8] text-slate-900 select-none">
        {/* Top Header - Strictly without HN */}
        <div className="w-full bg-white border-b border-blue-100 px-6 py-3.5 shadow-xs flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-extrabold text-lg flex items-center justify-center shadow-xs">
              {patientDisplayName[0] || 'P'}
            </div>
            <div>
              <div className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                คุณ {patientFullName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 font-bold text-xs sm:text-sm transition cursor-pointer active:scale-95 shadow-xs"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '退出系统' : lang === 'en-US' ? 'Sign Out' : '🚪 ออกจากระบบ'}</span>
            </button>
          </div>
        </div>

        {/* Central Completion Notification Card */}
        <div className="my-auto max-w-2xl w-full bg-white border-2 border-emerald-400 rounded-3xl p-8 sm:p-12 text-center shadow-xl flex flex-col items-center mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
          {/* Big Emerald Green Checkmark */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-50 border-4 border-emerald-400 flex items-center justify-center text-emerald-600 shadow-md">
            <CheckCircle2 className="w-14 h-14 sm:w-16 sm:h-16 stroke-[2.5]" />
          </div>

          <div className="space-y-3">
            {/* Primary Heading >= 28px */}
            <h1 className="text-[28px] sm:text-3xl md:text-4xl font-black text-slate-900 leading-snug tracking-tight text-center">
              {lang === 'zh-CN'
                ? `${patientDisplayName} 您已完成本次物理治疗。`
                : lang === 'en-US'
                ? `${patientDisplayName}, you have already completed today's physical therapy session.`
                : `คุณ ${patientDisplayName} ได้ทำการกายภาพในครั้งนี้ไปแล้ว`}
            </h1>

            {/* Approved Secondary Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 font-semibold text-center">
              {lang === 'zh-CN'
                ? '请您好好休息。'
                : lang === 'en-US'
                ? 'Please feel free to rest and relax.'
                : 'พักผ่อนตามอัธยาศัยได้เลยครับ'}
            </p>
          </div>

          {/* Next Appointment Card (Clean & Helpful) */}
          {nextApptDateStr && (
            <div className="w-full bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <div className="text-xs font-bold text-teal-800 mb-1">
                {lang === 'zh-CN' ? '📅 下次预约时间:' : lang === 'en-US' ? '📅 Next Appointment:' : '📅 นัดหมายครั้งต่อไป:'}
              </div>
              <div className="text-base sm:text-lg font-extrabold text-blue-950">
                {nextApptDateStr}
              </div>
            </div>
          )}

          {/* Standby Return Timer */}
          <div className="text-xs sm:text-sm text-slate-400 font-medium">
            {lang === 'zh-CN'
              ? `(系统将在 ${autoResetSeconds} 秒后自动返回待机页面)`
              : lang === 'en-US'
              ? `(System will return to standby in ${autoResetSeconds} seconds)`
              : `(ระบบจะกลับสู่หน้าหลักอัตโนมัติใน ${autoResetSeconds} วินาที)`}
          </div>

          {/* Senior Ergonomic Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full pt-2">
            <button
              type="button"
              onClick={handleCallStaff}
              disabled={callStaffStatus === 'sending' || callStaffStatus === 'sent'}
              className="w-full py-4 px-6 rounded-2xl font-extrabold text-base sm:text-lg text-blue-800 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 active:scale-98 transition flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {callStaffStatus === 'sent' ? (
                <Check className="w-5 h-5 text-emerald-600" />
              ) : (
                <Bell className="w-5 h-5 text-amber-500" />
              )}
              <span>
                {callStaffStatus === 'sending'
                  ? (lang === 'zh-CN' ? '正在呼叫工作人员...' : lang === 'en-US' ? 'Calling staff...' : 'กำลังเรียกเจ้าหน้าที่...')
                  : callStaffStatus === 'sent'
                  ? (lang === 'zh-CN' ? '✓ 已通知工作人员' : lang === 'en-US' ? '✓ Staff Notified' : '✓ แจ้งเจ้าหน้าที่แล้ว')
                  : (lang === 'zh-CN' ? '🔔 呼叫医护人员' : lang === 'en-US' ? '🔔 Call Staff' : '🔔 เรียกเจ้าหน้าที่')}
              </span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:brightness-105 active:scale-98 text-white font-extrabold text-base sm:text-lg transition shadow-md flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              <span>{lang === 'zh-CN' ? '🚪 退出系统' : lang === 'en-US' ? '🚪 Sign Out' : '🚪 ออกจากระบบ'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="w-full text-center text-xs text-slate-400 py-3">
          ระบบกายภาพบำบัดอัจฉริยะ • Dr.Tech.Care Clinical Smart Kiosk
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

  const targetPreset = nextUncompletedExercise
    ? nextUncompletedExercise.detection_config || findPresetForExercise(nextUncompletedExercise.exercise_id || nextUncompletedExercise.id || nextUncompletedExercise.name)
    : null;

  const targetExerciseTitle = targetPreset
    ? lang === 'zh-CN'
      ? targetPreset.nameCn
      : lang === 'en-US'
      ? targetPreset.nameEn
      : targetPreset.nameTh
    : nextUncompletedExercise?.name || nextUncompletedExercise?.title || 'ท่าฝึกถัดไป';

  const isTargetLeft = targetSide === 'left';

  return (
    <div className="w-full min-h-[calc(100vh-64px)] flex flex-col justify-between p-4 sm:p-6 md:p-8 bg-gradient-to-b from-[#EBF5FA] via-[#F4F9FC] to-[#E6F4F8] text-slate-900 select-none overflow-y-auto">
      {/* Top Header */}
      <div className="w-full bg-white border border-blue-100 rounded-2xl px-6 py-4 shadow-xs flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-extrabold text-xl flex items-center justify-center shadow-xs shrink-0">
            {patient?.first_name?.[0] || (patient as any)?.name?.[0] || 'P'}
          </div>
          <div>
            <div className="text-lg font-black text-slate-900">
              {lang === 'zh-CN' ? '康复训练方案' : lang === 'en-US' ? 'Rehab Program' : 'โปรแกรมกายภาพบำบัด'}: คุณ {patient?.first_name || (patient as any)?.name || 'ผู้ป่วย'}{patient?.last_name && patient.last_name !== '-' ? ` ${patient.last_name}` : ''}
            </div>
            <div className="text-xs text-slate-600 flex items-center gap-2 mt-0.5">
              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                HN: {patient?.hn || patient?.patient_id || '-'}
              </span>
              <span>•</span>
              <span className="text-emerald-700 font-bold">
                {lang === 'zh-CN' ? `训练进度: ${completedExerciseIds.size}/${exercises.length} 项动作` : lang === 'en-US' ? `Progress: ${completedExerciseIds.size}/${exercises.length} exercises` : `ความคืบหน้า: ${completedExerciseIds.size}/${exercises.length} ท่า`}
              </span>
            </div>
            {/* Visual Progress Bar */}
            <div className="w-48 bg-slate-100 rounded-full h-2 mt-1.5 overflow-hidden border border-slate-200">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${exercises.length > 0 ? (completedExerciseIds.size / exercises.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Pain Alert Emergency Button */}
          <button
            type="button"
            onClick={handlePainEmergency}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold transition active:scale-95 shadow-xs cursor-pointer"
            title="หากรู้สึกเจ็บ กดปุ่มนี้เพื่อหยุดและแจ้งเจ้าหน้าที่"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />
            <span>{lang === 'zh-CN' ? '感觉疼痛 (呼叫协助)' : lang === 'en-US' ? 'Feel Pain (Alert)' : '🚨 รู้สึกเจ็บ (แจ้งนักกายภาพ)'}</span>
          </button>

          {/* Call Staff Button */}
          <button
            type="button"
            data-testid="plan-call-staff-header-btn"
            onClick={handleCallStaff}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer shadow-xs"
          >
            <PhoneCall className="w-4 h-4 text-amber-600" />
            <span>
              {callStaffStatus === 'sent'
                ? (lang === 'zh-CN' ? '已通知' : lang === 'en-US' ? 'Notified' : 'แจ้งแล้ว')
                : (lang === 'zh-CN' ? '呼叫人员' : lang === 'en-US' ? 'Staff' : '🔔 เรียกเจ้าหน้าที่')}
            </span>
          </button>

          {/* Sign Out Button (NO duplicate LanguageSwitcher) */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 border border-slate-200 text-slate-700 hover:text-rose-700 text-xs sm:text-sm font-bold transition cursor-pointer shadow-xs"
          >
            <LogOut className="w-4 h-4" />
            <span>{lang === 'zh-CN' ? '退出' : lang === 'en-US' ? 'Exit' : '🚪 ออกจากระบบ'}</span>
          </button>
        </div>
      </div>

      {/* Pain Alert Banner Notification */}
      {painAlertActive && (
        <div className="max-w-5xl mx-auto w-full mb-4 p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 flex items-center justify-between gap-4 shadow-lg animate-bounce">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
            <div className="text-sm font-bold">
              {lang === 'zh-CN'
                ? '🚨 已接收到疼痛反馈！工作人员与物理治疗师已收到提醒，请坐下休息。'
                : lang === 'en-US'
                ? '🚨 Pain alert triggered! Clinical staff notified. Please sit down and rest comfortably.'
                : '🚨 แจ้งอาการเจ็บเรียบร้อยแล้ว! เจ้าหน้าที่และนักกายภาพบำบัดกำลังมาดูแล กรุณานั่งพักผ่อนครับ'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPainAlertActive(false)}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-200 hover:bg-rose-300 text-rose-800 font-bold cursor-pointer"
          >
            {lang === 'zh-CN' ? '关闭提示' : lang === 'en-US' ? 'Dismiss' : 'ปิดการแจ้งเตือน'}
          </button>
        </div>
      )}

      {/* TOUCHLESS GESTURE STARTER HUD (HERO "NEXT EXERCISE READY" CARD) */}
      {isGestureStarterEnabled && nextUncompletedExercise && (
        <div
          data-testid="touchless-starter-banner"
          className="max-w-5xl mx-auto w-full mb-6 bg-white rounded-3xl border-2 border-emerald-400 shadow-xl p-6 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative overflow-hidden animate-in fade-in duration-300"
        >
          {/* Left (8 Cols on LG): Title, Instruction, Progress, and Giant Start Button */}
          <div className="lg:col-span-8 space-y-4">
            {/* Status Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {lang === 'zh-CN'
                    ? `即将训练 (第 ${exercises.findIndex((e) => (e.exercise_id || e.id) === (nextUncompletedExercise.exercise_id || nextUncompletedExercise.id)) + 1}/${exercises.length} 项)`
                    : lang === 'en-US'
                    ? `Next Exercise (${exercises.findIndex((e) => (e.exercise_id || e.id) === (nextUncompletedExercise.exercise_id || nextUncompletedExercise.id)) + 1}/${exercises.length})`
                    : `🟢 ท่าที่กำลังจะฝึก (ลำดับที่ ${exercises.findIndex((e) => (e.exercise_id || e.id) === (nextUncompletedExercise.exercise_id || nextUncompletedExercise.id)) + 1}/${exercises.length})`}
                </span>
              </span>

              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold text-xs flex items-center gap-1 shadow-xs">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {lang === 'zh-CN'
                    ? `${secondsLeft} 秒后自动开始`
                    : lang === 'en-US'
                    ? `Auto-starts in ${secondsLeft}s`
                    : `⏱️ เริ่มอัตโนมัติใน ${secondsLeft} วินาที`}
                </span>
              </span>

              {allowedHandSide !== 'both' && (
                <span className="px-2.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 font-bold text-xs">
                  {lang === 'zh-CN'
                    ? `指定使用: ${allowedHandSide === 'left' ? '左手' : '右手'}`
                    : lang === 'en-US'
                    ? `Locked Side: ${allowedHandSide.toUpperCase()}`
                    : `จำกัดข้าง: มือ${allowedHandSide === 'left' ? 'ซ้าย' : 'ขวา'}`}
                </span>
              )}
            </div>

            {/* Full Unclipped Exercise Title */}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug tracking-tight">
              {targetExerciseTitle}
            </h1>

            {/* Clear Ergonomic Instruction */}
            <p className={`${KIOSK_GESTURE_DESC_CLASS} flex items-start gap-2.5`}>
              <span className="text-2xl sm:text-3xl shrink-0">🙌</span>
              <span className="flex-1">
                {lang === 'zh-CN' ? (
                  <>
                    举起<strong className={KIOSK_GESTURE_SIDE_HIGHLIGHT}>{targetSide === 'left' ? '左' : targetSide === 'right' ? '右' : '双'}</strong>手保持 0.6 秒以开始训练，或轻触下方按钮开始
                  </>
                ) : lang === 'en-US' ? (
                  <>
                    Raise your <strong className={KIOSK_GESTURE_SIDE_HIGHLIGHT}>{targetSide === 'left' ? 'left' : targetSide === 'right' ? 'right' : 'both'}</strong> hand and hold for 0.6s to start, or tap the button below
                  </>
                ) : (
                  <>
                    ยกมือ<strong className={KIOSK_GESTURE_SIDE_HIGHLIGHT}>{targetSide === 'left' ? 'ซ้าย' : targetSide === 'right' ? 'ขวา' : 'ทั้งสองข้าง'}</strong>ค้างไว้ 0.6 วินาทีเพื่อเริ่มฝึก หรือแตะปุ่ม "เริ่มฝึกท่านี้ทันที" ด้านล่าง
                  </>
                )}
              </span>
            </p>

            {/* Smooth Emerald-Blue Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden p-0.5 border border-slate-200 shadow-inner">
              <div
                className="bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 h-full rounded-full transition-all duration-150"
                style={{ width: `${Math.round(holdProgress * 100)}%` }}
              />
            </div>

            {/* Real-time Status Caption */}
            <div className={`flex items-center justify-between px-1 ${KIOSK_GESTURE_STATUS_CLASS}`}>
              <span>
                {renderHighlightedStatus(
                  statusMessage ||
                    (detectedSide
                      ? `ตรวจพบ: ${detectedSide === 'both' ? '2 มือ' : detectedSide === 'left' ? 'มือซ้าย' : 'มือขวา'}`
                      : `กำลังรอยกมือ${targetSide === 'left' ? 'ซ้าย' : targetSide === 'right' ? 'ขวา' : 'ทั้งสองข้าง'}...`)
                )}
              </span>
              <span className="font-mono font-extrabold text-blue-700">
                {Math.round(holdProgress * 100)}%
              </span>
            </div>

            {/* Giant Senior-Friendly Start Button */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                id="kiosk-start-now-btn"
                data-testid="kiosk-start-now-btn"
                onClick={() => handleStartExercise(nextUncompletedExercise, 'manual')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl font-extrabold text-base sm:text-lg text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:brightness-105 active:scale-98 shadow-md flex items-center justify-center gap-2.5 cursor-pointer transition"
              >
                <span>▶️</span>
                <span>
                  {lang === 'zh-CN'
                    ? `立即开始训练 (点击或举起${isTargetLeft ? '左' : '右'}手)`
                    : lang === 'en-US'
                    ? `Start Exercise Now (Tap or Raise ${targetSide.toUpperCase()} Hand)`
                    : `เริ่มฝึกท่านี้ทันที (แตะที่นี่หรือยกมือ${isTargetLeft ? 'ซ้าย' : 'ขวา'})`}
                </span>
              </button>

              <button
                type="button"
                id="kiosk-staff-override-hud-btn"
                data-testid="kiosk-staff-override-hud-btn"
                onClick={() => setIsStaffOverrideModalOpen(true)}
                className="text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-3 py-2.5 rounded-xl border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                title="สำหรับเจ้าหน้าที่: เริ่มแทน (ต้องยืนยันตัวตน)"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>{lang === 'zh-CN' ? '工作人员代替开始' : lang === 'en-US' ? 'Staff Override' : 'สำหรับเจ้าหน้าที่: เริ่มแทน'}</span>
              </button>
            </div>
          </div>

          {/* Right (4 Cols on LG): Live Hand-Raise Camera Preview */}
          <div className="lg:col-span-4 flex flex-col items-center gap-2">
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 border-blue-200 bg-slate-900 shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover scale-x-[-1]"
              />
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-slate-300 text-xs p-3 text-center">
                  <Video className="w-7 h-7 mb-1 text-slate-400 animate-pulse" />
                  <span>กำลังเปิดกล้องตรวจจับท่าทาง...</span>
                </div>
              )}
              {isCameraActive && (
                <div className="absolute top-2.5 left-2.5 bg-emerald-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>ตรวจจับมือ</span>
                </div>
              )}
            </div>

            {/* Target Joint Badge */}
            <div className="text-xs text-slate-600 font-semibold flex items-center gap-1.5">
              <span>🎯 ข้อต่อเป้าหมาย:</span>
              <span className="text-blue-700 font-bold">{targetPreset?.targetJoint || (nextUncompletedExercise as any)?.target_joint || 'ทั่วไป'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Exercise Cards */}
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-4 mb-6 flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span>{lang === 'zh-CN' ? '今日康复动作清单' : lang === 'en-US' ? "Today's Prescribed Exercises" : 'รายการท่าฝึกประจำวันนี้'}</span>
          </h2>
          <div className="flex items-center gap-2">
            {includeMinigame && (
              <span className="text-xs px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold flex items-center gap-1.5 shadow-xs">
                <Brain className="w-3.5 h-3.5" />
                <span>{lang === 'zh-CN' ? '附带认知益智微游戏' : lang === 'en-US' ? 'Cognitive Minigame Included' : 'มินิเกมฝึกสมองต่อเนื่อง'}</span>
              </span>
            )}
          </div>
        </div>

        {exercises.map((item, idx) => {
          const exerciseId = item.exercise_id || item.id || `ex-${idx}`;
          const isDone = completedExerciseIds.has(exerciseId);
          const isTarget = Boolean(nextUncompletedExercise && (nextUncompletedExercise.exercise_id === exerciseId || nextUncompletedExercise.id === exerciseId));
          const preset = item.detection_config || findPresetForExercise(exerciseId || item.name);

          const title = lang === 'zh-CN'
            ? (preset?.nameCn || item.name_cn || item.name)
            : lang === 'en-US'
            ? (preset?.nameEn || item.name_en || item.name)
            : (preset?.nameTh || item.name || item.title);

          const framingBadge = preset?.framing === 'full_body'
            ? (lang === 'zh-CN' ? '📷 全身' : lang === 'en-US' ? '📷 Full Body' : '📷 เต็มตัว')
            : preset?.framing === 'lower_body'
            ? (lang === 'zh-CN' ? '📷 下半身' : lang === 'en-US' ? '📷 Lower Body' : '📷 ช่วงขา')
            : preset?.framing === 'head_shoulders'
            ? (lang === 'zh-CN' ? '📷 头部' : lang === 'en-US' ? '📷 Head' : '📷 ศีรษะ')
            : (lang === 'zh-CN' ? '📷 上半身' : lang === 'en-US' ? '📷 Upper Body' : '📷 ครึ่งตัวบน');

          return (
            <div
              key={exerciseId}
              className={`p-5 rounded-2xl border transition duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isDone
                  ? 'bg-emerald-50/40 border-emerald-200 text-slate-700 shadow-xs'
                  : isTarget
                  ? 'bg-white border-2 border-emerald-500 ring-4 ring-emerald-500/10 text-slate-900 shadow-md'
                  : 'bg-white border border-blue-100 text-slate-700 shadow-xs hover:border-blue-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-lg shrink-0 shadow-xs ${
                    isDone
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : isTarget
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {idx + 1}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                    <span>{title}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200/80">
                      {framingBadge}
                    </span>
                    {isDone && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                    {isTarget && !isDone && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>กำลังจะฝึก</span>
                      </span>
                    )}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 font-medium">
                    <span>ข้อต่อ: <b className="text-slate-700">{preset?.targetJoint || item.target_joint || 'ทั่วไป'}</b></span>
                    <span>•</span>
                    <span className="text-emerald-700 font-bold">
                      {item.sets || 3} เซ็ต × {item.reps || 10} ครั้ง
                    </span>
                  </div>
                </div>
              </div>

              {/* Streamlined Action Buttons (Max 2 clear buttons) */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {!isDone && (
                  <button
                    type="button"
                    id={`kiosk-start-scan-btn-${idx}`}
                    data-testid={`kiosk-start-scan-btn-${idx}`}
                    onClick={() => handleStartExercise(item, 'manual')}
                    className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition cursor-pointer flex items-center gap-2 shadow-xs"
                  >
                    <span>▶️</span>
                    <span>เริ่มฝึกท่านี้</span>
                  </button>
                )}

                <button
                  type="button"
                  data-testid={`kiosk-toggle-done-btn-${idx}`}
                  onClick={() => toggleExerciseComplete(exerciseId)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                    isDone
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isDone ? 'ทำซ้ำอีกครั้ง' : 'บันทึกว่าทำเสร็จแล้ว'}</span>
                </button>
              </div>
            </div>
          );
        })}

        {/* Discrete bottom link for staff override */}
        <div className="w-full flex items-center justify-end pt-1">
          <button
            type="button"
            data-testid="kiosk-footer-staff-override-btn"
            onClick={() => setIsStaffOverrideModalOpen(true)}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition cursor-pointer px-3 py-1.5 rounded-xl hover:bg-slate-100 border border-slate-200/80"
            title="สำหรับเจ้าหน้าที่: เริ่มแทน"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            <span>{lang === 'zh-CN' ? '医护端: 协助开始' : lang === 'en-US' ? 'Staff: Override Start' : 'สำหรับเจ้าหน้าที่: เริ่มแทน'}</span>
          </button>
        </div>
      </div>

      {/* Completion Action Bar */}
      <div className="max-w-5xl mx-auto w-full pt-4 border-t border-blue-100 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs sm:text-sm text-slate-600 font-medium">
          {lang === 'zh-CN' ? (includeMinigame ? '完成所有动作后，将自动进入认知微游戏' : '完成所有动作后即可提交今日记录') : lang === 'en-US' ? (includeMinigame ? 'Completing all exercises unlocks the cognitive minigame' : 'Complete all exercises to record session') : (includeMinigame ? 'เมื่อทำครบทุกท่า ระบบจะเปิดมินิเกมฝึกสมองต่อเนื่อง' : 'เมื่อทำครบทุกท่า ระบบจะบันทึกผลสำเร็จ')}
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
          className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:brightness-105 text-white text-base font-extrabold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 shadow-md cursor-pointer"
        >
          <span>{includeMinigame ? (lang === 'zh-CN' ? '下一步: 认知益智微游戏' : lang === 'en-US' ? 'Next: Cognitive Minigame' : 'ต่อไป: มินิเกมฝึกสมอง') : (lang === 'zh-CN' ? '提交今日训练' : lang === 'en-US' ? 'Complete Session' : 'บันทึกการฝึกเสร็จสิ้น')}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* 1. Camera & Posture Positioning Guide Modal (Used when manual flow triggers) */}
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

      {/* 4. Staff Exercise Override Modal (Clinical 2-Step Auth + 2-Minute Watchdog) */}
      <StaffExerciseOverrideModal
        isOpen={isStaffOverrideModalOpen}
        onClose={() => setIsStaffOverrideModalOpen(false)}
        patient={patient}
        exercises={exercises}
        defaultExerciseId={nextUncompletedExercise?.exercise_id || nextUncompletedExercise?.id}
        onConfirmOverride={handleConfirmStaffOverride}
      />
    </div>
  );
};

export const DailyRoutineListView = SmartDailyPlanView;
