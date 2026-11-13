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

import React, { useState, useEffect, useCallback, createContext, useContext, useMemo } from 'react';


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
  // PT Navigation Menus
  menu_reception: {
    'zh-CN': '1. 接待台',
    'th-TH': '1. หน้าต้อนรับ',
    'en-US': '1. Reception Desk',
  },
  menu_my_patients: {
    'zh-CN': '2. 我的患者',
    'th-TH': '2. จัดการคนไข้ของตน',
    'en-US': '2. My Patients',
  },
  menu_records: {
    'zh-CN': '3. 病历与转介',
    'th-TH': '3. ข้อมูลคนไข้/เวชระเบียน/ฝากเคส',
    'en-US': '3. Clinical Records & Delegations',
  },
  menu_profile: {
    'zh-CN': '4. 个人信息',
    'th-TH': '4. ข้อมูลตัวเอง',
    'en-US': '4. My Profile',
  },
  menu_exercises: {
    'zh-CN': '5. 动作库',
    'th-TH': '5. ท่ากายภาพ',
    'en-US': '5. Exercise Catalog',
  },
  menu_schedule: {
    'zh-CN': '6. 预约排班',
    'th-TH': '6. ตารางนัด',
    'en-US': '6. Schedule',
  },

  // Admin Navigation Menus (Master Prompt v3 Spec 8.1)
  admin_menu_users: {
    'zh-CN': '1. 员工与用户管理',
    'th-TH': '1. จัดการผู้ใช้ staff',
    'en-US': '1. Staff & User Management',
  },
  admin_menu_patients: {
    'zh-CN': '2. 患者病历资料',
    'th-TH': '2. ข้อมูลคนไข้',
    'en-US': '2. Patient Records',
  },
  admin_menu_pts: {
    'zh-CN': '3. 物理治疗师名录',
    'th-TH': '3. ข้อมูลนักกายภาพ',
    'en-US': '3. PT Directory',
  },
  admin_menu_library: {
    'zh-CN': '4. 康复动作库与游戏',
    'th-TH': '4. ท่ากายภาพและมินิเกม/modpack',
    'en-US': '4. Exercise & Game Library',
  },
  admin_menu_schedule: {
    'zh-CN': '5. 预约排班日历',
    'th-TH': '5. ตารางนัด',
    'en-US': '5. Schedule Planner',
  },
  admin_menu_audit: {
    'zh-CN': '6. 审计日志与安全',
    'th-TH': '6. ประวัติและความปลอดภัย',
    'en-US': '6. Audit Log & Security',
  },

  // Admin Sidebar Extras
  sidebar_minigame_cards: {
    'zh-CN': '康复卡片 (10 题)',
    'th-TH': 'การ์ดกายภาพ (10 ข้อ)',
    'en-US': 'Physical Cards (10 Qs)',
  },
  sidebar_db_cloud: {
    'zh-CN': '数据库: 云端 Cloud',
    'th-TH': 'ฐานข้อมูล: Cloud',
    'en-US': 'Database: Cloud',
  },
  sidebar_status_normal: {
    'zh-CN': '● 正常',
    'th-TH': '● ปกติ',
    'en-US': '● Normal',
  },
  sidebar_logging_out: {
    'zh-CN': '正在退出...',
    'th-TH': 'กำลังออก...',
    'en-US': 'Logging out...',
  },

  // Admin Top Header Titles & Actions
  page_users_title: {
    'zh-CN': '医院员工与用户管理中心',
    'th-TH': 'จัดการผู้ใช้และบุคลากรโรงพยาบาล',
    'en-US': 'Hospital Staff & User Management Portal',
  },
  page_patients_title: {
    'zh-CN': '患者病历档案与健康管理',
    'th-TH': 'ทะเบียนประวัติและเวชระเบียนคนไข้',
    'en-US': 'Patient Directory & Electronic Health Records',
  },
  page_pts_title: {
    'zh-CN': '物理治疗师管理与临床督导',
    'th-TH': 'ข้อมูลนักกายภาพบำบัดและการกำกับดูแล',
    'en-US': 'Physiotherapist Directory & Clinical Governance',
  },
  page_library_title: {
    'zh-CN': '康复动作库、认知游戏与模组包',
    'th-TH': 'ท่ากายภาพ มินิเกมฝึกสมอง และ Modpack',
    'en-US': 'Exercise Library, Minigame Bank & Clinical Modpacks',
  },
  page_schedule_title: {
    'zh-CN': '临床康复训练排班与日历',
    'th-TH': 'ตารางฝึกกายภาพและปฏิทินการฟื้นฟู',
    'en-US': 'Clinical Physical Therapy Schedule Planner',
  },
  page_audit_title: {
    'zh-CN': '系统审计轨迹与安全管理',
    'th-TH': 'ประวัติการใช้งานและบันทึกความปลอดภัย',
    'en-US': 'Tamper-Evident System Audit Trail & Security',
  },
  page_default_title: {
    'zh-CN': 'Dr.Tech.Care 医院临床管理系统',
    'th-TH': 'ระบบบริหารโรงพยาบาล Dr.Tech.Care',
    'en-US': 'Dr.Tech.Care Hospital Administration Portal',
  },

  header_action_reception_enroll: {
    'zh-CN': '+ 接待与人脸登记',
    'th-TH': '+ ต้อนรับ & สแกนหน้า',
    'en-US': '+ Reception & Face Enroll',
  },
  header_action_fast_checkin: {
    'zh-CN': '+ 快速签到',
    'th-TH': '+ เช็คอินเร่งด่วน',
    'en-US': '+ Fast Check-in',
  },
  header_action_kiosk_mode: {
    'zh-CN': '自助终端 Kiosk',
    'th-TH': 'หน้า Kiosk',
    'en-US': 'Kiosk Mode',
  },
  header_status_online: {
    'zh-CN': '● Supabase 云端',
    'th-TH': '● Supabase Cloud',
    'en-US': '● Supabase Cloud',
  },
  header_status_offline: {
    'zh-CN': '○ 离线',
    'th-TH': '○ ออฟไลน์',
    'en-US': '○ Offline',
  },
  header_status_checking: {
    'zh-CN': '正在检查...',
    'th-TH': 'กำลังตรวจสอบ...',
    'en-US': 'Checking...',
  },

  role_director_title: {
    'zh-CN': '医院院长 (Hospital Director)',
    'th-TH': 'ผู้อำนวยการโรงพยาบาล (Hospital Director)',
    'en-US': 'Hospital Director',
  },
  role_admin_title: {
    'zh-CN': '系统管理员 (Hospital Administrator)',
    'th-TH': 'ผู้ดูแลระบบโรงพยาบาล (Hospital Administrator)',
    'en-US': 'Hospital Administrator',
  },
  role_pt_title: {
    'zh-CN': '物理治疗师 (PT)',
    'th-TH': 'นักกายภาพบำบัด (PT)',
    'en-US': 'Physical Therapist (PT)',
  },
  role_patient_title: {
    'zh-CN': '患者 (Patient)',
    'th-TH': 'คนไข้ (Patient)',
    'en-US': 'Patient',
  },

  // Staff View UI Translations
  staff_view_title: {
    'zh-CN': '医院员工管理 (Staff Management)',
    'th-TH': 'จัดการเจ้าหน้าที่โรงพยาบาล (Staff Management)',
    'en-US': 'Hospital Staff Management',
  },
  staff_view_desc: {
    'zh-CN': '管理院长 (Admin) 与物理治疗师 (PT) 账户，控制权限与访问会话',
    'th-TH': 'บัญชีผู้อำนวยการ (Admin) และนักกายภาพบำบัด (PT) ควบคุมสิทธิ์และเซสชันการเข้าถึง',
    'en-US': 'Manage Director (Admin) and Physical Therapist (PT) accounts, permissions, and sessions',
  },
  staff_add_button: {
    'zh-CN': '+ 添加新员工',
    'th-TH': '+ เพิ่มเจ้าหน้าที่ใหม่',
    'en-US': '+ Add New Staff',
  },
  staff_search_placeholder: {
    'zh-CN': '搜索姓名、用户名、电话...',
    'th-TH': 'ค้นหาชื่อ, username, เบอร์โทร...',
    'en-US': 'Search by name, username, phone...',
  },
  staff_filter_all_roles: {
    'zh-CN': '所有角色 (All Roles)',
    'th-TH': 'ทุกบทบาท (All Roles)',
    'en-US': 'All Roles',
  },
  staff_filter_all_status: {
    'zh-CN': '所有状态 (All Status)',
    'th-TH': 'ทุกสถานะ (All Status)',
    'en-US': 'All Statuses',
  },
  staff_status_active: {
    'zh-CN': '正常 (Active)',
    'th-TH': 'ใช้งานปกติ (Active)',
    'en-US': 'Active',
  },
  staff_status_suspended: {
    'zh-CN': '已暂停 (Suspended)',
    'th-TH': 'ถูกระงับ (Suspended)',
    'en-US': 'Suspended',
  },
  staff_never_logged_in: {
    'zh-CN': '从未登录',
    'th-TH': 'ยังไม่เคยเข้าสู่ระบบ',
    'en-US': 'Never logged in',
  },
  staff_th_name: {
    'zh-CN': '姓名',
    'th-TH': 'ชื่อ-นามสกุล',
    'en-US': 'Full Name',
  },
  staff_th_username: {
    'zh-CN': 'Username / HN',
    'th-TH': 'Username / HN',
    'en-US': 'Username / HN',
  },
  staff_th_role: {
    'zh-CN': '角色',
    'th-TH': 'บทบาท',
    'en-US': 'Role',
  },
  staff_th_status: {
    'zh-CN': '状态',
    'th-TH': 'สถานะ',
    'en-US': 'Status',
  },
  staff_th_last_login: {
    'zh-CN': '最后登录时间',
    'th-TH': 'เข้าสู่ระบบล่าสุด',
    'en-US': 'Last Login',
  },
  staff_th_actions: {
    'zh-CN': '操作',
    'th-TH': 'การจัดการ',
    'en-US': 'Actions',
  },
  staff_loading: {
    'zh-CN': '正在加载用户列表...',
    'th-TH': 'กำลังโหลดรายชื่อผู้ใช้...',
    'en-US': 'Loading staff directory...',
  },
  staff_not_found: {
    'zh-CN': '未找到符合条件的用户',
    'th-TH': 'ไม่พบข้อมูลผู้ใช้ที่ตรงตามเงื่อนไข',
    'en-US': 'No users found matching filters',
  },
  pt_role_badge: {
    'zh-CN': '物理治疗师 (PT)',
    'th-TH': 'นักกายภาพ (PT)',
    'en-US': 'Physical Therapist (PT)',
  },
  admin_role_badge: {
    'zh-CN': '院长 / 管理员 (Admin)',
    'th-TH': 'ผู้อำนวยการ (Admin)',
    'en-US': 'Director / Admin',
  },
  logout: {
    'zh-CN': '退出登录',
    'th-TH': 'ออกจากระบบ',
    'en-US': 'Log Out',
  },
  return_to_kiosk: {
    'zh-CN': '返回自助终端',
    'th-TH': 'กลับสู่หน้าตู้ Kiosk',
    'en-US': 'Return to Kiosk',
  },
  delegated_badge: {
    'zh-CN': '转介患者 / Delegated',
    'th-TH': 'ฝากเคสชั่วคราว / Delegated',
    'en-US': 'Delegated Case',
  },
  refresh_data: {
    'zh-CN': '刷新数据',
    'th-TH': 'รีเฟรชข้อมูล',
    'en-US': 'Refresh Data',
  },
  staff_modal_create_title: {
    'zh-CN': '添加新用户 (Staff / PT / 患者)',
    'th-TH': 'เพิ่มผู้ใช้ใหม่ (Staff / PT / คนไข้)',
    'en-US': 'Add New User (Staff / PT / Patient)',
  },
  step_1_account_info: {
    'zh-CN': '1. 用户账户信息',
    'th-TH': '1. ข้อมูลบัญชีผู้ใช้',
    'en-US': '1. Account Information',
  },
  step_2_roles_perms: {
    'zh-CN': '2. 角色与权限设置',
    'th-TH': '2. กำหนดบทบาทและสิทธิ์การใช้งาน',
    'en-US': '2. Roles & Permissions',
  },
  step_3_pt_license: {
    'zh-CN': '3. 物理治疗师执业资格信息',
    'th-TH': '3. ข้อมูลใบอนุญาตประกอบวิชาชีพกายภาพบำบัด',
    'en-US': '3. Physical Therapy License Details',
  },
  step_3_patient_info: {
    'zh-CN': '3. 患者初步病症与个人资料',
    'th-TH': '3. ข้อมูลผู้ป่วยและอาการเริ่มต้น',
    'en-US': '3. Patient Initial Diagnosis & Info',
  },
  btn_back: {
    'zh-CN': '上一步',
    'th-TH': 'ย้อนกลับ',
    'en-US': 'Back',
  },
  btn_next_step: {
    'zh-CN': '下一步',
    'th-TH': 'ขั้นตอนถัดไป',
    'en-US': 'Next',
  },
  btn_save_and_create: {
    'zh-CN': '保存并创建账户',
    'th-TH': 'บันทึกและสร้างบัญชี',
    'en-US': 'Save & Create Account',
  },
  processing: {
    'zh-CN': '正在处理...',
    'th-TH': 'กำลังดำเนินการ...',
    'en-US': 'Processing...',
  },
  modal_reset_password_title: {
    'zh-CN': '重置员工密码',
    'th-TH': 'รีเซ็ตรหัสผ่านเจ้าหน้าที่',
    'en-US': 'Reset Staff Password',
  },
  btn_confirm_reset_password: {
    'zh-CN': '确认重置密码',
    'th-TH': 'ยืนยันรีเซ็ตรหัสผ่าน',
    'en-US': 'Confirm Reset Password',
  },
  btn_cancel: {
    'zh-CN': '取消',
    'th-TH': 'ยกเลิก',
    'en-US': 'Cancel',
  },
  action_unsuspend: {
    'zh-CN': '解除暂停',
    'th-TH': 'ยกเลิกระงับ',
    'en-US': 'Unsuspend',
  },
  action_suspend: {
    'zh-CN': '暂停使用',
    'th-TH': 'ระงับการใช้งาน',
    'en-US': 'Suspend',
  },
  action_reset_password: {
    'zh-CN': '重置密码',
    'th-TH': 'รีเซ็ตรหัสผ่าน',
    'en-US': 'Reset Password',
  },
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

  // Exercise Session & Kiosk Status Badges
  adjust_pose: {
    'zh-CN': '等待调整姿势',
    'th-TH': 'รอจัดท่า',
    'en-US': 'Adjust Pose',
  },
  ready_to_start: {
    'zh-CN': '请在初始位置做好准备',
    'th-TH': 'เตรียมพร้อมในตำแหน่งเริ่มต้น',
    'en-US': 'Get ready at the starting position',
  },
  too_close: {
    'zh-CN': '距离过近 — 请后退',
    'th-TH': 'ใกล้เกินไป — ถอยห่างอีกนิด',
    'en-US': 'Too Close — Step Back',
  },
  too_far: {
    'zh-CN': '距离过远 — 请靠近',
    'th-TH': 'ไกลเกินไป — ขยับเข้าใกล้อีกนิด',
    'en-US': 'Too Far — Step Closer',
  },
  ideal_distance: {
    'zh-CN': '距离合适',
    'th-TH': 'ระยะพอดี',
    'en-US': 'Ideal Distance',
  },
  set_label: {
    'zh-CN': '组数',
    'th-TH': 'เซ็ตที่',
    'en-US': 'Set',
  },
  reps_label: {
    'zh-CN': '次数',
    'th-TH': 'จำนวนครั้ง',
    'en-US': 'Reps',
  },
  right_arm: {
    'zh-CN': '🦾 右臂',
    'th-TH': '🦾 แขนขวา',
    'en-US': '🦾 Right Arm',
  },
  left_arm: {
    'zh-CN': '左臂 🦾',
    'th-TH': 'แขนซ้าย 🦾',
    'en-US': 'Left Arm 🦾',
  },
  right_leg: {
    'zh-CN': '🦿 右腿',
    'th-TH': '🦿 ขาขวา',
    'en-US': '🦿 Right Leg',
  },
  left_leg: {
    'zh-CN': '左腿 🦿',
    'th-TH': 'ขาซ้าย 🦿',
    'en-US': 'Left Leg 🦿',
  },
  bilateral: {
    'zh-CN': '双侧协同',
    'th-TH': 'ทั้งสองข้าง',
    'en-US': 'Bilateral',
  },
  exit_exercise: {
    'zh-CN': '退出训练',
    'th-TH': 'ออกจากการฝึก',
    'en-US': 'Exit Exercise',
  },
  pause_session: {
    'zh-CN': '🛑 暂停休息',
    'th-TH': '🛑 พักสักครู่',
    'en-US': '🛑 Pause',
  },
  resume_session: {
    'zh-CN': '继续训练 (Resume)',
    'th-TH': 'ทำต่อ (Resume)',
    'en-US': 'Resume',
  },
  rest_between_sets: {
    'zh-CN': '组间休息',
    'th-TH': 'พักผ่อนระหว่างเซ็ต',
    'en-US': 'Rest Between Sets',
  },
  ready_next_set: {
    'zh-CN': '准备就绪，开始下一组 ➔',
    'th-TH': 'พร้อมแล้ว เริ่มเซ็ตถัดไปทันที ➔',
    'en-US': 'Ready, Start Next Set ➔',
  },

  // Kiosk Face Scan & Login
  kiosk_searching_face: {
    'zh-CN': '正在搜寻人脸...',
    'th-TH': 'กำลังหาใบหน้า...',
    'en-US': 'Searching for face...',
  },
  kiosk_align_face: {
    'zh-CN': '请将面部对准圆框中央',
    'th-TH': 'กรุณาจัดตำแหน่งใบหน้าให้อยู่ในกรอบวงกลม',
    'en-US': 'Please align face inside circle',
  },
  kiosk_checking_liveness: {
    'zh-CN': '正在检测面部活体...',
    'th-TH': 'กำลังตรวจสอบใบหน้า...',
    'en-US': 'Checking face liveness...',
  },
  kiosk_verifying_identity: {
    'zh-CN': '⚡ 正在验证身份...',
    'th-TH': '⚡ กำลังยืนยันตัวตน...',
    'en-US': '⚡ Verifying identity...',
  },
  kiosk_identity_verified: {
    'zh-CN': '✅ 身份验证成功',
    'th-TH': '✅ ยืนยันตัวตนสำเร็จ',
    'en-US': '✅ Identity Verified',
  },
  kiosk_scan_face_now: {
    'zh-CN': '📷 立即扫描面部登录',
    'th-TH': '📷 สแกนใบหน้าเข้าใช้งานทันที',
    'en-US': '📷 Scan Face Login Now',
  },
  kiosk_pin_fallback_hint: {
    'zh-CN': '💡 耗时较长，建议使用4位数PIN码登录',
    'th-TH': '💡 ใช้เวลานานกว่าปกติ แนะนำให้เข้าสู่ระบบด้วยรหัส PIN 4 หลัก',
    'en-US': '💡 Taking longer than usual. Try 4-digit PIN login',
  },
  kiosk_spoof_blocked: {
    'zh-CN': '⚠️ 检测到非真人面部，请面对镜头并眨眼',
    'th-TH': '⚠️ ตรวจพบภาพที่ไม่ใช่ใบหน้าจริง กรุณามองกล้องด้วยใบหน้าจริงและกะพริบตา',
    'en-US': '⚠️ Spoof detected. Please face the camera and blink',
  },
  kiosk_account_not_found_title: {
    'zh-CN': '未找到用户账户',
    'th-TH': 'ไม่พบบัญชีผู้ใช้',
    'en-US': 'Account Not Found',
  },
  kiosk_account_not_found_desc: {
    'zh-CN': '未找到用户账户，请联系工作人员进行注册。',
    'th-TH': 'ไม่พบบัญชีผู้ใช้ กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียน',
    'en-US': 'No user account was found. Please contact staff for registration.',
  },
  kiosk_btn_staff_register: {
    'zh-CN': '由工作人员注册',
    'th-TH': 'เจ้าหน้าที่ลงทะเบียนให้',
    'en-US': 'Staff Registration',
  },
  kiosk_btn_call_staff: {
    'zh-CN': '呼叫工作人员',
    'th-TH': 'เรียกเจ้าหน้าที่',
    'en-US': 'Call Staff',
  },
  kiosk_btn_use_pin: {
    'zh-CN': '使用 PIN',
    'th-TH': 'ใช้รหัส PIN',
    'en-US': 'Use PIN',
  },
  kiosk_btn_try_again: {
    'zh-CN': '重新扫描',
    'th-TH': 'ลองสแกนอีกครั้ง',
    'en-US': 'Try Again',
  },
  kiosk_msg_quality_insufficient: {
    'zh-CN': '请正视摄像头，改善光线，并将面部置于画面中央。',
    'th-TH': 'กรุณามองตรง เพิ่มแสง และจัดใบหน้าให้อยู่กลางกล้อง',
    'en-US': 'Please face the camera, improve lighting, and position your face in the center.',
  },
  kiosk_msg_match_uncertain: {
    'zh-CN': '需要进一步身份验证',
    'th-TH': 'กรุณายืนยันตัวตนเพิ่มเติม',
    'en-US': 'Additional verification required.',
  },

  // Physical Cards Minigame
  card_minigame_title: {
    'zh-CN': '康复认知训练卡片',
    'th-TH': 'การ์ดกายภาพ',
    'en-US': 'Physical & Cognitive Cards',
  },
  card_yes_label: {
    'zh-CN': 'ใช่ / 是',
    'th-TH': 'ใช่',
    'en-US': 'Yes',
  },
  card_no_label: {
    'zh-CN': 'ไม่ใช่ / 否',
    'th-TH': 'ไม่',
    'en-US': 'No',
  },
  card_raise_left_hand: {
    'zh-CN': '✋ 举起左手',
    'th-TH': '✋ ยกมือซ้าย',
    'en-US': '✋ Raise Left Hand',
  },
  card_raise_right_hand: {
    'zh-CN': '✋ 举起右手',
    'th-TH': '✋ ยกมือขวา',
    'en-US': '✋ Raise Right Hand',
  },
  card_hold_to_answer: {
    'zh-CN': '保持手势以确认',
    'th-TH': 'ค้างมือเพื่อตอบ',
    'en-US': 'Hold to answer',
  },
  card_bottom_hint: {
    'zh-CN': '举起右手 = 是 · 举起左手 = 否（保持0.6秒）',
    'th-TH': 'ยกมือขวา = ใช่ · ยกมือซ้าย = ไม่ (ค้างไว้ 0.6 วินาที)',
    'en-US': 'Raise Right Hand = Yes · Raise Left Hand = No (Hold for 0.6s)',
  },
  card_intro_popup_hint: {
    'zh-CN': '举起右手 = 是 · 举起左手 = 否',
    'th-TH': 'ยกมือขวา = ใช่ · ยกมือซ้าย = ไม่',
    'en-US': 'Raise Right Hand = Yes · Raise Left Hand = No',
  },
  card_right_hand_yes: {
    'zh-CN': '右手 = 是',
    'th-TH': 'มือขวา = ใช่',
    'en-US': 'Right Hand = Yes',
  },
  card_left_hand_no: {
    'zh-CN': '左手 = 否',
    'th-TH': 'มือซ้าย = ไม่',
    'en-US': 'Left Hand = No',
  },
  card_both_hands_warning: {
    'zh-CN': '请仅举起一只手',
    'th-TH': 'กรุณายกมือเพียงข้างเดียว',
    'en-US': 'Please raise only one hand',
  },
  card_confirmed_yes: {
    'zh-CN': 'ตอบ: ใช่ / 已答：是',
    'th-TH': 'ตอบ: ใช่',
    'en-US': 'Answer: Yes',
  },
  card_confirmed_no: {
    'zh-CN': 'ตอบ: ไม่ / 已答：否',
    'th-TH': 'ตอบ: ไม่',
    'en-US': 'Answer: No',
  },
  card_move_to_center: {
    'zh-CN': '请移入画面中央',
    'th-TH': 'ขยับมือเข้ามาในกรอบ',
    'en-US': 'Move to center of frame',
  },
  card_btn_tap_yes: {
    'zh-CN': 'ใช่ (ขวา) / 是',
    'th-TH': 'ใช่ (ยกมือขวา)',
    'en-US': 'Yes (Right Hand)',
  },
  card_btn_tap_no: {
    'zh-CN': 'ไม่ (ซ้าย) / 否',
    'th-TH': 'ไม่ (ยกมือซ้าย)',
    'en-US': 'No (Left Hand)',
  },
  card_stand_visible_hint: {
    'zh-CN': '请退后至能看清双手的位置（保持0.6秒作答）',
    'th-TH': 'ยืนให้เห็นมือทั้งสองข้าง (ค้างมือ 0.6 วินาทีเพื่อตอบ)',
    'en-US': 'Ensure both hands are visible (Hold for 0.6s to answer)',
  },
  card_score_label: {
    'zh-CN': '得分',
    'th-TH': 'คะแนน',
    'en-US': 'Score',
  },
  card_question_label: {
    'zh-CN': '题目',
    'th-TH': 'ข้อ',
    'en-US': 'Question',
  },
  card_illustration_label: {
    'zh-CN': '题目插图',
    'th-TH': 'ภาพประกอบโจทย์',
    'en-US': 'Question Illustration',
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

export interface ClinicalI18nContextValue {
  lang: ClinicalLanguage;
  language: ClinicalLanguage;
  setLanguage: (lang: ClinicalLanguage) => void;
  t: (key: TranslationKey, fallback?: string) => string;
}

export const ClinicalI18nContext = createContext<ClinicalI18nContextValue | null>(null);

/**
 * Global Isolated i18n Provider to avoid full app remounts on language change
 */
export const ClinicalI18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<ClinicalLanguage>(getSavedLanguage);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ClinicalLanguage>;
      if (customEvent.detail && customEvent.detail !== lang) {
        setLangState(customEvent.detail);
      }
    };
    window.addEventListener('drtech:lang_change', handler);
    return () => window.removeEventListener('drtech:lang_change', handler);
  }, [lang]);

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

  const contextValue = useMemo(
    () => ({
      lang,
      language: lang,
      setLanguage: switchLanguage,
      t: translate,
    }),
    [lang, switchLanguage, translate]
  );

  return React.createElement(ClinicalI18nContext.Provider, { value: contextValue }, children);
};

/**
 * Reactive React hook for multilingual clinical presentation
 * Consumes global ClinicalI18nContext if provided; otherwise falls back gracefully.
 */
export function useClinicalI18n(): ClinicalI18nContextValue {
  const context = useContext(ClinicalI18nContext);
  const [localLang, setLocalLang] = useState<ClinicalLanguage>(getSavedLanguage);

  useEffect(() => {
    if (context) return;
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ClinicalLanguage>;
      if (customEvent.detail) {
        setLocalLang(customEvent.detail);
      }
    };
    window.addEventListener('drtech:lang_change', handler);
    return () => window.removeEventListener('drtech:lang_change', handler);
  }, [context]);

  const switchLanguage = useCallback(
    (newLang: ClinicalLanguage) => {
      if (context) {
        context.setLanguage(newLang);
      } else {
        setSavedLanguage(newLang);
        setLocalLang(newLang);
      }
    },
    [context]
  );

  const translate = useCallback(
    (key: TranslationKey, fallback?: string) => {
      return t(key, context ? context.lang : localLang, fallback);
    },
    [context, localLang]
  );

  if (context) {
    return context;
  }

  return {
    lang: localLang,
    language: localLang,
    setLanguage: switchLanguage,
    t: translate,
  };
}

export { LanguageSwitcher } from './LanguageSwitcher';

