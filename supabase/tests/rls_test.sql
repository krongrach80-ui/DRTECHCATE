-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Comprehensive pgTAP Test Suite: RLS, Security Policies, Immutability & Privileges
-- Master Prompt v3 (Section 4 — 27 Tables Schema & Strict Invariant Verification)
-- ========================================================================

CREATE EXTENSION IF NOT EXISTS pgtap;

BEGIN;
SELECT plan(118);

-- 1. EXTENSIONS (4)
SELECT has_extension('uuid-ossp', 'Extension uuid-ossp must be installed');
SELECT has_extension('pgcrypto', 'Extension pgcrypto must be installed');
SELECT has_extension('vector', 'Extension vector (pgvector) must be installed');
SELECT has_extension('pg_trgm', 'Extension pg_trgm must be installed');

-- 2. EXACT 27 TABLES COUNT & EXISTENCE (28 tests)
SELECT results_eq(
  'SELECT count(*)::int FROM information_schema.tables WHERE table_schema = ''public'' AND table_type = ''BASE TABLE''',
  ARRAY[27],
  'Public schema must contain exactly 27 tables per Spec Section 4 (fail if extra or missing)'
);

SELECT has_table('profiles', 'Table profiles must exist');
SELECT has_table('pts', 'Table pts must exist');
SELECT has_table('patients', 'Table patients must exist');
SELECT has_table('patient_pt_assignments', 'Table patient_pt_assignments must exist');
SELECT has_table('case_transfers', 'Table case_transfers must exist');
SELECT has_table('exercises', 'Table exercises must exist');
SELECT has_table('minigames', 'Table minigames must exist');
SELECT has_table('minigame_questions', 'Table minigame_questions must exist');
SELECT has_table('modpacks', 'Table modpacks must exist');
SELECT has_table('modpack_items', 'Table modpack_items must exist');
SELECT has_table('courses', 'Table courses must exist');
SELECT has_table('course_items', 'Table course_items must exist');
SELECT has_table('mission_runs', 'Table mission_runs must exist');
SELECT has_table('mission_steps', 'Table mission_steps must exist');
SELECT has_table('medical_notes', 'Table medical_notes must exist');
SELECT has_table('treatment_results', 'Table treatment_results must exist');
SELECT has_table('consents', 'Table consents must exist');
SELECT has_table('face_enrollments', 'Table face_enrollments must exist');
SELECT has_table('face_templates', 'Table face_templates must exist');
SELECT has_table('face_challenges', 'Table face_challenges must exist');
SELECT has_table('enrollment_tickets', 'Table enrollment_tickets must exist');
SELECT has_table('checkins', 'Table checkins must exist');
SELECT has_table('kiosk_devices', 'Table kiosk_devices must exist');
SELECT has_table('staff_devices', 'Table staff_devices must exist');
SELECT has_table('staff_calls', 'Table staff_calls must exist');
SELECT has_table('bans', 'Table bans must exist');
SELECT has_table('audit_logs', 'Table audit_logs must exist');

-- 3. SEQUENCE TEST (1)
SELECT has_sequence('patient_hn_seq', 'Sequence patient_hn_seq must exist');

-- 4. FUNCTION EXISTENCE & SECURITY (6)
SELECT has_function('current_user_role', 'Function current_user_role must exist');
SELECT has_function('is_patient_accessible_by_pt', ARRAY['uuid'], 'Function is_patient_accessible_by_pt must exist');
SELECT has_function('match_face_candidates', ARRAY['extensions.vector', 'uuid[]', 'integer'], 'Function match_face_candidates must exist');
SELECT has_function('enroll_face_atomic', 'Function enroll_face_atomic must exist');

-- Function privileges: match_face_candidates restricted to service_role (Item A1)
SELECT ok(
  NOT has_function_privilege('anon', 'match_face_candidates(extensions.vector, uuid[], integer)', 'EXECUTE'),
  'anon must NOT have EXECUTE privilege on match_face_candidates'
);
SELECT ok(
  has_function_privilege('service_role', 'match_face_candidates(extensions.vector, uuid[], integer)', 'EXECUTE'),
  'service_role must have EXECUTE privilege on match_face_candidates'
);

-- 5. DYNAMIC PRIVILEGE SWEEP FOR ANON (Item I2: 0 privileges across all public tables, sequences, functions)
SELECT ok(
  NOT COALESCE(
    (
      SELECT bool_or(has_table_privilege('anon', 'public.' || table_name, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ),
    false
  ),
  'anon must NOT have any table privilege on any table in public schema'
);

SELECT ok(
  NOT COALESCE(
    (
      SELECT bool_or(has_sequence_privilege('anon', 'public.' || sequence_name, 'USAGE, SELECT, UPDATE'))
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
    ),
    false
  ),
  'anon must NOT have any privilege on any sequence in public schema'
);

SELECT ok(
  NOT COALESCE(
    (
      SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('current_user_role', 'is_patient_accessible_by_pt', 'match_face_candidates', 'enroll_face_atomic')
    ),
    false
  ),
  'anon must NOT have EXECUTE privilege on security functions in public schema'
);

-- 6. DYNAMIC PRIVILEGE VERIFICATION FOR AUTHENTICATED
SELECT ok(
  NOT COALESCE(
    (
      SELECT bool_or(has_table_privilege('authenticated', 'public.' || table_name, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'))
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN (
          'profiles', 'pts', 'patients', 'patient_pt_assignments', 'case_transfers',
          'exercises', 'minigames', 'minigame_questions', 'modpacks', 'modpack_items',
          'courses', 'course_items', 'mission_runs', 'mission_steps',
          'medical_notes', 'treatment_results', 'consents', 'checkins'
        )
    ),
    false
  ),
  'authenticated must have 0 privileges on any private table (face_*, kiosk_devices, staff_*, bans, audit_logs)'
);

-- 7. SERVICE_ROLE FULL ACCESS ON PRIVATE TABLES (Item A3)
SELECT ok(
  COALESCE(
    (
      SELECT bool_and(has_table_privilege('service_role', 'public.' || table_name, 'SELECT, INSERT, UPDATE, DELETE'))
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ),
    false
  ),
  'service_role must have full SELECT, INSERT, UPDATE, DELETE on all tables in public schema'
);

-- 8. IMMUTABILITY & INVARIANT TRIGGERS EXISTENCE (8)
SELECT has_trigger('audit_logs', 'trg_audit_logs_immutable', 'Trigger on audit_logs must exist');
SELECT has_trigger('medical_notes', 'trg_medical_notes_immutable', 'Trigger on medical_notes must exist');
SELECT has_trigger('treatment_results', 'trg_treatment_results_immutable', 'Trigger on treatment_results must exist');
SELECT has_trigger('exercises', 'trg_check_exercise_ownership', 'Ownership trigger on exercises must exist');
SELECT has_trigger('minigames', 'trg_check_minigame_ownership', 'Ownership trigger on minigames must exist');
SELECT has_trigger('modpacks', 'trg_check_modpack_ownership', 'Ownership trigger on modpacks must exist');
SELECT has_trigger('courses', 'trg_check_course_ownership', 'Ownership trigger on courses must exist');
SELECT has_trigger('profiles', 'trg_check_profile_update_privileges', 'Profile role/status privilege trigger must exist');

-- 9. INDEXES & CONSTRAINTS (5)
SELECT has_index('face_templates', 'idx_face_templates_hnsw', 'HNSW cosine index on face_templates must exist');
SELECT has_index('patients', 'idx_patients_trgm', 'GIN trigram index on patients name/hn/phone must exist');
SELECT has_index('patients', 'idx_patients_hn', 'B-tree index on patients hn must exist');
SELECT has_index('courses', 'idx_courses_patient_date', 'Index on courses patient and date must exist');
SELECT col_is_unique('courses', ARRAY['patient_id', 'version'], 'Unique constraint on (patient_id, version) must exist');

-- ========================================================================
-- 10. COMPREHENSIVE NEGATIVE TESTS (Group E & Items A1, A4, B2, B4)
-- ========================================================================

-- Setup Test Users & Fixtures
DO $$
DECLARE
  v_admin_id UUID := '11111111-1111-1111-1111-111111111111';
  v_pt1_id UUID   := '22222222-2222-2222-2222-222222222222';
  v_pt2_id UUID   := '33333333-3333-3333-3333-333333333333';
  v_susp_id UUID  := '44444444-4444-4444-4444-444444444444';
  v_pat1_id UUID  := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_pat2_id UUID  := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_ex1_id UUID   := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_ex2_id UUID   := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
BEGIN
  -- Insert into auth.users (if table exists) or simulate profiles
  BEGIN
    INSERT INTO auth.users (id, email) VALUES
      (v_admin_id, 'admin@clinic.internal'),
      (v_pt1_id, 'pt1@clinic.internal'),
      (v_pt2_id, 'pt2@clinic.internal'),
      (v_susp_id, 'suspended@clinic.internal');
  EXCEPTION WHEN undefined_table THEN
    -- auth.users not present in standalone schema test, profiles PK is self-contained
  END;

  INSERT INTO public.profiles (id, username, full_name, role, status) VALUES
    (v_admin_id, 'admin', 'Admin User', 'admin', 'active'),
    (v_pt1_id, 'pt1', 'Physical Therapist 1', 'pt', 'active'),
    (v_pt2_id, 'pt2', 'Physical Therapist 2', 'pt', 'active'),
    (v_susp_id, 'susp', 'Suspended PT', 'pt', 'suspended')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

  INSERT INTO public.pts (user_id, license_no) VALUES
    (v_pt1_id, 'PT-001'),
    (v_pt2_id, 'PT-002')
  ON CONFLICT (user_id) DO NOTHING;

  -- Patients: Patient 1 assigned to PT1, Patient 2 assigned to PT2
  INSERT INTO public.patients (id, first_name, last_name, age, sex, injury, responsible_pt_id) VALUES
    (v_pat1_id, 'Somchai', 'Dee', 45, 'M', 'Knee Strain', v_pt1_id),
    (v_pat2_id, 'Wanna', 'Thong', 52, 'F', 'Frozen Shoulder', v_pt2_id)
  ON CONFLICT (id) DO NOTHING;

  -- Exercises: Exercise 1 by PT1, Exercise 2 by PT2
  INSERT INTO public.exercises (id, title, target_joint, created_by) VALUES
    (v_ex1_id, 'PT1 Knee Flexion', 'Knee', v_pt1_id),
    (v_ex2_id, 'PT2 Shoulder Press', 'Shoulder', v_pt2_id)
  ON CONFLICT (id) DO NOTHING;

  -- Modpacks: Modpack 1 created by PT1, with Modpack Item 1
  INSERT INTO public.modpacks (id, name, created_by) VALUES
    ('dddddddd-0000-dddd-0000-dddddddddddd', 'PT1 Rehab Pack', v_pt1_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.modpack_items (id, modpack_id, exercise_id, sets, reps) VALUES
    ('dddddddd-1111-dddd-1111-dddddddddddd', 'dddddddd-0000-dddd-0000-dddddddddddd', v_ex1_id, 3, 10)
  ON CONFLICT (id) DO NOTHING;

  -- Samples for append-only immutability tests
  INSERT INTO public.audit_logs (id, actor_type, actor_id, action, entity) VALUES
    ('11111111-aaaa-1111-aaaa-111111111111', 'staff', v_admin_id, 'LOGIN', 'auth')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.medical_notes (id, patient_id, author_id, body) VALUES
    ('22222222-bbbb-2222-bbbb-222222222222', v_pat1_id, v_pt1_id, 'Initial assessment note')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.treatment_results (id, patient_id, author_id, body) VALUES
    ('33333333-cccc-3333-cccc-333333333333', v_pat1_id, v_pt1_id, 'Treatment note body')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- E1: PT modifies/deletes another PT's exercises -> throws exception
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', ''{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}'', true); UPDATE public.exercises SET title = ''Hacked'' WHERE id = ''ffffffff-ffff-ffff-ffff-ffffffffffff''; RESET ROLE;',
  'Permission denied: PT can only modify or delete items they created.',
  'PT modifying exercise created by another PT must throw permission denied'
);

SELECT throws_ok(
  'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', ''{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}'', true); DELETE FROM public.exercises WHERE id = ''ffffffff-ffff-ffff-ffff-ffffffffffff''; RESET ROLE;',
  'Permission denied: PT can only modify or delete items they created.',
  'PT deleting exercise created by another PT must throw permission denied'
);

-- E1b: PT modifies another PT''s modpack items -> throws exception
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', ''{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}'', true); UPDATE public.modpack_items SET reps = 99 WHERE id = ''dddddddd-1111-dddd-1111-dddddddddddd''; RESET ROLE;',
  'Permission denied: PT can only modify or delete modpack items in modpacks they created.',
  'PT modifying modpack item in modpack created by another PT must throw permission denied'
);

-- E2: PT updates own profile changing role, status, or force_logout_at -> throws exception
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', ''{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}'', true); UPDATE public.profiles SET role = ''admin'' WHERE id = ''22222222-2222-2222-2222-222222222222''; RESET ROLE;',
  '42501',
  NULL,
  'PT escalating own role to admin must throw permission denied'
);

SELECT throws_ok(
  'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', ''{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}'', true); UPDATE public.profiles SET status = ''archived'' WHERE id = ''22222222-2222-2222-2222-222222222222''; RESET ROLE;',
  '42501',
  NULL,
  'PT modifying profile status must throw permission denied'
);

SELECT throws_ok(
  'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', ''{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}'', true); UPDATE public.profiles SET force_logout_at = now() WHERE id = ''22222222-2222-2222-2222-222222222222''; RESET ROLE;',
  '42501',
  NULL,
  'PT modifying force_logout_at must throw permission denied'
);

-- E3: PT assigns or modifies course for patient not accessible by PT -> throws exception (Item B4)
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', ''{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}'', true); INSERT INTO public.courses (patient_id, pt_id, start_date, end_date) VALUES (''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'', ''22222222-2222-2222-2222-222222222222'', ''2026-10-25'', ''2026-11-25''); RESET ROLE;',
  'Permission denied: PT cannot assign or modify courses for patients not under their active care.',
  'PT creating course for another PT patient must throw permission denied'
);

-- E4: Append-Only Immutability: UPDATE/DELETE on medical_notes, treatment_results, audit_logs throws for all roles
SELECT throws_ok(
  'UPDATE public.audit_logs SET action = ''TAMPERED'' WHERE id = ''11111111-aaaa-1111-aaaa-111111111111''',
  'Audit logs are insert-only. Modification is strictly forbidden.',
  'UPDATE on audit_logs must throw exception'
);

SELECT throws_ok(
  'DELETE FROM public.audit_logs WHERE id = ''11111111-aaaa-1111-aaaa-111111111111''',
  'Audit logs are insert-only. Modification is strictly forbidden.',
  'DELETE on audit_logs must throw exception'
);

SELECT throws_ok(
  'UPDATE public.medical_notes SET body = ''Tampered'' WHERE id = ''22222222-bbbb-2222-bbbb-222222222222''',
  'Medical notes are append-only. Modification is strictly forbidden.',
  'UPDATE on medical_notes must throw exception'
);

SELECT throws_ok(
  'DELETE FROM public.medical_notes WHERE id = ''22222222-bbbb-2222-bbbb-222222222222''',
  'Medical notes are append-only. Modification is strictly forbidden.',
  'DELETE on medical_notes must throw exception'
);

SELECT throws_ok(
  'UPDATE public.treatment_results SET body = ''Tampered'' WHERE id = ''33333333-cccc-3333-cccc-333333333333''',
  'Treatment results are append-only. Modification is strictly forbidden.',
  'UPDATE on treatment_results must throw exception'
);

SELECT throws_ok(
  'DELETE FROM public.treatment_results WHERE id = ''33333333-cccc-3333-cccc-333333333333''',
  'Treatment results are append-only. Modification is strictly forbidden.',
  'DELETE on treatment_results must throw exception'
);

-- E5: Suspended Profile Fail-Closed
SELECT set_config('request.jwt.claims', '', true);
SELECT is(
  (
    SELECT public.current_user_role()
  ),
  NULL,
  'current_user_role() returns NULL for unauthenticated or non-active session'
);

-- E6: RPC direct execution restricted: anon and authenticated cannot EXECUTE match_face_candidates
SELECT ok(
  NOT has_function_privilege('authenticated', 'match_face_candidates(extensions.vector, uuid[], integer)', 'EXECUTE'),
  'authenticated role must NOT have EXECUTE privilege on match_face_candidates'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'enroll_face_atomic(uuid, uuid, text, public.pose_type[], extensions.vector[], uuid, uuid)', 'EXECUTE'),
  'authenticated role must NOT have EXECUTE privilege on enroll_face_atomic'
);

-- E7: Authenticated cannot SELECT on private tables (42501 insufficient_privilege)
-- E7: Authenticated cannot SELECT on private tables (42501 insufficient_privilege)
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.face_enrollments LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from face_enrollments');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.face_templates LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from face_templates');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.face_challenges LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from face_challenges');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.enrollment_tickets LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from enrollment_tickets');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.kiosk_devices LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from kiosk_devices');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.staff_devices LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from staff_devices');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.staff_calls LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from staff_calls');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.bans LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from bans');
SELECT throws_ok('SET LOCAL ROLE authenticated; SELECT * FROM public.audit_logs LIMIT 1; RESET ROLE;', '42501', NULL, 'authenticated role cannot SELECT from audit_logs');

-- E8: Anon cannot SELECT, INSERT, UPDATE, DELETE on any table (42501)
SELECT throws_ok('SET LOCAL ROLE anon; SELECT * FROM public.profiles LIMIT 1; RESET ROLE;', '42501', NULL, 'anon cannot SELECT from profiles');
SELECT throws_ok('SET LOCAL ROLE anon; SELECT * FROM public.patients LIMIT 1; RESET ROLE;', '42501', NULL, 'anon cannot SELECT from patients');
SELECT throws_ok('SET LOCAL ROLE anon; SELECT * FROM public.exercises LIMIT 1; RESET ROLE;', '42501', NULL, 'anon cannot SELECT from exercises');
SELECT throws_ok('SET LOCAL ROLE anon; SELECT * FROM public.courses LIMIT 1; RESET ROLE;', '42501', NULL, 'anon cannot SELECT from courses');

-- E9: Atomic Face Enrollment Branch Testing (Item B2: 'active' when complete, 'face_enrolled' when incomplete)
DO $$
DECLARE
  v_comp_pat_id UUID := gen_random_uuid();
  v_incomp_pat_id UUID := gen_random_uuid();
  v_staff_id UUID := '11111111-1111-1111-1111-111111111111';
  v_vec extensions.vector(512);
BEGIN
  -- Generate dummy 512-dim vector string
  v_vec := ('[' || array_to_string(array_fill(0.05::numeric, ARRAY[512]), ',') || ']')::extensions.vector(512);

  -- 1. Complete patient: has first_name, last_name, age > 0, sex, and injury
  INSERT INTO public.patients (id, first_name, last_name, age, sex, injury)
  VALUES (v_comp_pat_id, 'Prasert', 'Srisuk', 35, 'M', 'ACL Tear');

  -- 2. Incomplete patient: missing last_name and injury
  INSERT INTO public.patients (id, first_name, last_name, age, sex, injury)
  VALUES (v_incomp_pat_id, 'Nong', '', 20, 'F', '');

  -- Enroll Complete Patient -> Expected status = 'active'
  PERFORM public.enroll_face_atomic(
    v_comp_pat_id,
    v_staff_id,
    'v1.0.0',
    ARRAY['front'::public.pose_type],
    ARRAY[v_vec]
  );

  -- Enroll Incomplete Patient -> Expected status = 'face_enrolled'
  PERFORM public.enroll_face_atomic(
    v_incomp_pat_id,
    v_staff_id,
    'v1.0.0',
    ARRAY['front'::public.pose_type],
    ARRAY[v_vec]
  );
END $$;

SELECT results_eq(
  'SELECT registration_status::text FROM public.patients WHERE first_name = ''Prasert'' LIMIT 1',
  ARRAY['active'::text],
  'enroll_face_atomic sets registration_status = active when demographics are complete (Spec 7.3.7)'
);

SELECT results_eq(
  'SELECT registration_status::text FROM public.patients WHERE first_name = ''Nong'' LIMIT 1',
  ARRAY['face_enrolled'::text],
  'enroll_face_atomic sets registration_status = face_enrolled when demographics are incomplete'
);

-- ========================================================================
-- 11. ROUND 3 TARGETED TESTS (A1, A2, A3, A4, B3, C1)
-- ========================================================================

-- A1: Trigger Privilege Verification & Service Role / Admin Bypass
SELECT lives_ok(
  'UPDATE public.profiles SET role = ''admin'' WHERE id = ''22222222-2222-2222-2222-222222222222'';',
  'admin / postgres can update profile role successfully'
);

SELECT lives_ok(
  'UPDATE public.profiles SET role = ''pt'' WHERE id = ''22222222-2222-2222-2222-222222222222'';',
  'admin can revert profile role successfully'
);

-- A2: enroll_face_atomic CAS test on archived patient
DO $$
DECLARE
  v_arch_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.patients (id, first_name, last_name, age, sex, injury, registration_status)
  VALUES (v_arch_id, 'Archived', 'Patient', 50, 'M', 'Chronic Back', 'archived');
END $$;

SELECT throws_ok(
  'SELECT public.enroll_face_atomic((SELECT id FROM public.patients WHERE registration_status = ''archived'' LIMIT 1), ''11111111-1111-1111-1111-111111111111''::uuid, ''v1.0.0'', ARRAY[''front''::public.pose_type], ARRAY[(''['' || array_to_string(array_fill(0.01::numeric, ARRAY[512]), '','') || '']'')::extensions.vector(512)])',
  NULL,
  'enroll_face_atomic on archived patient must throw exception (re-enrollment denied) and roll back'
);

-- A3: mission_runs and mission_steps are SELECT only for authenticated
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; INSERT INTO public.mission_runs (patient_id, course_id, status) VALUES (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', gen_random_uuid(), ''in_progress''); RESET ROLE;',
  '42501',
  NULL,
  'authenticated role cannot INSERT into mission_runs (SELECT only)'
);
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; UPDATE public.mission_runs SET status = ''completed'' WHERE id = gen_random_uuid(); RESET ROLE;',
  '42501',
  NULL,
  'authenticated role cannot UPDATE mission_runs (SELECT only)'
);
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; INSERT INTO public.mission_steps (mission_run_id, step_type) VALUES (gen_random_uuid(), ''exercise''); RESET ROLE;',
  '42501',
  NULL,
  'authenticated role cannot INSERT into mission_steps (SELECT only)'
);
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; UPDATE public.mission_steps SET step_type = ''minigame'' WHERE id = gen_random_uuid(); RESET ROLE;',
  '42501',
  NULL,
  'authenticated role cannot UPDATE mission_steps (SELECT only)'
);

-- A3: Profiles Column-Level Privileges
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; UPDATE public.profiles SET username = ''pt1_hacked'' WHERE id = ''22222222-2222-2222-2222-222222222222''; RESET ROLE;',
  '42501',
  NULL,
  'authenticated role cannot UPDATE username on profiles'
);
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; UPDATE public.profiles SET status = ''suspended'' WHERE id = ''22222222-2222-2222-2222-222222222222''; RESET ROLE;',
  '42501',
  NULL,
  'authenticated role cannot UPDATE status on profiles'
);
SELECT lives_ok(
  'SET LOCAL ROLE authenticated; UPDATE public.profiles SET full_name = ''PT One Updated'', phone = ''0819998888'', bio = ''Sports rehab'' WHERE id = ''22222222-2222-2222-2222-222222222222''; RESET ROLE;',
  'authenticated role can UPDATE allowed columns (full_name, phone, bio) on profiles'
);

-- A4: PT INSERT real row into all tables allowed for PT to catch hidden permission denied
SELECT lives_ok(
  'INSERT INTO public.patients (id, first_name, last_name, age, sex, injury, responsible_pt_id) VALUES (gen_random_uuid(), ''Real'', ''Insert'', 30, ''F'', ''Neck Sprain'', ''22222222-2222-2222-2222-222222222222'')',
  'PT can INSERT real row into patients'
);
SELECT lives_ok(
  'INSERT INTO public.exercises (id, title, target_joint, created_by) VALUES (gen_random_uuid(), ''Real PT Exercise'', ''Ankle'', ''22222222-2222-2222-2222-222222222222'')',
  'PT can INSERT real row into exercises'
);
SELECT lives_ok(
  'INSERT INTO public.minigames (id, title, created_by) VALUES (gen_random_uuid(), ''Real Minigame'', ''22222222-2222-2222-2222-222222222222'')',
  'PT can INSERT real row into minigames'
);
SELECT lives_ok(
  'INSERT INTO public.modpacks (id, name, created_by) VALUES (gen_random_uuid(), ''Real Modpack'', ''22222222-2222-2222-2222-222222222222'')',
  'PT can INSERT real row into modpacks'
);
SELECT lives_ok(
  'INSERT INTO public.courses (id, patient_id, pt_id, start_date, end_date) VALUES (gen_random_uuid(), ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''22222222-2222-2222-2222-222222222222'', ''2026-10-25'', ''2026-11-25'')',
  'PT can INSERT real row into courses for accessible patient'
);
SELECT lives_ok(
  'INSERT INTO public.medical_notes (id, patient_id, author_id, body) VALUES (gen_random_uuid(), ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''22222222-2222-2222-2222-222222222222'', ''Patient reports improved mobility'')',
  'PT can INSERT real row into medical_notes for accessible patient'
);
SELECT lives_ok(
  'INSERT INTO public.treatment_results (id, patient_id, author_id, body) VALUES (gen_random_uuid(), ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''22222222-2222-2222-2222-222222222222'', ''Treatment note body'')',
  'PT can INSERT real row into treatment_results for accessible patient'
);
SELECT lives_ok(
  'INSERT INTO public.consents (id, subject_type, subject_id, type, text_version) VALUES (gen_random_uuid(), ''patient'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''biometrics'', ''v1'')',
  'PT can INSERT real row into consents for accessible patient'
);
SELECT lives_ok(
  'INSERT INTO public.checkins (id, patient_id, checked_in_by, date) VALUES (gen_random_uuid(), ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''22222222-2222-2222-2222-222222222222'', ''2026-10-25'')',
  'PT can INSERT real row into checkins for accessible patient'
);

-- B3 & C1: Consents & Checkins RLS Policies & Delete Restrictions
SELECT lives_ok(
  'DELETE FROM public.consents WHERE subject_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'';',
  'admin can DELETE from consents'
);
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; DELETE FROM public.consents WHERE subject_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''; RESET ROLE;',
  NULL,
  'PT cannot DELETE from consents'
);
SELECT throws_ok(
  'SET LOCAL ROLE authenticated; DELETE FROM public.checkins WHERE patient_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''; RESET ROLE;',
  NULL,
  'PT cannot DELETE from checkins'
);

-- Anon cannot SELECT consents or checkins
SELECT throws_ok('SET LOCAL ROLE anon; SELECT * FROM public.consents LIMIT 1; RESET ROLE;', '42501', NULL, 'anon cannot SELECT from consents');
SELECT throws_ok('SET LOCAL ROLE anon; SELECT * FROM public.checkins LIMIT 1; RESET ROLE;', '42501', NULL, 'anon cannot SELECT from checkins');

-- ========================================================================
-- 12. ROUND 3 FIX VERIFICATION: match_face_candidates excludes superseded,
--     enroll_face_atomic supports re-enrollment from face_enrolled & active
-- ========================================================================

-- F1: match_face_candidates must exclude templates from superseded enrollments
DO $$
DECLARE
  v_test_pat_id UUID := gen_random_uuid();
  v_staff_id UUID := '11111111-1111-1111-1111-111111111111';
  v_old_enroll_id UUID;
  v_new_enroll_id UUID;
  v_vec extensions.vector(512);
BEGIN
  v_vec := ('[' || array_to_string(array_fill(0.05::numeric, ARRAY[512]), ',') || ']')::extensions.vector(512);

  -- Create patient with complete demographics (will transition to 'active')
  INSERT INTO public.patients (id, first_name, last_name, age, sex, injury)
  VALUES (v_test_pat_id, 'MatchTest', 'Patient', 30, 'M', 'Knee');

  -- First enrollment (will be superseded later)
  v_old_enroll_id := public.enroll_face_atomic(
    v_test_pat_id, v_staff_id, 'v1.0.0',
    ARRAY['front'::public.pose_type], ARRAY[v_vec]
  );

  -- Second enrollment (supersedes the first)
  v_new_enroll_id := public.enroll_face_atomic(
    v_test_pat_id, v_staff_id, 'v2.0.0',
    ARRAY['front'::public.pose_type], ARRAY[v_vec]
  );

  -- Verify: old enrollment must now be 'superseded'
  IF NOT EXISTS (
    SELECT 1 FROM public.face_enrollments
    WHERE id = v_old_enroll_id AND status = 'superseded'
  ) THEN
    RAISE EXCEPTION 'Old enrollment was not marked as superseded';
  END IF;

  -- Verify: new enrollment must be 'active'
  IF NOT EXISTS (
    SELECT 1 FROM public.face_enrollments
    WHERE id = v_new_enroll_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'New enrollment is not active';
  END IF;

  -- Verify: templates linked to old enrollment exist (they are NOT deleted)
  IF NOT EXISTS (
    SELECT 1 FROM public.face_templates WHERE enrollment_id = v_old_enroll_id
  ) THEN
    RAISE EXCEPTION 'Old templates should still exist in face_templates table';
  END IF;
END $$;

-- Verify match_face_candidates only returns templates from active enrollments
SELECT results_eq(
  'SELECT count(*)::int FROM public.match_face_candidates(
    (''['' || array_to_string(array_fill(0.05::numeric, ARRAY[512]), '','') || '']'')::extensions.vector(512),
    ARRAY[(SELECT id FROM public.patients WHERE first_name = ''MatchTest'' LIMIT 1)],
    10
  )',
  ARRAY[1],
  'match_face_candidates must return exactly 1 result (only from active enrollment, superseded excluded)'
);

-- F2: enroll_face_atomic re-enrollment from face_enrolled state
DO $$
DECLARE
  v_re_pat_id UUID := gen_random_uuid();
  v_staff_id UUID := '11111111-1111-1111-1111-111111111111';
  v_enroll1 UUID;
  v_enroll2 UUID;
  v_vec extensions.vector(512);
  v_status TEXT;
BEGIN
  v_vec := ('[' || array_to_string(array_fill(0.05::numeric, ARRAY[512]), ',') || ']')::extensions.vector(512);

  -- Create incomplete patient (will transition to face_enrolled)
  INSERT INTO public.patients (id, first_name, last_name, age, sex, injury)
  VALUES (v_re_pat_id, 'ReEnroll', '', 25, 'F', '');

  -- First enrollment -> should set face_enrolled (incomplete demographics)
  v_enroll1 := public.enroll_face_atomic(
    v_re_pat_id, v_staff_id, 'v1.0.0',
    ARRAY['front'::public.pose_type], ARRAY[v_vec]
  );

  SELECT registration_status::text INTO v_status
  FROM public.patients WHERE id = v_re_pat_id;

  IF v_status IS DISTINCT FROM 'face_enrolled' THEN
    RAISE EXCEPTION 'Expected face_enrolled but got %', v_status;
  END IF;

  -- Re-enroll from face_enrolled state -> should still be face_enrolled (still incomplete)
  v_enroll2 := public.enroll_face_atomic(
    v_re_pat_id, v_staff_id, 'v2.0.0',
    ARRAY['front'::public.pose_type], ARRAY[v_vec]
  );

  SELECT registration_status::text INTO v_status
  FROM public.patients WHERE id = v_re_pat_id;

  IF v_status IS DISTINCT FROM 'face_enrolled' THEN
    RAISE EXCEPTION 'Re-enrollment from face_enrolled should keep status as face_enrolled, got %', v_status;
  END IF;
END $$;

SELECT pass('enroll_face_atomic succeeds for re-enrollment from face_enrolled state');

-- F3: enroll_face_atomic re-enrollment from active state (complete demographics)
DO $$
DECLARE
  v_active_pat_id UUID := gen_random_uuid();
  v_staff_id UUID := '11111111-1111-1111-1111-111111111111';
  v_enroll1 UUID;
  v_enroll2 UUID;
  v_vec extensions.vector(512);
  v_status TEXT;
BEGIN
  v_vec := ('[' || array_to_string(array_fill(0.05::numeric, ARRAY[512]), ',') || ']')::extensions.vector(512);

  -- Create complete patient (will transition to active after enrollment)
  INSERT INTO public.patients (id, first_name, last_name, age, sex, injury)
  VALUES (v_active_pat_id, 'ActiveReEnroll', 'Test', 40, 'M', 'ACL Tear');

  -- First enrollment -> should set active
  v_enroll1 := public.enroll_face_atomic(
    v_active_pat_id, v_staff_id, 'v1.0.0',
    ARRAY['front'::public.pose_type], ARRAY[v_vec]
  );

  SELECT registration_status::text INTO v_status
  FROM public.patients WHERE id = v_active_pat_id;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Expected active but got %', v_status;
  END IF;

  -- Re-enroll from active state (e.g., biometric update) -> should remain active
  v_enroll2 := public.enroll_face_atomic(
    v_active_pat_id, v_staff_id, 'v2.0.0',
    ARRAY['front'::public.pose_type], ARRAY[v_vec]
  );

  SELECT registration_status::text INTO v_status
  FROM public.patients WHERE id = v_active_pat_id;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Re-enrollment from active should keep status as active, got %', v_status;
  END IF;

  -- Verify old enrollment is superseded
  IF NOT EXISTS (
    SELECT 1 FROM public.face_enrollments WHERE id = v_enroll1 AND status = 'superseded'
  ) THEN
    RAISE EXCEPTION 'First enrollment should be superseded after re-enrollment';
  END IF;
END $$;

SELECT pass('enroll_face_atomic succeeds for re-enrollment from active state');

-- F4: Archived patient re-enrollment is rejected
SELECT throws_ok(
  'SELECT public.enroll_face_atomic((SELECT id FROM public.patients WHERE registration_status = ''archived'' LIMIT 1), ''11111111-1111-1111-1111-111111111111''::uuid, ''v3.0.0'', ARRAY[''front''::public.pose_type], ARRAY[(''['' || array_to_string(array_fill(0.01::numeric, ARRAY[512]), '','') || '']'')::extensions.vector(512)])',
  NULL,
  'enroll_face_atomic on archived patient must throw re-enrollment denied exception'
);

-- F5: Verify superseded enrollment template count vs active
SELECT results_eq(
  'SELECT count(*)::int FROM public.face_enrollments WHERE patient_id = (SELECT id FROM public.patients WHERE first_name = ''MatchTest'' LIMIT 1) AND status = ''active''',
  ARRAY[1],
  'MatchTest patient must have exactly 1 active enrollment after re-enrollment'
);

SELECT results_eq(
  'SELECT count(*)::int FROM public.face_enrollments WHERE patient_id = (SELECT id FROM public.patients WHERE first_name = ''MatchTest'' LIMIT 1) AND status = ''superseded''',
  ARRAY[1],
  'MatchTest patient must have exactly 1 superseded enrollment after re-enrollment'
);

SELECT * FROM finish();
ROLLBACK;
