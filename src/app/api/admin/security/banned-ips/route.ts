import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const banIpSchema = z.object({
  ip: z.string().min(1, 'กรุณาระบุ IP Address'),
  reason: z.string().min(1, 'กรุณาระบุเหตุผลการแบน'),
  expires_at: z.string().optional().nullable(),
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
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data: bannedIps, error } = await adminClient
    .from('banned_ips')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ banned_ips: bannedIps || [] });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = banIpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const { ip, reason, expires_at } = parsed.data;
  const adminClient = createAdminClient();

  const { error } = await adminClient.from('banned_ips').upsert({
    ip: ip.trim(),
    reason,
    banned_by: admin.id,
    expires_at: expires_at || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditLog({
    actor_id: admin.id,
    action: 'BAN_IP_ADDRESS',
    entity: 'banned_ips',
    entity_id: ip,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: { banned_ip: ip, reason, expires_at },
  });

  return NextResponse.json({ success: true, message: `ทำการแบน IP ${ip} เรียบร้อยแล้ว` });
}
