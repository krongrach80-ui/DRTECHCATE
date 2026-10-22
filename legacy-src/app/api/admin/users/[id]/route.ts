import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { recordAuditLog } from '@/lib/security/audit';

const updateUserSchema = z.object({
  is_active: z.boolean().optional(),
  force_logout: z.boolean().optional(),
  new_password: z.string().min(12).optional(),
});

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
  }

  const { id: userId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const { is_active, force_logout, new_password } = parsed.data;
  const adminClient = createAdminClient();

  // 1. Force logout action
  if (force_logout) {
    const nowIso = new Date().toISOString();
    await adminClient.from('profiles').update({ force_logout_at: nowIso }).eq('id', userId);
    
    // Invalidate sessions via admin auth api
    await adminClient.auth.admin.signOut(userId, 'global');

    await recordAuditLog({
      actor_id: admin.id,
      action: 'FORCE_LOGOUT_USER',
      entity: 'profiles',
      entity_id: userId,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent'),
      metadata: { target_user_id: userId },
    });

    return NextResponse.json({ success: true, message: 'บังคับผู้ใช้ออกจากระบบสำเร็จ' });
  }

  // 2. Toggle active status
  if (typeof is_active === 'boolean') {
    await adminClient.from('profiles').update({ is_active }).eq('id', userId);

    if (!is_active) {
      // If deactivating, also terminate active sessions
      await adminClient.auth.admin.signOut(userId, 'global');
    }

    await recordAuditLog({
      actor_id: admin.id,
      action: is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entity: 'profiles',
      entity_id: userId,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, is_active });
  }

  // 3. Reset password
  if (new_password) {
    const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, {
      password: new_password,
    });

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 });
    }

    await recordAuditLog({
      actor_id: admin.id,
      action: 'ADMIN_RESET_PASSWORD',
      entity: 'auth',
      entity_id: userId,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ' });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
  }

  const { id: userId } = await params;
  const adminClient = createAdminClient();

  // Delete Biometrics only (PDPA Right to Erasure / Biometric Reset)
  // 1. Fetch all enrollment IDs for this user
  const { data: enrollments } = await adminClient
    .from('face_enrollments')
    .select('id')
    .eq('user_id', userId);

  // 2. Delete storage files in biometric-data/{userId}
  const { data: fileList } = await adminClient.storage
    .from('biometric-data')
    .list(userId);

  if (fileList && fileList.length > 0) {
    const filesToRemove: string[] = [];
    for (const item of fileList) {
      if (item.id) {
        filesToRemove.push(`${userId}/${item.name}`);
      } else {
        // Nested enrollment folder
        const { data: subFiles } = await adminClient.storage
          .from('biometric-data')
          .list(`${userId}/${item.name}`);
        if (subFiles) {
          subFiles.forEach((sf) => filesToRemove.push(`${userId}/${item.name}/${sf.name}`));
        }
      }
    }
    if (filesToRemove.length > 0) {
      await adminClient.storage.from('biometric-data').remove(filesToRemove);
    }
  }

  // 3. Delete face_templates and face_enrollments rows
  await adminClient.from('face_templates').delete().eq('user_id', userId);
  await adminClient.from('face_enrollments').delete().eq('user_id', userId);

  // 4. Update consents
  await adminClient
    .from('consents')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('type', 'biometric');

  // 5. Record Audit Log
  await recordAuditLog({
    actor_id: admin.id,
    action: 'DELETE_USER_BIOMETRICS',
    entity: 'face_templates',
    entity_id: userId,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: {
      reason: 'PDPA biometric right to erasure requested by admin',
      enrollment_count: enrollments?.length || 0,
    },
  });

  return NextResponse.json({ success: true, message: 'ลบข้อมูลชีวมาตรใบหน้าของผู้ใช้เรียบร้อยแล้ว' });
}
