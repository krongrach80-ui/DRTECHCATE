import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, hashToken } from '@/lib/security/rate-limit';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const phoneCheckinSchema = z.object({
  phone_or_hn: z.string().trim().min(3, 'กรุณาระบุเบอร์โทรศัพท์หรือรหัสประจำตัว (HN)'),
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

  // 1. Rate Limiting: 10 attempts per minute per IP to prevent brute-forcing
  const rateLimit = checkRateLimit(`kiosk_phone_checkin:${ip}`, 10, 60000, 300000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `คุณทำรายการบ่อยเกินไป กรุณารอ ${rateLimit.retryAfterSeconds} วินาที`,
        retryAfter: rateLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = phoneCheckinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { phone_or_hn, device_token: bodyToken } = parsed.data;
  const rawToken = req.headers.get('x-kiosk-token') || bodyToken || process.env.NEXT_PUBLIC_DEFAULT_KIOSK_TOKEN;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'ระบบฐานข้อมูลยังไม่ได้รับการตั้งค่า (กรุณาระบุ Supabase credentials ใน .env.local)' },
      { status: 503 }
    );
  }

  const adminClient = createAdminClient();

  // 2. Validate Kiosk Device if token provided, or fetch primary active device
  let deviceName = 'Kiosk Check-in Terminal';
  let deviceId: string | null = null;

  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const { data: device } = await adminClient
      .from('kiosk_devices')
      .select('id, name, is_active')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (device && device.is_active) {
      deviceName = device.name;
      deviceId = device.id;
    }
  }

  // 3. Search Patient by phone or username (HN)
  const cleanQuery = phone_or_hn.toLowerCase();
  const { data: patient, error: patientError } = await adminClient
    .from('profiles')
    .select(`
      id,
      username,
      full_name,
      phone,
      role,
      is_active,
      patients (
        chief_complaint,
        diagnosis
      )
    `)
    .eq('role', 'patient')
    .eq('is_active', true)
    .or(`phone.eq.${cleanQuery},username.eq.${cleanQuery}`)
    .maybeSingle();

  if (patientError || !patient) {
    await recordAuditLog({
      action: 'KIOSK_PHONE_CHECKIN_FAILED',
      entity: 'profiles',
      ip,
      user_agent: userAgent,
      metadata: {
        searched_term: cleanQuery.replace(/\d(?=\d{4})/g, '*'), // Mask phone in log for PDPA
        device_id: deviceId,
        device_name: deviceName,
      },
    });

    return NextResponse.json(
      { error: 'ไม่พบข้อมูลผู้ป่วย หรือเบอร์โทรศัพท์/HN ไม่ถูกต้อง กรุณาติดต่อเคาน์เตอร์บริการ' },
      { status: 404 }
    );
  }

  // 4. Success -> Issue scoped queue token
  await recordAuditLog({
    actor_id: patient.id,
    action: 'KIOSK_PHONE_CHECKIN_SUCCESS',
    entity: 'profiles',
    entity_id: patient.id,
    ip,
    user_agent: userAgent,
    metadata: {
      patient_id: patient.id,
      patient_username: patient.username,
      device_id: deviceId,
      device_name: deviceName,
      method: 'phone_fallback',
    },
  });

  const queueToken = generateQueueToken(patient.id);

  return NextResponse.json({
    success: true,
    patient: {
      id: patient.id,
      full_name: patient.full_name,
      username: patient.username,
      phone: patient.phone,
    },
    queue_token: queueToken,
    expires_in: 300,
  });
}
