-- ========================================================================
-- 1. CREATE STORAGE BUCKETS
-- ========================================================================

-- avatars bucket (Private bucket with controlled signed/authenticated access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- biometric-data bucket (STRICTLY PRIVATE: Biometric raw crops 10 frames)
-- No direct client access allowed under any circumstances.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'biometric-data',
  'biometric-data',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png'];

-- exercise-media bucket (Exercise & Minigame demonstrations, videos, images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exercise-media',
  'exercise-media',
  false,
  52428800, -- 50 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];

-- ========================================================================
-- 2. STORAGE POLICIES
-- ========================================================================

-- AVATARS:
-- Read: Authenticated users can view avatars
CREATE POLICY "avatars_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- Upload/Update: User can only upload to their own user_id directory, or Admin
CREATE POLICY "avatars_user_upload" ON storage.objects
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

-- BIOMETRIC-DATA:
-- Strictly Private: NO client policies for authenticated or anon!
-- Accessible exclusively through server-side service_role or admin signed URLs.

-- EXERCISE-MEDIA:
-- Read: All authenticated users can view exercise media
CREATE POLICY "exercise_media_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'exercise-media');

-- Write: Only Admin can upload, update, or delete exercise media
CREATE POLICY "exercise_media_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'exercise-media' AND current_user_role() = 'admin'
  )
  WITH CHECK (
    bucket_id = 'exercise-media' AND current_user_role() = 'admin'
  );
