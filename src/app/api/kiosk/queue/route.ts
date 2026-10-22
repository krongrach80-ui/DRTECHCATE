import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const queueRequestSchema = z.object({
  patient_id: z.string().uuid('รหัสประจำตัวผู้ป่วยไม่ถูกต้อง'),
  queue_token: z.string().min(10, 'โทเค็นคิวไม่ถูกต้อง'),
});

function verifyQueueToken(token: string, expectedPatientId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return false;

    const [patientId, expiresAtStr, receivedHmac] = parts;
    if (patientId !== expectedPatientId) return false;

    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'kiosk-queue-secret';
    const expectedPayload = `${patientId}:${expiresAtStr}`;
    const calculatedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(calculatedHmac));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = queueRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { patient_id, queue_token } = parsed.data;

  // 1. Validate Scoped Token
  const isValid = verifyQueueToken(queue_token, patient_id);
  if (!isValid) {
    return NextResponse.json(
      { error: 'โทเค็นยืนยันตัวตนหมดอายุหรือถูกปลอมแปลง กรุณาทำรายการใหม่อีกครั้ง' },
      { status: 403 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'ระบบฐานข้อมูลยังไม่ได้รับการตั้งค่า (กรุณาระบุ Supabase credentials ใน .env.local)' },
      { status: 503 }
    );
  }

  const adminClient = createAdminClient();
  const today = new Date().toISOString().split('T')[0];

  // 2. Fetch patient details
  const { data: patient, error: patientError } = await adminClient
    .from('profiles')
    .select(`
      id,
      username,
      full_name,
      phone,
      patients (
        diagnosis,
        chief_complaint
      )
    `)
    .eq('id', patient_id)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: 'ไม่พบข้อมูลผู้ป่วย' }, { status: 404 });
  }

  // 3. Sequential Queue Number for today: PT-001, PT-002...
  const todayStart = `${today}T00:00:00.000Z`;
  const { count: checkinCount } = await adminClient
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .in('action', ['KIOSK_QUEUE_TICKET_PRINTED', 'KIOSK_CHECKIN_SUCCESS'])
    .gte('created_at', todayStart);

  const queueSeq = (checkinCount || 0) + 1;
  const queueNumber = `PT-${String(queueSeq).padStart(3, '0')}`;

  // 4. Fetch Assigned PT
  const { data: assignment } = await adminClient
    .from('patient_pt_assignments')
    .select(`
      pt:profiles!patient_pt_assignments_pt_id_fkey (
        id,
        full_name,
        username,
        pts (
          specialty
        )
      )
    `)
    .eq('patient_id', patient_id)
    .eq('is_primary', true)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ptData = assignment?.pt as any;
  const assignedPtName = ptData?.full_name || 'นักกายภาพบำบัดประจำเวร';
  const stationName = 'ห้องฟื้นฟูสมรรถภาพทางกาย (Station A)';

  // 5. Fetch Today's Scheduled Exercises/Minigames
  const { data: todayItems } = await adminClient
    .from('course_items')
    .select(`
      id,
      scheduled_date,
      status,
      exercise:exercises (
        id,
        title,
        type,
        body_area
      )
    `)
    .eq('scheduled_date', today)
    .in(
      'course_id',
      (
        await adminClient.from('courses').select('id').eq('patient_id', patient_id)
      ).data?.map((c) => c.id) || []
    );

  const scheduledExercises = (todayItems || []).map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = item.exercise as any;
    return {
      id: item.id,
      title: ex?.title || 'แบบฝึกหัดกายภาพ',
      type: ex?.type || 'minigame',
      bodyArea: ex?.body_area || 'ทั่วไป',
      status: item.status,
    };
  });

  // 6. Record Audit Log
  await recordAuditLog({
    actor_id: patient_id,
    action: 'KIOSK_QUEUE_TICKET_PRINTED',
    entity: 'kiosk_queue',
    entity_id: queueNumber,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: {
      patient_id,
      patient_name: patient.full_name,
      queue_number: queueNumber,
      scheduled_items_count: scheduledExercises.length,
    },
  });

  return NextResponse.json({
    success: true,
    ticket: {
      queue_number: queueNumber,
      patient_name: patient.full_name,
      hn: patient.username,
      assigned_pt: assignedPtName,
      station: stationName,
      scheduled_items: scheduledExercises,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
    },
  });
}
