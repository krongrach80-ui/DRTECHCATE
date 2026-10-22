import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPtCaller, isPatientAccessibleByPt } from '@/lib/auth/pt-caller';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const createTransferSchema = z.object({
  patient_id: z.string().uuid('รหัสประจำตัวผู้ป่วยไม่ถูกต้อง'),
  to_pt_id: z.string().uuid('รหัสนักกายภาพบำบัดปลายทางไม่ถูกต้อง'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
});

export async function GET(req: NextRequest) {
  const ptCaller = await verifyPtCaller(req);
  if (!ptCaller) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะนักกายภาพบำบัด (PT) เท่านั้น' }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const ptId = ptCaller.user.id;

  // Fetch transfers where caller is from_pt or to_pt
  const { data: transfers, error } = await adminClient
    .from('case_transfers')
    .select(`
      id,
      patient_id,
      from_pt_id,
      to_pt_id,
      start_date,
      end_date,
      status,
      created_at,
      patient:profiles!case_transfers_patient_id_fkey (
        id,
        username,
        full_name,
        phone
      ),
      from_pt:profiles!case_transfers_from_pt_id_fkey (
        id,
        username,
        full_name
      ),
      to_pt:profiles!case_transfers_to_pt_id_fkey (
        id,
        username,
        full_name
      )
    `)
    .or(`from_pt_id.eq.${ptId},to_pt_id.eq.${ptId}`)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0];

  const formatted = (transfers || []).map((t) => {
    const isOutgoing = t.from_pt_id === ptId;
    const isCurrentlyActive =
      t.status === 'active' && today >= t.start_date && today <= t.end_date;

    return {
      ...t,
      direction: isOutgoing ? 'outgoing' : 'incoming',
      isCurrentlyActive,
    };
  });

  return NextResponse.json({ transfers: formatted });
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

  const parsed = createTransferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { patient_id, to_pt_id, start_date, end_date } = parsed.data;

  if (to_pt_id === ptCaller.user.id) {
    return NextResponse.json(
      { error: 'ไม่สามารถฝากเคสให้ตนเองได้ กรุณาเลือกนักกายภาพบำบัดท่านอื่น' },
      { status: 400 }
    );
  }

  if (start_date > end_date) {
    return NextResponse.json(
      { error: 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // 1. Verify caller has access to this patient
  const hasAccess = await isPatientAccessibleByPt(ptCaller.user.id, patient_id);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'ไม่อนุญาต: ท่านไม่มีสิทธิ์เข้าถึงหรือส่งต่อผู้ป่วยรายนี้' },
      { status: 403 }
    );
  }

  // 2. Verify destination PT exists and is active
  const { data: destPt, error: destError } = await adminClient
    .from('profiles')
    .select('id, full_name, username, role, is_active')
    .eq('id', to_pt_id)
    .single();

  if (destError || !destPt || destPt.role !== 'pt' || !destPt.is_active) {
    return NextResponse.json(
      { error: 'ไม่พบข้อมูลนักกายภาพบำบัดปลายทาง หรือบัญชีไม่พร้อมใช้งาน' },
      { status: 400 }
    );
  }

  // 3. Insert case transfer
  const { data: newTransfer, error: insertError } = await adminClient
    .from('case_transfers')
    .insert({
      patient_id,
      from_pt_id: ptCaller.user.id,
      to_pt_id,
      start_date,
      end_date,
      created_by: ptCaller.user.id,
      status: 'active',
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `ไม่สามารถบันทึกการฝากเคสได้: ${insertError.message}` },
      { status: 500 }
    );
  }

  // 4. Audit log
  await recordAuditLog({
    actor_id: ptCaller.user.id,
    action: 'CREATE_CASE_TRANSFER',
    entity: 'case_transfers',
    entity_id: newTransfer.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: {
      patient_id,
      to_pt_id,
      to_pt_name: destPt.full_name,
      start_date,
      end_date,
    },
  });

  return NextResponse.json({
    success: true,
    transfer: newTransfer,
    message: `ฝากเคสให้ ${destPt.full_name} เรียบร้อยแล้ว (มีผล ${start_date} ถึง ${end_date})`,
  });
}

export async function PATCH(req: NextRequest) {
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

  const patchSchema = z.object({
    transfer_id: z.string().uuid(),
    status: z.enum(['cancelled', 'completed']),
  });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const { transfer_id, status } = parsed.data;
  const adminClient = createAdminClient();

  // Verify ownership (only the delegating PT can cancel)
  const { data: transfer, error: findError } = await adminClient
    .from('case_transfers')
    .select('id, from_pt_id, patient_id')
    .eq('id', transfer_id)
    .single();

  if (findError || !transfer) {
    return NextResponse.json({ error: 'ไม่พบรายการฝากเคส' }, { status: 404 });
  }

  if (transfer.from_pt_id !== ptCaller.user.id) {
    return NextResponse.json(
      { error: 'เฉพาะนักกายภาพบำบัดผู้ส่งมอบเคสเท่านั้นที่สามารถยกเลิกได้' },
      { status: 403 }
    );
  }

  const { error: updateError } = await adminClient
    .from('case_transfers')
    .update({ status })
    .eq('id', transfer_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await recordAuditLog({
    actor_id: ptCaller.user.id,
    action: `UPDATE_CASE_TRANSFER_STATUS_${status.toUpperCase()}`,
    entity: 'case_transfers',
    entity_id: transfer_id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: {
      transfer_id,
      new_status: status,
    },
  });

  return NextResponse.json({ success: true, message: `อัปเดตสถานะเป็น ${status} เรียบร้อยแล้ว` });
}
