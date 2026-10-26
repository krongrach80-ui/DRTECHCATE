/**
 * scripts/seed-cloud-db.ts
 * Sovereign Clinical Database Seeding for Supabase Cloud (Project: mctegvnrvmglbibuuczi)
 * Provisions initial clinical staff (@director, @admin, @pt_somchai), initial patients,
 * standard clinical exercises, minigames, and modpacks into Supabase Cloud.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 1. Load environment variables (.env.local or .env)
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mctegvnrvmglbibuuczi.supabase.co';
const rawKey = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('========================================================================');
console.log('DrTech.Care - Supabase Cloud Database Seeder');
console.log(`Target: ${SUPABASE_URL}`);
console.log('========================================================================\n');

// 2. Validate API Key
if (!rawKey || rawKey.includes('local-dev') || rawKey.includes('bypass') || rawKey.includes('placeholder')) {
  console.error('⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY is missing or using placeholder value!');
  console.error('\nวิธีใส่ SUPABASE_SERVICE_ROLE_KEY:');
  console.error('1. เปิด Supabase Cloud Dashboard: https://supabase.com/dashboard/project/mctegvnrvmglbibuuczi');
  console.error('2. ไปที่ Project Settings (ไอคอนฟันเฟืองซ้ายล่าง) ➔ API');
  console.error('3. มองหาหัวข้อ Project API keys ➔ บรรทัด "service_role secret" ➔ กดปุ่ม "Reveal" แล้ว Copy');
  console.error('4. รันคำสั่งนี้พร้อมแนบ Service Role Key:');
  console.error('   npx tsx scripts/seed-cloud-db.ts <SUPABASE_SERVICE_ROLE_KEY>');
  console.error('\nหรือเปิดไฟล์ supabase/cloud_sync_fix.sql แล้วนำโค้ดไปกด Run ใน Supabase Cloud SQL Editor ได้ทันที (ไม่ต้องใช้ Service Role Key!)');
  console.log('========================================================================\n');
  process.exit(1);
}

if (rawKey.startsWith('sb_publishable_')) {
  console.error('⚠️  ตรวจพบคีย์ Publishable / Anon Key (sb_publishable_...):');
  console.error('คีย์ที่ขึ้นต้นด้วย "sb_publishable_" เป็นคีย์สำหรับ Frontend/Client-side เท่านั้น');
  console.error('ไม่สามารถใช้สิทธิ์ Admin หรือ bypass RLS ในการสร้าง auth.users หรือ seed ข้อมูลได้');
  console.error('\nกรุณาคัดลอก "service_role secret key" (ขึ้นต้นด้วย sb_secret_ หรือ ey...) จาก:');
  console.error('   Supabase Dashboard ➔ Project Settings ➔ API ➔ service_role secret');
  console.error('\nแล้วรันใหม่ด้วย:');
  console.error('   npx tsx scripts/seed-cloud-db.ts <SUPABASE_SERVICE_ROLE_KEY>');
  console.error('\nหรือนำไฟล์ supabase/cloud_sync_fix.sql ไป Run ใน SQL Editor บน Supabase Cloud ได้โดยตรง');
  console.log('========================================================================\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, rawKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function seedCloudDatabase() {
  console.log('📡 [1/6] ตรวจสอบการเชื่อมต่อกับ Supabase Cloud...');
  const { error: testErr } = await supabase.from('profiles').select('id').limit(1);
  if (testErr) {
    if (testErr.code === '42501' || testErr.message.includes('permission denied')) {
      console.warn('  ⚠️ ตรวจพบตารางยังไม่ได้ Grant สิทธิ์ กรุณารัน supabase/cloud_sync_fix.sql ใน SQL Editor ก่อน');
    } else {
      console.error('  ❌ การเชื่อมต่อล้มเหลว:', testErr.message);
    }
  } else {
    console.log('  ✓ เชื่อมต่อกับ Supabase Cloud สำเร็จเรียบร้อย\n');
  }

  // =========================================================================
  // 1. SEED STAFF ACCOUNTS (Director, Admin, PT Somchai)
  // =========================================================================
  console.log('👤 [2/6] สร้างบัญชีเจ้าหน้าที่เริ่มต้น (@director, @admin, @pt_somchai)...');

  const staffSeeds = [
    {
      username: 'director',
      email: 'director@drtech.care',
      password: 'Admin12345678!',
      full_name: 'ผอ. นพ. บริรักษ์ เวชกิจ',
      role: 'admin' as const,
      phone: '081-999-8888',
      bio: 'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู',
    },
    {
      username: 'admin',
      email: 'admin@drtech.care',
      password: 'Admin12345678!',
      full_name: 'ผู้ดูแลระบบ โรงพยาบาล',
      role: 'admin' as const,
      phone: '082-000-1111',
      bio: 'ผู้ดูแลระบบสารสนเทศและความปลอดภัยโรงพยาบาล',
    },
    {
      username: 'pt_somchai',
      email: 'pt_somchai@drtech.care',
      password: 'CorrectPassword123!',
      full_name: 'กภ. วิภาวี สุขใจ',
      role: 'pt' as const,
      phone: '085-555-4444',
      bio: 'นักกายภาพบำบัดชำนาญการ ประจำศูนย์ฟื้นฟูสมรรถภาพ',
      pt_details: {
        license_no: 'กภ.12345',
        license_expiry: '2028-12-31',
        specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
        age: 32,
        sex: 'female',
      },
    },
  ];

  const staffUserIds = new Map<string, string>();

  // Get existing auth users
  const { data: existingUsersData } = await supabase.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: null }));
  const existingUsers = existingUsersData?.users || [];

  for (const staff of staffSeeds) {
    let authUser = existingUsers.find((u) => u.email?.toLowerCase() === staff.email.toLowerCase());

    if (!authUser) {
      const { data: createdAuth, error: createAuthErr } = await supabase.auth.admin.createUser({
        email: staff.email,
        password: staff.password,
        email_confirm: true,
        user_metadata: {
          role: staff.role,
          username: staff.username,
          full_name: staff.full_name,
        },
      });

      if (createAuthErr || !createdAuth.user) {
        console.warn(`  ⚠️ สร้าง auth user '${staff.username}' ไม่สำเร็จ:`, createAuthErr?.message);
        continue;
      }
      authUser = createdAuth.user;
      console.log(`  ✓ สร้าง auth user: ${staff.email} (ID: ${authUser.id})`);
    } else {
      console.log(`  ✓ Auth user มีอยู่แล้ว: ${staff.email} (ID: ${authUser.id})`);
    }

    const userId = authUser.id;
    staffUserIds.set(staff.username, userId);

    // Upsert Profile
    const { error: profileErr } = await supabase.from('profiles').upsert(
      {
        id: userId,
        username: staff.username,
        full_name: staff.full_name,
        role: staff.role,
        status: 'active',
        phone: staff.phone,
        bio: staff.bio,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (profileErr) {
      console.warn(`  ⚠️ บันทึก profile '${staff.username}' ไม่สำเร็จ:`, profileErr.message);
    } else {
      console.log(`  ✓ Profile บันทึกสำเร็จ: ${staff.username}`);
    }

    // Upsert PT details if role is PT
    if (staff.role === 'pt' && staff.pt_details) {
      const { error: ptErr } = await supabase.from('pts').upsert(
        {
          user_id: userId,
          license_no: staff.pt_details.license_no,
          license_expiry: staff.pt_details.license_expiry,
          specialty: staff.pt_details.specialty,
          age: staff.pt_details.age,
          sex: staff.pt_details.sex,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (ptErr) {
        console.warn(`  ⚠️ บันทึก PT record ไม่สำเร็จ:`, ptErr.message);
      } else {
        console.log(`  ✓ PT record บันทึกสำเร็จ: ใบอนุญาต ${staff.pt_details.license_no}`);
      }
    }
  }

  const ptSomchaiId = staffUserIds.get('pt_somchai');
  const adminId = staffUserIds.get('admin') || staffUserIds.get('director');
  const creatorId = ptSomchaiId || adminId;

  // =========================================================================
  // 2. SEED CLINICAL EXERCISES
  // =========================================================================
  console.log('\n🏋️ [3/6] ซิงค์คลังท่ากายภาพบำบัดมาตรฐาน (exercises)...');

  const exerciseSeeds = [
    {
      id: 'e1000000-0000-0000-0000-000000000001',
      title: 'Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)',
      category: 'ข้อไหล่และแขน',
      target_joint: 'shoulder',
      target_muscle: 'Deltoid & Rotator Cuff',
      difficulty: 'beginner',
      default_sets: 3,
      default_reps: 15,
      description: 'โน้มตัวไปข้างหน้าแล้วปล่อยแขนแกว่งตามแรงโน้มถ่วงเป็นวงกลมเบาๆ เพื่อคลายข้อต่อ',
      suitable_for: 'ข้อไหล่ติด, ผู้ป่วยหลังผ่าตัดไหล่',
      is_active: true,
      created_by: creatorId,
    },
    {
      id: 'e1000000-0000-0000-0000-000000000002',
      title: 'Shoulder External Rotation (หมุนข้อไหล่ออกด้านนอก)',
      category: 'ข้อไหล่และแขน',
      target_joint: 'shoulder',
      target_muscle: 'Infraspinatus & Teres Minor',
      difficulty: 'intermediate',
      default_sets: 3,
      default_reps: 12,
      description: 'งอข้อศอก 90 องศา แนบข้างลำตัวแล้วหมุนแขนออกด้านนอกช้าๆ',
      suitable_for: 'กล้ามเนื้อสะบักอ่อนแรง, เพิ่มมุมการหมุนไหล่',
      is_active: true,
      created_by: creatorId,
    },
    {
      id: 'e1000000-0000-0000-0000-000000000003',
      title: 'Cervical Retraction (เก็บคาง ยืดกระดูกต้นคอ)',
      category: 'ต้นคอและสะบัก',
      target_joint: 'neck',
      target_muscle: 'Deep Cervical Flexors',
      difficulty: 'beginner',
      default_sets: 3,
      default_reps: 10,
      description: 'มองตรงไปข้างหน้า ดึงคางและศีรษะถอยหลังตรงๆ ค้างไว้ 5 วินาที แล้วคลายออก',
      suitable_for: 'ออฟฟิศซินโดรม, ปวดคอบ่าเรื้อรัง',
      is_active: true,
      created_by: creatorId,
    },
    {
      id: 'e1000000-0000-0000-0000-000000000004',
      title: 'ท่ายกเข่าสูงทรงตัว (High Knee Lift)',
      category: 'ขาและข้อเข่า',
      target_joint: 'knee',
      target_muscle: 'Quadriceps & Hip Flexors',
      difficulty: 'beginner',
      default_sets: 3,
      default_reps: 10,
      description: 'ยืนตรง ยกเข่าขึ้นตั้งฉากกับลำตัวช้าๆ สลับซ้ายขวา',
      suitable_for: 'ข้อเข่าเสื่อม, ฝึกความแข็งแรงขา',
      is_active: true,
      created_by: creatorId,
    },
  ];

  for (const ex of exerciseSeeds) {
    const { error: exErr } = await supabase.from('exercises').upsert(ex, { onConflict: 'id' });
    if (exErr) {
      console.warn(`  ⚠️ ซิงค์ท่า '${ex.title}' ไม่สำเร็จ:`, exErr.message);
    } else {
      console.log(`  ✓ ซิงค์ท่ากายภาพ: ${ex.title}`);
    }
  }

  // =========================================================================
  // 3. SEED MINIGAMES & QUESTIONS
  // =========================================================================
  console.log('\n🎮 [4/6] ซิงค์มินิเกมและชุดคำถามฝึกสมอง (minigames & minigame_questions)...');

  const minigameId = 'm1000000-0000-0000-0000-000000000001';
  const minigameSeed = {
    id: minigameId,
    title: 'เกมทดสอบความจำและการรับรู้ (Cognitive Recovery)',
    category: 'ความจำและการรู้คิด',
    description: 'ฝึกการตอบสนองสมองและความจำระยะสั้นควบคู่การฟื้นฟูร่างกาย',
    difficulty: 'medium',
    is_active: true,
    created_by: creatorId,
  };

  const { error: mgErr } = await supabase.from('minigames').upsert(minigameSeed, { onConflict: 'id' });
  if (mgErr) {
    console.warn('  ⚠️ ซิงค์มินิเกมไม่สำเร็จ:', mgErr.message);
  } else {
    console.log(`  ✓ ซิงค์มินิเกม: ${minigameSeed.title}`);
  }

  const questionSeeds = [
    {
      id: 'q1000000-0000-0000-0000-000000000001',
      minigame_id: minigameId,
      prompt: 'เมื่อมีอาการปวดไหล่เฉียบพลันหลังออกกำลังกาย ควรปฏิบัติอย่างไรใน 24 ชั่วโมงแรก?',
      choices: ['ประคบเย็น 15-20 นาที', 'ประคบร้อนทันที', 'นวดกดจุดแรงๆ', 'ดัดดึงแขนอย่างรวดเร็ว'],
      answer: 'ประคบเย็น 15-20 นาที',
      options: ['ประคบเย็น 15-20 นาที', 'ประคบร้อนทันที', 'นวดกดจุดแรงๆ', 'ดัดดึงแขนอย่างรวดเร็ว'],
      correct_index: 0,
      created_by: creatorId,
    },
    {
      id: 'q1000000-0000-0000-0000-000000000002',
      minigame_id: minigameId,
      prompt: 'การนั่งทำงานหน้าคอมพิวเตอร์ที่ถูกต้อง หน้าจอควรอยู่ในระดับใด?',
      choices: ['ระดับสายตาหรือต่ำกว่าเล็กน้อย 10-15 องศา', 'สูงกว่าศีรษะ 30 องศา', 'ต่ำกว่าอก', 'วางไว้ข้างลำตัว'],
      answer: 'ระดับสายตาหรือต่ำกว่าเล็กน้อย 10-15 องศา',
      options: ['ระดับสายตาหรือต่ำกว่าเล็กน้อย 10-15 องศา', 'สูงกว่าศีรษะ 30 องศา', 'ต่ำกว่าอก', 'วางไว้ข้างลำตัว'],
      correct_index: 0,
      created_by: creatorId,
    },
  ];

  for (const q of questionSeeds) {
    const { error: qErr } = await supabase.from('minigame_questions').upsert(q, { onConflict: 'id' });
    if (qErr) {
      console.warn(`  ⚠️ ซิงค์คำถาม '${q.prompt.substring(0, 30)}...' ไม่สำเร็จ:`, qErr.message);
    } else {
      console.log(`  ✓ ซิงค์คำถาม: ${q.prompt.substring(0, 45)}...`);
    }
  }

  // =========================================================================
  // 4. SEED MODPACKS (Exercise Bundles)
  // =========================================================================
  console.log('\n📦 [5/6] ซิงค์ชุดจัดกลุ่มท่ากายภาพบำบัด (modpacks)...');

  const modpackId = 'p1000000-0000-0000-0000-000000000001';
  const modpackSeed = {
    id: modpackId,
    name: 'ชุดฟื้นฟูข้อไหล่ติดระยะเริ่มต้น (Frozen Shoulder Phase 1)',
    description: 'โปรแกรม 3 ท่าฟื้นฟูการเคลื่อนไหวข้อต่อและลดพังผืดไหล่',
    is_active: true,
    created_by: creatorId,
  };

  const { error: mpErr } = await supabase.from('modpacks').upsert(modpackSeed, { onConflict: 'id' });
  if (mpErr) {
    console.warn('  ⚠️ ซิงค์ modpack ไม่สำเร็จ:', mpErr.message);
  } else {
    console.log(`  ✓ ซิงค์ modpack: ${modpackSeed.name}`);
  }

  const modpackItems = [
    {
      id: 'i1000000-0000-0000-0000-000000000001',
      modpack_id: modpackId,
      exercise_id: 'e1000000-0000-0000-0000-000000000001',
      sets: 3,
      reps: 15,
      position: 1,
    },
    {
      id: 'i1000000-0000-0000-0000-000000000002',
      modpack_id: modpackId,
      exercise_id: 'e1000000-0000-0000-0000-000000000002',
      sets: 3,
      reps: 12,
      position: 2,
    },
  ];

  for (const item of modpackItems) {
    const { error: itemErr } = await supabase.from('modpack_items').upsert(item, { onConflict: 'id' });
    if (itemErr) {
      console.warn(`  ⚠️ ซิงค์ modpack item ไม่สำเร็จ:`, itemErr.message);
    } else {
      console.log(`  ✓ ผูกท่าเข้าชุด Modpack ตำแหน่งที่ ${item.position}`);
    }
  }

  // =========================================================================
  // 5. SEED INITIAL CLINICAL PATIENTS
  // =========================================================================
  console.log('\n🏥 [6/6] ซิงค์รายชื่อคนไข้เริ่มต้นเข้าคลินิก (patients)...');

  const patientSeeds = [
    {
      id: 'c1000000-0000-0000-0000-000000000001',
      first_name: 'ทองดี',
      last_name: 'มีสุข',
      age: 52,
      sex: 'male',
      phone: '081-111-2222',
      injury: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
      responsible_pt_id: ptSomchaiId || null,
      registration_status: 'active',
      registered_via: 'reception',
    },
    {
      id: 'c1000000-0000-0000-0000-000000000002',
      first_name: 'สมศรี',
      last_name: 'รักดี',
      age: 48,
      sex: 'female',
      phone: '089-222-3333',
      injury: 'หมอนรองกระดูกทับเส้นประสาท (LBP)',
      responsible_pt_id: ptSomchaiId || null,
      registration_status: 'active',
      registered_via: 'reception',
    },
  ];

  for (const patient of patientSeeds) {
    const { data: createdP, error: pErr } = await supabase
      .from('patients')
      .upsert(patient, { onConflict: 'id' })
      .select('id, hn, first_name, last_name')
      .single();

    if (pErr) {
      console.warn(`  ⚠️ บันทึกคนไข้ '${patient.first_name}' ไม่สำเร็จ:`, pErr.message);
    } else if (createdP) {
      console.log(`  ✓ คนไข้พร้อมรับบริการ: ${createdP.first_name} ${createdP.last_name} (HN: ${createdP.hn || 'อัตโนมัติ'})`);

      // Link assignment
      if (ptSomchaiId) {
        await supabase.from('patient_pt_assignments').upsert(
          { patient_id: createdP.id, pt_id: ptSomchaiId, is_primary: true },
          { onConflict: 'patient_id,pt_id' }
        );
      }
    }
  }

  // =========================================================================
  // SUMMARY OF REAL CLOUD TABLES
  // =========================================================================
  console.log('\n========================================================================');
  console.log('สรุปจำนวนข้อมูลจริงในตาราง Supabase Cloud (mctegvnrvmglbibuuczi):');
  console.log('========================================================================');

  const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: ptCount } = await supabase.from('pts').select('*', { count: 'exact', head: true });
  const { count: patientCount } = await supabase.from('patients').select('*', { count: 'exact', head: true });
  const { count: exerciseCount } = await supabase.from('exercises').select('*', { count: 'exact', head: true });
  const { count: minigameCount } = await supabase.from('minigames').select('*', { count: 'exact', head: true });
  const { count: modpackCount } = await supabase.from('modpacks').select('*', { count: 'exact', head: true });

  console.log(`  profiles table          : ${profileCount ?? 0} แถว`);
  console.log(`  pts table               : ${ptCount ?? 0} แถว`);
  console.log(`  patients table          : ${patientCount ?? 0} แถว`);
  console.log(`  exercises table         : ${exerciseCount ?? 0} แถว`);
  console.log(`  minigames table         : ${minigameCount ?? 0} แถว`);
  console.log(`  modpacks table          : ${modpackCount ?? 0} แถว`);
  console.log('========================================================================\n');
  console.log('✓ การ Seed ฐานข้อมูล Supabase Cloud เสร็จสมบูรณ์ 100%!');
}

seedCloudDatabase().catch((err) => {
  console.error('Fatal error during cloud seeding:', err);
  process.exit(1);
});
