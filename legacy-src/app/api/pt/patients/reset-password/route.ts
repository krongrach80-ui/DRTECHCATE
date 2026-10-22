import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPtCaller, isPatientAccessibleByPt } from '@/lib/auth/pt-caller';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const resetPasswordSchema = z.object({
  patient_id: z.string().uuid('รหัสประจำตัวผู้ป่วยไม่ถูกต้อง'),
  new_password: z.string().min(12, 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 12 ตัวอักษร'),
});

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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { patient_id, new_password } = parsed.data;
  const adminClient = createAdminClient();

  // 1. Fetch target user's profile to strictly check role
  const { data: targetProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, username, full_name')
    .eq('id', patient_id)
    .single();

  if (profileError || !targetProfile) {
    return NextResponse.json({ error: 'ไม่พบผู้ป่วยในระบบ' }, { status: 404 });
  }

  // STRICT REQUIREMENT: PT is ONLY permitted to reset password for role === 'patient'
  if (targetProfile.role !== 'patient') {
    // Record suspicious attempt in audit log
    await recordAuditLog({
      actor_id: ptCaller.user.id,
      action: 'SUSPICIOUS_UNAUTHORIZED_PASSWORD_RESET_ATTEMPT',
      entity: 'profiles',
      entity_id: patient_id,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent'),
      metadata: {
        target_role: targetProfile.role,
        target_username: targetProfile.username,
        reason: 'PT attempted to reset password for non-patient account',
      },
    });

    return NextResponse.json(
      { error: 'ไม่อนุญาต: นักกายภาพบำบัดสามารถรีเซ็ตรหัสผ่านได้เฉพาะบัญชีผู้ป่วย (Patient) เท่านั้น' },
      { status: 403 }
    );
  }

  // 2. Check PT accessibility to this patient
  const hasAccess = await isPatientAccessibleByPt(ptCaller.user.id, patient_id);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'ไม่อนุญาต: ผู้ป่วยรายนี้ไม่ได้อยู่ในความดูแลของท่าน หรือการฝากเคสหมดอายุแล้ว' },
      { status: 403 }
    );
  }

  // 3. Update auth password
  const { error: updateError } = await adminClient.auth.admin.updateUserById(patient_id, {
    password: new_password,
  });

  if (updateError) {
    return NextResponse.json(
      { error: `ไม่สามารถรีเซ็ตรหัสผ่านได้: ${updateError.message}` },
      { status: 500 }
    );
  }

  // 4. Record audit log
  await recordAuditLog({
    actor_id: ptCaller.user.id,
    action: 'PT_RESET_PATIENT_PASSWORD',
    entity: 'profiles',
    entity_id: patient_id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: {
      patient_username: targetProfile.username,
      patient_name: targetProfile.full_name,
    },
  });

  return NextResponse.json({
    success: true,
    message: `รีเซ็ตรหัสผ่านสำหรับคุณ ${targetProfile.full_name} เรียบร้อยแล้ว`,
  });
}
