/**
 * scripts/seed-15-clinical-exercises.js
 *
 * Seeds the 15 Standard Clinical Exercises into Supabase Cloud (public.exercises)
 * and generates the SQL migration file.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mctegvnrvmglbibuuczi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
const CREATED_BY = 'd1000000-0000-0000-0000-000000000001';

const EXERCISES_DATA = [
  {
    id: 'e1000000-0000-0000-0000-000000000001',
    exercise_key: 'active-shoulder-flexion',
    title: 'ยกแขนไปข้างหน้า (Active Shoulder Flexion)',
    description: 'ยืนหรือนั่งหลังตรง ยกแขนตรงไปข้างหน้าจนถึงระดับเหนือศีรษะ แล้วค่อยๆ ลดระดับลงอย่างควบคุม',
    target_joint: 'shoulder',
    target_muscle: 'Anterior Deltoid, Supraspinatus, Coracobrachialis',
    suitable_for: 'ผู้ป่วยข้อไหล่ติดระยะฟื้นฟูพิสัย, กลุ่มอาการกระทบกระแทกของไหล่ (Impingement)',
    warnings: 'รักษาลำตัวให้ตรง อย่าเอนตัวไปข้างหลังหรือเกร็งยกหัวไหล่ขึ้น หากมีอาการเจ็บเสียวให้หยุดทันที',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/active-shoulder-flexion.svg',
    clinical_source: 'AAOS Clinical Standards / JOSPT Shoulder Impingement CPG',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000002',
    exercise_key: 'shoulder-abduction',
    title: 'กางแขนออกด้านข้าง (Shoulder Abduction)',
    description: 'ยืนหรือนั่งหน้าตรง ค่อยๆ กางแขนออกด้านข้างลำตัวจนขนานกับพื้นหรือถึงระดับที่สบาย แล้วลดลงช้าๆ',
    target_joint: 'shoulder',
    target_muscle: 'Middle Deltoid, Supraspinatus, Trapezius',
    suitable_for: 'ผู้ป่วยข้อไหล่ติด, เพิ่มความแข็งแรงกล้ามเนื้อรอบข้อไหล่',
    warnings: 'รักษาลำตัวให้ตรง อย่าเอียงตัวช่วยกางแขนและอย่าเกร็งยกหัวไหล่ขึ้น',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/shoulder-abduction.svg',
    clinical_source: 'AAOS Clinical Standards / Kendall Muscle Testing',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000003',
    exercise_key: 'shoulder-er-band',
    title: 'หมุนแขนออกด้านนอกด้วยยางยืด (Shoulder External Rotation with Band)',
    description: 'หนีบข้อศอกข้างลำตัว ตั้งฉาก 90° ดึงยางยืดหมุนมือออกด้านข้าง ค้างไว้ 2 วินาที แล้วผ่อนกลับช้าๆ',
    target_joint: 'shoulder',
    target_muscle: 'Infraspinatus, Teres Minor, Posterior Deltoid',
    suitable_for: 'ฟื้นฟูกล้ามเนื้อพยุงข้อไหล่ (Rotator Cuff), ภาวะข้อไหล่ไม่มั่นคง',
    warnings: 'อย่ากางข้อศอกออกจากลำตัว ให้หนีบศอกแนบข้างลำตัวไว้ตลอดเวลา',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'medium',
    image_path: '/assets/exercises/shoulder-er-band.svg',
    clinical_source: 'JOSPT Rotator Cuff CPG / Brotzman Clinical Orthopaedic Rehab',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000004',
    exercise_key: 'scapular-retraction',
    title: 'ดึงสะบักชิดกัน (Scapular Retraction / Pinch)',
    description: 'นั่งหรือยืนตัวตรง ดึงหัวไหล่และสะบักทั้งสองข้างไปด้านหลังให้ชิดกัน ค้างไว้ 5 วินาที แล้วคลายออกช้าๆ',
    target_joint: 'scapula',
    target_muscle: 'Middle & Lower Trapezius, Rhomboids',
    suitable_for: 'ผู้ป่วยออฟฟิศซินโดรม, ปรับสรีระไหล่ห่อคอยื่น (Forward Shoulder)',
    warnings: 'อย่าเกร็งยกหัวไหล่ขึ้น ให้ดึงสะบักลงและเข้าหากันทางด้านหลัง',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/scapular-retraction.svg',
    clinical_source: 'APTA Orthopaedic Section / Kendall Postural Assessment',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000005',
    exercise_key: 'elbow-flexion-extension',
    title: 'งอและเหยียดข้อศอก (Elbow Flexion & Extension)',
    description: 'งอข้อศอกนำมือเข้าหาหัวไหล่ แล้วเหยียดแขนออกจนตรงอย่างช้าๆ ควบคุมกล้ามเนื้อตลอดการเคลื่อนไหว',
    target_joint: 'elbow',
    target_muscle: 'Biceps Brachii, Brachialis, Triceps Brachii',
    suitable_for: 'ผู้ป่วยหลังผ่าตัดหรือถอดเฝือกข้อศอก, เพิ่มพิสัยการเคลื่อนไหวแขน',
    warnings: 'รักษาลำตัวให้นิ่ง อย่าแกว่งตัวช่วยงอศอก',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/elbow-flexion-extension.svg',
    clinical_source: 'AAOS Clinical Measurement / Kapandji Biomechanics',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000006',
    exercise_key: 'seated-knee-extension',
    title: 'เตะเหยียดเข่าท่านั่ง (Seated Knee Extension)',
    description: 'นั่งเก้าอี้หลังตรง ค่อยๆ เตะเหยียดเข่าขึ้นมาข้างหน้าจนขาตรง ค้างไว้ 2 วินาที แล้ววางลงช้าๆ',
    target_joint: 'knee',
    target_muscle: 'Quadriceps Femoris (Rectus Femoris, Vastus Medialis)',
    suitable_for: 'ผู้ป่วยข้อเข่าเสื่อม (Knee OA), ฟื้นฟูกล้ามเนื้อต้นขาหน้า',
    warnings: 'นั่งหลังตรง อย่าเอนหลังพิงเพื่อช่วยเตะขา หากปวดเสียวสะบ้าให้หยุดทันที',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/seated-knee-extension.svg',
    clinical_source: 'AAOS Knee Osteoarthritis CPG / ACSM Exercise Guidelines',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000007',
    exercise_key: 'mini-squat',
    title: 'ย่อเข่ามินิสควอท (Mini Squat 0–60°)',
    description: 'ยืนแยกเท้ากว้างเท่าหัวไหล่ ค่อยๆ ย่อเข่าลงประมาณ 30°–60° (ไม่ให้เข่าเลยปลายเท้า) ค้างไว้ 2 วินาที แล้วยืนขึ้น',
    target_joint: 'knee',
    target_muscle: 'Quadriceps, Gluteus Maximus, Hamstrings',
    suitable_for: 'เพิ่มความแข็งแรงกล้ามเนื้อขาในท่าปิด (Closed Chain), ฟื้นฟูการรับน้ำหนัก',
    warnings: 'อย่าย่อเข่าลึกเกินไป ไม่ให้หัวเข่าบิดเข้าด้านในหรือเลยปลายเท้า',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'medium',
    image_path: '/assets/exercises/mini-squat.svg',
    clinical_source: 'JOSPT Patellofemoral Pain CPG / ACSM Closed Kinetic Chain',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000008',
    exercise_key: 'sit-to-stand',
    title: 'ลุกขึ้นยืนจากเก้าอี้ (Sit-to-Stand)',
    description: 'นั่งบนเก้าอี้ เท้าทั้งสองข้างวางราบกับพื้น ลุกขึ้นยืนจนตัวตรงเต็มที่ ค้างไว้ 1 วินาที แล้วค่อยๆ นั่งลงช้าๆ',
    target_joint: 'knee',
    target_muscle: 'Quadriceps, Gluteal Complex, Core Stabilizers',
    suitable_for: 'ฝึกความสามารถในการลุกยืนในชีวิตประจำวัน, ป้องกันการหกล้มในผู้สูงอายุ',
    warnings: 'กรุณาลุกขึ้นยืนจากเก้าอี้จริง หากรู้สึกเสียหลักหรือวิงเวียนศีรษะให้นั่งลงทันที',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'medium',
    image_path: '/assets/exercises/sit-to-stand.svg',
    clinical_source: 'CDC STEADI Fall Prevention / ACSM Functional Mobility',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000009',
    exercise_key: 'straight-leg-raise',
    title: 'ยกขาตรงท่านอน/นั่ง (Straight Leg Raise - SLR)',
    description: 'เหยียดเข่าตรง ล็อคข้อเข่าให้ตรงตลอดเวลา ค่อยๆ ยกขาขึ้นทำมุมประมาณ 30°–45° ค้างไว้ 2 วินาที แล้ววางลง',
    target_joint: 'hip',
    target_muscle: 'Iliopsoas, Rectus Femoris, Tensor Fasciae Latae',
    suitable_for: 'เพิ่มกำลังกล้ามเนื้อสะโพกและเข่าโดยไม่มีแรงกดกระแทกข้อ',
    warnings: 'ล็อคข้อเข่าให้เหยียดตรงตลอดการยกขา หากมีอาการปวดแปลบลงขาให้หยุดทันที',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/straight-leg-raise.svg',
    clinical_source: 'JOSPT Low Back Pain & Knee Rehab CPG / Brotzman',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000010',
    exercise_key: 'standing-hip-abduction',
    title: 'กางสะโพกออกด้านข้างท่ายืน (Standing Hip Abduction)',
    description: 'ยืนเกาะพนักพิง ลำตัวตรง ค่อยๆ กางขาออกด้านข้าง 25°–40° โดยไม่งอเข่าและไม่เอียงลำตัว ค้างไว้ 1 วินาที แล้วหุบขากลับ',
    target_joint: 'hip',
    target_muscle: 'Gluteus Medius, Gluteus Minimus, Tensor Fasciae Latae',
    suitable_for: 'เพิ่มความมั่นคงของเชิงกรานและข้อสะโพก, ป้องกันท่าเดินกระโผลกกระเผลก (Trendelenburg gait)',
    warnings: 'รักษาลำตัวให้ตรง อย่ายักสะโพกหรือเอียงตัวช่วยยกขา',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/standing-hip-abduction.svg',
    clinical_source: 'JOSPT Hip Osteoarthritis CPG / Kendall Muscle Testing',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000011',
    exercise_key: 'calf-raise',
    title: 'เขย่งปลายเท้าท่ายืน (Standing Calf Raise / Heel Raise)',
    description: 'ยืนตรงเกาะโต๊ะหรือผนัง ค่อยๆ เขย่งส้นเท้าทั้งสองข้างขึ้นให้สูงที่สุด ค้างไว้ 1 วินาที แล้ววางส้นเท้าลงช้าๆ',
    target_joint: 'ankle',
    target_muscle: 'Gastrocnemius, Soleus, Plantaris',
    suitable_for: 'ฟื้นฟูกล้ามเนื้อน่องและเอ็นร้อยหวาย, เพิ่มความมั่นคงของข้อเท้า',
    warnings: 'ทรงตัวให้นิ่ง เกาะพนักพิงเบาๆ หากมีอาการเจ็บเอ็นร้อยหวายหรือตะคริวให้หยุดทันที',
    default_sets: 3,
    default_reps: 15,
    difficulty: 'easy',
    image_path: '/assets/exercises/calf-raise.svg',
    clinical_source: 'AAOS Achilles Tendinopathy Guidelines / ACSM',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000012',
    exercise_key: 'single-leg-balance',
    title: 'ยืนทรงตัวขาเดียว (Single-Leg Stance Balance)',
    description: 'ยืนตัวตรงใกล้ที่เกาะ ค่อยๆ ยกขาข้างหนึ่งลอยขึ้นจากพื้น ทรงตัวบนขาข้างเดียว ค้างไว้ 15–30 วินาที',
    target_joint: 'balance',
    target_muscle: 'Proprioceptors, Peroneals, Gluteus Medius, Core',
    suitable_for: 'ฝึกการทรงตัวและการรับรู้ตำแหน่งข้อต่อ, ลดความเสี่ยงล้มในผู้สูงอายุ',
    warnings: 'ฝึกใกล้ที่จับเพื่อความปลอดภัย หากเริ่มเสียหลักให้วางเท้าลงทันที',
    default_sets: 3,
    default_reps: 3,
    difficulty: 'medium',
    image_path: '/assets/exercises/single-leg-balance.svg',
    clinical_source: 'Berg Balance Scale / ACSM Fall Prevention Guidelines',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000013',
    exercise_key: 'calf-stretch',
    title: 'ยืดกล้ามเนื้อน่องท่ายืนดันผนัง (Standing Gastrocnemius Calf Stretch)',
    description: 'ก้าวขาข้างหนึ่งไปด้านหลัง ส้นเท้าวางติดพื้น ขาหลังเหยียดตรง โน้มตัวไปข้างหน้าจนรู้สึกตึงน่อง ค้างไว้ 20–30 วินาที',
    target_joint: 'ankle',
    target_muscle: 'Gastrocnemius, Achilles Tendon',
    suitable_for: 'ลดอาการน่องตึง, บรรเทาอาการรองช้ำ (Plantar Fasciitis)',
    warnings: 'วางส้นเท้าหลังติดพื้นตลอดเวลา ยืดแค่รู้สึกตึงสบาย ห้ามกระตุกหรือออกแรงจนปวดเสียว',
    default_sets: 3,
    default_reps: 3,
    difficulty: 'easy',
    image_path: '/assets/exercises/calf-stretch.svg',
    clinical_source: 'ACSM Flexibility Guidelines / JOSPT Plantar Fasciitis CPG',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000014',
    exercise_key: 'chin-tuck',
    title: 'เก็บเหนียงเสริมกล้ามเนื้อคอด้านลึก (Cervical Retraction / Chin Tuck)',
    description: 'ตามองตรง ดึงคางและศีรษะเข้าหาลำคอในแนวราบ ค้างไว้ 5 วินาที แล้วคลายช้าๆ (โหมดจับเวลาพร้อมตัวช่วยบอกจังหวะ)',
    target_joint: 'neck',
    target_muscle: 'Longus Colli, Longus Capitis, Deep Cervical Flexors',
    suitable_for: 'ผู้ป่วยกระดูกคอเสื่อม, บรรเทาอาการปวดคอบ่าไหล่ออฟฟิศซินโดรม',
    warnings: 'ห้ามก้มหน้าลง ให้ดึงคางไปด้านหลังตรงๆ หากมีอาการเวียนศีรษะให้หยุดทันที',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'easy',
    image_path: '/assets/exercises/chin-tuck.svg',
    clinical_source: 'JOSPT Neck Pain CPG / McKenzie Cervical Method',
  },
  {
    id: 'e1000000-0000-0000-0000-000000000015',
    exercise_key: 'shoulder-pendulum',
    title: 'แกว่งแขนผ่อนคลายหัวไหล่ (Codman Pendulum Exercise)',
    description: 'โน้มตัวไปข้างหน้า ปล่อยแขนห้อยตรงตามแรงโน้มถ่วง แกว่งแขนเป็นวงกลมผ่อนคลายหัวไหล่ 45 วินาที (โหมดจับเวลา)',
    target_joint: 'shoulder',
    target_muscle: 'Passive mobilization of Glenohumeral Capsule',
    suitable_for: 'ผู้ป่วยข้อไหล่ติดระยะเฉียบพลัน, บรรเทาอาการปวดและเพิ่มการไหลเวียนน้ำไขข้อ',
    warnings: 'ปล่อยแขนห้อยสบายๆ ตามแรงโน้มถ่วง ห้ามเกร็งออกแรงจากหัวไหล่',
    default_sets: 3,
    default_reps: 1,
    difficulty: 'easy',
    image_path: '/assets/exercises/shoulder-pendulum.svg',
    clinical_source: 'Codman Classical Exercise / AAOS Frozen Shoulder Rehab',
  },
];

async function seedExercises() {
  console.log(`Connecting to Supabase at ${SUPABASE_URL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Upserting ${EXERCISES_DATA.length} standard clinical exercises...`);
  for (const ex of EXERCISES_DATA) {
    const payload = {
      id: ex.id,
      title: ex.title,
      description: ex.description,
      target_joint: ex.target_joint,
      target_muscle: ex.target_muscle,
      suitable_for: ex.suitable_for,
      warnings: ex.warnings,
      default_sets: ex.default_sets,
      default_reps: ex.default_reps,
      difficulty: ex.difficulty,
      image_path: ex.image_path,
      created_by: CREATED_BY,
    };

    const { error } = await supabase.from('exercises').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error(`❌ Failed to upsert ${ex.title}:`, error.message);
    } else {
      console.log(`✓ Seeded [${ex.id.slice(-4)}] ${ex.title}`);
    }
  }

  // Clean up obsolete junk test rows if they are not in our canonical 15
  const canonicalIds = new Set(EXERCISES_DATA.map((e) => e.id));
  const { data: allDbExercises } = await supabase.from('exercises').select('id, title');
  if (allDbExercises) {
    for (const row of allDbExercises) {
      if (!canonicalIds.has(row.id)) {
        if (row.title === 'test_delete_me' || row.title === 'หกไฟห' || row.title === 'หกฟกหหฟ' || row.title === 'updated') {
          console.log(`Removing obsolete test row: [${row.id}] ${row.title}`);
          await supabase.from('exercises').delete().eq('id', row.id);
        }
      }
    }
  }

  // Verify total count
  const { data: finalExercises } = await supabase.from('exercises').select('id, title, target_joint').order('id');
  console.log(`\n🎉 Total exercises in Supabase Cloud: ${finalExercises?.length || 0}`);
  finalExercises?.forEach((e, idx) => {
    console.log(`  ${idx + 1}. [${e.id.slice(-4)}] ${e.title} (${e.target_joint})`);
  });
}

seedExercises().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});

