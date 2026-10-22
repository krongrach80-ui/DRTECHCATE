import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, hashToken } from '@/lib/security/rate-limit';

const POSSIBLE_STEPS = ['left', 'right', 'nod'] as const;

function generateRandomSteps(): string[] {
  // Pick 2 random distinct steps
  const shuffled = [...POSSIBLE_STEPS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit: 20 challenge requests per minute per IP
  const rateLimit = checkRateLimit(`face_challenge:${ip}`, 20, 60000, 120000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ขอ Challenge บ่อยเกินกำหนด กรุณารอสักครู่' },
      { status: 429 }
    );
  }

  // Extract device token from header or request body
  let deviceToken = req.headers.get('x-kiosk-token');
  if (!deviceToken) {
    try {
      const body = await req.json();
      deviceToken = body?.device_token;
    } catch {
      // Body empty or not JSON
    }
  }

  if (!deviceToken) {
    return NextResponse.json(
      { error: 'ไม่พบ Kiosk Device Token ที่ได้รับอนุญาต' },
      { status: 401 }
    );
  }

  const tokenHash = hashToken(deviceToken);
  const adminClient = createAdminClient();

  // Validate active Kiosk Device
  const { data: device, error: deviceError } = await adminClient
    .from('kiosk_devices')
    .select('id, name, is_active')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (deviceError || !device || !device.is_active) {
    return NextResponse.json(
      { error: 'อุปกรณ์ Kiosk ไม่ถูกต้องหรือยังไม่ได้รับการเปิดใช้งาน' },
      { status: 403 }
    );
  }

  // Update last seen
  await adminClient
    .from('kiosk_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', device.id);

  // Generate cryptographic nonce and 2 random liveness motion steps
  const nonce = crypto.randomUUID();
  const steps = generateRandomSteps();
  const expiresAt = new Date(Date.now() + 60000).toISOString(); // 60 seconds TTL

  // Store in kiosk_challenges
  const { error: insertError } = await adminClient
    .from('kiosk_challenges')
    .insert({
      nonce,
      device_id: device.id,
      steps,
      expires_at: expiresAt,
      is_used: false,
    });

  if (insertError) {
    console.error('Failed to create challenge:', insertError.message);
    return NextResponse.json({ error: 'ไม่สามารถสร้าง Challenge ได้' }, { status: 500 });
  }

  return NextResponse.json({
    nonce,
    steps,
    expires_in: 60,
  });
}
