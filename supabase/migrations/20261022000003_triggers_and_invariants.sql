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
