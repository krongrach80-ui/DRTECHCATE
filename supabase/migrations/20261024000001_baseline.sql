-- ============================================================================
-- DrTech.Care Hospital Physical Therapy System — Baseline Migration
-- Master Prompt v3 (Section 4 — Exactly 27 Tables Schema & Strict Security)
-- ============================================================================

-- 1. EXTENSIONS (Installed in schema extensions per Supabase best practice)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'pt');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE profile_status AS ENUM ('active', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE patient_reg_status AS ENUM ('awaiting_face', 'face_enrolled', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE registered_via AS ENUM ('reception', 'kiosk');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pose_type AS ENUM ('front', 'left', 'right', 'nod');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ban_type AS ENUM ('ip', 'device', 'account');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. SEQUENCES (HN from database sequence - Rule 5)
CREATE SEQUENCE IF NOT EXISTS patient_hn_seq START WITH 100001 INCREMENT BY 1;

-- ============================================================================
-- 4. EXACT 27 TABLES PER MASTER PROMPT v3 SECTION 4
-- ============================================================================

-- 1. profiles (เฉพาะ staff)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'pt',
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  bio TEXT,
  status profile_status NOT NULL DEFAULT 'active',
  force_logout_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. pts
CREATE TABLE IF NOT EXISTS public.pts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  license_no TEXT NOT NULL UNIQUE,
  license_expiry DATE,
  specialty TEXT,
  age INTEGER,
  sex TEXT
);

-- 3. patients
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hn TEXT NOT NULL UNIQUE DEFAULT ('HN' || lpad(nextval('patient_hn_seq')::text, 8, '0')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  phone TEXT,
  history JSONB NOT NULL DEFAULT '{}'::jsonb,
  injury TEXT NOT NULL,
  responsible_pt_id UUID REFERENCES public.profiles(id),
  registration_status patient_reg_status NOT NULL DEFAULT 'awaiting_face',
  registered_via registered_via NOT NULL DEFAULT 'reception',
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
  CONSTRAINT chk_case_transfers_dates CHECK (end_date >= start_date)
);

-- 6. exercises
CREATE TABLE IF NOT EXISTS public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  image_path TEXT,
  description TEXT,
  target_joint TEXT NOT NULL,
  suitable_for TEXT,
  warnings TEXT,
  default_sets INTEGER NOT NULL DEFAULT 3,
  default_reps INTEGER NOT NULL DEFAULT 10,
  difficulty TEXT NOT NULL DEFAULT 'beginner',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. minigames
CREATE TABLE IF NOT EXISTS public.minigames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. minigame_questions
CREATE TABLE IF NOT EXISTS public.minigame_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minigame_id UUID REFERENCES public.minigames(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL,
  answer TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. modpacks
CREATE TABLE IF NOT EXISTS public.modpacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. modpack_items
CREATE TABLE IF NOT EXISTS public.modpack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modpack_id UUID NOT NULL REFERENCES public.modpacks(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER NOT NULL DEFAULT 10,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kiosk_devices (defined before courses to satisfy FK references)
CREATE TABLE IF NOT EXISTS public.kiosk_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  token_hash TEXT NOT NULL,
  pairing_code_hash TEXT,
  paired_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. courses
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES public.profiles(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weekdays SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_time TIME,
  kiosk_id UUID REFERENCES public.kiosk_devices(id) ON DELETE SET NULL,
  include_minigame BOOLEAN NOT NULL DEFAULT false,
  modpack_id UUID REFERENCES public.modpacks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_courses_patient_version UNIQUE (patient_id, version),
  CONSTRAINT chk_courses_dates CHECK (end_date >= start_date)
);

-- 12. course_items (snapshot ณ ตอนมอบหมาย)
CREATE TABLE IF NOT EXISTS public.course_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER NOT NULL DEFAULT 10,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. mission_runs
CREATE TABLE IF NOT EXISTS public.mission_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. mission_steps
CREATE TABLE IF NOT EXISTS public.mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_run_id UUID NOT NULL REFERENCES public.mission_runs(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL CHECK (step_type IN ('exercise', 'minigame')),
  ref_id UUID,
  completed_at TIMESTAMPTZ,
  score JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. medical_notes (append-only)
CREATE TABLE IF NOT EXISTS public.medical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. treatment_results (append-only, versioned)
CREATE TABLE IF NOT EXISTS public.treatment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  supersedes_id UUID REFERENCES public.treatment_results(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. consents
CREATE TABLE IF NOT EXISTS public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('patient', 'staff')),
  subject_id UUID NOT NULL,
  type TEXT NOT NULL,
  text_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. face_enrollments
CREATE TABLE IF NOT EXISTS public.face_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'superseded')),
  consent_id UUID REFERENCES public.consents(id),
  model_version TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. face_templates
CREATE TABLE IF NOT EXISTS public.face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.face_enrollments(id) ON DELETE CASCADE,
  embedding extensions.vector(512) NOT NULL,
  pose pose_type NOT NULL,
  quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. face_challenges
CREATE TABLE IF NOT EXISTS public.face_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT NOT NULL UNIQUE,
  device_id UUID NOT NULL,
  steps JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. enrollment_tickets
CREATE TABLE IF NOT EXISTS public.enrollment_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kiosk_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. checkins
CREATE TABLE IF NOT EXISTS public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kiosk_id UUID,
  checked_in_by UUID NOT NULL REFERENCES public.profiles(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, date)
);



-- 24. staff_devices
CREATE TABLE IF NOT EXISTS public.staff_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

-- 25. staff_calls
CREATE TABLE IF NOT EXISTS public.staff_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id UUID NOT NULL REFERENCES public.kiosk_devices(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_by UUID REFERENCES public.profiles(id),
  handled_at TIMESTAMPTZ
);

-- 26. bans
CREATE TABLE IF NOT EXISTS public.bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type ban_type NOT NULL,
  value TEXT NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, value)
);

-- 27. audit_logs (insert-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  ip TEXT,
  device_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. INDEXES (GIN Trigram on first_name, last_name, hn, phone; HNSW on face_templates)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patients_trgm ON public.patients USING gin (
  first_name extensions.gin_trgm_ops,
  last_name extensions.gin_trgm_ops,
  hn extensions.gin_trgm_ops,
  phone extensions.gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_patients_hn ON public.patients (hn);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients (phone);
CREATE INDEX IF NOT EXISTS idx_face_templates_hnsw ON public.face_templates USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_courses_patient_date ON public.courses (patient_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_mission_runs_patient_date ON public.mission_runs (patient_id, run_date);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON public.checkins (date);
CREATE INDEX IF NOT EXISTS idx_bans_lookup ON public.bans (type, value);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- ============================================================================
-- 6. SECURITY DEFINER FUNCTIONS & INVARIANTS (Strict search_path = '')
-- ============================================================================

-- Role extraction: Deny (return NULL) if no profile or status != 'active' (Item A4 & 3)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_status public.profile_status;
BEGIN
  SELECT p.role, p.status INTO v_role, v_status
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN NULL;
  END IF;

  RETURN v_role;
END;
$$;

-- PT Patient Accessibility Check (Responsible PT, Assignment, or Active Transfer)
CREATE OR REPLACE FUNCTION public.is_patient_accessible_by_pt(p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
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

-- Match Face Candidates: Returns score per patient = AVG of top 3 scores (Spec 7.4.4 & Item B1)
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
SET search_path = ''
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

-- Atomic Face Enrollment RPC (Item B2: Sets 'active' if demographics complete, else 'face_enrolled')
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
SET search_path = ''
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
  SET status = 'superseded'
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

  -- 4. Check if patient demographic data is complete per Spec 7.3.7:
  -- Complete: first_name, last_name, age > 0, sex, and injury are all provided.
  SELECT (first_name IS NOT NULL AND length(trim(first_name)) > 0 AND
          last_name IS NOT NULL AND length(trim(last_name)) > 0 AND
          age IS NOT NULL AND age > 0 AND
          sex IS NOT NULL AND length(trim(sex::text)) > 0 AND
          injury IS NOT NULL AND length(trim(injury)) > 0)
  INTO v_is_complete
  FROM public.patients
  WHERE id = p_patient_id;

  -- Atomic compare-and-set on registration_status:
  -- Allowed source states: 'awaiting_face', 'face_enrolled', 'active' (supports re-enrollment).
  -- Rejected state: 'archived' (or patient not found) -> RAISE EXCEPTION and rollback.
  IF v_is_complete THEN
    UPDATE public.patients
    SET registration_status = 'active', started_at = COALESCE(started_at, now())
    WHERE id = p_patient_id AND registration_status IN ('awaiting_face', 'face_enrolled', 'active');
  ELSE
    UPDATE public.patients
    SET registration_status = 'face_enrolled'
    WHERE id = p_patient_id AND registration_status IN ('awaiting_face', 'face_enrolled', 'active');
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient % is archived or does not exist. Re-enrollment denied.', p_patient_id;
  END IF;

  -- 5. Mark enrollment ticket used if provided
  IF p_ticket_id IS NOT NULL THEN
    UPDATE public.enrollment_tickets
    SET used_at = now()
    WHERE id = p_ticket_id AND used_at IS NULL;
  END IF;

  RETURN v_enrollment_id;
END;
$$;

-- ============================================================================
-- 7. APPEND-ONLY & OWNERSHIP TRIGGERS (Item A4: Distinct checks & service_role bypass)
-- ============================================================================

-- Profile update privilege check: Disallow PT from altering role, status, force_logout_at
CREATE OR REPLACE FUNCTION public.check_profile_update_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- Allow service_role and postgres superuser directly (SECURITY INVOKER)
  IF CURRENT_USER IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();

  -- Fail-closed: Only 'admin' role may modify role, status, or force_logout_at.
  -- If role is NULL (unauthenticated, no profile, suspended/archived) or 'pt', disallow.
  IF v_role IS DISTINCT FROM 'admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Permission denied: non-admin users cannot modify role.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Permission denied: non-admin users cannot modify status.';
    END IF;
    IF NEW.force_logout_at IS DISTINCT FROM OLD.force_logout_at THEN
      RAISE EXCEPTION 'Permission denied: non-admin users cannot modify force_logout_at.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_profile_update_privileges ON public.profiles;
CREATE TRIGGER trg_check_profile_update_privileges
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_profile_update_privileges();

-- Content ownership enforcement (Item A4: IS DISTINCT FROM & service_role bypass)
CREATE OR REPLACE FUNCTION public.enforce_content_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_uid UUID;
BEGIN
  -- Allow service_role and postgres superuser directly (SECURITY INVOKER)
  IF CURRENT_USER IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  v_uid := (SELECT auth.uid());

  IF v_role = 'admin' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'pt' THEN
    IF OLD.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Permission denied: PT can only modify or delete items they created.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Permission denied: unauthenticated or invalid staff role.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_exercise_ownership ON public.exercises;
CREATE TRIGGER trg_check_exercise_ownership
BEFORE UPDATE OR DELETE ON public.exercises
FOR EACH ROW EXECUTE FUNCTION public.enforce_content_ownership();

DROP TRIGGER IF EXISTS trg_check_minigame_ownership ON public.minigames;
CREATE TRIGGER trg_check_minigame_ownership
BEFORE UPDATE OR DELETE ON public.minigames
FOR EACH ROW EXECUTE FUNCTION public.enforce_content_ownership();

DROP TRIGGER IF EXISTS trg_check_modpack_ownership ON public.modpacks;
CREATE TRIGGER trg_check_modpack_ownership
BEFORE UPDATE OR DELETE ON public.modpacks
FOR EACH ROW EXECUTE FUNCTION public.enforce_content_ownership();

-- Course modification enforcement (Item B4: Checks is_patient_accessible_by_pt on INSERT/UPDATE)
CREATE OR REPLACE FUNCTION public.check_course_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_uid UUID;
BEGIN
  -- Allow service_role and postgres superuser directly (SECURITY INVOKER)
  IF CURRENT_USER IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  v_uid := (SELECT auth.uid());

  IF v_role = 'admin' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'pt' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      IF OLD.pt_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Permission denied: PT can only modify or delete courses where pt_id = auth.uid().';
      END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      IF NEW.pt_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Permission denied: PT can only assign courses to themselves (pt_id = auth.uid()).';
      END IF;
      IF NOT public.is_patient_accessible_by_pt(NEW.patient_id) THEN
        RAISE EXCEPTION 'Permission denied: PT cannot assign or modify courses for patients not under their active care.';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Permission denied: unauthenticated or invalid staff role.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_course_ownership ON public.courses;
CREATE TRIGGER trg_check_course_ownership
BEFORE INSERT OR UPDATE OR DELETE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.check_course_ownership();

-- Append-only trigger for audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are insert-only. Modification is strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_logs_tampering();

-- Append-only trigger for medical_notes
CREATE OR REPLACE FUNCTION public.prevent_medical_notes_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Medical notes are append-only. Modification is strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_medical_notes_immutable ON public.medical_notes;
CREATE TRIGGER trg_medical_notes_immutable
BEFORE UPDATE OR DELETE ON public.medical_notes
FOR EACH ROW EXECUTE FUNCTION public.prevent_medical_notes_tampering();

-- Append-only trigger for treatment_results
CREATE OR REPLACE FUNCTION public.prevent_treatment_results_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Treatment results are append-only. Modification is strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_treatment_results_immutable ON public.treatment_results;
CREATE TRIGGER trg_treatment_results_immutable
BEFORE UPDATE OR DELETE ON public.treatment_results
FOR EACH ROW EXECUTE FUNCTION public.prevent_treatment_results_tampering();

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all 27 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_pt_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minigames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minigame_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modpacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modpack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. profiles
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()));

-- 2. pts
CREATE POLICY "pts_select_authenticated" ON public.pts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pts_admin_all" ON public.pts
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()));

-- 3. patients
CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR public.is_patient_accessible_by_pt(id));
CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'pt'));
CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR public.is_patient_accessible_by_pt(id))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR public.is_patient_accessible_by_pt(id));

-- 4. patient_pt_assignments
CREATE POLICY "assignments_select" ON public.patient_pt_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignments_admin_pt_manage" ON public.patient_pt_assignments
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'pt'));

-- 5. case_transfers
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

-- 6. exercises
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

-- 7. minigames
CREATE POLICY "minigames_select" ON public.minigames
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "minigames_all" ON public.minigames
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

-- 8. minigame_questions
CREATE POLICY "minigame_questions_select" ON public.minigame_questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "minigame_questions_all" ON public.minigame_questions
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

-- 9. modpacks
CREATE POLICY "modpacks_select" ON public.modpacks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "modpacks_all" ON public.modpacks
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

-- 10. modpack_items
CREATE POLICY "modpack_items_select" ON public.modpack_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "modpack_items_all" ON public.modpack_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 11. courses (Item B4: Checks is_patient_accessible_by_pt on INSERT and UPDATE)
CREATE POLICY "courses_select" ON public.courses
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR pt_id = (SELECT auth.uid()) OR public.is_patient_accessible_by_pt(patient_id));

CREATE POLICY "courses_insert" ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND public.is_patient_accessible_by_pt(patient_id)
    )
  );

CREATE POLICY "courses_update" ON public.courses
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND public.is_patient_accessible_by_pt(patient_id)
    )
  )
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND public.is_patient_accessible_by_pt(patient_id)
    )
  );

CREATE POLICY "courses_delete" ON public.courses
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR ((SELECT public.current_user_role()) = 'pt' AND pt_id = (SELECT auth.uid())));

-- 12. course_items
CREATE POLICY "course_items_select" ON public.course_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "course_items_all" ON public.course_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 13. mission_runs (Spec Section 9: Server/Kiosk recorded only, SELECT only for authenticated)
CREATE POLICY "mission_runs_select" ON public.mission_runs
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR public.is_patient_accessible_by_pt(patient_id));

-- 14. mission_steps (Spec Section 9: Server/Kiosk recorded only, SELECT only for authenticated)
CREATE POLICY "mission_steps_select" ON public.mission_steps
  FOR SELECT TO authenticated USING (true);

-- 15. medical_notes (append-only)
CREATE POLICY "medical_notes_select" ON public.medical_notes
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR public.is_patient_accessible_by_pt(patient_id));
CREATE POLICY "medical_notes_insert" ON public.medical_notes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'pt' AND author_id = (SELECT auth.uid()));

-- 16. treatment_results (append-only, versioned)
CREATE POLICY "treatment_results_select" ON public.treatment_results
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR public.is_patient_accessible_by_pt(patient_id));
CREATE POLICY "treatment_results_insert" ON public.treatment_results
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'pt' AND author_id = (SELECT auth.uid()));

-- 17. consents (Client Decision B3 & Rule 2.12: Accessible by admin and assigned PT)
CREATE POLICY "consents_select" ON public.consents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (subject_type = 'patient' AND public.is_patient_accessible_by_pt(subject_id))
    OR (subject_type = 'staff' AND subject_id = (SELECT auth.uid()))
  );

CREATE POLICY "consents_insert" ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR ((SELECT public.current_user_role()) = 'pt' AND subject_type = 'patient' AND public.is_patient_accessible_by_pt(subject_id))
  );

CREATE POLICY "consents_update" ON public.consents
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR ((SELECT public.current_user_role()) = 'pt' AND subject_type = 'patient' AND public.is_patient_accessible_by_pt(subject_id))
  )
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR ((SELECT public.current_user_role()) = 'pt' AND subject_type = 'patient' AND public.is_patient_accessible_by_pt(subject_id))
  );

CREATE POLICY "consents_delete" ON public.consents
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin');

-- 22. checkins (Client Decision B3 & Rule 2.12: Accessible by admin and assigned PT)
CREATE POLICY "checkins_select" ON public.checkins
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR public.is_patient_accessible_by_pt(patient_id)
  );

CREATE POLICY "checkins_insert" ON public.checkins
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND checked_in_by = (SELECT auth.uid())
      AND public.is_patient_accessible_by_pt(patient_id)
    )
  );

CREATE POLICY "checkins_update" ON public.checkins
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND checked_in_by = (SELECT auth.uid())
      AND public.is_patient_accessible_by_pt(patient_id)
    )
  )
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND checked_in_by = (SELECT auth.uid())
      AND public.is_patient_accessible_by_pt(patient_id)
    )
  );

CREATE POLICY "checkins_delete" ON public.checkins
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin');

-- ============================================================================
-- 9. STORAGE BUCKETS & POLICIES (All Private per Spec Section 4)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', false, 5242880, ARRAY['image/jpeg', 'image/png']),
  ('biometric-data', 'biometric-data', false, 15728640, ARRAY['image/jpeg']),
  ('exercise-media', 'exercise-media', false, 52428800, ARRAY['image/jpeg', 'image/png', 'video/mp4'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Avatars Policies (storage.objects)
CREATE POLICY "avatars_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = (SELECT auth.uid()::text) OR
    (SELECT public.current_user_role()) = 'admin'
  ));

CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = (SELECT auth.uid()::text) OR
    (SELECT public.current_user_role()) = 'admin'
  ));

CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = (SELECT auth.uid()::text) OR
    (SELECT public.current_user_role()) = 'admin'
  ));

-- Exercise Media Policies (storage.objects)
CREATE POLICY "exercise_media_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'exercise-media');

CREATE POLICY "exercise_media_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'exercise-media' AND (SELECT public.current_user_role()) = 'admin')
  WITH CHECK (bucket_id = 'exercise-media' AND (SELECT public.current_user_role()) = 'admin');

-- Biometric-Data: Strictly Private - Zero client policies for authenticated or anon!

-- ============================================================================
-- 10. PRIVILEGES, BLANKET REVOCATIONS & ALLOWLIST GRANTS (Items A1, A2, A3)
-- (Strict Order: All objects created above -> Blanket Revoke -> Explicit Grants)
-- ============================================================================

-- A. Revoke all privileges on public & extensions schemas
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA extensions FROM PUBLIC, anon;

-- B. ALTER DEFAULT PRIVILEGES (FOR ROLE postgres and supabase_admin - Item A2 & A5)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    BEGIN
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON ROUTINES FROM PUBLIC, anon, authenticated;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping ALTER DEFAULT PRIVILEGES for supabase_admin: insufficient privilege';
    END;
  END IF;
END $$;

-- C. SCHEMA USAGE & EXTENSION FUNCTION GRANTS (Item A3 & A4)
GRANT USAGE ON SCHEMA public TO postgres, service_role, authenticated;
GRANT USAGE ON SCHEMA extensions TO postgres, service_role, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, service_role, authenticated;
REVOKE ALL ON SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON SCHEMA extensions FROM anon, PUBLIC;

-- D. SERVICE_ROLE FULL PERMISSIONS (Item A3: Re-grant after any schema reset)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- E. ALLOWLIST TABLE GRANTS FOR AUTHENTICATED (18 tables strictly scoped)
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, bio) ON public.profiles TO authenticated;
GRANT SELECT ON public.pts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patients TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patient_pt_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.case_transfers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minigames TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minigame_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modpacks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modpack_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.course_items TO authenticated;
GRANT SELECT ON public.mission_runs TO authenticated;
GRANT SELECT ON public.mission_steps TO authenticated;
GRANT SELECT, INSERT ON public.medical_notes TO authenticated;
GRANT SELECT, INSERT ON public.treatment_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.checkins TO authenticated;

-- F. SEQUENCE USAGE FOR AUTHENTICATED
GRANT USAGE, SELECT ON SEQUENCE patient_hn_seq TO authenticated;

-- G. SPECIFIC FUNCTION EXECUTE GRANTS (Item A1: Named individually, NO "ALL")
-- 1. Helper functions required by RLS policies:
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_patient_accessible_by_pt(UUID) TO authenticated, service_role;

-- 2. Biometric server-side RPCs strictly restricted to service_role:
REVOKE ALL ON FUNCTION public.match_face_candidates(extensions.vector, UUID[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_face_candidates(extensions.vector, UUID[], INT) TO service_role;

REVOKE ALL ON FUNCTION public.enroll_face_atomic(UUID, UUID, TEXT, public.pose_type[], extensions.vector[], UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_face_atomic(UUID, UUID, TEXT, public.pose_type[], extensions.vector[], UUID, UUID) TO service_role;

-- H. STRICT SWEEP REVOKE FOR PRIVATE TABLES (Zero access to anon or authenticated)
REVOKE ALL ON public.face_enrollments FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.face_templates FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.face_challenges FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.enrollment_tickets FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.kiosk_devices FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.staff_devices FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.staff_calls FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.bans FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.audit_logs FROM anon, authenticated, PUBLIC;
