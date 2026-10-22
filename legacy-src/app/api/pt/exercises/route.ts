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

  const { data: exercises, error } = await adminClient
    .from('exercises')
    .select('id, type, title, body_area, description, media_path, is_active')
    .eq('is_active', true)
    .order('type', { ascending: false }) // minigames first
    .order('title', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ exercises: exercises || [] });
}
