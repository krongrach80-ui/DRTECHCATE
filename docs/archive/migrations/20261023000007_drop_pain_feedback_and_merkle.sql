-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 07: Drop pain_score, feedback, and Merkle hash chaining
-- Preserves strict append-only immutability triggers (Locking Decision #2)
-- ========================================================================

-- 1. Drop views that referenced pain_score from mission_runs (Migration 06 lines 135-164)
-- Must drop BEFORE dropping pain_score column to prevent dependency violation
DROP VIEW IF EXISTS view_patient_recovery_trajectory CASCADE;
DROP VIEW IF EXISTS view_clinic_daily_summary CASCADE;
DROP VIEW IF EXISTS view_patient_recovery_velocity CASCADE;
DROP VIEW IF EXISTS view_clinical_director_metrics CASCADE;

-- 2. Drop Merkle / hash-chain triggers and functions
DROP TRIGGER IF EXISTS trg_chain_medical_notes_hash ON medical_notes;
DROP FUNCTION IF EXISTS fn_chain_medical_notes_hash();
DROP TRIGGER IF EXISTS trg_chain_audit_logs_hash ON audit_logs;
DROP FUNCTION IF EXISTS fn_chain_audit_logs_hash();
DROP FUNCTION IF EXISTS verify_medical_notes_merkle_chain();
DROP FUNCTION IF EXISTS verify_audit_logs_merkle_chain();
DROP FUNCTION IF EXISTS verify_merkle_chain();

-- 3. Drop Merkle columns from medical_notes and audit_logs
ALTER TABLE medical_notes DROP COLUMN IF EXISTS prev_hash;
ALTER TABLE medical_notes DROP COLUMN IF EXISTS curr_hash;
ALTER TABLE medical_notes DROP COLUMN IF EXISTS record_hash;

ALTER TABLE audit_logs DROP COLUMN IF EXISTS prev_hash;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS curr_hash;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS record_hash;

-- 4. Drop unprovable pain_score and feedback from mission_runs
ALTER TABLE mission_runs DROP COLUMN IF EXISTS pain_score;
ALTER TABLE mission_runs DROP COLUMN IF EXISTS feedback;

-- 5. Recreate Clinical Views cleanly without pain_score
CREATE OR REPLACE VIEW view_clinic_daily_summary AS
SELECT
  CURRENT_DATE AS report_date,
  (SELECT COUNT(*) FROM checkins WHERE date = CURRENT_DATE) AS total_checked_in,
  (SELECT COUNT(*) FROM courses WHERE CURRENT_DATE BETWEEN start_date AND end_date AND status = 'active') AS active_courses_today,
  (SELECT COUNT(*) FROM mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed') AS missions_completed_today,
  (SELECT COUNT(*) FROM staff_calls WHERE created_at::DATE = CURRENT_DATE AND handled_at IS NULL) AS pending_emergency_calls;

CREATE OR REPLACE VIEW view_clinical_director_metrics AS
SELECT
  (SELECT COUNT(*) FROM profiles WHERE role = 'pt' AND status = 'active') AS active_pts_count,
  (SELECT COUNT(*) FROM patients WHERE registration_status = 'active') AS active_patients_count,
  (SELECT COUNT(*) FROM courses WHERE status = 'active') AS active_courses_count,
  (SELECT COUNT(*) FROM mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed') AS completed_missions_today;

-- 6. Final sweep REVOKE on internal/backend-only tables (Item H3)
-- Guarantees that neither anon nor authenticated holds any privileges on private tables
REVOKE ALL ON TABLE
  face_enrollments,
  face_templates,
  face_challenges,
  enrollment_tickets,
  checkins,
  kiosk_devices,
  staff_devices,
  staff_calls,
  bans,
  audit_logs
FROM anon, authenticated;

-- 7. Re-assert that Append-Only triggers remain strictly enforced
-- Invariant: Medical notes, treatment results, and audit logs CANNOT be updated or deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_medical_notes_modification'
  ) THEN
    RAISE EXCEPTION 'Append-only invariant violation: trg_prevent_medical_notes_modification is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_treatment_results_modification'
  ) THEN
    RAISE EXCEPTION 'Append-only invariant violation: trg_prevent_treatment_results_modification is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_audit_logs_modification'
  ) THEN
    RAISE EXCEPTION 'Append-only invariant violation: trg_prevent_audit_logs_modification is missing';
  END IF;
END $$;
