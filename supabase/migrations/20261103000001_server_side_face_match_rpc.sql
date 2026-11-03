-- Migration: 20261103000001_server_side_face_match_rpc.sql
-- Server-Side Sovereign Face Matching RPC for Dr.Tech.Care Kiosk & API
-- Invariant 1: Matches against public.face_templates INNER JOIN public.face_enrollments INNER JOIN public.patients
-- Invariant 2: Active patients only (registration_status != 'archived' AND fe.status = 'active')
-- Invariant 3: Immediate exclusion upon patient deletion (CASCADE + INNER JOIN)
-- Invariant 4: Cosine distance calculation directly in PostgreSQL via pgvector <=> operator

CREATE OR REPLACE FUNCTION public.match_patient_face(
  probe_embedding extensions.vector(512),
  match_threshold float DEFAULT 0.55,
  match_limit int DEFAULT 3
)
RETURNS TABLE (
  patient_id uuid,
  hn text,
  first_name text,
  last_name text,
  age int,
  sex text,
  similarity float,
  distance float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT
    p.id AS patient_id,
    p.hn,
    p.first_name,
    p.last_name,
    p.age,
    p.sex,
    ROUND((1.0 - (ft.embedding OPERATOR(extensions.<=>) probe_embedding))::numeric, 4)::float AS similarity,
    ROUND((ft.embedding OPERATOR(extensions.<=>) probe_embedding)::numeric, 4)::float AS distance
  FROM public.face_templates ft
  INNER JOIN public.face_enrollments fe ON fe.id = ft.enrollment_id
  INNER JOIN public.patients p ON ft.patient_id = p.id
  WHERE fe.status = 'active'
    AND p.registration_status != 'archived'
    AND (1.0 - (ft.embedding OPERATOR(extensions.<=>) probe_embedding)) >= match_threshold
  ORDER BY (ft.embedding OPERATOR(extensions.<=>) probe_embedding) ASC
  LIMIT match_limit;
$$;

-- Grant EXECUTE to anon and authenticated so Kiosk and API can call this RPC securely
GRANT EXECUTE ON FUNCTION public.match_patient_face(extensions.vector(512), float, int) TO anon, authenticated, service_role;
