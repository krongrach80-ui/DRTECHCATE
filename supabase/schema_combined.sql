-- ========================================================================
-- DrTech.Care Physical Therapy System - Full Idempotent Schema
-- Generated for Supabase SQL Editor execution
-- ========================================================================

-- >>> BEGIN 20261022000001_extensions_and_enums.sql <<<
-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 01: Extensions, Enums, Sequences
-- ========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('admin', 'pt');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE staff_status AS ENUM ('active', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE patient_registration_status AS ENUM (
    'awaiting_face',
    'face_enrolled',
    'active',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE patient_registered_via AS ENUM ('reception', 'kiosk');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE face_pose AS ENUM ('front', 'left', 'right', 'nod');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE face_enrollment_status AS ENUM ('pending', 'completed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE course_status AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE mission_status AS ENUM ('pending', 'in_progress', 'completed', 'missed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE mission_step_type AS ENUM ('physio', 'minigame');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE case_transfer_status AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ban_type AS ENUM ('ip', 'device', 'account');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. SEQUENCE FOR HOSPITAL NUMBER (HN)
-- Locked Decision #5: HN must be issued from a database sequence (never random or timestamp)
CREATE SEQUENCE IF NOT EXISTS patient_hn_seq START WITH 100001 INCREMENT BY 1;


-- >>> BEGIN 20261022000002_core_schema.sql <<<
-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 02: Core Schema (All 27 Tables and Performance Indexes)
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. PROFILES (Staff only: Admin, PT - maps 1:1 with auth.users)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role staff_role NOT NULL,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  status staff_status DEFAULT 'active' NOT NULL,
  force_logout_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 2. PTS (Physiotherapist Professional Credentials)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pts (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  license_no TEXT NOT NULL,
  license_expiry DATE,
  specialty TEXT,
  age INT,
  sex TEXT CHECK (sex IN ('male', 'female', 'other')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 3. PATIENTS (Standalone table - No auth.users account - Decision #6)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hn TEXT UNIQUE NOT NULL DEFAULT ('HN' || lpad(nextval('patient_hn_seq')::text, 6, '0')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INT,
  sex TEXT CHECK (sex IN ('male', 'female', 'other')),
  phone TEXT,
  history JSONB DEFAULT '{}'::jsonb NOT NULL,
  injury TEXT,
  responsible_pt_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  registration_status patient_registration_status DEFAULT 'awaiting_face' NOT NULL,
  registered_via patient_registered_via DEFAULT 'reception' NOT NULL,
  pending_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 4. PATIENT_PT_ASSIGNMENTS (Primary assignment relationship)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_pt_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_patient_pt UNIQUE (patient_id, pt_id)
);

-- ------------------------------------------------------------------------
-- 5. CASE_TRANSFERS (Temporary case delegation)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  from_pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  status case_transfer_status DEFAULT 'active' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ck_transfer_dates CHECK (end_date >= start_date)
);

-- ------------------------------------------------------------------------
-- 6. EXERCISES (Physiotherapy library catalog)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  image_path TEXT,
  description TEXT,
  target_joint TEXT,
  suitable_for TEXT,
  warnings TEXT,
  default_sets INT DEFAULT 3 NOT NULL,
  default_reps INT DEFAULT 10 NOT NULL,
  difficulty TEXT DEFAULT 'beginner' NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 7. MINIGAMES (Cognitive and physical minigames)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS minigames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 8. MINIGAME_QUESTIONS (Minigame trivia/exercise questions)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS minigame_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minigame_id UUID NOT NULL REFERENCES minigames(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL,
  answer TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 9. MODPACKS (Curated exercise bundles)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modpacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 10. MODPACK_ITEMS (Items within a modpack)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modpack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modpack_id UUID NOT NULL REFERENCES modpacks(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  sets INT NOT NULL,
  reps INT NOT NULL,
  position INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_modpack_item_pos UNIQUE (modpack_id, position)
);

-- ------------------------------------------------------------------------
-- 23. KIOSK_DEVICES (Pre-declared for courses foreign key reference)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kiosk_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  token_hash TEXT UNIQUE NOT NULL,
  pairing_code_hash TEXT,
  paired_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 11. COURSES (Prescription treatment plans)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weekdays SMALLINT[] NOT NULL,
  start_time TIME,
  kiosk_id UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL,
  include_minigame BOOLEAN DEFAULT false NOT NULL,
  modpack_id UUID REFERENCES modpacks(id) ON DELETE SET NULL,
  status course_status DEFAULT 'active' NOT NULL,
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ck_course_dates CHECK (end_date >= start_date)
);

-- ------------------------------------------------------------------------
-- 12. COURSE_ITEMS (Snapshot of prescribed exercises at time of assignment)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  sets INT NOT NULL,
  reps INT NOT NULL,
  position INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 13. MISSION_RUNS (Daily check-in mission executions)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  status mission_status DEFAULT 'pending' NOT NULL,
  pain_score INT,
  feedback TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_mission_run_date UNIQUE (patient_id, course_id, run_date)
);

-- ------------------------------------------------------------------------
-- 14. MISSION_STEPS (Individual step completion within a mission run)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES mission_runs(id) ON DELETE CASCADE,
  step_type mission_step_type NOT NULL,
  ref_id UUID,
  completed_at TIMESTAMPTZ,
  score JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 15. MEDICAL_NOTES (Append-only physical therapist clinical notes)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 16. TREATMENT_RESULTS (Append-only, Versioned treatment outcomes)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treatment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  version INT NOT NULL,
  body TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES profiles(id),
  supersedes_id UUID REFERENCES treatment_results(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_treatment_version UNIQUE (patient_id, version)
);

-- ------------------------------------------------------------------------
-- 17. CONSENTS (PDPA consent tracking)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT DEFAULT 'patient' NOT NULL,
  subject_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 18. FACE_ENROLLMENTS (Biometric registration session)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS face_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  status face_enrollment_status DEFAULT 'pending' NOT NULL,
  consent_id UUID REFERENCES consents(id) ON DELETE SET NULL,
  model_version TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 19. FACE_TEMPLATES (512-dimensional face biometric embeddings)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES face_enrollments(id) ON DELETE CASCADE,
  embedding vector(512) NOT NULL,
  pose face_pose NOT NULL,
  quality JSONB DEFAULT '{}'::jsonb NOT NULL,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 20. FACE_CHALLENGES (Short-lived liveness challenge nonces)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS face_challenges (
  nonce TEXT PRIMARY KEY,
  device_id UUID REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  steps JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 21. ENROLLMENT_TICKETS (Reception dispatch to specific kiosk)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollment_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kiosk_id UUID NOT NULL REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------
-- 22. CHECKINS (Counter check-ins for candidate set pruning)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kiosk_id UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL,
  checked_in_by UUID REFERENCES profiles(id),
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_patient_daily_checkin UNIQUE (patient_id, date)
);

-- ------------------------------------------------------------------------
-- 24. STAFF_DEVICES (Staff device identification and cookie tracking)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  first_seen TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_seen TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_agent_summary TEXT,
  CONSTRAINT uq_staff_device UNIQUE (user_id, device_id)
);

-- ------------------------------------------------------------------------
-- 25. STAFF_CALLS (Patient assistance requests from kiosks)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id UUID NOT NULL REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  handled_by UUID REFERENCES profiles(id),
  handled_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------
-- 26. BANS (Security ban list: IP, Device, Account)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type ban_type NOT NULL,
  value TEXT NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_ban_type_val UNIQUE (type, value)
);

-- ------------------------------------------------------------------------
-- 27. AUDIT_LOGS (Insert-only compliance & security audit trails)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  ip TEXT,
  device_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ========================================================================
-- INDEXES FOR PERFORMANCE AND COMPLIANCE
-- ========================================================================

-- GIN Trigram Search Indexes for Thai and English names, HN, phone
CREATE INDEX IF NOT EXISTS idx_patients_trgm_name ON patients USING gin (
  first_name gin_trgm_ops,
  last_name gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_patients_trgm_hn ON patients USING gin (hn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_trgm_phone ON patients USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(registration_status);
CREATE INDEX IF NOT EXISTS idx_patients_responsible_pt ON patients(responsible_pt_id);

-- Vector HNSW Cosine Similarity Index on 512-dim face embeddings
CREATE INDEX IF NOT EXISTS idx_face_templates_hnsw_cosine ON face_templates USING hnsw (
  embedding vector_cosine_ops
);
CREATE INDEX IF NOT EXISTS idx_face_templates_patient ON face_templates(patient_id);
CREATE INDEX IF NOT EXISTS idx_face_templates_enrollment ON face_templates(enrollment_id);

-- Operational indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_courses_patient ON courses(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_courses_pt ON courses(pt_id, status);
CREATE INDEX IF NOT EXISTS idx_courses_dates ON courses(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_case_transfers_active ON case_transfers(to_pt_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_medical_notes_patient ON medical_notes(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_treatment_results_patient ON treatment_results(patient_id, version);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date, patient_id);
CREATE INDEX IF NOT EXISTS idx_face_challenges_expires ON face_challenges(expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_tickets_kiosk ON enrollment_tickets(kiosk_id, expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_staff_calls_unhandled ON staff_calls(handled_at, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bans_lookup ON bans(type, value, expires_at);


-- >>> BEGIN 20261022000003_triggers_and_invariants.sql <<<
-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 03: Database Triggers, Immutability & Business Invariants
-- ========================================================================

-- ------------------------------------------------------------------------
-- 0. SECURITY DEFINER HELPER FUNCTIONS FOR INVARIANTS & RLS
-- ------------------------------------------------------------------------

-- Get current authenticated user's staff role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS staff_role AS $$
DECLARE
  v_role staff_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if a patient is actively accessible by calling PT
-- Locked Decision #1: Assigned PT or active temporary case transfer
CREATE OR REPLACE FUNCTION is_patient_accessible_by_pt(p_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin has global access to all patients
  IF current_user_role() = 'admin' THEN
    RETURN true;
  END IF;

  -- Caller must be a registered PT
  IF current_user_role() <> 'pt' THEN
    RETURN false;
  END IF;

  -- Check primary or secondary assignment
  IF EXISTS (
    SELECT 1 FROM patient_pt_assignments
    WHERE patient_id = p_patient_id AND pt_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Check active case delegation within active date window
  IF EXISTS (
    SELECT 1 FROM case_transfers
    WHERE patient_id = p_patient_id
      AND to_pt_id = auth.uid()
      AND status = 'active'
      AND CURRENT_DATE >= start_date
      AND CURRENT_DATE <= end_date
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------------------
-- 1. IMMUTABILITY TRIGGER: MEDICAL NOTES (APPEND-ONLY)
-- Locked Decision #2 & Section 4: No UPDATE/DELETE permitted under any circumstance
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_prevent_medical_notes_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Medical notes are append-only. UPDATE and DELETE operations are strictly prohibited by hospital compliance policy.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_medical_notes_modification ON medical_notes;
CREATE TRIGGER trg_prevent_medical_notes_modification
BEFORE UPDATE OR DELETE ON medical_notes
FOR EACH ROW EXECUTE FUNCTION trg_fn_prevent_medical_notes_modification();

-- ------------------------------------------------------------------------
-- 2. IMMUTABILITY TRIGGER: TREATMENT RESULTS (APPEND-ONLY, VERSIONED)
-- Locked Decision #2 & Section 4: Updates require inserting a new version
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_prevent_treatment_results_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Treatment results are append-only and versioned. UPDATE and DELETE operations are strictly prohibited. Insert a new version with supersedes_id instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_treatment_results_modification ON treatment_results;
CREATE TRIGGER trg_prevent_treatment_results_modification
BEFORE UPDATE OR DELETE ON treatment_results
FOR EACH ROW EXECUTE FUNCTION trg_fn_prevent_treatment_results_modification();

-- ------------------------------------------------------------------------
-- 3. IMMUTABILITY TRIGGER: AUDIT LOGS (INSERT-ONLY)
-- Section 4: Audit trails are strictly insert-only
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_prevent_audit_logs_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are insert-only. UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_logs_modification ON audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_modification
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION trg_fn_prevent_audit_logs_modification();

-- ------------------------------------------------------------------------
-- 4. OWNERSHIP TRIGGER: EXERCISES
-- Section 4: PT can update/delete only rows where created_by is themselves
-- Admin can update/delete any exercise without restriction
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enforce_exercise_ownership()
RETURNS TRIGGER AS $$
DECLARE
  v_role staff_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete exercises they personally created.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_exercise_ownership ON exercises;
CREATE TRIGGER trg_enforce_exercise_ownership
BEFORE UPDATE OR DELETE ON exercises
FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_exercise_ownership();

-- ------------------------------------------------------------------------
-- 5. OWNERSHIP TRIGGER: MINIGAMES
-- Section 4: PT can update/delete only minigames where created_by is themselves
-- Admin can update/delete any minigame
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enforce_minigame_ownership()
RETURNS TRIGGER AS $$
DECLARE
  v_role staff_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete minigames they personally created.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_minigame_ownership ON minigames;
CREATE TRIGGER trg_enforce_minigame_ownership
BEFORE UPDATE OR DELETE ON minigames
FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_minigame_ownership();

-- ------------------------------------------------------------------------
-- 6. OWNERSHIP TRIGGER: MINIGAME QUESTIONS
-- Section 4: PT can update/delete only questions where created_by is themselves
-- Admin can update/delete any question
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enforce_minigame_question_ownership()
RETURNS TRIGGER AS $$
DECLARE
  v_role staff_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete questions they personally created.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_minigame_question_ownership ON minigame_questions;
CREATE TRIGGER trg_enforce_minigame_question_ownership
BEFORE UPDATE OR DELETE ON minigame_questions
FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_minigame_question_ownership();

-- ------------------------------------------------------------------------
-- 7. OWNERSHIP TRIGGER: MODPACKS
-- Section 4: PT can update/delete only modpacks where created_by is themselves
-- Admin can update/delete any modpack
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enforce_modpack_ownership()
RETURNS TRIGGER AS $$
DECLARE
  v_role staff_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete modpacks they personally created.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_modpack_ownership ON modpacks;
CREATE TRIGGER trg_enforce_modpack_ownership
BEFORE UPDATE OR DELETE ON modpacks
FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_modpack_ownership();

-- ------------------------------------------------------------------------
-- 8. COURSE PRESCRIPTION INVARIANT TRIGGER
-- Section 4 & 8.2: PT can ONLY create/assign a course to a patient they actively manage
-- PT cannot prescribe on behalf of another PT
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enforce_course_assignment_permission()
RETURNS TRIGGER AS $$
DECLARE
  v_role staff_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role = 'pt' THEN
    IF NOT is_patient_accessible_by_pt(NEW.patient_id) THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapist cannot create or assign a course to a patient who is not under their active care.';
    END IF;
    IF NEW.pt_id <> auth.uid() THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapist cannot assign a course under another PT ID.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_course_assignment_permission ON courses;
CREATE TRIGGER trg_enforce_course_assignment_permission
BEFORE INSERT OR UPDATE ON courses
FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_course_assignment_permission();

-- ------------------------------------------------------------------------
-- 9. AUTO-UPDATE UPDATED_AT TRIGGER
-- Automatically updates updated_at column on row update
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION trg_fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_pts_updated_at ON pts;
CREATE TRIGGER trg_pts_updated_at BEFORE UPDATE ON pts
FOR EACH ROW EXECUTE FUNCTION trg_fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_patients_updated_at ON patients;
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION trg_fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_exercises_updated_at ON exercises;
CREATE TRIGGER trg_exercises_updated_at BEFORE UPDATE ON exercises
FOR EACH ROW EXECUTE FUNCTION trg_fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_minigames_updated_at ON minigames;
CREATE TRIGGER trg_minigames_updated_at BEFORE UPDATE ON minigames
FOR EACH ROW EXECUTE FUNCTION trg_fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_modpacks_updated_at ON modpacks;
CREATE TRIGGER trg_modpacks_updated_at BEFORE UPDATE ON modpacks
FOR EACH ROW EXECUTE FUNCTION trg_fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses
FOR EACH ROW EXECUTE FUNCTION trg_fn_touch_updated_at();


-- >>> BEGIN 20261022000004_rls_and_policies.sql <<<
-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 04: Row-Level Security (RLS) & Granular Access Policies
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. REVOKE PRIVILEGES FROM ANON & PUBLIC (Zero-Trust Rule #6)
-- ------------------------------------------------------------------------
-- Revoke all existing permissions from anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Revoke default privileges on future objects across the database (without IN SCHEMA)
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

-- Revoke default privileges on future objects in schema public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM PUBLIC, anon;

-- Revoke execute on helper functions from public/anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_patient_accessible_by_pt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_patient_accessible_by_pt(UUID) TO authenticated;

-- Revoke all table permissions on strictly backend-only tables from authenticated (Defense-in-depth)
-- Spec Section 4: face_*, enrollment_tickets, kiosk_devices, staff_*, bans
REVOKE ALL ON TABLE face_enrollments, face_templates, face_challenges, enrollment_tickets, kiosk_devices, staff_devices, staff_calls, bans FROM authenticated;

-- ------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY ON ALL 27 TABLES
-- ------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pts ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_pt_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE minigames ENABLE ROW LEVEL SECURITY;
ALTER TABLE minigame_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE modpacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE modpack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------
-- 3. POLICIES: PROFILES & PTS
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_update_admin_or_self" ON profiles;
CREATE POLICY "profiles_update_admin_or_self" ON profiles
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'admin' OR id = auth.uid())
  WITH CHECK (current_user_role() = 'admin' OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin_write" ON profiles;
CREATE POLICY "profiles_admin_write" ON profiles
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS "pts_select_authenticated" ON pts;
CREATE POLICY "pts_select_authenticated" ON pts
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "pts_update_admin_or_self" ON pts;
CREATE POLICY "pts_update_admin_or_self" ON pts
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'admin' OR user_id = auth.uid())
  WITH CHECK (current_user_role() = 'admin' OR user_id = auth.uid());

DROP POLICY IF EXISTS "pts_admin_write" ON pts;
CREATE POLICY "pts_admin_write" ON pts
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ------------------------------------------------------------------------
-- 4. POLICIES: PATIENTS & ASSIGNMENTS
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "patients_select_policy" ON patients;
CREATE POLICY "patients_select_policy" ON patients
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(id));

DROP POLICY IF EXISTS "patients_insert_policy" ON patients;
CREATE POLICY "patients_insert_policy" ON patients
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND responsible_pt_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "patients_update_policy" ON patients;
CREATE POLICY "patients_update_policy" ON patients
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(id))
  WITH CHECK (current_user_role() = 'admin' OR is_patient_accessible_by_pt(id));

DROP POLICY IF EXISTS "patient_pt_assignments_select" ON patient_pt_assignments;
CREATE POLICY "patient_pt_assignments_select" ON patient_pt_assignments
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR pt_id = auth.uid());

DROP POLICY IF EXISTS "patient_pt_assignments_manage" ON patient_pt_assignments;
CREATE POLICY "patient_pt_assignments_manage" ON patient_pt_assignments
  FOR ALL TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND pt_id = auth.uid()
    )
  )
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND pt_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------
-- 5. POLICIES: CASE TRANSFERS
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "case_transfers_select" ON case_transfers;
CREATE POLICY "case_transfers_select" ON case_transfers
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'admin' OR
    from_pt_id = auth.uid() OR
    to_pt_id = auth.uid()
  );

DROP POLICY IF EXISTS "case_transfers_insert" ON case_transfers;
CREATE POLICY "case_transfers_insert" ON case_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND from_pt_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "case_transfers_update" ON case_transfers;
CREATE POLICY "case_transfers_update" ON case_transfers
  FOR UPDATE TO authenticated
  USING (
    current_user_role() = 'admin' OR
    from_pt_id = auth.uid() OR
    to_pt_id = auth.uid()
  )
  WITH CHECK (
    current_user_role() = 'admin' OR
    from_pt_id = auth.uid() OR
    to_pt_id = auth.uid()
  );

-- ------------------------------------------------------------------------
-- 6. POLICIES: EXERCISES, MINIGAMES, MODPACKS
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "exercises_select_authenticated" ON exercises;
CREATE POLICY "exercises_select_authenticated" ON exercises
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "exercises_insert_authenticated" ON exercises;
CREATE POLICY "exercises_insert_authenticated" ON exercises
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exercises_update_authenticated" ON exercises;
CREATE POLICY "exercises_update_authenticated" ON exercises
  FOR UPDATE TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exercises_delete_authenticated" ON exercises;
CREATE POLICY "exercises_delete_authenticated" ON exercises
  FOR DELETE TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

-- Minigames & Questions
DROP POLICY IF EXISTS "minigames_select_authenticated" ON minigames;
CREATE POLICY "minigames_select_authenticated" ON minigames
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "minigames_write_authenticated" ON minigames;
CREATE POLICY "minigames_write_authenticated" ON minigames
  FOR ALL TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "minigame_questions_select" ON minigame_questions;
CREATE POLICY "minigame_questions_select" ON minigame_questions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "minigame_questions_write" ON minigame_questions;
CREATE POLICY "minigame_questions_write" ON minigame_questions
  FOR ALL TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

-- Modpacks & Items
DROP POLICY IF EXISTS "modpacks_select_authenticated" ON modpacks;
CREATE POLICY "modpacks_select_authenticated" ON modpacks
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "modpacks_write_authenticated" ON modpacks;
CREATE POLICY "modpacks_write_authenticated" ON modpacks
  FOR ALL TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "modpack_items_select" ON modpack_items;
CREATE POLICY "modpack_items_select" ON modpack_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "modpack_items_write" ON modpack_items;
CREATE POLICY "modpack_items_write" ON modpack_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM modpacks m
      WHERE m.id = modpack_items.modpack_id
        AND (current_user_role() = 'admin' OR m.created_by = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM modpacks m
      WHERE m.id = modpack_items.modpack_id
        AND (current_user_role() = 'admin' OR m.created_by = auth.uid())
    )
  );

-- ------------------------------------------------------------------------
-- 7. POLICIES: COURSES & COURSE ITEMS
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "courses_select_authenticated" ON courses;
CREATE POLICY "courses_select_authenticated" ON courses
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

DROP POLICY IF EXISTS "courses_insert_authenticated" ON courses;
CREATE POLICY "courses_insert_authenticated" ON courses
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND
      is_patient_accessible_by_pt(patient_id) AND
      pt_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "courses_update_authenticated" ON courses;
CREATE POLICY "courses_update_authenticated" ON courses
  FOR UPDATE TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND
      is_patient_accessible_by_pt(patient_id) AND
      pt_id = auth.uid()
    )
  )
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND
      is_patient_accessible_by_pt(patient_id) AND
      pt_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "courses_delete_authenticated" ON courses;
CREATE POLICY "courses_delete_authenticated" ON courses
  FOR DELETE TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND
      is_patient_accessible_by_pt(patient_id) AND
      pt_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "course_items_select_authenticated" ON course_items;
CREATE POLICY "course_items_select_authenticated" ON course_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_items.course_id
        AND (current_user_role() = 'admin' OR is_patient_accessible_by_pt(c.patient_id))
    )
  );

DROP POLICY IF EXISTS "course_items_write_authenticated" ON course_items;
CREATE POLICY "course_items_write_authenticated" ON course_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_items.course_id
        AND (
          current_user_role() = 'admin' OR (
            current_user_role() = 'pt' AND
            is_patient_accessible_by_pt(c.patient_id) AND
            c.pt_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_items.course_id
        AND (
          current_user_role() = 'admin' OR (
            current_user_role() = 'pt' AND
            is_patient_accessible_by_pt(c.patient_id) AND
            c.pt_id = auth.uid()
          )
        )
    )
  );

-- ------------------------------------------------------------------------
-- 8. POLICIES: MISSION RUNS & MISSION STEPS
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "mission_runs_select" ON mission_runs;
CREATE POLICY "mission_runs_select" ON mission_runs
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

DROP POLICY IF EXISTS "mission_runs_admin_write" ON mission_runs;
CREATE POLICY "mission_runs_admin_write" ON mission_runs
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS "mission_steps_select" ON mission_steps;
CREATE POLICY "mission_steps_select" ON mission_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mission_runs mr
      WHERE mr.id = mission_steps.run_id
        AND (current_user_role() = 'admin' OR is_patient_accessible_by_pt(mr.patient_id))
    )
  );

DROP POLICY IF EXISTS "mission_steps_admin_write" ON mission_steps;
CREATE POLICY "mission_steps_admin_write" ON mission_steps
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ------------------------------------------------------------------------
-- 9. POLICIES: CLINICAL RECORDS (APPEND-ONLY)
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "medical_notes_select" ON medical_notes;
CREATE POLICY "medical_notes_select" ON medical_notes
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

DROP POLICY IF EXISTS "medical_notes_insert" ON medical_notes;
CREATE POLICY "medical_notes_insert" ON medical_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id)
    )
  );

DROP POLICY IF EXISTS "treatment_results_select" ON treatment_results;
CREATE POLICY "treatment_results_select" ON treatment_results
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

DROP POLICY IF EXISTS "treatment_results_insert" ON treatment_results;
CREATE POLICY "treatment_results_insert" ON treatment_results
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id)
    )
  );

-- ------------------------------------------------------------------------
-- 10. POLICIES: CONSENTS & STAFF CALLS
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "consents_select" ON consents;
CREATE POLICY "consents_select" ON consents
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(subject_id));

DROP POLICY IF EXISTS "consents_insert" ON consents;
CREATE POLICY "consents_insert" ON consents
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'admin' OR is_patient_accessible_by_pt(subject_id));

-- staff_calls is in staff_* (backend-only, REVOKED from authenticated, zero client policies)

-- ------------------------------------------------------------------------
-- 11. POLICIES: AUDIT LOGS (ADMIN SELECT ONLY, INSERT VIA SYSTEM/ADMIN)
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_admin_select" ON audit_logs;
CREATE POLICY "audit_logs_admin_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin');

DROP POLICY IF EXISTS "audit_logs_authenticated_insert" ON audit_logs;
CREATE POLICY "audit_logs_authenticated_insert" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ------------------------------------------------------------------------
-- 12. STRICTLY PRIVATE TABLES: ZERO CLIENT POLICIES (SERVICE ROLE ONLY)
-- Section 4: face_*, enrollment_tickets, kiosk_devices, staff_devices, bans
-- By enabling RLS without granting policies, authenticated and anon are blocked.
-- ------------------------------------------------------------------------
-- face_enrollments: NO CLIENT POLICIES
-- face_templates: NO CLIENT POLICIES
-- face_challenges: NO CLIENT POLICIES
-- enrollment_tickets: NO CLIENT POLICIES
-- checkins: NO CLIENT POLICIES
-- kiosk_devices: NO CLIENT POLICIES
-- staff_devices: NO CLIENT POLICIES
-- bans: NO CLIENT POLICIES


-- >>> BEGIN 20261022000005_storage_and_biometrics.sql <<<
-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 05: Private Storage Buckets & Server-Side Biometric Matching
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. STORAGE BUCKETS (ALL PRIVATE - Rule #8)
-- ------------------------------------------------------------------------

-- 1.1 Avatars Bucket (5 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 1.2 Biometric Data Bucket (10 MB limit)
-- STRICTLY PRIVATE: Biometric raw crops 10 frames - Accessible via service_role only
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'biometric-data',
  'biometric-data',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png'];

-- 1.3 Exercise Media Bucket (50 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exercise-media',
  'exercise-media',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];

-- ------------------------------------------------------------------------
-- 2. STORAGE POLICIES
-- ------------------------------------------------------------------------

-- Avatars: Authenticated read; write to own directory or admin
DROP POLICY IF EXISTS "avatars_authenticated_read" ON storage.objects;
CREATE POLICY "avatars_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_user_write" ON storage.objects;
CREATE POLICY "avatars_user_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      current_user_role() = 'admin'
    )
  );

DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
CREATE POLICY "avatars_user_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      current_user_role() = 'admin'
    )
  );

DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;
CREATE POLICY "avatars_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      current_user_role() = 'admin'
    )
  );

-- Biometric-Data: Strictly Private - NO client policies for authenticated or anon!
-- Accessible exclusively through backend Express service_role

-- Exercise-Media: Authenticated read; Admin write
DROP POLICY IF EXISTS "exercise_media_authenticated_read" ON storage.objects;
CREATE POLICY "exercise_media_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'exercise-media');

DROP POLICY IF EXISTS "exercise_media_admin_write" ON storage.objects;
CREATE POLICY "exercise_media_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'exercise-media' AND current_user_role() = 'admin'
  )
  WITH CHECK (
    bucket_id = 'exercise-media' AND current_user_role() = 'admin'
  );

-- ------------------------------------------------------------------------
-- 3. SERVER-SIDE BIOMETRIC SEARCH RPC: match_face_candidates
-- Section 4 & 7.4: Cosine similarity matching against candidate set
-- Takes probes and candidate_ids, computes avg of top-3 similarities per patient
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_face_candidates(
  probe vector(512)[],
  candidate_ids uuid[],
  k int DEFAULT 5
)
RETURNS TABLE (
  patient_id uuid,
  score double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If candidate list is empty, return empty set (prevents searching full gallery by accident)
  IF candidate_ids IS NULL OR array_length(candidate_ids, 1) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH probe_unrolled AS (
    SELECT unnest(probe) AS p_vec
  ),
  similarities AS (
    SELECT
      ft.patient_id AS pid,
      -- Cosine similarity is 1 - cosine distance
      (1.0 - (ft.embedding <=> pu.p_vec)) AS sim,
      ROW_NUMBER() OVER (
        PARTITION BY ft.patient_id
        ORDER BY (1.0 - (ft.embedding <=> pu.p_vec)) DESC
      ) AS rank
    FROM face_templates ft
    CROSS JOIN probe_unrolled pu
    WHERE ft.patient_id = ANY(candidate_ids)
  ),
  top_similarities AS (
    -- Take up to top 3 scores per patient
    SELECT
      s.pid,
      s.sim
    FROM similarities s
    WHERE s.rank <= 3
  ),
  aggregated_scores AS (
    SELECT
      ts.pid AS agg_patient_id,
      AVG(ts.sim)::double precision AS avg_score
    FROM top_similarities ts
    GROUP BY ts.pid
  )
  SELECT
    a.agg_patient_id,
    a.avg_score
  FROM aggregated_scores a
  ORDER BY a.avg_score DESC
  LIMIT k;
END;
$$;

-- Strict access restriction: Only service_role can execute biometric search
REVOKE ALL ON FUNCTION match_face_candidates(vector(512)[], uuid[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_face_candidates(vector(512)[], uuid[], int) TO service_role;


-- >>> BEGIN 20261022000006_advanced_enterprise_extensions.sql <<<
-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 06: Advanced Enterprise Hospital Extensions
-- Features:
-- 1. Cryptographic Tamper-Proof Audit & Notes Hash Chaining (SHA-256)
-- 2. Automated Self-Healing & Ephemeral Cleanup Routines
-- 3. Advanced Clinical Recovery & VAS Pain Trajectory Analytics Views
-- 4. PDPA Dynamic Data Masking (DDM) Functions
-- 5. Real-Time Kiosk & Clinic Workload Operational Views
-- ========================================================================

-- ------------------------------------------------------------------------
-- 0. EXTENSIONS & PREREQUISITES
-- ------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure mission_runs has pain_score and feedback columns for clinical outcome tracking
ALTER TABLE mission_runs ADD COLUMN IF NOT EXISTS pain_score INT;
ALTER TABLE mission_runs ADD COLUMN IF NOT EXISTS feedback TEXT;

-- ------------------------------------------------------------------------
-- 1. CRYPTOGRAPHIC TAMPER-PROOF HASH CHAINING (Non-Repudiation)
-- ------------------------------------------------------------------------
-- Adds SHA-256 hash chaining to medical_notes and audit_logs.
-- Every row cryptographically signs the previous row's hash.
-- Any manual tampering of past notes or logs breaks the signature chain.

ALTER TABLE medical_notes ADD COLUMN IF NOT EXISTS prev_hash TEXT DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE medical_notes ADD COLUMN IF NOT EXISTS curr_hash TEXT;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS curr_hash TEXT;

-- 1.1 Trigger Function: Cryptographic Hash Chaining for Medical Notes
CREATE OR REPLACE FUNCTION fn_chain_medical_notes_hash()
RETURNS TRIGGER AS $$
DECLARE
  v_last_hash TEXT;
BEGIN
  -- Retrieve the latest hash for this patient's chart
  SELECT curr_hash INTO v_last_hash
  FROM medical_notes
  WHERE patient_id = NEW.patient_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_last_hash IS NOT NULL THEN
    NEW.prev_hash := v_last_hash;
  ELSE
    NEW.prev_hash := 'GENESIS_' || NEW.patient_id::TEXT;
  END IF;

  -- Compute deterministic SHA-256 hash of: prev_hash + patient_id + author_id + body + created_at
  NEW.curr_hash := encode(
    digest(
      NEW.prev_hash || '|' ||
      NEW.patient_id::TEXT || '|' ||
      NEW.author_id::TEXT || '|' ||
      NEW.body || '|' ||
      COALESCE(NEW.created_at::TEXT, CURRENT_TIMESTAMP::TEXT),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chain_medical_notes_hash ON medical_notes;
CREATE TRIGGER trg_chain_medical_notes_hash
  BEFORE INSERT ON medical_notes
  FOR EACH ROW
  EXECUTE FUNCTION fn_chain_medical_notes_hash();

-- 1.2 Trigger Function: Cryptographic Hash Chaining for Audit Logs
CREATE OR REPLACE FUNCTION fn_chain_audit_logs_hash()
RETURNS TRIGGER AS $$
DECLARE
  v_last_hash TEXT;
BEGIN
  SELECT curr_hash INTO v_last_hash
  FROM audit_logs
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_last_hash IS NOT NULL THEN
    NEW.prev_hash := v_last_hash;
  ELSE
    NEW.prev_hash := 'AUDIT_GENESIS_CHAIN';
  END IF;

  NEW.curr_hash := encode(
    digest(
      NEW.prev_hash || '|' ||
      COALESCE(NEW.actor_id::TEXT, 'ANON') || '|' ||
      NEW.action || '|' ||
      NEW.entity || '|' ||
      COALESCE(NEW.entity_id::TEXT, '') || '|' ||
      COALESCE(NEW.created_at::TEXT, CURRENT_TIMESTAMP::TEXT),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chain_audit_logs_hash ON audit_logs;
CREATE TRIGGER trg_chain_audit_logs_hash
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION fn_chain_audit_logs_hash();

-- ------------------------------------------------------------------------
-- 2. PDPA DYNAMIC DATA MASKING (DDM) HELPERS
-- ------------------------------------------------------------------------

-- Mask phone numbers (e.g. 0812345678 -> 081-***-5678)
CREATE OR REPLACE FUNCTION mask_phone(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone_number IS NULL OR length(phone_number) < 8 THEN
    RETURN '***-***-****';
  END IF;
  RETURN substring(phone_number from 1 for 3) || '-***-' || substring(phone_number from length(phone_number) - 3 for 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------------------
-- 3. ADVANCED CLINICAL ANALYTICS VIEWS
-- ------------------------------------------------------------------------

-- 3.1 Patient Recovery Trajectory View (VAS Pain Score Progression)
-- Calculates pain changes across treatment versions to evaluate PT course efficacy
CREATE OR REPLACE VIEW view_patient_recovery_trajectory AS
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
FROM mission_runs mr
JOIN patients p ON p.id = mr.patient_id
LEFT JOIN profiles prof ON prof.id = p.responsible_pt_id
WHERE mr.status = 'completed';

-- 3.2 Daily Clinic Operational Throughput View (For Director & Reception Dashboard)
CREATE OR REPLACE VIEW view_clinic_daily_summary AS
SELECT
  CURRENT_DATE AS report_date,
  (SELECT COUNT(*) FROM checkins WHERE date = CURRENT_DATE) AS total_checked_in,
  (SELECT COUNT(*) FROM courses WHERE CURRENT_DATE BETWEEN start_date AND end_date AND status = 'active') AS active_courses_today,
  (SELECT COUNT(*) FROM mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed') AS missions_completed_today,
  (SELECT COUNT(*) FROM staff_calls WHERE created_at::DATE = CURRENT_DATE AND handled_at IS NULL) AS pending_emergency_calls,
  (SELECT COALESCE(ROUND(AVG(pain_score), 1), 0) FROM mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed' AND pain_score IS NOT NULL) AS avg_pain_score_today;

-- 3.3 Kiosk Terminal Health & Activity Monitor View
CREATE OR REPLACE VIEW view_kiosk_live_telemetry AS
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
FROM kiosk_devices kd
LEFT JOIN staff_calls sc ON sc.kiosk_id = kd.id
GROUP BY kd.id, kd.name, kd.location, kd.is_active, kd.last_seen_at;

-- ------------------------------------------------------------------------
-- 4. AUTONOMOUS DATABASE MAINTENANCE & SELF-HEALING ROUTINES
-- ------------------------------------------------------------------------
-- Safely purges expired nonces, stale single-use tickets, and expired bans.

CREATE OR REPLACE FUNCTION cleanup_expired_ephemerals()
RETURNS TABLE (
  purged_challenges INT,
  purged_tickets INT,
  purged_bans INT
) AS $$
DECLARE
  v_challenges INT;
  v_tickets INT;
  v_bans INT;
BEGIN
  -- Purge face challenges older than 10 minutes
  DELETE FROM face_challenges
  WHERE expires_at < NOW() - INTERVAL '10 minutes' OR used_at IS NOT NULL;
  GET DIAGNOSTICS v_challenges = ROW_COUNT;

  -- Expire unredeemed enrollment tickets older than 20 minutes
  UPDATE enrollment_tickets
  SET expires_at = NOW()
  WHERE expires_at < NOW() AND used_at IS NULL;
  GET DIAGNOSTICS v_tickets = ROW_COUNT;

  -- Deactivate expired bans
  DELETE FROM bans
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS v_bans = ROW_COUNT;

  RETURN QUERY SELECT v_challenges, v_tickets, v_bans;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution of maintenance routines strictly to service_role
REVOKE ALL ON FUNCTION cleanup_expired_ephemerals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_ephemerals() TO service_role;


