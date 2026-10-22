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
