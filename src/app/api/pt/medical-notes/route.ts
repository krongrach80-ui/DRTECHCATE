import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPtCaller, isPatientAccessibleByPt } from '@/lib/auth/pt-caller';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const createNoteSchema = z.object({
  patient_id: z.string().uuid('รหัสประจำตัวผู้ป่วยไม่ถูกต้อง'),
  body: z.string().trim().min(3, 'กรุณาระบุข้อความบันทึกเวชระเบียนอย่างน้อย 3 ตัวอักษร'),
});

export async function GET(req: NextRequest) {
  const ptCaller = await verifyPtCaller(req);
  if (!ptCaller) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะนักกายภาพบำบัด (PT) เท่านั้น' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const patientId = searchParams.get('patient_id');

  if (!patientId) {
    return NextResponse.json({ error: 'กรุณาระบุ patient_id' }, { status: 400 });
  }

  // Verify caller PT has access to this patient
  const hasAccess = await isPatientAccessibleByPt(ptCaller.user.id, patientId);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'ไม่อนุญาต: ผู้ป่วยรายนี้ไม่ได้อยู่ในความดูแลของท่าน หรือการฝากเคสหมดอายุแล้ว' },
      { status: 403 }
    );
  }

  const adminClient = createAdminClient();

  // 1. Fetch patient basic profile
  const { data: patientProfile } = await adminClient
    .from('profiles')
    .select(`
      id,
      username,
      full_name,
      phone,
      patients (
        date_of_birth,
        sex,
        chief_complaint,
        diagnosis,
        allergies,
        chronic_diseases
      )
    `)
    .eq('id', patientId)
    .single();

  // 2. Fetch medical notes chronologically (oldest to newest)
  const { data: notes, error: notesError } = await adminClient
    .from('medical_notes')
    .select(`
      id,
      patient_id,
      author_id,
      body,
      created_at,
      author:profiles!medical_notes_author_id_fkey (
        id,
        full_name,
        username,
        role
      )
    `)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });

  if (notesError) {
    return NextResponse.json({ error: notesError.message }, { status: 500 });
  }

  return NextResponse.json({
    patient: patientProfile,
    notes: notes || [],
  });
}

export async function POST(req: NextRequest) {
  const ptCaller = await verifyPtCaller(req);
  if (!ptCaller) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะนักกายภาพบำบัด (PT) เท่านั้น' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { patient_id, body: noteBody } = parsed.data;

  // Verify access
  const hasAccess = await isPatientAccessibleByPt(ptCaller.user.id, patient_id);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'ไม่อนุญาต: ผู้ป่วยรายนี้ไม่ได้อยู่ในความดูแลของท่าน หรือการฝากเคสหมดอายุแล้ว' },
      { status: 403 }
    );
  }

  const adminClient = createAdminClient();

  // Strict Append-Only Insert
  const { data: newNote, error: insertError } = await adminClient
    .from('medical_notes')
    .insert({
      patient_id,
      author_id: ptCaller.user.id,
      body: noteBody,
    })
    .select(`
      id,
      patient_id,
      author_id,
      body,
      created_at,
      author:profiles!medical_notes_author_id_fkey (
        id,
        full_name,
        username,
        role
      )
    `)
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `ไม่สามารถบันทึกเวชระเบียนได้: ${insertError.message}` },
      { status: 500 }
    );
  }

  // Audit log
  await recordAuditLog({
    actor_id: ptCaller.user.id,
    action: 'CREATE_MEDICAL_NOTE',
    entity: 'medical_notes',
    entity_id: newNote.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: {
      patient_id,
      note_length: noteBody.length,
    },
  });

  return NextResponse.json({
    success: true,
    note: newNote,
    message: 'บันทึกเวชระเบียน (Append-Only) สำเร็จ',
  });
}
