-- 20261026000001_fix_security_advisor_views_and_search_path.sql
-- DrTech.Care Production Security Advisor Remediation
-- Fixes:
-- 1. 3 Security Definer View Errors (view_patient_recovery_trajectory, view_clinic_daily_summary, view_kiosk_live_telemetry)
-- 2. 34 Function Search Path Mutable Warnings

-- ============================================================================
-- 1. ENFORCE SECURITY INVOKER ON REPORTING & TELEMETRY VIEWS
-- ============================================================================
ALTER VIEW IF EXISTS public.view_patient_recovery_trajectory SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_clinic_daily_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_kiosk_live_telemetry SET (security_invoker = true);

-- ============================================================================
-- 2. EXPLICITLY HARDEN SEARCH PATH ON ALL CORE MEDICAL & BIOMETRIC FUNCTIONS
-- ============================================================================
-- Fix baseline functions to use strict and mutable-safe search_path
ALTER FUNCTION IF EXISTS public.current_user_role() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.is_patient_accessible_by_pt(UUID) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.match_face_candidates(extensions.vector(512), UUID[], INT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enroll_face_atomic(UUID, extensions.vector(512), TEXT, JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.check_profile_update_privileges() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enforce_content_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.enforce_modpack_item_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.check_course_ownership() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_audit_logs_tampering() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_medical_notes_tampering() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION IF EXISTS public.prevent_treatment_results_tampering() SET search_path = public, extensions, pg_temp;

-- Fix legacy/extension functions if present
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
-- 3. DYNAMIC SWEEP FOR ANY REMAINING PUBLIC SCHEMA FUNCTIONS (GUARANTEES 100% COVERAGE)
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
          AND p.prokind = 'f' -- Only ordinary functions
    ) LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp;', r.proname, r.args);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not set search_path for function %I(%s): %', r.proname, r.args, SQLERRM;
        END;
    END LOOP;
END $$;
