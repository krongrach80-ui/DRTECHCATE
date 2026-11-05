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
  Trophy,
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
  Hand,
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
  const [quizScore, _setQuizScore] = useState(0);

  // Final session completed state
  const [isSessionCompleted, setIsSessionCompleted] = useState(false);
  const [autoResetSeconds, setAutoResetSeconds] = useState(8);

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
  const loadPlan = useCallback(async () => {
    if (activeSessionRef.current || isPlayingQuizRef.current) return;
    try {
      if (isInitialLoadRef.current) {
        setLoading(true);
      }
      setLoadError(null);
      const targetId = patient.patient_id || patient.hn || (patient as any).id || '';
      const res = await defaultApiClient.smartOnboarding.getDailyPlan(targetId);
      if (!isMountedRef.current) return;

      if (!res || (res as any).ok === false) {
        throw new Error((res as any)?.message || (res as any)?.error || 'ไม่สามารถโหลดตารางกายภาพบำบัดได้');
      }

      setDailyPlanResponse(res);
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
        isInitialLoadRef.current = false;
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
        side: (exerciseItem.side as any) || config.side,
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
    } catch (err) {
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

  // Helper for localized rest reason description
  const getLocalizedRestReason = (reason: string, currentLang: string) => {
    switch (reason) {
      case 'not_scheduled_today':
        return currentLang === 'zh-CN'
          ? '今日无预约康复训练安排，请好好休息。'
          : currentLang === 'en-US'
          ? 'No physical therapy session scheduled for you today. Please feel free to rest.'
          : 'วันนี้ไม่มีนัดหมายในตารางฝึกกายภาพบำบัดของคุณ เชิญพักผ่อนตามอัธยาศัยครับ';
      case 'archived_or_suspended':
        return currentLang === 'zh-CN'
          ? '您的账户处于暂停或归档状态，请联系医护人员'
          : currentLang === 'en-US'
          ? 'Your account is paused or archived. Please contact hospital staff.'
          : 'บัญชีของคุณอยู่ระหว่างระงับหรือพักการรักษา กรุณาติดต่อเจ้าหน้าที่';
      case 'no_plan_found':
        return currentLang === 'zh-CN'
          ? '未找到今日训练方案，请联系医护人员'
          : currentLang === 'en-US'
          ? 'No rehabilitation schedule found. Please contact staff.'
          : 'ไม่พบข้อมูลตารางฝึกประจำวันนี้ กรุณาติดต่อเจ้าหน้าที่';
      case 'rest_day_default':
      default:
        return currentLang === 'zh-CN'
          ? '今日是您的休息日，暂无训练安排'
          : currentLang === 'en-US'
          ? 'Today is your scheduled rest day'
          : 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้';
    }
  };

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
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const day = d.getDate();
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear() + 543} (09:00 - 10:00 น.)`;
  }, [dailyPlanResponse?.next_appointment_date, dailyPlanResponse?.time_slot, dailyPlanResponse?.schedule?.time_slot, lang]);

  // Clinical Touchless Gesture Starter Hook
  const isGestureStarterEnabled = Boolean(
    isScheduledToday &&
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
    attemptCount,
    showFailureHelp,
    isCameraActive,
    statusMessage,
    videoRef,
    handleRetry,
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
      <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950 text-white select-none">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-base font-semibold text-slate-300">
          {lang === 'zh-CN' ? '正在载入今日康复方案...' : lang === 'en-US' ? 'Loading daily rehab plan...' : 'กำลังโหลดตารางกายภาพบำบัดประจำวัน...'}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950 text-white select-none">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-3xl p-6 text-center shadow-2xl">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">
            {lang === 'zh-CN' ? '无法载入康复数据' : lang === 'en-US' ? 'Unable to load schedule' : 'ไม่สามารถโหลดข้อมูลได้'}
          </h2>
          <p className="text-xs text-slate-400 mb-6">{loadError}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={loadPlan}
              className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{lang === 'zh-CN' ? '重试 (Retry)' : lang === 'en-US' ? 'Retry' : 'ลองใหม่อีกครั้ง (Retry)'}</span>
            </button>
            <button
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

  // 1. Rest Day View (Friendly notice when no appointment today - camera never opened)
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
              <div className="text-xs text-slate-400">HN: {patient?.hn || patient?.patient_id || '-'}</div>
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
          <p className="text-sm text-slate-300 leading-relaxed mb-5">
            {lang === 'zh-CN'
              ? '🌿 今日没有为您安排康复训练，或当前为休息日。请好好休息，保持良好状态。'
              : lang === 'en-US'
              ? '🌿 There is no physical therapy session scheduled for you today. Please feel free to rest.'
              : '🌿 วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้ เชิญพักผ่อนตามอัธยาศัยครับ'}
          </p>

          <div className="text-sm text-slate-300 bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-3 w-full mb-4">
            {getLocalizedRestReason(restReason, lang)}
          </div>

          {/* Next Appointment Card if available */}
          {dailyPlanResponse?.next_appointment_date && (
            <div className="w-full bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 text-center mb-5 shadow-sm">
              <div className="text-xs text-emerald-300 font-semibold mb-1 flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>
                  {lang === 'zh-CN' ? '下次康复训练预约时间' : lang === 'en-US' ? 'Next Scheduled Session' : 'วันนัดฝึกกายภาพบำบัดครั้งถัดไปของคุณ'}
                </span>
              </div>
              <div className="text-sm font-bold text-white">
                📅 {nextApptDateStr}
              </div>
            </div>
          )}

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
              <div className="text-xs text-slate-400">HN: {patient?.hn || patient?.patient_id || '-'}</div>
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
              <span>HN: {patient?.hn || patient?.patient_id || '-'}</span>
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

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Pain Alert Emergency Button */}
          <button
            type="button"
            onClick={handlePainEmergency}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/50 text-red-200 text-xs font-semibold transition active:scale-95 shadow-md shadow-red-950/40 cursor-pointer"
            title="หากรู้สึกเจ็บ กดปุ่มนี้เพื่อหยุดและแจ้งเจ้าหน้าที่"
          >
            <ShieldAlert className="w-4 h-4 text-red-400 animate-pulse" />
            <span>{lang === 'zh-CN' ? '感觉疼痛 (呼叫协助)' : lang === 'en-US' ? 'Feel Pain (Alert)' : 'รู้สึกเจ็บ (แจ้งนักกายภาพ)'}</span>
          </button>

          {/* Call Staff Button */}
          <button
            type="button"
            data-testid="plan-call-staff-header-btn"
            onClick={handleCallStaff}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-200 text-xs font-medium transition active:scale-95 cursor-pointer"
          >
            <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {callStaffStatus === 'sent'
                ? (lang === 'zh-CN' ? '已通知' : lang === 'en-US' ? 'Notified' : 'แจ้งแล้ว')
                : (lang === 'zh-CN' ? '呼叫人员' : lang === 'en-US' ? 'Staff' : 'เรียกเจ้าหน้าที่')}
            </span>
          </button>

          <LanguageSwitcher variant="dark" />

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{lang === 'zh-CN' ? '退出' : lang === 'en-US' ? 'Exit' : 'ออกจากระบบ'}</span>
          </button>
        </div>
      </div>

      {/* Pain Alert Banner Notification */}
      {painAlertActive && (
        <div className="max-w-4xl mx-auto w-full mb-4 p-4 rounded-2xl bg-red-950/90 border-2 border-red-500 text-red-100 flex items-center justify-between gap-4 shadow-xl shadow-red-950/60 animate-bounce">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
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
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-200 cursor-pointer"
          >
            {lang === 'zh-CN' ? '关闭提示' : lang === 'en-US' ? 'Dismiss' : 'ปิดการแจ้งเตือน'}
          </button>
        </div>
      )}

      {/* TOUCHLESS GESTURE STARTER HUD (ZERO-TOUCH REHAB KINEMATICS) */}
      {isGestureStarterEnabled && nextUncompletedExercise && (
        <div
          data-testid="touchless-starter-banner"
          className={`max-w-4xl mx-auto w-full mb-6 p-6 rounded-3xl border-2 transition-all duration-300 relative overflow-hidden shadow-2xl ${
            isTargetLeft
              ? 'bg-gradient-to-r from-sky-950/90 via-cyan-950/80 to-slate-950 border-cyan-400 shadow-cyan-950/50'
              : 'bg-gradient-to-r from-emerald-950/90 via-teal-950/80 to-slate-950 border-emerald-400 shadow-emerald-950/50'
          }`}
        >
          {/* Subtle Background Glow */}
          <div
            className={`absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40 ${
              isTargetLeft ? 'bg-cyan-500' : 'bg-emerald-500'
            }`}
          />

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            {/* Left: Huge Touchless Instruction & Hold Progress */}
            <div className="flex-1 w-full text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2 flex-wrap">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 border shadow-sm ${
                    isTargetLeft
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5 animate-pulse" />
                  <span>{lang === 'zh-CN' ? '免触控体感启动' : lang === 'en-US' ? 'Touchless Gesture Starter' : 'ระบบเริ่มฝึกด้วยการยกมือ (ไม่ต้องแตะจอ)'}</span>
                </span>

                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>{secondsLeft}s ({lang === 'zh-CN' ? `第 ${attemptCount + 1}/3 次` : lang === 'en-US' ? `Try ${attemptCount + 1}/3` : `รอบที่ ${attemptCount + 1}/3`})</span>
                </span>

                {allowedHandSide !== 'both' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-500/40 text-purple-300 font-medium">
                    {lang === 'zh-CN'
                      ? `锁定使用: ${allowedHandSide === 'left' ? '左手' : '右手'}`
                      : lang === 'en-US'
                      ? `Locked Side: ${allowedHandSide.toUpperCase()}`
                      : `จำกัดข้าง: มือ${allowedHandSide === 'left' ? 'ซ้าย' : 'ขวา'} (เพื่อความปลอดภัย)`}
                  </span>
                )}
              </div>

              {/* Massive Main Prompt Banner (>= 28px) */}
              <div
                className={`text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight mb-2 ${
                  isTargetLeft ? 'text-cyan-100' : 'text-emerald-100'
                }`}
              >
                {isTargetLeft ? (
                  <span>
                    ✋{' '}
                    {lang === 'zh-CN'
                      ? `举起左手开始: ${targetExerciseTitle}`
                      : lang === 'en-US'
                      ? `Raise LEFT Hand to Start: ${targetExerciseTitle}`
                      : `ยกมือซ้ายเพื่อเริ่ม: ${targetExerciseTitle}`}
                  </span>
                ) : (
                  <span>
                    ✋{' '}
                    {lang === 'zh-CN'
                      ? `举起右手开始: ${targetExerciseTitle}`
                      : lang === 'en-US'
                      ? `Raise RIGHT Hand to Start: ${targetExerciseTitle}`
                      : `ยกมือขวาเพื่อเริ่ม: ${targetExerciseTitle}`}
                  </span>
                )}
              </div>

              {/* Clinical Ergonomic Guideline Notice */}
              <p className="text-xs sm:text-sm text-slate-300 mb-3 flex items-center justify-center md:justify-start gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  {lang === 'zh-CN'
                    ? '只需将手举至胸部/肩部高度并保持静止约 0.6 秒，无需过度伸展手臂。'
                    : lang === 'en-US'
                    ? 'Raise hand comfortably to chest/shoulder height and hold steady for 0.6s.'
                    : 'ยกมือระดับอกหรือไหล่ในท่าที่สบาย ค้างไว้นิ่งๆ 0.6 วินาที (ไม่ต้องเหยียดสุดแขน)'}
                </span>
              </p>

              {/* Hold Dwell Progress Bar */}
              <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-full h-4 overflow-hidden p-0.5 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    isTargetLeft
                      ? 'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-300 shadow-lg shadow-cyan-400/50'
                      : 'bg-gradient-to-r from-teal-400 via-emerald-400 to-green-300 shadow-lg shadow-emerald-400/50'
                  }`}
                  style={{ width: `${Math.round(holdProgress * 100)}%` }}
                />
              </div>

              {/* Real-time Status Caption */}
              <div className="flex items-center justify-between text-xs mt-2 px-1">
                <span className="font-medium text-slate-300">
                  {statusMessage ||
                    (detectedSide
                      ? (lang === 'zh-CN' ? `已检测到${detectedSide === 'both' ? '双手' : detectedSide === 'left' ? '左手' : '右手'}` : lang === 'en-US' ? `Detected: ${detectedSide}` : `ตรวจพบ: ${detectedSide === 'both' ? '2 มือ' : detectedSide === 'left' ? 'มือซ้าย' : 'มือขวา'}`)
                      : (lang === 'zh-CN'
                        ? `等待举起${isTargetLeft ? '左' : '右'}手...`
                        : lang === 'en-US'
                        ? `Waiting for ${targetSide.toUpperCase()} hand...`
                        : `กำลังรอยกมือ${isTargetLeft ? 'ซ้าย' : 'ขวา'}...`))}
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {Math.round(holdProgress * 100)}%
                </span>
              </div>
            </div>

            {/* Right: Floating PIP Mirrored Camera & Staff Override */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="relative w-36 h-28 sm:w-44 sm:h-32 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                {!isCameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-slate-400 text-[11px] p-2 text-center">
                    <Video className="w-6 h-6 mb-1 text-slate-500 animate-pulse" />
                    <span>กำลังเปิดกล้อง...</span>
                  </div>
                )}
                {isCameraActive && (
                  <div className="absolute top-2 left-2 bg-emerald-500/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    <span>ตรวจจับมือ</span>
                  </div>
                )}
              </div>

              {/* Discrete Staff Override Button (Opens Staff Auth Modal) */}
              <button
                type="button"
                data-testid="kiosk-staff-override-hud-btn"
                onClick={() => setIsStaffOverrideModalOpen(true)}
                className="text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 transition flex items-center gap-1.5 cursor-pointer mt-1"
                title="สำหรับเจ้าหน้าที่: เริ่มแทน (ต้องยืนยันตัวตน)"
              >
                <KeyRound className="w-3 h-3 text-amber-400" />
                <span>{lang === 'zh-CN' ? '工作人员代替开始' : lang === 'en-US' ? 'Staff Override' : 'สำหรับเจ้าหน้าที่: เริ่มแทน'}</span>
              </button>
            </div>
          </div>

          {/* 3-Attempt Failure Help Alert Modal inside Banner */}
          {showFailureHelp && (
            <div className="mt-4 pt-4 border-t border-amber-500/40 bg-amber-950/40 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2.5 text-amber-200 text-xs sm:text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  {lang === 'zh-CN'
                    ? '无法举手？请呼叫工作人员或由工作人员代为启动'
                    : lang === 'en-US'
                    ? 'Cannot raise hand? Call staff or request staff override'
                    : 'ยกมือไม่ได้? เรียกเจ้าหน้าที่ช่วยเริ่ม'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  data-testid="kiosk-call-staff-help-btn"
                  onClick={handleCallStaff}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{lang === 'zh-CN' ? '呼叫人员' : lang === 'en-US' ? 'Call Staff' : 'เรียกเจ้าหน้าที่'}</span>
                </button>
                <button
                  type="button"
                  data-testid="kiosk-staff-override-help-btn"
                  onClick={() => setIsStaffOverrideModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>{lang === 'zh-CN' ? '医护代启动' : lang === 'en-US' ? 'Staff Override' : 'เจ้าหน้าที่เริ่มแทน'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{lang === 'zh-CN' ? '重试' : lang === 'en-US' ? 'Retry' : 'ลองใหม่'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
                  : isTarget
                  ? 'bg-slate-900/90 border-2 border-emerald-400 ring-4 ring-emerald-500/30 text-white shadow-xl shadow-emerald-950/50'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 opacity-80'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : isTarget
                      ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-md'
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
                    {isTarget && (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 font-bold flex items-center gap-1 animate-pulse">
                        <Sparkles className="w-3 h-3" />
                        <span>{lang === 'zh-CN' ? '当前目标动作' : lang === 'en-US' ? 'Active Target' : 'ท่าเป้าหมายปัจจุบัน'}</span>
                      </span>
                    )}
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

              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Touchless Initiation Status Badge & Discrete Staff Action */}
                {isTarget && !isDone && (
                  <div className="flex items-center gap-2">
                    <div
                      className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-sm ${
                        isTargetLeft
                          ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                          : 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                      }`}
                    >
                      <Hand className="w-4 h-4 animate-bounce" />
                      <span>
                        {lang === 'zh-CN'
                          ? `举起${isTargetLeft ? '左' : '右'}手以开始`
                          : lang === 'en-US'
                          ? `Raise ${targetSide.toUpperCase()} Hand`
                          : `ยกมือ${isTargetLeft ? 'ซ้าย' : 'ขวา'}เพื่อเริ่ม`}
                      </span>
                    </div>

                    {/* Discrete staff override button */}
                    <button
                      type="button"
                      id={`kiosk-start-scan-btn-${idx}`}
                      data-testid={`kiosk-start-scan-btn-${idx}`}
                      onClick={() => setIsStaffOverrideModalOpen(true)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                      title="กดเริ่มแทน (สำหรับเจ้าหน้าที่)"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>{lang === 'zh-CN' ? '代开始' : lang === 'en-US' ? 'Override' : 'เริ่มแทน'}</span>
                    </button>
                  </div>
                )}

                {/* Mark Done / Repeat Button (Always Available) */}
                <button
                  type="button"
                  data-testid={`kiosk-toggle-done-btn-${idx}`}
                  onClick={() => toggleExerciseComplete(exerciseId)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 cursor-pointer ${
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

        {/* Discrete bottom link for staff override (does not clutter senior patient view) */}
        <div className="w-full flex items-center justify-end pt-1">
          <button
            type="button"
            data-testid="kiosk-footer-staff-override-btn"
            onClick={() => setIsStaffOverrideModalOpen(true)}
            className="text-[11px] text-slate-500 hover:text-slate-400 flex items-center gap-1.5 transition cursor-pointer px-2.5 py-1 rounded-lg hover:bg-slate-900"
            title="สำหรับเจ้าหน้าที่: เริ่มแทน"
          >
            <KeyRound className="w-3 h-3 text-slate-500" />
            <span>{lang === 'zh-CN' ? '医护端: 协助开始' : lang === 'en-US' ? 'Staff: Override Start' : 'สำหรับเจ้าหน้าที่: เริ่มแทน'}</span>
          </button>
        </div>
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
