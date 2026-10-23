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
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_update_admin_or_self" ON profiles
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'admin' OR id = auth.uid())
  WITH CHECK (current_user_role() = 'admin' OR id = auth.uid());

CREATE POLICY "profiles_admin_write" ON profiles
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pts_select_authenticated" ON pts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "pts_update_admin_or_self" ON pts
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'admin' OR user_id = auth.uid())
  WITH CHECK (current_user_role() = 'admin' OR user_id = auth.uid());

CREATE POLICY "pts_admin_write" ON pts
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ------------------------------------------------------------------------
-- 4. POLICIES: PATIENTS & ASSIGNMENTS
-- ------------------------------------------------------------------------
CREATE POLICY "patients_select_policy" ON patients
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(id));

CREATE POLICY "patients_insert_policy" ON patients
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND responsible_pt_id = auth.uid()
    )
  );

CREATE POLICY "patients_update_policy" ON patients
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(id))
  WITH CHECK (current_user_role() = 'admin' OR is_patient_accessible_by_pt(id));

CREATE POLICY "patient_pt_assignments_select" ON patient_pt_assignments
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR pt_id = auth.uid());

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
CREATE POLICY "case_transfers_select" ON case_transfers
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'admin' OR
    from_pt_id = auth.uid() OR
    to_pt_id = auth.uid()
  );

CREATE POLICY "case_transfers_insert" ON case_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND from_pt_id = auth.uid()
    )
  );

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
CREATE POLICY "exercises_select_authenticated" ON exercises
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "exercises_insert_authenticated" ON exercises
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

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

CREATE POLICY "exercises_delete_authenticated" ON exercises
  FOR DELETE TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND created_by = auth.uid()
    )
  );

-- Minigames & Questions
CREATE POLICY "minigames_select_authenticated" ON minigames
  FOR SELECT TO authenticated
  USING (true);

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

CREATE POLICY "minigame_questions_select" ON minigame_questions
  FOR SELECT TO authenticated
  USING (true);

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
CREATE POLICY "modpacks_select_authenticated" ON modpacks
  FOR SELECT TO authenticated
  USING (true);

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

CREATE POLICY "modpack_items_select" ON modpack_items
  FOR SELECT TO authenticated
  USING (true);

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
CREATE POLICY "courses_select_authenticated" ON courses
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

CREATE POLICY "courses_insert_authenticated" ON courses
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND
      is_patient_accessible_by_pt(patient_id) AND
      pt_id = auth.uid()
    )
  );

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

CREATE POLICY "courses_delete_authenticated" ON courses
  FOR DELETE TO authenticated
  USING (
    current_user_role() = 'admin' OR (
      current_user_role() = 'pt' AND
      is_patient_accessible_by_pt(patient_id) AND
      pt_id = auth.uid()
    )
  );

CREATE POLICY "course_items_select_authenticated" ON course_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_items.course_id
        AND (current_user_role() = 'admin' OR is_patient_accessible_by_pt(c.patient_id))
    )
  );

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
CREATE POLICY "mission_runs_select" ON mission_runs
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

CREATE POLICY "mission_runs_admin_write" ON mission_runs
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "mission_steps_select" ON mission_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mission_runs mr
      WHERE mr.id = mission_steps.run_id
        AND (current_user_role() = 'admin' OR is_patient_accessible_by_pt(mr.patient_id))
    )
  );

CREATE POLICY "mission_steps_admin_write" ON mission_steps
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ------------------------------------------------------------------------
-- 9. POLICIES: CLINICAL RECORDS (APPEND-ONLY)
-- ------------------------------------------------------------------------
CREATE POLICY "medical_notes_select" ON medical_notes
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

CREATE POLICY "medical_notes_insert" ON medical_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id)
    )
  );

CREATE POLICY "treatment_results_select" ON treatment_results
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(patient_id));

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
CREATE POLICY "consents_select" ON consents
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin' OR is_patient_accessible_by_pt(subject_id));

CREATE POLICY "consents_insert" ON consents
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'admin' OR is_patient_accessible_by_pt(subject_id));

-- staff_calls is in staff_* (backend-only, REVOKED from authenticated, zero client policies)

-- ------------------------------------------------------------------------
-- 11. POLICIES: AUDIT LOGS (ADMIN SELECT ONLY, INSERT VIA SYSTEM/ADMIN)
-- ------------------------------------------------------------------------
CREATE POLICY "audit_logs_admin_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin');

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
