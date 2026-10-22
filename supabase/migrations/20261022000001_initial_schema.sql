-- ========================================================================
-- 1. EXTENSIONS
-- ========================================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================================
-- 2. ENUMS
-- ========================================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'pt', 'patient');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE exercise_type AS ENUM ('exercise', 'minigame');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE course_mode AS ENUM ('monthly', 'weekly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE face_pose AS ENUM ('front', 'left', 'right', 'nod');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE course_item_status AS ENUM ('pending', 'completed', 'missed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE case_transfer_status AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE face_enrollment_status AS ENUM ('pending', 'completed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ========================================================================
-- 3. TABLES
-- ========================================================================

-- PROFILES (Maps 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  force_logout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- PATIENTS (Specific medical details)
CREATE TABLE IF NOT EXISTS patients (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth DATE,
  sex TEXT CHECK (sex IN ('male', 'female', 'other')),
  chief_complaint TEXT,
  diagnosis TEXT,
  allergies TEXT,
  chronic_diseases TEXT,
  emergency_contact TEXT,
  history JSONB DEFAULT '{}'::jsonb NOT NULL
);

-- PTS (Physiotherapist credentials)
CREATE TABLE IF NOT EXISTS pts (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  license_no TEXT NOT NULL,
  license_expiry DATE,
  specialty TEXT
);

-- PATIENT_PT_ASSIGNMENTS (Primary assignment)
CREATE TABLE IF NOT EXISTS patient_pt_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_patient_pt UNIQUE (patient_id, pt_id)
);

-- CASE_TRANSFERS (Temporary case delegation)
CREATE TABLE IF NOT EXISTS case_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  status case_transfer_status DEFAULT 'active' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ck_transfer_dates CHECK (end_date >= start_date)
);

-- EXERCISES & MINIGAMES
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type exercise_type NOT NULL,
  title TEXT NOT NULL,
  body_area TEXT NOT NULL,
  description TEXT,
  media_path TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- COURSES (Prescription plans)
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pt_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode course_mode NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ck_course_dates CHECK (end_date >= start_date)
);

-- COURSE_ITEMS (Scheduled exercises / minigames)
CREATE TABLE IF NOT EXISTS course_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  status course_item_status DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- MEDICAL_NOTES (Append-only)
CREATE TABLE IF NOT EXISTS medical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- CONSENTS (PDPA consent tracking)
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  revoked_at TIMESTAMPTZ
);

-- FACE_ENROLLMENTS (Enrollment session tracking)
CREATE TABLE IF NOT EXISTS face_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status face_enrollment_status DEFAULT 'pending' NOT NULL,
  consent_id UUID REFERENCES consents(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- FACE_TEMPLATES (Biometric embedding 128-dim)
CREATE TABLE IF NOT EXISTS face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  embedding vector(128) NOT NULL,
  pose face_pose NOT NULL,
  model_version TEXT NOT NULL,
  enrollment_id UUID NOT NULL REFERENCES face_enrollments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- KIOSK_DEVICES (Self-service check-in kiosks)
CREATE TABLE IF NOT EXISTS kiosk_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- AUDIT_LOGS (Insert-only compliance log)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- BANNED_IPS (Enforced by middleware)
CREATE TABLE IF NOT EXISTS banned_ips (
  ip TEXT PRIMARY KEY,
  reason TEXT,
  banned_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ
);

-- ========================================================================
-- 4. INDEXES
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_assignments_pt ON patient_pt_assignments(pt_id);
CREATE INDEX IF NOT EXISTS idx_assignments_patient ON patient_pt_assignments(patient_id);
CREATE INDEX IF NOT EXISTS idx_transfers_active ON case_transfers(to_pt_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_courses_patient ON courses(patient_id);
CREATE INDEX IF NOT EXISTS idx_course_items_course ON course_items(course_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_medical_notes_patient ON medical_notes(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_face_templates_user ON face_templates(user_id);

-- Vector index for fast cosine/L2 similarity search
CREATE INDEX IF NOT EXISTS idx_face_templates_embedding ON face_templates USING hnsw (embedding vector_l2_ops);

-- ========================================================================
-- 5. IMMUTABILITY TRIGGERS
-- ========================================================================

-- Medical notes: APPEND-ONLY Trigger (Blocks UPDATE and DELETE unconditionally)
CREATE OR REPLACE FUNCTION prevent_medical_notes_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Medical notes are append-only. Modification and deletion are strictly prohibited by hospital compliance policy.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_medical_notes_modification ON medical_notes;
CREATE TRIGGER trg_prevent_medical_notes_modification
BEFORE UPDATE OR DELETE ON medical_notes
FOR EACH ROW EXECUTE FUNCTION prevent_medical_notes_modification();

-- Audit logs: INSERT-ONLY Trigger (Blocks UPDATE and DELETE unconditionally)
CREATE OR REPLACE FUNCTION prevent_audit_logs_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are insert-only. Modification and deletion are strictly prohibited by compliance policy.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_logs_modification ON audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_modification
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_modification();
