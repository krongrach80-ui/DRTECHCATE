/**
 * packages/clinical-i18n/src/index.ts
 *
 * CLINICAL TRILINGUAL i18n & LOCALIZATION ENGINE
 *
 * Supported Locales:
 * - 'zh-CN': Simplified Chinese (Mainland China Hospital & PIPL Standard)
 * - 'th-TH': Thai (Standard Clinical Rehabilitation)
 * - 'en-US': English (International HL7 FHIR & SaMD Class II Standard)
 */

import { useState, useEffect, useCallback } from 'react';


export type ClinicalLanguage = 'zh-CN' | 'th-TH' | 'en-US';

export interface LanguageOption {
  code: ClinicalLanguage;
  label: string;
  shortLabel: string;
  flag: string;
  speechLocale: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'zh-CN', label: '🇨🇳 中文 (简体)', shortLabel: '中文', flag: '🇨🇳', speechLocale: 'zh-CN' },
  { code: 'th-TH', label: '🇹🇭 ไทย', shortLabel: 'ไทย', flag: '🇹🇭', speechLocale: 'th-TH' },
  { code: 'en-US', label: '🇬🇧 English', shortLabel: 'EN', flag: '🇬🇧', speechLocale: 'en-US' },
];

const STORAGE_KEY = 'drtech_lang';
let inMemoryLang: ClinicalLanguage = 'th-TH';

export function getSavedLanguage(): ClinicalLanguage {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ClinicalLanguage;
      if (saved === 'zh-CN' || saved === 'th-TH' || saved === 'en-US') {
        return saved;
      }
    } catch {
      // safe fallback
    }
  }
  return inMemoryLang;
}

export function setSavedLanguage(lang: ClinicalLanguage): void {
  inMemoryLang = lang;
  if (typeof window !== 'undefined') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, lang);
      }
      window.dispatchEvent(new CustomEvent('drtech:lang_change', { detail: lang }));
    } catch {
      // safe fallback
    }
  }
}


/**
 * Standard Clinical Medical Lexicon
 */
export const CLINICAL_DICTIONARY = {
  // Biomechanical & Kinematic Terms
  rom: {
    'zh-CN': '关节活动度 (ROM)',
    'th-TH': 'ช่วงการเคลื่อนไหวของข้อต่อ (ROM)',
    'en-US': 'Range of Motion (ROM)',
  },
  scapular_hiking: {
    'zh-CN': '肩胛骨代偿性上提 (耸肩代偿)',
    'th-TH': 'การยกตัวชดเชยของกระดูกสะบัก (Scapular Hiking)',
    'en-US': 'Scapular Hiking Compensation',
  },
  trunk_lateral_tilt: {
    'zh-CN': '躯干侧倾代偿',
    'th-TH': 'การเอียงลำตัวชดเชย (Trunk Lateral Tilt)',
    'en-US': 'Trunk Lateral Tilt Compensation',
  },
  angular_jerk_anomaly: {
    'zh-CN': '关节角加加速度突变 (疼痛触发点)',
    'th-TH': 'จุดกระตุกของมุมข้อต่อ (Angular Jerk Spike)',
    'en-US': 'Angular Jerk Anomaly (Pain Spike)',
  },
  '3d_kinematic_replay': {
    'zh-CN': '3D 生物力学运动全息回放',
    'th-TH': 'โครงร่างชีวกลศาสตร์ 3 มิติ (3D Kinematic Holographic Replay)',
    'en-US': '3D Kinematic Holographic Replay',
  },
  stopped_pain: {
    'zh-CN': '🚨 感到疼痛 (立即停止并通知治疗师)',
    'th-TH': '🚨 รู้สึกเจ็บ (หยุดฉุกเฉินและแจ้งนักกายภาพ)',
    'en-US': '🚨 Pain Reported (Emergency Stop & Notify PT)',
  },
  clinical_report_title: {
    'zh-CN': '数字化运动康复临床评估报告 (ICD-10 / LOINC)',
    'th-TH': 'เวชระเบียนประเมินการฟื้นฟูชีวกลศาสตร์คลินิก (ICD-10 / LOINC)',
    'en-US': 'Digital Rehabilitation Clinical Assessment Report (ICD-10 / LOINC)',
  },
  dashboard_title: {
    'zh-CN': '生物力学与长期康复轨迹控制台',
    'th-TH': 'แดชบอร์ดชีวกลศาสตร์และการฟื้นฟูระยะยาว',
    'en-US': 'Biomechanical Trajectory & Long-Term Recovery Dashboard',
  },

  // Compliance & Data Sovereignty Badges
  pipl_compliance: {
    'zh-CN': '符合中国《个人信息保护法》(PIPL) — 纯三维向量脱敏传输 (零视频留存)',
    'th-TH': 'มาตรฐาน SaMD Class II & HIPAA / PIPL — ถ่ายทอดเวกเตอร์ 3 มิติโดยปราศจากวิดีโอ 100%',
    'en-US': 'SaMD Class II & PIPL Compliant — Pure 3D Vector Zero-Video Transmission',
  },
  pipl_short_badge: {
    'zh-CN': '中国 PIPL 纯向量脱敏认证',
    'th-TH': '100% Vector HIPAA / PIPL',
    'en-US': '100% Vector HIPAA / PIPL',
  },

  // Action Buttons & Controls
  jump_to_anomaly: {
    'zh-CN': '跳转至疼痛触发点 (Jump to Anomaly)',
    'th-TH': 'ข้ามไปยังจังหวะที่เจ็บ (Jump to Anomaly)',
    'en-US': 'Jump to Pain Anomaly Frame',
  },
  reference_calibration: {
    'zh-CN': '🎛️ 校准标准生物力学信号 (Reference Calibration)',
    'th-TH': '🎛️ ปรับเทียบสัญญาณชีวกลศาสตร์มาตรฐาน (Reference Calibration)',
    'en-US': '🎛️ Reference Biomechanical Calibration',
  },
  print_report: {
    'zh-CN': '🖨️ 打印临床报告 (A4 / 另存为 PDF)',
    'th-TH': '🖨️ พิมพ์รายงานแพทย์ (A4 / PDF)',
    'en-US': '🖨️ Print Clinical Report (A4 / Save PDF)',
  },
  open_3d_replay: {
    'zh-CN': '旋转查看 3D 全息回放',
    'th-TH': 'หมุนดู 3D Holographic Replay',
    'en-US': 'Launch 3D Holographic Replay',
  },
  close_window: {
    'zh-CN': '关闭窗口',
    'th-TH': 'ปิดหน้าต่าง',
    'en-US': 'Close Window',
  },
  rotate_360_hint: {
    'zh-CN': '🖱️ 按住鼠标拖动 360° 旋转视角 | 滚轮缩放',
    'th-TH': '🖱️ ลากเมาส์หมุนมุมมอง 360° | หมุนลูกกลิ้งเพื่อซูมเข้า-ออก',
    'en-US': '🖱️ Drag mouse to orbit 360° | Scroll wheel to zoom',
  },

  // Metrics & Headers
  current_target_angle: {
    'zh-CN': '当前角度 / 目标角度',
    'th-TH': 'องศาปัจจุบัน / เป้าหมาย',
    'en-US': 'Current / Target Angle',
  },
  recovery_progress: {
    'zh-CN': '康复进度',
    'th-TH': 'ฟื้นตัวแล้ว',
    'en-US': 'Recovery Progress',
  },
  form_quality_score: {
    'zh-CN': '动作标准度评分',
    'th-TH': 'คะแนนความถูกต้องของฟอร์ม',
    'en-US': 'Form Quality Score',
  },
  joint_stability_index: {
    'zh-CN': '关节平稳度指数 (JSSI)',
    'th-TH': 'ดัชนีความนิ่งของข้อต่อ (JSSI)',
    'en-US': 'Joint Stability Index (JSSI)',
  },
  estimated_recovery: {
    'zh-CN': '预估完全达标日期',
    'th-TH': 'คาดการณ์ฟื้นฟูสมบูรณ์',
    'en-US': 'Estimated Full Recovery',
  },
  patient_name: {
    'zh-CN': '患者姓名',
    'th-TH': 'ชื่อผู้ป่วย',
    'en-US': 'Patient Name',
  },
  patient_hn: {
    'zh-CN': '病案号 (HN)',
    'th-TH': 'เลขประจำตัว (HN)',
    'en-US': 'Hospital Number (HN)',
  },
  clinical_diagnosis: {
    'zh-CN': '临床诊断',
    'th-TH': 'การวินิจฉัย',
    'en-US': 'Diagnosis',
  },
  attending_therapist: {
    'zh-CN': '主治物理治疗师',
    'th-TH': 'นักกายภาพบำบัดผู้รับผิดชอบ',
    'en-US': 'Attending Therapist',
  },
  license_number: {
    'zh-CN': '执业执照号',
    'th-TH': 'เลขที่ใบประกอบวิชาชีพ',
    'en-US': 'License Number',
  },
  pain_detected_in_session: {
    'zh-CN': '🚨 本次训练中报告疼痛',
    'th-TH': '🚨 แจ้งเจ็บในเซสชันนี้',
    'en-US': '🚨 Pain Reported in this Session',
  },

  // Mandarin & Multilingual Voice Coaching Phrases
  voice_lean_forward: {
    'zh-CN': '请身体稍微前倾，让肩膀自然下垂',
    'th-TH': 'โน้มตัวไปข้างหน้าเล็กน้อย ให้หัวไหล่ผ่อนคลาย',
    'en-US': 'Please lean slightly forward and let your shoulders relax',
  },
  voice_keep_arm_straight: {
    'zh-CN': '请放松手臂自然下垂，不要弯曲手肘',
    'th-TH': 'เหยียดแขนตรงและผ่อนคลาย อย่าเกร็งข้อศอก',
    'en-US': 'Keep your arm straight and relaxed, do not bend your elbow',
  },
  voice_raised_too_high: {
    'zh-CN': '抬得太高了，请慢慢放下以确保安全',
    'th-TH': 'ยกแขนสูงเกินไป ค่อยๆ ผ่อนระดับลงเพื่อความปลอดภัย',
    'en-US': 'Raised too high, please lower slowly for safety',
  },
  voice_avoid_tilt_shrug: {
    'zh-CN': '请保持身体直立，放松肩膀，不要耸肩',
    'th-TH': 'รักษาลำตัวให้ตรง ผ่อนคลายหัวไหล่ อย่าเกร็งยักไหล่',
    'en-US': 'Keep your body upright, relax your shoulders and avoid shrugging',
  },
  voice_slow_down: {
    'zh-CN': '请放慢动作，保持均匀节奏',
    'th-TH': 'เคลื่อนไหวให้ช้าลงและรักษาระดับจังหวะให้สม่ำเสมอ',
    'en-US': 'Please slow down and maintain a steady pace',
  },
  voice_great_job: {
    'zh-CN': '做得很棒！请继续保持',
    'th-TH': 'ยอดเยี่ยมมาก ทำตามจังหวะต่อไป',
    'en-US': 'Great job! Keep maintaining this pace',
  },
} as const;

export type TranslationKey = keyof typeof CLINICAL_DICTIONARY;

/**
 * Direct lookup function for localized clinical text
 */
export function t(key: TranslationKey, lang: ClinicalLanguage = getSavedLanguage(), fallback?: string): string {
  const entry = CLINICAL_DICTIONARY[key];
  if (!entry) return fallback || String(key);
  return entry[lang] || entry['th-TH'] || fallback || String(key);
}

/**
 * Reactive React hook for multilingual clinical presentation
 */
export function useClinicalI18n() {
  const [lang, setLangState] = useState<ClinicalLanguage>(getSavedLanguage);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ClinicalLanguage>;
      if (customEvent.detail) {
        setLangState(customEvent.detail);
      }
    };
    window.addEventListener('drtech:lang_change', handler);
    return () => window.removeEventListener('drtech:lang_change', handler);
  }, []);

  const switchLanguage = useCallback((newLang: ClinicalLanguage) => {
    setSavedLanguage(newLang);
    setLangState(newLang);
  }, []);

  const translate = useCallback(
    (key: TranslationKey, fallback?: string) => {
      return t(key, lang, fallback);
    },
    [lang]
  );

  return {
    lang,
    setLanguage: switchLanguage,
    t: translate,
  };
}

export { LanguageSwitcher } from './LanguageSwitcher';

