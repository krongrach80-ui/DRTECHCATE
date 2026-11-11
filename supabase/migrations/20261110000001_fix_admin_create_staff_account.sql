-- Migration: 20261110000001_fix_admin_create_staff_account.sql
-- Description: Replace the conflicting admin_create_staff_account overloads with one
--              function that matches the real schema:
--              - profiles.role is public.user_role (no staff_role type exists)
--              - pts is keyed by user_id and has no created_at/updated_at columns
--              - profiles has no updated_at column
--              The caller is always taken from auth.uid(); no caller id is accepted from the client.

-- 1. Remove both existing overloads so PostgREST cannot resolve an ambiguous call.
DROP FUNCTION IF EXISTS public.admin_create_staff_account(
  uuid, text, text, text, text, text, text, text, text, text, int, text
);
DROP FUNCTION IF EXISTS public.admin_create_staff_account(
  text, text, text, text, text, text, text, text, text, int, text
);

-- 2. Canonical atomic RPC.
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
  v_caller_id uuid := auth.uid();
  v_caller_role public.user_role;
  v_caller_status public.profile_status;
  v_username text;
  v_email text;
  v_full_name text;
  v_role public.user_role;
  v_license_no text;
  v_license_expiry date;
  v_specialty text;
  v_sex text;
  v_new_user_id uuid := extensions.gen_random_uuid();
  v_now timestamptz := clock_timestamp();
BEGIN
  -- 1. Caller must be an active admin.
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: ต้องเข้าสู่ระบบก่อนสร้างบัญชี'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.role, p.status
    INTO v_caller_role, v_caller_status
    FROM public.profiles AS p
   WHERE p.id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'admin'::public.user_role
     OR v_caller_status IS DISTINCT FROM 'active'::public.profile_status THEN
    RAISE EXCEPTION 'สิทธิ์ไม่เพียงพอ: เฉพาะผู้อำนวยการ (Admin) เท่านั้นที่สามารถสร้างบัญชีเจ้าหน้าที่ได้'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Input validation.
  v_username := lower(trim(coalesce(p_username, '')));
  IF length(v_username) < 3 THEN
    RAISE EXCEPTION 'กรุณากรอกชื่อผู้ใช้ (Username) อย่างน้อย 3 ตัวอักษร'
      USING ERRCODE = '22023';
  END IF;

  IF v_username !~ '^[a-z0-9._-]+$' THEN
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

  v_role := p_role::public.user_role;

  v_full_name := trim(coalesce(p_full_name, ''));
  IF length(v_full_name) = 0 THEN
    RAISE EXCEPTION 'กรุณากรอกชื่อ - นามสกุลจริง'
      USING ERRCODE = '22023';
  END IF;

  v_specialty := COALESCE(NULLIF(trim(p_specialty), ''), 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด');
  v_sex := COALESCE(NULLIF(trim(p_sex), ''), 'male');

  -- 3. Collision checks.
  IF EXISTS (SELECT 1 FROM public.profiles AS p WHERE lower(p.username) = v_username) THEN
    RAISE EXCEPTION 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว'
      USING ERRCODE = '23505';
  END IF;

  v_email := v_username || '@drtech.care';

  IF EXISTS (SELECT 1 FROM auth.users AS u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว'
      USING ERRCODE = '23505';
  END IF;

  IF v_role = 'pt'::public.user_role THEN
    v_license_no := trim(coalesce(p_license_no, ''));
    IF length(v_license_no) = 0 THEN
      RAISE EXCEPTION 'กรุณาระบุเลขที่ใบประกอบวิชาชีพกายภาพบำบัด'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.pts AS t WHERE t.license_no = v_license_no) THEN
      RAISE EXCEPTION 'เลขที่ใบประกอบวิชาชีพนี้มีอยู่ในระบบแล้ว'
        USING ERRCODE = '23505';
    END IF;

    v_license_expiry := (now() + interval '5 years')::date;
    IF p_license_expiry IS NOT NULL AND length(trim(p_license_expiry)) > 0 THEN
      BEGIN
        v_license_expiry := trim(p_license_expiry)::date;
      EXCEPTION WHEN OTHERS THEN
        v_license_expiry := (now() + interval '5 years')::date;
      END;
    END IF;
  END IF;

  -- 4. Create the auth user and its email identity.
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
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    v_now,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('username', v_username, 'full_name', v_full_name, 'role', p_role),
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
    extensions.gen_random_uuid(),
    v_new_user_id,
    jsonb_build_object('sub', v_new_user_id::text, 'email', v_email),
    'email',
    v_new_user_id::text,
    v_now,
    v_now,
    v_now
  );

  -- 5. Profile row. profiles has no updated_at column.
  INSERT INTO public.profiles (
    id,
    username,
    full_name,
    role,
    phone,
    bio,
    status,
    created_at
  ) VALUES (
    v_new_user_id,
    v_username,
    v_full_name,
    v_role,
    NULLIF(trim(coalesce(p_phone, '')), ''),
    NULLIF(trim(coalesce(p_bio, '')), ''),
    'active'::public.profile_status,
    v_now
  );

  -- 6. PT row. pts is keyed by user_id and has no timestamp columns.
  IF v_role = 'pt'::public.user_role THEN
    INSERT INTO public.pts (
      user_id,
      license_no,
      license_expiry,
      specialty,
      age,
      sex
    ) VALUES (
      v_new_user_id,
      v_license_no,
      v_license_expiry,
      v_specialty,
      COALESCE(p_age, 35),
      v_sex
    );
  END IF;

  -- 7. Audit log.
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
    v_caller_id,
    'create_staff_account',
    'profiles',
    v_new_user_id,
    jsonb_build_object(
      'username', v_username,
      'role', p_role,
      'full_name', v_full_name,
      'has_pt_entry', (v_role = 'pt'::public.user_role)
    ),
    v_now
  );

  -- 8. Return the created account.
  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_new_user_id,
      'username', v_username,
      'full_name', v_full_name,
      'role', p_role,
      'status', 'active',
      'created_at', v_now
    ),
    'message', 'สร้างผู้ใช้ ' || v_username || ' สำเร็จเรียบร้อย'
  );
END;
$$;

-- 3. Only signed-in callers may execute the RPC. Anonymous callers are blocked.
REVOKE ALL ON FUNCTION public.admin_create_staff_account(
  text, text, text, text, text, text, text, text, text, int, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_staff_account(
  text, text, text, text, text, text, text, text, text, int, text
) TO authenticated;