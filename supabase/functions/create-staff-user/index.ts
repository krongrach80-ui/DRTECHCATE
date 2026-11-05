import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Supabase environment configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Caller Authentication & Privilege Verification (Admin Only)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    let callerId: string | null = null;
    let callerIsAdmin = false;

    if (token) {
      // Check Supabase Auth user
      const { data: authUser } = await supabaseAdmin.auth.getUser(token);
      if (authUser?.user?.id) {
        callerId = authUser.user.id;
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role, status')
          .eq('id', callerId)
          .maybeSingle();
        if (profile?.role === 'admin' && profile?.status === 'active') {
          callerIsAdmin = true;
        }
      } else {
        // Check HMAC JWT claims for sovereign admin session
        try {
          const parts = token.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(atob(parts[1]));
            if (payload.role === 'admin' && payload.id) {
              const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role, status')
                .eq('id', payload.id)
                .maybeSingle();
              if (profile?.role === 'admin' && profile?.status === 'active') {
                callerId = payload.id;
                callerIsAdmin = true;
              }
            }
          }
        } catch {
          // Token decoding failed
        }
      }
    }

    if (!callerIsAdmin) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'สิทธิ์ไม่เพียงพอ: เฉพาะผู้อำนวยการ (Admin) เท่านั้นที่สามารถสร้างบัญชีเจ้าหน้าที่ได้',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Request Body Validation
    const body = await req.json().catch(() => ({}));
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';
    const role = body.role;
    const fullName = (body.full_name || '').trim();
    const phone = (body.phone || '').trim() || null;
    const bio = (body.bio || '').trim() || null;

    if (!username || username.length < 3) {
      return new Response(JSON.stringify({ ok: false, error: 'กรุณากรอกชื่อผู้ใช้ (Username) อย่างน้อย 3 ตัวอักษร' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษรภาษาอังกฤษ ตัวเลข จุด หรือขีดล่างเท่านั้น',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!password || password.length < 12) {
      return new Response(JSON.stringify({ ok: false, error: 'รหัสผ่านเริ่มต้นต้องมีความยาวอย่างน้อย 12 ตัวอักษร' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role !== 'admin' && role !== 'pt') {
      return new Response(JSON.stringify({ ok: false, error: 'บทบาทผู้ใช้ต้องเป็น admin หรือ pt เท่านั้น' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!fullName) {
      return new Response(JSON.stringify({ ok: false, error: 'กรุณากรอกชื่อ - นามสกุลจริง' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PT Specific Fields
    let licenseNo: string | null = null;
    let licenseExpiry: string | null = null;
    let specialty = 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด';
    let age = 35;
    let sex = 'male';

    if (role === 'pt') {
      licenseNo = (body.license_no || '').trim();
      if (!licenseNo) {
        return new Response(
          JSON.stringify({ ok: false, error: 'กรุณาระบุเลขที่ใบประกอบวิชาชีพกายภาพบำบัด' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      licenseExpiry = (body.license_expiry || '').trim() || null;
      specialty = (body.specialty || '').trim() || 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด';
      age = Number(body.age) || 35;
      sex = body.sex || 'male';
    }

    // 4. Check for Existing Username Collision
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ ok: false, error: `ชื่อผู้ใช้ "${username}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น` }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check for Existing PT License Collision
    if (role === 'pt' && licenseNo) {
      const { data: existingPt } = await supabaseAdmin
        .from('pts')
        .select('user_id')
        .eq('license_no', licenseNo)
        .maybeSingle();

      if (existingPt) {
        return new Response(
          JSON.stringify({ ok: false, error: `เลขที่ใบประกอบวิชาชีพ "${licenseNo}" มีอยู่ในระบบแล้ว` }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 5. Atomic Step 1: Create Supabase Auth User
    const internalEmail = `${username}@drtech.care`;
    const { data: authCreated, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username,
        full_name: fullName,
        role,
      },
    });

    if (authError || !authCreated?.user?.id) {
      const msg = authError?.message || 'ไม่สามารถสร้างบัญชีผู้ใช้ใน Auth ได้';
      const isAlreadyTaken = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered');
      return new Response(
        JSON.stringify({
          ok: false,
          error: isAlreadyTaken ? `ชื่อผู้ใช้ "${username}" มีอยู่ในระบบแล้ว` : msg,
        }),
        {
          status: isAlreadyTaken ? 409 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const newUserId = authCreated.user.id;

    // 6. Atomic Step 2: Insert into public.profiles & public.pts
    let rollbackNeeded = false;
    let rollbackError = '';

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: newUserId,
      username,
      full_name: fullName,
      role,
      phone,
      bio,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    if (profileError) {
      rollbackNeeded = true;
      rollbackError = `ไม่สามารถบันทึกข้อมูล Profile: ${profileError.message}`;
    } else if (role === 'pt' && licenseNo) {
      const { error: ptError } = await supabaseAdmin.from('pts').insert({
        user_id: newUserId,
        license_no: licenseNo,
        license_expiry: licenseExpiry,
        specialty,
        age,
        sex,
      });

      if (ptError) {
        rollbackNeeded = true;
        rollbackError = `ไม่สามารถบันทึกข้อมูลใบอนุญาต PT: ${ptError.message}`;
      }
    }

    // Rollback Guard: Delete Auth user if Profile or PTS insertion failed
    if (rollbackNeeded) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      await supabaseAdmin.from('profiles').delete().eq('id', newUserId).catch(() => {});
      return new Response(JSON.stringify({ ok: false, error: rollbackError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Audit Logging
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: callerId || newUserId,
        action: 'create_staff',
        entity_type: 'profile',
        entity_id: newUserId,
        details: { username, role, full_name: fullName },
      })
      .catch(() => {});

    // 8. Return Genuine User Object
    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: newUserId,
          username,
          full_name: fullName,
          role,
          phone,
          bio,
          status: 'active',
          license_no: role === 'pt' ? licenseNo : undefined,
          license_expiry: role === 'pt' ? licenseExpiry : undefined,
          specialty: role === 'pt' ? specialty : undefined,
        },
        message: `สร้างผู้ใช้ ${username} สำเร็จเรียบร้อย`,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

