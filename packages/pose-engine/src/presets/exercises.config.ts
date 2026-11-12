/**
 * packages/pose-engine/src/presets/exercises.config.ts
 *
 * DRTECH.CARE CENTRAL CLINICAL EXERCISE CONFIGURATION CATALOG
 * 15 Standard Clinical Exercises with Trilingual Metadata (TH / EN / CN),
 * MediaPipe landmark indices, framing requirements, clinical sources,
 * and biomechanical anti-cheat parameters.
 */

import { ExerciseDetectionConfig, ExerciseCoachingCues, BodySide } from '../types/exerciseConfig';

export const CLINICAL_EXERCISES_CONFIG: Record<string, ExerciseDetectionConfig> = {
  // 1. Active Shoulder Flexion
  'active-shoulder-flexion': {
    id: 'active-shoulder-flexion',
    exerciseId: 'e1000000-0000-0000-0000-000000000001',
    is_active: true,
    camera_framing: 'upper_body',
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
      instructionTextTh: 'นั่งหรือยืนให้เห็นลำตัวและแขนข้างที่ฝึกชัดเจน โดยให้แขนและข้อศอกอยู่ในกรอบภาพ',
      instructionTextEn: 'Sit or stand ensuring trunk and exercise arm (including elbow) are fully visible in frame.',
      instructionTextCn: '端坐或站立，确保躯干及训练手臂（包含手肘）完整在画面内。',
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
    elevationPlane: {
      requiredPlane: 'flexion',
      targetMinDeg: 60.0,
      targetMaxDeg: 120.0,
      scaptionMinDeg: 30.0,
      scaptionMaxDeg: 60.0,
      minElevationDegToEnforce: 30.0,
      framesAvgCount: 4,
      warningMessageTh: 'ทำผิดท่า: ให้ยกแขนไปข้างหน้า',
      warningMessageEn: 'Incorrect Form: Please raise arm forward',
      warningMessageCn: '动作错误：请向前上方举臂',
      scaptionCueTh: 'ใกล้เคียง: หุบแขนเข้าด้านหน้าอีกเล็กน้อย',
      scaptionCueEn: 'Close: Move arm slightly more forward',
      scaptionCueCn: '接近达标：请将手臂再往前收一些',
    },
    formGate: {
      minElbowExtensionDeg: 145, // [ต้องให้นักกายภาพตรวจสอบ] ป้องกันท่างอศอกพับ
      minWristSeparationNorm: 0.14, // [ต้องให้นักกายภาพตรวจสอบ] ป้องกันท่ายกกำปั้น/ข้อมือไขว้ชิดกันหน้าคาง
      minLandmarkVisibility: 0.50,
      disallowScapularHiking: true,
      elbowBentCueTh: 'กรุณาเหยียดข้อศอกให้ตรงขณะยกแขน',
      elbowBentCueEn: 'Please keep your elbow straight',
      elbowBentCueCn: '抬臂时请保持肘部伸直',
      wristCrossedCueTh: 'กรุณาแยกมือทั้งสองข้างออกจากกัน',
      wristCrossedCueEn: 'Please keep your hands separated',
      wristCrossedCueCn: '请将双手分开，不要交叉',
      scapularHikingCueTh: 'อย่าเกร็งยกหัวไหล่ขึ้น ให้ยกเฉพาะแขน',
      scapularHikingCueEn: 'Do not shrug shoulder upward, isolate arm movement',
      scapularHikingCueCn: '请勿耸肩借力，保持肩胛平稳',
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
    is_active: true,
    camera_framing: 'upper_body',
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
    mediaUrl: '/exercises/shoulder-abduction.mp4',
    mediaType: 'video',
    fallbackMediaUrl: '/assets/exercises/shoulder-abduction.svg',
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
    elevationPlane: {
      requiredPlane: 'abduction',
      targetMinDeg: -30.0,
      targetMaxDeg: 30.0,
      scaptionMinDeg: 30.0,
      scaptionMaxDeg: 60.0,
      minElevationDegToEnforce: 30.0,
      framesAvgCount: 4,
      warningMessageTh: 'ทำผิดท่า: ให้กางแขนออกด้านข้าง',
      warningMessageEn: 'Incorrect Form: Please raise arm out to the side',
      warningMessageCn: '动作错误：请向侧方展开手臂',
      scaptionCueTh: 'ใกล้เคียง: กางแขนออกด้านข้างอีกเล็กน้อย',
      scaptionCueEn: 'Close: Move arm slightly more out to the side',
      scaptionCueCn: '接近达标：请将手臂再向侧面展开一些',
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
    is_active: true,
    camera_framing: 'upper_body',
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
    is_active: true,
    camera_framing: 'upper_body',
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
    is_active: true,
    camera_framing: 'upper_body',
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
      startAngleDeg: 160,
      targetMinDeg: 35,
      targetMaxDeg: 50,
      toleranceDeg: 8,
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    /* [ต้องให้นักกายภาพตรวจสอบ]: startAngleDeg: 160°, target: 35°-50°, tolerance: 8°, elbowDriftTolerance: 0.14 */
    formGate: {
      minLandmarkVisibility: 0.50,
      elbowDriftTolerance: 0.14,
      disallowOutOfFrame: true,
      missingArmCueTh: 'กรุณาถอยหลังให้เห็นแขนและข้อศอกชัดเจน',
      missingArmCueEn: 'Please step back so your arm and elbow are clearly visible',
      missingArmCueCn: '请后退以确保手臂和手肘清晰可见',
      elbowDriftCueTh: 'กรุณาแนบข้อศอกกับลำตัว อย่ายกศอกกางออก',
      elbowDriftCueEn: 'Keep your elbow tucked close to your torso',
      elbowDriftCueCn: '屈肘时请将肘部贴近躯干，避免向外张开',
      incompleteFlexionCueTh: 'กรุณางอข้อศอกให้มากขึ้นจนถึงมุมเป้าหมาย',
      incompleteFlexionCueEn: 'Please bend your elbow further to target flexion',
      incompleteFlexionCueCn: '请继续向上弯曲手肘至目标角度',
      incompleteExtensionCueTh: 'กรุณาเหยียดแขนให้สุดก่อนเริ่มครั้งถัดไป',
      incompleteExtensionCueEn: 'Please fully extend your arm before the next rep',
      incompleteExtensionCueCn: '请将手臂完全伸直后再开始下一次动作',
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
      11: 0.50,
      12: 0.50,
      13: 0.50,
      14: 0.50,
      15: 0.50,
      16: 0.50,
    },
  },

  // 6. Seated Knee Extension
  'seated-knee-extension': {
    id: 'seated-knee-extension',
    exerciseId: 'e1000000-0000-0000-0000-000000000006',
    is_active: false,
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
    is_active: false,
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
    is_active: false,
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
    is_active: false,
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
    is_active: false,
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
    is_active: false,
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
    is_active: false,
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
    is_active: false,
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
    is_active: true,
    camera_framing: 'upper_body',
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
    is_active: false,
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
  // 16. Seated Cervical Rotation
  'seated-cervical-rotation': {
    id: 'seated-cervical-rotation',
    exerciseId: 'e1000000-0000-0000-0000-000000000016',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'camera',
    nameTh: 'หันศีรษะซ้าย-ขวา (Seated Cervical Rotation)',
    nameEn: 'Seated Cervical Rotation',
    nameCn: '坐姿颈部旋转',
    descriptionTh: 'นั่งหลังตรงบนเก้าอี้ เท้าวางราบกับพื้น ค่อยๆ หันศีรษะไปทางซ้ายจนรู้สึกตึงพอดี ค้างไว้ 2 วินาที แล้วหมุนกลับมาตรงกลาง จากนั้นสลับหันไปทางขวา',
    descriptionEn: 'Sit upright in chair with feet flat. Slowly rotate head to the left until comfortable stretch, hold 2s, return to center, then rotate right.',
    descriptionCn: '端坐于椅子上，双脚平放地面。缓慢向左转头至舒适拉伸感，保持2秒后回到中位，再向右转。',
    framing: 'upper_body',
    evaluationMode: 'neck_tilt',
    side: 'bilateral',
    targetJoint: 'neck',
    mediaUrl: '/assets/exercises/seated-cervical-rotation.svg',
    clinicalSource: 'AAOS Cervical Spine Protocol / McKenzie Method',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'กล้องหน้าตรงครึ่งตัวบน | องศาเป้าหมาย 45°–60° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรง หันหน้าเข้าหากล้อง ให้เห็นศีรษะ ใบหู และหัวไหล่ทั้งสองข้างชัดเจน',
      instructionTextEn: 'Sit upright facing camera, ensuring head, ears, and both shoulders are visible.',
      instructionTextCn: '端坐面向摄像头，确保头部、双耳及双肩清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 7, vertex: 11, pointB: 12 },
        right: { pointA: 8, vertex: 12, pointB: 11 },
      },
      direction: 'increase',
      startAngleDeg: 0,
      targetMinDeg: 45,
      targetMaxDeg: 60,
      toleranceDeg: 8,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'cervical_shoulder_hike',
        type: 'shoulder_shrug',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าเกร็งยกหัวไหล่ขึ้นตาม ให้ผ่อนคลายหัวไหล่ไว้',
        warningMessageEn: 'Keep shoulders relaxed and down, do not shrug',
        warningMessageCn: '请放松双肩，切勿耸肩',
        severity: 'warning',
      },
      {
        ruleId: 'cervical_trunk_lean',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'รักษาลำตัวให้ตรง อย่าเอียงตัวช่วยหันศีรษะ',
        warningMessageEn: 'Keep torso upright, avoid leaning body to rotate neck',
        warningMessageCn: '保持躯干正直，避免倾斜身体借力',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการเวียนศีรษะ มึนงง หรือมีอาการชาเสียวร้าวลงแขน ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if dizziness, numbness, or tingling down arm occurs',
      stopOnPainMessageCn: '若出现头晕目眩或手臂麻木放射痛，请立即停止',
      maxSafeAngleCapDeg: 75,
    },
    requiredLandmarks: {
      bilateral: [0, 7, 8, 11, 12],
      left: [0, 7, 11],
      right: [0, 8, 12],
    },
    minLandmarkVisibility: {
      0: 0.50,
      7: 0.40,
      8: 0.40,
      11: 0.50,
      12: 0.50,
    },
  },

  // 17. Cervical Side Bend
  'cervical-side-bend': {
    id: 'cervical-side-bend',
    exerciseId: 'e1000000-0000-0000-0000-000000000017',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'camera',
    nameTh: 'เอียงศีรษะเข้าหาไหล่ (Cervical Side Bend)',
    nameEn: 'Cervical Side Bend',
    nameCn: '颈部侧屈',
    descriptionTh: 'นั่งหลังตรงบนเก้าอี้ เท้าวางราบกับพื้น ค่อยๆ เอียงศีรษะนำใบหูเข้าหาหัวไหล่ช้าๆ โดยไม่ยกหัวไหล่ขึ้นมารับ ค้างไว้ 2 วินาที แล้วกลับสู่ท่าตรง',
    descriptionEn: 'Sit upright. Gently tilt head to bring ear toward shoulder without lifting the shoulder, hold 2s, return upright.',
    descriptionCn: '端坐椅子上。平缓侧屈头部使耳朵靠近同侧肩部，切勿耸肩，保持2秒后回正。',
    framing: 'upper_body',
    evaluationMode: 'neck_tilt',
    side: 'bilateral',
    targetJoint: 'neck',
    mediaUrl: '/assets/exercises/cervical-side-bend.svg',
    clinicalSource: 'AAOS Cervical Standards / JOSPT Neck Pain CPG',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'กล้องหน้าตรงครึ่งตัวบน | องศาเป้าหมาย 20°–35° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรง หันหน้าเข้าหากล้อง ให้เห็นศีรษะ ใบหู และหัวไหล่สองข้างชัดเจน',
      instructionTextEn: 'Sit upright facing camera, showing head, ears, and shoulders clearly.',
      instructionTextCn: '端坐面向摄像头，确保头部、双耳及双肩清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 7, vertex: 11, pointB: 12 },
        right: { pointA: 8, vertex: 12, pointB: 11 },
      },
      direction: 'increase',
      startAngleDeg: 0,
      targetMinDeg: 20,
      targetMaxDeg: 35,
      toleranceDeg: 6,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'sidebend_shoulder_hike',
        type: 'shoulder_shrug',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าเกร็งยกหัวไหล่ขึ้นรับใบหู ให้ผ่อนคลายหัวไหล่ไว้',
        warningMessageEn: 'Do not hike shoulder to meet ear, keep shoulders relaxed',
        warningMessageCn: '请勿耸肩贴耳，保持肩部自然下沉',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการมึนงง เสียวแปลบลงแขน หรือปวดร้าว ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if dizziness, radiating pain, or tingling occurs',
      stopOnPainMessageCn: '若出现眩晕或手臂放射刺痛，请立即停止',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      bilateral: [7, 8, 11, 12],
      left: [7, 11],
      right: [8, 12],
    },
    minLandmarkVisibility: {
      7: 0.40,
      8: 0.40,
      11: 0.50,
      12: 0.50,
    },
  },

  // 18. Shoulder Shrug
  'shoulder-shrug': {
    id: 'shoulder-shrug',
    exerciseId: 'e1000000-0000-0000-0000-000000000018',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'camera',
    nameTh: 'ยักไหล่ขึ้น-ลง (Shoulder Shrug)',
    nameEn: 'Shoulder Shrug',
    nameCn: '耸肩训练',
    descriptionTh: 'นั่งหลังตรง แขนสองข้างปล่อยแนบลำตัว ยกหัวไหล่ทั้งสองข้างขึ้นตรงๆ เข้าหาใบหู ค้างไว้ 2 วินาที แล้วค่อยๆ ผ่อนไหล่ลงสู่ตำแหน่งเดิมอย่างช้าๆ',
    descriptionEn: 'Sit upright with arms at sides. Shrug both shoulders straight up toward ears, hold 2s, then lower smoothly.',
    descriptionCn: '端坐姿势，双臂自然下垂。双肩垂直向上耸向耳朵，保持2秒后平缓下落。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'scapula',
    mediaUrl: '/assets/exercises/shoulder-shrug.svg',
    clinicalSource: 'ACSM Exercise Testing and Prescription',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'กล้องหน้าตรงครึ่งตัวบน | ระยะยกไหล่สัมพันธ์ 0.08–0.12 (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 12,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรงหน้าตรง ให้เห็นศีรษะและลำตัวช่วงบนตั้งแต่เอวขึ้นไป',
      instructionTextEn: 'Sit upright facing camera, showing head and upper torso clearly.',
      instructionTextCn: '正面端坐，确保头部及腰部以上躯干清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 7, vertex: 11, pointB: 23 },
        right: { pointA: 8, vertex: 12, pointB: 24 },
      },
      direction: 'decrease',
      startAngleDeg: 165,
      targetMinDeg: 130,
      targetMaxDeg: 145,
      toleranceDeg: 10,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 12,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'shrug_head_poke',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'ห้ามยื่นคอหรือก้มศีรษะไปข้างหน้า ให้ยกเฉพาะหัวไหล่ขึ้นตรงๆ',
        warningMessageEn: 'Do not poke neck forward, elevate shoulders vertically',
        warningMessageCn: '请勿向前探颈，保持双肩垂直向上提起',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บเสียวบริเวณกระดูกคอหรือสะบัก ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if sharp neck or scapular pain occurs',
      stopOnPainMessageCn: '若感到颈椎或肩胛处刺痛，请立即停止',
      maxSafeAngleCapDeg: 180,
    },
    requiredLandmarks: {
      bilateral: [7, 8, 11, 12, 23, 24],
      left: [7, 11, 23],
      right: [8, 12, 24],
    },
    minLandmarkVisibility: {
      7: 0.40,
      8: 0.40,
      11: 0.50,
      12: 0.50,
      23: 0.35,
      24: 0.35,
    },
  },

  // 19. Upper Trapezius Stretch (Timer Mode)
  'upper-trapezius-stretch': {
    id: 'upper-trapezius-stretch',
    exerciseId: 'e1000000-0000-0000-0000-000000000019',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'timer',
    nameTh: 'ยืดกล้ามเนื้อบ่า (Upper Trapezius Stretch)',
    nameEn: 'Upper Trapezius Stretch',
    nameCn: '上斜方肌拉伸',
    descriptionTh: 'นั่งหลังตรง มือข้างหนึ่งจับใต้ขอบเก้าอี้เพื่อตรึงสะบัก เอียงศีรษะไปด้านตรงข้าม มืออีกข้างช่วยประคองศีรษะเบาๆ จนรู้สึกตึงสบาย ค้างไว้ 20–30 วินาที',
    descriptionEn: 'Sit upright holding chair base with one hand. Tilt head to opposite side with gentle hand support until mild stretch, hold 20-30s.',
    descriptionCn: '端坐抓稳座椅边缘以固定肩胛。头部缓慢向对侧倾斜并轻柔扶头，感受到舒适拉伸后保持20-30秒。',
    framing: 'upper_body',
    evaluationMode: 'timer',
    side: 'bilateral',
    targetJoint: 'neck',
    mediaUrl: '/assets/exercises/upper-trapezius-stretch.svg',
    clinicalSource: 'ACSM Flexibility Guidelines / JOSPT Neck Pain CPG',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — โหมดจับเวลานำทาง (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'โหมดจับเวลานำทาง (Timer Mode: 20–30 วินาที/รอบ) | กล้องหน้าตรงครึ่งตัวบน (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 3,
    defaultHoldSec: 25.0,
    defaultDurationSec: 30,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรง มือจับขอบเก้าอี้ เอียงศีรษะไปข้างๆ ให้รู้สึกตึงสบายที่บ่า',
      instructionTextEn: 'Hold chair seat, gently tilt head to opposite side, hold comfortably.',
      instructionTextCn: '手抓椅沿固定，头部向对侧倾斜并保持拉伸。',
    },
    defaultPrescription: {
      repsPerSet: 3,
      totalSets: 3,
      restBetweenSetsSec: 30,
      durationSec: 30,
      holdDurationSec: 25.0,
    },
    compensationRules: [],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการชาแปลบลงแขน หรือเวียนศีรษะ ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if numbness down arm or dizziness occurs',
      stopOnPainMessageCn: '若出现手麻或眩晕感，请立即停止',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      bilateral: [7, 8, 11, 12],
      left: [7, 11],
      right: [8, 12],
    },
    minLandmarkVisibility: {
      7: 0.40,
      8: 0.40,
      11: 0.50,
      12: 0.50,
    },
  },

  // 20. Seated Trunk Rotation
  'seated-trunk-rotation': {
    id: 'seated-trunk-rotation',
    exerciseId: 'e1000000-0000-0000-0000-000000000020',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'camera',
    nameTh: 'หมุนลำตัวท่านั่งกอดอก (Seated Trunk Rotation)',
    nameEn: 'Seated Trunk Rotation',
    nameCn: '坐姿躯干旋转',
    descriptionTh: 'นั่งหลังตรงบนเก้าอี้ เท้าวางราบกับพื้น ยกแขนกอดอกระดับอก สะโพกตรึงแน่นกับเก้าอี้ ค่อยๆ หมุนลำตัวส่วนบนไปทางซ้าย ค้างไว้ 2 วินาที แล้วหมุนกลับมาตรงกลาง จากนั้นหมุนไปทางขวา',
    descriptionEn: 'Sit upright with arms crossed over chest. Keep hips flat on chair, slowly rotate upper trunk left, hold 2s, center, then rotate right.',
    descriptionCn: '端坐于椅，双手抱胸。臀部紧贴椅面，缓慢向左旋转上半身躯干，保持2秒后回中，再转向右侧。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'trunk',
    mediaUrl: '/assets/exercises/seated-trunk-rotation.svg',
    clinicalSource: 'Spine Biomechanics / McGill Trunk Protocols',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'กล้องหน้าตรงครึ่งตัวบน | องศาการหมุน 20°–35° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรง เท้าแนบพื้น ยกแขนกอดอกให้เห็นหัวไหล่ทั้งสองข้าง',
      instructionTextEn: 'Sit upright with feet flat, cross arms over chest, facing camera.',
      instructionTextCn: '双脚平放地面，端坐并双手抱胸面对摄像头。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 12, pointB: 24 },
        right: { pointA: 12, vertex: 11, pointB: 23 },
      },
      direction: 'increase',
      startAngleDeg: 10,
      targetMinDeg: 20,
      targetMaxDeg: 35,
      toleranceDeg: 8,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'trunk_pelvic_lift',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'สะโพกและก้นต้องติดเบาะตลอดเวลา ห้ามเอียงตัวช่วยหมุน',
        warningMessageEn: 'Keep pelvis flat on seat, do not lift hip to rotate',
        warningMessageCn: '请保持骨盆紧贴椅面，切勿抬起臀部借力',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บแปลบบริเวณหลังส่วนล่างหรือร้าวลงสะโพก ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if sharp lower back or radiating pain occurs',
      stopOnPainMessageCn: '若腰部或下肢出现放射性刺痛，请立即停止',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      bilateral: [11, 12, 23, 24],
      left: [11, 23],
      right: [12, 24],
    },
    minLandmarkVisibility: {
      11: 0.50,
      12: 0.50,
      23: 0.35,
      24: 0.35,
    },
  },

  // 21. Seated Side Bend
  'seated-side-bend': {
    id: 'seated-side-bend',
    exerciseId: 'e1000000-0000-0000-0000-000000000021',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'camera',
    nameTh: 'เอียงลำตัวด้านข้างท่านั่ง (Seated Side Bend)',
    nameEn: 'Seated Side Bend',
    nameCn: '坐姿躯干侧屈',
    descriptionTh: 'นั่งหลังตรง เท้าวางราบกับพื้น ค่อยๆ เอียงลำตัวไปทางด้านข้าง ปลายนิ้วเลื่อนลงตามแนวขาเก้าอี้ โดยก้นสองข้างไม่ลอยจากเบาะ ค้างไว้ 2 วินาที แล้วดึงตัวกลับมาตรง',
    descriptionEn: 'Sit upright with feet flat. Slowly bend trunk to side sliding fingertips down chair leg without lifting hips, hold 2s, return upright.',
    descriptionCn: '端坐姿势双脚平放。上半身平缓向侧面弯曲，指尖沿椅腿下滑，臀部不离椅面，保持2秒后回正。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'trunk',
    mediaUrl: '/assets/exercises/seated-side-bend.svg',
    clinicalSource: 'Kendall Muscle Testing / Spine Rehabilitation CPG',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'กล้องหน้าตรงครึ่งตัวบน | องศาเอียง 15°–25° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรงหน้าตรง ให้เห็นศีรษะ ไหล่ และสะโพกสองข้างอย่างสมดุล',
      instructionTextEn: 'Sit upright facing camera, showing head, shoulders, and hips.',
      instructionTextCn: '正坐面向镜头，确保头部、双肩及髋部清晰对称。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 23, pointB: 24 },
        right: { pointA: 12, vertex: 24, pointB: 23 },
      },
      direction: 'decrease',
      startAngleDeg: 90,
      targetMinDeg: 65,
      targetMaxDeg: 75,
      toleranceDeg: 6,
      holdDurationSec: 2.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'sidebend_hip_lift',
        type: 'trunk_lateral_flexion',
        thresholdValue: 0.15,
        warningMessageTh: 'ก้นทั้งสองข้างต้องแนบติดเบาะเก้าอี้ตลอดเวลา ห้ามก้นลอย',
        warningMessageEn: 'Keep both hips firmly on chair, do not lift off seat',
        warningMessageCn: '请双臀平稳坐紧椅子，避免单侧离座借力',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการปวดแปลบที่หลังหรือเอว ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if sharp flank or back pain occurs',
      stopOnPainMessageCn: '若侧腰或腰背部出现剧烈刺痛，请立即停止',
      maxSafeAngleCapDeg: 45,
    },
    requiredLandmarks: {
      bilateral: [11, 12, 23, 24],
      left: [11, 23],
      right: [12, 24],
    },
    minLandmarkVisibility: {
      11: 0.50,
      12: 0.50,
      23: 0.35,
      24: 0.35,
    },
  },

  // 22. Cross-Body Shoulder Stretch (Timer Mode)
  'cross-body-shoulder-stretch': {
    id: 'cross-body-shoulder-stretch',
    exerciseId: 'e1000000-0000-0000-0000-000000000022',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'timer',
    nameTh: 'ยืดไหล่ข้ามลำตัว (Cross-Body Shoulder Stretch)',
    nameEn: 'Cross-Body Shoulder Stretch',
    nameCn: '交叉臂肩部拉伸',
    descriptionTh: 'นั่งหลังตรง ยกแขนข้างหนึ่งพาดขวางข้ามหน้าอก ใช้มืออีกข้างประคองบริเวณข้อศอกแล้วดึงแขนเข้าหาลำตัวเบาๆ จนรู้สึกตึงด้านหลังหัวไหล่ ค้างไว้ 20–30 วินาที',
    descriptionEn: 'Sit upright, bring one arm across chest horizontally. Use opposite hand to gently pull elbow toward chest, hold 20-30s.',
    descriptionCn: '端坐姿势，将一侧手臂水平横跨胸前。另一手扶住肘部向内轻拉，感受肩后部拉伸并保持20-30秒。',
    framing: 'upper_body',
    evaluationMode: 'timer',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/cross-body-shoulder-stretch.svg',
    clinicalSource: 'Wilk KE et al., Shoulder Posterior Capsule Stretching Protocol',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — โหมดจับเวลานำทาง (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'โหมดจับเวลานำทาง (Timer Mode: 20–30 วินาที/รอบ) | กล้องหน้าตรงครึ่งตัวบน (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 3,
    defaultHoldSec: 25.0,
    defaultDurationSec: 30,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรง ยกแขนพาดข้ามหน้าอก ใช้มืออีกข้างช่วยดึงข้อศอกช้าๆ',
      instructionTextEn: 'Sit upright, pull arm across chest gently with other hand.',
      instructionTextCn: '保持上身挺拔，用另一只手轻柔将手臂横拉贴向胸口。',
    },
    defaultPrescription: {
      repsPerSet: 3,
      totalSets: 3,
      restBetweenSetsSec: 30,
      durationSec: 30,
      holdDurationSec: 25.0,
    },
    compensationRules: [],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บเสียวแปลบบริเวณด้านหน้าข้อต่อไหล่ ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if sharp anterior shoulder pain occurs',
      stopOnPainMessageCn: '若肩关节前侧出现刺痛感，请立即停止',
      maxSafeAngleCapDeg: 120,
    },
    requiredLandmarks: {
      bilateral: [11, 12, 13, 14, 15, 16],
      left: [11, 13, 15],
      right: [12, 14, 16],
    },
    minLandmarkVisibility: {
      11: 0.50,
      12: 0.50,
      13: 0.40,
      14: 0.40,
    },
  },

  // 23. Seated Horizontal Abduction
  'seated-horizontal-abduction': {
    id: 'seated-horizontal-abduction',
    exerciseId: 'e1000000-0000-0000-0000-000000000023',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'camera',
    nameTh: 'กางแขนระดับอก (Seated Horizontal Abduction)',
    nameEn: 'Seated Horizontal Abduction',
    nameCn: '坐姿水平肩外展',
    descriptionTh: 'นั่งหลังตรง ยื่นแขนทั้งสองข้างไปข้างหน้าระดับอก งอศอกเล็กน้อย จากนั้นกางแขนออกด้านข้างพร้อมบีบสะบักเข้าหากันช้าๆ จนแขนขนานระนาบไหล่ ค้างไว้ 2 วินาที แล้วกลับสู่ท่าเริ่มต้น',
    descriptionEn: 'Sit upright with arms extended forward at chest height. Open arms horizontally to sides while pinching scapulae, hold 2s, then return.',
    descriptionCn: '端坐姿势，双臂前平举与胸同高。向身体两侧水平展开手臂同时收紧后背肩胛，保持2秒后还原。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/seated-horizontal-abduction.svg',
    clinicalSource: 'AAOS / ACSM Shoulder Conditioning Protocol',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'กล้องหน้าตรงครึ่งตัวบน | องศาการกาง 70°–90° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSec: 2.0,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'นั่งหลังตรง กางแขนออกสองข้างระดับอก ให้เห็นแขนและข้อศอกครบทั้งสองข้าง',
      instructionTextEn: 'Sit upright, open arms horizontally at chest level, showing shoulders and arms.',
      instructionTextCn: '保持坐姿正直，在胸部水平线向两侧展开双臂，确保双臂清晰入镜。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 12, vertex: 11, pointB: 13 },
        right: { pointA: 11, vertex: 12, pointB: 14 },
      },
      direction: 'increase',
      startAngleDeg: 10,
      targetMinDeg: 70,
      targetMaxDeg: 90,
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
        ruleId: 'horizontal_abd_trunk_lean',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าแอ่นหลังหรือเอนตัวไปข้างหลังขณะกางแขน',
        warningMessageEn: 'Keep core tight, do not arch or lean back while opening arms',
        warningMessageCn: '请收紧核心，展臂时切勿后仰拱腰',
        severity: 'warning',
      },
      {
        ruleId: 'horizontal_abd_shrug',
        type: 'scapular_hiking',
        thresholdValue: 0.15,
        warningMessageTh: 'อย่าเกร็งยกหัวไหล่ขึ้น กางแขนในระนาบอกเท่านั้น',
        warningMessageEn: 'Do not shrug shoulders up, open arms at chest height',
        warningMessageCn: '请勿耸起肩膀，保持手臂在胸部高度展开',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บหน้าไหล่หรือกระดูกคอ ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if anterior shoulder or neck pain occurs',
      stopOnPainMessageCn: '若肩前或颈椎产生刺痛感，请立即停止',
      maxSafeAngleCapDeg: 110,
    },
    requiredLandmarks: {
      bilateral: [11, 12, 13, 14, 15, 16],
      left: [11, 13, 15],
      right: [12, 14, 16],
    },
    minLandmarkVisibility: {
      11: 0.50,
      12: 0.50,
      13: 0.45,
      14: 0.45,
      15: 0.40,
      16: 0.40,
    },
  },

  // 24. Wrist Flexion/Extension (Timer Mode)
  'wrist-flexion-extension': {
    id: 'wrist-flexion-extension',
    exerciseId: 'e1000000-0000-0000-0000-000000000024',
    is_active: true,
    camera_framing: 'upper_body',
    mode: 'timer',
    nameTh: 'งอ-เหยียดข้อมือ (Wrist Flexion/Extension)',
    nameEn: 'Wrist Flexion/Extension',
    nameCn: '腕屈伸训练',
    descriptionTh: 'นั่งหลังตรง วางปลายแขนราบบนที่พักแขนของเก้าอี้หรือโต๊ะ ให้ข้อมือพ้นขอบออกมา กระดกข้อมือขึ้นช้าๆ ค้างไว้ 2 วินาที แล้วค่อยๆ งอข้อมือลงด้านล่างอย่างนุ่มนวล (โหมดจับเวลานำทาง)',
    descriptionEn: 'Sit upright with forearm supported on armrest or table. Slowly extend wrist up, hold 2s, then flex wrist down smoothly.',
    descriptionCn: '端坐姿势，前臂平放在扶手或桌面上，手腕伸出边缘。缓慢向上背伸腕部，保持2秒，再柔和向下屈曲。',
    framing: 'upper_body',
    evaluationMode: 'timer',
    side: 'bilateral',
    targetJoint: 'wrist',
    mediaUrl: '/assets/exercises/wrist-flexion-extension.svg',
    clinicalSource: 'American Society for Surgery of the Hand (ASSH) / Wrist Rehab',
    clinicalDisclaimerTh: 'ค่าเริ่มต้นแนะนำ — โหมดจับเวลานำทางบนที่พักแขน (ต้องให้นักกายภาพตรวจสอบ)',
    calibration_notes: 'โหมดจับเวลานำทาง (Timer Mode: 10–12 ครั้ง/เซ็ต) | วางแขนบนที่พักแขน (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    defaultSets: 3,
    defaultReps: 12,
    defaultHoldSec: 2.0,
    defaultDurationSec: 30,
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'วางปลายแขนบนที่พักแขนหรือโต๊ะ หันหน้าเข้าหากล้อง',
      instructionTextEn: 'Rest forearm on armrest/table facing camera.',
      instructionTextCn: '前臂稳固放置在桌椅扶手上并面对镜头。',
    },
    defaultPrescription: {
      repsPerSet: 12,
      totalSets: 3,
      restBetweenSetsSec: 30,
      durationSec: 30,
    },
    compensationRules: [],
    safetyContraindications: {
      stopOnPainMessageTh: 'ปลายแขนต้องแนบติดที่พักแขนตลอดเวลา หยุดทันทีหากมีอาการชาปลายนิ้วหรือเสียวแปลบ',
      stopOnPainMessageEn: 'Keep forearm on armrest, stop immediately if numbness in fingers occurs',
      stopOnPainMessageCn: '前臂必须始终紧贴扶手，若指尖麻木刺痛请立即停止',
      maxSafeAngleCapDeg: 90,
    },
    requiredLandmarks: {
      bilateral: [11, 12, 13, 14, 15, 16],
      left: [13, 15],
      right: [14, 16],
    },
    minLandmarkVisibility: {
      11: 0.40,
      12: 0.40,
      13: 0.40,
      14: 0.40,
      15: 0.35,
      16: 0.35,
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

// 15 Canonical Seated Upper-Body Clinical Exercises Array
export const ALL_CLINICAL_EXERCISES: ExerciseDetectionConfig[] = [
  CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'],
  CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
  CLINICAL_EXERCISES_CONFIG['shoulder-er-band'],
  CLINICAL_EXERCISES_CONFIG['scapular-retraction'],
  CLINICAL_EXERCISES_CONFIG['elbow-flexion-extension'],
  CLINICAL_EXERCISES_CONFIG['chin-tuck'],
  CLINICAL_EXERCISES_CONFIG['seated-cervical-rotation'],
  CLINICAL_EXERCISES_CONFIG['cervical-side-bend'],
  CLINICAL_EXERCISES_CONFIG['shoulder-shrug'],
  CLINICAL_EXERCISES_CONFIG['upper-trapezius-stretch'],
  CLINICAL_EXERCISES_CONFIG['seated-trunk-rotation'],
  CLINICAL_EXERCISES_CONFIG['seated-side-bend'],
  CLINICAL_EXERCISES_CONFIG['cross-body-shoulder-stretch'],
  CLINICAL_EXERCISES_CONFIG['seated-horizontal-abduction'],
  CLINICAL_EXERCISES_CONFIG['wrist-flexion-extension'],
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

  // Lookup across all configs (including legacy/deactivated exercises) by exerciseId, id, or name (TH/EN/CN)
  for (const ex of Object.values(CLINICAL_EXERCISES_CONFIG)) {
    if (ex.exerciseId === q || ex.id === q) return ex;
    if (ex.nameTh && (ex.nameTh.toLowerCase().includes(q) || q.includes(ex.nameTh.toLowerCase()))) return ex;
    if (ex.nameEn && (ex.nameEn.toLowerCase().includes(q) || q.includes(ex.nameEn.toLowerCase()))) return ex;
    if (ex.nameCn && (ex.nameCn.includes(q) || q.includes(ex.nameCn))) return ex;
  }

  for (const ex of ALL_CLINICAL_EXERCISES) {
    if (ex.id === q || ex.exerciseId === q) return ex;
    if (ex.nameTh.toLowerCase().includes(q) || q.includes(ex.nameTh.toLowerCase())) return ex;
    if (ex.nameEn.toLowerCase().includes(q) || q.includes(ex.nameEn.toLowerCase())) return ex;
    if (ex.nameCn && (ex.nameCn.includes(q) || q.includes(ex.nameCn))) return ex;
  }

  
  // New Seated Upper Body Exercises
  if (q.includes('cervical-rotation') || q.includes('หันศีรษะ') || q.includes('หมุนคอ') || q.includes('颈部旋转')) return CLINICAL_EXERCISES_CONFIG['seated-cervical-rotation'];
  if (q.includes('cervical-side') || q.includes('เอียงศีรษะ') || q.includes('เอียงคอ') || q.includes('颈部侧屈')) return CLINICAL_EXERCISES_CONFIG['cervical-side-bend'];
  if (q.includes('shrug') || q.includes('ยักไหล่') || q.includes('耸肩')) return CLINICAL_EXERCISES_CONFIG['shoulder-shrug'];
  if (q.includes('trapezius') || q.includes('ยืดบ่า') || q.includes('ยืดกล้ามเนื้อบ่า') || q.includes('上斜方肌')) return CLINICAL_EXERCISES_CONFIG['upper-trapezius-stretch'];
  if (q.includes('trunk-rotation') || q.includes('หมุนลำตัว') || q.includes('กอดอก') || q.includes('躯干旋转')) return CLINICAL_EXERCISES_CONFIG['seated-trunk-rotation'];
  if (q.includes('side-bend') || q.includes('เอียงลำตัว') || q.includes('躯干侧屈')) return CLINICAL_EXERCISES_CONFIG['seated-side-bend'];
  if (q.includes('cross-body') || q.includes('ข้ามลำตัว') || q.includes('交叉臂')) return CLINICAL_EXERCISES_CONFIG['cross-body-shoulder-stretch'];
  if (q.includes('horizontal') || q.includes('กางแขนระดับอก') || q.includes('水平肩外展')) return CLINICAL_EXERCISES_CONFIG['seated-horizontal-abduction'];
  if (q.includes('wrist') || q.includes('ข้อมือ') || q.includes('腕屈伸')) return CLINICAL_EXERCISES_CONFIG['wrist-flexion-extension'];

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

/**
 * Centralized Clinical Real-Time Exercise Coaching Cues Registry
 * Provides targeted, anatomy-specific phase instructions (TH / EN / CN),
 * directional icons, and target anatomical keypoints.
 */
export const EXERCISE_COACHING_REGISTRY: Record<string, ExerciseCoachingCues> = {
  'seated-cervical-rotation': {
    idleMessageTh: 'นั่งตัวตรง มองตรงมาที่กล้อง',
    idleMessageEn: 'Sit upright, look directly at the camera',
    idleMessageCn: '端正坐好，目视前方摄像头',
    idleIcon: '👤',

    movingMessageTh: 'ค่อยๆ หันศีรษะช้าๆ ไปทางเป้าหมาย...',
    movingMessageEn: 'Slowly rotate head toward target...',
    movingMessageCn: '缓慢向目标方向转头...',
    movingIcon: '↔️',

    holdingMessageTh: 'ค้างไว้สักครู่',
    holdingMessageEn: 'Hold steady at target...',
    holdingMessageCn: '在目标位置保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ หันกลับมามองตรง',
    returningMessageEn: 'Slowly return to center...',
    returningMessageCn: '缓慢回正，向前看...',
    returningIcon: '↔️',

    framingMessageTh: 'กรุณาให้เห็นใบหน้า ศีรษะ และหัวไหล่ชัดเจน',
    framingMessageEn: 'Please ensure your head, face, and shoulders are visible',
    framingMessageCn: '请确保头部、面部及双肩清晰可见',

    targetKeypoints: [0, 7, 8],
  },

  'cervical-side-bend': {
    idleMessageTh: 'ศีรษะตั้งตรง มองตรงมาที่กล้อง',
    idleMessageEn: 'Head upright, face forward',
    idleMessageCn: '头部正中，面向前方',
    idleIcon: '👤',

    movingMessageTh: 'ค่อยๆ เอียงศีรษะเข้าหาไหล่ช้าๆ...',
    movingMessageEn: 'Slowly tilt head toward shoulder...',
    movingMessageCn: '缓慢将头向肩部侧倾...',
    movingIcon: '↔️',

    holdingMessageTh: 'ค้างไว้สักครู่ ให้รู้สึกตึงสบาย',
    holdingMessageEn: 'Hold steady for a gentle stretch...',
    holdingMessageCn: '在拉伸位保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ยกศีรษะกลับสู่ตรงกลาง',
    returningMessageEn: 'Slowly return head to center...',
    returningMessageCn: '缓慢将头抬回正中...',
    returningIcon: '↔️',

    framingMessageTh: 'กรุณาให้เห็นใบหน้า ศีรษะ และหัวไหล่ชัดเจน',
    framingMessageEn: 'Please ensure your head, face, and shoulders are visible',
    framingMessageCn: '请确保头部、面部及双肩清晰可见',

    targetKeypoints: [0, 7, 8],
  },

  'neck-side-tilt': {
    idleMessageTh: 'ศีรษะตั้งตรง มองตรงมาที่กล้อง',
    idleMessageEn: 'Head upright, face forward',
    idleMessageCn: '头部正中，面向前方',
    idleIcon: '👤',

    movingMessageTh: 'ค่อยๆ เอียงศีรษะเข้าหาไหล่ช้าๆ...',
    movingMessageEn: 'Slowly tilt head toward shoulder...',
    movingMessageCn: '缓慢将头向肩部侧倾...',
    movingIcon: '↔️',

    holdingMessageTh: 'ค้างไว้สักครู่ ให้รู้สึกตึงสบาย',
    holdingMessageEn: 'Hold steady for a gentle stretch...',
    holdingMessageCn: '在拉伸位保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ยกศีรษะกลับสู่ตรงกลาง',
    returningMessageEn: 'Slowly return head to center...',
    returningMessageCn: '缓慢将头抬回正中...',
    returningIcon: '↔️',

    framingMessageTh: 'กรุณาให้เห็นใบหน้า ศีรษะ และหัวไหล่ชัดเจน',
    framingMessageEn: 'Please ensure your head, face, and shoulders are visible',
    framingMessageCn: '请确保头部、面部及双肩清晰可见',

    targetKeypoints: [0, 7, 8],
  },

  'chin-tuck': {
    idleMessageTh: 'ตามองตรง ดึงคางและศีรษะเข้าหาลำคอในแนวราบ',
    idleMessageEn: 'Look forward, tuck chin horizontally',
    idleMessageCn: '目视前方，水平向后收下巴',
    idleIcon: '👤',

    movingMessageTh: 'ค่อยๆ ดึงคางและศีรษะไปด้านหลังในแนวราบ...',
    movingMessageEn: 'Gently glide chin straight backward...',
    movingMessageCn: '平稳水平向后收紧下巴...',
    movingIcon: '⬅️',

    holdingMessageTh: 'ค้างท่าเก็บเหนียงไว้สักครู่',
    holdingMessageEn: 'Hold chin tuck position...',
    holdingMessageCn: '保持收下颌体位...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนคลายกล้ามเนื้อคอกลับสู่ท่าปกติ',
    returningMessageEn: 'Slowly relax neck muscles back to neutral...',
    returningMessageCn: '缓缓放松颈部恢复中立位...',
    returningIcon: '➡️',

    framingMessageTh: 'นั่งหรือยืนตรง ให้เห็นศีรษะและลำคอด้านข้างชัดเจน',
    framingMessageEn: 'Sit or stand upright with head and neck visible',
    framingMessageCn: '端坐或站直，确保头部和颈部清晰可见',

    targetKeypoints: [0, 7, 8],
  },

  'active-shoulder-flexion': {
    idleMessageTh: 'ยืนหรือนั่งหลังตรง แขนผ่อนคลายข้างลำตัว',
    idleMessageEn: 'Stand or sit upright, arms relaxed at sides',
    idleMessageCn: '身姿挺拔，双臂自然垂于体侧',
    idleIcon: '🧍',

    movingMessageTh: 'ค่อยๆ ยกแขนตรงไปข้างหน้าช้าๆ...',
    movingMessageEn: 'Slowly raise arm forward and up...',
    movingMessageCn: '慢慢向前上方抬臂...',
    movingIcon: '⬆️',

    holdingMessageTh: 'ค้างไว้ที่ระดับเป้าหมายนิ่งๆ',
    holdingMessageEn: 'Hold steady at target height...',
    holdingMessageCn: '在目标高度平稳保持...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนแขนลงช้าๆ สู่ตำแหน่งเริ่มต้น',
    returningMessageEn: 'Slowly lower arm down to start...',
    returningMessageCn: '慢慢放下手臂回到起点...',
    returningIcon: '⬇️',

    targetKeypoints: [11, 13, 15],
  },

  'shoulder-flexion': {
    idleMessageTh: 'ยืนหรือนั่งหลังตรง แขนผ่อนคลายข้างลำตัว',
    idleMessageEn: 'Stand or sit upright, arms relaxed at sides',
    idleMessageCn: '身姿挺拔，双臂自然垂于体侧',
    idleIcon: '🧍',

    movingMessageTh: 'ค่อยๆ ยกแขนตรงไปข้างหน้าช้าๆ...',
    movingMessageEn: 'Slowly raise arm forward and up...',
    movingMessageCn: '慢慢向前上方抬臂...',
    movingIcon: '⬆️',

    holdingMessageTh: 'ค้างไว้ที่ระดับเป้าหมายนิ่งๆ',
    holdingMessageEn: 'Hold steady at target height...',
    holdingMessageCn: '在目标高度平稳保持...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนแขนลงช้าๆ สู่ตำแหน่งเริ่มต้น',
    returningMessageEn: 'Slowly lower arm down to start...',
    returningMessageCn: '慢慢放下手臂回到起点...',
    returningIcon: '⬇️',

    targetKeypoints: [11, 13, 15],
  },

  'shoulder-abduction': {
    idleMessageTh: 'ยืนหรือนั่งหน้าตรง แขนแนบลำตัว',
    idleMessageEn: 'Face camera directly, arms at sides',
    idleMessageCn: '正面端坐或站立，双臂贴侧',
    idleIcon: '🧍',

    movingMessageTh: 'ค่อยๆ กางแขนออกด้านข้างลำตัวช้าๆ...',
    movingMessageEn: 'Slowly raise arm out to the side...',
    movingMessageCn: '慢慢向身体侧面展开手臂...',
    movingIcon: '↗️',

    holdingMessageTh: 'ค้างแขนไว้ที่ระดับเป้าหมายสักครู่',
    holdingMessageEn: 'Hold arm steady at target...',
    holdingMessageCn: '在目标位置平稳保持手臂...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ลดแขนลงข้างลำตัวช้าๆ',
    returningMessageEn: 'Slowly lower arm back to side...',
    returningMessageCn: '慢慢将手臂收回体侧...',
    returningIcon: '↙️',

    targetKeypoints: [11, 13, 15],
  },

  'shoulder-abd': {
    idleMessageTh: 'ยืนหรือนั่งหน้าตรง แขนแนบลำตัว',
    idleMessageEn: 'Face camera directly, arms at sides',
    idleMessageCn: '正面端坐或站立，双臂贴侧',
    idleIcon: '🧍',

    movingMessageTh: 'ค่อยๆ กางแขนออกด้านข้างลำตัวช้าๆ...',
    movingMessageEn: 'Slowly raise arm out to the side...',
    movingMessageCn: '慢慢向身体侧面展开手臂...',
    movingIcon: '↗️',

    holdingMessageTh: 'ค้างแขนไว้ที่ระดับเป้าหมายสักครู่',
    holdingMessageEn: 'Hold arm steady at target...',
    holdingMessageCn: '在目标位置平稳保持手臂...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ลดแขนลงข้างลำตัวช้าๆ',
    returningMessageEn: 'Slowly lower arm back to side...',
    returningMessageCn: '慢慢将手臂收回体侧...',
    returningIcon: '↙️',

    targetKeypoints: [11, 13, 15],
  },

  'shoulder-pendulum': {
    idleMessageTh: 'โน้มตัวไปข้างหน้าเล็กน้อย ปล่อยแขนห้อยสบาย',
    idleMessageEn: 'Lean forward slightly, let arm hang loose',
    idleMessageCn: '身体微前倾，手臂自然下垂放松',
    idleIcon: '🌀',

    movingMessageTh: 'แกว่งแขนช้า ๆ เป็นวงกลม ปล่อยแขนตามสบาย',
    movingMessageEn: 'Swing arm gently in a circle, stay relaxed',
    movingMessageCn: '顺畅做圆周摆动，手臂保持放松',
    movingIcon: '🌀',

    holdingMessageTh: 'แกว่งแขนต่อเนื่องอย่างผ่อนคลาย',
    holdingMessageEn: 'Keep swinging smoothly...',
    holdingMessageCn: '保持平稳画圈摆动...',
    holdingIcon: '🌀',

    returningMessageTh: 'ค่อยๆ ชะลอวงแกว่งจนหยุดนิ่ง',
    returningMessageEn: 'Gradually slow down arm swing to stop',
    returningMessageCn: '逐渐放慢画圈直至停止',
    returningIcon: '🌀',

    targetKeypoints: [11, 13, 15],
  },

  'elbow-flexion-extension': {
    idleMessageTh: 'นั่งหรือยืนตรง แขนเหยียดตรงสบายๆ',
    idleMessageEn: 'Sit or stand upright, arm extended comfortably',
    idleMessageCn: '身姿直立，手臂自然伸直放松',
    idleIcon: '💪',

    movingMessageTh: 'ค่อยๆ พับงอข้อศอกขึ้นหาหัวไหล่ช้าๆ...',
    movingMessageEn: 'Slowly bend your elbow upward...',
    movingMessageCn: '慢慢屈曲手肘向上抬起...',
    movingIcon: '⤴️',

    holdingMessageTh: 'ค้างไว้ที่มุมงอศอกสักครู่',
    holdingMessageEn: 'Hold steady at target flexion...',
    holdingMessageCn: '在屈肘目标位置保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ คลายเหยียดข้อศอกลงสู่ท่าเดิม',
    returningMessageEn: 'Slowly lower and extend elbow back down...',
    returningMessageCn: '慢慢伸直手肘回到初始位置...',
    returningIcon: '⤵️',

    targetKeypoints: [11, 13, 15],
  },

  'elbow-flexion': {
    idleMessageTh: 'นั่งหรือยืนตรง แขนเหยียดตรงสบายๆ',
    idleMessageEn: 'Sit or stand upright, arm extended comfortably',
    idleMessageCn: '身姿直立，手臂自然伸直放松',
    idleIcon: '💪',

    movingMessageTh: 'ค่อยๆ พับงอข้อศอกขึ้นหาหัวไหล่ช้าๆ...',
    movingMessageEn: 'Slowly bend your elbow upward...',
    movingMessageCn: '慢慢屈曲手肘向上抬起...',
    movingIcon: '⤴️',

    holdingMessageTh: 'ค้างไว้ที่มุมงอศอกสักครู่',
    holdingMessageEn: 'Hold steady at target flexion...',
    holdingMessageCn: '在屈肘目标位置保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ คลายเหยียดข้อศอกลงสู่ท่าเดิม',
    returningMessageEn: 'Slowly lower and extend elbow back down...',
    returningMessageCn: '慢慢伸直手肘回到初始位置...',
    returningIcon: '⤵️',

    targetKeypoints: [11, 13, 15],
  },

  'scapular-retraction': {
    idleMessageTh: 'นั่งหรือยืนตัวตรง กางแขนงอศอก 90°',
    idleMessageEn: 'Sit or stand upright, bend elbows at 90°',
    idleMessageCn: '端坐或站直，屈肘90度',
    idleIcon: '🔙',

    movingMessageTh: 'ดึงหัวไหล่และสะบักทั้งสองข้างไปด้านหลังช้าๆ...',
    movingMessageEn: 'Squeeze shoulder blades backward together...',
    movingMessageCn: '向后收拢双侧肩胛骨...',
    movingIcon: '🔙',

    holdingMessageTh: 'ค้างท่าดึงสะบักไว้สักครู่ หายใจสม่ำเสมอ',
    holdingMessageEn: 'Hold shoulder blades pinched, breathe evenly',
    holdingMessageCn: '保持肩胛骨收紧，呼吸均匀',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนคลายสะบักกลับสู่ท่าเริ่มต้น',
    returningMessageEn: 'Slowly release shoulder blades forward...',
    returningMessageCn: '慢慢放松肩胛骨回到初始位...',
    returningIcon: '🔜',

    targetKeypoints: [11, 12, 13, 14],
  },

  'shoulder-shrug': {
    idleMessageTh: 'นั่งหรือยืนหลังตรง ผ่อนคลายหัวไหล่ลง',
    idleMessageEn: 'Sit or stand upright, shoulders relaxed down',
    idleMessageCn: '身姿挺拔，双肩自然下垂放松',
    idleIcon: '👤',

    movingMessageTh: 'ค่อยๆ ยักหัวไหล่ทั้งสองข้างขึ้นหาใบหูช้าๆ...',
    movingMessageEn: 'Slowly shrug shoulders up toward ears...',
    movingMessageCn: '缓慢向上耸起双肩至耳侧...',
    movingIcon: '⬆️',

    holdingMessageTh: 'ค้างท่ายักไหล่ไว้สักครู่',
    holdingMessageEn: 'Hold shrug position steadily...',
    holdingMessageCn: '保持耸肩体位片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนหัวไหล่ทั้งสองข้างลงสบายๆ',
    returningMessageEn: 'Slowly relax shoulders back down...',
    returningMessageCn: '慢慢放下双肩回到自然位...',
    returningIcon: '⬇️',

    targetKeypoints: [11, 12],
  },

  'shoulder-er-band': {
    idleMessageTh: 'แนบข้อศอกชิดลำตัว งอศอก 90° จับยางยืด',
    idleMessageEn: 'Keep elbows at sides bent at 90°, hold band',
    idleMessageCn: '屈肘90度贴紧体侧，握紧弹力带',
    idleIcon: '💪',

    movingMessageTh: 'แนบศอกชิดลำตัว ค่อยๆ หมุนแขนออกด้านนอกช้าๆ...',
    movingMessageEn: 'Keeping elbow pinned, slowly rotate forearm outward...',
    movingMessageCn: '保持手肘紧贴躯干，缓慢向外旋前臂...',
    movingIcon: '🔄',

    holdingMessageTh: 'ค้างไว้ที่มุมหมุนออกสักครู่',
    holdingMessageEn: 'Hold steady at external rotation...',
    holdingMessageCn: '在外旋位置平稳保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนแขนกลับสู่ตรงกลางช้าๆ',
    returningMessageEn: 'Slowly return forearm back to center...',
    returningMessageCn: '慢慢控制前臂收回中位...',
    returningIcon: '↩️',

    targetKeypoints: [11, 13, 15],
  },

  'wall-pushup': {
    idleMessageTh: 'ยืนหันหน้าเข้าหาผนัง วางฝ่ามือระดับหัวไหล่',
    idleMessageEn: 'Stand facing wall, hands on wall at shoulder level',
    idleMessageCn: '面向墙壁站立，双手掌平贴于肩高墙面',
    idleIcon: '🧱',

    movingMessageTh: 'ค่อยๆ งอศอกโน้มตัวเข้าหาผนังช้าๆ...',
    movingMessageEn: 'Slowly bend elbows and lean chest toward wall...',
    movingMessageCn: '慢慢屈肘将胸部向墙面靠近...',
    movingIcon: '🧱',

    holdingMessageTh: 'ค้างตัวในท่าโน้มเข้าหาผนังสักครู่ ลำตัวตรง',
    holdingMessageEn: 'Hold position near wall, body straight',
    holdingMessageCn: '在靠近墙面处保持片刻，保持身体成一直线',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ออกแรงดันตัวกลับสู่ตำแหน่งเริ่มต้น',
    returningMessageEn: 'Slowly push body back to starting position...',
    returningMessageCn: '慢慢推离墙面回到初始站姿...',
    returningIcon: '↩️',

    targetKeypoints: [11, 12, 13, 14, 15, 16],
  },

  'seated-knee-extension': {
    idleMessageTh: 'นั่งเก้าอี้หลังตรง เท้าวางราบกับพื้น',
    idleMessageEn: 'Sit upright in chair with feet flat',
    idleMessageCn: '端坐于椅子上，双脚平放地面',
    idleIcon: '🪑',

    movingMessageTh: 'ค่อยๆ เตะเหยียดข้อเข่าขึ้นตรงไปข้างหน้าช้าๆ...',
    movingMessageEn: 'Slowly straighten knee and lift lower leg forward...',
    movingMessageCn: '慢慢向前踢腿伸直膝关节...',
    movingIcon: '🦵',

    holdingMessageTh: 'ค้างขาเหยียดตรงไว้สักครู่',
    holdingMessageEn: 'Hold leg straight at target height...',
    holdingMessageCn: '在伸膝位平稳保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนขาวางลงสู่พื้นช้าๆ',
    returningMessageEn: 'Slowly lower foot back down to floor...',
    returningMessageCn: '慢慢放下小腿使双脚平放地面...',
    returningIcon: '⬇️',

    targetKeypoints: [23, 25, 27],
  },

  'seated-knee-ext': {
    idleMessageTh: 'นั่งเก้าอี้หลังตรง เท้าวางราบกับพื้น',
    idleMessageEn: 'Sit upright in chair with feet flat',
    idleMessageCn: '端坐于椅子上，双脚平放地面',
    idleIcon: '🪑',

    movingMessageTh: 'ค่อยๆ เตะเหยียดข้อเข่าขึ้นตรงไปข้างหน้าช้าๆ...',
    movingMessageEn: 'Slowly straighten knee and lift lower leg forward...',
    movingMessageCn: '慢慢向前踢腿伸直膝关节...',
    movingIcon: '🦵',

    holdingMessageTh: 'ค้างขาเหยียดตรงไว้สักครู่',
    holdingMessageEn: 'Hold leg straight at target height...',
    holdingMessageCn: '在伸膝位平稳保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ผ่อนขาวางลงสู่พื้นช้าๆ',
    returningMessageEn: 'Slowly lower foot back down to floor...',
    returningMessageCn: '慢慢放下小腿使双脚平放地面...',
    returningIcon: '⬇️',

    targetKeypoints: [23, 25, 27],
  },

  'sit-to-stand': {
    idleMessageTh: 'นั่งบนเก้าอี้ เท้าวางมั่นคง ลำตัวตรง',
    idleMessageEn: 'Sit on chair, feet firmly planted',
    idleMessageCn: '坐在椅子上，双脚平稳踏地',
    idleIcon: '🪑',

    movingMessageTh: 'ดันเท้าลงพื้น ค่อยๆ ลุกขึ้นยืนตัวตรงช้าๆ...',
    movingMessageEn: 'Push through feet and stand up smoothly...',
    movingMessageCn: '双脚踩实地面，平缓站立起身...',
    movingIcon: '🧍‍♂️',

    holdingMessageTh: 'ยืนตัวตรง ทรงตัวมั่นคงสักครู่',
    holdingMessageEn: 'Stand tall and steady...',
    holdingMessageCn: '完全站直，平稳保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ ย่อตัวนั่งลงบนเก้าอี้อย่างช้าๆ ควบคุมจังหวะ',
    returningMessageEn: 'Slowly lower hips and sit down with control...',
    returningMessageCn: '控制重心，慢慢坐回椅子上...',
    returningIcon: '🪑',

    targetKeypoints: [23, 24, 25, 26, 27, 28],
  },

  'standing-hip-abduction': {
    idleMessageTh: 'ยืนตรงเกาะพนักพิง น้ำหนักลงขากลาง',
    idleMessageEn: 'Stand tall holding support, weight on stance leg',
    idleMessageCn: '扶好支撑物站直，重心放于支撑腿',
    idleIcon: '🧍',

    movingMessageTh: 'ลำตัวตรง ค่อยๆ กางขาออกด้านข้างช้าๆ...',
    movingMessageEn: 'Keep torso upright, slowly raise leg out to side...',
    movingMessageCn: '身体保持直立，缓慢向侧方抬起外侧腿...',
    movingIcon: '↗️',

    holdingMessageTh: 'ค้างขาไว้ที่ระดับเป้าหมาย ลำตัวไม่เอียง',
    holdingMessageEn: 'Hold leg steady without leaning torso',
    holdingMessageCn: '在目标角度保持片刻，切勿倾斜躯干',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ หุบขากลับสู่ตำแหน่งเริ่มต้นช้าๆ',
    returningMessageEn: 'Slowly bring leg back down to start...',
    returningMessageCn: '缓慢平稳将腿收回初始位...',
    returningIcon: '↙️',

    targetKeypoints: [23, 24, 27],
  },

  'standing-hip-abd': {
    idleMessageTh: 'ยืนตรงเกาะพนักพิง น้ำหนักลงขากลาง',
    idleMessageEn: 'Stand tall holding support, weight on stance leg',
    idleMessageCn: '扶好支撑物站直，重心放于支撑腿',
    idleIcon: '🧍',

    movingMessageTh: 'ลำตัวตรง ค่อยๆ กางขาออกด้านข้างช้าๆ...',
    movingMessageEn: 'Keep torso upright, slowly raise leg out to side...',
    movingMessageCn: '身体保持直立，缓慢向侧方抬起外侧腿...',
    movingIcon: '↗️',

    holdingMessageTh: 'ค้างขาไว้ที่ระดับเป้าหมาย ลำตัวไม่เอียง',
    holdingMessageEn: 'Hold leg steady without leaning torso',
    holdingMessageCn: '在目标角度保持片刻，切勿倾斜躯干',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ หุบขากลับสู่ตำแหน่งเริ่มต้นช้าๆ',
    returningMessageEn: 'Slowly bring leg back down to start...',
    returningMessageCn: '缓慢平稳将腿收回初始位...',
    returningIcon: '↙️',

    targetKeypoints: [23, 24, 27],
  },

  'calf-raise': {
    idleMessageTh: 'ยืนตรงเกาะโต๊ะหรือผนัง เท้าขนานกัน',
    idleMessageEn: 'Stand upright holding support, feet parallel',
    idleMessageCn: '扶好支撑物站直，双脚平行',
    idleIcon: '🦶',

    movingMessageTh: 'ค่อยๆ เขย่งส้นเท้าทั้งสองข้างขึ้นช้าๆ...',
    movingMessageEn: 'Slowly raise both heels up onto balls of feet...',
    movingMessageCn: '慢慢向上抬起双脚脚后跟...',
    movingIcon: '⬆️',

    holdingMessageTh: 'ค้างไว้บนปลายเท้าสักครู่ ทรงตัวให้นิ่ง',
    holdingMessageEn: 'Hold steady on balls of feet...',
    holdingMessageCn: '脚尖点地，平稳保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ วางส้นเท้าทั้งสองข้างลงแตะพื้นช้าๆ',
    returningMessageEn: 'Slowly lower heels back down to floor...',
    returningMessageCn: '慢慢将双侧脚后跟放回地面...',
    returningIcon: '⬇️',

    targetKeypoints: [27, 28, 29, 30],
  },

  'heel-raise': {
    idleMessageTh: 'ยืนตรงเกาะโต๊ะหรือผนัง เท้าขนานกัน',
    idleMessageEn: 'Stand upright holding support, feet parallel',
    idleMessageCn: '扶好支撑物站直，双脚平行',
    idleIcon: '🦶',

    movingMessageTh: 'ค่อยๆ เขย่งส้นเท้าทั้งสองข้างขึ้นช้าๆ...',
    movingMessageEn: 'Slowly raise both heels up onto balls of feet...',
    movingMessageCn: '慢慢向上抬起双脚脚后跟...',
    movingIcon: '⬆️',

    holdingMessageTh: 'ค้างไว้บนปลายเท้าสักครู่ ทรงตัวให้นิ่ง',
    holdingMessageEn: 'Hold steady on balls of feet...',
    holdingMessageCn: '脚尖点地，平稳保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ วางส้นเท้าทั้งสองข้างลงแตะพื้นช้าๆ',
    returningMessageEn: 'Slowly lower heels back down to floor...',
    returningMessageCn: '慢慢将双侧脚后跟放回地面...',
    returningIcon: '⬇️',

    targetKeypoints: [27, 28, 29, 30],
  },

  'standing-calf-raise': {
    idleMessageTh: 'ยืนตรงเกาะโต๊ะหรือผนัง เท้าขนานกัน',
    idleMessageEn: 'Stand upright holding support, feet parallel',
    idleMessageCn: '扶好支撑物站直，双脚平行',
    idleIcon: '🦶',

    movingMessageTh: 'ค่อยๆ เขย่งส้นเท้าทั้งสองข้างขึ้นช้าๆ...',
    movingMessageEn: 'Slowly raise both heels up onto balls of feet...',
    movingMessageCn: '慢慢向上抬起双脚脚后跟...',
    movingIcon: '⬆️',

    holdingMessageTh: 'ค้างไว้บนปลายเท้าสักครู่ ทรงตัวให้นิ่ง',
    holdingMessageEn: 'Hold steady on balls of feet...',
    holdingMessageCn: '脚尖点地，平稳保持片刻...',
    holdingIcon: '🌟',

    returningMessageTh: 'ค่อยๆ วางส้นเท้าทั้งสองข้างลงแตะพื้นช้าๆ',
    returningMessageEn: 'Slowly lower heels back down to floor...',
    returningMessageCn: '慢慢将双侧脚后跟放回地面...',
    returningIcon: '⬇️',

    targetKeypoints: [27, 28, 29, 30],
  },
};

const NEUTRAL_COACHING_FALLBACK: ExerciseCoachingCues = {
  idleMessageTh: 'จัดท่าทางให้พร้อมตามภาพตัวอย่าง แล้วเริ่มทำช้าๆ',
  idleMessageEn: 'Get in starting position as shown, then begin slowly',
  idleMessageCn: '准备就绪后，参考示例平稳开始动作',
  idleIcon: '✨',

  movingMessageTh: 'ทำท่าช้าๆ ตามภาพตัวอย่าง...',
  movingMessageEn: 'Move smoothly as shown in the guide...',
  movingMessageCn: '请参考示例平稳做动作...',
  movingIcon: '🎯',

  holdingMessageTh: 'ค้างไว้ในตำแหน่งเป้าหมายสักครู่',
  holdingMessageEn: 'Hold steady at target position...',
  holdingMessageCn: '在目标位置保持片刻...',
  holdingIcon: '🌟',

  returningMessageTh: 'ค่อยๆ ผ่อนกลับสู่ตำแหน่งเริ่มต้น',
  returningMessageEn: 'Return smoothly to starting position...',
  returningMessageCn: '缓慢平稳回到初始位置...',
  returningIcon: '↩️',

  targetKeypoints: [],
};

/**
 * Resolves localized coaching cues, directional icons, and target landmarks
 * with fallback to neutral, non-organ-specific guidance.
 */
export function getExerciseCoachingCues(
  exerciseId?: string | null,
  side?: BodySide
): ExerciseCoachingCues {
  if (!exerciseId) return NEUTRAL_COACHING_FALLBACK;
  const cleanId = exerciseId.toLowerCase().trim();
  const base = EXERCISE_COACHING_REGISTRY[cleanId];
  if (!base) return NEUTRAL_COACHING_FALLBACK;

  const result: ExerciseCoachingCues = { ...base };

  // Side-specific adjustments for directional exercises like Seated Cervical Rotation
  if (cleanId === 'seated-cervical-rotation') {
    if (side === 'left') {
      result.movingMessageTh = 'ค่อยๆ หันศีรษะไปทางซ้ายช้าๆ...';
      result.movingMessageEn = 'Slowly rotate head to the left...';
      result.movingMessageCn = '缓慢向左转头...';
      result.movingIcon = '⬅️';
    } else if (side === 'right') {
      result.movingMessageTh = 'ค่อยๆ หันศีรษะไปทางขวาช้าๆ...';
      result.movingMessageEn = 'Slowly rotate head to the right...';
      result.movingMessageCn = '缓慢向右转头...';
      result.movingIcon = '➡️';
    }
  }

  return result;
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

  
  // 5. Cervical / Neck constraints (Rotation, Side Bend, Upper Trap Stretch)
  if (
    exerciseId === 'seated-cervical-rotation' ||
    exerciseId === 'cervical-side-bend' ||
    exerciseId === 'upper-trapezius-stretch' ||
    exJoint.includes('cervical') ||
    exJoint.includes('คอ')
  ) {
    if (
      combinedText.includes('กระดูกคอไม่มั่นคง') ||
      combinedText.includes('cervical instability') ||
      combinedText.includes('เวียนศีรษะ') ||
      combinedText.includes('vertigo') ||
      combinedText.includes('มึนงง') ||
      combinedText.includes('radiculopathy') ||
      combinedText.includes('หมอนรองกระดูกคอ')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนทางคลินิก: ผู้ป่วยมีประวัติด้านกระดูกคอ/เวียนศีรษะ (Cervical/Vertigo) ต้องหยุดทันทีหากมีอาการมึนงงหรือชาลงแขน และห้ามเริ่มหากมีข้อห้ามด้านกระดูกคอที่นักกายภาพระบุ',
        reason: 'cervical_instability_vertigo',
      };
    }
  }

  // 6. Trunk / Spine constraints (Seated Trunk Rotation, Seated Side Bend)
  if (
    exerciseId === 'seated-trunk-rotation' ||
    exerciseId === 'seated-side-bend' ||
    exJoint.includes('trunk') ||
    exJoint.includes('หลัง') ||
    exJoint.includes('ลำตัว')
  ) {
    if (
      combinedText.includes('ผ่าตัดกระดูกสันหลัง') ||
      combinedText.includes('spine surgery') ||
      combinedText.includes('กระดูกสันหลังคด') ||
      combinedText.includes('scoliosis') ||
      combinedText.includes('กระดูกสันหลังเคลื่อน') ||
      combinedText.includes('spondylolisthesis') ||
      combinedText.includes('หมอนรองกระดูกทับเส้น')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนทางคลินิก: ผู้ป่วยมีประวัติโรคกระดูกสันหลังหรือหลังผ่าตัด ให้จำกัดพิสัยการหมุน/เอียงลำตัว และหยุดทันทีหากมีอาการปวดร้าวลงสะโพกหรือขา',
        reason: 'trunk_spine_surgery_warning',
      };
    }
  }

  // 7. Wrist constraints (Wrist Flexion/Extension)
  if (exerciseId === 'wrist-flexion-extension' || exJoint.includes('wrist') || exJoint.includes('ข้อมือ')) {
    if (
      combinedText.includes('carpal tunnel') ||
      combinedText.includes('พังผืดข้อมือ') ||
      combinedText.includes('ข้อมือหัก') ||
      combinedText.includes('wrist fracture') ||
      combinedText.includes('ชาปลายนิ้ว')
    ) {
      return {
        hasWarning: true,
        warningMessage:
          '⚠️ คำเตือนทางคลินิก: ผู้ป่วยมีประวัติพังผืดรัดเส้นประสาทข้อมือ (CTS) หรือกระดูกข้อมือ ให้วางแขนราบบนที่พักแขนและหยุดทันทีหากมีอาการชาปลายนิ้ว',
        reason: 'wrist_carpal_tunnel_warning',
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
