-- ============================================================================
-- DrTech.Care Production Seed & Provisioning Script
-- Target: Supabase Cloud (project ref: mctegvnrvmglbibuuczi)
-- Description:
-- 1. Fixes 3 Security Definer View Errors & 34 Function Search Path Warnings
-- 2. Provisions Initial Staff: director, admin, pt_somchai (Auth + Profiles + PTs)
-- 3. Provisions Initial Patients: P-1001 (ทองดี มีสุข), P-1002 (สมศรี รักดี)
-- 4. Provisions Exercises & Kiosk Terminal
-- ============================================================================

-- STEP 1: FIX SECURITY ADVISOR (3 VIEWS + 34 FUNCTIONS)
ALTER VIEW IF EXISTS public.view_patient_recovery_trajectory SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_clinic_daily_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_kiosk_live_telemetry SET (security_invoker = true);

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp;', r.proname, r.args);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;

-- STEP 2: PROVISION AUTH USERS & PROFILES
DO $$
DECLARE
  v_director_id UUID := '11111111-1111-4111-8111-111111111111';
  v_admin_id    UUID := '22222222-2222-4222-8222-222222222222';
  v_pt_id       UUID := '33333333-3333-4333-8333-333333333333';
  v_pat1_id     UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_pat2_id     UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_ex1_id      UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_ex2_id      UUID := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_kiosk_id    UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
BEGIN

  -- 2.1 Insert into auth.users (if not already existing)
  -- Password for director: Admin12345678!
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_director_id,
    'authenticated',
    'authenticated',
    'director@drtech.care',
    extensions.crypt('Admin12345678!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin","username":"director","full_name":"ผอ. นพ. วิจัย สุขเกษม"}'::jsonb,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    encrypted_password = extensions.crypt('Admin12345678!', extensions.gen_salt('bf')),
    email_confirmed_at = now();

  -- Password for admin: Admin12345678!
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_admin_id,
    'authenticated',
    'authenticated',
    'admin@drtech.care',
    extensions.crypt('Admin12345678!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin","username":"admin","full_name":"ผู้ดูแลระบบโรงพยาบาล (Admin)"}'::jsonb,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    encrypted_password = extensions.crypt('Admin12345678!', extensions.gen_salt('bf')),
    email_confirmed_at = now();

  -- Password for pt_somchai: CorrectPassword123!
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_pt_id,
    'authenticated',
    'authenticated',
    'pt_somchai@drtech.care',
    extensions.crypt('CorrectPassword123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"pt","username":"pt_somchai","full_name":"กภ. ภัทรพล เจริญสุข"}'::jsonb,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    encrypted_password = extensions.crypt('CorrectPassword123!', extensions.gen_salt('bf')),
    email_confirmed_at = now();

  -- 2.2 Upsert public.profiles
  INSERT INTO public.profiles (id, username, full_name, role, status, phone, bio) VALUES
    (v_director_id, 'director', 'ผอ. นพ. วิจัย สุขเกษม', 'admin', 'active', '081-999-8888', 'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู'),
    (v_admin_id, 'admin', 'ผู้ดูแลระบบโรงพยาบาล (Admin)', 'admin', 'active', '082-000-1111', 'ผู้ดูแลระบบสารสนเทศโรงพยาบาล'),
    (v_pt_id, 'pt_somchai', 'กภ. ภัทรพล เจริญสุข', 'pt', 'active', '085-555-4444', 'นักกายภาพบำบัดชำนาญการ ประจำศูนย์ฟื้นฟูสมรรถภาพ')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone;

  -- 2.3 Upsert public.pts
  INSERT INTO public.pts (user_id, license_no, license_expiry, specialty, age, sex) VALUES
    (v_pt_id, 'กภ.12345', '2028-12-31', 'เวชศาสตร์ฟื้นฟูข้อและกล้ามเนื้อ', 35, 'male')
  ON CONFLICT (user_id) DO UPDATE SET
    license_no = EXCLUDED.license_no,
    specialty = EXCLUDED.specialty;

  -- 2.4 Upsert public.kiosk_devices
  INSERT INTO public.kiosk_devices (id, name, location, token_hash, is_active) VALUES
    (v_kiosk_id, 'ตู้ Kiosk หลัก OPD ชั้น 1', 'แผนกเวชศาสตร์ฟื้นฟู OPD 1', 'kiosk-token-hash-01', true)
  ON CONFLICT (id) DO NOTHING;

  -- 2.5 Upsert public.exercises
  INSERT INTO public.exercises (id, title, target_joint, difficulty, default_sets, default_reps, description, suitable_for, created_by) VALUES
    (v_ex1_id, 'Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)', 'shoulder', 'beginner', 3, 15, 'โน้มตัวไปข้างหน้าแล้วปล่อยแขนแกว่งตามแรงโน้มถ่วงเป็นวงกลมเบาๆ', 'ข้อไหล่ติด', v_pt_id),
    (v_ex2_id, 'Shoulder External Rotation (หมุนข้อไหล่ออกด้านนอก)', 'shoulder', 'intermediate', 3, 12, 'งอข้อศอก 90 องศา แนบข้างลำตัวแล้วหมุนแขนออกด้านนอกช้าๆ', 'กล้ามเนื้อสะบัก', v_pt_id)
  ON CONFLICT (id) DO NOTHING;

  -- 2.6 Upsert public.patients
  INSERT INTO public.patients (
    id, hn, first_name, last_name, age, sex, phone, injury, responsible_pt_id, registration_status, registered_via
  ) VALUES
    (v_pat1_id, 'HN100001', 'ทองดี', 'มีสุข', 52, 'male', '0811112222', 'ข้อไหล่ติดระยะฟื้นฟู', v_pt_id, 'active', 'reception'),
    (v_pat2_id, 'HN100002', 'สมศรี', 'รักดี', 48, 'female', '0892223333', 'หมอนรองกระดูกทับเส้นประสาท (LBP)', v_pt_id, 'active', 'reception')
  ON CONFLICT (id) DO NOTHING;

  -- 2.7 Upsert public.patient_pt_assignments
  INSERT INTO public.patient_pt_assignments (patient_id, pt_id, is_primary) VALUES
    (v_pat1_id, v_pt_id, true),
    (v_pat2_id, v_pt_id, true)
  ON CONFLICT (patient_id, pt_id) DO NOTHING;

  -- 2.8 Audit log
  INSERT INTO public.audit_logs (actor_type, actor_id, action, entity, entity_id, metadata) VALUES
    ('system', v_admin_id, 'SYSTEM_PROVISION_CLOUD', 'database', v_admin_id, '{"environment":"production","seeded_tables":["profiles","pts","patients","kiosks","exercises"]}'::jsonb);

END $$;

-- Verify records count
SELECT
  (SELECT COUNT(*) FROM public.profiles) AS total_profiles,
  (SELECT COUNT(*) FROM public.pts) AS total_pts,
  (SELECT COUNT(*) FROM public.patients) AS total_patients,
  (SELECT COUNT(*) FROM public.exercises) AS total_exercises,
  (SELECT COUNT(*) FROM public.kiosk_devices) AS total_kiosks;
