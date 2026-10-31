/**
 * packages/pose-engine/src/presets/exercises.config.ts
 *
 * DRTECH.CARE CENTRAL CLINICAL EXERCISE CONFIGURATION CATALOG
 * Complete 10 Physical Therapy Exercises with Trilingual Metadata (TH / EN / CN),
 * MediaPipe landmark indices, framing requirements, and biomechanical parameters.
 */

import { ExerciseDetectionConfig } from '../types/exerciseConfig';

export const CLINICAL_EXERCISES_CONFIG: Record<string, ExerciseDetectionConfig> = {
  // 1. Shoulder Pendulum
  'shoulder-pendulum': {
    id: 'shoulder-pendulum',
    exerciseId: 'e1000000-0000-0000-0000-000000000001',
    nameTh: 'แกว่งแขนวงกลมผ่อนคลายหัวไหล่ (Shoulder Pendulum)',
    nameEn: 'Shoulder Pendulum',
    nameCn: '钟摆摆臂放松肩部',
    descriptionTh: 'โน้มตัวไปข้างหน้า ปล่อยแขนห้อยตรงตามแรงโน้มถ่วง และแกว่งแขนเป็นวงกลมผ่อนคลายกล้ามเนื้อข้อต่อหัวไหล่',
    descriptionEn: 'Lean forward, let the affected arm hang loose under gravity, and swing gently in circular motions to mobilize the shoulder joint.',
    descriptionCn: '身体微前倾，让手臂自然下垂，轻柔顺滑地画圆摆动，放松肩关节周围肌群。',
    framing: 'upper_body',
    evaluationMode: 'pendulum_circular',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/shoulder_pendulum.mp4',
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'ยืนหันข้าง 45° ถึง 90° ระยะห่าง 1.5–2.5 ม. โน้มตัวไปข้างหน้าเล็กน้อย ปล่อยแขนห้อยสบายๆ',
      instructionTextEn: 'Stand at a 45°–90° angle, 1.5–2.5m from camera. Lean slightly forward with your arm hanging relaxed.',
      instructionTextCn: '侧身45°至90°面向摄像头，距离1.5-2.5米。身体微前倾，手臂自然下垂。',
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
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
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
  },

  // 2. Shoulder Flexion
  'shoulder-flexion': {
    id: 'shoulder-flexion',
    exerciseId: 'e1000000-0000-0000-0000-000000000002',
    nameTh: 'ยกแขนไปข้างหน้า (Shoulder Flexion)',
    nameEn: 'Shoulder Flexion',
    nameCn: '肩部前屈举臂',
    descriptionTh: 'ยืนหรือนั่งหลังตรง ยกแขนตรงไปข้างหน้าจนถึงระดับเหนือศีรษะ แล้วค่อยๆ ลดระดับลง',
    descriptionEn: 'Raise arm forward and upward toward overhead position in a controlled motion, then lower smoothly.',
    descriptionCn: '保持身姿直立，将手臂向前上方平稳抬起至目标角度，随后缓慢放下。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/shoulder_flexion.mp4',
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
      startAngleDeg: 25,
      targetMinDeg: 140,
      targetMaxDeg: 170,
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
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บบริเวณข้อต่อหัวไหล่ ให้หยุดพักทันที',
      stopOnPainMessageEn: 'If shoulder joint pain is felt, stop immediately.',
      stopOnPainMessageCn: '如感到肩关节刺痛，请立即停止。',
      maxSafeAngleCapDeg: 175,
    },
  },

  // 3. Shoulder Abduction
  'shoulder-abduction': {
    id: 'shoulder-abduction',
    exerciseId: 'e1000000-0000-0000-0000-000000000003',
    nameTh: 'กางแขนออกด้านข้าง (Shoulder Abduction)',
    nameEn: 'Shoulder Abduction',
    nameCn: '肩部外展侧举',
    descriptionTh: 'ยืนหรือนั่งหน้าตรง ค่อยๆ กางแขนออกด้านข้างลำตัวจนขนานกับพื้นหรือถึงระดับที่สบาย แล้วลดลงช้าๆ',
    descriptionEn: 'Raise arm laterally away from trunk up to shoulder height, hold briefly, and lower slowly.',
    descriptionCn: '身体面向前方，将手臂从身体两侧平稳向外展开至水平高度，然后慢慢收回。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'shoulder',
    mediaUrl: '/assets/exercises/shoulder_abduction.mp4',
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.8, 2.8],
      instructionTextTh: 'ยืนหันหน้าตรงเข้าหากล้อง ให้เห็นลำตัวและแขนทั้งสองข้างอย่างชัดเจน',
      instructionTextEn: 'Face camera directly, 1.8–2.8m away, ensuring full upper body and arms are visible.',
      instructionTextCn: '正对摄像头，距离1.8-2.8米，确保上半身及两侧手臂完全在画面内。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 11, pointB: 13, use3DWorld: true }, // Hip -> Shoulder -> Elbow
        right: { pointA: 24, vertex: 12, pointB: 14, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 20,
      targetMinDeg: 90,
      targetMaxDeg: 150,
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
        ruleId: 'abduction_shoulder_shrug',
        type: 'shoulder_shrug',
        thresholdValue: 0.12,
        warningMessageTh: 'อย่าห่อหรือยกไหล่ขึ้น ให้ใช้กล้ามเนื้อต้นแขนกางออกอย่างผ่อนคลาย',
        warningMessageEn: 'Avoid shrugging shoulders; use upper arm muscles smoothly',
        warningMessageCn: '请避免耸肩，依靠肩臂肌肉平缓外展',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากรู้สึกเจ็บบริเวณข้อต่อหัวไหล่ ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop immediately if shoulder pain occurs.',
      stopOnPainMessageCn: '肩部如有疼痛不适，请立刻停止休息。',
      maxSafeAngleCapDeg: 155,
    },
  },

  // 4. Elbow Flexion
  'elbow-flexion': {
    id: 'elbow-flexion',
    exerciseId: 'e1000000-0000-0000-0000-000000000004',
    nameTh: 'งอ-เหยียดข้อศอก (Elbow Flexion-Extension)',
    nameEn: 'Elbow Flexion-Extension',
    nameCn: '肘部屈伸练习',
    descriptionTh: 'เริ่มจากแขนเหยียดตรง ค่อยๆ งอข้อศอกพับมือเข้าหาหัวไหล่ แล้วเหยียดกลับสู่ตำแหน่งเดิม',
    descriptionEn: 'Start with arm extended, smoothly bend elbow bringing hand toward shoulder, then extend fully.',
    descriptionCn: '手臂自然伸直，平缓弯曲肘关节将手带向肩部，随后再次充分伸直。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'elbow',
    mediaUrl: '/assets/exercises/elbow_flexion.mp4',
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [1.5, 2.5],
      instructionTextTh: 'หันข้างเฉียง 45° ให้เห็นแขนตั้งแต่หัวไหล่ ข้อศอก และข้อมือชัดเจน',
      instructionTextEn: 'Angle 45° to camera, 1.5–2.5m distance, showing shoulder, elbow, and wrist clearly.',
      instructionTextCn: '侧对镜头45°，距离1.5-2.5米，确保肩、肘、腕清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 13, pointB: 15, use3DWorld: true }, // Shoulder -> Elbow -> Wrist
        right: { pointA: 12, vertex: 14, pointB: 16, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 155,
      targetMinDeg: 20,
      targetMaxDeg: 55,
      toleranceDeg: 10,
      holdDurationSec: 0.5,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'elbow_swing_warning',
        type: 'trunk_lean',
        thresholdValue: 0.15,
        warningMessageTh: 'แนบต้นแขนข้างลำตัว ไม่แกว่งข้อศอกไปข้างหน้าหรือข้างหลัง',
        warningMessageEn: 'Keep upper arm pinned by your side; avoid swinging elbow',
        warningMessageCn: '请将上臂贴合身侧，避免肘部前后晃动',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บบริเวณข้อศอก ให้ผ่อนแรงและหยุดพัก',
      stopOnPainMessageEn: 'Stop if elbow joint pain occurs.',
      stopOnPainMessageCn: '肘部若有刺痛，请停止休息。',
      maxSafeAngleCapDeg: 175,
    },
  },

  // 5. Wall Push-up
  'wall-pushup': {
    id: 'wall-pushup',
    exerciseId: 'e1000000-0000-0000-0000-000000000005',
    nameTh: 'ดันผนัง (Wall Push-up)',
    nameEn: 'Wall Push-up',
    nameCn: '推墙俯卧撑',
    descriptionTh: 'ยืนห่างผนัง 1 ช่วงแขน วางฝ่ามือระนาบอก โน้มตัวงอศอกเข้าหาผนัง แล้วออกแรงดันตัวกลับ',
    descriptionEn: 'Stand arm-length from wall, palms at chest level. Bend elbows leaning toward wall, then push back smoothly.',
    descriptionCn: '站立距墙约一臂长，双手平推墙面。慢速屈肘将身体向墙面倾斜，随后发力推起回原位。',
    framing: 'upper_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'elbow',
    mediaUrl: '/assets/exercises/wall_pushup.mp4',
    cameraGuide: {
      recommendedView: 'side_90',
      recommendedDistanceMeters: [1.8, 2.8],
      instructionTextTh: 'ยืนหันข้างให้กล้อง ห่างผนัง 1 ก้าว ให้เห็นแนวด้านข้างลำตัวและข้อศอก',
      instructionTextEn: 'Side view (90°), 1.8–2.8m away, showing lateral trunk and elbow angle clearly.',
      instructionTextCn: '侧身90°面向摄像头，距离1.8-2.8米，展示侧身与肘部屈伸角度。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 13, pointB: 15, use3DWorld: true }, // Shoulder -> Elbow -> Wrist
        right: { pointA: 12, vertex: 14, pointB: 16, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 155,
      targetMinDeg: 75,
      targetMaxDeg: 110,
      toleranceDeg: 10,
      holdDurationSec: 0.5,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'wall_trunk_sag',
        type: 'trunk_lean',
        thresholdValue: 0.20,
        warningMessageTh: 'เกร็งลำตัวให้เป็นเส้นตรง อย่าแอ่นหลังหรือโก่งหลัง',
        warningMessageEn: 'Keep trunk rigid in a straight line; do not sag hips',
        warningMessageCn: '收紧核心保持身体呈一条直线，切勿塌腰',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บข้อมือหรือหัวไหล่ ให้ลดระยะก้าวและหยุดพัก',
      stopOnPainMessageEn: 'Stop if wrist or shoulder pain occurs.',
      stopOnPainMessageCn: '手腕或肩部如觉疼痛，请缩短站立距离并停下休息。',
      maxSafeAngleCapDeg: 175,
    },
  },

  // 6. Neck Side Tilt
  'neck-side-tilt': {
    id: 'neck-side-tilt',
    exerciseId: 'e1000000-0000-0000-0000-000000000006',
    nameTh: 'เอียงคอซ้าย-ขวา (Neck Side Tilt)',
    nameEn: 'Neck Side Tilt',
    nameCn: '颈部侧倾拉伸',
    descriptionTh: 'นั่งหลังตรง ค่อยๆ เอียงศีรษะพับใบหูเข้าหาหัวไหล่ รู้สึกตึงผ่อนคลายกล้ามเนื้อคอ แล้วกลับสู่ตรงกลาง',
    descriptionEn: 'Sit upright, slowly tilt head sideways bringing ear toward shoulder without lifting shoulder, then return.',
    descriptionCn: '坐姿端正，缓缓向侧方倾斜头部让耳朵贴近肩部，感受颈侧拉伸，随后平缓回正。',
    framing: 'head_shoulders',
    evaluationMode: 'neck_tilt',
    side: 'bilateral',
    targetJoint: 'neck',
    mediaUrl: '/assets/exercises/neck_side_tilt.mp4',
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [1.2, 2.0],
      instructionTextTh: 'นั่งหน้าตรงเข้าหากล้อง ระยะ 1.2–2.0 ม. ให้เห็นใบหน้า หู และหัวไหล่ทั้งสองข้าง',
      instructionTextEn: 'Face camera directly, 1.2–2.0m away, keeping head, ears, and both shoulders in frame.',
      instructionTextCn: '正对摄像头就坐，距离1.2-2.0米，确保面部、双耳及双肩完整展现。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 7, vertex: 11, pointB: 8, use3DWorld: false }, // Left Ear (7) & Right Ear (8) vs Shoulder line (11, 12)
        right: { pointA: 8, vertex: 12, pointB: 7, use3DWorld: false },
      },
      direction: 'increase',
      startAngleDeg: 4,
      targetMinDeg: 18,
      targetMaxDeg: 40,
      toleranceDeg: 4,
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
        thresholdValue: 0.12,
        warningMessageTh: 'ผ่อนคลายหัวไหล่ ไม่ยกไหล่ขึ้นหาหูขณะเอียงศีรษะ',
        warningMessageEn: 'Relax shoulders; do not hike shoulder toward ear',
        warningMessageCn: '下沉肩部，侧头时请勿耸起肩膀',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากมีอาการวิงเวียน มึนศีรษะ หรือเจ็บแปลบ ให้หยุดทันที',
      stopOnPainMessageEn: 'Stop immediately if dizziness or sharp neck pain occurs.',
      stopOnPainMessageCn: '若感到头晕或颈部神经刺痛，请立即停止。',
      maxSafeAngleCapDeg: 50,
    },
  },

  // 7. Sit-to-Stand
  'sit-to-stand': {
    id: 'sit-to-stand',
    exerciseId: 'e1000000-0000-0000-0000-000000000007',
    nameTh: 'ลุกยืนจากเก้าอี้ (Sit-to-Stand)',
    nameEn: 'Sit-to-Stand',
    nameCn: '坐姿起立训练',
    descriptionTh: 'เริ่มจากนั่งบนเก้าอี้ วางเท้ากว้างเท่าหัวไหล่ ออกแรงที่ต้นขาลุกขึ้นยืนตรง แล้วค่อยๆ นั่งลงกลับสู่เก้าอี้',
    descriptionEn: 'Start seated on a stable chair. Push through heels to stand fully upright, then slowly lower back down.',
    descriptionCn: '端坐在稳固椅子上，双脚与肩同宽，股四头肌发力站起至身姿笔直，随后轻缓坐回。',
    framing: 'full_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'knee',
    mediaUrl: '/assets/exercises/sit_to_stand.mp4',
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [2.2, 3.2],
      instructionTextTh: 'ถอยห่างจากกล้อง 2.2–3.2 เมตร ให้เห็นร่างกายเต็มตัวตั้งแต่ศีรษะถึงปลายเท้าขณะนั่งและยืน',
      instructionTextEn: 'Step back 2.2–3.2m so full body from head to feet is visible throughout sitting and standing.',
      instructionTextCn: '后退2.2至3.2米至全身在画面中，确保坐立过程中从头部到脚底全程可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 25, pointB: 27, use3DWorld: true }, // Hip -> Knee -> Ankle
        right: { pointA: 24, vertex: 26, pointB: 28, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 85,
      targetMinDeg: 158,
      targetMaxDeg: 180,
      toleranceDeg: 10,
      holdDurationSec: 0.5,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 45,
    },
    compensationRules: [
      {
        ruleId: 'knee_valgus_warning',
        type: 'trunk_lean',
        thresholdValue: 0.20,
        warningMessageTh: 'อย่าให้หัวเข่าบิดเข้าหากัน ให้แนวเข่าชี้ตรงไปทางเดียวกับปลายเท้า',
        warningMessageEn: 'Keep knees tracking over toes; do not let knees cave inward',
        warningMessageCn: '注意膝关节与脚尖朝向一致，避免膝盖内扣',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บข้อเข่าหรือเสียการทรงตัว ให้จับพนักเก้าอี้และหยุดพักทันที',
      stopOnPainMessageEn: 'Hold onto chair armrests and stop if knee pain or unsteadiness occurs.',
      stopOnPainMessageCn: '膝部疼痛或重心不稳时，请扶稳椅背并停下。',
      maxSafeAngleCapDeg: 185,
    },
  },

  // 8. Seated Knee Extension
  'seated-knee-ext': {
    id: 'seated-knee-ext',
    exerciseId: 'e1000000-0000-0000-0000-000000000008',
    nameTh: 'นั่งเหยียดเข่า (Seated Knee Extension)',
    nameEn: 'Seated Knee Extension',
    nameCn: '坐姿伸膝训练',
    descriptionTh: 'นั่งบนเก้าอี้ ค่อยๆ เตะเหยียดขาไปข้างหน้าจนข้อเข่าตรง ค้างไว้เกร็งต้นขา แล้วลดขาลงช้าๆ',
    descriptionEn: 'Sit upright on a chair, slowly kick lower leg forward until knee is straight, squeeze quad, and lower down.',
    descriptionCn: '端坐在椅子上，平稳踢起小腿直至膝盖伸直，顶峰收缩股四头肌，随后缓慢下放。',
    framing: 'lower_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'knee',
    mediaUrl: '/assets/exercises/knee_extension.mp4',
    cameraGuide: {
      recommendedView: 'side_90',
      recommendedDistanceMeters: [1.8, 2.8],
      instructionTextTh: 'นั่งเก้าอี้หันข้าง 45°–90° ระยะ 1.8–2.8 ม. ให้เห็นสะโพก หัวเข่า และข้อเท้าชัดเจน',
      instructionTextEn: 'Sit at 45°–90° angle, 1.8–2.8m from camera, keeping hip, knee, and ankle clearly in view.',
      instructionTextCn: '侧坐45°-90°面向摄像头，距离1.8-2.8米，清晰展示髋、膝及脚踝。',
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
      holdDurationSec: 1.0,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'knee_ext_lean_back',
        type: 'trunk_lean',
        thresholdValue: 0.18,
        warningMessageTh: 'นั่งหลังตรง ไม่เอนตัวไปข้างหลังขณะเหยียดขา',
        warningMessageEn: 'Keep spine straight; do not lean torso backward',
        warningMessageCn: '坐姿挺直，伸腿时身体不要过度后仰',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บใต้สะบ้าหัวเข่า ให้ลดระดับการเหยียดและหยุดพัก',
      stopOnPainMessageEn: 'Stop if patellofemoral pain occurs.',
      stopOnPainMessageCn: '髌骨下方如有锐痛，请减少伸展幅度并休息。',
      maxSafeAngleCapDeg: 185,
    },
  },

  // 9. Standing Hip Abduction
  'standing-hip-abd': {
    id: 'standing-hip-abd',
    exerciseId: 'e1000000-0000-0000-0000-000000000009',
    nameTh: 'ยืนยกขาออกด้านข้าง (Standing Hip Abduction)',
    nameEn: 'Standing Hip Abduction',
    nameCn: '站姿髋外展侧抬腿',
    descriptionTh: 'ยืนตรงเกาะเก้าอี้ช่วยพยุง ค่อยๆ กางขาข้างที่ฝึกออกด้านข้างลำตัวโดยไม่เอียงตัว แล้ววางขากลับที่เดิม',
    descriptionEn: 'Stand upright holding chair for balance, lift leg out to the side without leaning pelvis, then lower down.',
    descriptionCn: '站立扶椅保持平衡，保持骨盆水平，平稳将单腿向侧面抬起，随后平缓放回地面。',
    framing: 'full_body',
    evaluationMode: 'angle_rep_hold',
    side: 'bilateral',
    targetJoint: 'hip',
    mediaUrl: '/assets/exercises/hip_abduction.mp4',
    cameraGuide: {
      recommendedView: 'front',
      recommendedDistanceMeters: [2.0, 3.0],
      instructionTextTh: 'ยืนหันหน้าตรงเข้าหากล้อง ระยะ 2.0–3.0 ม. ให้เห็นเต็มตัวตั้งแต่ลำตัวถึงข้อเท้า',
      instructionTextEn: 'Face camera directly, 2.0–3.0m away, with whole body from shoulders to ankles in frame.',
      instructionTextCn: '正对摄像头站立，距离2.0-3.0米，确保从肩部至脚踝全身在画面内。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 11, vertex: 23, pointB: 27, use3DWorld: true }, // Shoulder -> Hip -> Ankle
        right: { pointA: 12, vertex: 24, pointB: 28, use3DWorld: true },
      },
      direction: 'decrease',
      startAngleDeg: 175,
      targetMinDeg: 125,
      targetMaxDeg: 155,
      toleranceDeg: 10,
      holdDurationSec: 0.5,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'hip_trunk_lateral_flexion',
        type: 'trunk_lateral_flexion',
        thresholdValue: 0.15,
        warningMessageTh: 'รักษาลำตัวให้ตั้งตรง อย่าเอียงตัวช่วยยกขา',
        warningMessageEn: 'Keep torso upright; do not tilt body laterally to lift leg',
        warningMessageCn: '请保持身体正直，不要通过侧弯上身来借力抬腿',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บบริเวณข้อสะโพกหรือหลังส่วนล่าง ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop if hip joint or lumbar pain occurs.',
      stopOnPainMessageCn: '髋关节或下背部若出现痛感，请停下休息。',
      maxSafeAngleCapDeg: 165,
    },
  },

  // 10. Heel Raise
  'heel-raise': {
    id: 'heel-raise',
    exerciseId: 'e1000000-0000-0000-0000-000000000010',
    nameTh: 'ยืนเขย่งส้นเท้า (Heel Raise)',
    nameEn: 'Heel Raise',
    nameCn: '站姿提踵训练',
    descriptionTh: 'ยืนตรงเกาะพนักเก้าอี้ ค่อยๆ เขย่งส้นเท้าทั้งสองข้างขึ้นให้สูงที่สุด ค้างไว้แล้วลดส้นเท้าลงแตะพื้น',
    descriptionEn: 'Stand upright holding chair for balance, lift heels off the floor raising onto balls of feet, hold, then lower.',
    descriptionCn: '站姿扶椅，慢速抬起双脚脚后跟至最高点，小腿肌群收缩蓄力，随后平稳落回地面。',
    framing: 'full_body',
    evaluationMode: 'heel_raise',
    side: 'bilateral',
    targetJoint: 'ankle',
    mediaUrl: '/assets/exercises/heel_raise.mp4',
    cameraGuide: {
      recommendedView: 'side_45',
      recommendedDistanceMeters: [2.0, 3.0],
      instructionTextTh: 'ยืนหันข้างเฉียง 45° ระยะ 2.0–3.0 ม. ให้เห็นข้อสะโพก เข่า ข้อเท้า และปลายเท้าชัดเจน',
      instructionTextEn: 'Angle 45° to camera, 2.0–3.0m away, keeping hips, knees, ankles, and feet visible.',
      instructionTextCn: '侧对镜头45°站立，距离2.0-3.0米，确保髋、膝、踝及脚掌清晰可见。',
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 27, pointB: 31, use3DWorld: true }, // Hip -> Ankle -> Foot Index
        right: { pointA: 24, vertex: 28, pointB: 32, use3DWorld: true },
      },
      direction: 'increase',
      startAngleDeg: 90,
      targetMinDeg: 110,
      targetMaxDeg: 140,
      toleranceDeg: 8,
      holdDurationSec: 0.5,
    },
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
    },
    compensationRules: [
      {
        ruleId: 'heel_raise_knee_bend',
        type: 'elbow_flexion',
        thresholdValue: 0.20,
        warningMessageTh: 'รักษาขาให้เหยียดตรง ออกแรงยกจากกล้ามเนื้อน่อง',
        warningMessageEn: 'Keep legs straight; push up through calf muscles',
        warningMessageCn: '保持腿部伸直，依靠小腿肌群充分提踵',
        severity: 'warning',
      },
    ],
    safetyContraindications: {
      stopOnPainMessageTh: 'หากเจ็บเอ็นร้อยหวายหรือฝ่าเท้า ให้หยุดพักทันที',
      stopOnPainMessageEn: 'Stop if Achilles tendon or plantar fascia pain occurs.',
      stopOnPainMessageCn: '跟腱或足底如有剧烈牵拉痛，请立刻停止。',
      maxSafeAngleCapDeg: 150,
    },
  },
};

export const ALL_CLINICAL_EXERCISES: ExerciseDetectionConfig[] = Object.values(CLINICAL_EXERCISES_CONFIG);

export function getClinicalExerciseConfig(idOrName?: string | null): ExerciseDetectionConfig | null {
  if (!idOrName) return null;
  const q = idOrName.toLowerCase().trim();

  if (CLINICAL_EXERCISES_CONFIG[q]) {
    return CLINICAL_EXERCISES_CONFIG[q];
  }

  for (const ex of ALL_CLINICAL_EXERCISES) {
    if (ex.id === q || ex.exerciseId === q) return ex;
    if (ex.nameTh.toLowerCase().includes(q) || q.includes(ex.nameTh.toLowerCase())) return ex;
    if (ex.nameEn.toLowerCase().includes(q) || q.includes(ex.nameEn.toLowerCase())) return ex;
    if (ex.nameCn && (ex.nameCn.includes(q) || q.includes(ex.nameCn))) return ex;
  }

  // Keyword matchers
  if (q.includes('pendulum') || q.includes('แกว่งแขน') || q.includes('钟摆')) return CLINICAL_EXERCISES_CONFIG['shoulder-pendulum'];
  if (q.includes('flexion') || q.includes('ยกแขน') || q.includes('前屈')) return CLINICAL_EXERCISES_CONFIG['shoulder-flexion'];
  if (q.includes('abduction') || q.includes('กางแขน') || q.includes('外展')) return CLINICAL_EXERCISES_CONFIG['shoulder-abduction'];
  if (q.includes('elbow') || q.includes('ศอก') || q.includes('屈伸')) return CLINICAL_EXERCISES_CONFIG['elbow-flexion'];
  if (q.includes('pushup') || q.includes('ดันผนัง') || q.includes('推墙')) return CLINICAL_EXERCISES_CONFIG['wall-pushup'];
  if (q.includes('neck') || q.includes('คอ') || q.includes('颈部')) return CLINICAL_EXERCISES_CONFIG['neck-side-tilt'];
  if (q.includes('stand') || q.includes('ลุกยืน') || q.includes('起立')) return CLINICAL_EXERCISES_CONFIG['sit-to-stand'];
  if (q.includes('knee') || q.includes('เหยียดเข่า') || q.includes('伸膝')) return CLINICAL_EXERCISES_CONFIG['seated-knee-ext'];
  if (q.includes('hip') || q.includes('ยกขา') || q.includes('侧抬腿')) return CLINICAL_EXERCISES_CONFIG['standing-hip-abd'];
  if (q.includes('heel') || q.includes('เขย่ง') || q.includes('提踵')) return CLINICAL_EXERCISES_CONFIG['heel-raise'];

  return null;
}
