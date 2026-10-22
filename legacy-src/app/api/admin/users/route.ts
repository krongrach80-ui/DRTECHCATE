import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const createUserSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่างเท่านั้น'),
  password: z.string().min(12, 'รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร'),
  full_name: z.string().min(1, 'กรุณาระบุชื่อ-นามสกุล'),
  phone: z.string().optional().nullable(),
  role: z.enum(['admin', 'pt', 'patient']),
  // Patient specific fields
  date_of_birth: z.string().optional().nullable(),
  sex: z.enum(['male', 'female', 'other']).optional().nullable(),
  chief_complaint: z.string().optional().nullable(),
  diagnosis: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  chronic_diseases: z.string().optional().nullable(),
  emergency_contact: z.string().optional().nullable(),
  // PT specific fields
  license_no: z.string().optional().nullable(),
  license_expiry: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
});

/**
 * Verify that the calling user has role 'admin'
 */
async function verifyAdminCaller(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: () => {},
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return null;
  }

  return profile;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.toLowerCase() || '';
  const roleFilter = searchParams.get('role');

  const adminClient = createAdminClient();
  let query = adminClient
    .from('profiles')
    .select(`
      id,
      role,
      username,
      full_name,
      phone,
      avatar_url,
      is_active,
      force_logout_at,
      created_at,
      patients (
        date_of_birth,
        sex,
        chief_complaint,
        diagnosis,
        allergies,
        chronic_diseases,
        emergency_contact
      ),
      pts (
        license_no,
        license_expiry,
        specialty
      ),
      face_enrollments (
        id,
        status,
        created_at
      )
    `)
    .order('created_at', { ascending: false });

  if (roleFilter && roleFilter !== 'all') {
    query = query.eq('role', roleFilter);
  }

  const { data: profiles, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter in-memory if search term provided
  let filtered = profiles || [];
  if (search) {
    filtered = filtered.filter(
      (p) =>
        p.username.toLowerCase().includes(search) ||
        p.full_name.toLowerCase().includes(search) ||
        (p.phone && p.phone.includes(search))
    );
  }

  return NextResponse.json({ users: filtered });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const adminClient = createAdminClient();

  // Check unique username
  const { data: existingUser } = await adminClient
    .from('profiles')
    .select('id')
    .eq('username', data.username.toLowerCase())
    .maybeSingle();

  if (existingUser) {
    return NextResponse.json(
      { error: `ชื่อผู้ใช้ '${data.username}' มีอยู่ในระบบแล้ว` },
      { status: 409 }
    );
  }

  const emailDomain = process.env.INTERNAL_EMAIL_DOMAIN || 'clinic.internal';
  const email = `${data.username.toLowerCase()}@${emailDomain}`;

  // 1. Create auth.users
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      role: data.role,
      username: data.username,
      full_name: data.full_name,
    },
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: `สร้างบัญชีไม่สำเร็จ: ${authError?.message || 'Auth failure'}` },
      { status: 500 }
    );
  }

  const userId = authData.user.id;

  try {
    // 2. Insert profiles
    const { error: profileError } = await adminClient.from('profiles').insert({
      id: userId,
      role: data.role,
      username: data.username.toLowerCase(),
      full_name: data.full_name,
      phone: data.phone || null,
      is_active: true,
    });

    if (profileError) throw profileError;

    // 3. Insert role-specific detail tables
    if (data.role === 'patient') {
      const { error: patientError } = await adminClient.from('patients').insert({
        user_id: userId,
        date_of_birth: data.date_of_birth || null,
        sex: data.sex || null,
        chief_complaint: data.chief_complaint || null,
        diagnosis: data.diagnosis || null,
        allergies: data.allergies || null,
        chronic_diseases: data.chronic_diseases || null,
        emergency_contact: data.emergency_contact || null,
      });
      if (patientError) throw patientError;
    } else if (data.role === 'pt') {
      if (!data.license_no) {
        throw new Error('กรุณาระบุเลขที่ใบประกอบวิชาชีพสำหรับนักกายภาพบำบัด');
      }
      const { error: ptError } = await adminClient.from('pts').insert({
        user_id: userId,
        license_no: data.license_no,
        license_expiry: data.license_expiry || null,
        specialty: data.specialty || null,
      });
      if (ptError) throw ptError;
    }

    // 4. Record Audit Log
    await recordAuditLog({
      actor_id: admin.id,
      action: 'CREATE_USER',
      entity: 'profiles',
      entity_id: userId,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent'),
      metadata: {
        created_username: data.username,
        role: data.role,
        full_name: data.full_name,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        username: data.username,
        full_name: data.full_name,
        role: data.role,
      },
    });
  } catch (err: unknown) {
    // Rollback: delete auth user if profile/details creation fails
    await adminClient.auth.admin.deleteUser(userId);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${msg}` }, { status: 500 });
  }
}
