import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { recordAuditLog } from '@/lib/security/audit';

const updateExerciseSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(['exercise', 'minigame']).optional(),
  body_area: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  media_path: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
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

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = updateExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: updated, error } = await adminClient
    .from('exercises')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditLog({
    actor_id: admin.id,
    action: 'UPDATE_EXERCISE',
    entity: 'exercises',
    entity_id: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: { ...parsed.data },
  });

  return NextResponse.json({ success: true, exercise: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' }, { status: 403 });
  }

  const { id } = await params;
  const adminClient = createAdminClient();

  // Check if exercise is already scheduled in course_items
  const { count } = await adminClient
    .from('course_items')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_id', id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `ไม่สามารถลบได้เนื่องจากมีคนไข้ที่ถูกจ่ายท่านี้ในคอร์สแล้ว (${count} รายการ) แนะนำให้ปิดการใช้งานแทน` },
      { status: 409 }
    );
  }

  const { error } = await adminClient.from('exercises').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditLog({
    actor_id: admin.id,
    action: 'DELETE_EXERCISE',
    entity: 'exercises',
    entity_id: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ success: true, message: 'ลบรายการท่าฝึกเรียบร้อยแล้ว' });
}
