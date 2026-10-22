import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPtCaller } from '@/lib/auth/pt-caller';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const createPatientSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่างเท่านั้น'),
  password: z.string().min(12, 'รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร'),
  full_name: z.string().min(1, 'กรุณาระบุชื่อ-นามสกุล'),
  phone: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  sex: z.enum(['male', 'female', 'other']).optional().nullable(),
  chief_complaint: z.string().optional().nullable(),
  diagnosis: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  chronic_diseases: z.string().optional().nullable(),
  emergency_contact: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const ptCaller = await verifyPtCaller(req);
  if (!ptCaller) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะนักกายภาพบำบัด (PT) เท่านั้น' }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const ptId = ptCaller.user.id;
  const today = new Date().toISOString().split('T')[0];

  // 1. Get primary assigned patient IDs
  const { data: primaryAssignments, error: assignError } = await adminClient
    .from('patient_pt_assignments')
    .select('patient_id, is_primary')
    .eq('pt_id', ptId);

  if (assignError) {
    return NextResponse.json({ error: assignError.message }, { status: 500 });
  }

  // 2. Get active temporary transferred patient IDs
  const { data: activeTransfers, error: transferError } = await adminClient
    .from('case_transfers')
    .select(`
      id,
      patient_id,
      from_pt_id,
      start_date,
      end_date,
      from_pt:profiles!case_transfers_from_pt_id_fkey(full_name, username)
    `)
    .eq('to_pt_id', ptId)
    .eq('status', 'active')
    .lte('start_date', today)
    .gte('end_date', today);

  if (transferError) {
    return NextResponse.json({ error: transferError.message }, { status: 500 });
  }

  const primaryPatientIds = (primaryAssignments || []).map((a) => a.patient_id);
  const transferMap = new Map<string, { fromPtName: string; startDate: string; endDate: string }>();

  (activeTransfers || []).forEach((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromPt = t.from_pt as any;
    transferMap.set(t.patient_id, {
      fromPtName: fromPt?.full_name || fromPt?.username || 'นักกายภาพบำบัด',
      startDate: t.start_date,
      endDate: t.end_date,
    });
  });

  const allPatientIds = Array.from(new Set([...primaryPatientIds, ...Array.from(transferMap.keys())]));

  if (allPatientIds.length === 0) {
    return NextResponse.json({ patients: [] });
  }

  // 3. Fetch patient profiles & patient details
  const { data: patientProfiles, error: profilesError } = await adminClient
    .from('profiles')
    .select(`
      id,
      username,
      full_name,
      phone,
      avatar_url,
      is_active,
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
      face_enrollments (
        id,
        status,
        created_at
      )
    `)
    .in('id', allPatientIds)
    .order('created_at', { ascending: false });

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const formattedPatients = (patientProfiles || []).map((p) => {
    const isTransferred = transferMap.has(p.id);
    const transferInfo = transferMap.get(p.id);
    const isPrimary = primaryPatientIds.includes(p.id);

    return {
      ...p,
      careType: isTransferred ? 'transferred' : 'primary',
      isPrimary,
      transferInfo: isTransferred ? transferInfo : null,
    };
  });

  return NextResponse.json({ patients: formattedPatients });
}

export async function POST(req: NextRequest) {
  const ptCaller = await verifyPtCaller(req);
  if (!ptCaller) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะนักกายภาพบำบัด (PT) เท่านั้น' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = createPatientSchema.safeParse(body);
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

  // 1. Create auth.users with role 'patient' strictly
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      role: 'patient',
      username: data.username,
      full_name: data.full_name,
    },
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: `สร้างบัญชีผู้ป่วยไม่สำเร็จ: ${authError?.message || 'Auth failure'}` },
      { status: 500 }
    );
  }

  const patientId = authData.user.id;

  try {
    // 2. Insert profile
    const { error: profileError } = await adminClient.from('profiles').insert({
      id: patientId,
      role: 'patient',
      username: data.username.toLowerCase(),
      full_name: data.full_name,
      phone: data.phone || null,
      is_active: true,
    });

    if (profileError) throw profileError;

    // 3. Insert patient record
    const { error: patientError } = await adminClient.from('patients').insert({
      user_id: patientId,
      date_of_birth: data.date_of_birth || null,
      sex: data.sex || null,
      chief_complaint: data.chief_complaint || null,
      diagnosis: data.diagnosis || null,
      allergies: data.allergies || null,
      chronic_diseases: data.chronic_diseases || null,
      emergency_contact: data.emergency_contact || null,
    });

    if (patientError) throw patientError;

    // 4. Primary assignment to calling PT
    const { error: assignError } = await adminClient.from('patient_pt_assignments').insert({
      patient_id: patientId,
      pt_id: ptCaller.user.id,
      is_primary: true,
    });

    if (assignError) throw assignError;

    // 5. Audit log
    await recordAuditLog({
      actor_id: ptCaller.user.id,
      action: 'PT_CREATE_PATIENT',
      entity: 'patients',
      entity_id: patientId,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent'),
      metadata: {
        username: data.username,
        full_name: data.full_name,
        assigned_to_pt: ptCaller.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      patient: {
        id: patientId,
        username: data.username,
        full_name: data.full_name,
        role: 'patient',
      },
    });
  } catch (err: unknown) {
    // Rollback
    await adminClient.auth.admin.deleteUser(patientId);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${msg}` }, { status: 500 });
  }
}
