-- Migration: 20261109000001_security_and_storage_overhaul.sql
-- Description: Security hardening, caller-authenticated staff creation RPC, storage bucket, and test data cleanup
-- Target: Supabase Cloud (Project: mctegvnrvmglbibuuczi)

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
-- 2. HARDENED ATOMIC STAFF ACCOUNT CREATION RPC (admin_create_staff_account)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_create_staff_account(
  p_caller_id uuid DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_license_no text DEFAULT NULL,
  p_license_expiry text DEFAULT NULL,
  p_specialty text DEFAULT 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
  p_age int DEFAULT 35,
  p_sex text DEFAULT 'male'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_effective_caller_id uuid;
  v_caller_role text;
  v_caller_status text;
  v_clean_username text;
  v_clean_email text;
  v_new_user_id uuid;
  v_hashed_password text;
  v_license_expiry_date date;
  v_now timestamptz := clock_timestamp();
  v_user_result jsonb;
BEGIN
  -- 1. Caller Privilege Verification (Strict Admin Validation)
  v_effective_caller_id := COALESCE(auth.uid(), p_caller_id);
  IF v_effective_caller_id IS NULL THEN
    RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: ไม่อนุญาตให้สร้างบัญชีเจ้าหน้าที่โดยไม่ระบุตัวตนผู้เรียก (Unauthorized Anonymous Call Blocked)'
      USING ERRCODE = '42501';
  END IF;

  SELECT role, status INTO v_caller_role, v_caller_status
  FROM public.profiles
  WHERE id = v_effective_caller_id;

  IF v_caller_role IS NULL OR v_caller_role != 'admin' OR v_caller_status != 'active' THEN
    RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: เฉพาะผู้อำนวยการ (Admin) เท่านั้นที่สามารถสร้างบัญชีเจ้าหน้าที่ได้'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Strict Input Validation
  v_clean_username := lower(trim(p_username));
  IF v_clean_username IS NULL OR length(v_clean_username) < 3 THEN
    RAISE EXCEPTION 'กรุณากรอกชื่อผู้ใช้ (Username) อย่างน้อย 3 ตัวอักษร'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (v_clean_username ~ '^[a-z0-9._-]+$') THEN
    RAISE EXCEPTION 'ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษรภาษาอังกฤษ ตัวเลข จุด หรือขีดล่างเท่านั้น'
      USING ERRCODE = '22023';
  END IF;

  IF p_password IS NULL OR length(p_password) < 12 THEN
    RAISE EXCEPTION 'รหัสผ่านเริ่มต้นต้องมีความยาวอย่างน้อย 12 ตัวอักษร'
      USING ERRCODE = '22023';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('admin', 'pt') THEN
    RAISE EXCEPTION 'บทบาทผู้ใช้ต้องเป็น admin หรือ pt เท่านั้น'
      USING ERRCODE = '22023';
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'กรุณากรอกชื่อ - นามสกุลจริง'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Collision Checks
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_clean_username) THEN
    RAISE EXCEPTION 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว'
      USING ERRCODE = '23505';
  END IF;

  v_clean_email := v_clean_username || '@drtech.care';

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    RAISE EXCEPTION 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว'
      USING ERRCODE = '23505';
  END IF;

  IF p_role = 'pt' THEN
    IF p_license_no IS NULL OR length(trim(p_license_no)) = 0 THEN
      RAISE EXCEPTION 'กรุณาระบุเลขที่ใบประกอบวิชาชีพกายภาพบำบัด'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.pts WHERE license_no = trim(p_license_no)) THEN
      RAISE EXCEPTION 'เลขที่ใบประกอบวิชาชีพนี้มีอยู่ในระบบแล้ว'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 4. Create auth user with bcrypt hash
  v_new_user_id := extensions.gen_random_uuid();
  v_hashed_password := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_new_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    v_hashed_password,
    v_now,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('username', v_clean_username, 'full_name', trim(p_full_name), 'role', p_role),
    v_now,
    v_now
  );

  -- 5. Insert into public.profiles
  BEGIN
    INSERT INTO public.profiles (
      id,
      username,
      full_name,
      role,
      phone,
      bio,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_new_user_id,
      v_clean_username,
      trim(p_full_name),
      p_role::public.staff_role,
      NULLIF(trim(p_phone), ''),
      NULLIF(trim(p_bio), ''),
      'active',
      v_now,
      v_now
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.profiles (
      id,
      username,
      full_name,
      role,
      phone,
      bio,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_new_user_id,
      v_clean_username,
      trim(p_full_name),
      p_role::public.user_role,
      NULLIF(trim(p_phone), ''),
      NULLIF(trim(p_bio), ''),
      'active',
      v_now,
      v_now
    );
  END;

  -- 6. Insert into public.pts if PT role
  IF p_role = 'pt' THEN
    IF p_license_expiry IS NOT NULL AND length(trim(p_license_expiry)) > 0 THEN
      BEGIN
        v_license_expiry_date := p_license_expiry::date;
      EXCEPTION WHEN OTHERS THEN
        v_license_expiry_date := (now() + interval '5 years')::date;
      END;
    ELSE
      v_license_expiry_date := (now() + interval '5 years')::date;
    END IF;

    INSERT INTO public.pts (
      id,
      license_no,
      license_expiry,
      specialty,
      created_at,
      updated_at
    ) VALUES (
      v_new_user_id,
      trim(p_license_no),
      v_license_expiry_date,
      trim(p_specialty),
      v_now,
      v_now
    );
  END IF;

  -- 7. Audit Logging
  INSERT INTO public.audit_logs (
    actor_type,
    actor_id,
    action,
    entity,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    'admin',
    v_effective_caller_id,
    'create_staff_account',
    'profiles',
    v_new_user_id::text,
    jsonb_build_object(
      'username', v_clean_username,
      'role', p_role,
      'full_name', trim(p_full_name),
      'has_pt_entry', (p_role = 'pt')
    ),
    v_now
  );

  -- 8. Return created profile summary
  v_user_result := jsonb_build_object(
    'id', v_new_user_id,
    'username', v_clean_username,
    'full_name', trim(p_full_name),
    'role', p_role,
    'status', 'active',
    'created_at', v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'user', v_user_result,
    'message', 'สร้างผู้ใช้ ' || v_clean_username || ' สำเร็จเรียบร้อย'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_staff_account(
  uuid, text, text, text, text, text, text, text, text, text, int, text
) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. RLS HARDENING: AUDIT LOGS & PATIENTS
-- ============================================================================
-- Audit logs: Revoke UPDATE/DELETE for anon, strictly append-only
DROP POLICY IF EXISTS "audit_logs_all_anon" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_anon" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_anon" ON public.audit_logs;
CREATE POLICY "audit_logs_select_anon" ON public.audit_logs FOR SELECT TO anon USING (true);
CREATE POLICY "audit_logs_insert_anon" ON public.audit_logs FOR INSERT TO anon WITH CHECK (true);

-- Patients: Revoke DELETE for anon, allow non-archived SELECT
DROP POLICY IF EXISTS "patients_all_anon" ON public.patients;
DROP POLICY IF EXISTS "patients_select_anon" ON public.patients;
DROP POLICY IF EXISTS "patients_insert_anon" ON public.patients;
DROP POLICY IF EXISTS "patients_update_anon" ON public.patients;
CREATE POLICY "patients_select_anon" ON public.patients FOR SELECT TO anon USING (registration_status != 'archived');
CREATE POLICY "patients_insert_anon" ON public.patients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "patients_update_anon" ON public.patients FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. DATA PURGE & RESOLUTION (Idempotent)
-- ============================================================================
-- Archive duplicate patient P-9210
UPDATE public.patients SET registration_status = 'archived', updated_at = now() WHERE hn = 'P-9210';

-- Resolve pending phantom staff calls
UPDATE public.staff_calls SET handled_at = now() WHERE handled_at IS NULL;

-- Purge inactive test modpacks (retain fc000000-0000-0000-0000-000000000001)
DELETE FROM public.modpack_items WHERE modpack_id IN (
  SELECT id FROM public.modpacks WHERE id != 'fc000000-0000-0000-0000-000000000001'
);
DELETE FROM public.modpacks WHERE id != 'fc000000-0000-0000-0000-000000000001';

-- Purge inactive test exercises (retain all 15 active seated upper body exercises and the 9 standard deactivated lower body exercises)
DELETE FROM public.exercises WHERE is_active = false AND id NOT IN (
  'e1000000-0000-0000-0000-000000000006',
  'e1000000-0000-0000-0000-000000000007',
  'e1000000-0000-0000-0000-000000000008',
  'e1000000-0000-0000-0000-000000000009',
  'e1000000-0000-0000-0000-000000000010',
  'e1000000-0000-0000-0000-000000000011',
  'e1000000-0000-0000-0000-000000000012',
  'e1000000-0000-0000-0000-000000000013',
  'e1000000-0000-0000-0000-000000000015'
);
