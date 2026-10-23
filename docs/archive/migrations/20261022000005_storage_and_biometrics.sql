-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 05: Private Storage Buckets & Server-Side Biometric Matching
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. STORAGE BUCKETS (ALL PRIVATE - Rule #8)
-- ------------------------------------------------------------------------

-- 1.1 Avatars Bucket (5 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 1.2 Biometric Data Bucket (10 MB limit)
-- STRICTLY PRIVATE: Biometric raw crops 10 frames - Accessible via service_role only
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'biometric-data',
  'biometric-data',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png'];

-- 1.3 Exercise Media Bucket (50 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exercise-media',
  'exercise-media',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];

-- ------------------------------------------------------------------------
-- 2. STORAGE POLICIES
-- ------------------------------------------------------------------------

-- Avatars: Authenticated read; write to own directory or admin
CREATE POLICY "avatars_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_user_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      current_user_role() = 'admin'
    )
  );

CREATE POLICY "avatars_user_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      current_user_role() = 'admin'
    )
  );

CREATE POLICY "avatars_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      current_user_role() = 'admin'
    )
  );

-- Biometric-Data: Strictly Private - NO client policies for authenticated or anon!
-- Accessible exclusively through backend Express service_role

-- Exercise-Media: Authenticated read; Admin write
CREATE POLICY "exercise_media_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'exercise-media');

CREATE POLICY "exercise_media_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'exercise-media' AND current_user_role() = 'admin'
  )
  WITH CHECK (
    bucket_id = 'exercise-media' AND current_user_role() = 'admin'
  );

-- ------------------------------------------------------------------------
-- 3. SERVER-SIDE BIOMETRIC SEARCH RPC: match_face_candidates
-- Section 4 & 7.4: Cosine similarity matching against candidate set
-- Takes probes and candidate_ids, computes avg of top-3 similarities per patient
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_face_candidates(
  probe vector(512)[],
  candidate_ids uuid[],
  k int DEFAULT 5
)
RETURNS TABLE (
  patient_id uuid,
  score double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If candidate list is empty, return empty set (prevents searching full gallery by accident)
  IF candidate_ids IS NULL OR array_length(candidate_ids, 1) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH probe_unrolled AS (
    SELECT unnest(probe) AS p_vec
  ),
  similarities AS (
    SELECT
      ft.patient_id AS pid,
      -- Cosine similarity is 1 - cosine distance
      (1.0 - (ft.embedding <=> pu.p_vec)) AS sim,
      ROW_NUMBER() OVER (
        PARTITION BY ft.patient_id
        ORDER BY (1.0 - (ft.embedding <=> pu.p_vec)) DESC
      ) AS rank
    FROM face_templates ft
    CROSS JOIN probe_unrolled pu
    WHERE ft.patient_id = ANY(candidate_ids)
  ),
  top_similarities AS (
    -- Take up to top 3 scores per patient
    SELECT
      s.pid,
      s.sim
    FROM similarities s
    WHERE s.rank <= 3
  ),
  aggregated_scores AS (
    SELECT
      ts.pid AS agg_patient_id,
      AVG(ts.sim)::double precision AS avg_score
    FROM top_similarities ts
    GROUP BY ts.pid
  )
  SELECT
    a.agg_patient_id,
    a.avg_score
  FROM aggregated_scores a
  ORDER BY a.avg_score DESC
  LIMIT k;
END;
$$;

-- Strict access restriction: Only service_role can execute biometric search
REVOKE ALL ON FUNCTION match_face_candidates(vector(512)[], uuid[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_face_candidates(vector(512)[], uuid[], int) TO service_role;
