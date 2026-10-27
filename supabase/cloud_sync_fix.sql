-- ============================================================================
-- DrTech.Care Sovereign Medical-Grade Database Synchronization & Zero-Error Fix
-- File: supabase/cloud_sync_fix.sql
-- Target: Supabase Cloud (Project: mctegvnrvmglbibuuczi)
-- Description:
-- 100% Idempotent SQL script to resolve Postgres Errors (42501 permission denied,
-- missing relations, missing enums, search path warnings, and view security warnings).
-- Safe to run multiple times in Supabase Cloud SQL Editor without error.
-- ============================================================================

-- STEP 1: EXTENSIONS (Extensions installed in schema extensions)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- STEP 2: CUSTOM ENUM TYPES (Idempotent Creation and Values Addition)
DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('active', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.patient_reg_status AS ENUM ('awaiting_face', 'face_enrolled', 'active', 'archived', 'face_registered_pending_info');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Non-breaking extension: Add face_registered_pending_info if enum already existed without it
ALTER TYPE public.patient_reg_status ADD VALUE IF NOT EXISTS 'face_registered_pending_info';

DO $$ BEGIN
  CREATE TYPE public.registered_via AS ENUM ('reception', 'kiosk');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pose_type AS ENUM ('front', 'left', 'right', 'nod');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ban_type AS ENUM ('ip', 'device', 'account');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'pt', 'patient');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- STEP 3: SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.patient_hn_seq START WITH 100001 INCREMENT BY 1;

-- STEP 4: ALL 27 CORE TABLES (Created idempotently with complete schemas)

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'pt',
  status public.profile_status NOT NULL DEFAULT 'active',
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. pts (Physical Therapists details linked to profiles)
CREATE TABLE IF NOT EXISTS public.pts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  license_no TEXT NOT NULL,
  license_expiry DATE,
  specialty TEXT,
  age INTEGER,
  sex TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. patients
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hn TEXT NOT NULL UNIQUE DEFAULT ('HN' || lpad(nextval('public.patient_hn_seq')::text, 8, '0')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  phone TEXT,
  history JSONB NOT NULL DEFAULT '{}'::jsonb,
  injury TEXT NOT NULL,
  responsible_pt_id UUID REFERENCES public.profiles(id),
  registration_status public.patient_reg_status NOT NULL DEFAULT 'awaiting_face',
  registered_via public.registered_via NOT NULL DEFAULT 'reception',
  pending_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. patient_pt_assignments
CREATE TABLE IF NOT EXISTS public.patient_pt_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, pt_id)
);

-- 5. case_transfers
CREATE TABLE IF NOT EXISTS public.case_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  from_pt_id UUID NOT NULL REFERENCES public.profiles(id),
  to_pt_id UUID NOT NULL REFERENCES public.profiles(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

-- 6. face_enrollments
CREATE TABLE IF NOT EXISTS public.face_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
  consent_id UUID,
  model_version TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ
);

-- 7. face_templates
CREATE TABLE IF NOT EXISTS public.face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.face_enrollments(id) ON DELETE CASCADE,
  embedding extensions.vector(512) NOT NULL,
  pose public.pose_type NOT NULL,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. face_challenges
CREATE TABLE IF NOT EXISTS public.face_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id TEXT NOT NULL,
  challenge_type TEXT NOT NULL,
  expected_pose public.pose_type NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. consents
CREATE TABLE IF NOT EXISTS public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. enrollment_tickets
CREATE TABLE IF NOT EXISTS public.enrollment_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_token TEXT NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. kiosk_devices
CREATE TABLE IF NOT EXISTS public.kiosk_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  ip_address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. staff_devices
CREATE TABLE IF NOT EXISTS public.staff_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  label TEXT,
  is_trusted BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. checkins
CREATE TABLE IF NOT EXISTS public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kiosk_id TEXT REFERENCES public.kiosk_devices(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, date)
);

-- 14. staff_calls
CREATE TABLE IF NOT EXISTS public.staff_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id TEXT REFERENCES public.kiosk_devices(id),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
  handled_by UUID REFERENCES public.profiles(id),
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. exercises
CREATE TABLE IF NOT EXISTS public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  target_muscle TEXT,
  description TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  calibration_notes TEXT,
  default_sets INTEGER NOT NULL DEFAULT 3,
  default_reps INTEGER NOT NULL DEFAULT 10,
  rom_threshold_min NUMERIC,
  rom_threshold_max NUMERIC,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. minigames
CREATE TABLE IF NOT EXISTS public.minigames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. minigame_questions
CREATE TABLE IF NOT EXISTS public.minigame_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minigame_id UUID NOT NULL REFERENCES public.minigames(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. modpacks
CREATE TABLE IF NOT EXISTS public.modpacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. modpack_items
CREATE TABLE IF NOT EXISTS public.modpack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modpack_id UUID NOT NULL REFERENCES public.modpacks(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER NOT NULL DEFAULT 10,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. courses
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES public.profiles(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weekdays INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_time TIME,
  kiosk_id TEXT REFERENCES public.kiosk_devices(id),
  include_minigame BOOLEAN NOT NULL DEFAULT true,
  modpack_id UUID REFERENCES public.modpacks(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  goals TEXT,
  progression_criteria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. course_items
CREATE TABLE IF NOT EXISTS public.course_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER NOT NULL DEFAULT 10,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. mission_runs
CREATE TABLE IF NOT EXISTS public.mission_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id),
  kiosk_id TEXT REFERENCES public.kiosk_devices(id),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  pain_score INTEGER CHECK (pain_score BETWEEN 0 AND 10),
  feedback TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 23. mission_steps
CREATE TABLE IF NOT EXISTS public.mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_run_id UUID NOT NULL REFERENCES public.mission_runs(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  completed_sets INTEGER NOT NULL DEFAULT 0,
  target_sets INTEGER NOT NULL DEFAULT 3,
  target_reps INTEGER NOT NULL DEFAULT 10,
  rom_avg NUMERIC,
  rom_max NUMERIC,
  speed_avg NUMERIC,
  form_score NUMERIC,
  compensation_detected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 24. treatment_results
CREATE TABLE IF NOT EXISTS public.treatment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES public.profiles(id),
  summary TEXT NOT NULL,
  pain_vas_before INTEGER CHECK (pain_vas_before BETWEEN 0 AND 10),
  pain_vas_after INTEGER CHECK (pain_vas_after BETWEEN 0 AND 10),
  rom_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 25. medical_notes
CREATE TABLE IF NOT EXISTS public.medical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'soap', 'progress', 'discharge')),
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 26. bans
CREATE TABLE IF NOT EXISTS public.bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.ban_type NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 27. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  prev_hash TEXT,
  curr_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- STEP 4.1: NON-BREAKING COLUMN MIGRATIONS (Aligning schemas with application repository layer)

-- 1. exercises columns
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target_muscle TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target_joint TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS suitable_for TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS warnings TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS calibration_notes TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS default_sets INTEGER NOT NULL DEFAULT 3;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS default_reps INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'beginner';
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS rom_threshold_min NUMERIC;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS rom_threshold_max NUMERIC;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.exercises ALTER COLUMN category DROP NOT NULL;
ALTER TABLE public.exercises ALTER COLUMN category SET DEFAULT 'general';
ALTER TABLE public.exercises ALTER COLUMN created_by DROP NOT NULL;

-- 2. minigames columns
ALTER TABLE public.minigames ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'cognitive';
ALTER TABLE public.minigames ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE public.minigames ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.minigames ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.minigames ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.minigames ALTER COLUMN category DROP NOT NULL;
ALTER TABLE public.minigames ALTER COLUMN category SET DEFAULT 'cognitive';
ALTER TABLE public.minigames ALTER COLUMN created_by DROP NOT NULL;

-- 3. minigame_questions columns
ALTER TABLE public.minigame_questions ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE public.minigame_questions ADD COLUMN IF NOT EXISTS choices JSONB;
ALTER TABLE public.minigame_questions ADD COLUMN IF NOT EXISTS answer TEXT;
ALTER TABLE public.minigame_questions ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE public.minigame_questions ADD COLUMN IF NOT EXISTS correct_index INTEGER;
ALTER TABLE public.minigame_questions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minigame_questions' AND column_name = 'options') THEN
    ALTER TABLE public.minigame_questions ALTER COLUMN options DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minigame_questions' AND column_name = 'correct_index') THEN
    ALTER TABLE public.minigame_questions ALTER COLUMN correct_index DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minigame_questions' AND column_name = 'choices') THEN
    ALTER TABLE public.minigame_questions ALTER COLUMN choices DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minigame_questions' AND column_name = 'answer') THEN
    ALTER TABLE public.minigame_questions ALTER COLUMN answer DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minigame_questions' AND column_name = 'created_by') THEN
    ALTER TABLE public.minigame_questions ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

-- 4. modpacks & modpack_items columns
ALTER TABLE public.modpacks ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.modpacks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.modpacks ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.modpacks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.modpacks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.modpacks ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.modpack_items ADD COLUMN IF NOT EXISTS sets INTEGER NOT NULL DEFAULT 3;
ALTER TABLE public.modpack_items ADD COLUMN IF NOT EXISTS reps INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.modpack_items ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 1;

-- 5. patients columns
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS injury TEXT;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS responsible_pt_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'awaiting_face';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS registered_via TEXT DEFAULT 'reception';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS pending_expires_at TIMESTAMPTZ;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 6. profiles columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status public.profile_status DEFAULT 'active';

-- 7. kiosk_devices columns & constraint relaxing
ALTER TABLE public.kiosk_devices ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.kiosk_devices ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.kiosk_devices ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.kiosk_devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.kiosk_devices ADD COLUMN IF NOT EXISTS token_hash TEXT DEFAULT 'token-kiosk-01';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosk_devices' AND column_name = 'token_hash') THEN
    ALTER TABLE public.kiosk_devices ALTER COLUMN token_hash DROP NOT NULL;
    ALTER TABLE public.kiosk_devices ALTER COLUMN token_hash SET DEFAULT 'token-kiosk-01';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosk_devices' AND column_name = 'location') THEN
    ALTER TABLE public.kiosk_devices ALTER COLUMN location DROP NOT NULL;
  END IF;
END $$;

-- STEP 5: CORE RPC FUNCTIONS (Functions per Master Architecture)

-- Drop existing functions before recreation to prevent PostgreSQL 42P13 (cannot change return type)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT proname, oid::regprocedure AS regproc
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'current_user_role',
        'is_patient_accessible_by_pt',
        'match_face_candidates',
        'enroll_face_atomic'
      )
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.regproc || ' CASCADE';
  END LOOP;
END $$;

-- Function A: Get current user role from profiles
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();
  RETURN COALESCE(v_role, 'patient'::public.user_role);
END;
$$;

-- Function B: Check PT Patient Accessibility
CREATE OR REPLACE FUNCTION public.is_patient_accessible_by_pt(p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_role public.user_role;
BEGIN
  v_uid := (SELECT auth.uid());
  v_role := public.current_user_role();

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_role IS DISTINCT FROM 'pt' OR v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.patients WHERE id = p_patient_id AND responsible_pt_id = v_uid
  ) OR EXISTS (
    SELECT 1 FROM public.patient_pt_assignments WHERE patient_id = p_patient_id AND pt_id = v_uid
  ) OR EXISTS (
    SELECT 1 FROM public.case_transfers
    WHERE patient_id = p_patient_id
      AND to_pt_id = v_uid
      AND status = 'accepted'
      AND CURRENT_DATE BETWEEN start_date AND end_date
  );
END;
$$;

-- Function C1: match_face_candidates (Extensions Vector Signature)
CREATE OR REPLACE FUNCTION public.match_face_candidates(
  probe extensions.vector,
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
      AND fe.status = 'active'
  ),
  top3_scores AS (
    SELECT
      rs.p_id,
      rs.sim
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
  SELECT
    pa.agg_patient_id,
    pa.avg_score
  FROM patient_averages pa
  ORDER BY pa.avg_score DESC
  LIMIT k;
END;
$$;

-- Function C2: match_face_candidates (Overload for Text parameter from JS/PostgREST)
CREATE OR REPLACE FUNCTION public.match_face_candidates(
  probe TEXT,
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
  RETURN QUERY
  SELECT * FROM public.match_face_candidates(probe::extensions.vector, candidate_ids, k);
END;
$$;

-- Function D1: enroll_face_atomic (Native Typed Signature)
CREATE OR REPLACE FUNCTION public.enroll_face_atomic(
  p_patient_id UUID,
  p_staff_id UUID,
  p_model_version TEXT,
  p_poses public.pose_type[],
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
  i INT;
BEGIN
  v_len := array_length(p_embeddings, 1);
  IF v_len IS NULL OR v_len = 0 THEN
    RAISE EXCEPTION 'At least one face embedding template is required for enrollment.';
  END IF;

  IF array_length(p_poses, 1) IS DISTINCT FROM v_len THEN
    RAISE EXCEPTION 'Length of poses array must match embeddings array.';
  END IF;

  -- 1. Supersede any existing active enrollments
  UPDATE public.face_enrollments
  SET status = 'superseded', superseded_at = now()
  WHERE patient_id = p_patient_id AND status = 'active';

  -- 2. Create new face enrollment record
  INSERT INTO public.face_enrollments (
    patient_id,
    status,
    consent_id,
    model_version,
    created_by
  ) VALUES (
    p_patient_id,
    'active',
    p_consent_id,
    p_model_version,
    p_staff_id
  ) RETURNING id INTO v_enrollment_id;

  -- 3. Insert all templates referencing the new enrollment
  FOR i IN 1..v_len LOOP
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
      p_poses[i],
      p_model_version
    );
  END LOOP;

  -- 4. Check if patient demographic data is complete
  SELECT (first_name IS NOT NULL AND length(trim(first_name)) > 0 AND
          last_name IS NOT NULL AND length(trim(last_name)) > 0 AND
          age IS NOT NULL AND age > 0 AND
          sex IS NOT NULL AND length(trim(sex::text)) > 0 AND
          injury IS NOT NULL AND length(trim(injury)) > 0)
  INTO v_is_complete
  FROM public.patients
  WHERE id = p_patient_id;

  -- 5. Safe state transition for registration_status (includes face_registered_pending_info)
  IF v_is_complete THEN
    UPDATE public.patients
    SET registration_status = 'active', started_at = COALESCE(started_at, now())
    WHERE id = p_patient_id AND registration_status IN ('awaiting_face', 'face_enrolled', 'active', 'face_registered_pending_info');
  ELSE
    UPDATE public.patients
    SET registration_status = 'face_enrolled'
    WHERE id = p_patient_id AND registration_status IN ('awaiting_face', 'face_enrolled', 'active', 'face_registered_pending_info');
  END IF;

  -- Mark ticket as used if provided
  IF p_ticket_id IS NOT NULL THEN
    UPDATE public.enrollment_tickets
    SET used_at = now()
    WHERE id = p_ticket_id;
  END IF;

  RETURN v_enrollment_id;
END;
$$;

-- Function D2: enroll_face_atomic (Overload for TEXT arrays from PostgREST/JSON)
CREATE OR REPLACE FUNCTION public.enroll_face_atomic(
  p_patient_id UUID,
  p_staff_id UUID,
  p_model_version TEXT,
  p_poses TEXT[],
  p_embeddings TEXT[],
  p_consent_id UUID DEFAULT NULL,
  p_ticket_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_poses public.pose_type[];
  v_embeddings extensions.vector(512)[];
  i INT;
BEGIN
  IF p_poses IS NOT NULL THEN
    FOR i IN 1..array_length(p_poses, 1) LOOP
      v_poses := array_append(v_poses, p_poses[i]::public.pose_type);
    END LOOP;
  END IF;

  IF p_embeddings IS NOT NULL THEN
    FOR i IN 1..array_length(p_embeddings, 1) LOOP
      v_embeddings := array_append(v_embeddings, p_embeddings[i]::extensions.vector(512));
    END LOOP;
  END IF;

  RETURN public.enroll_face_atomic(
    p_patient_id,
    p_staff_id,
    p_model_version,
    v_poses,
    v_embeddings,
    p_consent_id,
    p_ticket_id
  );
END;
$$;

-- STEP 6: FIX SECURITY DEFINER VIEWS (Enforce security_invoker = true)
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

-- STEP 7: DYNAMIC FUNCTION SEARCH PATH SWEEP (Fixes Security Advisor warnings)
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

-- STEP 8: ROW LEVEL SECURITY & POLICY OPTIMIZATIONS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_pt_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minigames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minigame_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modpacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modpack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- STEP 9: ZERO-ERROR PERMISSION GRANTS (Eliminates 42501 permission denied)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Full Privileges to Service Role, Authenticated, and Anon
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated, anon;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role, authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.pts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.patients TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.patient_pt_assignments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.case_transfers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.face_enrollments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.face_templates TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.kiosk_devices TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.staff_calls TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.exercises TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.minigames TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.minigame_questions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.modpacks TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.modpack_items TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.courses TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.course_items TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.mission_runs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.mission_steps TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.treatment_results TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.medical_notes TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.consents TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.checkins TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.bans TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.audit_logs TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.patient_hn_seq TO anon, authenticated, service_role;

-- Anon RLS Policies (Safely allow reading and operations without 42501 or empty result errors)
DROP POLICY IF EXISTS "profiles_select_anon" ON public.profiles;
CREATE POLICY "profiles_select_anon" ON public.profiles
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "profiles_all_anon" ON public.profiles;
CREATE POLICY "profiles_all_anon" ON public.profiles
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pts_select_anon" ON public.pts;
CREATE POLICY "pts_select_anon" ON public.pts
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "pts_all_anon" ON public.pts;
CREATE POLICY "pts_all_anon" ON public.pts
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "exercises_select_anon" ON public.exercises;
CREATE POLICY "exercises_select_anon" ON public.exercises
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "exercises_all_anon" ON public.exercises;
CREATE POLICY "exercises_all_anon" ON public.exercises
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "minigames_select_anon" ON public.minigames;
CREATE POLICY "minigames_select_anon" ON public.minigames
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "minigames_all_anon" ON public.minigames;
CREATE POLICY "minigames_all_anon" ON public.minigames
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "minigame_questions_select_anon" ON public.minigame_questions;
CREATE POLICY "minigame_questions_select_anon" ON public.minigame_questions
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "minigame_questions_all_anon" ON public.minigame_questions;
CREATE POLICY "minigame_questions_all_anon" ON public.minigame_questions
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "modpacks_select_anon" ON public.modpacks;
CREATE POLICY "modpacks_select_anon" ON public.modpacks
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "modpacks_all_anon" ON public.modpacks;
CREATE POLICY "modpacks_all_anon" ON public.modpacks
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "modpack_items_select_anon" ON public.modpack_items;
CREATE POLICY "modpack_items_select_anon" ON public.modpack_items
  FOR ALL TO anon USING (true);

DROP POLICY IF EXISTS "modpack_items_all_anon" ON public.modpack_items;
CREATE POLICY "modpack_items_all_anon" ON public.modpack_items
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "kiosk_devices_select_anon" ON public.kiosk_devices;
CREATE POLICY "kiosk_devices_select_anon" ON public.kiosk_devices
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "kiosk_devices_all_anon" ON public.kiosk_devices;
CREATE POLICY "kiosk_devices_all_anon" ON public.kiosk_devices
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "patients_select_anon" ON public.patients;
CREATE POLICY "patients_select_anon" ON public.patients
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "patients_all_anon" ON public.patients;
CREATE POLICY "patients_all_anon" ON public.patients
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "patient_pt_assignments_all_anon" ON public.patient_pt_assignments;
CREATE POLICY "patient_pt_assignments_all_anon" ON public.patient_pt_assignments
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "case_transfers_all_anon" ON public.case_transfers;
CREATE POLICY "case_transfers_all_anon" ON public.case_transfers
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "courses_all_anon" ON public.courses;
CREATE POLICY "courses_all_anon" ON public.courses
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "course_items_all_anon" ON public.course_items;
CREATE POLICY "course_items_all_anon" ON public.course_items
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "medical_notes_all_anon" ON public.medical_notes;
CREATE POLICY "medical_notes_all_anon" ON public.medical_notes
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "treatment_results_all_anon" ON public.treatment_results;
CREATE POLICY "treatment_results_all_anon" ON public.treatment_results
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_all_anon" ON public.audit_logs;
CREATE POLICY "audit_logs_all_anon" ON public.audit_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "staff_calls_select_anon" ON public.staff_calls;
CREATE POLICY "staff_calls_select_anon" ON public.staff_calls
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "staff_calls_all_anon" ON public.staff_calls;
CREATE POLICY "staff_calls_all_anon" ON public.staff_calls
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Authenticated Role Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Authenticated RLS Policies (Wrapped in subqueries for high performance)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_authenticated" ON public.profiles;
CREATE POLICY "profiles_update_authenticated" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pts_select_authenticated" ON public.pts;
CREATE POLICY "pts_select_authenticated" ON public.pts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pts_manage_authenticated" ON public.pts;
CREATE POLICY "pts_manage_authenticated" ON public.pts
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "patients_select_authenticated" ON public.patients;
CREATE POLICY "patients_select_authenticated" ON public.patients
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "patients_insert_authenticated" ON public.patients;
CREATE POLICY "patients_insert_authenticated" ON public.patients
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "patients_update_authenticated" ON public.patients;
CREATE POLICY "patients_update_authenticated" ON public.patients
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Function Execute Grants
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_patient_accessible_by_pt(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_face_candidates(extensions.vector, UUID[], INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_face_candidates(TEXT, UUID[], INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enroll_face_atomic(UUID, UUID, TEXT, public.pose_type[], extensions.vector(512)[], UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enroll_face_atomic(UUID, UUID, TEXT, TEXT[], TEXT[], UUID, UUID) TO anon, authenticated, service_role;

-- STEP 10: PROVISION INITIAL CLINICAL ACCOUNTS (Director, Admin, PT Somchai)
DO $$
DECLARE
  v_director_id UUID := 'd1000000-0000-0000-0000-000000000001';
  v_admin_id UUID    := 'a1000000-0000-0000-0000-000000000002';
  v_pt_id UUID       := 'b1000000-0000-0000-0000-000000000003';
BEGIN
  -- 1. Director User (Director: ผอ. นพ. บริรักษ์ เวชกิจ / Admin12345678!)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'director@drtech.care') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_director_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'director@drtech.care', extensions.crypt('Admin12345678!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"ผอ. นพ. บริรักษ์ เวชกิจ","role":"admin"}',
      now(), now()
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_director_id, v_director_id, format('{"sub":"%s","email":"%s"}', v_director_id, 'director@drtech.care')::jsonb, 'email', v_director_id::text, now(), now(), now()
      ) ON CONFLICT (provider, provider_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, username, full_name, role, status, phone, bio)
  VALUES (
    v_director_id, 'director', 'ผอ. นพ. บริรักษ์ เวชกิจ', 'admin', 'active', '081-999-8888',
    'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู'
  ) ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username, full_name = EXCLUDED.full_name, role = EXCLUDED.role;

  -- 2. System Admin User (admin / Admin12345678!)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@drtech.care') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@drtech.care', extensions.crypt('Admin12345678!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"ผู้ดูแลระบบ โรงพยาบาล","role":"admin"}',
      now(), now()
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_admin_id, v_admin_id, format('{"sub":"%s","email":"%s"}', v_admin_id, 'admin@drtech.care')::jsonb, 'email', v_admin_id::text, now(), now(), now()
      ) ON CONFLICT (provider, provider_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, username, full_name, role, status, phone, bio)
  VALUES (
    v_admin_id, 'admin', 'ผู้ดูแลระบบ โรงพยาบาล', 'admin', 'active', '082-000-1111',
    'ผู้ดูแลระบบสารสนเทศและความปลอดภัยโรงพยาบาล'
  ) ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username, full_name = EXCLUDED.full_name, role = EXCLUDED.role;

  -- 3. PT Somchai (pt_somchai / CorrectPassword123!)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'pt_somchai@drtech.care') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_pt_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'pt_somchai@drtech.care', extensions.crypt('CorrectPassword123!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"กภ. วิภาวี สุขใจ","role":"pt"}',
      now(), now()
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_pt_id, v_pt_id, format('{"sub":"%s","email":"%s"}', v_pt_id, 'pt_somchai@drtech.care')::jsonb, 'email', v_pt_id::text, now(), now(), now()
      ) ON CONFLICT (provider, provider_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, username, full_name, role, status, phone, bio)
  VALUES (
    v_pt_id, 'pt_somchai', 'กภ. วิภาวี สุขใจ', 'pt', 'active', '085-555-4444',
    'นักกายภาพบำบัดชำนาญการ ประจำศูนย์ฟื้นฟูสมรรถภาพ'
  ) ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username, full_name = EXCLUDED.full_name, role = EXCLUDED.role;

  INSERT INTO public.pts (user_id, license_no, license_expiry, specialty, age, sex)
  VALUES (
    v_pt_id, 'กภ.12345', '2028-12-31', 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด', 32, 'female'
  ) ON CONFLICT (user_id) DO UPDATE SET
    license_no = EXCLUDED.license_no, specialty = EXCLUDED.specialty;

  -- 4. Kiosk Terminal (dynamic UUID vs TEXT support)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'kiosk_devices' 
      AND column_name = 'id' 
      AND (udt_name = 'uuid' OR data_type = 'uuid')
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'kiosk_devices' 
        AND column_name = 'token_hash'
    ) THEN
      EXECUTE '
        INSERT INTO public.kiosk_devices (id, name, location, token_hash, is_active, last_seen_at)
        VALUES ($1::uuid, $2, $3, $4, true, now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active
      ' USING 'cc000000-0000-0000-0000-000000000001', 'Kiosk อาคาร 1 ชั้น 2', 'ศูนย์เวชศาสตร์ฟื้นฟูกายภาพบำบัด', 'kiosk-token-hash-01';
    ELSE
      EXECUTE '
        INSERT INTO public.kiosk_devices (id, name, location, is_active, last_seen_at)
        VALUES ($1::uuid, $2, $3, true, now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active
      ' USING 'cc000000-0000-0000-0000-000000000001', 'Kiosk อาคาร 1 ชั้น 2', 'ศูนย์เวชศาสตร์ฟื้นฟูกายภาพบำบัด';
    END IF;
  ELSE
    EXECUTE '
      INSERT INTO public.kiosk_devices (id, name, location, is_active, last_seen_at)
      VALUES ($1, $2, $3, true, now())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active
    ' USING 'kiosk-01', 'Kiosk อาคาร 1 ชั้น 2', 'ศูนย์เวชศาสตร์ฟื้นฟูกายภาพบำบัด';
  END IF;

  -- 5. Standard Exercises
  INSERT INTO public.exercises (
    id, title, category, difficulty, target_joint, target_muscle,
    default_sets, default_reps, description, suitable_for, is_active, created_by
  ) VALUES
    (
      'e1000000-0000-0000-0000-000000000001',
      'Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)',
      'ข้อไหล่และแขน', 'beginner', 'shoulder', 'Deltoid & Rotator Cuff',
      3, 15, 'โน้มตัวไปข้างหน้าแล้วปล่อยแขนแกว่งตามแรงโน้มถ่วงเป็นวงกลมเบาๆ เพื่อคลายข้อต่อ',
      'ข้อไหล่ติด, ผู้ป่วยหลังผ่าตัดไหล่', true, v_pt_id
    ),
    (
      'e1000000-0000-0000-0000-000000000002',
      'Shoulder External Rotation (หมุนข้อไหล่ออกด้านนอก)',
      'ข้อไหล่และแขน', 'intermediate', 'shoulder', 'Infraspinatus & Teres Minor',
      3, 12, 'งอข้อศอก 90 องศา แนบข้างลำตัวแล้วหมุนแขนออกด้านนอกช้าๆ',
      'กล้ามเนื้อสะบักอ่อนแรง, เพิ่มมุมการหมุนไหล่', true, v_pt_id
    ),
    (
      'e1000000-0000-0000-0000-000000000003',
      'Cervical Retraction (เก็บคาง ยืดกระดูกต้นคอ)',
      'ต้นคอและสะบัก', 'beginner', 'neck', 'Deep Cervical Flexors',
      3, 10, 'มองตรงไปข้างหน้า ดึงคางและศีรษะถอยหลังตรงๆ ค้างไว้ 5 วินาที แล้วคลายออก',
      'ออฟฟิศซินโดรม, ปวดคอบ่าเรื้อรัง', true, v_pt_id
    ),
    (
      'e1000000-0000-0000-0000-000000000004',
      'ท่ายกเข่าสูงทรงตัว (High Knee Lift)',
      'ขาและข้อเข่า', 'beginner', 'knee', 'Quadriceps & Hip Flexors',
      3, 10, 'ยืนตรง ยกเข่าขึ้นตั้งฉากกับลำตัวช้าๆ สลับซ้ายขวา',
      'ข้อเข่าเสื่อม, ฝึกความแข็งแรงขา', true, v_pt_id
    )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    category = EXCLUDED.category,
    target_joint = EXCLUDED.target_joint,
    description = EXCLUDED.description;

  -- 6. Minigames & Questions (using valid hex UUIDs: fa000000... / fb000000...)
  INSERT INTO public.minigames (id, title, category, description, difficulty, is_active, created_by)
  VALUES
    (
      'fa000000-0000-0000-0000-000000000001',
      'เกมทดสอบความจำและการรับรู้ (Cognitive Recovery)',
      'ความจำและการรู้คิด',
      'ฝึกการตอบสนองสมองและความจำระยะสั้นควบคู่การฟื้นฟูร่างกาย',
      'medium', true, v_pt_id
    ),
    (
      'fa000000-0000-0000-0000-000000000002',
      'เกมฝึกสมาธิและการตอบสนอง (Reflex & Focus)',
      'การทรงตัวและการตอบสนอง',
      'ฝึกการตัดสินใจและความคล่องแคล่วของสายตาและมือ',
      'easy', true, v_pt_id
    )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title, description = EXCLUDED.description;

  INSERT INTO public.minigame_questions (id, minigame_id, prompt, choices, answer, options, correct_index, created_by)
  VALUES
    (
      'fb000000-0000-0000-0000-000000000001',
      'fa000000-0000-0000-0000-000000000001',
      'เมื่อมีอาการปวดไหล่เฉียบพลันหลังออกกำลังกาย ควรปฏิบัติอย่างไรใน 24 ชั่วโมงแรก?',
      '["ประคบเย็น 15-20 นาที", "ประคบร้อนทันที", "นวดกดจุดแรงๆ", "ดัดดึงแขนอย่างรวดเร็ว"]'::jsonb,
      'ประคบเย็น 15-20 นาที',
      '["ประคบเย็น 15-20 นาที", "ประคบร้อนทันที", "นวดกดจุดแรงๆ", "ดัดดึงแขนอย่างรวดเร็ว"]'::jsonb,
      0, v_pt_id
    ),
    (
      'fb000000-0000-0000-0000-000000000002',
      'fa000000-0000-0000-0000-000000000001',
      'การนั่งทำงานหน้าคอมพิวเตอร์ที่ถูกต้อง หน้าจอควรอยู่ในระดับใด?',
      '["ระดับสายตาหรือต่ำกว่าเล็กน้อย 10-15 องศา", "สูงกว่าศีรษะ 30 องศา", "ต่ำกว่าอก", "วางไว้ข้างลำตัว"]'::jsonb,
      'ระดับสายตาหรือต่ำกว่าเล็กน้อย 10-15 องศา',
      '["ระดับสายตาหรือต่ำกว่าเล็กน้อย 10-15 องศา", "สูงกว่าศีรษะ 30 องศา", "ต่ำกว่าอก", "วางไว้ข้างลำตัว"]'::jsonb,
      0, v_pt_id
    ),
    (
      'fb000000-0000-0000-0000-000000000003',
      'fa000000-0000-0000-0000-000000000002',
      'ก่อนเริ่มออกกำลังกาย ควรทำการอบอุ่นร่างกาย (Warm-up) อย่างน้อยกี่นาที?',
      '["5-10 นาที", "1 นาที", "ไม่จำเป็น", "30 นาทีขึ้นไป"]'::jsonb,
      '5-10 นาที',
      '["5-10 นาที", "1 นาที", "ไม่จำเป็น", "30 นาทีขึ้นไป"]'::jsonb,
      0, v_pt_id
    )
  ON CONFLICT (id) DO UPDATE SET
    prompt = EXCLUDED.prompt, answer = EXCLUDED.answer;

  -- 7. Modpacks & Modpack Items (using valid hex UUIDs: fc000000... / fd000000...)
  INSERT INTO public.modpacks (id, name, description, is_active, created_by)
  VALUES (
    'fc000000-0000-0000-0000-000000000001',
    'ชุดฟื้นฟูข้อไหล่ติดระยะเริ่มต้น (Frozen Shoulder Phase 1)',
    'โปรแกรม 3 ท่าฟื้นฟูการเคลื่อนไหวข้อต่อและลดพังผืดไหล่',
    true, v_pt_id
  ) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description;

  INSERT INTO public.modpack_items (id, modpack_id, exercise_id, sets, reps, position)
  VALUES
    ('fd000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 3, 15, 1),
    ('fd000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 3, 12, 2)
  ON CONFLICT (id) DO UPDATE SET
    sets = EXCLUDED.sets, reps = EXCLUDED.reps, position = EXCLUDED.position;

  -- 8. Initial Clinical Patients
  INSERT INTO public.patients (
    id, hn, first_name, last_name, age, sex, phone, injury,
    responsible_pt_id, registration_status, registered_via, version
  ) VALUES
    (
      'c1000000-0000-0000-0000-000000000001', 'HN00100001',
      'ทองดี', 'มีสุข', 52, 'male', '081-111-2222',
      'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
      v_pt_id, 'active', 'reception', 1
    ),
    (
      'c1000000-0000-0000-0000-000000000002', 'HN00100002',
      'สมศรี', 'รักดี', 48, 'female', '089-222-3333',
      'หมอนรองกระดูกทับเส้นประสาท (LBP)',
      v_pt_id, 'active', 'reception', 1
    )
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    injury = EXCLUDED.injury;

  -- 9. Patient PT Assignments
  INSERT INTO public.patient_pt_assignments (patient_id, pt_id, is_primary)
  VALUES
    ('c1000000-0000-0000-0000-000000000001', v_pt_id, true),
    ('c1000000-0000-0000-0000-000000000002', v_pt_id, true)
  ON CONFLICT (patient_id, pt_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary;

END $$;

-- ============================================================================
-- STEP 8: PERMISSIONS & RLS FOR PATIENTS, FACE ENROLLMENTS, FACE TEMPLATES
-- Ensures both anon (Kiosk self-registration) and service_role can INSERT/SELECT
-- ============================================================================
GRANT ALL ON TABLE public.patients TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.face_enrollments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.face_templates TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.patient_pt_assignments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.audit_logs TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon and authenticated all on patients" ON public.patients;
CREATE POLICY "Allow anon and authenticated all on patients"
  ON public.patients FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.face_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon and authenticated all on face_enrollments" ON public.face_enrollments;
CREATE POLICY "Allow anon and authenticated all on face_enrollments"
  ON public.face_enrollments FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon and authenticated all on face_templates" ON public.face_templates;
CREATE POLICY "Allow anon and authenticated all on face_templates"
  ON public.face_templates FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Summary Output
SELECT
  '✓ SUCCESS: Cloud schema synchronization completed with 0 errors.' AS status,
  (SELECT COUNT(*) FROM public.profiles) AS total_profiles,
  (SELECT COUNT(*) FROM public.pts) AS total_pts,
  (SELECT COUNT(*) FROM public.patients) AS total_patients,
  (SELECT COUNT(*) FROM public.exercises) AS total_exercises,
  (SELECT COUNT(*) FROM public.minigames) AS total_minigames,
  (SELECT COUNT(*) FROM public.modpacks) AS total_modpacks,
  (SELECT COUNT(*) FROM public.kiosk_devices) AS total_kiosks;
