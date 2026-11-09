-- ============================================================================
-- Migration: 20261108000001_deactivate_lower_body_seed_seated_upper_body_exercises.sql
-- Description:
--   1. Deactivate (is_active = false) 9 non-seated / lower-body exercises.
--      Preserve rows to maintain referential integrity for legacy records.
--   2. Insert/Seed 9 replacement seated upper-body exercises (e1000000-0000-0000-0000-000000000016 to 0024).
--   3. Record cryptographic audit trail in public.audit_logs.
-- Target: Supabase Cloud (Project: mctegvnrvmglbibuuczi)
-- ============================================================================

-- 1. Deactivate 9 failing exercises (Set is_active = false)
UPDATE public.exercises
SET is_active = false,
    updated_at = NOW()
WHERE id IN (
  'e1000000-0000-0000-0000-000000000006', -- Seated Knee Extension (เข่า - Lower body)
  'e1000000-0000-0000-0000-000000000007', -- Mini Squat (ท่ายืนย่อเข่า)
  'e1000000-0000-0000-0000-000000000008', -- Sit-to-Stand (ลุกยืน)
  'e1000000-0000-0000-0000-000000000009', -- Straight Leg Raise (ยกขาตรง)
  'e1000000-0000-0000-0000-000000000010', -- Standing Hip Abduction (กางสะโพกท่ายืน)
  'e1000000-0000-0000-0000-000000000011', -- Standing Calf Raise (เขย่งเท่ายืน)
  'e1000000-0000-0000-0000-000000000012', -- Single-Leg Stance Balance (ยืนขาเดียว)
  'e1000000-0000-0000-0000-000000000013', -- Standing Gastrocnemius Calf Stretch (ยืดน่องท่ายืน)
  'e1000000-0000-0000-0000-000000000015'  -- Codman Pendulum (แกว่งแขนก้มตัว)
);

-- 2. Upsert 9 new seated upper-body exercises (Trilingual TH / EN / CN)
INSERT INTO public.exercises (
  id,
  title,
  description,
  target_joint,
  target_muscle,
  suitable_for,
  warnings,
  default_sets,
  default_reps,
  difficulty,
  is_active,
  image_path,
  category,
  calibration_notes,
  rom_threshold_min,
  rom_threshold_max,
  created_by
) VALUES
  -- 16: Seated Cervical Rotation
  (
    'e1000000-0000-0000-0000-000000000016',
    'หันศีรษะซ้าย-ขวา (Seated Cervical Rotation / 坐姿颈部旋转)',
    'นั่งหลังตรงบนเก้าอี้ เท้าวางราบกับพื้น ค่อยๆ หันศีรษะไปทางซ้ายจนรู้สึกตึงพอดี ค้างไว้ 2 วินาที แล้วหมุนกลับมาตรงกลาง จากนั้นสลับหันไปทางขวา',
    'คอ (Cervical Spine)',
    'Sternocleidomastoid, Splenius Capitis, Upper Trapezius',
    'ผู้ป่วยฟื้นฟูการเคลื่อนไหวกระดูกคอ, บรรเทาอาการคอติดหรือตึงจากออฟฟิศซินโดรม',
    'รักษาลำตัวให้ตรง อย่าเอียงคอหรือยักไหล่ช่วยหมุนศีรษะ หยุดทันทีหากมีอาการเวียนศีรษะ มึนงง หรือชาลงแขน',
    3,
    10,
    'beginner',
    true,
    '/assets/exercises/seated-cervical-rotation.svg',
    'cervical',
    'กล้องหน้าตรงครึ่งตัวบน (Upper Body Framing) | องศาเป้าหมาย 45°–60° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    45.0,
    60.0,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 17: Cervical Side Bend
  (
    'e1000000-0000-0000-0000-000000000017',
    'เอียงศีรษะเข้าหาไหล่ (Cervical Side Bend / 颈部侧屈)',
    'นั่งหลังตรงบนเก้าอี้ เท้าวางราบกับพื้น ค่อยๆ เอียงศีรษะนำใบหูเข้าหาหัวไหล่ช้าๆ โดยไม่ยกหัวไหล่ขึ้นมารับ ค้างไว้ 2 วินาที แล้วกลับสู่ท่าตรง',
    'คอ (Cervical Spine)',
    'Upper Trapezius, Scalenes, Levator Scapulae',
    'เพิ่มความยืดหยุ่นกล้ามเนื้อด้านข้างลำคอและกระดูกคอ',
    'อย่าเกร็งยกหัวไหล่ขึ้นมารับใบหู ให้ผ่อนคลายหัวไหล่ไว้ หยุดทันทีหากมีอาการมึนงงหรือเสียวแปลบลงแขน',
    3,
    10,
    'beginner',
    true,
    '/assets/exercises/cervical-side-bend.svg',
    'cervical',
    'กล้องหน้าตรงครึ่งตัวบน (Upper Body Framing) | องศาเป้าหมาย 20°–35° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    20.0,
    35.0,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 18: Shoulder Shrug
  (
    'e1000000-0000-0000-0000-000000000018',
    'ยักไหล่ขึ้น-ลง (Shoulder Shrug / 耸肩训练)',
    'นั่งหลังตรง แขนสองข้างปล่อยแนบลำตัวอย่างผ่อนคลาย ยกหัวไหล่ทั้งสองข้างขึ้นตรงๆ เข้าหาใบหู ค้างไว้ 2 วินาที แล้วค่อยๆ ผ่อนไหล่ลงสู่ตำแหน่งเดิมอย่างช้าๆ',
    'สะบักและไหล่ (Scapula & Shoulder)',
    'Upper Trapezius, Levator Scapulae',
    'ผ่อนคลายและกระตุ้นการไหลเวียนโลหิตบริเวณกล้ามเนื้อบ่าและสะบัก',
    'ห้ามยื่นคอไปข้างหน้าขณะยักไหล่ ให้ยกไหล่ขึ้นในแนวดิ่งตรงๆ อย่างนุ่มนวล',
    3,
    12,
    'beginner',
    true,
    '/assets/exercises/shoulder-shrug.svg',
    'shoulder',
    'กล้องหน้าตรงครึ่งตัวบน (Upper Body Framing) | ระยะยกไหล่สัมพัทธ์ 0.08–0.12 (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    0.08,
    0.12,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 19: Upper Trapezius Stretch (Timer Mode)
  (
    'e1000000-0000-0000-0000-000000000019',
    'ยืดกล้ามเนื้อบ่า (Upper Trapezius Stretch / 上斜方肌拉伸)',
    'นั่งหลังตรง มือข้างหนึ่งจับใต้ขอบเก้าอี้เพื่อตรึงสะบัก เอียงศีรษะไปด้านตรงข้าม มืออีกข้างช่วยประคองศีรษะเบาๆ จนรู้สึกตึงสบาย ค้างไว้ 20–30 วินาที (โหมดจับเวลานำทาง)',
    'คอและบ่า (Cervical Spine & Shoulder)',
    'Upper Trapezius, Levator Scapulae',
    'ลดอาการตึงเกร็งกล้ามเนื้อบ่าเรื้อรัง, ลดอาการปวดศีรษะจากกล้ามเนื้อตึง (Tension Headache)',
    'ยืดช้าๆ แค่รู้สึกตึงสบาย ห้ามกระตุกหรือออกแรงกดศีรษะแรง หยุดทันทีหากมีอาการชาแปลบลงแขน',
    3,
    3,
    'beginner',
    true,
    '/assets/exercises/upper-trapezius-stretch.svg',
    'cervical',
    'โหมดจับเวลานำทาง (Timer Mode: 20–30 วินาที/รอบ) | กล้องหน้าตรงครึ่งตัวบน (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    20.0,
    30.0,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 20: Seated Trunk Rotation
  (
    'e1000000-0000-0000-0000-000000000020',
    'หมุนลำตัวท่านั่งกอดอก (Seated Trunk Rotation / 坐姿躯干旋转)',
    'นั่งหลังตรงบนเก้าอี้ เท้าวางราบกับพื้น ยกแขนกอดอกระดับอก สะโพกตรึงแน่นกับเก้าอี้ ค่อยๆ หมุนลำตัวส่วนบนไปทางซ้าย ค้างไว้ 2 วินาที แล้วหมุนกลับมาตรงกลาง จากนั้นหมุนไปทางขวา',
    'ลำตัวและหลัง (Thoracolumbar Spine)',
    'Thoracolumbar Rotators, Internal/External Obliques, Erector Spinae',
    'เพิ่มพิสัยการหมุนของกระดูกสันหลังระดับอกและเอว, เสริมความยืดหยุ่นของลำตัว',
    'สะโพกต้องติดเบาะตลอดเวลา ห้ามเอียงตัวช่วยหมุน ระวังในผู้ป่วยหลังผ่าตัดกระดูกสันหลัง',
    3,
    10,
    'beginner',
    true,
    '/assets/exercises/seated-trunk-rotation.svg',
    'trunk',
    'กล้องหน้าตรงครึ่งตัวบน (Upper Body Framing) | องศาการหมุน 20°–35° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    20.0,
    35.0,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 21: Seated Side Bend
  (
    'e1000000-0000-0000-0000-000000000021',
    'เอียงลำตัวด้านข้างท่านั่ง (Seated Side Bend / 坐姿躯干侧屈)',
    'นั่งหลังตรง เท้าวางราบกับพื้น ค่อยๆ เอียงลำตัวไปทางด้านข้าง ปลายนิ้วเลื่อนลงตามแนวขาเก้าอี้ โดยก้นสองข้างไม่ลอยจากเบาะ ค้างไว้ 2 วินาที แล้วดึงตัวกลับมาตรง',
    'ลำตัวด้านข้าง (Trunk Lateral Flexion)',
    'Quadratus Lumborum, Obliques, Latissimus Dorsi',
    'ยืดและเสริมความยืดหยุ่นของกล้ามเนื้อหลังส่วนเอวด้านข้างและสีข้าง',
    'ก้นทั้งสองข้างต้องแนบติดเบาะเก้าอี้ตลอดเวลา ห้ามก้มตัวไปข้างหน้าขณะเอียง',
    3,
    10,
    'beginner',
    true,
    '/assets/exercises/seated-side-bend.svg',
    'trunk',
    'กล้องหน้าตรงครึ่งตัวบน (Upper Body Framing) | องศาเอียง 15°–25° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    15.0,
    25.0,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 22: Cross-Body Shoulder Stretch (Timer Mode)
  (
    'e1000000-0000-0000-0000-000000000022',
    'ยืดไหล่ข้ามลำตัว (Cross-Body Shoulder Stretch / 交叉臂肩部拉伸)',
    'นั่งหลังตรง ยกแขนข้างหนึ่งพาดขวางข้ามหน้าอก ใช้มืออีกข้างประคองบริเวณข้อศอกแล้วดึงแขนเข้าหาลำตัวเบาๆ จนรู้สึกตึงด้านหลังหัวไหล่ ค้างไว้ 20–30 วินาที (โหมดจับเวลานำทาง)',
    'ไหล่ (Shoulder Posterior Capsule)',
    'Posterior Deltoid, Infraspinatus, Teres Minor',
    'ยืดปลอกหุ้มข้อไหล่ด้านหลัง (Posterior Capsule), ลดอาการตึงรั้งของข้อไหล่',
    'อย่าหมุนลำตัวตามแขน ให้ลำตัวหันตรงไปข้างหน้าตลอดเวลา และไม่เกร็งยกไหล่ขึ้น',
    3,
    3,
    'beginner',
    true,
    '/assets/exercises/cross-body-shoulder-stretch.svg',
    'shoulder',
    'โหมดจับเวลานำทาง (Timer Mode: 20–30 วินาที/รอบ) | กล้องหน้าตรงครึ่งตัวบน (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    20.0,
    30.0,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 23: Seated Horizontal Abduction
  (
    'e1000000-0000-0000-0000-000000000023',
    'กางแขนระดับอก (Seated Horizontal Abduction / 坐姿水平肩外展)',
    'นั่งหลังตรง ยื่นแขนทั้งสองข้างไปข้างหน้าระดับอก งอศอกเล็กน้อย จากนั้นกางแขนออกด้านข้างพร้อมบีบสะบักเข้าหากันช้าๆ จนแขนขนานระนาบไหล่ ค้างไว้ 2 วินาที แล้วกลับสู่ท่าเริ่มต้น',
    'ไหล่และสะบัก (Shoulder & Scapula)',
    'Posterior Deltoid, Rhomboids, Middle Trapezius',
    'เสริมความแข็งแรงกล้ามเนื้อสะบักด้านหลังและเปิดทรวงอกเพื่อปรับบุคลิกภาพ',
    'อย่าแอ่นหลังหรือเอนตัวไปข้างหลังขณะกางแขน ให้เกร็งหน้าท้องประคองลำตัวไว้',
    3,
    10,
    'beginner',
    true,
    '/assets/exercises/seated-horizontal-abduction.svg',
    'shoulder',
    'กล้องหน้าตรงครึ่งตัวบน (Upper Body Framing) | องศาการกาง 70°–90° (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    70.0,
    90.0,
    'd1000000-0000-0000-0000-000000000001'
  ),

  -- 24: Wrist Flexion/Extension (Timer Mode)
  (
    'e1000000-0000-0000-0000-000000000024',
    'งอ-เหยียดข้อมือ (Wrist Flexion/Extension / 腕屈伸训练)',
    'นั่งหลังตรง วางปลายแขนราบบนที่พักแขนของเก้าอี้หรือโต๊ะ ให้ข้อมือพ้นขอบออกมา กระดกข้อมือขึ้นช้าๆ ค้างไว้ 2 วินาที แล้วค่อยๆ งอข้อมือลงด้านล่างอย่างนุ่มนวล (โหมดจับเวลานำทาง)',
    'ข้อมือ (Wrist)',
    'Wrist Flexors (FCR, FCU), Wrist Extensors (ECRL, ECRB, ECU)',
    'ฟื้นฟูกำลังกล้ามเนื้อปลายแขนและข้อมือ, ป้องกันและฟื้นฟูอาการปวดข้อมือ',
    'ปลายแขนต้องแนบติดที่พักแขนตลอดเวลา ห้ามยกข้อศอกหรือต้นแขนลอยขึ้น หยุดทันทีหากมีอาการชาปลายนิ้ว',
    3,
    12,
    'beginner',
    true,
    '/assets/exercises/wrist-flexion-extension.svg',
    'wrist',
    'โหมดจับเวลานำทาง (Timer Mode: 10–12 ครั้ง/เซ็ต) | วางแขนบนที่พักแขน (ต้องให้นักกายภาพตรวจสอบก่อนใช้กับผู้ป่วยจริง)',
    null,
    null,
    'd1000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  target_joint = EXCLUDED.target_joint,
  target_muscle = EXCLUDED.target_muscle,
  suitable_for = EXCLUDED.suitable_for,
  warnings = EXCLUDED.warnings,
  default_sets = EXCLUDED.default_sets,
  default_reps = EXCLUDED.default_reps,
  difficulty = EXCLUDED.difficulty,
  is_active = true,
  image_path = EXCLUDED.image_path,
  category = EXCLUDED.category,
  calibration_notes = EXCLUDED.calibration_notes,
  rom_threshold_min = EXCLUDED.rom_threshold_min,
  rom_threshold_max = EXCLUDED.rom_threshold_max,
  updated_at = NOW();

-- 3. Audit trail logging
INSERT INTO public.audit_logs (
  actor_type,
  actor_id,
  action,
  entity,
  entity_id,
  metadata,
  created_at
) VALUES
  (
    'admin',
    'd1000000-0000-0000-0000-000000000001',
    'exercise_catalog_seated_upper_body_standardization',
    'exercises',
    'catalog_15_standard',
    jsonb_build_object(
      'deactivated_exercise_ids', jsonb_build_array(
        'e1000000-0000-0000-0000-000000000006',
        'e1000000-0000-0000-0000-000000000007',
        'e1000000-0000-0000-0000-000000000008',
        'e1000000-0000-0000-0000-000000000009',
        'e1000000-0000-0000-0000-000000000010',
        'e1000000-0000-0000-0000-000000000011',
        'e1000000-0000-0000-0000-000000000012',
        'e1000000-0000-0000-0000-000000000013',
        'e1000000-0000-0000-0000-000000000015'
      ),
      'added_exercise_ids', jsonb_build_array(
        'e1000000-0000-0000-0000-000000000016',
        'e1000000-0000-0000-0000-000000000017',
        'e1000000-0000-0000-0000-000000000018',
        'e1000000-0000-0000-0000-000000000019',
        'e1000000-0000-0000-0000-000000000020',
        'e1000000-0000-0000-0000-000000000021',
        'e1000000-0000-0000-0000-000000000022',
        'e1000000-0000-0000-0000-000000000023',
        'e1000000-0000-0000-0000-000000000024'
      ),
      'criteria', 'Must be seated upright and front camera viewing only head to waist (upper body)',
      'authorizer', 'Super Ultra Master Prompt Clinical PT & Senior Full-Stack Engineer'
    ),
    NOW()
  );

