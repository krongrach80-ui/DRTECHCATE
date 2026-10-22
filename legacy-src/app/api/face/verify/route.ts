import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, resetRateLimit, hashToken } from '@/lib/security/rate-limit';
import { recordAuditLog } from '@/lib/security/audit';

const verifySchema = z.object({
  nonce: z.string().min(1, 'กรุณาระบุ Challenge Nonce'),
  embedding: z.array(z.number()).length(128, 'Vector ใบหน้าต้องมีความยาว 128 มิติ'),
  device_token: z.string().optional(),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

function generateQueueToken(patientId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'kiosk-queue-secret';
  const expiresAt = Date.now() + 300000; // 5 minutes validity
  const payload = `${patientId}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // 1. Rate Limiting per IP
  const rateLimit = checkRateLimit(`face_verify:${ip}`, 10, 60000, 300000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `คุณพยายามยืนยันตัวตนถี่เกินไป กรุณารอ ${rateLimit.retryAfterSeconds} วินาที`,
        retryAfter: rateLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  // 2. Validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลพารามิเตอร์ไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { nonce, embedding, device_token: bodyDeviceToken } = parsed.data;
  const deviceToken = req.headers.get('x-kiosk-token') || bodyDeviceToken;

  if (!deviceToken) {
    return NextResponse.json({ error: 'ไม่พบ Kiosk Device Token' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const tokenHash = hashToken(deviceToken);

  // 3. Verify Kiosk Device
  const { data: device, error: deviceError } = await adminClient
    .from('kiosk_devices')
    .select('id, name, is_active')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (deviceError || !device || !device.is_active) {
    return NextResponse.json({ error: 'อุปกรณ์ Kiosk ไม่ถูกต้องหรือถูกระงับการใช้งาน' }, { status: 403 });
  }

  // 4. Verify & Invalidate Challenge Nonce (Single Use)
  const { data: challenge, error: challengeError } = await adminClient
    .from('kiosk_challenges')
    .select('nonce, device_id, expires_at, is_used')
    .eq('nonce', nonce)
    .eq('device_id', device.id)
    .maybeSingle();

  if (challengeError || !challenge) {
    return NextResponse.json({ error: 'Challenge Nonce ไม่ถูกต้อง' }, { status: 400 });
  }

  if (challenge.is_used) {
    return NextResponse.json({ error: 'Challenge Nonce นี้ถูกใช้งานไปแล้ว' }, { status: 400 });
  }

  if (new Date(challenge.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Challenge Nonce หมดอายุแล้ว (เกิน 60 วินาที)' }, { status: 400 });
  }

  // Mark challenge as used immediately
  await adminClient
    .from('kiosk_challenges')
    .update({ is_used: true })
    .eq('nonce', nonce);

  // 5. Query Vector Match via pgvector helper function find_matching_face
  const similarityThreshold = parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.60');
  const matchMargin = parseFloat(process.env.FACE_MATCH_MARGIN || '0.10');

  // Format vector as string literal for Postgres: '[0.123, 0.456, ...]'
  const vectorStr = `[${embedding.join(',')}]`;

  const { data: matchResult, error: matchError } = await adminClient.rpc('find_matching_face', {
    query_embedding: vectorStr,
    match_threshold: similarityThreshold,
    match_margin: matchMargin,
  });

  const failureKey = `face_failure:${device.id}`;
  const failureCheck = checkRateLimit(failureKey, 3, 300000, 600000);

  if (matchError || !matchResult || matchResult.length === 0) {
    // No match within threshold
    await recordAuditLog({
      action: 'FACE_VERIFY_FAILED',
      entity: 'face_templates',
      ip,
      user_agent: userAgent,
      metadata: {
        device_id: device.id,
        device_name: device.name,
        reason: 'No face match within similarity threshold',
      },
    });

    const isExceeded = !failureCheck.allowed;
    return NextResponse.json({
      success: false,
      fallback: isExceeded,
      message: isExceeded
        ? 'การสแกนใบหน้าไม่สำเร็จครบ 3 ครั้ง กรุณากรอกเบอร์โทรศัพท์เพื่อเช็คอิน หรือติดต่อเจ้าหน้าที่'
        : 'ไม่พบใบหน้าในระบบ หรือแสงไม่เพียงพอ กรุณาลองใหม่อีกครั้ง',
    }, { status: 404 });
  }

  const { matched_user_id, distance, is_ambiguous } = matchResult[0];

  // Ambiguity check
  if (is_ambiguous) {
    await recordAuditLog({
      actor_id: matched_user_id,
      action: 'FACE_VERIFY_AMBIGUOUS',
      entity: 'face_templates',
      entity_id: matched_user_id,
      ip,
      user_agent: userAgent,
      metadata: {
        device_id: device.id,
        device_name: device.name,
        distance,
        reason: 'Too close to 2nd candidate (within margin)',
      },
    });

    return NextResponse.json({
      success: false,
      fallback: true,
      message: 'ระบบพบความใกล้เคียงระหว่างบุคคล เพื่อความปลอดภัยตาม PDPA กรุณากรอกเบอร์โทรศัพท์เพื่อยืนยันตัวตน',
    }, { status: 409 });
  }

  // 6. Verify Patient Status
  const { data: patientProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, full_name, username, role, is_active')
    .eq('id', matched_user_id)
    .single();

  if (profileError || !patientProfile || !patientProfile.is_active || patientProfile.role !== 'patient') {
    return NextResponse.json({
      success: false,
      fallback: true,
      message: 'ผู้ใช้งานนี้ไม่มีสถานะคนไข้ที่พร้อมใช้งาน กรุณาติดต่อเคาน์เตอร์บริการ',
    }, { status: 403 });
  }

  // Success: Reset failure count and issue scoped queue token
  resetRateLimit(failureKey);

  await recordAuditLog({
    actor_id: patientProfile.id,
    action: 'FACE_VERIFY_SUCCESS',
    entity: 'kiosk_checkin',
    entity_id: patientProfile.id,
    ip,
    user_agent: userAgent,
    metadata: {
      device_id: device.id,
      device_name: device.name,
      distance: Number(distance.toFixed(4)),
    },
  });

  const queueToken = generateQueueToken(patientProfile.id);

  return NextResponse.json({
    success: true,
    patient: {
      id: patientProfile.id,
      full_name: patientProfile.full_name,
      username: patientProfile.username,
    },
    distance: Number(distance.toFixed(4)),
    queue_token: queueToken,
    expires_in: 300,
  });
}
