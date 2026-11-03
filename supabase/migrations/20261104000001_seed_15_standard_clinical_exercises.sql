-- =========================================================================
-- Migration: 20261104000001_seed_15_standard_clinical_exercises.sql
-- Description: Standardize 15 Clinical Physical Therapy Exercises
-- (Single Source of Truth across Supabase Cloud, Pose Engine, Admin, PT & Kiosk)
-- =========================================================================

DO $$
DECLARE
  v_admin_id UUID := 'd1000000-0000-0000-0000-000000000001';
BEGIN
  -- 1. Active Shoulder Flexion
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000001',
    'ยกแขนไปข้างหน้า (Active Shoulder Flexion)',
    'ยืนหรือนั่งหลังตรง ยกแขนตรงไปข้างหน้าจนถึงระดับเหนือศีรษะ แล้วค่อยๆ ลดระดับลงอย่างควบคุม',
    'shoulder',
    'Anterior Deltoid, Supraspinatus, Coracobrachialis',
    'ผู้ป่วยข้อไหล่ติดระยะฟื้นฟูพิสัย, กลุ่มอาการกระทบกระแทกของไหล่ (Impingement)',
    'รักษาลำตัวให้ตรง อย่าเอนตัวไปข้างหลังหรือเกร็งยกหัวไหล่ขึ้น หากมีอาการเจ็บเสียวให้หยุดทันที',
    3, 10, 'easy', '/assets/exercises/active-shoulder-flexion.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 2. Shoulder Abduction
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000002',
    'กางแขนออกด้านข้าง (Shoulder Abduction)',
    'ยืนหรือนั่งหน้าตรง ค่อยๆ กางแขนออกด้านข้างลำตัวจนขนานกับพื้นหรือถึงระดับที่สบาย แล้วลดลงช้าๆ',
    'shoulder',
    'Middle Deltoid, Supraspinatus, Trapezius',
    'ผู้ป่วยข้อไหล่ติด, เพิ่มความแข็งแรงกล้ามเนื้อรอบข้อไหล่',
    'รักษาลำตัวให้ตรง อย่าเอียงตัวช่วยกางแขนและอย่าเกร็งยกหัวไหล่ขึ้น',
    3, 10, 'easy', '/assets/exercises/shoulder-abduction.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 3. Shoulder External Rotation with Band
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000003',
    'หมุนแขนออกด้านนอกด้วยยางยืด (Shoulder External Rotation with Band)',
    'หนีบข้อศอกข้างลำตัว ตั้งฉาก 90° ดึงยางยืดหมุนมือออกด้านข้าง ค้างไว้ 2 วินาที แล้วผ่อนกลับช้าๆ',
    'shoulder',
    'Infraspinatus, Teres Minor, Posterior Deltoid',
    'ฟื้นฟูกล้ามเนื้อพยุงข้อไหล่ (Rotator Cuff), ภาวะข้อไหล่ไม่มั่นคง',
    'อย่ากางข้อศอกออกจากลำตัว ให้หนีบศอกแนบข้างลำตัวไว้ตลอดเวลา',
    3, 10, 'medium', '/assets/exercises/shoulder-er-band.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 4. Scapular Retraction
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000004',
    'ดึงสะบักชิดกัน (Scapular Retraction / Pinch)',
    'นั่งหรือยืนตัวตรง ดึงหัวไหล่และสะบักทั้งสองข้างไปด้านหลังให้ชิดกัน ค้างไว้ 5 วินาที แล้วคลายออกช้าๆ',
    'scapula',
    'Middle & Lower Trapezius, Rhomboids',
    'ผู้ป่วยออฟฟิศซินโดรม, ปรับสรีระไหล่ห่อคอยื่น (Forward Shoulder)',
    'อย่าเกร็งยกหัวไหล่ขึ้น ให้ดึงสะบักลงและเข้าหากันทางด้านหลัง',
    3, 10, 'easy', '/assets/exercises/scapular-retraction.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 5. Elbow Flexion & Extension
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000005',
    'งอและเหยียดข้อศอก (Elbow Flexion & Extension)',
    'งอข้อศอกนำมือเข้าหาหัวไหล่ แล้วเหยียดแขนออกจนตรงอย่างช้าๆ ควบคุมกล้ามเนื้อตลอดการเคลื่อนไหว',
    'elbow',
    'Biceps Brachii, Brachialis, Triceps Brachii',
    'ผู้ป่วยหลังผ่าตัดหรือถอดเฝือกข้อศอก, เพิ่มพิสัยการเคลื่อนไหวแขน',
    'รักษาลำตัวให้นิ่ง อย่าแกว่งตัวช่วยงอศอก',
    3, 10, 'easy', '/assets/exercises/elbow-flexion-extension.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 6. Seated Knee Extension
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000006',
    'เตะเหยียดเข่าท่านั่ง (Seated Knee Extension)',
    'นั่งเก้าอี้หลังตรง ค่อยๆ เตะเหยียดเข่าขึ้นมาข้างหน้าจนขาตรง ค้างไว้ 2 วินาที แล้ววางลงช้าๆ',
    'knee',
    'Quadriceps Femoris (Rectus Femoris, Vastus Medialis)',
    'ผู้ป่วยข้อเข่าเสื่อม (Knee OA), ฟื้นฟูกล้ามเนื้อต้นขาหน้า',
    'นั่งหลังตรง อย่าเอนหลังพิงเพื่อช่วยเตะขา หากปวดเสียวสะบ้าให้หยุดทันที',
    3, 10, 'easy', '/assets/exercises/seated-knee-extension.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 7. Mini Squat
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000007',
    'ย่อเข่ามินิสควอท (Mini Squat 0–60°)',
    'ยืนแยกเท้ากว้างเท่าหัวไหล่ ค่อยๆ ย่อเข่าลงประมาณ 30°–60° (ไม่ให้เข่าเลยปลายเท้า) ค้างไว้ 2 วินาที แล้วยืนขึ้น',
    'knee',
    'Quadriceps, Gluteus Maximus, Hamstrings',
    'เพิ่มความแข็งแรงกล้ามเนื้อขาในท่าปิด (Closed Chain), ฟื้นฟูการรับน้ำหนัก',
    'อย่าย่อเข่าลึกเกินไป ไม่ให้หัวเข่าบิดเข้าด้านในหรือเลยปลายเท้า',
    3, 10, 'medium', '/assets/exercises/mini-squat.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 8. Sit-to-Stand
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000008',
    'ลุกขึ้นยืนจากเก้าอี้ (Sit-to-Stand)',
    'นั่งบนเก้าอี้ เท้าทั้งสองข้างวางราบกับพื้น ลุกขึ้นยืนจนตัวตรงเต็มที่ ค้างไว้ 1 วินาที แล้วค่อยๆ นั่งลงช้าๆ',
    'knee',
    'Quadriceps, Gluteal Complex, Core Stabilizers',
    'ฝึกความสามารถในการลุกยืนในชีวิตประจำวัน, ป้องกันการหกล้มในผู้สูงอายุ',
    'กรุณาลุกขึ้นยืนจากเก้าอี้จริง หากรู้สึกเสียหลักหรือวิงเวียนศีรษะให้นั่งลงทันที',
    3, 10, 'medium', '/assets/exercises/sit-to-stand.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 9. Straight Leg Raise
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000009',
    'ยกขาตรงท่านอน/นั่ง (Straight Leg Raise - SLR)',
    'เหยียดเข่าตรง ล็อคข้อเข่าให้ตรงตลอดเวลา ค่อยๆ ยกขาขึ้นทำมุมประมาณ 30°–45° ค้างไว้ 2 วินาที แล้ววางลง',
    'hip',
    'Iliopsoas, Rectus Femoris, Tensor Fasciae Latae',
    'เพิ่มกำลังกล้ามเนื้อสะโพกและเข่าโดยไม่มีแรงกดกระแทกข้อ',
    'ล็อคข้อเข่าให้เหยียดตรงตลอดการยกขา หากมีอาการปวดแปลบลงขาให้หยุดทันที',
    3, 10, 'easy', '/assets/exercises/straight-leg-raise.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 10. Standing Hip Abduction
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000010',
    'กางสะโพกออกด้านข้างท่ายืน (Standing Hip Abduction)',
    'ยืนเกาะพนักพิง ลำตัวตรง ค่อยๆ กางขาออกด้านข้าง 25°–40° โดยไม่งอเข่าและไม่เอียงลำตัว ค้างไว้ 1 วินาที แล้วหุบขากลับ',
    'hip',
    'Gluteus Medius, Gluteus Minimus, Tensor Fasciae Latae',
    'เพิ่มความมั่นคงของเชิงกรานและข้อสะโพก, ป้องกันท่าเดินกระโผลกกระเผลก (Trendelenburg gait)',
    'รักษาลำตัวให้ตรง อย่ายักสะโพกหรือเอียงตัวช่วยยกขา',
    3, 10, 'easy', '/assets/exercises/standing-hip-abduction.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 11. Standing Calf Raise
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000011',
    'เขย่งปลายเท้าท่ายืน (Standing Calf Raise / Heel Raise)',
    'ยืนตรงเกาะโต๊ะหรือผนัง ค่อยๆ เขย่งส้นเท้าทั้งสองข้างขึ้นให้สูงที่สุด ค้างไว้ 1 วินาที แล้ววางส้นเท้าลงช้าๆ',
    'ankle',
    'Gastrocnemius, Soleus, Plantaris',
    'ฟื้นฟูกล้ามเนื้อน่องและเอ็นร้อยหวาย, เพิ่มความมั่นคงของข้อเท้า',
    'ทรงตัวให้นิ่ง เกาะพนักพิงเบาๆ หากมีอาการเจ็บเอ็นร้อยหวายหรือตะคริวให้หยุดทันที',
    3, 15, 'easy', '/assets/exercises/calf-raise.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 12. Single-Leg Stance Balance
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000012',
    'ยืนทรงตัวขาเดียว (Single-Leg Stance Balance)',
    'ยืนตัวตรงใกล้ที่เกาะ ค่อยๆ ยกขาข้างหนึ่งลอยขึ้นจากพื้น ทรงตัวบนขาข้างเดียว ค้างไว้ 15–30 วินาที',
    'balance',
    'Proprioceptors, Peroneals, Gluteus Medius, Core',
    'ฝึกการทรงตัวและการรับรู้ตำแหน่งข้อต่อ, ลดความเสี่ยงล้มในผู้สูงอายุ',
    'ฝึกใกล้ที่จับเพื่อความปลอดภัย หากเริ่มเสียหลักให้วางเท้าลงทันที',
    3, 3, 'medium', '/assets/exercises/single-leg-balance.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 13. Standing Calf Stretch
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000013',
    'ยืดกล้ามเนื้อน่องท่ายืนดันผนัง (Standing Gastrocnemius Calf Stretch)',
    'ก้าวขาข้างหนึ่งไปด้านหลัง ส้นเท้าวางติดพื้น ขาหลังเหยียดตรง โน้มตัวไปข้างหน้าจนรู้สึกตึงน่อง ค้างไว้ 20–30 วินาที',
    'ankle',
    'Gastrocnemius, Achilles Tendon',
    'ลดอาการน่องตึง, บรรเทาอาการรองช้ำ (Plantar Fasciitis)',
    'วางส้นเท้าหลังติดพื้นตลอดเวลา ยืดแค่รู้สึกตึงสบาย ห้ามกระตุกหรือออกแรงจนปวดเสียว',
    3, 3, 'easy', '/assets/exercises/calf-stretch.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 14. Cervical Retraction / Chin Tuck (Timer Mode)
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000014',
    'เก็บเหนียงเสริมกล้ามเนื้อคอด้านลึก (Cervical Retraction / Chin Tuck)',
    'ตามองตรง ดึงคางและศีรษะเข้าหาลำคอในแนวราบ ค้างไว้ 5 วินาที แล้วคลายช้าๆ (โหมดจับเวลาพร้อมตัวช่วยบอกจังหวะ)',
    'neck',
    'Longus Colli, Longus Capitis, Deep Cervical Flexors',
    'ผู้ป่วยกระดูกคอเสื่อม, บรรเทาอาการปวดคอบ่าไหล่ออฟฟิศซินโดรม',
    'ห้ามก้มหน้าลง ให้ดึงคางไปด้านหลังตรงๆ หากมีอาการเวียนศีรษะให้หยุดทันที',
    3, 10, 'easy', '/assets/exercises/chin-tuck.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;

  -- 15. Codman Shoulder Pendulum (Timer Mode)
  INSERT INTO public.exercises (
    id, title, description, target_joint, target_muscle, suitable_for, warnings,
    default_sets, default_reps, difficulty, image_path, created_by
  ) VALUES (
    'e1000000-0000-0000-0000-000000000015',
    'แกว่งแขนผ่อนคลายหัวไหล่ (Codman Pendulum Exercise)',
    'โน้มตัวไปข้างหน้า ปล่อยแขนห้อยตรงตามแรงโน้มถ่วง แกว่งแขนเป็นวงกลมผ่อนคลายหัวไหล่ 45 วินาที (โหมดจับเวลา)',
    'shoulder',
    'Passive mobilization of Glenohumeral Capsule',
    'ผู้ป่วยข้อไหล่ติดระยะเฉียบพลัน, บรรเทาอาการปวดและเพิ่มการไหลเวียนน้ำไขข้อ',
    'ปล่อยแขนห้อยสบายๆ ตามแรงโน้มถ่วง ห้ามเกร็งออกแรงจากหัวไหล่',
    3, 1, 'easy', '/assets/exercises/shoulder-pendulum.svg', v_admin_id
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_joint = EXCLUDED.target_joint,
    target_muscle = EXCLUDED.target_muscle,
    suitable_for = EXCLUDED.suitable_for,
    warnings = EXCLUDED.warnings,
    image_path = EXCLUDED.image_path;
END $$;

