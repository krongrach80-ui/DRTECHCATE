import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPtCaller, isPatientAccessibleByPt } from '@/lib/auth/pt-caller';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

const courseItemSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  exercise_id: z.string().uuid('รหัสแบบฝึกหัดไม่ถูกต้อง'),
});

const createCourseSchema = z.object({
  patient_id: z.string().uuid('รหัสประจำตัวผู้ป่วยไม่ถูกต้อง'),
  mode: z.enum(['monthly', 'weekly']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  items: z.array(courseItemSchema).min(1, 'ต้องมีแบบฝึกหัดอย่างน้อย 1 รายการ'),
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

  const hasAccess = await isPatientAccessibleByPt(ptCaller.user.id, patientId);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'ไม่อนุญาต: ผู้ป่วยรายนี้ไม่ได้อยู่ในความดูแลของท่าน หรือการฝากเคสหมดอายุแล้ว' },
      { status: 403 }
    );
  }

  const adminClient = createAdminClient();

  const { data: courses, error } = await adminClient
    .from('courses')
    .select(`
      id,
      patient_id,
      pt_id,
      mode,
      start_date,
      end_date,
      created_at,
      course_items (
        id,
        scheduled_date,
        exercise_id,
        status,
        exercise:exercises (
          id,
          title,
          type,
          body_area
        )
      )
    `)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ courses: courses || [] });
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

  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { patient_id, mode, start_date, end_date, items } = parsed.data;

  // 1. Verify caller has access to patient
  const hasAccess = await isPatientAccessibleByPt(ptCaller.user.id, patient_id);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'ไม่อนุญาต: ผู้ป่วยรายนี้ไม่ได้อยู่ในความดูแลของท่าน หรือการฝากเคสหมดอายุแล้ว' },
      { status: 403 }
    );
  }

  const adminClient = createAdminClient();

  // 2. STRICT VALIDATION: PT can ONLY prescribe exercises with type === 'minigame'
  const exerciseIds = Array.from(new Set(items.map((i) => i.exercise_id)));
  const { data: foundExercises, error: exerciseError } = await adminClient
    .from('exercises')
    .select('id, type, title')
    .in('id', exerciseIds);

  if (exerciseError || !foundExercises) {
    return NextResponse.json(
      { error: 'ไม่สามารถตรวจสอบข้อมูลแบบฝึกหัดได้' },
      { status: 500 }
    );
  }

  const nonMinigames = foundExercises.filter((e) => e.type !== 'minigame');
  if (nonMinigames.length > 0) {
    const titles = nonMinigames.map((e) => `"${e.title}"`).join(', ');
    return NextResponse.json(
      {
        error: `PT role is only authorized to prescribe minigame exercises. Physical therapy exercises are currently in development. (รายการที่ไม่อนุญาต: ${titles})`,
      },
      { status: 422 }
    );
  }

  // 3. Insert course
  const { data: newCourse, error: courseInsertError } = await adminClient
    .from('courses')
    .insert({
      patient_id,
      pt_id: ptCaller.user.id,
      mode,
      start_date,
      end_date,
      created_by: ptCaller.user.id,
    })
    .select()
    .single();

  if (courseInsertError) {
    return NextResponse.json(
      { error: `ไม่สามารถสร้างคอร์สฝึกได้: ${courseInsertError.message}` },
      { status: 500 }
    );
  }

  // 4. Insert course items
  const courseItemsToInsert = items.map((item) => ({
    course_id: newCourse.id,
    scheduled_date: item.scheduled_date,
    exercise_id: item.exercise_id,
    status: 'pending',
  }));

  const { error: itemsInsertError } = await adminClient
    .from('course_items')
    .insert(courseItemsToInsert);

  if (itemsInsertError) {
    // Rollback course if items fail
    await adminClient.from('courses').delete().eq('id', newCourse.id);
    return NextResponse.json(
      { error: `ไม่สามารถบันทึกรายการแบบฝึกหัดได้: ${itemsInsertError.message}` },
      { status: 500 }
    );
  }

  // 5. Audit log
  await recordAuditLog({
    actor_id: ptCaller.user.id,
    action: 'PT_CREATE_COURSE',
    entity: 'courses',
    entity_id: newCourse.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    metadata: {
      patient_id,
      mode,
      item_count: items.length,
      start_date,
      end_date,
    },
  });

  return NextResponse.json({
    success: true,
    course: newCourse,
    itemCount: items.length,
    message: `สร้างคอร์สฝึกมินิเกมเรียบร้อยแล้ว (${items.length} รายการ)`,
  });
}
