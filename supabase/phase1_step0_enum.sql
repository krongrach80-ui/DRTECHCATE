-- ============================================================================
-- Dr.Tech.Care — Phase 1 Step 0 (RUN THIS FIRST BY ITSELF in Supabase SQL Editor)
-- ============================================================================
-- Why standalone? PostgreSQL forbids using newly added ENUM labels in the same
-- transaction where ALTER TYPE ... ADD VALUE runs (SQLSTATE 55P04).
-- Highlight/run these 4 lines FIRST, then run supabase/phase1_cleanup_and_sync.sql.
-- ============================================================================

ALTER TYPE public.face_enrollment_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.face_enrollment_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.face_enrollment_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.face_enrollment_status ADD VALUE IF NOT EXISTS 'superseded';

