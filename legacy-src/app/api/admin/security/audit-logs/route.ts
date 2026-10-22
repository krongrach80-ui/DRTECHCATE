import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

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

  const { searchParams } = req.nextUrl;
  const actionFilter = searchParams.get('action');
  const limit = parseInt(searchParams.get('limit') || '50');

  const adminClient = createAdminClient();
  let query = adminClient
    .from('audit_logs')
    .select(`
      id,
      actor_id,
      action,
      entity,
      entity_id,
      ip,
      user_agent,
      metadata,
      created_at,
      profiles (full_name, username, role)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (actionFilter && actionFilter !== 'all') {
    query = query.eq('action', actionFilter);
  }

  const { data: logs, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: logs || [] });
}
