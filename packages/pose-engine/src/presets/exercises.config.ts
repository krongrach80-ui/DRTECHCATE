/**
 * packages/pose-engine/src/presets/exercises.config.ts
 *
 * DRTECH.CARE CENTRAL CLINICAL EXERCISE CONFIGURATION CATALOG
 * 15 Standard Clinical Exercises with Trilingual Metadata (TH / EN / CN),
 * MediaPipe landmark indices, framing requirements, clinical sources,
 * and biomechanical anti-cheat parameters.
 */

import { ExerciseDetectionConfig } from '../types/exerciseConfig';

export const CLINICAL_EXERCISES_CONFIG: Record<string, ExerciseDetectionConfig> = {
  // 1. Active Shoulder Flexion
  'active-shoulder-flexion': {
    id: 'active-shoulder-flexion',
    exerciseId: 'e1000000-0000-0000-0000-000000000001',
    mode: 'camera',
    nameTh: 'ยกแขนไปข้างหน้า (Active Shoulder Flexion)',
    nameEn: 'Active Shoulder Flexion',
    nameCn: '肩关节前屈主动活动',
    descriptionTh: 'ยืนหรือนั่งหลังตรง ยกแขนตรงไปข้างหน้าจนถึงระดับเหนือศีรษะ แล้วค่อยๆ ลดระดับลงอย่างควบคุม',
    descriptionEn: 'Raise arm forward and upward toward overhead position in a controlled motion, then lower smoothly.',
    descriptionCn: '保持身姿直立，将手臂向前上方平稳抬起至目标角度，随后缓慢放下。',
    framing: 'upper',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/active-shoulder-flexion.svg',
    clinicalSource: 'AAOS Clinical Standards / JOSPT Shoulder Impingement CPG',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 1.0,
    cameraGuide: {
      recommendedView: 'side_90',
      recommendedDistanceMeters: [1.8, 2.8],
      instructionTextTh: 'ยืนหรือนั่งหันข้าง 45°–90° ให้เห็นลำตัวและแขนข้างที่ฝึกตั้งแต่สะโพกถึงข้อมือ',
      instructionTextEn: 'Position side-on (45°–90°), 1.8–2.8m from camera, ensuring hip, shoulder, and wrist are visible.',
      instructionTextCn: '侧身45°至90°就坐或站立，距离1.8-2.8米，确保髋、肩、腕清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 11, pointB: 15, use3DWorld: true }, // Hip -> Shoulder -> Wrist
        right: { pointA: 24, vertex: 12, pointB: 16, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 20,
      targetMinDeg: 140,
      targetMaxDeg: 180,
      toleranceDeg: 12,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'flexion_trunk_lean',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'รักษาลำตัวให้ตรง อย่าเอนตัวไปข้างหลังขณะยกแขน',
        warningMessageEn: 'Keep body upright, avoid leaning backward while raising arm',
        warningMessageCn: '请保持身体正直，举臂时避免后仰借力',
        severity: 'warning',
      },
      {
        ruleId: 'flexion_scapular_hiking',
        type: 'scapular_hiking',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าเกร็งยกหัวไหล่ขึ้น ให้ยกเฉพาะแขน',
        warningMessageEn: 'Do not shrug shoulder upward, isolate arm movement',
        warningMessageCn: '请勿耸肩借力，保持肩胛平稳',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บบริเวณข้อต่อหัวไหล่ ให้หยุดพักทันทีและแจ้งนักกายภาพบำบัด',
      stopOnPainMessageEn: 'If shoulder joint pain is felt, stop immediately.',
      stopOnPainMessageCn: '如感到肩关节刺痛，请立即停止。',
      maxSafeAngleCapDeg: 180,
    },
    requiredLandmarks: {
      right: [12, 14, 16],
      left: [11, 13, 15],
      bilateral: [11, 12, 13, 14, 15, 16],
    },
    minLandmarkVisibility: {
      11: 0.50,
      12: 0.50,
      13: 0.50,
      14: 0.50,
      15: 0.40,
      16: 0.40,
    },
  },

  // 2. Shoulder Abduction
  'shoulder-abduction': {
    id: 'shoulder-abduction',
    exerciseId: 'e1000000-0000-0000-0000-000000000002',
    mode: 'camera',
    nameTh: 'กางแขนออกด้านข้าง (Shoulder Abduction)',
    nameEn: 'Shoulder Abduction',
    nameCn: '肩关节外展侧举',
    descriptionTh: 'ยืนหรือนั่งหน้าตรง ค่อยๆ กางแขนออกด้านข้างลำตัวจนขนานกับพื้นหรือถึงระดับที่สบาย แล้วลดลงช้าๆ',
    descriptionEn: 'Raise arm laterally away from trunk up to shoulder height, hold briefly, and lower slowly.',
    descriptionCn: '身体面向前方，将手臂从身体两侧平稳向外展开至目标角度，随后平缓收回。',
    framing: 'upper',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/shoulder-abduction.svg',
    clinicalSource: 'AAOS Clinical Standards / Kendall Muscle Testing',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 1.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.8, 2.8],
      instructionTextTh: 'ยืนหรือนั่งหันหน้าตรงเข้าหากล้อง ระยะห่าง 1.8–2.8 ม. ให้เห็นลำตัวและแขนทั้งสองข้าง',
      instructionTextEn: 'Face camera directly, 1.8–2.8m away, with trunk and arms clearly visible.',
      instructionTextCn: '正对摄像头，距离1.8-2.8米，确保躯干与双臂清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 11, pointB: 13, use3DWorld: true }, // Hip -> Shoulder -> Elbow
        right: { pointA: 24, vertex: 12, pointB: 14, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 20,
      targetMinDeg: 80,
      targetMaxDeg: 165,
      toleranceDeg: 10,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'abduction_trunk_tilt',
        type: 'trunk_lateral_flexion',
        thresholdValue: 12.0,
        warningMessageTh: 'รักษาลำตัวให้ตรง อย่าเอียงตัวช่วยกางแขน',
        warningMessageEn: 'Keep body upright, do not lean sideways to assist abduction',
        warningMessageCn: '请保持躯干正直，避免侧倾借力',
        severity: 'warning',
      },
      {
        ruleId: 'abduction_shoulder_shrug',
        type: 'shoulder_shrug',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าเกร็งยกหัวไหล่ขึ้น ค่อยๆ กางแขนสบายๆ',
        warningMessageEn: 'Avoid shrugging shoulders up toward ears',
        warningMessageCn: '请勿耸肩，放松颈肩部肌群',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการเจ็บข้อต่อหัวไหล่ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if shoulder pain occurs.',
      stopOnPainMessageCn: '若肩部出现疼痛，请立即停止。',
      maxSafeAngleCapDeg: 175,
    },
    requiredLandmarks: {
      right: [12, 14, 16],
      left: [11, 13, 15],
      bilateral: [11, 12, 13, 14],
    },
    minLandmarkVisibility: {
      11: 0.50,
      12: 0.50,
      13: 0.45,
      14: 0.45,
    },
  },

  // 3. Shoulder External Rotation with Band
  'shoulder-er-band': {
    id: 'shoulder-er-band',
    exerciseId: 'e1000000-0000-0000-0000-000000000003',
    mode: 'camera',
    nameTh: 'หมุนแขนออกด้านนอกด้วยยางยืด (Shoulder External Rotation with Band)',
    nameEn: 'Shoulder External Rotation with Band',
    nameCn: '弹力带肩关节外旋',
    descriptionTh: 'หนีบข้อศอกข้างลำตัว ตั้งฉาก 90° ดึงยางยืดหมุนมือออกด้านข้าง ค้างไว้ 2 วินาที แล้วผ่อนกลับช้าๆ',
    descriptionEn: 'Keep elbow pinned to side bent at 90°, rotate forearm outward against resistance band, hold 2s, then return slowly.',
    descriptionCn: '大臂贴紧体侧，肘屈90度，抓握弹力带向外旋转前臂，保持2秒后慢回。',
    framing: 'upper',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/shoulder-er-band.svg',
    clinicalSource: 'JOSPT Rotator Cuff CPG / Brotzman Clinical Orthopaedic Rehab',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'ยืนหรือนั่งหันหน้าตรงเข้าหากล้อง หนีบศอกแนบลำตัว ตั้งฉาก 90°',
      instructionTextEn: 'Face camera directly, keep elbows pinned at 90 degrees at your sides.',
      instructionTextCn: '正对摄像头，双肘贴紧体侧保持90度。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 13, pointB: 15, use3DWorld: true },
        right: { pointA: 12, vertex: 14, pointB: 16, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 15,
      targetMinDeg: 40,
      targetMaxDeg: 75,
      toleranceDeg: 10,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'er_elbow_abduction',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่ากางข้อศอกออกจากลำตัว ให้หนีบศอกแนบข้างลำตัวไว้',
        warningMessageEn: 'Keep elbow pinned to your side, avoid elbow flare',
        warningMessageCn: '请勿向外张开手肘，保持手肘紧贴躯干',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเสียวแปลบบริเวณเอ็นหัวไหล่ ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if shoulder tendon pain occurs.',
      stopOnPainMessageCn: '如感到肩部肌腱刺痛，请立即停止。',
      maxSafeAngleCapDeg: 80,
    },
    requiredLandmarks: {
      right: [12, 14, 16],
      left: [11, 13, 15],
      bilateral: [11, 12, 13, 14, 15, 16],
    },
    minLandmarkVisibility: {
      11: 0.45,
      12: 0.45,
      13: 0.40,
      14: 0.40,
      15: 0.35,
      16: 0.35,
    },
  },

  // 4. Scapular Retraction
  'scapular-retraction': {
    id: 'scapular-retraction',
    exerciseId: 'e1000000-0000-0000-0000-000000000004',
    mode: 'camera',
    nameTh: 'ดึงสะบักชิดกัน (Scapular Retraction / Pinch)',
    nameEn: 'Scapular Retraction',
    nameCn: '肩胛骨内收挤压',
    descriptionTh: 'นั่งหรือยืนตัวตรง ดึงหัวไหล่และสะบักทั้งสองข้างไปด้านหลังให้ชิดกัน ค้างไว้ 5 วินาที แล้วคลายออกช้าๆ',
    descriptionEn: 'Sit or stand upright, squeeze shoulder blades together toward the spine, hold for 5s, then release slowly.',
    descriptionCn: '身姿直立，将双侧肩胛骨向脊柱中心收拢挤压，保持5秒后平缓放松。',
    framing: 'upper',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'scapula',
    mediaUrl: '/assets/exercises/scapular-retraction.svg',
    clinicalSource: 'APTA Orthopaedic Section / Kendall Postural Assessment',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 5.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'ยืนหรือนั่งหันหน้าตรงเข้าหากล้อง กางแขนงอศอก 90° พร้อมดึงสะบักไปด้านหลัง',
      instructionTextEn: 'Face camera, bend elbows at 90 degrees and pull shoulder blades backward.',
      instructionTextCn: '正对摄像头，屈肘90度，向后收缩肩胛骨。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 13, vertex: 11, pointB: 12, use3DWorld: true },
        right: { pointA: 14, vertex: 12, pointB: 11, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 150,
      targetMinDeg: 100,
      targetMaxDeg: 130,
      toleranceDeg: 12,
      holdDurationSec: 5.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'scap_shrug',
        type: 'shoulder_shrug',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าเกร็งยกหัวไหล่ขึ้น ให้ดึงสะบักลงและเข้าหากัน',
        warningMessageEn: 'Do not shrug shoulders; pull shoulder blades down and back',
        warningMessageCn: '请勿耸肩，向下并向后收紧肩胛骨',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการเจ็บเสียวสะบักหรือชาลงแขน ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if scapular pain or radiating numbness occurs.',
      stopOnPainMessageCn: '若肩胛刺痛或手臂麻木，请立即停止。',
      maxSafeAngleCapDeg: 160,
    },
    requiredLandmarks: {
      right: [12, 14],
      left: [11, 13],
      bilateral: [11, 12, 13, 14],
    },
    minLandmarkVisibility: {
      11: 0.50,
      12: 0.50,
      13: 0.40,
      14: 0.40,
    },
  },

  // 5. Elbow Flexion & Extension
  'elbow-flexion-extension': {
    id: 'elbow-flexion-extension',
    exerciseId: 'e1000000-0000-0000-0000-000000000005',
    mode: 'camera',
    nameTh: 'งอและเหยียดข้อศอก (Elbow Flexion & Extension)',
    nameEn: 'Elbow Flexion & Extension',
    nameCn: '肘关节屈伸活动',
    descriptionTh: 'งอข้อศอกนำมือเข้าหาหัวไหล่ แล้วเหยียดแขนออกจนตรงอย่างช้าๆ ควบคุมกล้ามเนื้อตลอดการเคลื่อนไหว',
    descriptionEn: 'Bend elbow smoothly to bring hand toward shoulder, hold briefly, then extend fully back to straight.',
    descriptionCn: '平稳屈肘将手伸向肩部，稍作停顿，随后完全伸展手臂，全程控制发力。',
    framing: 'upper',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'elbow',
    mediaUrl: '/assets/exercises/elbow-flexion-extension.svg',
    clinicalSource: 'AAOS Clinical Measurement / Kapandji Biomechanics',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 1.0,
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'หันข้าง 45°–90° ให้กล้องเห็นข้อศอก หัวไหล่ และข้อมือข้างที่ฝึกอย่างชัดเจน',
      instructionTextEn: 'Position side-on at 45°–90°, showing shoulder, elbow, and wrist clearly.',
      instructionTextCn: '侧对摄像头45°-90°，清晰展现肩、肘、腕三点。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 13, pointB: 15, use3DWorld: true },
        right: { pointA: 12, vertex: 14, pointB: 16, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 155,
      targetMinDeg: 35,
      targetMaxDeg: 65,
      toleranceDeg: 10,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'elbow_trunk_swing',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'รักษาลำตัวให้นิ่ง อย่าแกว่งตัวช่วยงอศอก',
        warningMessageEn: 'Keep torso stable, avoid swinging body to bend elbow',
        warningMessageCn: '请保持躯干平稳，避免摇晃身体借力',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการเจ็บข้อศอก ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if elbow joint pain occurs.',
      stopOnPainMessageCn: '若肘部疼痛，请立即停止。',
      maxSafeAngleCapDeg: 165,
    },
    requiredLandmarks: {
      right: [12, 14, 16],
      left: [11, 13, 15],
      bilateral: [11, 12, 13, 14, 15, 16],
    },
    minLandmarkVisibility: {
      11: 0.45,
      12: 0.45,
      13: 0.40,
      14: 0.40,
      15: 0.35,
      16: 0.35,
    },
  },

  // 6. Seated Knee Extension
  'seated-knee-extension': {
    id: 'seated-knee-extension',
    exerciseId: 'e1000000-0000-0000-0000-000000000006',
    mode: 'camera',
    nameTh: 'เตะเหยียดเข่าท่านั่ง (Seated Knee Extension)',
    nameEn: 'Seated Knee Extension',
    nameCn: '坐姿膝关节伸展',
    descriptionTh: 'นั่งเก้าอี้หลังตรง ค่อยๆ เตะเหยียดเข่าขึ้นมาข้างหน้าจนขาตรง ค้างไว้ 2 วินาที แล้ววางลงช้าๆ',
    descriptionEn: 'Sit upright on chair, slowly kick and extend knee until leg is straight, hold for 2s, then lower slowly.',
    descriptionCn: '坐在椅子上挺直腰背，平缓伸直膝盖使小腿抬平，保持2秒后慢落。',
    framing: 'lower_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'knee',
    mediaUrl: '/assets/exercises/seated-knee-extension.svg',
    clinicalSource: 'AAOS Knee Osteoarthritis CPG / ACSM Exercise Guidelines',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'side_90',
      recommendedDistanceMeters: [2.0, 3.0],
      instructionTextTh: 'นั่งเก้าอี้หันข้าง 45°–90° เข้าหากล้อง ให้เห็นสะโพก หัวเข่า และข้อเท้าชัดเจน',
      instructionTextEn: 'Sit on chair at 45°–90° angle to camera, showing hip, knee, and ankle.',
      instructionTextCn: '侧向摄像头45°-90°就坐，确保髋、膝、踝清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 25, pointB: 27, use3DWorld: true }, // Hip -> Knee -> Ankle
        right: { pointA: 24, vertex: 26, pointB: 28, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 90,
      targetMinDeg: 155,
      targetMaxDeg: 180,
      toleranceDeg: 10,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'knee_trunk_recline',
        type: 'trunk_lean',
        thresholdValue: 0.18,
        warningMessageTh: 'นั่งหลังตรง อย่าเอนหลังพิงเพื่อช่วยเตะขา',
        warningMessageEn: 'Keep back straight, avoid leaning backward to kick leg',
        warningMessageCn: '请坐直身体，避免后仰躯干借力踢腿',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกปวดเสียวที่สะบ้าหรือข้อเข่า ให้หยุดการเหยียดทันที',
      stopOnPainMessageEn: 'Stop immediately if patellar or knee pain occurs.',
      stopOnPainMessageCn: '若膝盖或髌骨出现疼痛，请立即停止。',
      maxSafeAngleCapDeg: 180,
    },
    requiredLandmarks: {
      right: [24, 26, 28],
      left: [23, 25, 27],
      bilateral: [23, 24, 25, 26, 27, 28],
    },
    minLandmarkVisibility: {
      23: 0.40,
      24: 0.40,
      25: 0.50,
      26: 0.50,
      27: 0.45,
      28: 0.45,
    },
  },

  // 7. Mini Squat
  'mini-squat': {
    id: 'mini-squat',
    exerciseId: 'e1000000-0000-0000-0000-000000000007',
    mode: 'camera',
    nameTh: 'ย่อเข่ามินิสควอท (Mini Squat 0–60°)',
    nameEn: 'Mini Squat (0–60°)',
    nameCn: '浅蹲/微蹲训练',
    descriptionTh: 'ยืนแยกเท้ากว้างเท่าหัวไหล่ ค่อยๆ ย่อเข่าลงประมาณ 30°–60° (ไม่ให้เข่าเลยปลายเท้า) ค้างไว้ 2 วินาที แล้วยืนขึ้น',
    descriptionEn: 'Stand with feet shoulder-width apart, bend knees to 30°–60° flexion, hold 2s, then return to standing.',
    descriptionCn: '双脚与肩同宽站立，平稳屈膝30°-60°做微蹲（膝盖不超过脚尖），保持2秒后站起。',
    framing: 'full_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'knee',
    mediaUrl: '/assets/exercises/mini-squat.svg',
    clinicalSource: 'JOSPT Patellofemoral Pain CPG / ACSM Closed Kinetic Chain',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [2.0, 3.0],
      instructionTextTh: 'ยืนหันเฉียง 45° ถอยห่าง 2–3 ม. ให้เห็นเต็มตัวตั้งแต่ศีรษะถึงปลายเท้า',
      instructionTextEn: 'Stand at 45° angle, 2–3m away, full body visible from head to feet.',
      instructionTextCn: '侧身45°站立，距离2-3米，确保从头到脚全身可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 25, pointB: 27, use3DWorld: true },
        right: { pointA: 24, vertex: 26, pointB: 28, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 170,
      targetMinDeg: 120,
      targetMaxDeg: 145,
      toleranceDeg: 10,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'squat_excessive_flexion',
        type: 'trunk_lean',
        thresholdValue: 0.25,
        warningMessageTh: 'อย่าย่อเข่าลึกเกินไป รักษามุมเข่าไม่ให้เกิน 60°',
        warningMessageEn: 'Do not squat too deep, keep knee flexion under 60°',
        warningMessageCn: '请勿蹲得过深，保持屈膝角度在60度以内',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการเจ็บสะบ้าหรือเข่า ให้หยุดย่อทันที',
      stopOnPainMessageEn: 'Stop immediately if knee or patellar pain occurs.',
      stopOnPainMessageCn: '若膝部或髌骨疼痛，请立即停止。',
      maxSafeAngleCapDeg: 180,
    },
    requiredLandmarks: {
      right: [24, 26, 28],
      left: [23, 25, 27],
      bilateral: [23, 24, 25, 26, 27, 28],
    },
    minLandmarkVisibility: {
      23: 0.45,
      24: 0.45,
      25: 0.50,
      26: 0.50,
      27: 0.45,
      28: 0.45,
    },
  },

  // 8. Chair Sit-to-Stand
  'sit-to-stand': {
    id: 'sit-to-stand',
    exerciseId: 'e1000000-0000-0000-0000-000000000008',
    mode: 'camera',
    nameTh: 'ลุกขึ้นยืนจากเก้าอี้ (Sit-to-Stand)',
    nameEn: 'Chair Sit-to-Stand',
    nameCn: '椅子起立坐下训练',
    descriptionTh: 'นั่งบนเก้าอี้ เท้าทั้งสองข้างวางราบกับพื้น ลุกขึ้นยืนจนตัวตรงเต็มที่ ค้างไว้ 1 วินาที แล้วค่อยๆ นั่งลงช้าๆ',
    descriptionEn: 'Sit on chair with feet flat, rise smoothly to full upright standing position, hold 1s, then sit back down under control.',
    descriptionCn: '平稳坐在椅子上，双脚踩实地面，发力平稳站直并完全挺身，保持1秒后平缓坐回。',
    framing: 'full_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'knee',
    mediaUrl: '/assets/exercises/sit-to-stand.svg',
    clinicalSource: 'CDC STEADI Fall Prevention / ACSM Functional Mobility',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 1.0,
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [2.0, 3.2],
      instructionTextTh: 'วางเก้าอี้หันข้าง 45° ถึง 90° ระยะห่าง 2.0–3.2 ม. ให้เห็นทั้งเก้าอี้และตัวขณะยืนเต็มที่',
      instructionTextEn: 'Chair placed at 45°–90° angle, 2.0–3.2m from camera, ensuring full standing posture is in frame.',
      instructionTextCn: '椅子斜对摄像头45°-90°，距离2.0-3.2米，确保完全站立时全身都在视野内。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 25, pointB: 27, use3DWorld: true },
        right: { pointA: 24, vertex: 26, pointB: 28, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 90,
      targetMinDeg: 160,
      targetMaxDeg: 180,
      toleranceDeg: 10,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 45,
    },
    compensationRules: [
      {
        ruleId: 'stand_anti_cheat_hip_lift',
        type: 'trunk_lean',
        thresholdValue: 0.10,
        warningMessageTh: 'กรุณาลุกขึ้นยืนจากเก้าอี้จริง (อย่ายกเฉพาะขาขณะนั่ง)',
        warningMessageEn: 'Please stand up fully from the chair (do not just kick legs while seated)',
        warningMessageCn: '请完全从椅子上站起（切勿坐着踢腿借力）',
        severity: 'error',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเสียหลักหรือวิงเวียนศีรษะ ให้นั่งลงพักบนเก้าอี้ทันที',
      stopOnPainMessageEn: 'If dizzy or off-balance, sit down immediately.',
      stopOnPainMessageCn: '若感到头晕或重心不稳，请立即坐回椅子休息。',
      maxSafeAngleCapDeg: 180,
    },
    requiredLandmarks: {
      right: [24, 26, 28],
      left: [23, 25, 27],
      bilateral: [23, 24, 25, 26, 27, 28],
    },
    minLandmarkVisibility: {
      23: 0.40,
      24: 0.40,
      25: 0.50,
      26: 0.50,
      27: 0.40,
      28: 0.40,
    },
  },

  // 9. Straight Leg Raise (SLR)
  'straight-leg-raise': {
    id: 'straight-leg-raise',
    exerciseId: 'e1000000-0000-0000-0000-000000000009',
    mode: 'camera',
    nameTh: 'ยกขาตรงท่านอน/นั่ง (Straight Leg Raise - SLR)',
    nameEn: 'Straight Leg Raise (SLR)',
    nameCn: '直腿抬高训练',
    descriptionTh: 'เหยียดเข่าตรง ล็อคข้อเข่าให้ตรงตลอดเวลา ค่อยๆ ยกขาขึ้นทำมุมประมาณ 30°–45° ค้างไว้ 2 วินาที แล้ววางลง',
    descriptionEn: 'Keep knee locked fully straight, slowly raise leg up to 30°–45°, hold for 2s, then lower with control.',
    descriptionCn: '保持膝盖完全锁定伸直，平稳将腿抬高至30°-45°，保持2秒后控制下落。',
    framing: 'full_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'hip',
    mediaUrl: '/assets/exercises/straight-leg-raise.svg',
    clinicalSource: 'JOSPT Low Back Pain & Knee Rehab CPG / Brotzman',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'side_90',
      recommendedDistanceMeters: [2.0, 3.2],
      instructionTextTh: 'นอนหรือนั่งหันข้าง 90° เข้าหากล้อง ให้เห็นสะโพก เข่า และเท้าตลอดช่วงการยก',
      instructionTextEn: 'Side view at 90°, 2.0–3.2m from camera, showing hip, knee, and foot.',
      instructionTextCn: '侧对摄像头90°就坐或平躺，确保髋、膝、脚全程可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 23, pointB: 27, use3DWorld: true }, // Shoulder -> Hip -> Ankle
        right: { pointA: 12, vertex: 24, pointB: 28, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 170,
      targetMinDeg: 125,
      targetMaxDeg: 150,
      toleranceDeg: 10,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'slr_knee_bending',
        type: 'elbow_flexion',
        thresholdValue: 0.15,
        warningMessageTh: 'ล็อคข้อเข่าให้เหยียดตรงตลอดการยกขา (อย่างอเข่า)',
        warningMessageEn: 'Keep knee locked straight throughout leg raise (do not bend knee)',
        warningMessageCn: '抬腿过程中请始终绷直膝关节（切勿屈膝）',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการปวดแปลบลงขาหรือเจ็บหลังส่วนล่าง ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if sharp radiating leg or back pain occurs.',
      stopOnPainMessageCn: '若出现下肢放射痛或腰部刺痛，请立即停止。',
      maxSafeAngleCapDeg: 180,
    },
    requiredLandmarks: {
      right: [12, 24, 26, 28],
      left: [11, 23, 25, 27],
      bilateral: [11, 12, 23, 24, 25, 26, 27, 28],
    },
    minLandmarkVisibility: {
      23: 0.40,
      24: 0.40,
      25: 0.45,
      26: 0.45,
      27: 0.40,
      28: 0.40,
    },
  },

  // 10. Standing Hip Abduction
  'standing-hip-abduction': {
    id: 'standing-hip-abduction',
    exerciseId: 'e1000000-0000-0000-0000-000000000010',
    mode: 'camera',
    nameTh: 'กางสะโพกออกด้านข้างท่ายืน (Standing Hip Abduction)',
    nameEn: 'Standing Hip Abduction',
    nameCn: '站姿髋关节外展',
    descriptionTh: 'ยืนเกาะพนักพิง ลำตัวตรง ค่อยๆ กางขาออกด้านข้าง 25°–40° โดยไม่งอเข่าและไม่เอียงลำตัว ค้างไว้ 1 วินาที แล้วหุบขากลับ',
    descriptionEn: 'Stand holding support, keep trunk upright, raise leg outward 25°–40° without leaning trunk, hold 1s, then return.',
    descriptionCn: '手扶支撑物直立，躯干挺直不借力，将外侧腿平稳向侧方抬起25°-40°，保持1秒后收回。',
    framing: 'full_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'hip',
    mediaUrl: '/assets/exercises/standing-hip-abduction.svg',
    clinicalSource: 'JOSPT Hip Osteoarthritis CPG / Kendall Muscle Testing',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 1.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [2.0, 3.2],
      instructionTextTh: 'ยืนหันหน้าตรงเข้าหากล้อง ระยะห่าง 2.0–3.2 ม. ให้เห็นสะโพกและขาทั้งสองข้างชัดเจน',
      instructionTextEn: 'Face camera directly, 2.0–3.2m distance, ensuring hips and both legs are visible.',
      instructionTextCn: '正对摄像头站立，距离2.0-3.2米，确保髋部及双腿清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 23, pointB: 27, use3DWorld: true }, // Shoulder -> Hip -> Ankle
        right: { pointA: 12, vertex: 24, pointB: 28, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 175,
      targetMinDeg: 130,
      targetMaxDeg: 155,
      toleranceDeg: 10,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'hip_anti_cheat_trunk_lean',
        type: 'trunk_lateral_flexion',
        thresholdValue: 0.10,
        warningMessageTh: 'รักษาลำตัวให้ตรง อย่ายักสะโพกหรือเอียงตัวช่วยยกขา',
        warningMessageEn: 'Keep body upright, do not hike hip or lean sideways to lift leg',
        warningMessageCn: '请保持身体垂直，切勿耸胯或侧倾身体借力',
        severity: 'error',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บบริเวณข้อสะโพก ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if hip pain occurs.',
      stopOnPainMessageCn: '若髋关节疼痛，请立即停止。',
      maxSafeAngleCapDeg: 185,
    },
    requiredLandmarks: {
      right: [23, 24, 26],
      left: [24, 23, 25],
      bilateral: [23, 24, 25, 26],
    },
    minLandmarkVisibility: {
      23: 0.50,
      24: 0.50,
      25: 0.45,
      26: 0.45,
    },
  },

  // 11. Standing Calf Raise (Heel Raise)
  'calf-raise': {
    id: 'calf-raise',
    exerciseId: 'e1000000-0000-0000-0000-000000000011',
    mode: 'camera',
    nameTh: 'เขย่งปลายเท้าท่ายืน (Standing Calf Raise / Heel Raise)',
    nameEn: 'Standing Calf Raise',
    nameCn: '站姿提踵/踮脚尖',
    descriptionTh: 'ยืนตรงเกาะโต๊ะหรือผนัง ค่อยๆ เขย่งส้นเท้าทั้งสองข้างขึ้นให้สูงที่สุด ค้างไว้ 1 วินาที แล้ววางส้นเท้าลงช้าๆ',
    descriptionEn: 'Stand upright holding support, raise both heels as high as possible onto balls of feet, hold 1s, then lower smoothly.',
    descriptionCn: '手扶支撑物站立，平稳将双脚脚后跟抬高至最高点（踮脚），保持1秒后平缓落下。',
    framing: 'full_body',
    evaluationMode: 'heel_raise',
    side: 'bilateral',
    targetJoint: 'ankle',
    mediaUrl: '/assets/exercises/calf-raise.svg',
    clinicalSource: 'AAOS Achilles Tendinopathy Guidelines / ACSM',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 15,
    defaultHoldSec: 1.0,
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [2.0, 3.2],
      instructionTextTh: 'ยืนหันเฉียง 45° ถอยห่าง 2–3 ม. ให้เห็นปลายเท้า ส้นเท้า และช่วงข้อเท้าอย่างชัดเจน',
      instructionTextEn: 'Position at 45° angle, 2–3m away, ensuring feet and ankles are clearly visible.',
      instructionTextCn: '侧身45°站立，距离2-3米，确保双足及脚踝清晰可见。',
    },
    defaultPrescription: {
      repsPerSet: 15,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'heel_excessive_sway',
        type: 'trunk_lean',
        thresholdValue: 0.20,
        warningMessageTh: 'ทรงตัวให้นิ่ง เกาะพนักพิงเบาๆ อย่าโยกตัว',
        warningMessageEn: 'Keep balance steady, avoid excessive swaying',
        warningMessageCn: '请平稳保持平衡，手扶支撑物避免前后晃动',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการเจ็บเอ็นร้อยหวายหรือตะคริว ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if Achilles tendon pain or cramping occurs.',
      stopOnPainMessageCn: '若跟腱刺痛或出现抽筋，请立即停止。',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      right: [28, 30, 32],
      left: [27, 29, 31],
      bilateral: [27, 28, 29, 30, 31, 32],
    },
    minLandmarkVisibility: {
      27: 0.40,
      28: 0.40,
      29: 0.40,
      30: 0.40,
      31: 0.40,
      32: 0.40,
    },
  },

  // 12. Single-Leg Stance Balance
  'single-leg-balance': {
    id: 'single-leg-balance',
    exerciseId: 'e1000000-0000-0000-0000-000000000012',
    mode: 'camera',
    nameTh: 'ยืนทรงตัวขาเดียว (Single-Leg Stance Balance)',
    nameEn: 'Single-Leg Stance Balance',
    nameCn: '单腿站立平衡训练',
    descriptionTh: 'ยืนตัวตรงใกล้ที่เกาะ ค่อยๆ ยกขาข้างหนึ่งลอยขึ้นจากพื้น ทรงตัวบนขาข้างเดียว ค้างไว้ 15–30 วินาที',
    descriptionEn: 'Stand upright near support, lift one foot off floor, balance steadily on single leg for 15–30 seconds.',
    descriptionCn: '靠近支撑物站立，将一侧脚抬离地面，单腿平稳站立保持15-30秒，保持身体平衡。',
    framing: 'full_body',
    evaluationMode: 'hold_balance',
    side: 'bilateral',
    targetJoint: 'balance',
    mediaUrl: '/assets/exercises/single-leg-balance.svg',
    clinicalSource: 'Berg Balance Scale / ACSM Fall Prevention Guidelines',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 3,
    defaultHoldSec: 20.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [2.0, 3.2],
      instructionTextTh: 'ยืนหันหน้าตรงเข้าหากล้อง ถอยห่าง 2–3 ม. ให้เห็นเต็มตัว มีเก้าอี้หรือผนังข้างตัวเพื่อความปลอดภัย',
      instructionTextEn: 'Face camera directly, 2–3m away, full body visible with stable support nearby.',
      instructionTextCn: '正对摄像头，距离2-3米，全身可见，身旁备有支撑物以保安全。',
    },
    defaultPrescription: {
      repsPerSet: 3,
      totalSets: 3,
      restBetweenSetsSec: 30,
      holdDurationSec: 20,
    },
    compensationRules: [
      {
        ruleId: 'balance_excessive_tilt',
        type: 'trunk_lateral_flexion',
        thresholdValue: 12.0,
        warningMessageTh: 'รักษาลำตัวและเชิงกรานให้ขนานตรง อย่าเอียงตัว',
        warningMessageEn: 'Keep trunk and pelvis level, avoid leaning sideways',
        warningMessageCn: '请保持骨盆水平与躯干垂直，避免侧向歪斜',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเริ่มเสียหลักให้วางเท้าลงทันที หรือแตะที่จับเพื่อความปลอดภัย',
      stopOnPainMessageEn: 'Place foot down immediately or hold support if losing balance.',
      stopOnPainMessageCn: '若失去平衡请立即放下脚落地，或轻扶支撑物确保安全。',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      right: [23, 25, 27],
      left: [24, 26, 28],
      bilateral: [23, 24, 25, 26, 27, 28],
    },
    minLandmarkVisibility: {
      23: 0.45,
      24: 0.45,
      25: 0.45,
      26: 0.45,
      27: 0.40,
      28: 0.40,
    },
  },

  // 13. Standing Calf Stretch
  'calf-stretch': {
    id: 'calf-stretch',
    exerciseId: 'e1000000-0000-0000-0000-000000000013',
    mode: 'camera',
    nameTh: 'ยืดกล้ามเนื้อน่องท่ายืนดันผนัง (Standing Gastrocnemius Calf Stretch)',
    nameEn: 'Standing Calf Stretch',
    nameCn: '站姿小腿腓肠肌拉伸',
    descriptionTh: 'ก้าวขาข้างหนึ่งไปด้านหลัง ส้นเท้าวางติดพื้น ขาหลังเหยียดตรง โน้มตัวไปข้างหน้าจนรู้สึกตึงน่อง ค้างไว้ 20–30 วินาที',
    descriptionEn: 'Step one leg back with heel flat on floor and knee straight, lean forward until a gentle calf stretch is felt, hold 20–30s.',
    descriptionCn: '一脚向后跨步，后脚跟完全踩地且后膝伸直，身体前倾感受小腿后侧拉伸，保持20-30秒。',
    framing: 'full_body',
    evaluationMode: 'hold_balance',
    side: 'bilateral',
    targetJoint: 'ankle',
    mediaUrl: '/assets/exercises/calf-stretch.svg',
    clinicalSource: 'ACSM Flexibility Guidelines / JOSPT Plantar Fasciitis CPG',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 3,
    defaultHoldSec: 20.0,
    cameraGuide: {
      recommendedView: 'side_90',
      recommendedDistanceMeters: [2.0, 3.2],
      instructionTextTh: 'ยืนหันข้าง 90° ดันผนังหรือพนักเก้าอี้ ให้เห็นแนวขาทั้งสองข้างและส้นเท้าชัดเจน',
      instructionTextEn: 'Side view at 90°, hands supporting wall/chair, showing legs and rear heel clearly.',
      instructionTextCn: '侧对摄像头90°扶墙或椅背站立，确保双腿及后脚跟清晰可见。',
    },
    defaultPrescription: {
      repsPerSet: 3,
      totalSets: 3,
      restBetweenSetsSec: 30,
      holdDurationSec: 20,
    },
    compensationRules: [
      {
        ruleId: 'stretch_rear_heel_up',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'วางส้นเท้าหลังติดพื้นตลอดเวลา (อย่าให้ส้นเท้าลอย)',
        warningMessageEn: 'Keep rear heel flat on the ground at all times',
        warningMessageCn: '请保持后脚跟始终紧贴地面，切勿抬起',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'ยืดแค่รู้สึกตึงสบาย ห้ามกระตุกหรือออกแรงจนปวดเสียว',
      stopOnPainMessageEn: 'Stretch to gentle tension only, never bounce or force into pain.',
      stopOnPainMessageCn: '仅需感到舒适紧绷即可，切勿弹振或过度用力致痛。',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      right: [24, 26, 28, 30],
      left: [23, 25, 27, 29],
      bilateral: [23, 24, 25, 26, 27, 28, 29, 30],
    },
    minLandmarkVisibility: {
      23: 0.40,
      24: 0.40,
      25: 0.45,
      26: 0.45,
      27: 0.40,
      28: 0.40,
    },
  },

  // 14. Cervical Retraction / Chin Tuck (Timer Mode)
  'chin-tuck': {
    id: 'chin-tuck',
    exerciseId: 'e1000000-0000-0000-0000-000000000014',
    mode: 'timer',
    nameTh: 'เก็บเหนียงเสริมกล้ามเนื้อคอด้านลึก (Cervical Retraction / Chin Tuck)',
    nameEn: 'Cervical Retraction (Chin Tuck)',
    nameCn: '颈椎回缩/收下颌训练',
    descriptionTh: 'ตามองตรง ดึงคางและศีรษะเข้าหาลำคอในแนวราบ ค้างไว้ 5 วินาที แล้วคลายช้าๆ (โหมดจับเวลาพร้อมตัวช่วยบอกจังหวะ)',
    descriptionEn: 'Looking straight ahead, retract chin horizontally backward making a double chin, hold for 5s, then relax smoothly.',
    descriptionCn: '平视前方，水平向后收紧下颌（形成双下巴感），保持5秒后平缓放松（节律计时器引导）。',
    framing: 'head_shoulders',
    evaluationMode: 'timer',
    side: 'bilateral',
    targetJoint: 'neck',
    mediaUrl: '/assets/exercises/chin-tuck.svg',
    clinicalSource: 'JOSPT Neck Pain CPG / McKenzie Cervical Method',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 5.0,
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [1.0, 2.0],
      instructionTextTh: 'นั่งตัวตรง หันหน้าเข้าหากล้องหรือเฉียง 45° ปฏิบัติตามจังหวะนับถอยหลังบนหน้าจอ',
      instructionTextEn: 'Sit upright, follow the visual breathing and timer pacing on screen.',
      instructionTextCn: '端坐挺直，跟随屏幕上的呼吸与倒计时节律训练。',
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
      holdDurationSec: 5,
    },
    compensationRules: [],
    safetyContraindications: {
      stopOnPainMessageTh: 'ห้ามก้มหน้าลง ให้ดึงคางไปด้านหลังตรงๆ หากมีอาการเวียนศีรษะให้หยุดทันที',
      stopOnPainMessageEn: 'Do not tilt head down; retract backward. Stop immediately if dizziness occurs.',
      stopOnPainMessageCn: '请勿低头，水平后缩下颌。若头晕请立即停止。',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      right: [0, 8, 12],
      left: [0, 7, 11],
      bilateral: [0, 7, 8, 11, 12],
    },
    minLandmarkVisibility: {
      0: 0.35,
      11: 0.35,
      12: 0.35,
    },
  },

  // 15. Codman Shoulder Pendulum (Timer Mode)
  'shoulder-pendulum': {
    id: 'shoulder-pendulum',
    exerciseId: 'e1000000-0000-0000-0000-000000000015',
    mode: 'timer',
    nameTh: 'แกว่งแขนผ่อนคลายหัวไหล่ (Codman Pendulum Exercise)',
    nameEn: 'Codman Shoulder Pendulum',
    nameCn: '考德曼钟摆摆臂放松',
    descriptionTh: 'โน้มตัวไปข้างหน้า ปล่อยแขนห้อยตรงตามแรงโน้มถ่วง แกว่งแขนเป็นวงกลมผ่อนคลายหัวไหล่ 45 วินาที (โหมดจับเวลา)',
    descriptionEn: 'Lean forward, let arm hang loose under gravity, swing gently in circular motions for 45 seconds per set.',
    descriptionCn: '身体前倾，手臂自然下垂顺应重力轻柔画圈摆动45秒，放松肩关节。',
    framing: 'upper',
    evaluationMode: 'timer',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/shoulder-pendulum.svg',
    clinicalSource: 'Codman Classical Exercise / AAOS Frozen Shoulder Rehab',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    defaultSets: 3,
    defaultReps: 1,
    defaultDurationSec: 45,
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'โน้มตัวไปข้างหน้า ปล่อยแขนห้อยสบายๆ แกว่งเป็นวงกลมตามตัวนับเวลา 45 วินาที',
      instructionTextEn: 'Lean forward slightly, arm hanging relaxed, follow the 45-second timer.',
      instructionTextCn: '微向前倾，手臂自然下垂，跟随45秒计时平稳画圈。',
    },
    pendulumMechanics: {
      minTrunkForwardTiltDeg: 18.0,
      maxTrunkForwardTiltDeg: 65.0,
      minElbowStraightnessDeg: 145.0,
      minCircleRadiusRatio: 0.07,
      maxCircleRadiusRatio: 0.35,
      minCycleDurationSec: 1.2,
      maxCycleDurationSec: 5.0,
    },
    defaultPrescription: {
      repsPerSet: 1,
      totalSets: 3,
      restBetweenSetsSec: 30,
      durationSec: 45,
    },
    compensationRules: [
      {
        ruleId: 'pendulum_trunk_lean',
        type: 'trunk_lean',
        thresholdValue: 0.25,
        warningMessageTh: 'โน้มตัวให้มั่นคง ปล่อยแขนแกว่งอย่างผ่อนคลาย',
        warningMessageEn: 'Keep trunk steady, allow arm to swing freely',
        warningMessageCn: '请保持身体稳定，让手臂自然放松摆动',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการเจ็บบริเวณข้อไหล่ ให้หยุดทันทีและแจ้งนักกายภาพบำบัด',
      stopOnPainMessageEn: 'Stop immediately if sharp shoulder pain occurs.',
      stopOnPainMessageCn: '若肩部出现明显疼痛，请立即停止。',
      maxSafeAngleCapDeg: 90,
    },
    requiredLandmarks: {
      right: [12, 14, 16],
      left: [11, 13, 15],
      bilateral: [11, 12, 13, 14],
    },
    minLandmarkVisibility: {
      11: 0.40,
      12: 0.40,
      13: 0.40,
      14: 0.40,
    },
  },

  // Legacy & Auxiliary Exercises for System Compatibility
  'wall-pushup': {
    id: 'wall-pushup',
    exerciseId: 'e1000000-0000-0000-0000-000000000098',
    mode: 'camera',
    nameTh: 'ดันผนังเสริมกำลังแขนและลำตัว (Wall Push-up)',
    nameEn: 'Wall Push-up',
    nameCn: '站姿推墙训练',
    descriptionTh: 'ยืนหันหน้าเข้าหาผนัง วางฝ่ามือระนาบเดียวกับหัวไหล่ ค่อยๆ งอศอกโน้มตัวเข้าหาผนัง แล้วดันตัวกลับสู่ตำแหน่งเริ่มต้น',
    descriptionEn: 'Stand facing wall, hands shoulder-width apart, bend elbows toward wall and press back smoothly.',
    descriptionCn: '面对墙壁站立，双手与肩同宽撑墙，平稳屈肘贴近墙面后推回原位。',
    framing: 'upper',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'elbow',
    mediaUrl: '/assets/exercises/elbow-flexion-extension.svg',
    clinicalSource: 'ACSM Closed Kinetic Chain Upper Body Strengthening',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [1.8, 2.8],
      instructionTextTh: 'ยืนหันเฉียง 45° เข้าหากล้อง ห่างผนัง 1 ก้าว วางมือบนผนังระดับอก',
      instructionTextEn: 'Position side-on at 45° angle, one step from wall, hands at chest height.',
      instructionTextCn: '侧身45°面向摄像头，距墙一步，双手平放于胸部高度。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 13, pointB: 15, use3DWorld: true },
        right: { pointA: 12, vertex: 14, pointB: 16, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 170,
      targetMinDeg: 80,
      targetMaxDeg: 105,
      toleranceDeg: 10,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'pushup_trunk_sag',
        type: 'trunk_lean',
        thresholdValue: 0.20,
        warningMessageTh: 'เกร็งลำตัวให้เป็นแนวเส้นตรง อย่าแอ่นหลังหรือก้มหน้า',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บบริเวณข้อมือหรือหัวไหล่ ให้ลดระยะห่างหรือหยุดทันที',
      maxSafeAngleCapDeg: 180,
    },
  },

  'neck-side-tilt': {
    id: 'neck-side-tilt',
    exerciseId: 'e1000000-0000-0000-0000-000000000099',
    mode: 'camera',
    nameTh: 'เอียงคอด้านข้างเพิ่มพิสัยข้อต่อ (Neck Side Tilt)',
    nameEn: 'Neck Side Tilt',
    nameCn: '颈部侧屈活动度训练',
    descriptionTh: 'นั่งตัวตรง ค่อยๆ เอียงศีรษะนำใบหูเข้าหาหัวไหล่ช้าๆ จนรู้สึกตึงสบาย ค้างไว้ แล้วกลับสู่ท่าตรง',
    descriptionEn: 'Sit upright, gently tilt ear toward shoulder until a light stretch is felt, hold briefly, then return to center.',
    descriptionCn: '保持身姿直立，缓慢将耳朵贴近同侧肩部，稍作停顿后回到中间。',
    framing: 'head_shoulders',
    evaluationMode: 'neck_tilt',
    side: 'bilateral',
    targetJoint: 'neck',
    mediaUrl: '/assets/exercises/chin-tuck.svg',
    clinicalSource: 'AAOS Cervical Range of Motion Guidelines',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบสามารถปรับจำนวนเซ็ต ครั้ง เวลาค้าง และช่วงมุมตามผู้ป่วยแต่ละราย',
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.0, 2.0],
      instructionTextTh: 'นั่งตัวตรง หันหน้าตรงเข้าหากล้อง ให้เห็นศีรษะ ใบหู และหัวไหล่ชัดเจน',
      instructionTextEn: 'Face camera directly sitting upright, head, ears, and shoulders clearly visible.',
      instructionTextCn: '正对摄像头端坐，确保头部、双耳和双肩清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 7, vertex: 11, pointB: 12 },
        right: { pointA: 8, vertex: 12, pointB: 11 },
      },
      direction: 'increase',
      startAngleDeg: 0,
      targetMinDeg: 18,
      targetMaxDeg: 35,
      toleranceDeg: 6,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'neck_shoulder_hike',
        type: 'shoulder_shrug',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าเกร็งยกหัวไหล่ขึ้นตาม ให้ผ่อนคลายหัวไหล่ไว้',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการมึนงง ชาลงแขน หรือปวดแปลบ ให้หยุดทันที',
      maxSafeAngleCapDeg: 40,
    },
  },
};

// Aliases for Backwards Compatibility
CLINICAL_EXERCISES_CONFIG['shoulder-flexion'] = {
  ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'],
  id: 'shoulder-flexion',
};
CLINICAL_EXERCISES_CONFIG['shoulder-abd'] = {
  ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
  id: 'shoulder-abd',
};
CLINICAL_EXERCISES_CONFIG['elbow-flexion'] = {
  ...CLINICAL_EXERCISES_CONFIG['elbow-flexion-extension'],
  id: 'elbow-flexion',
};
CLINICAL_EXERCISES_CONFIG['seated-knee-ext'] = {
  ...CLINICAL_EXERCISES_CONFIG['seated-knee-extension'],
  id: 'seated-knee-ext',
};
CLINICAL_EXERCISES_CONFIG['standing-hip-abd'] = {
  ...CLINICAL_EXERCISES_CONFIG['standing-hip-abduction'],
  id: 'standing-hip-abd',
};
CLINICAL_EXERCISES_CONFIG['heel-raise'] = {
  ...CLINICAL_EXERCISES_CONFIG['calf-raise'],
  id: 'heel-raise',
};

// 15 Canonical Clinical Exercises Array
export const ALL_CLINICAL_EXERCISES: ExerciseDetectionConfig[] = [
  CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'],
  CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
  CLINICAL_EXERCISES_CONFIG['shoulder-er-band'],
  CLINICAL_EXERCISES_CONFIG['scapular-retraction'],
  CLINICAL_EXERCISES_CONFIG['elbow-flexion-extension'],
  CLINICAL_EXERCISES_CONFIG['seated-knee-extension'],
  CLINICAL_EXERCISES_CONFIG['mini-squat'],
  CLINICAL_EXERCISES_CONFIG['sit-to-stand'],
  CLINICAL_EXERCISES_CONFIG['straight-leg-raise'],
  CLINICAL_EXERCISES_CONFIG['standing-hip-abduction'],
  CLINICAL_EXERCISES_CONFIG['calf-raise'],
  CLINICAL_EXERCISES_CONFIG['single-leg-balance'],
  CLINICAL_EXERCISES_CONFIG['calf-stretch'],
  CLINICAL_EXERCISES_CONFIG['chin-tuck'],
  CLINICAL_EXERCISES_CONFIG['shoulder-pendulum'],
];

export function getClinicalExerciseConfig(idOrName?: string | null): ExerciseDetectionConfig | null {
  if (!idOrName) return null;
  const q = idOrName.toLowerCase().trim();

  if (CLINICAL_EXERCISES_CONFIG[q]) {
    return CLINICAL_EXERCISES_CONFIG[q];
  }

  // Direct priority matchers
  if (q === 'ดันผนัง' || q === 'wall-pushup') return CLINICAL_EXERCISES_CONFIG['wall-pushup'];
  if (q.includes('侧倾') || q === 'neck-side-tilt') return CLINICAL_EXERCISES_CONFIG['neck-side-tilt'];

  for (const ex of ALL_CLINICAL_EXERCISES) {
    if (ex.id === q || ex.exerciseId === q) return ex;
    if (ex.nameTh.toLowerCase().includes(q) || q.includes(ex.nameTh.toLowerCase())) return ex;
    if (ex.nameEn.toLowerCase().includes(q) || q.includes(ex.nameEn.toLowerCase())) return ex;
    if (ex.nameCn && (ex.nameCn.includes(q) || q.includes(ex.nameCn))) return ex;
  }

  // Fallback Keyword Matchers (Specific joint matching before generic motions)
  if (q.includes('elbow') || q.includes('ศอก') || q.includes('屈伸')) return CLINICAL_EXERCISES_CONFIG['elbow-flexion'];
  if (q.includes('pendulum') || q.includes('แกว่งแขน') || q.includes('钟摆') || q.includes('codman')) return CLINICAL_EXERCISES_CONFIG['shoulder-pendulum'];
  if (q.includes('flexion') || q.includes('ยกแขน') || q.includes('前屈')) return CLINICAL_EXERCISES_CONFIG['shoulder-flexion'];
  if (q.includes('abduction') || q.includes('กางแขน') || q.includes('外展')) return CLINICAL_EXERCISES_CONFIG['shoulder-abduction'];
  if (q.includes('external') || q.includes('ยางยืด') || q.includes('er-band') || q.includes('外旋')) return CLINICAL_EXERCISES_CONFIG['shoulder-er-band'];
  if (q.includes('scapula') || q.includes('สะบัก') || q.includes('肩胛')) return CLINICAL_EXERCISES_CONFIG['scapular-retraction'];
  if (q.includes('squat') || q.includes('สควอท') || q.includes('浅蹲')) return CLINICAL_EXERCISES_CONFIG['mini-squat'];
  if (q.includes('stand') || q.includes('ลุกยืน') || q.includes('起立') || q.includes('sit-to-stand')) return CLINICAL_EXERCISES_CONFIG['sit-to-stand'];
  if (q.includes('straight') || q.includes('slr') || q.includes('ยกขาตรง') || q.includes('直腿抬高')) return CLINICAL_EXERCISES_CONFIG['straight-leg-raise'];
  if (q.includes('seated-knee') || q.includes('เหยียดเข่า') || q.includes('伸膝')) return CLINICAL_EXERCISES_CONFIG['seated-knee-ext'];
  if (q.includes('hip-abd') || q.includes('กางสะโพก') || q.includes('侧抬腿')) return CLINICAL_EXERCISES_CONFIG['standing-hip-abd'];
  if (q.includes('calf-raise') || q.includes('heel') || q.includes('เขย่ง') || q.includes('提踵')) return CLINICAL_EXERCISES_CONFIG['heel-raise'];
  if (q.includes('balance') || q.includes('ทรงตัว') || q.includes('单腿')) return CLINICAL_EXERCISES_CONFIG['single-leg-balance'];
  if (q.includes('calf-stretch') || q.includes('ยืดน่อง') || q.includes('拉伸小腿')) return CLINICAL_EXERCISES_CONFIG['calf-stretch'];
  if (q.includes('chin') || q.includes('เหนียง') || q.includes('retraction') || q.includes('收下颌')) return CLINICAL_EXERCISES_CONFIG['chin-tuck'];
  if (q.includes('pushup') || q.includes('ดันผนัง') || q.includes('推墙')) return CLINICAL_EXERCISES_CONFIG['wall-pushup'];
  if (q.includes('neck') || q.includes('คอ') || q.includes('侧倾')) return CLINICAL_EXERCISES_CONFIG['neck-side-tilt'];

  return null;
}

export interface PatientClinicalSummary {
  contraindications?: string | null;
  underlying_diseases?: string | null;
  injury?: string | null;
  target_joint?: string | null;
  history?: {
    contraindications?: string | null;
    chronic_diseases?: string | null;
    target_joint?: string | null;
  } | null;
  [key: string]: any;
}

export function evaluateContraindications(
  exerciseId: string,
  targetJoint: string,
  patient?: PatientClinicalSummary | null
): { hasWarning: boolean; warningMessage: string; reason?: string } {
  if (!patient) return { hasWarning: false, warningMessage: '' };

  const rawContra = `${patient.contraindications || ''} ${patient.history?.contraindications || ''}`.toLowerCase();
  const rawDiseases = `${patient.underlying_diseases || ''} ${patient.history?.chronic_diseases || ''}`.toLowerCase();
  const rawInjury = `${patient.injury || ''} ${patient.diagnosis || ''}`.toLowerCase();
  const combinedText = `${rawContra} ${rawDiseases} ${rawInjury}`;

  const pJoint = (patient.target_joint || patient.history?.target_joint || '').toLowerCase();
  const exJoint = (targetJoint || '').toLowerCase();

  // 1. Shoulder constraints (e.g. Abduction restriction / Rotator cuff / Post-op)
  if (exerciseId.includes('shoulder') || exJoint.includes('ไหล่') || exJoint.includes('shoulder')) {
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

  // 2. Weight-bearing / Fall risk / Standing constraints
  if (
    exerciseId === 'sit-to-stand' ||
    exerciseId === 'standing-hip-abduction' ||
    exerciseId === 'standing-hip-abd' ||
    exerciseId === 'calf-raise' ||
    exerciseId === 'heel-raise' ||
    exerciseId === 'mini-squat' ||
    exerciseId === 'single-leg-balance' ||
    exerciseId === 'calf-stretch' ||
    exerciseId.includes('squat') ||
    exerciseId.includes('stand')
  ) {
    if (
      combinedText.includes('ห้ามลงน้ำหนัก') ||
      combinedText.includes('หกล้ม') ||
      combinedText.includes('balance') ||
      combinedText.includes('กระดูกหัก') ||
      combinedText.includes('ข้อเข่าเสื่อมรุนแรง') ||
      combinedText.includes('non-weight bearing') ||
      combinedText.includes('เสี่ยงล้ม')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนความปลอดภัย: ผู้ป่วยมีความเสี่ยงล้ม หรือมีข้อห้ามลงน้ำหนัก (Non-weight bearing) ควรมีนักกายภาพบำบัดดูแลใกล้ชิด หรือพิจารณาเปลี่ยนเป็นท่ายกขาท่านั่ง (Seated Knee Extension) แทน',
        reason: 'fall_risk_weight_bearing',
      };
    }
  }

  // 3. Neck / Cervical constraints
  if (exerciseId === 'chin-tuck' || exerciseId === 'neck-side-tilt' || exJoint.includes('คอ') || exJoint.includes('neck')) {
    if (
      combinedText.includes('กระดูกคอเสื่อม') ||
      combinedText.includes('cervical') ||
      combinedText.includes('มึนงง') ||
      combinedText.includes('เวียนศีรษะ') ||
      combinedText.includes('หมอนรองกระดูกคอ')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนระวัง: ผู้ป่วยมีประวัติเกี่ยวกับกระดูกสันหลังระดับคอ/มึนงง ให้ควบคุมจังหวะและหยุดทันทีหากมีอาการเวียนศีรษะหรือชาลงแขน',
        reason: 'cervical_spine_warning',
      };
    }
  }

  // 4. Joint discrepancy advisory
  if (pJoint && exJoint && !pJoint.includes(exJoint) && !exJoint.includes(pJoint)) {
    if (
      (pJoint.includes('เข่า') && !exJoint.includes('เข่า')) ||
      (pJoint.includes('ไหล่') && !exJoint.includes('ไหล่'))
    ) {
      return {
        hasWarning: true,
        warningMessage: `ℹ️ ข้อสังเกต: ท่านี้บริหาร ${targetJoint} ซึ่งต่างจากข้อต่อเป้าหมายหลักของผู้ป่วย (${patient.target_joint}) แนะนำให้ตรวจสอบว่าเป็นการฝึกเสริมหรือไม่`,
        reason: 'target_joint_mismatch',
      };
    }
  }

  return { hasWarning: false, warningMessage: '' };
}
