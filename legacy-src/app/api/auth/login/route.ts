import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';
import { recordAuditLog } from '@/lib/security/audit';
import { getRedirectPathForRole } from '@/lib/rbac/roles';
import { createAdminClient } from '@/lib/supabase/admin';

const loginSchema = z.object({
  username: z.string().min(3, 'กรุณากรอกชื่อผู้ใช้ความยาวอย่างน้อย 3 ตัวอักษร'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // 1. Check IP Ban
  try {
    const adminClient = createAdminClient();
    const { data: bannedRecord } = await adminClient
      .from('banned_ips')
      .select('ip, reason, expires_at')
      .eq('ip', ip)
      .maybeSingle();

    if (bannedRecord) {
      const isExpired = bannedRecord.expires_at && new Date(bannedRecord.expires_at) < new Date();
      if (!isExpired) {
        return NextResponse.json(
          { error: `การเข้าถึงจาก IP นี้ถูกระงับเนื่องจาก: ${bannedRecord.reason || 'ละเมิดนโยบายความปลอดภัย'}` },
          { status: 403 }
        );
      }
    }
  } catch (err) {
    console.warn('IP ban check skipped (db initializing or unreachable):', err);
  }

  // 2. Validate Input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 }
    );
  }

  const { username, password } = parsed.data;

  // 3. Rate Limiting (per IP and per username)
  const ipLimit = checkRateLimit(`login:ip:${ip}`, 5, 60000, 300000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      {
        error: `คุณพยายามเข้าสู่ระบบผิดเกินกำหนด กรุณารอ ${ipLimit.retryAfterSeconds} วินาทีแล้วลองใหม่อีกครั้ง`,
        retryAfter: ipLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const userLimit = checkRateLimit(`login:user:${username.toLowerCase()}`, 5, 60000, 300000);
  if (!userLimit.allowed) {
    return NextResponse.json(
      {
        error: `บัญชีนี้ถูกล็อกชั่วคราวเนื่องจากพยายามล็อกอินล้มเหลวหลายครั้ง กรุณารอ ${userLimit.retryAfterSeconds} วินาที`,
        retryAfter: userLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  // 4. Map username to internal email
  const emailDomain = process.env.INTERNAL_EMAIL_DOMAIN || 'clinic.internal';
  const email = `${username.toLowerCase()}@${emailDomain}`;

  // 5. Authenticate via Supabase Auth with SSR cookies handling
  const response = NextResponse.json({ success: false });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    // Record failed login audit log
    await recordAuditLog({
      action: 'LOGIN_FAILED',
      entity: 'auth',
      ip,
      user_agent: userAgent,
      metadata: { username, reason: authError?.message || 'Invalid credentials' },
    });

    return NextResponse.json(
      { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
      { status: 401 }
    );
  }

  // 6. Fetch user profile from database to check status and role
  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, username, full_name, is_active, force_logout_at')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: 'ไม่พบข้อมูลโปรไฟล์ผู้ใช้งานในระบบ' },
      { status: 403 }
    );
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    await recordAuditLog({
      actor_id: profile.id,
      action: 'LOGIN_BLOCKED_INACTIVE',
      entity: 'profiles',
      entity_id: profile.id,
      ip,
      user_agent: userAgent,
      metadata: { username },
    });

    return NextResponse.json(
      { error: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' },
      { status: 403 }
    );
  }

  // Reset rate limits on successful authentication
  resetRateLimit(`login:ip:${ip}`);
  resetRateLimit(`login:user:${username.toLowerCase()}`);

  // Record successful login audit log
  await recordAuditLog({
    actor_id: profile.id,
    action: 'LOGIN_SUCCESS',
    entity: 'auth',
    entity_id: profile.id,
    ip,
    user_agent: userAgent,
    metadata: { username, role: profile.role },
  });

  const redirectUrl = getRedirectPathForRole(profile.role);

  return NextResponse.json({
    success: true,
    user: {
      id: profile.id,
      username: profile.username,
      full_name: profile.full_name,
      role: profile.role,
    },
    redirect_url: redirectUrl,
  }, {
    headers: response.headers,
  });
}
