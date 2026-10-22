-- ========================================================================
-- 1. HELPER SECURITY DEFINER FUNCTIONS
-- ========================================================================

-- Get current authenticated user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if a patient is actively accessible by the calling PT (via primary assignment or active case transfer)
CREATE OR REPLACE FUNCTION is_patient_accessible_by_pt(p_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin has global access
  IF current_user_role() = 'admin' THEN
    RETURN true;
  END IF;

  -- Calling user must be a PT
  IF current_user_role() <> 'pt' THEN
    RETURN false;
  END IF;

  -- Check primary assignment
  IF EXISTS (
    SELECT 1 FROM patient_pt_assignments
    WHERE patient_id = p_patient_id AND pt_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Check active temporary case transfer (within valid date range and active status)
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

-- PT Restriction Trigger: PTs can ONLY prescribe 'minigame' (cannot prescribe 'exercise')
CREATE OR REPLACE FUNCTION validate_course_item_exercise_type()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role;
  v_exercise_type exercise_type;
BEGIN
  v_role := current_user_role();
  
  -- If actor is PT, ensure exercise is strictly a 'minigame'
  IF v_role = 'pt' THEN
    SELECT type INTO v_exercise_type FROM exercises WHERE id = NEW.exercise_id;
    IF v_exercise_type <> 'minigame' THEN
      RAISE EXCEPTION 'PT role is only authorized to prescribe minigame exercises. Physical therapy exercises are currently in development.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_course_item_exercise_type ON course_items;
CREATE TRIGGER trg_validate_course_item_exercise_type
BEFORE INSERT OR UPDATE ON course_items
FOR EACH ROW EXECUTE FUNCTION validate_course_item_exercise_type();

-- Face Matching Search with Margin Check (pgvector)
CREATE OR REPLACE FUNCTION find_matching_face(
  query_embedding vector(128),
  match_threshold FLOAT DEFAULT 0.60,
  match_margin FLOAT DEFAULT 0.10
)
RETURNS TABLE (
  matched_user_id UUID,
  distance FLOAT,
  is_ambiguous BOOLEAN
) AS $$
DECLARE
  top_match RECORD;
  second_match RECORD;
BEGIN
  -- 1. Find nearest face template belonging to an active user
  SELECT ft.user_id, (ft.embedding <-> query_embedding) AS dist
  INTO top_match
  FROM face_templates ft
  JOIN profiles p ON p.id = ft.user_id
  WHERE p.is_active = true
  ORDER BY ft.embedding <-> query_embedding ASC
  LIMIT 1;

  IF NOT FOUND OR top_match.dist > match_threshold THEN
    RETURN; -- No match within threshold
  END IF;

  -- 2. Find 2nd nearest face template belonging to a DIFFERENT user
  SELECT ft.user_id, (ft.embedding <-> query_embedding) AS dist
  INTO second_match
  FROM face_templates ft
  JOIN profiles p ON p.id = ft.user_id
  WHERE p.is_active = true AND ft.user_id <> top_match.user_id
  ORDER BY ft.embedding <-> query_embedding ASC
  LIMIT 1;

  -- 3. Check ambiguity: if 2nd candidate is too close to top candidate
  IF FOUND AND (second_match.dist - top_match.dist) < match_margin THEN
    matched_user_id := top_match.user_id;
    distance := top_match.dist;
    is_ambiguous := true;
    RETURN NEXT;
  ELSE
    matched_user_id := top_match.user_id;
    distance := top_match.dist;
    is_ambiguous := false;
    RETURN NEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke public execution of find_matching_face; service_role only
REVOKE EXECUTE ON FUNCTION find_matching_face(vector(128), FLOAT, FLOAT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION find_matching_face(vector(128), FLOAT, FLOAT) FROM anon;
REVOKE EXECUTE ON FUNCTION find_matching_face(vector(128), FLOAT, FLOAT) FROM authenticated;

-- ========================================================================
-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ========================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pts ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_pt_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_ips ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 3. PROFILES POLICIES
-- ========================================================================
-- Admin: full access
CREATE POLICY "admin_all_profiles" ON profiles
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- PT: view own profile, other PTs, and assigned/transferred patients
CREATE POLICY "pt_select_profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'pt' AND (
      id = auth.uid() OR
      role = 'pt' OR
      is_patient_accessible_by_pt(id)
    )
  );

CREATE POLICY "pt_update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'pt' AND id = auth.uid())
  WITH CHECK (current_user_role() = 'pt' AND id = auth.uid());

-- Patient: view own profile
CREATE POLICY "patient_select_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (current_user_role() = 'patient' AND id = auth.uid());

CREATE POLICY "patient_update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'patient' AND id = auth.uid())
  WITH CHECK (current_user_role() = 'patient' AND id = auth.uid());

-- ========================================================================
-- 4. PATIENTS POLICIES
-- ========================================================================
CREATE POLICY "admin_all_patients" ON patients
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pt_select_patients" ON patients
  FOR SELECT TO authenticated
  USING (is_patient_accessible_by_pt(user_id));

CREATE POLICY "pt_update_patients" ON patients
  FOR UPDATE TO authenticated
  USING (is_patient_accessible_by_pt(user_id))
  WITH CHECK (is_patient_accessible_by_pt(user_id));

CREATE POLICY "patient_select_own_record" ON patients
  FOR SELECT TO authenticated
  USING (current_user_role() = 'patient' AND user_id = auth.uid());

-- ========================================================================
-- 5. PTS POLICIES
-- ========================================================================
CREATE POLICY "admin_all_pts" ON pts
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pt_select_all_pts" ON pts
  FOR SELECT TO authenticated
  USING (current_user_role() = 'pt');

CREATE POLICY "pt_update_own_pt_record" ON pts
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'pt' AND user_id = auth.uid())
  WITH CHECK (current_user_role() = 'pt' AND user_id = auth.uid());

CREATE POLICY "patient_select_assigned_pts" ON pts
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'patient' AND EXISTS (
      SELECT 1 FROM patient_pt_assignments WHERE patient_id = auth.uid() AND pt_id = user_id
    )
  );

-- ========================================================================
-- 6. PATIENT_PT_ASSIGNMENTS POLICIES
-- ========================================================================
CREATE POLICY "admin_all_assignments" ON patient_pt_assignments
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pt_select_assignments" ON patient_pt_assignments
  FOR SELECT TO authenticated
  USING (current_user_role() = 'pt' AND pt_id = auth.uid());

CREATE POLICY "patient_select_assignments" ON patient_pt_assignments
  FOR SELECT TO authenticated
  USING (current_user_role() = 'patient' AND patient_id = auth.uid());

-- ========================================================================
-- 7. CASE_TRANSFERS POLICIES
-- ========================================================================
CREATE POLICY "admin_all_transfers" ON case_transfers
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pt_select_transfers" ON case_transfers
  FOR SELECT TO authenticated
  USING (current_user_role() = 'pt' AND (from_pt_id = auth.uid() OR to_pt_id = auth.uid()));

CREATE POLICY "pt_insert_transfers" ON case_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'pt' AND
    from_pt_id = auth.uid() AND
    created_by = auth.uid() AND
    is_patient_accessible_by_pt(patient_id)
  );

-- ========================================================================
-- 8. EXERCISES POLICIES
-- ========================================================================
CREATE POLICY "admin_all_exercises" ON exercises
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pt_select_exercises" ON exercises
  FOR SELECT TO authenticated
  USING (current_user_role() = 'pt');

CREATE POLICY "patient_select_active_exercises" ON exercises
  FOR SELECT TO authenticated
  USING (current_user_role() = 'patient' AND is_active = true);

-- ========================================================================
-- 9. COURSES POLICIES
-- ========================================================================
CREATE POLICY "admin_all_courses" ON courses
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pt_manage_courses" ON courses
  FOR ALL TO authenticated
  USING (is_patient_accessible_by_pt(patient_id))
  WITH CHECK (is_patient_accessible_by_pt(patient_id) AND pt_id = auth.uid());

CREATE POLICY "patient_select_courses" ON courses
  FOR SELECT TO authenticated
  USING (current_user_role() = 'patient' AND patient_id = auth.uid());

-- ========================================================================
-- 10. COURSE_ITEMS POLICIES
-- ========================================================================
CREATE POLICY "admin_all_course_items" ON course_items
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "pt_manage_course_items" ON course_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_items.course_id AND is_patient_accessible_by_pt(c.patient_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_items.course_id AND is_patient_accessible_by_pt(c.patient_id)
    )
  );

CREATE POLICY "patient_select_course_items" ON course_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_items.course_id AND c.patient_id = auth.uid()
    )
  );

-- ========================================================================
-- 11. MEDICAL_NOTES POLICIES (Append-only: SELECT and INSERT only)
-- ========================================================================
CREATE POLICY "admin_select_medical_notes" ON medical_notes
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY "admin_insert_medical_notes" ON medical_notes
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'admin' AND author_id = auth.uid());

CREATE POLICY "pt_select_medical_notes" ON medical_notes
  FOR SELECT TO authenticated
  USING (is_patient_accessible_by_pt(patient_id));

CREATE POLICY "pt_insert_medical_notes" ON medical_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_patient_accessible_by_pt(patient_id) AND
    author_id = auth.uid()
  );

CREATE POLICY "patient_select_own_medical_notes" ON medical_notes
  FOR SELECT TO authenticated
  USING (current_user_role() = 'patient' AND patient_id = auth.uid());

-- NO UPDATE OR DELETE POLICIES EXIST FOR medical_notes FOR ANY USER

-- ========================================================================
-- 12. BIOMETRIC TABLES (face_templates, face_enrollments)
-- Strictly accessible via server (service_role) only. No direct client policies.
-- ========================================================================
-- (RLS is enabled; by default with no policies, authenticated/anon users are blocked)

-- ========================================================================
-- 13. CONSENTS POLICIES
-- ========================================================================
CREATE POLICY "admin_all_consents" ON consents
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "patient_select_own_consents" ON consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "patient_insert_own_consents" ON consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ========================================================================
-- 14. KIOSK_DEVICES POLICIES
-- ========================================================================
CREATE POLICY "admin_all_kiosk_devices" ON kiosk_devices
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ========================================================================
-- 15. AUDIT_LOGS POLICIES (Insert-only via server, Admin SELECT only)
-- ========================================================================
CREATE POLICY "admin_select_audit_logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin');

-- NO UPDATE OR DELETE POLICIES EXIST FOR audit_logs FOR ANY USER

-- ========================================================================
-- 16. BANNED_IPS POLICIES
-- ========================================================================
CREATE POLICY "admin_all_banned_ips" ON banned_ips
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "public_check_banned_ips" ON banned_ips
  FOR SELECT TO anon, authenticated
  USING (true);
