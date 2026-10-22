import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const exerciseSchema = z.object({
  type: z.enum(['exercise', 'minigame']),
  title: z.string().min(1, 'กรุณาระบุชื่อท่าหรือชื่อมินิเกม'),
  body_area: z.string().min(1, 'กรุณาระบุบริเวณร่างกาย (Body Area)'),
  description: z.string().optional().nullable(),
  media_path: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
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

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const typeFilter = searchParams.get('type');
  const bodyArea = searchParams.get('body_area');

  const adminClient = createAdminClient();
  let query = adminClient.from('exercises').select('*').order('created_at', { ascending: false });

  if (typeFilter && typeFilter !== 'all') {
    query = query.eq('type', typeFilter);
  }
  if (bodyArea && bodyArea !== 'all') {
    query = query.eq('body_area', bodyArea);
  }

  const { data: exercises, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ exercises: exercises || [] });
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

  const parsed = exerciseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const { data: exercise, error } = await adminClient
    .from('exercises')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditLog({
    actor_id: admin.id,
    action: 'CREATE_EXERCISE',
    entity: 'exercises',
    entity_id: exercise.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: { title: exercise.title, type: exercise.type },
  });

  return NextResponse.json({ success: true, exercise });
}
