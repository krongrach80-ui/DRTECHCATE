import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { recordAuditLog } from '@/lib/security/audit';

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const admin = await verifyAdminCaller(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { ip } = await params;
  const decodedIp = decodeURIComponent(ip);
  const adminClient = createAdminClient();

  const { error } = await adminClient.from('banned_ips').delete().eq('ip', decodedIp);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditLog({
    actor_id: admin.id,
    action: 'UNBAN_IP_ADDRESS',
    entity: 'banned_ips',
    entity_id: decodedIp,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: { unbanned_ip: decodedIp },
  });

  return NextResponse.json({ success: true, message: `ปลดแบน IP ${decodedIp} เรียบร้อยแล้ว` });
}
