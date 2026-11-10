import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../index.js';

describe('Staff Call Acknowledgment & Routing Isolation', () => {
  let client: ApiClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3000');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('handleStaffCall must NOT trigger "กรุณากรอกชื่อผู้ใช้ (Username) อย่างน้อย 3 ตัวอักษร"', async () => {
    // Primary API 404 (simulates edge worker offline / fallback mode)
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      // Primary API call fails with 404 to trigger resilient Supabase fallback
      if (url.startsWith('http://localhost:3000')) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      // 1. Initial status check for concurrency
      if (url.includes('/rest/v1/staff_calls') && url.includes('select=id,handled_at,handled_by')) {
        return Promise.resolve(new Response(JSON.stringify([{ id: 'call-123', handled_at: null, handled_by: null }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      // 2. Atomic PATCH
      if (url.includes('/rest/v1/staff_calls') && opts?.method === 'PATCH') {
        return Promise.resolve(new Response(JSON.stringify([{ id: 'call-123', status: 'resolved', handled_at: new Date().toISOString() }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      // 3. Audit log insert
      if (url.includes('/rest/v1/audit_logs')) {
        return Promise.resolve(new Response(JSON.stringify({}), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    const res = await client.kiosk.handleStaffCall('call-123');
    expect(res).toBeDefined();
    expect((res as any).ok).toBe(true);
    expect((res as any).message).toBe('รับเรื่องแล้ว');
  });

  it('handleStaffCall throws "มีเจ้าหน้าที่รับเรื่องนี้ไปแล้ว" if already handled', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('http://localhost:3000')) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url.includes('/rest/v1/staff_calls') && url.includes('select=id,handled_at,handled_by')) {
        return Promise.resolve(new Response(JSON.stringify([{ id: 'call-123', handled_at: '2026-11-10T05:00:00Z', handled_by: 'pt-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    await expect(client.kiosk.handleStaffCall('call-123')).rejects.toThrow('มีเจ้าหน้าที่รับเรื่องนี้ไปแล้ว');
  });

  it('handleStaffCall throws "รับเรื่องไม่สำเร็จ ลองใหม่" on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    await expect(client.kiosk.handleStaffCall('call-123')).rejects.toThrow('รับเรื่องไม่สำเร็จ ลองใหม่');
  });

  it('Staff user creation still enforces username validation (>= 3 chars)', async () => {
    // Attempting to create staff with empty or 2-char username MUST still throw
    await expect(
      client.staff.create({
        username: 'ab',
        password: 'Password123!',
        full_name: 'Test Staff',
        role: 'pt',
      })
    ).rejects.toThrow('กรุณากรอกชื่อผู้ใช้ (Username) อย่างน้อย 3 ตัวอักษร');
  });
});
