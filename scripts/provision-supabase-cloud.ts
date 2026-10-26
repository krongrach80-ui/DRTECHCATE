/**
 * scripts/provision-supabase-cloud.ts
 * Provision initial accounts (director, admin, pt_somchai), initial patients,
 * standard clinical exercises, and kiosk devices directly into Supabase Cloud.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env.local or .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mctegvnrvmglbibuuczi.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY.includes('local-dev') || SERVICE_ROLE_KEY.includes('bypass')) {
  console.error('\n========================================================================');
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is missing or using placeholder value!');
  console.error('To provision real data into Supabase Cloud (mctegvnrvmglbibuuczi),');
  console.error('please set the real SUPABASE_SERVICE_ROLE_KEY in .env or provide as argument:');
  console.error('  npx tsx scripts/provision-supabase-cloud.ts <SUPABASE_SERVICE_ROLE_KEY>');
  console.error('========================================================================\n');
}

const keyToUse = process.argv[2] || SERVICE_ROLE_KEY;

if (!keyToUse) {
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, keyToUse, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function main() {
  console.log('------------------------------------------------------------------------');
  console.log(`Connecting to Supabase Cloud: ${SUPABASE_URL}`);
  console.log('------------------------------------------------------------------------\n');

  // 1. Verify credentials and connection
  const { data: _testProfiles, error: connError } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);

  if (connError) {
    console.error('❌ Connection failed:', connError.message);
    if (connError.message.includes('Invalid API key') || connError.code === '401') {
      console.error('The provided service_role key is invalid.');
    }
    process.exit(1);
  }

  console.log('✓ Successfully connected to Supabase Cloud database.\n');

  // 2. Provision Staff Accounts (Director, Admin, PT Somchai)
  const staffToCreate = [
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
      bio: 'ผู้ดูแลระบบสารสนเทศโรงพยาบาล',
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

  const createdStaffMap = new Map<string, string>(); // username -> user_id

  for (const staff of staffToCreate) {
    console.log(`Provisioning staff account: ${staff.username} (${staff.email})...`);

    // Check if auth user exists
    const { data: usersList } = await supabase.auth.admin.listUsers();
    let authUser = usersList?.users.find((u) => u.email?.toLowerCase() === staff.email.toLowerCase());

    if (!authUser) {
      const { data: newAuth, error: createError } = await supabase.auth.admin.createUser({
        email: staff.email,
        password: staff.password,
        email_confirm: true,
        user_metadata: {
          role: staff.role,
          username: staff.username,
          full_name: staff.full_name,
        },
      });

      if (createError || !newAuth.user) {
        console.error(`  ⚠️ Could not create auth user for ${staff.username}:`, createError?.message);
        continue;
      }
      authUser = newAuth.user;
    }

    const userId = authUser.id;
    createdStaffMap.set(staff.username, userId);

    // Upsert Profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        role: staff.role,
        username: staff.username,
        full_name: staff.full_name,
        phone: staff.phone,
        bio: staff.bio,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      console.error(`  ⚠️ Error saving profile for ${staff.username}:`, profileError.message);
    } else {
      console.log(`  ✓ Profile active for ${staff.username} (ID: ${userId})`);
    }

    // If PT, upsert PT license details
    if (staff.role === 'pt' && staff.pt_details) {
      const { error: ptError } = await supabase
        .from('pts')
        .upsert({
          user_id: userId,
          license_no: staff.pt_details.license_no,
          license_expiry: staff.pt_details.license_expiry,
          specialty: staff.pt_details.specialty,
          age: staff.pt_details.age,
          sex: staff.pt_details.sex,
        }, { onConflict: 'user_id' });

      if (ptError) {
        console.error(`  ⚠️ Error saving PT details:`, ptError.message);
      } else {
        console.log(`  ✓ PT record active: License ${staff.pt_details.license_no}`);
      }
    }
  }

  const ptSomchaiId = createdStaffMap.get('pt_somchai');
  const adminId = createdStaffMap.get('admin') || createdStaffMap.get('director');

  // 3. Provision Exercises
  if (adminId || ptSomchaiId) {
    const creatorId = ptSomchaiId || adminId!;
    console.log('\nProvisioning clinical exercise directory...');

    const sampleExercises = [
      {
        title: 'Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)',
        target_joint: 'shoulder',
        difficulty: 'beginner',
        default_sets: 3,
        default_reps: 15,
        description: 'โน้มตัวไปข้างหน้าแล้วปล่อยแขนแกว่งตามแรงโน้มถ่วงเป็นวงกลมเบาๆ',
        suitable_for: 'ข้อไหล่ติด',
        created_by: creatorId,
      },
      {
        title: 'Shoulder External Rotation (หมุนข้อไหล่ออกด้านนอก)',
        target_joint: 'shoulder',
        difficulty: 'intermediate',
        default_sets: 3,
        default_reps: 12,
        description: 'งอข้อศอก 90 องศา แนบข้างลำตัวแล้วหมุนแขนออกด้านนอกช้าๆ',
        suitable_for: 'กล้ามเนื้อสะบัก',
        created_by: creatorId,
      },
      {
        title: 'Cervical Retraction (เก็บคาง ยืดกระดูกต้นคอ)',
        target_joint: 'neck',
        difficulty: 'beginner',
        default_sets: 3,
        default_reps: 10,
        description: 'มองตรงไปข้างหน้า ดึงคางและศีรษะถอยหลังตรงๆ ค้างไว้ 5 วินาที',
        suitable_for: 'ออฟฟิศซินโดรม',
        created_by: creatorId,
      },
    ];

    for (const ex of sampleExercises) {
      const { data: existing } = await supabase
        .from('exercises')
        .select('id')
        .eq('title', ex.title)
        .maybeSingle();

      if (!existing) {
        const { error: exError } = await supabase.from('exercises').insert(ex);
        if (exError) {
          console.error(`  ⚠️ Error inserting exercise ${ex.title}:`, exError.message);
        } else {
          console.log(`  ✓ Created exercise: ${ex.title}`);
        }
      } else {
        console.log(`  ✓ Exercise already exists: ${ex.title}`);
      }
    }
  }

  // 4. Provision Initial Patients
  console.log('\nProvisioning initial clinical patients...');
  const samplePatients = [
    {
      first_name: 'ทองดี',
      last_name: 'มีสุข',
      age: 52,
      sex: 'male',
      phone: '081-111-2222',
      injury: 'ข้อไหล่ติดระยะฟื้นฟู',
      responsible_pt_id: ptSomchaiId || null,
      registration_status: 'active',
      registered_via: 'reception',
    },
    {
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

  for (const patient of samplePatients) {
    const { data: existingPatient } = await supabase
      .from('patients')
      .select('id, hn')
      .eq('first_name', patient.first_name)
      .eq('last_name', patient.last_name)
      .maybeSingle();

    if (!existingPatient) {
      const { data: createdPatient, error: pError } = await supabase
        .from('patients')
        .insert(patient)
        .select('id, hn, first_name, last_name')
        .single();

      if (pError) {
        console.error(`  ⚠️ Error creating patient ${patient.first_name}:`, pError.message);
      } else {
        console.log(`  ✓ Created patient: ${createdPatient.first_name} ${createdPatient.last_name} (HN: ${createdPatient.hn})`);
      }
    } else {
      console.log(`  ✓ Patient already exists: ${patient.first_name} ${patient.last_name} (HN: ${existingPatient.hn})`);
    }
  }

  // 5. Query and Display Database State
  console.log('\n------------------------------------------------------------------------');
  console.log('SUMMARY OF CLOUD DATABASE TABLES (Supabase Cloud mctegvnrvmglbibuuczi):');
  console.log('------------------------------------------------------------------------');

  const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: ptCount } = await supabase.from('pts').select('*', { count: 'exact', head: true });
  const { count: patientCount } = await supabase.from('patients').select('*', { count: 'exact', head: true });
  const { count: exerciseCount } = await supabase.from('exercises').select('*', { count: 'exact', head: true });

  console.log(`  profiles table : ${profileCount ?? 0} records`);
  console.log(`  pts table      : ${ptCount ?? 0} records`);
  console.log(`  patients table : ${patientCount ?? 0} records`);
  console.log(`  exercises table: ${exerciseCount ?? 0} records`);
  console.log('------------------------------------------------------------------------\n');
}

main().catch((err) => {
  console.error('Unexpected error in provisioning script:', err);
  process.exit(1);
});
