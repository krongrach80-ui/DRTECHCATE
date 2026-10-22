import { NextRequest, NextResponse } from 'next/server';
import { verifyPtCaller } from '@/lib/auth/pt-caller';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ptCaller = await verifyPtCaller(req);
  if (!ptCaller) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะนักกายภาพบำบัด (PT) เท่านั้น' }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // Fetch other active PTs
  const { data: pts, error } = await adminClient
    .from('profiles')
    .select(`
      id,
      full_name,
      username,
      pts (
        license_no,
        specialty
      )
    `)
    .eq('role', 'pt')
    .eq('is_active', true)
    .neq('id', ptCaller.user.id)
    .order('full_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pts: pts || [] });
}
