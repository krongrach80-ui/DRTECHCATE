-- 20261113000001_appointment_sync_admin_to_pt.sql
-- Master Prompt: Synchronize Clinical Appointments & Courses between Admin and Physical Therapist (PT)
-- SaMD Class II & HIPAA/GDPR Compliant Biometric Health System

-- ============================================================================
-- 1. UPGRADE FUNCTION: public.is_patient_accessible_by_pt
-- Ensures PT can access patients if:
--   a) PT is the patient's primary responsible PT (patients.responsible_pt_id)
--   b) Patient is assigned in patient_pt_assignments
--   c) Patient has an active course assigned to this PT (courses.pt_id)
--   d) Patient is actively delegated via case_transfers
-- ============================================================================

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

  -- Admin has unrestricted visibility across all hospital patients
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Only authenticated PT accounts can proceed
  IF v_role IS DISTINCT FROM 'pt' OR v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Direct Ownership / Primary responsible PT on patient record
  IF EXISTS (
    SELECT 1 FROM public.patients 
    WHERE id = p_patient_id 
      AND responsible_pt_id = v_uid
  ) THEN
    RETURN true;
  END IF;

  -- 2. Direct assignment in patient_pt_assignments table
  IF EXISTS (
    SELECT 1 FROM public.patient_pt_assignments 
    WHERE patient_id = p_patient_id 
      AND pt_id = v_uid
  ) THEN
    RETURN true;
  END IF;

  -- 3. Assigned course or appointment in courses table (Admin-assigned to this PT)
  IF EXISTS (
    SELECT 1 FROM public.courses 
    WHERE patient_id = p_patient_id 
      AND pt_id = v_uid 
      AND status != 'cancelled'
  ) THEN
    RETURN true;
  END IF;

  -- 4. Active Case Delegation / Transfer
  IF EXISTS (
    SELECT 1 FROM public.case_transfers 
    WHERE patient_id = p_patient_id 
      AND to_pt_id = v_uid 
      AND status = 'active'
      AND CURRENT_DATE BETWEEN start_date AND end_date
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_patient_accessible_by_pt(UUID) TO authenticated, service_role;

-- ============================================================================
-- 2. RLS POLICIES FOR public.courses
-- ============================================================================

DROP POLICY IF EXISTS "courses_select" ON public.courses;
DROP POLICY IF EXISTS "courses_insert" ON public.courses;
DROP POLICY IF EXISTS "courses_update" ON public.courses;
DROP POLICY IF EXISTS "courses_delete" ON public.courses;

-- SELECT: Admin can see all courses; PT can see courses assigned to their pt_id or for accessible patients
CREATE POLICY "courses_select" ON public.courses
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR pt_id = (SELECT auth.uid())
    OR (SELECT public.is_patient_accessible_by_pt(patient_id))
  );

-- INSERT: Admin can insert courses for any patient; PT can insert courses for their accessible patients
CREATE POLICY "courses_insert" ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  );

-- UPDATE: Admin can update any course; PT can update their assigned courses or courses for accessible patients
CREATE POLICY "courses_update" ON public.courses
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND (pt_id = (SELECT auth.uid()) OR (SELECT public.is_patient_accessible_by_pt(patient_id)))
    )
  )
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND (pt_id = (SELECT auth.uid()) OR (SELECT public.is_patient_accessible_by_pt(patient_id)))
    )
  );

-- DELETE: Admin can delete any course; PT can delete their assigned courses
CREATE POLICY "courses_delete" ON public.courses
  FOR DELETE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 3. RLS POLICIES FOR public.patients
-- ============================================================================

DROP POLICY IF EXISTS "patients_select" ON public.patients;
DROP POLICY IF EXISTS "patients_insert" ON public.patients;
DROP POLICY IF EXISTS "patients_update" ON public.patients;

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (SELECT public.is_patient_accessible_by_pt(id))
  );

-- Allow authenticated staff with admin/pt role to enroll/insert patients (resolving 401 error)
CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) IN ('admin', 'pt')
    OR (SELECT auth.uid()) IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'pt'))
  );

CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (SELECT public.is_patient_accessible_by_pt(id))
  )
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (SELECT public.is_patient_accessible_by_pt(id))
  );

-- ============================================================================
-- 4. PERFORMANCE & SYNCHRONIZATION INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_courses_pt_patient_status
  ON public.courses(pt_id, patient_id, status);

CREATE INDEX IF NOT EXISTS idx_courses_calendar_lookup
  ON public.courses(start_date, end_date, status);

CREATE INDEX IF NOT EXISTS idx_patient_pt_assignments_pt_id
  ON public.patient_pt_assignments(pt_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_patients_responsible_pt_id
  ON public.patients(responsible_pt_id)
  WHERE responsible_pt_id IS NOT NULL;

