import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../index';

describe('Staff Creation RPC Signature & Fallback Suite', () => {
  let client: ApiClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new ApiClient();
  });

  it('omits p_caller_id by default to match public.admin_create_staff_account signature', async () => {
    let rpcCalled = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/staff') || urlStr.endsWith('/staff')) {
        // Backend server offline/404 -> triggers direct Supabase RPC fallback
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/profiles?username=')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/pts?license_no=')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/rpc/admin_create_staff_account')) {
        rpcCalled = true;
        const body = JSON.parse(init?.body as string);
        expect(body.p_caller_id).toBeUndefined();
        expect(body.p_username).toBe('new_pt_user');
        expect(body.p_role).toBe('pt');
        expect(body.p_license_no).toBe('PT-1234');
        return new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: 'test-user-uuid-1',
              username: 'new_pt_user',
              role: 'pt',
              full_name: 'Dr. Test PT',
              status: 'active',
            },
            message: 'สร้างผู้ใช้ new_pt_user สำเร็จเรียบร้อย',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const res = await client.staff.create({
      username: 'new_pt_user',
      password: 'SafePassword123!',
      role: 'pt',
      full_name: 'Dr. Test PT',
      license_no: 'PT-1234',
      license_expiry: '2028-12-31',
    });

    expect(rpcCalled).toBe(true);
    expect(res).toBeDefined();
    expect(res.id).toBe('test-user-uuid-1');
  });

  it('automatically retries with p_caller_id if database schema expects p_caller_id (PGRST202)', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/staff') || urlStr.endsWith('/staff')) {
        // Backend server offline/404 -> triggers direct Supabase RPC fallback
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/profiles?username=') || urlStr.includes('/rest/v1/pts?license_no=')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/rpc/admin_create_staff_account')) {
        callCount++;
        const body = JSON.parse(init?.body as string);
        if (callCount === 1) {
          expect(body.p_caller_id).toBeUndefined();
          return new Response(
            JSON.stringify({
              code: 'PGRST202',
              details: 'Searched for function public.admin_create_staff_account with parameters ... but no matches found',
              hint: 'Perhaps you meant to call public.admin_create_staff_account(..., p_caller_id)',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // Second call must have p_caller_id
        expect('p_caller_id' in body).toBe(true);
        return new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: 'test-user-uuid-2',
              username: 'retry_pt_user',
              role: 'pt',
              full_name: 'Dr. Retry PT',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const res = await client.staff.create({
      username: 'retry_pt_user',
      password: 'SafePassword123!',
      role: 'pt',
      full_name: 'Dr. Retry PT',
      license_no: 'PT-5678',
    });

    expect(callCount).toBe(2);
    expect(res.id).toBe('test-user-uuid-2');
  });
});
