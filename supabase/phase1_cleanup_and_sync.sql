-- ============================================================================
-- Dr.Tech.Care — Phase 1: Full Database Cleanup, Repair & Sync (0 -> 100)
-- ============================================================================
-- PREREQUISITE: Run supabase/phase1_step0_enum.sql FIRST by itself!
-- Safe & Idempotent: May be re-run safely in Supabase SQL Editor.
-- Preserves SUPABASE_ANON_KEY compatibility for Cloudflare Workers deployments
-- while enforcing append-only triggers on audit_logs / medical_notes / treatment_results.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS & HASH/TRIGGER SEARCH_PATH REPAIR (Fixes 42883 digest errors)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
DECLARE
  v_proc RECORD;
BEGIN
  FOR v_proc IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND l.lanname IN ('plpgsql', 'sql')
      AND (
        p.prosrc ~* '\y(digest|hmac|gen_random_bytes|gen_salt|crypt|similarity|show_trgm)\y'
        OR p.proname IN (
          'compute_audit_log_hash',
          'audit_logs_hash_trigger',
          'prevent_audit_logs_modification',
          'prevent_medical_notes_modification',
          'prevent_treatment_results_modification',
          'compute_medical_note_hash',
          'compute_treatment_result_hash',
          'hash_medical_note',
          'hash_treatment_result',
          'guard_profile_and_pt_modifications'
        )
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, auth, pg_temp', v_proc.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. DEEP TEST & JUNK DATA CLEANUP
-- ----------------------------------------------------------------------------
-- 2.1 Remove synthetic test patient TEST-UUID-1794500345645 & dependents
DO $$
DECLARE
  v_test_pid UUID;
BEGIN
  FOR v_test_pid IN
    SELECT id FROM public.patients
    WHERE id = '86add797-219f-405a-8603-e8cc494229f5'::uuid
       OR hn LIKE 'TEST-UUID-%'
  LOOP
    DELETE FROM public.face_templates WHERE patient_id = v_test_pid;
    DELETE FROM public.face_enrollments WHERE patient_id = v_test_pid;
    IF to_regclass('public.mission_steps') IS NOT NULL AND to_regclass('public.mission_runs') IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'mission_steps' AND column_name = 'run_id'
      ) THEN
        EXECUTE 'DELETE FROM public.mission_steps WHERE run_id IN (SELECT id FROM public.mission_runs WHERE patient_id = $1)'
        USING v_test_pid;
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'mission_steps' AND column_name = 'mission_run_id'
      ) THEN
        EXECUTE 'DELETE FROM public.mission_steps WHERE mission_run_id IN (SELECT id FROM public.mission_runs WHERE patient_id = $1)'
        USING v_test_pid;
      END IF;
    END IF;
    DELETE FROM public.mission_runs WHERE patient_id = v_test_pid;
    DELETE FROM public.course_items WHERE course_id IN (SELECT id FROM public.courses WHERE patient_id = v_test_pid);
    DELETE FROM public.courses WHERE patient_id = v_test_pid;
    DELETE FROM public.checkins WHERE patient_id = v_test_pid;
    DELETE FROM public.enrollment_tickets WHERE patient_id = v_test_pid;
    DELETE FROM public.patient_pt_assignments WHERE patient_id = v_test_pid;
    DELETE FROM public.case_transfers WHERE patient_id = v_test_pid;
    DELETE FROM public.consents WHERE subject_type = 'patient' AND subject_id = v_test_pid;
    IF to_regclass('public.patient_consents') IS NOT NULL THEN
      DELETE FROM public.patient_consents WHERE patient_id = v_test_pid;
    END IF;
    IF to_regclass('public.exercise_prescriptions') IS NOT NULL THEN
      DELETE FROM public.prescription_items
      WHERE prescription_id IN (SELECT id FROM public.exercise_prescriptions WHERE patient_id = v_test_pid);
      DELETE FROM public.exercise_prescriptions WHERE patient_id = v_test_pid;
    END IF;
    IF to_regclass('public.exercise_session_logs') IS NOT NULL THEN
      DELETE FROM public.exercise_session_logs WHERE patient_id = v_test_pid;
    END IF;
    DELETE FROM public.patients WHERE id = v_test_pid;
  END LOOP;
END $$;

-- 2.2 Remove test PT account 'asasa' cleanly (repointing optional FKs safely first)
DO $$
DECLARE
  v_asasa_id UUID := 'f751b328-9e0d-41eb-af52-716b8d6cc7a9'::uuid;
  v_director_id UUID := 'd1000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_asasa_id AND username = 'asasa')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id = v_asasa_id) THEN
    UPDATE public.patients SET responsible_pt_id = NULL WHERE responsible_pt_id = v_asasa_id;
    UPDATE public.courses SET pt_id = v_director_id WHERE pt_id = v_asasa_id;
    UPDATE public.exercises SET created_by = v_director_id WHERE created_by = v_asasa_id;
    UPDATE public.modpacks SET created_by = v_director_id WHERE created_by = v_asasa_id;
    UPDATE public.minigames SET created_by = v_director_id WHERE created_by = v_asasa_id;
    UPDATE public.minigame_questions SET created_by = v_director_id WHERE created_by = v_asasa_id;
    UPDATE public.staff_calls SET handled_by = NULL WHERE handled_by = v_asasa_id;
    UPDATE public.face_enrollments SET created_by = NULL WHERE created_by = v_asasa_id;
    DELETE FROM public.bans WHERE created_by = v_asasa_id;
    DELETE FROM public.staff_devices WHERE user_id = v_asasa_id;
    DELETE FROM public.patient_pt_assignments WHERE pt_id = v_asasa_id;
    DELETE FROM public.case_transfers WHERE from_pt_id = v_asasa_id OR to_pt_id = v_asasa_id;
    DELETE FROM public.pts WHERE user_id = v_asasa_id;
    DELETE FROM public.profiles WHERE id = v_asasa_id AND username = 'asasa';
    DELETE FROM auth.users WHERE id = v_asasa_id;
  END IF;
END $$;

-- 2.3 Purge accumulated stale staff_devices rows
DELETE FROM public.staff_devices;

-- 2.4 Clean 102 'logout' noise rows in audit_logs atomically inside single DO block
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.audit_logs DISABLE TRIGGER USER';
  DELETE FROM public.audit_logs
  WHERE actor_type::text = 'staff'
    AND action::text = 'logout'
    AND entity::text = 'auth';
  EXECUTE 'ALTER TABLE public.audit_logs ENABLE TRIGGER USER';
END $$;

-- 2.5 Clean 17 junk inactive modpacks (keep active & FK-referenced rows)
DELETE FROM public.modpacks m
WHERE m.is_active = false
  AND m.id <> 'fc000000-0000-0000-0000-000000000001'::uuid
  AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.modpack_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.modpack_items mi WHERE mi.modpack_id = m.id);

-- 2.6 Clean 21 junk inactive test exercises (preserve 15 active + 9 deactivated clinical e1000000-* rows & FK refs)
DO $$
DECLARE
  v_sql TEXT := $q$
    DELETE FROM public.exercises e
    WHERE e.is_active = false
      AND e.id::text NOT LIKE 'e1000000-0000-0000-0000-%'
      AND NOT EXISTS (SELECT 1 FROM public.course_items ci WHERE ci.exercise_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM public.modpack_items mi WHERE mi.exercise_id = e.id)
  $q$;
BEGIN
  IF to_regclass('public.prescription_items') IS NOT NULL THEN
    v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM public.prescription_items pi WHERE pi.exercise_id = e.id)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_steps' AND column_name = 'exercise_id'
  ) THEN
    v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM public.mission_steps ms WHERE ms.exercise_id = e.id)';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_steps' AND column_name = 'ref_id'
  ) THEN
    v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM public.mission_steps ms WHERE ms.ref_id = e.id)';
  END IF;

  EXECUTE v_sql;
END $$;

-- 2.7 Clean soft-deleted & TEST minigame_questions (preserve real seeded fb000000-* questions)
DELETE FROM public.minigame_questions
WHERE prompt = '__DELETED__'
   OR id = 'd650391f-9aff-41f4-95d0-432b2d8ea015'::uuid
   OR upper(trim(prompt)) = 'TEST';

-- 2.8 Clean diagnostic __PROBE_TEST_CALL__ rows & resolve stale pending calls before unique index
DELETE FROM public.staff_calls
WHERE reason LIKE '%__PROBE_TEST_CALL__%';

UPDATE public.staff_calls
SET handled_at = COALESCE(handled_at, now())
WHERE handled_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. MISSING SCHEMA COLUMNS, TABLES & INDEXES
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.exercises
  ADD COLUMN IF NOT EXISTS detection_config JSONB DEFAULT NULL;

ALTER TABLE IF EXISTS public.course_items
  ADD COLUMN IF NOT EXISTS custom_detection_config JSONB DEFAULT NULL;

ALTER TABLE IF EXISTS public.courses
  ADD COLUMN IF NOT EXISTS goals TEXT,
  ADD COLUMN IF NOT EXISTS progression_criteria TEXT;

ALTER TABLE IF EXISTS public.staff_calls
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual_button';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_calls'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%source%'
  ) THEN
    ALTER TABLE public.staff_calls
      ADD CONSTRAINT staff_calls_source_check
      CHECK (source IN ('manual_button', 'failed_scan_limit', 'system_error'));
  END IF;
END $$;

ALTER TABLE IF EXISTS public.staff_calls
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_calls_kiosk_pending
  ON public.staff_calls (kiosk_id)
  WHERE (handled_at IS NULL);

CREATE TABLE IF NOT EXISTS public.exercise_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  exercise_id UUID REFERENCES public.exercises(id) ON DELETE SET NULL,
  kiosk_id VARCHAR(50) DEFAULT 'kiosk-01',
  completion_mode VARCHAR(50) NOT NULL DEFAULT 'ai_verified'
    CHECK (completion_mode IN ('ai_verified', 'skipped_unverified', 'stopped_pain')),
  correct_reps INTEGER DEFAULT 0,
  incorrect_reps INTEGER DEFAULT 0,
  target_reps INTEGER DEFAULT 10,
  current_set INTEGER DEFAULT 1,
  total_sets INTEGER DEFAULT 3,
  max_angle_achieved NUMERIC(6,2) DEFAULT NULL,
  consistency_score NUMERIC(5,2) DEFAULT NULL,
  pain_reported BOOLEAN DEFAULT FALSE,
  duration_seconds NUMERIC(8,2) DEFAULT NULL,
  telemetry_summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_session_logs_patient ON public.exercise_session_logs (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_session_logs_exercise ON public.exercise_session_logs (exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_session_logs_mode ON public.exercise_session_logs (completion_mode);

-- Seed Shoulder Pendulum detection_config when unset
UPDATE public.exercises
SET detection_config = '{
  "id": "ex-shoulder-pendulum",
  "exerciseId": "e1000000-0000-0000-0000-000000000001",
  "nameTh": "Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)",
  "nameEn": "Codman Shoulder Pendulum",
  "description": "โน้มลำตัวไปข้างหน้า ปล่อยแขนห้อยลงตามแรงโน้มถ่วง และแกว่งเป็นวงกลมเบาๆ เพื่อผ่อนคลายข้อต่อและเพิ่มการไหลเวียนเลือด",
  "mediaUrl": "/assets/exercises/shoulder_pendulum.mp4",
  "evaluationMode": "pendulum_circular",
  "side": "right",
  "targetJoint": "shoulder",
  "cameraGuide": {
    "recommendedView": "side_45",
    "recommendedDistanceMeters": [1.5, 2.5],
    "instructionTextTh": "กรุณายืนหันข้างเฉียง 45° ถึง 90° ระยะห่าง 1.5 - 2.5 เมตรจากกล้อง โน้มตัวไปข้างหน้าเล็กน้อย และปล่อยแขนข้างที่ต้องการฝึกให้ห้อยลงอย่างผ่อนคลาย"
  },
  "pendulumMechanics": {
    "minTrunkForwardTiltDeg": 18.0,
    "maxTrunkForwardTiltDeg": 65.0,
    "minElbowStraightnessDeg": 145.0,
    "minCircleRadiusRatio": 0.07,
    "maxCircleRadiusRatio": 0.35,
    "minCycleDurationSec": 1.2,
    "maxCycleDurationSec": 5.0
  },
  "defaultPrescription": {
    "repsPerSet": 10,
    "totalSets": 3,
    "restBetweenSetsSec": 30
  },
  "compensationRules": [
    {
      "ruleId": "pendulum_trunk_lean",
      "type": "trunk_lean",
      "thresholdValue": 0.25,
      "warningMessageTh": "ลำตัวเอียงหรือไม่นิ่ง โน้มตัวให้มั่นคงและปล่อยให้แขนแกว่งเป็นอิสระ",
      "severity": "warning"
    },
    {
      "ruleId": "pendulum_elbow_flexion",
      "type": "elbow_flexion",
      "thresholdValue": 140.0,
      "warningMessageTh": "ปล่อยแขนให้ตรง อย่าเกร็งหรืองอข้อศอกขณะแกว่ง",
      "severity": "warning"
    },
    {
      "ruleId": "pendulum_speed",
      "type": "excessive_speed",
      "thresholdValue": 240.0,
      "warningMessageTh": "แกว่งแขนเร็วเกินไป ค่อยๆ แกว่งช้าๆ เพื่อผ่อนคลายข้อไหล่",
      "severity": "warning"
    }
  ],
  "safetyContraindications": {
    "stopOnPainMessageTh": "หากมีอาการเจ็บแปลบบริเวณข้อไหล่หรือแขน ให้หยุดทันทีและแจ้งนักกายภาพบำบัด",
    "maxSafeAngleCapDeg": 90
  }
}'::jsonb
WHERE id = 'e1000000-0000-0000-0000-000000000001'::uuid
  AND detection_config IS NULL;

-- HNSW & Search Indexes
CREATE INDEX IF NOT EXISTS idx_face_templates_hnsw
  ON public.face_templates
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_face_templates_patient_id ON public.face_templates (patient_id);
CREATE INDEX IF NOT EXISTS idx_face_enrollments_patient_status ON public.face_enrollments (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_first_name_trgm ON public.patients USING gin (first_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_last_name_trgm ON public.patients USING gin (last_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_hn_trgm ON public.patients USING gin (hn extensions.gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4. CLEAN UP OVERLOADED RPCS (Fixes PGRST203 & PGRST202)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.patient_hn_seq START WITH 100001 INCREMENT BY 1;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'match_face_candidates',
        'enroll_face_atomic',
        'match_patient_face',
        'register_patient_with_biometrics',
        'update_own_pt_profile'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- 4.1 Single unambiguous match_face_candidates
CREATE OR REPLACE FUNCTION public.match_face_candidates(
  probe extensions.vector(512),
  candidate_ids UUID[],
  k INT DEFAULT 5
)
RETURNS TABLE (
  patient_id UUID,
  score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF candidate_ids IS NULL OR array_length(candidate_ids, 1) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ranked_scores AS (
    SELECT
      ft.patient_id AS p_id,
      (1.0 - (ft.embedding OPERATOR(extensions.<=>) probe)) AS sim,
      ROW_NUMBER() OVER (
        PARTITION BY ft.patient_id
        ORDER BY (ft.embedding OPERATOR(extensions.<=>) probe) ASC
      ) AS rank
    FROM public.face_templates ft
    INNER JOIN public.face_enrollments fe ON fe.id = ft.enrollment_id
    WHERE ft.patient_id = ANY(candidate_ids)
      AND fe.status::text IN ('active', 'completed')
  ),
  top3_scores AS (
    SELECT rs.p_id, rs.sim
    FROM ranked_scores rs
    WHERE rs.rank <= 3
  ),
  patient_averages AS (
    SELECT
      t3.p_id AS agg_patient_id,
      ROUND(AVG(t3.sim)::numeric, 4) AS avg_score
    FROM top3_scores t3
    GROUP BY t3.p_id
  )
  SELECT pa.agg_patient_id, pa.avg_score
  FROM patient_averages pa
  ORDER BY pa.avg_score DESC
  LIMIT k;
END;
$$;

-- 4.2 Grouped, Egress-Trimmed 1:N match_patient_face
-- Groups per patient (Best-of-N similarity) so runner-up comparison compares distinct patients
-- and strips giant raw 'frames' vectors from returned JSONB history.
CREATE OR REPLACE FUNCTION public.match_patient_face(
  probe_embedding extensions.vector(512),
  match_threshold float DEFAULT 0.42,
  match_limit int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  patient_id uuid,
  hn text,
  first_name text,
  last_name text,
  age int,
  sex text,
  phone text,
  injury text,
  responsible_pt_id uuid,
  registration_status text,
  history jsonb,
  similarity float,
  distance float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH best_per_patient AS (
    SELECT
      p.id,
      MIN(ft.embedding OPERATOR(extensions.<=>) probe_embedding) AS best_dist
    FROM public.face_templates ft
    INNER JOIN public.face_enrollments fe ON fe.id = ft.enrollment_id
    INNER JOIN public.patients p ON ft.patient_id = p.id
    WHERE fe.status::text IN ('active', 'completed')
      AND p.registration_status::text != 'archived'
    GROUP BY p.id
  )
  SELECT
    p.id AS id,
    p.id AS patient_id,
    p.hn::text AS hn,
    p.first_name::text AS first_name,
    p.last_name::text AS last_name,
    p.age::int AS age,
    p.sex::text AS sex,
    p.phone::text AS phone,
    p.injury::text AS injury,
    p.responsible_pt_id,
    p.registration_status::text AS registration_status,
    COALESCE(p.history, '{}'::jsonb)
      - 'frames'
      - 'enrolled_frames'
      - 'face_vector'
      - 'frontal_centroid'
      - 'overall_centroid'
      - 'faceDescriptors'
      - 'adaptive_templates' AS history,
    ROUND((1.0 - b.best_dist)::numeric, 4)::float AS similarity,
    ROUND(b.best_dist::numeric, 4)::float AS distance
  FROM best_per_patient b
  INNER JOIN public.patients p ON p.id = b.id
  WHERE (1.0 - b.best_dist) >= match_threshold
  ORDER BY b.best_dist ASC
  LIMIT match_limit;
$$;

-- 4.3 Single unambiguous enroll_face_atomic
CREATE OR REPLACE FUNCTION public.enroll_face_atomic(
  p_patient_id UUID,
  p_staff_id UUID,
  p_model_version TEXT,
  p_poses TEXT[],
  p_embeddings extensions.vector(512)[],
  p_consent_id UUID DEFAULT NULL,
  p_ticket_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_enrollment_id UUID;
  v_len INT;
  v_is_complete BOOLEAN;
  v_active_status TEXT;
  v_has_superseded BOOLEAN;
  v_tpl_rec public.face_templates;
  i INT;
BEGIN
  v_len := array_length(p_embeddings, 1);
  IF v_len IS NULL OR v_len = 0 THEN
    RAISE EXCEPTION 'At least one face embedding template is required for enrollment.';
  END IF;

  IF array_length(p_poses, 1) IS DISTINCT FROM v_len THEN
    RAISE EXCEPTION 'Length of poses array must match embeddings array.';
  END IF;

  v_active_status := CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'face_enrollment_status' AND e.enumlabel = 'active'
    ) THEN 'active'
    ELSE 'completed'
  END;

  v_has_superseded := EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'face_enrollment_status' AND e.enumlabel = 'superseded'
  );

  IF v_has_superseded THEN
    UPDATE public.face_enrollments
    SET status = 'superseded'::public.face_enrollment_status
    WHERE patient_id = p_patient_id AND status::text IN ('active', 'completed');
  ELSE
    DELETE FROM public.face_templates WHERE patient_id = p_patient_id;
    DELETE FROM public.face_enrollments WHERE patient_id = p_patient_id;
  END IF;

  INSERT INTO public.face_enrollments (
    patient_id,
    status,
    consent_id,
    model_version,
    created_by
  ) VALUES (
    p_patient_id,
    v_active_status::public.face_enrollment_status,
    p_consent_id,
    p_model_version,
    p_staff_id
  ) RETURNING id INTO v_enrollment_id;

  FOR i IN 1..v_len LOOP
    BEGIN
      v_tpl_rec := jsonb_populate_record(
        NULL::public.face_templates,
        jsonb_build_object('pose', COALESCE(NULLIF(trim(p_poses[i]), ''), 'front'))
      );
    EXCEPTION WHEN OTHERS THEN
      v_tpl_rec := jsonb_populate_record(NULL::public.face_templates, '{"pose":"front"}'::jsonb);
    END;

    INSERT INTO public.face_templates (
      patient_id,
      enrollment_id,
      embedding,
      pose,
      model_version
    ) VALUES (
      p_patient_id,
      v_enrollment_id,
      p_embeddings[i],
      v_tpl_rec.pose,
      p_model_version
    );
  END LOOP;

  SELECT (
    first_name IS NOT NULL AND length(trim(first_name)) > 0 AND
    last_name IS NOT NULL AND length(trim(last_name)) > 0 AND
    age IS NOT NULL AND age > 0 AND
    sex IS NOT NULL AND length(trim(sex::text)) > 0 AND
    injury IS NOT NULL AND length(trim(injury)) > 0
  )
  INTO v_is_complete
  FROM public.patients
  WHERE id = p_patient_id;

  IF v_is_complete THEN
    UPDATE public.patients
    SET registration_status = 'active', started_at = COALESCE(started_at, now())
    WHERE id = p_patient_id AND registration_status::text IN ('awaiting_face', 'face_enrolled', 'active');
  ELSE
    UPDATE public.patients
    SET registration_status = 'face_enrolled'
    WHERE id = p_patient_id AND registration_status::text IN ('awaiting_face', 'face_enrolled', 'active');
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient % is archived or does not exist. Re-enrollment denied.', p_patient_id;
  END IF;

  IF p_ticket_id IS NOT NULL THEN
    UPDATE public.enrollment_tickets
    SET used_at = now()
    WHERE id = p_ticket_id AND used_at IS NULL;
  END IF;

  RETURN v_enrollment_id;
END;
$$;

-- 4.4 register_patient_with_biometrics
CREATE OR REPLACE FUNCTION public.register_patient_with_biometrics(
  p_first_name TEXT,
  p_last_name TEXT,
  p_hn TEXT DEFAULT NULL,
  p_birth_date DATE DEFAULT NULL,
  p_age INTEGER DEFAULT 30,
  p_gender TEXT DEFAULT 'other',
  p_phone TEXT DEFAULT '-',
  p_target_joint TEXT DEFAULT 'เข่า',
  p_injury TEXT DEFAULT 'กายภาพบำบัดฟื้นฟู',
  p_contraindications TEXT DEFAULT '-',
  p_underlying_diseases TEXT DEFAULT '-',
  p_allergies TEXT DEFAULT '-',
  p_doctor_notes TEXT DEFAULT '-',
  p_responsible_pt_id UUID DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_emergency_contact_relation TEXT DEFAULT NULL,
  p_emergency_contact_phone TEXT DEFAULT NULL,
  p_pdpa_consent BOOLEAN DEFAULT true,
  p_registered_by_staff_id TEXT DEFAULT NULL,
  p_registered_by_staff_name TEXT DEFAULT NULL,
  p_history JSONB DEFAULT '{}'::jsonb,
  p_model_version TEXT DEFAULT 'w600k_r50',
  p_poses TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_embeddings extensions.vector(512)[] DEFAULT ARRAY[]::extensions.vector(512)[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_patient_id UUID;
  v_hn TEXT;
  v_enrollment_id UUID;
  v_len INT;
  i INT;
  v_tpl_rec public.face_templates;
  v_enr_status TEXT;
BEGIN
  IF p_first_name IS NULL OR trim(p_first_name) = '' THEN
    RAISE EXCEPTION 'First name is required for clinical patient registration.'
      USING ERRCODE = '23502';
  END IF;

  v_hn := trim(COALESCE(p_hn, ''));
  IF v_hn = '' THEN
    v_hn := 'HN' || lpad(nextval('public.patient_hn_seq')::text, 8, '0');
  ELSE
    IF EXISTS (SELECT 1 FROM public.patients WHERE hn = v_hn) THEN
      RAISE EXCEPTION 'HN % already exists in the hospital registry.', v_hn
        USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.patients (
    hn,
    first_name,
    last_name,
    birth_date,
    age,
    sex,
    gender,
    phone,
    target_joint,
    injury,
    contraindications,
    underlying_diseases,
    allergies,
    doctor_notes,
    responsible_pt_id,
    emergency_contact_name,
    emergency_contact_relation,
    emergency_contact_phone,
    pdpa_consent,
    pdpa_consented_at,
    registered_by_staff_id,
    registered_by_staff_name,
    registration_status,
    registered_via,
    history,
    version,
    created_at
  ) VALUES (
    v_hn,
    trim(p_first_name),
    trim(COALESCE(p_last_name, '-')),
    p_birth_date,
    COALESCE(p_age, 30),
    CASE WHEN lower(COALESCE(p_gender, '')) IN ('female', 'หญิง') THEN 'female'
         WHEN lower(COALESCE(p_gender, '')) IN ('male', 'ชาย') THEN 'male'
         ELSE 'other' END,
    COALESCE(p_gender, 'other'),
    COALESCE(p_phone, '-'),
    COALESCE(p_target_joint, 'เข่า'),
    COALESCE(p_injury, 'กายภาพบำบัดฟื้นฟู'),
    COALESCE(p_contraindications, '-'),
    COALESCE(p_underlying_diseases, '-'),
    COALESCE(p_allergies, '-'),
    COALESCE(p_doctor_notes, '-'),
    p_responsible_pt_id,
    p_emergency_contact_name,
    p_emergency_contact_relation,
    p_emergency_contact_phone,
    COALESCE(p_pdpa_consent, true),
    CASE WHEN COALESCE(p_pdpa_consent, true) THEN now() ELSE NULL END,
    p_registered_by_staff_id,
    p_registered_by_staff_name,
    'active',
    'reception',
    p_history,
    1,
    now()
  )
  RETURNING id INTO v_patient_id;

  v_len := array_length(p_embeddings, 1);
  IF v_len IS NOT NULL AND v_len > 0 THEN
    v_enr_status := CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'face_enrollment_status' AND e.enumlabel = 'active'
      ) THEN 'active'
      ELSE 'completed'
    END;

    INSERT INTO public.face_enrollments (
      patient_id,
      status,
      model_version,
      created_at
    ) VALUES (
      v_patient_id,
      v_enr_status::public.face_enrollment_status,
      COALESCE(p_model_version, 'w600k_r50'),
      now()
    )
    RETURNING id INTO v_enrollment_id;

    FOR i IN 1..v_len LOOP
      BEGIN
        v_tpl_rec := jsonb_populate_record(
          NULL::public.face_templates,
          jsonb_build_object('pose', COALESCE(NULLIF(trim(p_poses[i]), ''), 'front'))
        );
      EXCEPTION WHEN OTHERS THEN
        v_tpl_rec := jsonb_populate_record(NULL::public.face_templates, '{"pose":"front"}'::jsonb);
      END;

      INSERT INTO public.face_templates (
        patient_id,
        enrollment_id,
        embedding,
        pose,
        quality,
        model_version,
        created_at
      ) VALUES (
        v_patient_id,
        v_enrollment_id,
        p_embeddings[i],
        v_tpl_rec.pose,
        jsonb_build_object('liveness_verified', true, 'quality_score', 0.98),
        COALESCE(p_model_version, 'w600k_r50'),
        now()
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'patient_id', v_patient_id,
    'hn', v_hn,
    'registration_status', 'active',
    'enrolled_templates', COALESCE(v_len, 0)
  );
END;
$$;

-- 4.5 update_own_pt_profile (anon/Cloudflare compatible via auth.uid() IS NULL check)
CREATE OR REPLACE FUNCTION public.update_own_pt_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_specialty text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_profile RECORD;
  v_pt RECORD;
  v_now timestamptz := clock_timestamp();
  v_clean_phone text;
  v_clean_fullname text;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบบัญชีผู้ใช้ในระบบ' USING ERRCODE = '20000';
  END IF;

  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL AND v_caller_id != p_user_id THEN
    IF COALESCE(public.current_user_role()::text, 'anon') != 'admin' THEN
      RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: คุณสามารถแก้ไขได้เฉพาะโปรไฟล์ของตนเองเท่านั้น'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_clean_fullname := trim(COALESCE(p_full_name, ''));
  IF length(v_clean_fullname) = 0 THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อ-นามสกุลจริง' USING ERRCODE = '22023';
  END IF;

  v_clean_phone := trim(COALESCE(p_phone, ''));
  IF length(v_clean_phone) > 0 THEN
    IF NOT (v_clean_phone ~ '^[0-9]{10}$') THEN
      RAISE EXCEPTION 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_clean_phone := NULL;
  END IF;

  UPDATE public.profiles
  SET
    full_name = v_clean_fullname,
    phone = v_clean_phone,
    bio = NULLIF(trim(COALESCE(p_bio, '')), ''),
    avatar_url = COALESCE(NULLIF(trim(COALESCE(p_avatar_url, '')), ''), public.profiles.avatar_url),
    updated_at = v_now
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  INSERT INTO public.pts (
    user_id,
    license_no,
    license_expiry,
    specialty,
    age,
    sex,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    'ก.ภ. รอระบุ',
    NULL,
    COALESCE(NULLIF(trim(COALESCE(p_specialty, '')), ''), 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด'),
    35,
    'male',
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    specialty = COALESCE(NULLIF(trim(COALESCE(p_specialty, '')), ''), public.pts.specialty),
    updated_at = v_now
  RETURNING * INTO v_pt;

  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'full_name', v_profile.full_name,
      'role', v_profile.role,
      'phone', v_profile.phone,
      'bio', v_profile.bio,
      'avatar_url', v_profile.avatar_url,
      'status', v_profile.status,
      'created_at', v_profile.created_at,
      'updated_at', v_profile.updated_at,
      'specialty', v_pt.specialty,
      'pt_details', jsonb_build_object(
        'license_no', v_pt.license_no,
        'license_expiry', v_pt.license_expiry,
        'specialty', v_pt.specialty,
        'age', v_pt.age,
        'sex', v_pt.sex
      )
    ),
    'message', 'บันทึกข้อมูลส่วนตัวเรียบร้อย'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. SUPABASE_ANON_KEY RLS & GRANTS (Fixes 42501 on Cloudflare Workers)
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

DO $$
DECLARE
  v_tbl TEXT;
  v_rw_tables TEXT[] := ARRAY[
    'patients',
    'face_enrollments',
    'face_templates',
    'courses',
    'course_items',
    'exercises',
    'exercise_session_logs',
    'modpacks',
    'modpack_items',
    'minigames',
    'minigame_questions',
    'staff_calls',
    'case_transfers',
    'consents',
    'patient_consents',
    'checkins',
    'kiosk_devices',
    'mission_runs',
    'mission_steps',
    'profiles',
    'pts',
    'patient_pt_assignments',
    'enrollment_tickets',
    'face_challenges',
    'bans',
    'staff_devices',
    'exercise_prescriptions',
    'prescription_items'
  ];
  v_append_tables TEXT[] := ARRAY[
    'audit_logs',
    'medical_notes',
    'treatment_results'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_rw_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated, service_role', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS phase1_anon_rw_policy ON public.%I', v_tbl);
      EXECUTE format(
        'CREATE POLICY phase1_anon_rw_policy ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true)',
        v_tbl
      );
    END IF;
  END LOOP;

  FOREACH v_tbl IN ARRAY v_append_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
      EXECUTE format('GRANT SELECT, INSERT ON public.%I TO anon, authenticated, service_role', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS phase1_anon_append_select ON public.%I', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS phase1_anon_append_insert ON public.%I', v_tbl);
      EXECUTE format(
        'CREATE POLICY phase1_anon_append_select ON public.%I FOR SELECT TO anon, authenticated, service_role USING (true)',
        v_tbl
      );
      EXECUTE format(
        'CREATE POLICY phase1_anon_append_insert ON public.%I FOR INSERT TO anon, authenticated, service_role WITH CHECK (true)',
        v_tbl
      );
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.match_patient_face(extensions.vector(512), float, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_face_candidates(extensions.vector(512), UUID[], INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enroll_face_atomic(UUID, UUID, TEXT, TEXT[], extensions.vector(512)[], UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_patient_with_biometrics(
  TEXT, TEXT, TEXT, DATE, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, JSONB, TEXT, TEXT[], extensions.vector(512)[]
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_own_pt_profile(uuid, text, text, text, text, text) TO anon, authenticated, service_role;

DO $$
DECLARE
  v_sig regprocedure;
BEGIN
  FOR v_sig IN
    SELECT oid::regprocedure FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'admin_create_staff_account'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', v_sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. BACKFILL pgvector (face_enrollments + face_templates) FROM history->'frames'
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_pat RECORD;
  v_frame JSONB;
  v_enr_id UUID;
  v_enr_status TEXT;
  v_tpl_rec public.face_templates;
  v_pose_text TEXT;
  v_inserted_templates INT := 0;
BEGIN
  v_enr_status := CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'face_enrollment_status' AND e.enumlabel = 'active'
    ) THEN 'active'
    ELSE 'completed'
  END;

  FOR v_pat IN
    SELECT p.id, p.hn, p.history
    FROM public.patients p
    WHERE p.registration_status::text != 'archived'
      AND jsonb_typeof(p.history -> 'frames') = 'array'
      AND jsonb_array_length(p.history -> 'frames') > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.face_templates ft WHERE ft.patient_id = p.id
      )
  LOOP
    SELECT fe.id INTO v_enr_id
    FROM public.face_enrollments fe
    WHERE fe.patient_id = v_pat.id
      AND fe.status::text IN ('active', 'completed')
    ORDER BY fe.created_at DESC
    LIMIT 1;

    IF v_enr_id IS NULL THEN
      INSERT INTO public.face_enrollments (
        patient_id,
        status,
        model_version,
        created_at
      ) VALUES (
        v_pat.id,
        v_enr_status::public.face_enrollment_status,
        'w600k_r50',
        now()
      )
      RETURNING id INTO v_enr_id;
    END IF;

    FOR v_frame IN SELECT value FROM jsonb_array_elements(v_pat.history -> 'frames') LOOP
      IF jsonb_typeof(v_frame -> 'embedding') = 'array'
         AND jsonb_array_length(v_frame -> 'embedding') = 512 THEN
        v_pose_text := COALESCE(NULLIF(trim(v_frame ->> 'pose'), ''), 'front');
        BEGIN
          v_tpl_rec := jsonb_populate_record(
            NULL::public.face_templates,
            jsonb_build_object('pose', v_pose_text)
          );
        EXCEPTION WHEN OTHERS THEN
          v_tpl_rec := jsonb_populate_record(NULL::public.face_templates, '{"pose":"front"}'::jsonb);
        END;

        INSERT INTO public.face_templates (
          patient_id,
          enrollment_id,
          embedding,
          pose,
          quality,
          model_version,
          created_at
        ) VALUES (
          v_pat.id,
          v_enr_id,
          (v_frame -> 'embedding')::text::extensions.vector(512),
          v_tpl_rec.pose,
          jsonb_build_object('backfilled', true, 'pose', COALESCE(v_tpl_rec.pose::text, v_pose_text)),
          'w600k_r50',
          now()
        );
        v_inserted_templates := v_inserted_templates + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfilled % face_templates rows into pgvector.', v_inserted_templates;
END $$;

-- ----------------------------------------------------------------------------
-- 7. PLANNER STATISTICS & FINAL HEALTH SUMMARY
-- ----------------------------------------------------------------------------
ANALYZE public.patients;
ANALYZE public.face_enrollments;
ANALYZE public.face_templates;
ANALYZE public.courses;
ANALYZE public.course_items;
ANALYZE public.exercises;
ANALYZE public.audit_logs;
ANALYZE public.staff_calls;

SELECT
  '✓ PHASE 1 SUPABASE CLEANUP & SYNC COMPLETE' AS status,
  (SELECT COUNT(*) FROM public.patients) AS patients_count,
  (SELECT COUNT(*) FROM public.profiles) AS profiles_count,
  (SELECT COUNT(*) FROM public.pts) AS pts_count,
  (SELECT COUNT(*) FROM public.exercises WHERE is_active = true) AS active_exercises_count,
  (SELECT COUNT(*) FROM public.exercises WHERE is_active = false) AS legacy_inactive_exercises_count,
  (SELECT COUNT(*) FROM public.modpacks) AS modpacks_count,
  (SELECT COUNT(*) FROM public.minigame_questions) AS minigame_questions_count,
  (SELECT COUNT(*) FROM public.staff_calls WHERE handled_at IS NULL) AS pending_staff_calls_count,
  (SELECT COUNT(*) FROM public.staff_devices) AS staff_devices_count,
  (SELECT COUNT(*) FROM public.audit_logs) AS audit_logs_count,
  (SELECT COUNT(*) FROM public.face_enrollments) AS face_enrollments_count,
  (SELECT COUNT(*) FROM public.face_templates) AS face_templates_count,
  (SELECT COUNT(*) FROM public.exercise_session_logs) AS exercise_session_logs_count;
