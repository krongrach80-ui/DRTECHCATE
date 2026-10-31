-- =========================================================================
-- Migration: 20261031000001_seed_all_10_clinical_exercises.sql
-- Description: Seed all 10 clinical physical therapy exercises into public.exercises
-- with trilingual metadata (TH/EN/CN) and detection_config JSONB
-- =========================================================================

INSERT INTO public.exercises (id, title, description, target_joint, suitable_for, warnings, default_sets, default_reps, difficulty, detection_config)
VALUES
(
  'e1000000-0000-0000-0000-000000000001',
  'Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่ / 钟摆摆臂放松肩部)',
  'โน้มลำตัวไปข้างหน้า ปล่อยแขนห้อยลงตามแรงโน้มถ่วง และแกว่งเป็นวงกลมเบาๆ เพื่อผ่อนคลายข้อต่อและเพิ่มการไหลเวียนเลือด',
  'shoulder',
  'ผู้ป่วยข้อไหล่ติดระยะแรก (Frozen Shoulder)',
  'ห้ามออกแรงเกร็งกล้ามเนื้อไหล่ ให้ใช้แรงเหวี่ยงจากลำตัว',
  3,
  10,
  'easy',
  '{
    "id": "shoulder-pendulum",
    "nameTh": "Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)",
    "nameEn": "Shoulder Pendulum",
    "nameCn": "钟摆摆臂放松肩部",
    "framing": "upper_body",
    "evaluationMode": "pendulum_circular",
    "side": "right",
    "targetJoint": "shoulder",
    "cameraGuide": {
      "recommendedView": "side_45",
      "recommendedDistanceMeters": [1.5, 2.5],
      "instructionTextTh": "กรุณายืนหันข้างเฉียง 45° ถึง 90° ระยะห่าง 1.5 - 2.5 เมตรจากกล้อง โน้มตัวไปข้างหน้าเล็กน้อย และปล่อยแขนข้างที่ต้องการฝึกให้ห้อยลงอย่างผ่อนคลาย",
      "instructionTextEn": "Stand at a 45° to 90° side angle, 1.5 - 2.5m away. Lean slightly forward and let arm hang relaxed.",
      "instructionTextCn": "侧向 45°–90° 站立，距离摄像头 1.5–2.5 米。身体稍微前倾，手臂自然下垂放松。"
    },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หากมีอาการเจ็บแปลบบริเวณข้อไหล่ ให้หยุดทันที", "maxSafeAngleCapDeg": 90 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000002',
  'Shoulder Flexion (ยกแขนไปข้างหน้า / 肩部前屈举臂)',
  'ยกแขนเหยียดตรงไปข้างหน้าช้าๆ จากแนวข้างลำตัวขึ้นสู่อากาศจนถึงระดับเป้าหมาย แล้วผ่อนลงอย่างควบคุม',
  'shoulder',
  'ผู้ป่วยฟื้นฟูพิสัยการเคลื่อนไหวข้อไหล่ในแนวหน้า-หลัง',
  'อย่าแอ่นหลังหรือเอียงลำตัวชดเชยขณะยกแขน',
  3,
  10,
  'easy',
  '{
    "id": "shoulder-flexion",
    "nameTh": "Shoulder Flexion (ยกแขนไปข้างหน้า)",
    "nameEn": "Shoulder Flexion",
    "nameCn": "肩部前屈举臂",
    "framing": "upper_body",
    "evaluationMode": "angle_rep_hold",
    "side": "right",
    "targetJoint": "shoulder",
    "cameraGuide": {
      "recommendedView": "side_90",
      "recommendedDistanceMeters": [1.8, 2.5],
      "instructionTextTh": "ยืนหรือนั่งหันข้าง 90° ห่างจากกล้องประมาณ 2 เมตร เพื่อให้เห็นมุมการยกแขนด้านข้างชัดเจน",
      "instructionTextEn": "Stand or sit sideways (90° view) 2m away for optimal sagittal arm angle detection.",
      "instructionTextCn": "侧身 90° 站立或坐姿，距离摄像头约 2 米，以便准确捕捉手臂前屈角度。"
    },
    "angleMechanics": { "startAngleDeg": 25, "targetMinDeg": 140, "targetMaxDeg": 170, "toleranceDeg": 12, "direction": "increase" },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีเมื่อรู้สึกเจ็บแปลบบริเวณข้อไหล่", "maxSafeAngleCapDeg": 175 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000003',
  'Shoulder Abduction (กางแขนออกด้านข้าง / 肩部外展侧举)',
  'กางแขนตรงออกด้านข้างลำตัวช้าๆ จนถึงระดับขนานพื้นหรือเหนือกว่าเล็กน้อย ค้างไว้สั้นๆ แล้วลดแขนลง',
  'shoulder',
  'ผู้ป่วยฟื้นฟูกล้ามเนื้อเดลทอยด์และพิสัยการกางข้อไหล่',
  'ระวังการยักไหล่ชดเชย (Scapular Hiking) ให้ผ่อนคลายกล้ามเนื้อคอบ่า',
  3,
  10,
  'easy',
  '{
    "id": "shoulder-abduction",
    "nameTh": "Shoulder Abduction (กางแขนออกด้านข้าง)",
    "nameEn": "Shoulder Abduction",
    "nameCn": "肩部外展侧举",
    "framing": "upper_body",
    "evaluationMode": "angle_rep_hold",
    "side": "right",
    "targetJoint": "shoulder",
    "cameraGuide": {
      "recommendedView": "front",
      "recommendedDistanceMeters": [1.8, 2.5],
      "instructionTextTh": "ยืนหันหน้าตรงเข้าหากล้อง ห่าง 1.8 - 2.5 เมตร เพื่อให้เห็นการกางแขนออกทั้งสองด้าน",
      "instructionTextEn": "Face the camera directly, 1.8 - 2.5m away, ensuring both shoulders and arms are in frame.",
      "instructionTextCn": "正对摄像头站立，距离 1.8–2.5 米，确保双肩与手臂完全处于视野内。"
    },
    "angleMechanics": { "startAngleDeg": 20, "targetMinDeg": 90, "targetMaxDeg": 150, "toleranceDeg": 12, "direction": "increase" },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีเมื่อมีอาการเจ็บหรือแปลบบริเวณข้อต่อหัวไหล่", "maxSafeAngleCapDeg": 165 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000004',
  'Elbow Flexion-Extension (งอ-เหยียดข้อศอก / 肘部屈伸练习)',
  'เริ่มต้นจากแขนเหยียดตรง ออกแรงงอพับข้อศอกขึ้นเข้าหาหัวไหล่ แล้วเหยียดกลับสู่แนวตรงเต็มพิสัย',
  'elbow',
  'ผู้ป่วยหลังผ่าตัดหรือบาดเจ็บบริเวณข้อศอกและแขนท่อนบน',
  'รักษาระดับต้นแขนให้อยู่ข้างลำตัว ไม่ยกหรือแกว่งต้นแขน',
  3,
  10,
  'easy',
  '{
    "id": "elbow-flexion",
    "nameTh": "Elbow Flexion-Extension (งอ-เหยียดข้อศอก)",
    "nameEn": "Elbow Flexion-Extension",
    "nameCn": "肘部屈伸练习",
    "framing": "upper_body",
    "evaluationMode": "angle_rep_hold",
    "side": "right",
    "targetJoint": "elbow",
    "cameraGuide": {
      "recommendedView": "side_45",
      "recommendedDistanceMeters": [1.5, 2.2],
      "instructionTextTh": "ยืนหรือนั่งหันข้างเฉียง 45° ระยะห่าง 1.5 - 2.2 เมตร ให้เห็นแนวไหล่ ศอก และข้อมือชัดเจน",
      "instructionTextEn": "Stand or sit at a 45° side angle, 1.5 - 2.2m away. Keep upper arm steady against torso.",
      "instructionTextCn": "侧向 45° 坐姿或站立，距离 1.5–2.2 米，保持大臂紧贴身体躯干两侧。"
    },
    "angleMechanics": { "startAngleDeg": 150, "targetMinDeg": 20, "targetMaxDeg": 55, "toleranceDeg": 10, "direction": "decrease" },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีหากรู้สึกเจ็บหรือขัดในข้อศอก", "maxSafeAngleCapDeg": 175 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000005',
  'Wall Push-up (ดันผนัง / วิดพื้นพิงผนัง / 推墙俯卧撑)',
  'ยืนห่างจากผนังประมาณ 1 ก้าว วางมือแนบผนัง งอข้อศอกโน้มตัวเข้าหาผนัง แล้วออกแรงดันตัวกลับสู่ท่าเริ่มต้น',
  'elbow',
  'ผู้สูงอายุและผู้ป่วยที่ต้องการเสริมสร้างความแข็งแรงของกล้ามเนื้อแขนและหน้าอกอย่างปลอดภัย',
  'รักษาแนวลำตัวและสะโพกให้ตรง ไม่แอ่นหรือโก่งหลัง',
  3,
  10,
  'easy',
  '{
    "id": "wall-pushup",
    "nameTh": "Wall Push-up (ดันผนัง)",
    "nameEn": "Wall Push-up",
    "nameCn": "推墙俯卧撑",
    "framing": "upper_body",
    "evaluationMode": "angle_rep_hold",
    "side": "right",
    "targetJoint": "elbow",
    "cameraGuide": {
      "recommendedView": "side_45",
      "recommendedDistanceMeters": [1.8, 2.5],
      "instructionTextTh": "ยืนหันข้างเฉียง 45° เข้าหากล้องขณะยืนพิงผนัง ให้กล้องมองเห็นแนวศอกและลำตัว",
      "instructionTextEn": "Position camera at 45° angle to capture arm bend and torso alignment during push-up.",
      "instructionTextCn": "摄像头侧向 45° 摆放，清晰拍摄推墙过程中手肘屈伸及身体躯干挺直状态。"
    },
    "angleMechanics": { "startAngleDeg": 150, "targetMinDeg": 75, "targetMaxDeg": 110, "toleranceDeg": 10, "direction": "decrease" },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีเมื่อมีอาการเจ็บบริเวณข้อมือ ข้อศอก หรือหัวไหล่", "maxSafeAngleCapDeg": 175 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000006',
  'Neck Side Tilt (เอียงคอซ้าย-ขวา / 颈部侧倾拉伸)',
  'มองตรงไปข้างหน้า ค่อยๆ เอียงศีรษะให้ใบหูเข้าหาหัวไหล่ช้าๆ จนรู้สึกตึงสบาย ค้างไว้ แล้วกลับสู่ศีรษะตั้งตรง',
  'neck',
  'ผู้ป่วยออฟฟิศซินโดรม กล้ามเนื้อคอตึงเกร็ง และหมอนรองกระดูกคอระยะฟื้นฟู',
  'ห้ามยกหรือเกร็งยักไหล่ขึ้นมารับศีรษะ ให้คอเป็นฝ่ายเอียงลงไปเท่านั้น',
  3,
  10,
  'easy',
  '{
    "id": "neck-side-tilt",
    "nameTh": "Neck Side Tilt (เอียงคอซ้าย-ขวา)",
    "nameEn": "Neck Side Tilt",
    "nameCn": "颈部侧倾拉伸",
    "framing": "head_shoulders",
    "evaluationMode": "neck_tilt",
    "side": "right",
    "targetJoint": "neck",
    "cameraGuide": {
      "recommendedView": "front",
      "recommendedDistanceMeters": [1.0, 1.8],
      "instructionTextTh": "นั่งหรือยืนหันหน้าตรงเข้าหากล้อง ระยะห่าง 1 - 1.8 เมตร ให้เห็นใบหน้า หู และแนวหัวไหล่ชัดเจน",
      "instructionTextEn": "Face camera directly, 1.0 - 1.8m away. Ensure ears and both shoulders are visible.",
      "instructionTextCn": "正对摄像头坐下或站立，距离 1–1.8 米，确保面部、双耳及双肩水平线清晰可见。"
    },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 20 },
    "safetyContraindications": { "stopOnPainMessageTh": "หากมีอาการเจ็บแปลบ ชาลงแขน หรือเวียนศีรษะ ให้หยุดทันที", "maxSafeAngleCapDeg": 45 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000007',
  'Sit-to-Stand (ลุกยืนจากเก้าอี้ / 坐姿起立训练)',
  'นั่งบนเก้าอี้ เท้าวางราบกับพื้น ออกแรงดันส้นเท้าลุกขึ้นยืนจนข้อเข่าเหยียดตรงเต็มที่ แล้วค่อยๆ นั่งลงกลับสู่เก้าอี้',
  'knee',
  'ผู้สูงอายุ ผู้ป่วยหลังผ่าตัดข้อเข่า และผู้ที่ต้องการเพิ่มกำลังกล้ามเนื้อต้นขาเพื่อการทรงตัว',
  'ไม่ก้มตัวมากเกินไป และควบคุมจังหวะนั่งลงอย่างช้าๆ ห้ามทิ้งตัวลงเก้าอี้กระแทก',
  3,
  10,
  'medium',
  '{
    "id": "sit-to-stand",
    "nameTh": "Sit-to-Stand (ลุกยืนจากเก้าอี้)",
    "nameEn": "Sit-to-Stand",
    "nameCn": "坐姿起立训练",
    "framing": "full_body",
    "evaluationMode": "angle_rep_hold",
    "side": "right",
    "targetJoint": "knee",
    "cameraGuide": {
      "recommendedView": "side_45",
      "recommendedDistanceMeters": [2.0, 2.8],
      "instructionTextTh": "กรุณาถอยห่างจากกล้อง 2 - 2.8 เมตร หันข้างเฉียง 45° ให้เห็นเก้าอี้ สะโพก เข่า และเท้าเต็มตัว",
      "instructionTextEn": "Step back 2.0 - 2.8m at 45° side angle so the chair, hips, knees, and feet are fully in frame.",
      "instructionTextCn": "后退 2–2.8 米并侧向 45°，确保椅子、髋部、双膝及脚踝全身入镜。"
    },
    "angleMechanics": { "startAngleDeg": 85, "targetMinDeg": 158, "targetMaxDeg": 180, "toleranceDeg": 10, "direction": "increase" },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 45 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีหากมีอาการเจ็บข้อเข่าเฉียบพลันหรือหน้ามืด", "maxSafeAngleCapDeg": 185 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000008',
  'Seated Knee Extension (นั่งเหยียดเข่า / 坐姿伸膝训练)',
  'นั่งบนเก้าอี้ เตะปลายเท้าเหยียดเข่าข้างที่ฝึกขึ้นตรงขนานพื้น ค้างไว้ 1-2 วินาที แล้วผ่อนขากลับลงช้าๆ',
  'knee',
  'ผู้ป่วยข้อเข่าเสื่อม (OA Knee) และผู้ป่วยฟื้นฟูกล้ามเนื้อ Quadriceps หลังการบาดเจ็บ',
  'ลำตัวตรงพิงพนักเก้าอี้ ไม่งอหลังหรือเอนตัวไปข้างหลังขณะเตะขา',
  3,
  10,
  'easy',
  '{
    "id": "seated-knee-ext",
    "nameTh": "Seated Knee Extension (นั่งเหยียดเข่า)",
    "nameEn": "Seated Knee Extension",
    "nameCn": "坐姿伸膝训练",
    "framing": "lower_body",
    "evaluationMode": "angle_rep_hold",
    "side": "right",
    "targetJoint": "knee",
    "cameraGuide": {
      "recommendedView": "side_90",
      "recommendedDistanceMeters": [1.8, 2.5],
      "instructionTextTh": "นั่งหันข้าง 90° ระยะ 1.8 - 2.5 เมตร ให้กล้องมองเห็นสะโพก ต้นขา หัวเข่า และข้อเท้า",
      "instructionTextEn": "Sit sideways (90° view), 1.8 - 2.5m away, capturing the hip, knee, and lower leg movement.",
      "instructionTextCn": "侧身 90° 坐姿，距离 1.8–2.5 米，使摄像头能完整捕捉髋、膝、踝关节活动度。"
    },
    "angleMechanics": { "startAngleDeg": 90, "targetMinDeg": 155, "targetMaxDeg": 180, "toleranceDeg": 10, "direction": "increase" },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีเมื่อมีอาการเจ็บแปลบใต้สะบ้าหัวเข่า", "maxSafeAngleCapDeg": 180 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000009',
  'Standing Hip Abduction (ยืนยกขาออกด้านข้าง / 站姿髋外展侧抬腿)',
  'ยืนตรงมือเกาะพนักเก้าอี้เพื่อความมั่นคง กางขาข้างที่ฝึกออกด้านข้างลำตัวตรงๆ แล้วค่อยๆ นำขากลับสู่ตำแหน่งเดิม',
  'hip',
  'ผู้ป่วยฟื้นฟูกล้ามเนื้อสะโพก (Gluteus Medius) และเพิ่มความมั่นคงในการทรงตัวขณะเดิน',
  'ลำตัวต้องตั้งตรง ไม่เอียงตัวไปด้านตรงข้ามเพื่อชดเชยการกางขา',
  3,
  10,
  'easy',
  '{
    "id": "standing-hip-abd",
    "nameTh": "Standing Hip Abduction (ยืนยกขาออกด้านข้าง)",
    "nameEn": "Standing Hip Abduction",
    "nameCn": "站姿髋外展侧抬腿",
    "framing": "full_body",
    "evaluationMode": "angle_rep_hold",
    "side": "right",
    "targetJoint": "hip",
    "cameraGuide": {
      "recommendedView": "front",
      "recommendedDistanceMeters": [2.0, 2.8],
      "instructionTextTh": "ยืนหน้าตรงเข้าหากล้อง ถอยห่าง 2 - 2.8 เมตร ให้เห็นลำตัวและขาทั้งสองข้างตั้งแต่ศีรษะจรดเท้า",
      "instructionTextEn": "Face camera directly, 2.0 - 2.8m away. Ensure entire full body from head to feet is visible.",
      "instructionTextCn": "正对摄像头站立，后退 2–2.8 米，确保全身从头到脚完整入镜。"
    },
    "angleMechanics": { "startAngleDeg": 175, "targetMinDeg": 130, "targetMaxDeg": 155, "toleranceDeg": 10, "direction": "decrease" },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีหากมีอาการเจ็บบริเวณเบ้าสะโพกหรือหลังส่วนล่าง", "maxSafeAngleCapDeg": 180 }
  }'::jsonb
),
(
  'e1000000-0000-0000-0000-000000000010',
  'Heel Raise (ยืนเขย่งส้นเท้า / 站姿提踵训练)',
  'ยืนตรงปลายเท้าชี้ตรง ออกแรงยกลอยส้นเท้าทั้งสองข้างขึ้นจากพื้น เขย่งค้างไว้ที่จุดสูงสุด แล้วผ่อนส้นเท้าลงแตะพื้น',
  'ankle',
  'ผู้ป่วยฟื้นฟูกล้ามเนื้อน่อง เอ็นร้อยหวาย และเพิ่มความมั่นคงของข้อเท้า',
  'ยกตัวขึ้นในแนวดิ่งตรง ไม่อนุญาตให้ลำตัวโยกไปข้างหน้าหรือแอ่นหลัง',
  3,
  10,
  'easy',
  '{
    "id": "heel-raise",
    "nameTh": "Heel Raise (ยืนเขย่งส้นเท้า)",
    "nameEn": "Heel Raise",
    "nameCn": "站姿提踵训练",
    "framing": "full_body",
    "evaluationMode": "heel_raise",
    "side": "right",
    "targetJoint": "ankle",
    "cameraGuide": {
      "recommendedView": "side_45",
      "recommendedDistanceMeters": [2.0, 2.8],
      "instructionTextTh": "ยืนหันข้างเฉียง 45° ถอยห่าง 2 - 2.8 เมตร ให้กล้องมองเห็นข้อเท้า ส้นเท้า และพื้นยืนชัดเจน",
      "instructionTextEn": "Stand at 45° angle, 2.0 - 2.8m back, clearly capturing the ankles, heels, and floor surface.",
      "instructionTextCn": "侧向 45° 站立，后退 2–2.8 米，确保摄像头清晰拍摄到脚踝、脚后跟与地面接触。"
    },
    "defaultPrescription": { "repsPerSet": 10, "totalSets": 3, "restBetweenSetsSec": 30 },
    "safetyContraindications": { "stopOnPainMessageTh": "หยุดทันทีเมื่อรู้สึกเจ็บแปลบบริเวณเอ็นร้อยหวายหรือฝ่าเท้า", "maxSafeAngleCapDeg": 90 }
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  target_joint = EXCLUDED.target_joint,
  suitable_for = EXCLUDED.suitable_for,
  warnings = EXCLUDED.warnings,
  default_sets = EXCLUDED.default_sets,
  default_reps = EXCLUDED.default_reps,
  difficulty = EXCLUDED.difficulty,
  detection_config = EXCLUDED.detection_config;
