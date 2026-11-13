import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, normalizePatientRecord } from '../index.js';

describe('Patient Egress Projection, face_enrollments Fallback & Dead-Endpoint Prevention', () => {
  let client: ApiClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3000');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('patients.list(), listDossiers(), courses.getToday(), and pinLogin() project away full history/frames arrays', async () => {
    const requestedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      requestedUrls.push(urlStr);
      if (urlStr.startsWith('http://localhost:3000')) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/courses')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/patients')) {
        return new Response(
          JSON.stringify([
            {
              id: 'pat-1',
              hn: 'HN0001',
              first_name: 'สมชาย',
              last_name: 'ใจดี',
              age: 42,
              sex: 'male',
              registration_status: 'active',
              pin: '1234',
              schedule: { startDate: '2026-11-10', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
              daily_checklists: { '2026-11-13': ['e1000000-0000-0000-0000-000000000001'] },
              hist_target_joint: 'ข้อไหล่',
              face_enrollments: [{ id: 'enr-1', status: 'active' }],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const patients = await client.patients.list();
    expect(patients).toHaveLength(1);
    expect(patients[0].target_joint).toBe('ข้อไหล่');
    expect((patients[0] as any).schedule?.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect((patients[0] as any).daily_checklists['2026-11-13']).toHaveLength(1);

    const dossiers = await client.smartOnboarding.listDossiers();
    expect(dossiers).toHaveLength(1);
    expect(dossiers[0].has_face_enrolled).toBe(true);

    const todayCourses = await client.courses.getToday();
    expect(todayCourses).toHaveLength(1);

    const pinRes = await client.smartOnboarding.pinLogin({ pin: '1234', hn: 'HN0001' });
    expect(pinRes.matched).toBe(true);
    expect(pinRes.patient?.hn).toBe('HN0001');

    const supabasePatientUrls = requestedUrls.filter((u) => u.includes('/rest/v1/patients'));
    expect(supabasePatientUrls.length).toBeGreaterThanOrEqual(4);
    for (const u of supabasePatientUrls) {
      expect(u).toContain('select=');
      expect(u).not.toContain('select=*');
      expect(u).not.toContain('select=history');
    }
  });

  it('face_enrollments automatically retries with status="completed" on legacy enum 22P02 and inserts face_templates', async () => {
    const enrollStatuses: string[] = [];
    let templatesInserted = false;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.startsWith('http://localhost:3000')) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/patients') && (!opts?.method || opts.method === 'GET')) {
        return new Response(JSON.stringify([{ id: 'pat-uuid-1', history: {} }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/face_enrollments') && opts?.method === 'POST') {
        const parsed = JSON.parse(String(opts.body));
        enrollStatuses.push(parsed.status);
        if (parsed.status === 'active') {
          return new Response(
            JSON.stringify({ code: '22P02', message: 'invalid input value for enum face_enrollment_status: "active"' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify([parsed]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/face_templates') && opts?.method === 'POST') {
        templatesInserted = true;
        return new Response(JSON.stringify([]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const unitVec = new Array(512).fill(0.044194);
    await client.request('/face/enroll', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: 'pat-uuid-1',
        frames: [{ pose: 'front', embedding: unitVec }],
      }),
    });

    expect(enrollStatuses).toEqual(['active', 'completed']);
    expect(templatesInserted).toBe(true);
  });

  it('face_scan_logs no longer sends doomed 404 POST requests to Supabase REST', async () => {
    const supabaseUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.startsWith('http://localhost:3000')) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      supabaseUrls.push(urlStr);
      return new Response(JSON.stringify([]), { status: 200 });
    }) as any;

    const res = await client.request<any>('/face_scan_logs', {
      method: 'POST',
      body: JSON.stringify({ matched: false }),
    });

    expect(res.ok).toBe(true);
    expect(res.skipped).toBe(true);
    expect(supabaseUrls.some((u) => u.includes('face_scan_logs'))).toBe(false);
  });

  it('normalizePatientRecord remains backward-compatible with full history objects', () => {
    const rec = normalizePatientRecord({
      id: 'p-legacy',
      hn: 'HN99',
      first_name: 'Legacy',
      last_name: 'Patient',
      history: {
        target_joint: 'หัวเข่า',
        contraindications: 'ห้ามงอเกิน 90 องศา',
        chronic_diseases: 'เบาหวาน',
        schedule: { daysOfWeek: [2, 4] },
      },
    });
    expect(rec.target_joint).toBe('หัวเข่า');
    expect(rec.contraindications).toBe('ห้ามงอเกิน 90 องศา');
    expect(rec.underlying_diseases).toBe('เบาหวาน');
    expect(rec.schedule).toEqual({ daysOfWeek: [2, 4] });
  });

  it('smartOnboarding.scanLogin returns decisive match or Not Found without PIN or patients table fallback', async () => {
    const requestedUrls: string[] = [];
    const probe = new Array(512).fill(0).map((_, i) => (i === 0 ? 1 : 0));

    // Case 1: Borderline / low similarity from RPC must fail closed with no fallback fetch & no requirePin
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      requestedUrls.push(urlStr);
      if (urlStr.startsWith('http://localhost:3000')) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/rpc/match_patient_face')) {
        return new Response(
          JSON.stringify([
            {
              id: 'p-1',
              hn: 'HN-001',
              first_name: 'สมชาย',
              last_name: 'ใจดี',
              similarity: 0.72,
              distance: Math.sqrt(2 - 2 * 0.72),
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as any;

    const noMatchRes: any = await client.smartOnboarding.scanLogin({ probe });
    expect(noMatchRes.ok).toBe(true);
    expect(noMatchRes.matched).toBe(false);
    expect(noMatchRes.requirePin).toBeUndefined();
    expect(noMatchRes.candidateName).toBeUndefined();
    expect(requestedUrls.some((u) => u.includes('/rest/v1/patients'))).toBe(false);

    // Case 2: Decisive clear match (cos=0.86, runner-up=0.60, margin=0.26 >= 0.06) succeeds immediately
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.startsWith('http://localhost:3000')) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/rpc/match_patient_face')) {
        return new Response(
          JSON.stringify([
            {
              id: 'p-match',
              hn: 'P-9737',
              first_name: 'ผู้ป่วย',
              last_name: 'ทดสอบ',
              similarity: 0.86,
              distance: Math.sqrt(2 - 2 * 0.86),
            },
            {
              id: 'p-other',
              hn: 'P-6166',
              first_name: 'อื่น',
              last_name: 'ทดสอบ',
              similarity: 0.60,
              distance: Math.sqrt(2 - 2 * 0.60),
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as any;

    const matchRes: any = await client.smartOnboarding.scanLogin({ probe });
    expect(matchRes.ok).toBe(true);
    expect(matchRes.matched).toBe(true);
    expect(matchRes.patient?.hn).toBe('P-9737');
  });
});
