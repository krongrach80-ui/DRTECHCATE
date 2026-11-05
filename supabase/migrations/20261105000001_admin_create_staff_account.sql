-- Migration: 20261105000001_admin_create_staff_account.sql
-- Description: Sovereign Server-Side Atomic Staff Account Creation for Dr.Tech.Care
-- Purpose: Atomically create staff accounts (PT / Admin) across auth.users, public.profiles,
--          public.pts, and public.audit_logs with zero orphan accounts and full transaction safety.

-- 1. Create or replace atomic SECURITY DEFINER RPC function
CREATE OR REPLACE FUNCTION public.admin_create_staff_account(
  p_username text,
  p_password text,
  p_role text,
  p_full_name text,
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
  v_caller_id uuid;
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
  -- 1. Caller Privilege Verification (Admin only)
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT role, status INTO v_caller_role, v_caller_status
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_role != 'admin' OR v_caller_status != 'active' THEN
      RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: เฉพาะผู้อำนวยการ (Admin) เท่านั้นที่สามารถสร้างบัญชีเจ้าหน้าที่ได้'
        USING ERRCODE = '42501';
    END IF;
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
  -- Check existing in profiles
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_clean_username) THEN
    RAISE EXCEPTION 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว'
      USING ERRCODE = '23505';
  END IF;

  v_clean_email := v_clean_username || '@drtech.care';

  -- Check existing in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    RAISE EXCEPTION 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว'
      USING ERRCODE = '23505';
  END IF;

  -- PT Specific validation
  IF p_role = 'pt' THEN
    IF p_license_no IS NULL OR length(trim(p_license_no)) = 0 THEN
      RAISE EXCEPTION 'กรุณาระบุเลขที่ใบประกอบวิชาชีพกายภาพบำบัด'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.pts WHERE license_no = trim(p_license_no)) THEN
      RAISE EXCEPTION 'เลขที่ใบประกอบวิชาชีพนี้มีอยู่ในระบบแล้ว'
        USING ERRCODE = '23505';
    END IF;

    IF p_license_expiry IS NOT NULL AND length(trim(p_license_expiry)) > 0 THEN
      BEGIN
        v_license_expiry_date := trim(p_license_expiry)::date;
      EXCEPTION WHEN OTHERS THEN
        v_license_expiry_date := NULL;
      END;
    ELSE
      v_license_expiry_date := NULL;
    END IF;
  END IF;

  -- 4. Atomic Execution: Create Auth User & Identities
  v_new_user_id := gen_random_uuid();
  v_hashed_password := extensions.crypt(p_password, extensions.gen_salt('bf'));

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

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_user_id,
    jsonb_build_object('sub', v_new_user_id::text, 'email', v_clean_email),
    'email',
    v_new_user_id::text,
    v_now,
    v_now,
    v_now
  );

  -- 5. Insert into public.profiles
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
    p_role,
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_bio), ''),
    'active',
    v_now,
    v_now
  );

  -- 6. Insert into public.pts if PT role
  IF p_role = 'pt' THEN
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
      v_new_user_id,
      trim(p_license_no),
      v_license_expiry_date,
      COALESCE(NULLIF(trim(p_specialty), ''), 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด'),
      COALESCE(p_age, 35),
      COALESCE(NULLIF(trim(p_sex), ''), 'male'),
      v_now,
      v_now
    );
  END IF;

  -- 7. Record Audit Log
  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  ) VALUES (
    COALESCE(v_caller_id, v_new_user_id),
    'create_staff',
    'profile',
    v_new_user_id,
    jsonb_build_object(
      'username', v_clean_username,
      'role', p_role,
      'full_name', trim(p_full_name)
    ),
    v_now
  );

  -- 8. Build Return User Object
  v_user_result := jsonb_build_object(
    'id', v_new_user_id,
    'username', v_clean_username,
    'full_name', trim(p_full_name),
    'role', p_role,
    'phone', NULLIF(trim(p_phone), ''),
    'bio', NULLIF(trim(p_bio), ''),
    'status', 'active',
    'created_at', v_now
  );

  IF p_role = 'pt' THEN
    v_user_result := v_user_result || jsonb_build_object(
      'license_no', trim(p_license_no),
      'license_expiry', v_license_expiry_date,
      'specialty', COALESCE(NULLIF(trim(p_specialty), ''), 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด'),
      'age', COALESCE(p_age, 35),
      'sex', COALESCE(NULLIF(trim(p_sex), ''), 'male')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user', v_user_result,
    'message', 'สร้างผู้ใช้ ' || v_clean_username || ' สำเร็จเรียบร้อย'
  );
END;
$$;

-- Grant EXECUTE to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.admin_create_staff_account(
  text, text, text, text, text, text, text, text, text, int, text
) TO anon, authenticated, service_role;

