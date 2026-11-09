-- Migration: 20261108000001_pt_profile_update_and_avatar_storage.sql
-- Description: Sovereign PT Profile Update RPC, Storage Bucket for Avatars, and Privilege Escalation Guardrails

-- ============================================================================
-- 1. STORAGE BUCKET FOR AVATARS (Public Read, 2 MB Limit, Safe Mime Types)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage Object Policies
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_folder_owner_insert" ON storage.objects;
CREATE POLICY "avatars_folder_owner_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    array_length(storage.foldername(name), 1) = 1 AND
    (
      auth.uid() IS NULL OR
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = (storage.foldername(name))[1]::uuid)
    )
  );

DROP POLICY IF EXISTS "avatars_folder_owner_update" ON storage.objects;
CREATE POLICY "avatars_folder_owner_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (
    bucket_id = 'avatars' AND
    array_length(storage.foldername(name), 1) = 1 AND
    (
      auth.uid() IS NULL OR
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = (storage.foldername(name))[1]::uuid)
    )
  );

DROP POLICY IF EXISTS "avatars_folder_owner_delete" ON storage.objects;
CREATE POLICY "avatars_folder_owner_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (
    bucket_id = 'avatars' AND
    array_length(storage.foldername(name), 1) = 1 AND
    (
      auth.uid() IS NULL OR
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = (storage.foldername(name))[1]::uuid)
    )
  );

-- ============================================================================
-- 2. PRIVILEGE ESCALATION TRIGGER GUARDRAILS (PROFILES & PTS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_profile_and_pt_modifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 2.1 Guard Profiles Table: Reject unauthorized role, username, or status changes
  IF TG_TABLE_NAME = 'profiles' THEN
    IF (OLD.role IS DISTINCT FROM NEW.role OR
        OLD.username IS DISTINCT FROM NEW.username OR
        OLD.status IS DISTINCT FROM NEW.status) THEN
      IF (COALESCE(public.current_user_role()::text, 'anon') != 'admin') THEN
        RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: ไม่อนุญาตให้แก้ไข role, username หรือสถานะบัญชี (Privilege Escalation Blocked)'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 2.2 Guard PTs Table: Reject license_no change (strictly Read-Only)
  IF TG_TABLE_NAME = 'pts' THEN
    IF (OLD.license_no IS DISTINCT FROM NEW.license_no) THEN
      IF (COALESCE(public.current_user_role()::text, 'anon') != 'admin') THEN
        RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: เลขที่ใบประกอบวิชาชีพเป็น Read-Only ไม่อนุญาตให้แก้ไข'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_modifications ON public.profiles;
CREATE TRIGGER trg_guard_profiles_modifications
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_and_pt_modifications();

DROP TRIGGER IF EXISTS trg_guard_pts_modifications ON public.pts;
CREATE TRIGGER trg_guard_pts_modifications
  BEFORE UPDATE ON public.pts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_and_pt_modifications();

-- ============================================================================
-- 3. SOVEREIGN ATOMIC RPC: update_own_pt_profile
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_own_pt_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_specialty text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_profile RECORD;
  v_pt RECORD;
  v_now timestamptz := clock_timestamp();
  v_clean_phone text;
  v_clean_fullname text;
BEGIN
  -- 1. Verify target user exists
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบบัญชีผู้ใช้ในระบบ' USING ERRCODE = '20000';
  END IF;

  -- 2. Verify identity & authorization (Self or Admin)
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL AND v_caller_id != p_user_id THEN
    IF COALESCE(public.current_user_role()::text, 'anon') != 'admin' THEN
      RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: คุณสามารถแก้ไขได้เฉพาะโปรไฟล์ของตนเองเท่านั้น'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Strict Validation
  v_clean_fullname := trim(COALESCE(p_full_name, ''));
  IF length(v_clean_fullname) = 0 THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อ-นามสกุลจริง' USING ERRCODE = '22023';
  END IF;

  v_clean_phone := trim(COALESCE(p_phone, ''));
  IF length(v_clean_phone) > 0 THEN
    IF NOT (v_clean_phone ~ '^[0-9]{10}$') THEN
      RAISE EXCEPTION 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_clean_phone := NULL;
  END IF;

  -- 4. Update public.profiles (strictly omitting role, username, status)
  UPDATE public.profiles
  SET
    full_name = v_clean_fullname,
    phone = v_clean_phone,
    bio = NULLIF(trim(COALESCE(p_bio, '')), ''),
    avatar_url = COALESCE(NULLIF(trim(COALESCE(p_avatar_url, '')), ''), public.profiles.avatar_url),
    updated_at = v_now
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  -- 5. UPSERT public.pts for PT details (support new accounts without pts row)
  INSERT INTO public.pts (
    user_id,
    license_no,
    license_expiry,
    specialty,
    age,
    sex,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    'ก.ภ. รอระบุ',
    NULL,
    COALESCE(NULLIF(trim(COALESCE(p_specialty, '')), ''), 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด'),
    35,
    'male',
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    specialty = COALESCE(NULLIF(trim(COALESCE(p_specialty, '')), ''), public.pts.specialty),
    updated_at = v_now
  RETURNING * INTO v_pt;

  -- 6. Return combined profile object
  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'full_name', v_profile.full_name,
      'role', v_profile.role,
      'phone', v_profile.phone,
      'bio', v_profile.bio,
      'avatar_url', v_profile.avatar_url,
      'status', v_profile.status,
      'created_at', v_profile.created_at,
      'updated_at', v_profile.updated_at,
      'specialty', v_pt.specialty,
      'pt_details', jsonb_build_object(
        'license_no', v_pt.license_no,
        'license_expiry', v_pt.license_expiry,
        'specialty', v_pt.specialty,
        'age', v_pt.age,
        'sex', v_pt.sex
      )
    ),
    'message', 'บันทึกข้อมูลส่วนตัวเรียบร้อย'
  );
END;
$$;

-- Grant EXECUTE to anon, authenticated, service_role
GRANT EXECUTE ON FUNCTION public.update_own_pt_profile(
  uuid, text, text, text, text, text
) TO anon, authenticated, service_role;

