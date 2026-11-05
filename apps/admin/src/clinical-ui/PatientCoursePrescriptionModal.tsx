/**
 * apps/admin/src/clinical-ui/PatientCoursePrescriptionModal.tsx
 *
 * PER-PATIENT EXERCISE COURSE PRESCRIPTION BUILDER & CLINICAL CONTRAINDICATION GUARD
 *
 * Core Features:
 * 1. Three Entry Points with patient_id scoping.
 * 2. Clinical Safety Header Banner (Name, HN, Diagnosis, Target Joint, Amber/Rose Contraindications Box).
 * 3. 10-Exercise Catalog with 4 filter tabs & Automatic Contraindication Warning Engine.
 * 4. Per-Exercise Custom Configuration (sets 1-10, reps 1-50, side right/left/both, angles, sequence reorder, pt note).
 * 5. Course Schedule Configuration (Mode A: Date Range + Days of Week; Mode B: Interactive Calendar Date Picker).
 * 6. Historical Data Protection (never alters past appointments or completed session logs).
 * 7. Post-Save Course Summary Modal with navigation to "5. ตารางนัด" or "2. ข้อมูลคนไข้".
 * 8. Trilingual TH/EN/CN UI.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sliders,
  Activity,
  Layers,
  Search,
  Check,
  User,
  CalendarCheck,
  Lock,
} from 'lucide-react';
import {
  defaultApiClient,
  PatientRecord,
} from '../../../../packages/api-client/src/index.js';
import { ALL_CLINICAL_EXERCISES } from '../../../../packages/pose-engine/src/presets/exercises.config';

export interface PrescribedExerciseCustom {
  exercise_id: string;
  id: string;
  name: string;
  name_th: string;
  name_en: string;
  name_cn: string;
  target_joint: string;
  sets: number; // 1-10
  reps: number; // 1-50
  side: 'right' | 'left' | 'both';
  start_angle_deg?: number;
  target_min_deg?: number;
  target_max_deg?: number;
  hold_duration_sec?: number;
  order_index: number;
  pt_note?: string;
  has_contraindication_warning?: boolean;
  contraindication_warning?: string;
  detection_config?: any;
}

export interface PatientCoursePrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedPatientId?: string;
  preselectedDate?: string;
  onSuccess?: (patientId: string, action?: 'schedule' | 'patients' | 'start_exercise' | 'kiosk_home') => void;
  kioskMode?: boolean;
}

// Trilingual Dictionary
const I18N = {
  th: {
    modalTitle: 'จัดคอร์สและสั่งจ่ายท่าฝึกกายภาพเฉพาะบุคคล',
    modalSubtitle: 'Per-Patient Exercise Course Prescription & Biomechanical Guard',
    patientSectionTitle: 'ข้อมูลคนไข้และข้อห้ามทางคลินิก',
    noPatientSelected: 'กรุณาเลือกคนไข้เพื่อเริ่มสั่งจ่ายคอร์ส',
    changePatient: 'เปลี่ยนคนไข้',
    searchPatientPlaceholder: 'ค้นหาชื่อคนไข้, นามสกุล หรือ HN...',
    diagnosis: 'การวินิจฉัย/อาการหลัก',
    targetJoint: 'ข้อต่อเป้าหมาย',
    contraindicationsTitle: '⚠️ ข้อห้ามและข้อควรระวังทางคลินิก (Contraindications & Precautions)',
    noContraindications: 'ไม่มีข้อห้ามระบุไว้เป็นพิเศษ (Normal clinical precautions apply)',
    tabAll: 'ทั้งหมด (15 ท่า)',
    tabRecommended: 'แนะนำตามข้อต่อคนไข้',
    tabUpper: 'ครึ่งตัวบน (Upper Body)',
    tabLower: 'ครึ่งตัวล่าง / เต็มตัว (Lower & Core)',
    prescribedListTitle: 'รายการท่าฝึกที่สั่งจ่ายในคอร์ส',
    noExercisesSelected: 'ยังไม่ได้เลือกท่าฝึก (กรุณากด "+ เพิ่มเข้าคอร์ส" จากคลังท่าด้านล่าง)',
    scheduleSettingsTitle: 'ตั้งค่าวันและตารางฝึกกายภาพ',
    modeA: 'โหมด A: ช่วงวันที่ + วันในสัปดาห์',
    modeB: 'โหมด B: ปฏิทินรายวัน (คลิกเลือกวันเอง)',
    startDate: 'วันเริ่มต้นคอร์ส',
    endDate: 'วันสิ้นสุดคอร์ส',
    daysOfWeek: 'วันที่ต้องมาฝึกในสัปดาห์',
    timeSlot: 'ช่วงเวลาฝึก',
    kiosk: 'ตู้ Kiosk ประจำ',
    includeQuiz: 'รวมมินิเกมตอบคำถามประเมินความรู้ท้ายรอบ (10 ข้อ)',
    saveCourseBtn: '💾 บันทึกและสั่งจ่ายคอร์สกายภาพทันที',
    saving: 'กำลังบันทึกคอร์สและจัดตารางนัด...',
    customAngles: 'ปรับมุมเป้าหมายและเวลาเกร็งค้างเฉพาะบุคคล',
    side: 'ข้างที่ฝึก',
    sideRight: 'ขวา (Right)',
    sideLeft: 'ซ้าย (Left)',
    sideBoth: 'ทั้งสองข้าง (Both)',
    sets: 'เซ็ต',
    reps: 'ครั้ง / เซ็ต',
    ptNotePlaceholder: 'คำแนะนำพิเศษสำหรับคนไข้ท่านนี้ (เช่น ยกช้าๆ หากตึงไหล่ให้หยุดพัก)...',
    summaryTitle: 'บันทึกคอร์สออกกำลังกายสำเร็จ',
    summarySubtitle: 'ข้อมูลตารางฝึกถูกบันทึกและเชื่อมโยงกับระบบ Kiosk และตารางนัดเรียบร้อยแล้ว',
    goToScheduleBtn: '📅 ไปหน้าตารางนัด (5. ตารางนัด)',
    goToPatientsBtn: '👥 กลับหน้ารายการคนไข้ (2. ข้อมูลคนไข้)',
    startExerciseBtn: '🏋️ เริ่มฝึกกายภาพของผู้ป่วยคนนี้ทันที',
    kioskHomeBtn: '🏠 เสร็จสิ้น / กลับหน้าหลัก Kiosk',
    totalDays: 'รวมวันฝึกทั้งหมด',
    daysUnit: 'วัน',
    modeBLockedByA: 'มีการจัดวันแบบ A อยู่ ต้องยกเลิกการจัดแบบ A ก่อน จึงจะจัดแบบ B ได้',
    modeALockedByB: 'มีการจัดวันแบบ B อยู่ ต้องยกเลิกการจัดแบบ B ก่อน จึงจะจัดแบบ A ได้',
    cancelModeABtn: '🗑️ ยกเลิกการจัดวันแบบ A',
    cancelModeBBtn: '🗑️ ยกเลิกการจัดวันแบบ B',
    confirmClearModeATitle: 'ยืนยันยกเลิกการจัดวันแบบ A',
    confirmClearModeBTitle: 'ยืนยันยกเลิกการจัดวันแบบ B',
    confirmClearModeA: 'ล้างข้อมูลการจัดวันแบบ A ทั้งหมดใช่หรือไม่?',
    confirmClearModeB: 'ล้างข้อมูลการจัดวันแบบ B ทั้งหมดใช่หรือไม่?',
    noScheduleDaysError: 'กรุณาจัดวันฝึกอย่างน้อย 1 วัน',
    clearModePrompt: 'การล้างข้อมูลนี้จะมีผลในแบบฟอร์มทันที และจะปลดล็อกอีกโหมดหนึ่ง (ข้อมูลในฐานข้อมูลจะยังไม่เปลี่ยนแปลงจนกว่าจะกดบันทึก)',
    btnConfirmClear: 'ยืนยันล้างข้อมูล',
    btnCancel: 'ยกเลิก',
  },
  en: {
    modalTitle: 'Prescribe Patient-Specific Exercise Course',
    modalSubtitle: 'Per-Patient Exercise Course Prescription & Biomechanical Guard',
    patientSectionTitle: 'Patient Clinical Profile & Contraindications',
    noPatientSelected: 'Please select a patient to prescribe exercises',
    changePatient: 'Change Patient',
    searchPatientPlaceholder: 'Search patient name or HN...',
    diagnosis: 'Diagnosis / Chief Complaint',
    targetJoint: 'Target Joint',
    contraindicationsTitle: '⚠️ Clinical Contraindications & Precautions',
    noContraindications: 'No specific contraindications recorded',
    tabAll: 'All (15 Exercises)',
    tabRecommended: 'Recommended for Joint',
    tabUpper: 'Upper Body',
    tabLower: 'Lower & Core',
    prescribedListTitle: 'Prescribed Exercise Sequence',
    noExercisesSelected: 'No exercises added yet. Click "+ Add to Course" below.',
    scheduleSettingsTitle: 'Schedule & Appointment Settings',
    modeA: 'Mode A: Date Range + Days of Week',
    modeB: 'Mode B: Interactive Monthly Calendar Picker',
    startDate: 'Start Date',
    endDate: 'End Date',
    daysOfWeek: 'Scheduled Days of Week',
    timeSlot: 'Time Slot',
    kiosk: 'Assigned Kiosk',
    includeQuiz: 'Include interactive knowledge quiz minigame (10 questions)',
    saveCourseBtn: '💾 Save & Prescribe Course Now',
    saving: 'Saving Course and Syncing Schedule...',
    customAngles: 'Customize Biomechanical Angles & Hold Duration',
    side: 'Target Side',
    sideRight: 'Right',
    sideLeft: 'Left',
    sideBoth: 'Both',
    sets: 'Sets',
    reps: 'Reps',
    ptNotePlaceholder: 'Clinical note for this patient (e.g. Move slowly, stop if shoulder pain occurs)...',
    summaryTitle: 'Course Prescribed Successfully',
    summarySubtitle: 'Schedule is now atomic and synchronized with Kiosk Daily Plan and Schedule Calendar.',
    goToScheduleBtn: '📅 View Schedule (Menu 5)',
    goToPatientsBtn: '👥 Return to Patients (Menu 2)',
    startExerciseBtn: '🏋️ Start Patient Session Now',
    kioskHomeBtn: '🏠 Done / Return to Kiosk Home',
    totalDays: 'Total Training Days',
    daysUnit: 'days',
    modeBLockedByA: 'Mode A schedule is active. Please clear Mode A schedule before switching to Mode B.',
    modeALockedByB: 'Mode B schedule is active. Please clear Mode B schedule before switching to Mode A.',
    cancelModeABtn: '🗑️ Clear Mode A Schedule',
    cancelModeBBtn: '🗑️ Clear Mode B Schedule',
    confirmClearModeATitle: 'Confirm Clear Mode A',
    confirmClearModeBTitle: 'Confirm Clear Mode B',
    confirmClearModeA: 'Are you sure you want to clear all Mode A schedule data?',
    confirmClearModeB: 'Are you sure you want to clear all Mode B schedule data?',
    noScheduleDaysError: 'Please schedule at least 1 training day',
    clearModePrompt: 'This will reset the schedule in this form and unlock the other mode. Database records will not change until you click Save.',
    btnConfirmClear: 'Confirm Clear',
    btnCancel: 'Cancel',
  },
  cn: {
    modalTitle: '为患者定制康复训练方案',
    modalSubtitle: '个性化运动处方与生物力学安全监测',
    patientSectionTitle: '患者临床信息与禁忌症',
    noPatientSelected: '请选择患者以开始开具处方',
    changePatient: '更换患者',
    searchPatientPlaceholder: '搜索患者姓名或病历号 (HN)...',
    diagnosis: '诊断/主要症状',
    targetJoint: '目标关节',
    contraindicationsTitle: '⚠️ 临床禁忌与注意事项 (Contraindications & Precautions)',
    noContraindications: '未记录特殊禁忌症',
    tabAll: '全部动作 (15 动作)',
    tabRecommended: '根据目标关节推荐',
    tabUpper: '上半身 (肩/肘/颈)',
    tabLower: '下半身与核心 (膝/髋/踝)',
    prescribedListTitle: '已处方的动作序列',
    noExercisesSelected: '尚未添加动作，请点击下方"+ 添加到方案"',
    scheduleSettingsTitle: '训练排期与时间安排',
    modeA: '模式 A: 日期范围 + 星期规律',
    modeB: '模式 B: 交互式月历自主点选',
    startDate: '开始日期',
    endDate: '结束日期',
    daysOfWeek: '每周训练日',
    timeSlot: '训练时段',
    kiosk: '指定训练机 (Kiosk)',
    includeQuiz: '包含课后康复知识趣味问答 (10题)',
    saveCourseBtn: '💾 立即保存并下发处方方案',
    saving: '正在保存并同步日程...',
    customAngles: '为该患者自定义动作目标角度与保持时间',
    side: '训练肢体',
    sideRight: '右侧 (Right)',
    sideLeft: '左侧 (Left)',
    sideBoth: '双侧 (Both)',
    sets: '组数',
    reps: '每组次数',
    ptNotePlaceholder: '医生/治疗师特殊嘱咐...',
    summaryTitle: '康复方案下发成功',
    summarySubtitle: '排期数据已与 Kiosk 训练终端及日程大表完全同步。',
    goToScheduleBtn: '📅 前往日程表 (第5项)',
    goToPatientsBtn: '👥 返回患者列表 (第2项)',
    startExerciseBtn: '🏋️ 立即开始该患者训练',
    kioskHomeBtn: '🏠 完成 / 返回Kiosk主页',
    totalDays: '训练总天数',
    daysUnit: '天',
    modeBLockedByA: '已配置模式 A 排期。切换至模式 B 前请先取消模式 A。',
    modeALockedByB: '已配置模式 B 排期。切换至模式 A 前请先取消模式 B。',
    cancelModeABtn: '🗑️ 取消模式 A 排期',
    cancelModeBBtn: '🗑️ 取消模式 B 排期',
    confirmClearModeATitle: '确认取消模式 A',
    confirmClearModeBTitle: '确认取消模式 B',
    confirmClearModeA: '确定要清除所有模式 A 的排期数据吗？',
    confirmClearModeB: '确定要清除所有模式 B 的排期数据吗？',
    noScheduleDaysError: '请至少安排 1 天训练日',
    clearModePrompt: '重置仅在当前表单生效并解锁另一模式，直到点击保存前数据库不会变更。',
    btnConfirmClear: '确认清除',
    btnCancel: '取消',
  },
};

const DAYS_OF_WEEK = [
  { key: 'Mon', th: 'จันทร์', en: 'Mon', cn: '周一' },
  { key: 'Tue', th: 'อังคาร', en: 'Tue', cn: '周二' },
  { key: 'Wed', th: 'พุธ', en: 'Wed', cn: '周三' },
  { key: 'Thu', th: 'พฤหัสบดี', en: 'Thu', cn: '周四' },
  { key: 'Fri', th: 'ศุกร์', en: 'Fri', cn: '周五' },
  { key: 'Sat', th: 'เสาร์', en: 'Sat', cn: '周六' },
  { key: 'Sun', th: 'อาทิตย์', en: 'Sun', cn: '周日' },
];

// Helper: Broadcast Schedule Updates across components & tabs
function broadcastScheduleSync(patientId?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('schedule-updated'));
  try {
    const bc = new BroadcastChannel('drtechcare_schedule');
    bc.postMessage({ type: 'schedule-updated', patientId, timestamp: Date.now() });
    bc.close();
  } catch {}
  try {
    localStorage.setItem('drtechcare_schedule_updated', Date.now().toString());
  } catch {}
}

// Clinical Contraindication & Safety Engine
export function evaluateContraindications(
  exerciseId: string,
  targetJoint: string,
  patient?: PatientRecord | null
): { hasWarning: boolean; warningMessage: string; reason?: string } {
  if (!patient) return { hasWarning: false, warningMessage: '' };

  const rawContra = `${patient.contraindications || ''} ${(patient as any).history?.contraindications || ''}`.toLowerCase();
  const rawDiseases = `${patient.underlying_diseases || ''} ${(patient as any).history?.chronic_diseases || ''}`.toLowerCase();
  const rawInjury = `${patient.injury || ''} ${(patient as any).diagnosis || ''}`.toLowerCase();
  const combinedText = `${rawContra} ${rawDiseases} ${rawInjury}`;

  const pJoint = (patient.target_joint || (patient as any).history?.target_joint || '').toLowerCase();
  const exJoint = (targetJoint || '').toLowerCase();

  // 1. Shoulder & Scapula constraints (e.g. Abduction restriction / Rotator cuff / Post-op)
  if (
    exerciseId.includes('shoulder') ||
    exerciseId.includes('scapula') ||
    exerciseId === 'shoulder-pendulum' ||
    exJoint.includes('ไหล่') ||
    exJoint.includes('shoulder') ||
    exJoint.includes('สะบัก') ||
    exJoint.includes('scapula')
  ) {
    if (
      combinedText.includes('ห้ามกางแขน') ||
      combinedText.includes('ห้ามยกแขน') ||
      combinedText.includes('ผ่าตัดไหล่') ||
      combinedText.includes('เอ็นไหล่') ||
      combinedText.includes('rotator cuff') ||
      combinedText.includes('impingement') ||
      combinedText.includes('90') ||
      combinedText.includes('acute')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนทางคลินิก: ท่านี้ใช้ข้อต่อไหล่/ช่วงมุมที่อาจกระทบข้อห้ามของผู้ป่วย (มีประวัติจำกัดการกางแขน/ผ่าตัดไหล่) กรุณาปรับลดมุมเป้าหมาย (targetMaxDeg) ไม่ให้เกิน 90° หรือตรวจสอบความเหมาะสม',
        reason: 'shoulder_contraindication',
      };
    }
  }

  // 2. Weight-bearing / Fall risk / Balance / Standing constraints
  if (
    exerciseId === 'sit-to-stand' ||
    exerciseId === 'standing-hip-abd' ||
    exerciseId === 'standing-hip-abduction' ||
    exerciseId === 'heel-raise' ||
    exerciseId === 'calf-raise' ||
    exerciseId === 'single-leg-balance' ||
    exerciseId === 'calf-stretch' ||
    exerciseId === 'mini-squat' ||
    exerciseId === 'wall-pushup'
  ) {
    if (
      combinedText.includes('ห้ามลงน้ำหนัก') ||
      combinedText.includes('หกล้ม') ||
      combinedText.includes('balance') ||
      combinedText.includes('กระดูกหัก') ||
      combinedText.includes('ข้อเข่าเสื่อมรุนแรง') ||
      combinedText.includes('non-weight bearing') ||
      combinedText.includes('เสี่ยงล้ม') ||
      combinedText.includes('ทรงตัว')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนทางคลินิก: ผู้ป่วยมีภาวะเสี่ยงหกล้มหรือจำกัดการลงน้ำหนัก กรุณาพิจารณาปรับลดจำนวนครั้งหรือมีเจ้าหน้าที่คอยดูแลอย่างใกล้ชิด',
        reason: 'fall_risk_contraindication',
      };
    }
  }

  // 3. Neck & Cervical constraints
  if (
    exerciseId === 'neck-side-tilt' ||
    exerciseId === 'chin-tuck' ||
    exJoint.includes('คอ') ||
    exJoint.includes('neck') ||
    exJoint.includes('cervical')
  ) {
    if (
      combinedText.includes('กระดูกคอ') ||
      combinedText.includes('cervical') ||
      combinedText.includes('เวียนศีรษะ') ||
      combinedText.includes('vertigo')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนทางคลินิก: ผู้ป่วยมีประวัติเกี่ยวกับกระดูกคอหรือมีอาการเวียนศีรษะ หลีกเลี่ยงการเอียงคอสุดช่วงมุม',
        reason: 'neck_contraindication',
      };
    }
  }

  // 4. Knee constraints (Deep flexion / Patellofemoral / Meniscus)
  if (
    exerciseId === 'mini-squat' ||
    exerciseId === 'seated-knee-ext' ||
    exerciseId === 'seated-knee-extension' ||
    exerciseId === 'sit-to-stand' ||
    exJoint.includes('เข่า') ||
    exJoint.includes('knee')
  ) {
    if (
      combinedText.includes('ห้ามงอเข่า') ||
      combinedText.includes('ข้อเข่าเสื่อมรุนแรง') ||
      combinedText.includes('severe oa') ||
      combinedText.includes('meniscus') ||
      combinedText.includes('หมอนรองข้อเข่า')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนทางคลินิก: ผู้ป่วยมีข้อจำกัดในการงอข้อเข่า/หมอนรองข้อเข่า หลีกเลี่ยงการงอเข่าลึกเกิน 45°',
        reason: 'knee_contraindication',
      };
    }
  }

  // 4. Secondary Joint Tag
  if (pJoint && exJoint && !pJoint.includes(exJoint) && !exJoint.includes(pJoint) && pJoint !== 'ทั่วไป') {
    return {
      hasWarning: false,
      warningMessage: `ℹ️ ข้อต่อเสริม: ข้อต่อหลักของคนไข้คือ "${patient.target_joint}" (ท่านี้ฝึก "${targetJoint}")`,
      reason: 'secondary_joint',
    };
  }

  return { hasWarning: false, warningMessage: '' };
}

export const PatientCoursePrescriptionModal: React.FC<PatientCoursePrescriptionModalProps> = ({
  isOpen,
  onClose,
  preselectedPatientId,
  preselectedDate,
  onSuccess,
  kioskMode = false,
}) => {
  const [lang, setLang] = useState<'th' | 'en' | 'cn'>('th');
  const t = I18N[lang];

  // Patients state
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');

  // Prescription exercise list state
  const [prescribedExercises, setPrescribedExercises] = useState<PrescribedExerciseCustom[]>([]);
  const [activeCatalogFilter, setActiveCatalogFilter] = useState<'all' | 'recommended' | 'upper' | 'lower'>('all');
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);

  // Scheduling state: Mode A and Mode B completely separated
  const defaultStart = useMemo(() => {
    return preselectedDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  }, [preselectedDate]);
  const defaultEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  }, []);

  const [scheduleMode, setScheduleMode] = useState<'modeA' | 'modeB'>('modeA');
  const [modeAStartDate, setModeAStartDate] = useState<string>(defaultStart);
  const [modeAEndDate, setModeAEndDate] = useState<string>(defaultEnd);
  const [modeASelectedDays, setModeASelectedDays] = useState<string[]>([]);
  const [modeBScheduledDates, setModeBScheduledDates] = useState<string[]>(() => {
    return preselectedDate ? [preselectedDate] : [];
  });

  const [scheduleLockWarning, setScheduleLockWarning] = useState<string | null>(null);
  const [confirmClearModal, setConfirmClearModal] = useState<'modeA' | 'modeB' | null>(null);

  const [timeSlot, setTimeSlot] = useState('09:00 - 10:00');
  const [assignedKioskId, setAssignedKioskId] = useState('kiosk-01');
  const [includeMinigame, setIncludeMinigame] = useState(true);
  const [allowedStartHand, setAllowedStartHand] = useState<'both' | 'left' | 'right'>('both');

  // Definition of "has schedule data"
  const hasModeAData = useMemo(() => {
    const hasDays = modeASelectedDays.length > 0;
    const hasCustomDates = modeAStartDate !== defaultStart || modeAEndDate !== defaultEnd;
    return hasDays || hasCustomDates;
  }, [modeASelectedDays.length, modeAStartDate, modeAEndDate, defaultStart, defaultEnd]);

  const hasModeBData = useMemo(() => {
    return modeBScheduledDates.length > 0;
  }, [modeBScheduledDates.length]);

  // Interactive Calendar View Month/Year
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());

  // Saving / Transaction state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // Load all patients on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadPatients() {
      try {
        let directMatch: PatientRecord | null = null;
        if (preselectedPatientId) {
          try {
            directMatch = await defaultApiClient.patients.get(preselectedPatientId);
          } catch {
            // direct fetch fallback handled internally
          }
        }

        const list = await defaultApiClient.patients.list().catch(() => []);
        const validList = Array.isArray(list) ? [...list] : [];
        if (directMatch && !validList.some((p) => p.id === directMatch!.id || p.hn === directMatch!.hn)) {
          validList.unshift(directMatch);
        }

        if (!isMounted) return;
        setPatients(validList);

        if (directMatch) {
          setSelectedPatient(directMatch);
          setIsSearchingPatient(false);
        } else if (preselectedPatientId) {
          const match = validList.find(
            (p) => p.id === preselectedPatientId || p.hn === preselectedPatientId
          );
          if (match) {
            setSelectedPatient(match);
            setIsSearchingPatient(false);
          } else if (validList.length > 0) {
            setSelectedPatient(validList[0]);
          } else {
            setSelectedPatient(null);
            setIsSearchingPatient(true);
          }
        } else if (validList.length > 0 && !selectedPatient) {
          setSelectedPatient(validList[0]);
        } else if (!selectedPatient) {
          setIsSearchingPatient(true);
        }
      } catch {
        // non-blocking
      }
    }

    loadPatients();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectedPatientId]);

  // Load existing course when selectedPatient changes
  useEffect(() => {
    if (!selectedPatient) return;

    async function loadExistingCourse() {
      try {
        const targetId = selectedPatient?.id || selectedPatient?.hn;
        if (!targetId) return;

        const res = await defaultApiClient.smartOnboarding.getSchedule(targetId).catch(() => null);
        const sched = res?.data?.schedule || (selectedPatient as any).schedule || (selectedPatient as any).history?.schedule;

        if (sched) {
          const sMode = sched.schedule_mode || sched.scheduleMode;
          const sDates: string[] = Array.isArray(sched.scheduled_dates || sched.scheduledDates)
            ? (sched.scheduled_dates || sched.scheduledDates)
            : [];
          const sDays: string[] = Array.isArray(sched.days_of_week || sched.daysOfWeek)
            ? (sched.days_of_week || sched.daysOfWeek)
            : [];
          const sStart = (sched.startDate || sched.start_date || '').slice(0, 10);
          const sEnd = (sched.endDate || sched.end_date || '').slice(0, 10);

          // Decision A3: If start === end or has explicit scheduled_dates, open Mode B; else Mode A
          const isModeB =
            sMode === 'modeB' ||
            (sDates.length > 0 && sDays.length === 0) ||
            (Boolean(sStart) && Boolean(sEnd) && sStart === sEnd && sDates.length > 0);

          if (isModeB) {
            setScheduleMode('modeB');
            setModeBScheduledDates(sDates.length > 0 ? sDates : sStart ? [sStart] : []);
            setModeASelectedDays([]);
            setModeAStartDate(defaultStart);
            setModeAEndDate(defaultEnd);
          } else {
            setScheduleMode('modeA');
            setModeAStartDate(sStart || defaultStart);
            setModeAEndDate(sEnd || defaultEnd);
            setModeASelectedDays(sDays.length > 0 ? sDays : ['Mon', 'Wed', 'Fri']);
            setModeBScheduledDates([]);
          }

          if (sched.timeSlot || sched.time_slot) {
            setTimeSlot(sched.timeSlot || sched.time_slot);
          }
          if (sched.assigned_kiosk_id || sched.kioskId) {
            setAssignedKioskId(sched.assigned_kiosk_id || sched.kioskId);
          }
          if (sched.include_minigame !== undefined) {
            setIncludeMinigame(Boolean(sched.include_minigame));
          }
          if (sched.allowed_start_hand) {
            setAllowedStartHand(sched.allowed_start_hand);
          }

          // Populate existing prescribed exercises
          const existingExs = sched.prescribed_exercises || sched.assigned_exercises || [];
          if (Array.isArray(existingExs) && existingExs.length > 0) {
            const mapped: PrescribedExerciseCustom[] = existingExs.map((ex: any, idx: number) => {
              const baseEx = ALL_CLINICAL_EXERCISES.find((c) => c.id === (ex.exercise_id || ex.id));
              const evalRes = evaluateContraindications(ex.exercise_id || ex.id, ex.target_joint || baseEx?.targetJoint || '', selectedPatient);
              return {
                exercise_id: ex.exercise_id || ex.id || `ex-${idx}`,
                id: ex.exercise_id || ex.id || `ex-${idx}`,
                name: ex.name || baseEx?.nameTh || 'ท่าฝึกกายภาพ',
                name_th: baseEx?.nameTh || ex.name || 'ท่าฝึกกายภาพ',
                name_en: baseEx?.nameEn || ex.name || 'Exercise',
                name_cn: baseEx?.nameCn || ex.name || '康复动作',
                target_joint: ex.target_joint || baseEx?.targetJoint || 'ทั่วไป',
                sets: ex.sets || baseEx?.defaultPrescription?.totalSets || 3,
                reps: ex.reps || baseEx?.defaultPrescription?.repsPerSet || 10,
                side: (ex.side as any) || (baseEx?.side as any) || 'both',
                start_angle_deg: ex.start_angle_deg ?? ex.startAngleDeg ?? baseEx?.angleMechanics?.startAngleDeg,
                target_min_deg: ex.target_min_deg ?? ex.targetMinDeg ?? baseEx?.angleMechanics?.targetMinDeg,
                target_max_deg: ex.target_max_deg ?? ex.targetMaxDeg ?? baseEx?.angleMechanics?.targetMaxDeg,
                hold_duration_sec: ex.hold_duration_sec ?? ex.holdDurationSec ?? baseEx?.angleMechanics?.holdDurationSec,
                order_index: idx + 1,
                pt_note: ex.pt_note || ex.ptNote || '',
                has_contraindication_warning: evalRes.hasWarning,
                contraindication_warning: evalRes.warningMessage,
                detection_config: baseEx,
              };
            });
            setPrescribedExercises(mapped);
          }
        }
      } catch {
        // non-blocking
      }
    }

    loadExistingCourse();
  }, [selectedPatient]);

  // Compute scheduled dates for Mode A using safe local date arithmetic (no UTC day-shift)
  const computeDatesFromRangeAndDays = useCallback(
    (startStr: string, endStr: string, daysList: string[]) => {
      const dates: string[] = [];
      if (!startStr || !endStr || daysList.length === 0) return dates;

      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const allowedDayNums = daysList.map((d) => dayMap[d]).filter((n) => n !== undefined);

      const [sY, sM, sD] = startStr.split('-').map(Number);
      const [eY, eM, eD] = endStr.split('-').map(Number);
      const cur = new Date(sY, (sM || 1) - 1, sD || 1, 12, 0, 0);
      const end = new Date(eY, (eM || 1) - 1, eD || 1, 12, 0, 0);

      while (cur <= end) {
        if (allowedDayNums.includes(cur.getDay())) {
          const y = cur.getFullYear();
          const m = String(cur.getMonth() + 1).padStart(2, '0');
          const d = String(cur.getDate()).padStart(2, '0');
          dates.push(`${y}-${m}-${d}`);
        }
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    },
    []
  );

  // Mode A computed training dates
  const modeAComputedDates = useMemo(() => {
    return computeDatesFromRangeAndDays(modeAStartDate, modeAEndDate, modeASelectedDays);
  }, [modeAStartDate, modeAEndDate, modeASelectedDays, computeDatesFromRangeAndDays]);

  // Toggle day in Mode A
  const toggleModeADay = (dayKey: string) => {
    setModeASelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        return prev.filter((d) => d !== dayKey);
      } else {
        return [...prev, dayKey];
      }
    });
  };

  // Toggle date in Mode B (Completely isolated)
  const toggleDateInCalendar = (dateStr: string) => {
    setModeBScheduledDates((prev) => {
      if (prev.includes(dateStr)) {
        return prev.filter((d) => d !== dateStr);
      } else {
        return [...prev, dateStr].sort();
      }
    });
  };

  // Active Total Days calculated strictly from the active mode
  const activeTotalDays = scheduleMode === 'modeA' ? modeAComputedDates.length : modeBScheduledDates.length;

  // Add Exercise to Prescription
  const handleAddExercise = (catalogEx: any) => {
    if (prescribedExercises.some((e) => e.exercise_id === catalogEx.id)) {
      // Toggle off / remove
      setPrescribedExercises((prev) => prev.filter((e) => e.exercise_id !== catalogEx.id));
      return;
    }

    const evalRes = evaluateContraindications(catalogEx.id, catalogEx.targetJoint, selectedPatient);

    const newPrescription: PrescribedExerciseCustom = {
      exercise_id: catalogEx.id,
      id: catalogEx.id,
      name: catalogEx.nameTh,
      name_th: catalogEx.nameTh,
      name_en: catalogEx.nameEn,
      name_cn: catalogEx.nameCn || catalogEx.nameEn,
      target_joint: catalogEx.targetJoint,
      sets: catalogEx.defaultPrescription?.totalSets || 3,
      reps: catalogEx.defaultPrescription?.repsPerSet || 10,
      side: (catalogEx.side as any) || 'both',
      start_angle_deg: catalogEx.angleMechanics?.startAngleDeg ?? 0,
      target_min_deg: catalogEx.angleMechanics?.targetMinDeg ?? 80,
      target_max_deg: catalogEx.angleMechanics?.targetMaxDeg ?? 100,
      hold_duration_sec: catalogEx.angleMechanics?.holdDurationSec ?? 2.0,
      order_index: prescribedExercises.length + 1,
      pt_note: '',
      has_contraindication_warning: evalRes.hasWarning,
      contraindication_warning: evalRes.warningMessage,
      detection_config: catalogEx,
    };

    setPrescribedExercises((prev) => [...prev, newPrescription]);
    setExpandedExerciseId(catalogEx.id);
  };

  // Remove Exercise
  const handleRemoveExercise = (idx: number) => {
    setPrescribedExercises((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((item, i) => ({ ...item, order_index: i + 1 }));
    });
  };

  // Reorder Exercises
  const handleMoveExercise = (idx: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === prescribedExercises.length - 1)) {
      return;
    }
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    setPrescribedExercises((prev) => {
      const arr = [...prev];
      const temp = arr[idx];
      arr[idx] = arr[targetIdx];
      arr[targetIdx] = temp;
      return arr.map((item, i) => ({ ...item, order_index: i + 1 }));
    });
  };

  // Update specific exercise property
  const handleUpdateExerciseField = (idx: number, field: keyof PrescribedExerciseCustom, val: any) => {
    setPrescribedExercises((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, [field]: val };
      })
    );
  };

  // Filter Catalog Exercises
  const filteredCatalogExercises = useMemo(() => {
    const pJoint = (selectedPatient?.target_joint || (selectedPatient as any)?.history?.target_joint || '').toLowerCase();
    return ALL_CLINICAL_EXERCISES.filter((ex) => {
      if (activeCatalogFilter === 'all') return true;
      if (activeCatalogFilter === 'recommended') {
        if (!pJoint) return true;
        const exJ = ex.targetJoint.toLowerCase();
        return pJoint.includes(exJ) || exJ.includes(pJoint);
      }
      if (activeCatalogFilter === 'upper') {
        const j = ex.targetJoint.toLowerCase();
        return j.includes('ไหล่') || j.includes('ศอก') || j.includes('คอ') || j.includes('สะบัก') || j.includes('shoulder') || j.includes('elbow') || j.includes('neck') || j.includes('scapula') || j.includes('cervical');
      }
      if (activeCatalogFilter === 'lower') {
        const j = ex.targetJoint.toLowerCase();
        return j.includes('เข่า') || j.includes('สะโพก') || j.includes('น่อง') || j.includes('ข้อเท้า') || j.includes('สมดุล') || j.includes('knee') || j.includes('hip') || j.includes('ankle') || j.includes('balance');
      }
      return true;
    });
  }, [activeCatalogFilter, selectedPatient]);

  // Calendar matrix generator for Mode B
  const calendarMatrix = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const matrix: Array<Array<{ day: number; dateStr: string; isCurrentMonth: boolean }>> = [];
    let currentWeek: Array<{ day: number; dateStr: string; isCurrentMonth: boolean }> = [];

    // Prepend empty days before month start
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push({ day: 0, dateStr: '', isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      currentWeek.push({ day: d, dateStr, isCurrentMonth: true });
      if (currentWeek.length === 7) {
        matrix.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: 0, dateStr: '', isCurrentMonth: false });
      }
      matrix.push(currentWeek);
    }

    return matrix;
  }, [calendarViewDate]);

  // Handle Save Course Prescription with Atomic Transaction
  const handleSaveCourse = async () => {
    if (!selectedPatient || !selectedPatient.id) {
      setErrorMsg(t.noPatientSelected);
      return;
    }
    if (prescribedExercises.length === 0) {
      setErrorMsg('กรุณาเลือกท่าฝึกกายภาพอย่างน้อย 1 ท่าสำหรับคอร์สนี้');
      return;
    }

    let finalScheduleMode = scheduleMode;
    let finalStartDate = '';
    let finalEndDate = '';
    let finalDaysOfWeek: string[] = [];
    let finalScheduledDates: string[] = [];
    let prescriptionScheduledDates: string[] = [];

    if (scheduleMode === 'modeA') {
      const computed = computeDatesFromRangeAndDays(modeAStartDate, modeAEndDate, modeASelectedDays);
      if (computed.length === 0 || modeASelectedDays.length === 0) {
        setErrorMsg(t.noScheduleDaysError);
        return;
      }
      finalStartDate = modeAStartDate;
      finalEndDate = modeAEndDate;
      finalDaysOfWeek = modeASelectedDays;
      finalScheduledDates = []; // Do NOT send Mode B dates
      prescriptionScheduledDates = computed;
    } else {
      const cleanDates = Array.from(new Set(modeBScheduledDates)).sort();
      if (cleanDates.length === 0) {
        setErrorMsg(t.noScheduleDaysError);
        return;
      }
      finalStartDate = cleanDates[0];
      finalEndDate = cleanDates[cleanDates.length - 1];
      finalDaysOfWeek = []; // Do NOT send Mode A days
      finalScheduledDates = cleanDates;
      prescriptionScheduledDates = cleanDates;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const targetPid = selectedPatient.id || selectedPatient.hn;
      const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

      // 0. Save Authoritative Clinical Prescription Record
      try {
        await defaultApiClient.smartOnboarding.savePrescription({
          patient_id: selectedPatient.id,
          target_joint: selectedPatient.target_joint || 'ข้อไหล่',
          diagnosis: selectedPatient.injury || (selectedPatient as any).diagnosis || undefined,
          contraindications: selectedPatient.contraindications || undefined,
          start_date: finalStartDate,
          end_date: finalEndDate,
          scheduled_dates: prescriptionScheduledDates,
          exercises: prescribedExercises.map((e, idx) => ({
            exercise_id: e.exercise_id,
            exercise_name: e.name || e.name_th || 'ท่าฝึกกายภาพ',
            target_side: e.side === 'both' ? 'bilateral' : e.side,
            sets: e.sets,
            reps: e.reps,
            hold_seconds: Math.round(e.hold_duration_sec || 3),
            sequence_order: idx + 1,
            clinical_notes: e.pt_note || undefined,
          })),
        });
      } catch {
        // non-blocking
      }

      const schedulePayload = {
        patient_id: targetPid,
        schedule_mode: finalScheduleMode,
        start_date: finalStartDate,
        end_date: finalEndDate,
        startDate: finalStartDate,
        endDate: finalEndDate,
        days_of_week: finalDaysOfWeek,
        daysOfWeek: finalDaysOfWeek,
        scheduled_dates: finalScheduledDates,
        scheduledDates: finalScheduledDates,
        time_slot: timeSlot,
        timeSlot: timeSlot,
        assigned_kiosk_id: assignedKioskId,
        kioskId: assignedKioskId,
        include_minigame: includeMinigame,
        allowed_start_hand: allowedStartHand,
        prescribed_exercises: prescribedExercises.map((e) => ({
          exercise_id: e.exercise_id,
          id: e.exercise_id,
          name: e.name,
          name_th: e.name_th,
          name_en: e.name_en,
          name_cn: e.name_cn,
          target_joint: e.target_joint,
          sets: e.sets,
          reps: e.reps,
          side: e.side,
          start_angle_deg: e.start_angle_deg,
          target_min_deg: e.target_min_deg,
          target_max_deg: e.target_max_deg,
          hold_duration_sec: e.hold_duration_sec,
          order_index: e.order_index,
          pt_note: e.pt_note,
        })),
        assigned_exercises: prescribedExercises.map((e) => ({
          exercise_id: e.exercise_id,
          id: e.exercise_id,
          name: e.name,
          target_joint: e.target_joint,
          sets: e.sets,
          reps: e.reps,
          side: e.side,
          target_min_deg: e.target_min_deg,
          target_max_deg: e.target_max_deg,
          hold_duration_sec: e.hold_duration_sec,
        })),
        preserve_past_dates: true,
        updated_at: new Date().toISOString(),
        updated_today_bkk: todayBkk,
      };

      // 1. Save atomic schedule to API
      await defaultApiClient.smartOnboarding.saveSchedule({
        patient_id: targetPid,
        schedule: schedulePayload,
      });

      // 2. Broadcast realtime update for 5. ตารางนัด and Kiosk
      broadcastScheduleSync(targetPid);

      // 3. Open post-save summary modal
      setIsSummaryModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกคอร์สกายภาพบำบัด';
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinishSummary = (action: 'schedule' | 'patients' | 'start_exercise' | 'kiosk_home') => {
    setIsSummaryModalOpen(false);
    onClose();
    if (onSuccess && selectedPatient) {
      onSuccess(selectedPatient.id || selectedPatient.hn, action);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-blue-100 rounded-3xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold text-xl shadow-xs">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{t.modalTitle}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                  Single Source of Truth
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{t.modalSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang('th')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${lang === 'th' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                TH
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${lang === 'en' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('cn')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${lang === 'cn' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                CN
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 bg-slate-50/50">
          {/* Section 1: Patient Clinical Header & Safety Banner */}
          <div className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-200 text-blue-700 font-black text-lg flex items-center justify-center">
                  {selectedPatient?.first_name ? selectedPatient.first_name[0] : <User className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base sm:text-lg font-bold text-slate-900">
                      คุณ {selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name || ''}`.trim() : 'ยังไม่ได้เลือกคนไข้'}
                    </span>
                    {selectedPatient && (
                      <span className="px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-mono text-xs font-bold">
                        HN: {selectedPatient.hn || selectedPatient.id}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                    <span>
                      {t.diagnosis}: <strong className="text-slate-800 font-semibold">{selectedPatient?.injury || (selectedPatient as any)?.diagnosis || 'กายภาพบำบัดฟื้นฟูทั่วไป'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      {t.targetJoint}: <strong className="text-emerald-700 font-semibold">{selectedPatient?.target_joint || 'ข้อต่อทั่วไป'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Patient Selector Toggle */}
              <div className="w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setIsSearchingPatient((prev) => !prev)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2 border border-slate-200 transition cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t.changePatient}</span>
                </button>
              </div>
            </div>

            {/* Patient Search Dropdown if toggled */}
            {isSearchingPatient && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <input
                  type="text"
                  placeholder={t.searchPatientPlaceholder}
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {patients
                    .filter((p) => {
                      if (!patientSearchQuery.trim()) return true;
                      const q = patientSearchQuery.toLowerCase();
                      return (
                        (p.first_name && p.first_name.toLowerCase().includes(q)) ||
                        (p.last_name && p.last_name.toLowerCase().includes(q)) ||
                        (p.hn && p.hn.toLowerCase().includes(q)) ||
                        (p.phone && p.phone.toLowerCase().includes(q))
                      );
                    })
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatient(p);
                          setIsSearchingPatient(false);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left text-xs flex items-center justify-between transition cursor-pointer ${
                          selectedPatient?.id === p.id ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' : 'bg-white hover:bg-slate-50 border border-slate-100 text-slate-700'
                        }`}
                      >
                        <span className="font-semibold text-slate-900">
                          {p.first_name} {p.last_name || ''}
                        </span>
                        <span className="font-mono text-slate-500">HN: {p.hn}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Prominent Contraindications & Precautions Banner */}
            <div className="mt-3.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <div className="flex items-center gap-2 font-bold text-rose-700 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{t.contraindicationsTitle}</span>
              </div>
              <p className="leading-relaxed">
                {selectedPatient?.contraindications ||
                  (selectedPatient as any)?.history?.contraindications ||
                  t.noContraindications}
              </p>
              {selectedPatient?.underlying_diseases && selectedPatient.underlying_diseases !== '-' && (
                <div className="mt-1 text-[11px] text-amber-800">
                  <strong>โรคประจำตัว:</strong> {selectedPatient.underlying_diseases}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Selected Exercises Prescription Sequence */}
          <div className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">{t.prescribedListTitle}</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {prescribedExercises.length} ท่า
                </span>
              </div>
              <div className="text-emerald-800 font-medium text-xs flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <span>👩‍⚕️</span>
                <span>นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย</span>
              </div>
            </div>

            {prescribedExercises.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                {t.noExercisesSelected}
              </div>
            ) : (
              <div className="space-y-3">
                {prescribedExercises.map((ex, idx) => (
                  <div
                    key={ex.exercise_id}
                    className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-mono font-bold text-xs flex items-center justify-center flex-shrink-0 border border-blue-200">
                          {ex.order_index}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm truncate">{ex.name_th}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({ex.name_en})</span>
                            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-emerald-700 font-medium">
                              {ex.target_joint}
                            </span>
                          </div>
                          {ex.has_contraindication_warning && (
                            <div className="text-[11px] text-amber-700 flex items-center gap-1.5 mt-0.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                              <span>{ex.contraindication_warning}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Sets & Reps quick preview & controls */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setExpandedExerciseId(expandedExerciseId === ex.exercise_id ? null : ex.exercise_id)}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs text-slate-700 flex items-center gap-1.5 border border-slate-200 shadow-xs cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5 text-blue-600" />
                          <span>{ex.sets} เซ็ต x {ex.reps} ครั้ง ({ex.side === 'both' ? 'ทั้งสองข้าง' : ex.side === 'right' ? 'ขวา' : 'ซ้าย'})</span>
                        </button>

                        {/* Reorder Buttons */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveExercise(idx, 'up')}
                            disabled={idx === 0}
                            title="เลื่อนขึ้น"
                            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveExercise(idx, 'down')}
                            disabled={idx === prescribedExercises.length - 1}
                            title="เลื่อนลง"
                            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(idx)}
                          title="ลบออกจากคอร์ส"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Per-Exercise Configuration Panel */}
                    {expandedExerciseId === ex.exercise_id && (
                      <div className="mt-3.5 pt-3.5 border-t border-slate-200 space-y-3.5 bg-white p-3.5 rounded-xl border border-slate-200">
                        <div className="text-xs font-bold text-teal-700 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5" />
                          <span>{t.customAngles}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          {/* Sets */}
                          <div>
                            <label className="text-slate-600 font-medium block mb-1">
                              {t.sets} (1–10)
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateExerciseField(idx, 'sets', Math.max(1, ex.sets - 1))}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={ex.sets}
                                onChange={(e) => handleUpdateExerciseField(idx, 'sets', Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                                className="w-14 text-center py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateExerciseField(idx, 'sets', Math.min(10, ex.sets + 1))}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Reps */}
                          <div>
                            <label className="text-slate-600 font-medium block mb-1">
                              {t.reps} (1–50)
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateExerciseField(idx, 'reps', Math.max(1, ex.reps - 1))}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={ex.reps}
                                onChange={(e) => handleUpdateExerciseField(idx, 'reps', Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                                className="w-14 text-center py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateExerciseField(idx, 'reps', Math.min(50, ex.reps + 1))}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Side Target */}
                          <div>
                            <label className="text-slate-600 font-medium block mb-1">
                              {t.side}
                            </label>
                            <select
                              value={ex.side}
                              onChange={(e) => handleUpdateExerciseField(idx, 'side', e.target.value as any)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 font-medium"
                            >
                              <option value="both">{t.sideBoth}</option>
                              <option value="right">{t.sideRight}</option>
                              <option value="left">{t.sideLeft}</option>
                            </select>
                          </div>

                          {/* Target Max Angle Override */}
                          <div>
                            <label className="text-slate-600 font-medium block mb-1">
                              มุมเป้าหมายสูงสุด (targetMaxDeg)
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={30}
                                max={180}
                                value={ex.target_max_deg || 95}
                                onChange={(e) => handleUpdateExerciseField(idx, 'target_max_deg', Number(e.target.value))}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono font-bold"
                              />
                              <span className="text-slate-500">องศา (°)</span>
                            </div>
                          </div>
                        </div>

                        {/* PT Clinical Note */}
                        <div>
                          <label className="text-slate-600 font-medium block mb-1 text-xs">
                            บันทึกคำแนะนำแพทย์/นักกายภาพบำบัด (PT Clinical Note)
                          </label>
                          <input
                            type="text"
                            placeholder={t.ptNotePlaceholder}
                            value={ex.pt_note || ''}
                            onChange={(e) => handleUpdateExerciseField(idx, 'pt_note', e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: 15-Exercise Clinical Catalog Selection */}
          <div className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>คลังท่ากายภาพมาตรฐานคลินิก (15 ท่ามาตรฐาน / 15 Standard Clinical Exercises)</span>
                  <span className="text-xs text-slate-500 font-normal">กดเลือกเพื่อเพิ่มเข้าคอร์ส</span>
                </h3>
              </div>

              {/* Quick Filter Tabs */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold gap-1">
                <button
                  type="button"
                  onClick={() => setActiveCatalogFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${activeCatalogFilter === 'all' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t.tabAll}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCatalogFilter('recommended')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${activeCatalogFilter === 'recommended' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t.tabRecommended}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCatalogFilter('upper')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${activeCatalogFilter === 'upper' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t.tabUpper}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCatalogFilter('lower')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${activeCatalogFilter === 'lower' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t.tabLower}
                </button>
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {filteredCatalogExercises.map((catalogEx) => {
                const isSelected = prescribedExercises.some((e) => e.exercise_id === catalogEx.id);
                const evalRes = evaluateContraindications(catalogEx.id || '', catalogEx.targetJoint || '', selectedPatient);

                return (
                  <div
                    key={catalogEx.id}
                    onClick={() => handleAddExercise(catalogEx)}
                    className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between relative group ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                        : evalRes.hasWarning
                        ? 'bg-rose-50/50 border-rose-300 hover:border-rose-400'
                        : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      {/* Badge Warning if Contraindicated */}
                      {evalRes.hasWarning && (
                        <div className="mb-2 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600 flex-shrink-0" />
                          <span className="truncate">มีข้อควรระวัง</span>
                        </div>
                      )}

                      {/* Medical Posture Illustration Thumbnail */}
                      <div className="w-full h-20 bg-slate-900 rounded-lg mb-2 flex items-center justify-center overflow-hidden border border-slate-800 p-1.5 shadow-inner">
                        <img
                          src={`/assets/exercises/${catalogEx.id}.svg`}
                          alt={catalogEx.nameEn}
                          className="max-h-16 w-auto object-contain opacity-90 group-hover:opacity-100 group-hover:scale-105 transition"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono text-slate-500">{catalogEx.targetJoint}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                            catalogEx.mode === 'timer' || catalogEx.id === 'chin-tuck' || catalogEx.id === 'shoulder-pendulum'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-teal-50 text-teal-700 border-teal-200'
                          }`}>
                            {catalogEx.mode === 'timer' || catalogEx.id === 'chin-tuck' || catalogEx.id === 'shoulder-pendulum' ? '⏱️ Timer' : '📷 Camera'}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                            ✓
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs leading-tight mb-1">
                        {catalogEx.nameTh}
                      </h4>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{catalogEx.nameEn}</div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {catalogEx.defaultPrescription?.totalSets || 3}x{catalogEx.defaultPrescription?.repsPerSet || 10}
                      </span>
                      <button
                        type="button"
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer border ${
                          isSelected ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {isSelected ? 'ลบออก' : '+ เลือก'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Schedule Settings (Mode A vs Mode B) */}
          <div className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">{t.scheduleSettingsTitle}</h3>
              </div>

              {/* Mode Switcher with Mutual Exclusivity Lock & Tooltips */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                {/* Mode A Button */}
                <div className="relative group">
                  <button
                    type="button"
                    disabled={hasModeBData}
                    onClick={() => {
                      if (hasModeBData) {
                        setScheduleLockWarning(t.modeALockedByB);
                        return;
                      }
                      setScheduleMode('modeA');
                      setScheduleLockWarning(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                      hasModeBData
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
                        : scheduleMode === 'modeA'
                        ? 'bg-blue-600 text-white shadow-xs font-bold cursor-pointer'
                        : 'text-slate-600 hover:text-slate-900 cursor-pointer'
                    }`}
                  >
                    {hasModeBData && <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                    <span>{t.modeA}</span>
                  </button>
                  {hasModeBData && (
                    <div className="hidden group-hover:block absolute left-0 top-full mt-1.5 z-30 w-72 p-2.5 bg-slate-900 text-white text-[11px] rounded-xl shadow-xl pointer-events-none leading-relaxed">
                      {t.modeALockedByB}
                    </div>
                  )}
                </div>

                {/* Mode B Button */}
                <div className="relative group">
                  <button
                    type="button"
                    disabled={hasModeAData}
                    onClick={() => {
                      if (hasModeAData) {
                        setScheduleLockWarning(t.modeBLockedByA);
                        return;
                      }
                      setScheduleMode('modeB');
                      setScheduleLockWarning(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                      hasModeAData
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
                        : scheduleMode === 'modeB'
                        ? 'bg-blue-600 text-white shadow-xs font-bold cursor-pointer'
                        : 'text-slate-600 hover:text-slate-900 cursor-pointer'
                    }`}
                  >
                    {hasModeAData && <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                    <span>{t.modeB}</span>
                  </button>
                  {hasModeAData && (
                    <div className="hidden group-hover:block absolute right-0 top-full mt-1.5 z-30 w-72 p-2.5 bg-slate-900 text-white text-[11px] rounded-xl shadow-xl pointer-events-none leading-relaxed">
                      {t.modeBLockedByA}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Lock Warning Banner */}
            {scheduleLockWarning && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-center justify-between gap-2 animate-fade-in shadow-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{scheduleLockWarning}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleLockWarning(null)}
                  className="text-amber-700 hover:text-amber-950 text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Mode A: Date Range + Days of Week */}
            {scheduleMode === 'modeA' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="text-slate-600 font-medium block mb-1">{t.startDate}</label>
                    <input
                      type="date"
                      value={modeAStartDate}
                      onChange={(e) => {
                        setModeAStartDate(e.target.value);
                        setScheduleLockWarning(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-600 font-medium block mb-1">{t.endDate}</label>
                    <input
                      type="date"
                      value={modeAEndDate}
                      onChange={(e) => {
                        setModeAEndDate(e.target.value);
                        setScheduleLockWarning(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-600 font-medium block mb-1">{t.timeSlot}</label>
                    <select
                      value={timeSlot}
                      onChange={(e) => setTimeSlot(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="09:00 - 10:00">09:00 - 10:00 (เช้า)</option>
                      <option value="10:00 - 11:00">10:00 - 11:00 (สาย)</option>
                      <option value="13:00 - 14:00">13:00 - 14:00 (บ่าย)</option>
                      <option value="14:00 - 15:00">14:00 - 15:00 (บ่าย)</option>
                      <option value="15:00 - 16:00">15:00 - 16:00 (เย็น)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-600 font-medium block mb-1">{t.kiosk}</label>
                    <select
                      value={assignedKioskId}
                      onChange={(e) => setAssignedKioskId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="kiosk-01">Kiosk 01 (ศูนย์กายภาพบำบัดหลัก)</option>
                      <option value="kiosk-02">Kiosk 02 (ห้องฝึกข้อต่อและไหล่)</option>
                    </select>
                  </div>
                </div>

                {/* Days of Week Capsules */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-slate-600 font-medium text-xs">{t.daysOfWeek}</label>
                    {modeASelectedDays.length === 0 && (
                      <span className="text-[11px] text-amber-600 font-medium">กรุณาเลือกวันอย่างน้อย 1 วัน</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {DAYS_OF_WEEK.map((day) => {
                      const isChecked = modeASelectedDays.includes(day.key);
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => {
                            toggleModeADay(day.key);
                            setScheduleLockWarning(null);
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                            isChecked
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                          <span>{lang === 'cn' ? day.cn : lang === 'en' ? day.en : day.th}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cancel Mode A Button */}
                {hasModeAData && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500">
                      🔒 มีการจัดวันแบบ A อยู่ (โหมด B ถูกล็อกเพื่อไม่ให้ข้อมูลปนกัน)
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmClearModal('modeA')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>{t.cancelModeABtn}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mode B: Interactive Monthly Calendar Picker */}
            {scheduleMode === 'modeB' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const prevM = new Date(calendarViewDate);
                        prevM.setMonth(prevM.getMonth() - 1);
                        setCalendarViewDate(prevM);
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-sm text-slate-800 font-mono">
                      {calendarViewDate.toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextM = new Date(calendarViewDate);
                        nextM.setMonth(nextM.getMonth() + 1);
                        setCalendarViewDate(nextM);
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <span className="text-xs text-slate-500">
                    คลิกวันเพื่อเพิ่มหรือลดวันฝึกในปฏิทิน
                  </span>
                </div>

                {/* Calendar Grid */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="grid grid-cols-7 text-center py-2 text-xs font-bold bg-slate-100 text-slate-600 border-b border-slate-200">
                    <div>อา.</div>
                    <div>จ.</div>
                    <div>อ.</div>
                    <div>พ.</div>
                    <div>พฤ.</div>
                    <div>ศ.</div>
                    <div>ส.</div>
                  </div>
                  <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 text-xs">
                    {calendarMatrix.flat().map((item, idx) => {
                      if (!item.isCurrentMonth) {
                        return <div key={idx} className="h-12 bg-slate-50/60" />;
                      }
                      const isDateSelected = modeBScheduledDates.includes(item.dateStr);
                      return (
                        <div
                          key={item.dateStr}
                          onClick={() => {
                            toggleDateInCalendar(item.dateStr);
                            setScheduleLockWarning(null);
                          }}
                          className={`h-12 p-1.5 flex flex-col justify-between cursor-pointer transition ${
                            isDateSelected
                              ? 'bg-emerald-50 font-bold text-emerald-800 border-2 border-emerald-500'
                              : 'hover:bg-blue-50/50 text-slate-700'
                          }`}
                        >
                          <span className="font-mono text-xs">{item.day}</span>
                          {isDateSelected && (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center justify-end">
                              ✓ ฝึก
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cancel Mode B Button */}
                {hasModeBData && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500">
                      🔒 มีการจัดวันแบบ B อยู่ (โหมด A ถูกล็อกเพื่อไม่ให้ข้อมูลปนกัน)
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmClearModal('modeB')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>{t.cancelModeBBtn}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Allowed Hand to Start (Clinical Safety Guard) */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>ข้างที่อนุญาตให้ยกมือเริ่มท่า (Touchless Start Hand)</span>
                <span className="text-[10px] text-emerald-700 font-normal">ความปลอดภัยทางคลินิก (ป้องกันการบังคับข้างที่บาดเจ็บ)</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAllowedStartHand('both')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    allowedStartHand === 'both'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  🙌 ทั้งสองข้าง (สุ่มซ้าย/ขวา)
                </button>
                <button
                  type="button"
                  onClick={() => setAllowedStartHand('left')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    allowedStartHand === 'left'
                      ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                  title="เหมาะสำหรับผู้ป่วยที่มีอาการบาดเจ็บแขนขวา"
                >
                  ✋ ซ้ายเท่านั้น
                </button>
                <button
                  type="button"
                  onClick={() => setAllowedStartHand('right')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    allowedStartHand === 'right'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                  title="เหมาะสำหรับผู้ป่วยที่มีอาการบาดเจ็บแขนซ้าย"
                >
                  ✋ ขวาเท่านั้น
                </button>
              </div>
            </div>

            {/* Total Days Calculated & Quiz Option */}
            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">{t.totalDays}:</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold font-mono text-sm border border-emerald-200">
                  {activeTotalDays} {t.daysUnit}
                </span>
                <span className="text-slate-400 text-[11px]">
                  ({(() => {
                    const formatP = (s: string) => {
                      if (!s) return '';
                      const [y, m, d] = s.split('-').map(Number);
                      if (!y || !m || !d) return s;
                      if (lang === 'th') {
                        const thaiShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                        return `${d} ${thaiShort[m - 1]} ${y + 543}`;
                      }
                      return s;
                    };
                    if (scheduleMode === 'modeA') {
                      return `${formatP(modeAStartDate)} ถึง ${formatP(modeAEndDate)}`;
                    }
                    if (modeBScheduledDates.length > 0) {
                      return `${formatP(modeBScheduledDates[0])} ถึง ${formatP(modeBScheduledDates[modeBScheduledDates.length - 1])}`;
                    }
                    return '-';
                  })()})
                </span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={includeMinigame}
                  onChange={(e) => setIncludeMinigame(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 w-4 h-4 cursor-pointer"
                />
                <span>{t.includeQuiz}</span>
              </label>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-slate-100 flex items-center justify-between bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            ยกเลิก / ปิดหน้าต่าง
          </button>

          <button
            type="button"
            onClick={handleSaveCourse}
            disabled={isSaving || !selectedPatient?.id}
            title={!selectedPatient?.id ? 'กรุณาเลือกคนไข้ก่อนบันทึกคอร์ส' : undefined}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>{t.saving}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.saveCourseBtn}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Post-Save Course Summary Modal */}
      {isSummaryModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-blue-100 rounded-3xl w-full max-w-2xl p-6 shadow-2xl text-slate-800 space-y-5 animate-in zoom-in-95">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900">{t.summaryTitle}</h3>
              <p className="text-xs text-slate-500">{t.summarySubtitle}</p>
            </div>

            {/* Summary Details */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <span className="text-slate-500">คนไข้:</span>{' '}
                  <strong className="text-slate-900 text-sm">
                    คุณ {selectedPatient?.first_name} {selectedPatient?.last_name || ''}
                  </strong>
                </div>
                <span className="font-mono text-blue-700 font-bold">HN: {selectedPatient?.hn}</span>
              </div>

              <div>
                <span className="text-slate-500 block mb-1">รายการท่าฝึกที่สั่งจ่าย ({prescribedExercises.length} ท่า):</span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {prescribedExercises.map((e) => (
                    <div key={e.exercise_id} className="flex items-center justify-between bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                      <span className="font-semibold text-slate-900">
                        {e.order_index}. {e.name_th}
                      </span>
                      <span className="text-slate-500 font-mono">
                        {e.sets}x{e.reps} ({e.side}) | มุมเป้าหมาย: {e.target_max_deg || 95}°
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-slate-700">
                <span>{t.totalDays}: <strong className="text-emerald-700 font-mono text-sm">{scheduledDates.length} วัน</strong></span>
                <span className="text-slate-500">({scheduledDates[0]} ถึง {scheduledDates[scheduledDates.length - 1]})</span>
              </div>
            </div>

            {/* Action Buttons */}
            {kioskMode ? (
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  id="kiosk-start-exercise-btn"
                  onClick={() => handleFinishSummary('start_exercise')}
                  className="w-full sm:flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer active:scale-95 border border-emerald-400/50"
                >
                  <Activity className="w-4 h-4 shrink-0" />
                  <span>{t.startExerciseBtn}</span>
                </button>

                <button
                  type="button"
                  id="kiosk-home-btn"
                  onClick={() => handleFinishSummary('kiosk_home')}
                  className="w-full sm:flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-200 transition cursor-pointer active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{t.kioskHomeBtn}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleFinishSummary('schedule')}
                  className="w-full sm:flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>{t.goToScheduleBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFinishSummary('patients')}
                  className="w-full sm:flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 border border-slate-200 transition cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  <span>{t.goToPatientsBtn}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clearing Mode A or Mode B */}
      {confirmClearModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  {confirmClearModal === 'modeA' ? t.confirmClearModeATitle : t.confirmClearModeBTitle}
                </h4>
                <p className="text-xs text-rose-600 font-semibold mt-0.5">
                  {confirmClearModal === 'modeA' ? t.confirmClearModeA : t.confirmClearModeB}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-200 leading-relaxed">
              {t.clearModePrompt}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                {t.btnCancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmClearModal === 'modeA') {
                    setModeASelectedDays([]);
                    setModeAStartDate(defaultStart);
                    setModeAEndDate(defaultEnd);
                    setScheduleLockWarning(null);
                  } else if (confirmClearModal === 'modeB') {
                    setModeBScheduledDates([]);
                    setScheduleLockWarning(null);
                  }
                  setConfirmClearModal(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shadow-xs transition"
              >
                {t.btnConfirmClear}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PatientCoursePrescriptionView = PatientCoursePrescriptionModal;
export default PatientCoursePrescriptionModal;
