-- ============================================================================
-- DrTech.Care Production Seed & Provisioning Script
-- Target: Supabase Cloud (project ref: mctegvnrvmglbibuuczi)
-- Description:
-- 1. Fixes 3 Security Definer View Errors (Enforces security_invoker = true)
-- 2. Fixes 34 Function Search Path Mutable Warnings (Enforces search_path = public, extensions, pg_temp)
-- 3. Fixes Auth RLS Initialization Plan (Wraps auth.uid() & public.current_user_role() in subqueries)
-- 4. Provisions Initial Staff: director, admin, pt_somchai (Auth + Profiles + PTs)
-- 5. Provisions Initial Patients: P-1001 (ทองดี มีสุข), P-1002 (สมศรี รักดี)
-- 6. Provisions Exercises & Kiosk Terminal
-- ============================================================================

-- STEP 1: FIX SECURITY ADVISOR (3 VIEWS)
CREATE OR REPLACE VIEW public.view_patient_recovery_trajectory WITH (security_invoker = true) AS
SELECT
  p.id AS patient_id,
  p.hn,
  p.first_name || ' ' || p.last_name AS patient_name,
  p.injury,
  prof.full_name AS responsible_pt_name,
  mr.run_date,
  mr.pain_score AS current_pain_vas,
  LAG(mr.pain_score) OVER (PARTITION BY mr.patient_id ORDER BY mr.run_date ASC) AS previous_pain_vas,
  (LAG(mr.pain_score) OVER (PARTITION BY mr.patient_id ORDER BY mr.run_date ASC) - mr.pain_score) AS pain_reduction_delta,
  mr.status AS mission_status,
  mr.feedback AS patient_feedback
FROM public.mission_runs mr
JOIN public.patients p ON p.id = mr.patient_id
LEFT JOIN public.profiles prof ON prof.id = p.responsible_pt_id
WHERE mr.status = 'completed';

CREATE OR REPLACE VIEW public.view_clinic_daily_summary WITH (security_invoker = true) AS
SELECT
  CURRENT_DATE AS report_date,
  (SELECT COUNT(*) FROM public.checkins WHERE date = CURRENT_DATE) AS total_checked_in,
  (SELECT COUNT(*) FROM public.courses WHERE CURRENT_DATE BETWEEN start_date AND end_date AND status = 'active') AS active_courses_today,
  (SELECT COUNT(*) FROM public.mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed') AS missions_completed_today,
  (SELECT COUNT(*) FROM public.staff_calls WHERE created_at::DATE = CURRENT_DATE AND handled_at IS NULL) AS pending_emergency_calls,
  (SELECT COALESCE(ROUND(AVG(pain_score), 1), 0) FROM public.mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed' AND pain_score IS NOT NULL) AS avg_pain_score_today;

CREATE OR REPLACE VIEW public.view_kiosk_live_telemetry WITH (security_invoker = true) AS
SELECT
  kd.id AS kiosk_id,
  kd.name AS kiosk_name,
  kd.location,
  kd.is_active,
  kd.last_seen_at,
  CASE
    WHEN kd.last_seen_at IS NULL THEN 'offline'
    WHEN kd.last_seen_at >= NOW() - INTERVAL '5 minutes' THEN 'online'
    ELSE 'stale'
  END AS connection_status,
  COUNT(sc.id) FILTER (WHERE sc.handled_at IS NULL) AS unhandled_staff_calls_count
FROM public.kiosk_devices kd
LEFT JOIN public.staff_calls sc ON sc.kiosk_id = kd.id
GROUP BY kd.id, kd.name, kd.location, kd.is_active, kd.last_seen_at;

ALTER VIEW IF EXISTS public.view_patient_recovery_trajectory SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_clinic_daily_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_kiosk_live_telemetry SET (security_invoker = true);

-- STEP 2: FIX FUNCTION SEARCH PATH (NAMED FUNCTIONS + DYNAMIC SWEEP)
ALTER FUNCTION IF EXISTS public.current_user_role() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.is_patient_accessible_by_pt(UUID) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.match_face_candidates(extensions.vector(512), UUID[], INT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.match_face_candidates(extensions.vector, UUID[], INT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enroll_face_atomic(UUID, extensions.vector(512), TEXT, JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enroll_face_atomic(UUID, UUID, TEXT, public.pose_type[], extensions.vector[], UUID, UUID) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.check_profile_update_privileges() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enforce_content_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enforce_modpack_item_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.check_course_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_audit_logs_tampering() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_medical_notes_tampering() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_treatment_results_tampering() SET search_path = public, extensions, pg_temp;

ALTER FUNCTION IF EXISTS public.trg_fn_prevent_medical_notes_modification() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_prevent_treatment_results_modification() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_prevent_audit_logs_modification() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_exercise_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_minigame_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_minigame_question_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_modpack_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_course_assignment_permission() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_touch_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.fn_chain_medical_notes_hash() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.fn_chain_audit_logs_hash() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.mask_phone(TEXT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.cleanup_expired_ephemerals() SET search_path = public, extensions, pg_temp;

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

-- STEP 3: OPTIMIZE RLS POLICIES FOR SUPABASE PERFORMANCE ADVISOR
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_authenticated_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pts_select_authenticated" ON public.pts;
DROP POLICY IF EXISTS "pts_authenticated_select" ON public.pts;
DROP POLICY IF EXISTS "pts_admin_all" ON public.pts;
DROP POLICY IF EXISTS "pts_self_update" ON public.pts;
DROP POLICY IF EXISTS "pts_admin_manage" ON public.pts;

CREATE POLICY "pts_select_authenticated" ON public.pts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pts_admin_all" ON public.pts
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "patients_select" ON public.patients;
DROP POLICY IF EXISTS "patients_insert" ON public.patients;
DROP POLICY IF EXISTS "patients_update" ON public.patients;
DROP POLICY IF EXISTS "patients_pt_select" ON public.patients;
DROP POLICY IF EXISTS "patients_pt_update" ON public.patients;

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(id)));

CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'pt'));

CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(id)))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(id)));

DROP POLICY IF EXISTS "assignments_select" ON public.patient_pt_assignments;
DROP POLICY IF EXISTS "assignments_admin_pt_manage" ON public.patient_pt_assignments;

CREATE POLICY "assignments_select" ON public.patient_pt_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "assignments_admin_pt_manage" ON public.patient_pt_assignments
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'pt'));

DROP POLICY IF EXISTS "case_transfers_select" ON public.case_transfers;
DROP POLICY IF EXISTS "case_transfers_insert" ON public.case_transfers;
DROP POLICY IF EXISTS "case_transfers_update" ON public.case_transfers;
DROP POLICY IF EXISTS "transfers_select" ON public.case_transfers;
DROP POLICY IF EXISTS "transfers_insert" ON public.case_transfers;
DROP POLICY IF EXISTS "transfers_update" ON public.case_transfers;

CREATE POLICY "transfers_select" ON public.case_transfers
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR from_pt_id = (SELECT auth.uid()) OR to_pt_id = (SELECT auth.uid()));

CREATE POLICY "transfers_insert" ON public.case_transfers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR from_pt_id = (SELECT auth.uid()));

CREATE POLICY "transfers_update" ON public.case_transfers
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR to_pt_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR to_pt_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "exercises_select" ON public.exercises;
DROP POLICY IF EXISTS "exercises_insert" ON public.exercises;
DROP POLICY IF EXISTS "exercises_update" ON public.exercises;
DROP POLICY IF EXISTS "exercises_delete" ON public.exercises;
DROP POLICY IF EXISTS "exercises_pt_update" ON public.exercises;

CREATE POLICY "exercises_select" ON public.exercises
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "exercises_insert" ON public.exercises
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'pt'));

CREATE POLICY "exercises_update" ON public.exercises
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

CREATE POLICY "exercises_delete" ON public.exercises
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'));

DROP POLICY IF EXISTS "minigames_select" ON public.minigames;
DROP POLICY IF EXISTS "minigames_all" ON public.minigames;
DROP POLICY IF EXISTS "minigame_questions_select" ON public.minigame_questions;
DROP POLICY IF EXISTS "minigame_questions_all" ON public.minigame_questions;

CREATE POLICY "minigames_select" ON public.minigames
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "minigames_all" ON public.minigames
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

CREATE POLICY "minigame_questions_select" ON public.minigame_questions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "minigame_questions_all" ON public.minigame_questions
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "modpacks_select" ON public.modpacks;
DROP POLICY IF EXISTS "modpacks_all" ON public.modpacks;
DROP POLICY IF EXISTS "modpack_items_select" ON public.modpack_items;
DROP POLICY IF EXISTS "modpack_items_all" ON public.modpack_items;

CREATE POLICY "modpacks_select" ON public.modpacks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "modpacks_all" ON public.modpacks
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

CREATE POLICY "modpack_items_select" ON public.modpack_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "modpack_items_all" ON public.modpack_items
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND EXISTS (
        SELECT 1 FROM public.modpacks m
        WHERE m.id = modpack_items.modpack_id
          AND m.created_by = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "courses_select" ON public.courses;
DROP POLICY IF EXISTS "courses_insert" ON public.courses;
DROP POLICY IF EXISTS "courses_update" ON public.courses;
DROP POLICY IF EXISTS "courses_delete" ON public.courses;

CREATE POLICY "courses_select" ON public.courses
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR pt_id = (SELECT auth.uid()) OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "courses_insert" ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  );

CREATE POLICY "courses_update" ON public.courses
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  )
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  );

CREATE POLICY "courses_delete" ON public.courses
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR ((SELECT public.current_user_role()) = 'pt' AND pt_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "medical_notes_select" ON public.medical_notes;
DROP POLICY IF EXISTS "medical_notes_insert" ON public.medical_notes;
DROP POLICY IF EXISTS "treatment_results_select" ON public.treatment_results;
DROP POLICY IF EXISTS "treatment_results_insert" ON public.treatment_results;

CREATE POLICY "medical_notes_select" ON public.medical_notes
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "medical_notes_insert" ON public.medical_notes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'pt' AND author_id = (SELECT auth.uid()));

CREATE POLICY "treatment_results_select" ON public.treatment_results
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "treatment_results_insert" ON public.treatment_results
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'pt' AND author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "consents_select" ON public.consents;
DROP POLICY IF EXISTS "consents_insert" ON public.consents;
DROP POLICY IF EXISTS "consents_update" ON public.consents;
DROP POLICY IF EXISTS "consents_delete" ON public.consents;

CREATE POLICY "consents_select" ON public.consents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (subject_type = 'patient' AND (SELECT public.is_patient_accessible_by_pt(subject_id)))
    OR (subject_type = 'staff' AND subject_id = (SELECT auth.uid()))
  );

CREATE POLICY "consents_insert" ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR ((SELECT public.current_user_role()) = 'pt' AND subject_type = 'patient' AND (SELECT public.is_patient_accessible_by_pt(subject_id)))
  );

DROP POLICY IF EXISTS "checkins_select" ON public.checkins;
DROP POLICY IF EXISTS "checkins_insert" ON public.checkins;
DROP POLICY IF EXISTS "checkins_update" ON public.checkins;
DROP POLICY IF EXISTS "checkins_delete" ON public.checkins;

CREATE POLICY "checkins_select" ON public.checkins
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "checkins_insert" ON public.checkins
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND checked_in_by = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  );

-- STEP 4: PROVISION AUTH USERS, PROFILES, PTS & CLINICAL DATA
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

  -- 4.1 Insert into auth.users (if not already existing)
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

  -- 4.2 Upsert public.profiles
  INSERT INTO public.profiles (id, username, full_name, role, status, phone, bio) VALUES
    (v_director_id, 'director', 'ผอ. นพ. วิจัย สุขเกษม', 'admin', 'active', '081-999-8888', 'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู'),
    (v_admin_id, 'admin', 'ผู้ดูแลระบบโรงพยาบาล (Admin)', 'admin', 'active', '082-000-1111', 'ผู้ดูแลระบบสารสนเทศโรงพยาบาล'),
    (v_pt_id, 'pt_somchai', 'กภ. ภัทรพล เจริญสุข', 'pt', 'active', '085-555-4444', 'นักกายภาพบำบัดชำนาญการ ประจำศูนย์ฟื้นฟูสมรรถภาพ')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone;

  -- 4.3 Upsert public.pts
  INSERT INTO public.pts (user_id, license_no, license_expiry, specialty, age, sex) VALUES
    (v_pt_id, 'กภ.12345', '2028-12-31', 'เวชศาสตร์ฟื้นฟูข้อและกล้ามเนื้อ', 35, 'male')
  ON CONFLICT (user_id) DO UPDATE SET
    license_no = EXCLUDED.license_no,
    specialty = EXCLUDED.specialty;

  -- 4.4 Upsert public.kiosk_devices
  INSERT INTO public.kiosk_devices (id, name, location, token_hash, is_active) VALUES
    (v_kiosk_id, 'ตู้ Kiosk หลัก OPD ชั้น 1', 'แผนกเวชศาสตร์ฟื้นฟู OPD 1', 'kiosk-token-hash-01', true)
  ON CONFLICT (id) DO NOTHING;

  -- 4.5 Upsert public.exercises
  INSERT INTO public.exercises (id, title, target_joint, difficulty, default_sets, default_reps, description, suitable_for, created_by) VALUES
    (v_ex1_id, 'Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)', 'shoulder', 'beginner', 3, 15, 'โน้มตัวไปข้างหน้าแล้วปล่อยแขนแกว่งตามแรงโน้มถ่วงเป็นวงกลมเบาๆ', 'ข้อไหล่ติด', v_pt_id),
    (v_ex2_id, 'Shoulder External Rotation (หมุนข้อไหล่ออกด้านนอก)', 'shoulder', 'intermediate', 3, 12, 'งอข้อศอก 90 องศา แนบข้างลำตัวแล้วหมุนแขนออกด้านนอกช้าๆ', 'กล้ามเนื้อสะบัก', v_pt_id)
  ON CONFLICT (id) DO NOTHING;

  -- 4.6 Upsert public.patients
  INSERT INTO public.patients (
    id, hn, first_name, last_name, age, sex, phone, injury, responsible_pt_id, registration_status, registered_via
  ) VALUES
    (v_pat1_id, 'HN100001', 'ทองดี', 'มีสุข', 52, 'male', '0811112222', 'ข้อไหล่ติดระยะฟื้นฟู', v_pt_id, 'active', 'reception'),
    (v_pat2_id, 'HN100002', 'สมศรี', 'รักดี', 48, 'female', '0892223333', 'หมอนรองกระดูกทับเส้นประสาท (LBP)', v_pt_id, 'active', 'reception')
  ON CONFLICT (id) DO NOTHING;

  -- 4.7 Upsert public.patient_pt_assignments
  INSERT INTO public.patient_pt_assignments (patient_id, pt_id, is_primary) VALUES
    (v_pat1_id, v_pt_id, true),
    (v_pat2_id, v_pt_id, true)
  ON CONFLICT (patient_id, pt_id) DO NOTHING;

  -- 4.8 Audit log
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
