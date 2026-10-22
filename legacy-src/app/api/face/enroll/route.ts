import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { recordAuditLog } from '@/lib/security/audit';

const frameSchema = z.object({
  pose: z.enum(['front', 'left', 'right', 'nod']),
  embedding: z.array(z.number()).length(128, 'Vector ต้องมีความยาว 128 มิติ'),
  image_base64: z.string().min(1, 'ต้องมีภาพ Crop ของใบหน้า'),
});

const enrollSchema = z.object({
  user_id: z.string().uuid('User ID ไม่ถูกต้อง'),
  consent_text_version: z.string().default('v1.0-2026'),
  frames: z.array(frameSchema).length(10, 'ต้องมีข้อมูลใบหน้าครบถ้วน 10 เฟรม'),
});

function euclideanDistance(v1: number[], v2: number[]): number {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

async function verifyAuthorizedStaff(req: NextRequest) {
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

  if (!profile || (profile.role !== 'admin' && profile.role !== 'pt') || !profile.is_active) {
    return null;
  }

  return profile;
}

export async function POST(req: NextRequest) {
  const staff = await verifyAuthorizedStaff(req);
  if (!staff) {
    return NextResponse.json({ error: 'Unauthorized: เฉพาะเจ้าหน้าที่ (Admin/PT) ที่ได้รับอนุญาตเท่านั้น' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลพารามิเตอร์ไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { user_id, consent_text_version, frames } = parsed.data;
  const adminClient = createAdminClient();

  // 1. Verify exact 10 frame sequence: 4 front, 2 left, 2 right, 2 nod
  const frontFrames = frames.filter((f) => f.pose === 'front');
  const leftFrames = frames.filter((f) => f.pose === 'left');
  const rightFrames = frames.filter((f) => f.pose === 'right');
  const nodFrames = frames.filter((f) => f.pose === 'nod');

  if (
    frontFrames.length !== 4 ||
    leftFrames.length !== 2 ||
    rightFrames.length !== 2 ||
    nodFrames.length !== 2
  ) {
    return NextResponse.json(
      { error: 'ลำดับเฟรมไม่ตรงตามเกณฑ์ (ต้องเป็น หน้าตรง 4, ซ้าย 2, ขวา 2, พยักหน้า 2)' },
      { status: 400 }
    );
  }

  // 2. Consistency Check across the 4 front frames
  const consistencyThreshold = 0.45;
  for (let i = 0; i < frontFrames.length; i++) {
    for (let j = i + 1; j < frontFrames.length; j++) {
      const dist = euclideanDistance(frontFrames[i].embedding, frontFrames[j].embedding);
      if (dist > consistencyThreshold) {
        return NextResponse.json(
          {
            error: `ความสอดคล้องของใบหน้าตรงไม่ผ่านเกณฑ์ (ระยะห่าง ${dist.toFixed(3)} เกินเกณฑ์ ${consistencyThreshold}) กรุณาสแกนใหม่อีกครั้ง`,
          },
          { status: 422 }
        );
      }
    }
  }

  // 3. Duplicate check with existing users in database
  const dupThreshold = parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.60');
  const primaryVectorStr = `[${frontFrames[0].embedding.join(',')}]`;

  const { data: duplicateMatch } = await adminClient.rpc('find_matching_face', {
    query_embedding: primaryVectorStr,
    match_threshold: dupThreshold,
    match_margin: 0.05,
  });

  if (duplicateMatch && duplicateMatch.length > 0) {
    const existingMatchedId = duplicateMatch[0].matched_user_id;
    if (existingMatchedId !== user_id) {
      await recordAuditLog({
        actor_id: staff.id,
        action: 'FACE_ENROLLMENT_BLOCKED_DUPLICATE',
        entity: 'face_templates',
        entity_id: user_id,
        metadata: {
          existing_user_id: existingMatchedId,
          distance: duplicateMatch[0].distance,
        },
      });

      return NextResponse.json(
        {
          error: 'ตรวจพบใบหน้าคล้ายคลึงกับบุคคลอื่นที่มีอยู่ในระบบแล้ว เพื่อความปลอดภัยและป้องกันการสวมรอยตาม PDPA ไม่อนุญาตให้ลงทะเบียนซ้ำ',
        },
        { status: 409 }
      );
    }
  }

  // 4. Atomic Execution: Upload Storage files + Insert DB records with Rollback on error
  const enrollmentId = crypto.randomUUID();
  const uploadedFilePaths: string[] = [];

  try {
    // 4.1 Record PDPA Consent
    const { data: consentRecord, error: consentError } = await adminClient
      .from('consents')
      .insert({
        user_id,
        type: 'biometric',
        text_version: consent_text_version,
      })
      .select('id')
      .single();

    if (consentError) throw consentError;

    // 4.2 Upload 10 cropped frames to private storage bucket: biometric-data/{user_id}/{enrollment_id}/frame_XX.jpg
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      const frameNumber = String(index + 1).padStart(2, '0');
      const storagePath = `${user_id}/${enrollmentId}/frame_${frameNumber}.jpg`;

      // Clean base64 data URL
      const base64Data = frame.image_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const { error: uploadError } = await adminClient.storage
        .from('biometric-data')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed for frame ${frameNumber}: ${uploadError.message}`);
      }
      uploadedFilePaths.push(storagePath);
    }

    // 4.3 Create face_enrollments row
    const { error: enrollmentError } = await adminClient
      .from('face_enrollments')
      .insert({
        id: enrollmentId,
        user_id,
        status: 'completed',
        consent_id: consentRecord.id,
        created_by: staff.id,
      });

    if (enrollmentError) throw enrollmentError;

    // 4.4 Insert 10 rows into face_templates
    const templatesToInsert = frames.map((frame) => ({
      user_id,
      embedding: frame.embedding,
      pose: frame.pose,
      model_version: 'face-api-v1',
      enrollment_id: enrollmentId,
    }));

    const { error: templatesError } = await adminClient
      .from('face_templates')
      .insert(templatesToInsert);

    if (templatesError) throw templatesError;

    // 4.5 Record Audit Log
    await recordAuditLog({
      actor_id: staff.id,
      action: 'FACE_ENROLLMENT_SUCCESS',
      entity: 'face_enrollments',
      entity_id: enrollmentId,
      metadata: {
        enrolled_user_id: user_id,
        frames_count: frames.length,
        enrollment_id: enrollmentId,
      },
    });

    return NextResponse.json({
      success: true,
      enrollment_id: enrollmentId,
      message: 'ลงทะเบียนใบหน้าสำเร็จครบ 10 เฟรม',
    });
  } catch (err: unknown) {
    // Rollback: Remove any uploaded files if error occurred mid-way
    if (uploadedFilePaths.length > 0) {
      await adminClient.storage.from('biometric-data').remove(uploadedFilePaths);
    }
    // Clean up any dangling DB rows for this enrollment
    await adminClient.from('face_templates').delete().eq('enrollment_id', enrollmentId);
    await adminClient.from('face_enrollments').delete().eq('id', enrollmentId);

    const msg = err instanceof Error ? err.message : String(err);
    console.error('Face enrollment error, rolled back:', msg);
    return NextResponse.json({ error: `การลงทะเบียนใบหน้าล้มเหลว: ${msg}` }, { status: 500 });
  }
}
