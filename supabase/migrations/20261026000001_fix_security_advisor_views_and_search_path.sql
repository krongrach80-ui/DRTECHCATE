-- 20261026000001_fix_security_advisor_views_and_search_path.sql
-- DrTech.Care Production Security Advisor & Performance Advisor Remediation
-- Target: Supabase Cloud (project ref: mctegvnrvmglbibuuczi)
-- Fixes:
-- 1. Enforce security_invoker = true on 3 Analytics/Telemetry Views
-- 2. Enforce immutable search_path = public, extensions, pg_temp on all 34+ functions in schema public
-- 3. Eliminate Auth RLS Initialization Plan warnings by wrapping auth.uid() & public.current_user_role() in subqueries

-- ============================================================================
-- 1. ENFORCE SECURITY INVOKER ON REPORTING & TELEMETRY VIEWS
-- ============================================================================
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

ALTER VIEW IF EXISTS public.view_patient_recovery_trajectory SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_clinic_daily_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_kiosk_live_telemetry SET (security_invoker = true);

-- ============================================================================
-- 2. EXPLICITLY HARDEN SEARCH PATH ON ALL CORE MEDICAL & BIOMETRIC FUNCTIONS
-- ============================================================================
ALTER FUNCTION IF EXISTS public.current_user_role() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.is_patient_accessible_by_pt(UUID) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.match_face_candidates(extensions.vector(512), UUID[], INT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.match_face_candidates(extensions.vector, UUID[], INT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enroll_face_atomic(UUID, extensions.vector(512), TEXT, JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enroll_face_atomic(UUID, UUID, TEXT, public.pose_type[], extensions.vector[], UUID, UUID) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.check_profile_update_privileges() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enforce_content_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enforce_modpack_item_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.check_course_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_audit_logs_tampering() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_medical_notes_tampering() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_treatment_results_tampering() SET search_path = public, extensions, pg_temp;

-- Legacy & trigger functions
ALTER FUNCTION IF EXISTS public.trg_fn_prevent_medical_notes_modification() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_prevent_treatment_results_modification() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_prevent_audit_logs_modification() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_exercise_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_minigame_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_minigame_question_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_modpack_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_enforce_course_assignment_permission() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.trg_fn_touch_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.fn_chain_medical_notes_hash() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.fn_chain_audit_logs_hash() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.mask_phone(TEXT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.cleanup_expired_ephemerals() SET search_path = public, extensions, pg_temp;

-- ============================================================================
-- 3. DYNAMIC SWEEP FOR ANY REMAINING PUBLIC SCHEMA FUNCTIONS (100% COVERAGE)
-- ============================================================================
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

-- ============================================================================
-- 4. HARDEN RLS POLICIES FOR SUPABASE PERFORMANCE ADVISOR (AUTH INITIALIZATION PLAN)
-- Wrap all auth.uid() and public.current_user_role() in subqueries: (SELECT auth.uid())
-- ============================================================================

-- 1. profiles
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_authenticated_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR id = (SELECT auth.uid()));

-- 2. pts
DROP POLICY IF EXISTS "pts_select_authenticated" ON public.pts;
DROP POLICY IF EXISTS "pts_authenticated_select" ON public.pts;
DROP POLICY IF EXISTS "pts_admin_all" ON public.pts;
DROP POLICY IF EXISTS "pts_self_update" ON public.pts;
DROP POLICY IF EXISTS "pts_admin_manage" ON public.pts;

CREATE POLICY "pts_select_authenticated" ON public.pts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pts_admin_all" ON public.pts
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR user_id = (SELECT auth.uid()));

-- 3. patients
DROP POLICY IF EXISTS "patients_select" ON public.patients;
DROP POLICY IF EXISTS "patients_insert" ON public.patients;
DROP POLICY IF EXISTS "patients_update" ON public.patients;
DROP POLICY IF EXISTS "patients_pt_select" ON public.patients;
DROP POLICY IF EXISTS "patients_pt_update" ON public.patients;

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(id)));

CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'pt'));

CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(id)))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(id)));

-- 4. patient_pt_assignments
DROP POLICY IF EXISTS "assignments_select" ON public.patient_pt_assignments;
DROP POLICY IF EXISTS "assignments_admin_pt_manage" ON public.patient_pt_assignments;

CREATE POLICY "assignments_select" ON public.patient_pt_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "assignments_admin_pt_manage" ON public.patient_pt_assignments
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'pt'));

-- 5. case_transfers
DROP POLICY IF EXISTS "transfers_select" ON public.case_transfers;
DROP POLICY IF EXISTS "transfers_insert" ON public.case_transfers;
DROP POLICY IF EXISTS "transfers_update" ON public.case_transfers;

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
DROP POLICY IF EXISTS "exercises_select" ON public.exercises;
DROP POLICY IF EXISTS "exercises_insert" ON public.exercises;
DROP POLICY IF EXISTS "exercises_update" ON public.exercises;
DROP POLICY IF EXISTS "exercises_delete" ON public.exercises;
DROP POLICY IF EXISTS "exercises_pt_update" ON public.exercises;

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

-- 7. minigames & questions
DROP POLICY IF EXISTS "minigames_select" ON public.minigames;
DROP POLICY IF EXISTS "minigames_all" ON public.minigames;
DROP POLICY IF EXISTS "minigame_questions_select" ON public.minigame_questions;
DROP POLICY IF EXISTS "minigame_questions_all" ON public.minigame_questions;

CREATE POLICY "minigames_select" ON public.minigames
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "minigames_all" ON public.minigames
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

CREATE POLICY "minigame_questions_select" ON public.minigame_questions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "minigame_questions_all" ON public.minigame_questions
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

-- 8. modpacks & modpack_items
DROP POLICY IF EXISTS "modpacks_select" ON public.modpacks;
DROP POLICY IF EXISTS "modpacks_all" ON public.modpacks;
DROP POLICY IF EXISTS "modpack_items_select" ON public.modpack_items;
DROP POLICY IF EXISTS "modpack_items_all" ON public.modpack_items;

CREATE POLICY "modpacks_select" ON public.modpacks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "modpacks_all" ON public.modpacks
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK ((SELECT public.current_user_role()) = 'admin' OR created_by = (SELECT auth.uid()));

CREATE POLICY "modpack_items_select" ON public.modpack_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "modpack_items_all" ON public.modpack_items
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'pt'))
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND EXISTS (
        SELECT 1 FROM public.modpacks m
        WHERE m.id = modpack_items.modpack_id
          AND m.created_by = (SELECT auth.uid())
      )
    )
  );

-- 9. courses
DROP POLICY IF EXISTS "courses_select" ON public.courses;
DROP POLICY IF EXISTS "courses_insert" ON public.courses;
DROP POLICY IF EXISTS "courses_update" ON public.courses;
DROP POLICY IF EXISTS "courses_delete" ON public.courses;

CREATE POLICY "courses_select" ON public.courses
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR pt_id = (SELECT auth.uid()) OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "courses_insert" ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  );

CREATE POLICY "courses_update" ON public.courses
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  )
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin' OR (
      (SELECT public.current_user_role()) = 'pt'
      AND pt_id = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  );

CREATE POLICY "courses_delete" ON public.courses
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR ((SELECT public.current_user_role()) = 'pt' AND pt_id = (SELECT auth.uid())));

-- 10. medical_notes & treatment_results
DROP POLICY IF EXISTS "medical_notes_select" ON public.medical_notes;
DROP POLICY IF EXISTS "medical_notes_insert" ON public.medical_notes;
DROP POLICY IF EXISTS "treatment_results_select" ON public.treatment_results;
DROP POLICY IF EXISTS "treatment_results_insert" ON public.treatment_results;

CREATE POLICY "medical_notes_select" ON public.medical_notes
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "medical_notes_insert" ON public.medical_notes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'pt' AND author_id = (SELECT auth.uid()));

CREATE POLICY "treatment_results_select" ON public.treatment_results
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "treatment_results_insert" ON public.treatment_results
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'pt' AND author_id = (SELECT auth.uid()));

-- 11. consents & checkins
DROP POLICY IF EXISTS "consents_select" ON public.consents;
DROP POLICY IF EXISTS "consents_insert" ON public.consents;
DROP POLICY IF EXISTS "consents_update" ON public.consents;
DROP POLICY IF EXISTS "consents_delete" ON public.consents;

CREATE POLICY "consents_select" ON public.consents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR (subject_type = 'patient' AND (SELECT public.is_patient_accessible_by_pt(subject_id)))
    OR (subject_type = 'staff' AND subject_id = (SELECT auth.uid()))
  );

CREATE POLICY "consents_insert" ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR ((SELECT public.current_user_role()) = 'pt' AND subject_type = 'patient' AND (SELECT public.is_patient_accessible_by_pt(subject_id)))
  );

DROP POLICY IF EXISTS "checkins_select" ON public.checkins;
DROP POLICY IF EXISTS "checkins_insert" ON public.checkins;
DROP POLICY IF EXISTS "checkins_update" ON public.checkins;
DROP POLICY IF EXISTS "checkins_delete" ON public.checkins;

CREATE POLICY "checkins_select" ON public.checkins
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin' OR (SELECT public.is_patient_accessible_by_pt(patient_id)));

CREATE POLICY "checkins_insert" ON public.checkins
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) = 'admin'
    OR (
      (SELECT public.current_user_role()) = 'pt'
      AND checked_in_by = (SELECT auth.uid())
      AND (SELECT public.is_patient_accessible_by_pt(patient_id))
    )
  );

-- 12. Storage policies (avatars)
DROP POLICY IF EXISTS "avatars_user_write" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

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
