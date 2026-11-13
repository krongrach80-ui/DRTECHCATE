-- ============================================================================
-- Dr.Tech.Care — Phase 2: Trigger Delete Fix, Remaining Junk Cleanup &
-- Multi-Pose Top-3 Face Consensus RPC Upgrade
-- ============================================================================
-- Safe & Idempotent: Run in Supabase SQL Editor AFTER phase1_cleanup_and_sync.sql.
-- Fixes BEFORE DELETE trigger functions that returned NEW (NULL) instead of OLD,
-- purges the remaining inactive junk rows that Phase 1's DELETE triggers skipped,
-- and upgrades public.match_patient_face to Top-1 + Top-3 pose consensus scoring.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REPAIR BEFORE DELETE OWNERSHIP TRIGGERS (RETURN OLD ON DELETE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_exercise_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_uid UUID;
BEGIN
  v_uid := (SELECT auth.uid());
  v_role := public.current_user_role();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> v_uid THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete exercises they personally created.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_enforce_minigame_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_uid UUID;
BEGIN
  v_uid := (SELECT auth.uid());
  v_role := public.current_user_role();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> v_uid THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete minigames they personally created.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_enforce_minigame_question_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_uid UUID;
BEGIN
  v_uid := (SELECT auth.uid());
  v_role := public.current_user_role();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> v_uid THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete questions they personally created.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_enforce_modpack_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_uid UUID;
BEGIN
  v_uid := (SELECT auth.uid());
  v_role := public.current_user_role();
  IF v_role = 'pt' THEN
    IF OLD.created_by <> v_uid THEN
      RAISE EXCEPTION 'Forbidden: Physiotherapists can only modify or delete modpacks they personally created.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. CLEAN REMAINING INACTIVE TEST/JUNK ROWS (NOW THAT TRIGGERS RETURN OLD)
-- ----------------------------------------------------------------------------
-- 2.1 Remove 17 inactive junk modpacks (preserve active & seeded core modpack)
DELETE FROM public.modpacks m
WHERE m.is_active = false
  AND m.id <> 'fc000000-0000-0000-0000-000000000001'::uuid
  AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.modpack_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.modpack_items mi WHERE mi.modpack_id = m.id);

-- 2.2 Remove 21 inactive test exercises (preserve active + seeded e1000000-* + FK references)
DO $$
DECLARE
  v_sql TEXT := $q$
    DELETE FROM public.exercises e
    WHERE e.is_active = false
      AND e.id::text NOT LIKE 'e1000000-0000-0000-0000-%'
      AND NOT EXISTS (SELECT 1 FROM public.course_items ci WHERE ci.exercise_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM public.modpack_items mi WHERE mi.exercise_id = e.id)
  $q$;
BEGIN
  IF to_regclass('public.prescription_items') IS NOT NULL THEN
    v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM public.prescription_items pi WHERE pi.exercise_id = e.id)';
  END IF;

  IF to_regclass('public.exercise_session_logs') IS NOT NULL THEN
    v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM public.exercise_session_logs esl WHERE esl.exercise_id = e.id)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_steps' AND column_name = 'exercise_id'
  ) THEN
    v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM public.mission_steps ms WHERE ms.exercise_id = e.id)';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_steps' AND column_name = 'ref_id'
  ) THEN
    v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM public.mission_steps ms WHERE ms.ref_id = e.id)';
  END IF;

  EXECUTE v_sql;
END $$;

-- 2.3 Remove 8 soft-deleted / TEST minigame_questions (preserve seeded real questions)
DELETE FROM public.minigame_questions
WHERE prompt = '__DELETED__'
   OR id = 'd650391f-9aff-41f4-95d0-432b2d8ea015'::uuid
   OR upper(trim(prompt)) = 'TEST';

-- ----------------------------------------------------------------------------
-- 3. UPGRADE match_patient_face TO TOP-1 + TOP-3 MULTI-POSE CONSENSUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_patient_face(
  probe_embedding extensions.vector(512),
  match_threshold float DEFAULT 0.42,
  match_limit int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  patient_id uuid,
  hn text,
  first_name text,
  last_name text,
  age int,
  sex text,
  phone text,
  injury text,
  responsible_pt_id uuid,
  registration_status text,
  history jsonb,
  similarity float,
  distance float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH ranked_per_patient AS (
    SELECT
      p.id,
      (1.0 - (ft.embedding OPERATOR(extensions.<=>) probe_embedding)) AS sim,
      ROW_NUMBER() OVER (
        PARTITION BY p.id
        ORDER BY (ft.embedding OPERATOR(extensions.<=>) probe_embedding) ASC
      ) AS rn
    FROM public.face_templates ft
    INNER JOIN public.face_enrollments fe ON fe.id = ft.enrollment_id
    INNER JOIN public.patients p ON ft.patient_id = p.id
    WHERE fe.status::text IN ('active', 'completed')
      AND p.registration_status::text != 'archived'
  ),
  scored_per_patient AS (
    SELECT
      r.id,
      GREATEST(
        -1.0::float,
        LEAST(
          1.0::float,
          (0.75 * MAX(r.sim)) + (0.25 * AVG(r.sim) FILTER (WHERE r.rn <= 3))
        )
      ) AS consensus_sim
    FROM ranked_per_patient r
    GROUP BY r.id
  )
  SELECT
    p.id AS id,
    p.id AS patient_id,
    p.hn::text AS hn,
    p.first_name::text AS first_name,
    p.last_name::text AS last_name,
    p.age::int AS age,
    p.sex::text AS sex,
    p.phone::text AS phone,
    p.injury::text AS injury,
    p.responsible_pt_id,
    p.registration_status::text AS registration_status,
    COALESCE(p.history, '{}'::jsonb)
      - 'frames'
      - 'enrolled_frames'
      - 'face_vector'
      - 'frontal_centroid'
      - 'overall_centroid'
      - 'faceDescriptors'
      - 'adaptive_templates' AS history,
    ROUND(s.consensus_sim::numeric, 4)::float AS similarity,
    ROUND(SQRT(GREATEST(0.0, 2.0 * (1.0 - s.consensus_sim)))::numeric, 4)::float AS distance
  FROM scored_per_patient s
  INNER JOIN public.patients p ON p.id = s.id
  WHERE s.consensus_sim >= match_threshold
  ORDER BY s.consensus_sim DESC
  LIMIT match_limit;
$$;

GRANT EXECUTE ON FUNCTION public.match_patient_face(extensions.vector(512), float, int) TO anon, authenticated, service_role;

-- Refresh query planner statistics after cleanup
ANALYZE public.modpacks;
ANALYZE public.exercises;
ANALYZE public.minigame_questions;
ANALYZE public.face_templates;

-- ----------------------------------------------------------------------------
-- 4. POST-PHASE-2 VERIFICATION SUMMARY
-- ----------------------------------------------------------------------------
SELECT
  '✓ PHASE 2 TRIGGER FIX, CLEANUP & TOP-3 CONSENSUS RPC COMPLETE' AS status,
  (SELECT COUNT(*) FROM public.patients) AS patients_count,
  (SELECT COUNT(*) FROM public.face_enrollments) AS face_enrollments_count,
  (SELECT COUNT(*) FROM public.face_templates) AS face_templates_count,
  (SELECT COUNT(*) FROM public.exercises WHERE is_active = true) AS active_exercises_count,
  (SELECT COUNT(*) FROM public.exercises WHERE is_active = false) AS legacy_inactive_exercises_count,
  (SELECT COUNT(*) FROM public.modpacks) AS modpacks_count,
  (SELECT COUNT(*) FROM public.minigame_questions) AS minigame_questions_count;
