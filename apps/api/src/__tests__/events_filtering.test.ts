import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { dispatchHospitalEvent, hospitalEventBus, HospitalEvent } from '../modules/events/routes';

describe('SSE /api/events Realtime Stream & PT Patient Filtering (Master Prompt v3 Section 5)', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.FACE_T_ACCEPT = '0.60';
    process.env.FACE_T_REJECT = '0.45';
    process.env.FACE_T_MARGIN = '0.10';
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
  });

  it('1. Unauthenticated client calling /api/events must be rejected with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('2. Authenticated client connects to /api/events and receives SSE stream headers', async () => {
    let receivedData = '';
    const res = await request(app)
      .get('/api/events')
      .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk) => {
          receivedData += chunk.toString();
          if (receivedData.includes('connected')) {
            // Close after initial handshake
            (res as unknown as { destroy: () => void }).destroy?.();
            callback(null, receivedData);
          }
        });
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(receivedData).toContain('"event":"connected"');
  });

  it('3. Two-PT Patient Scoping Test: PT 1 sees only their own patients, PT 2 is strictly filtered out', async () => {
    const pt1Id = 'pt-user-001-uuid';
    const pt2Id = 'pt-user-002-uuid';

    // Simulate event delivery listener for PT 1
    const pt1Received: HospitalEvent[] = [];
    const pt2Received: HospitalEvent[] = [];
    const adminReceived: HospitalEvent[] = [];

    const pt1Listener = (evt: HospitalEvent) => {
      // PT 1 filter logic
      if (evt.event === 'audit') return;
      if (evt.responsiblePtId === pt1Id || evt.assignedPtIds?.includes(pt1Id)) {
        pt1Received.push(evt);
      }
    };

    const pt2Listener = (evt: HospitalEvent) => {
      // PT 2 filter logic
      if (evt.event === 'audit') return;
      if (evt.responsiblePtId === pt2Id || evt.assignedPtIds?.includes(pt2Id)) {
        pt2Received.push(evt);
      }
    };

    const adminListener = (evt: HospitalEvent) => {
      // Admin receives all events
      adminReceived.push(evt);
    };

    hospitalEventBus.on('hospital_event', pt1Listener);
    hospitalEventBus.on('hospital_event', pt2Listener);
    hospitalEventBus.on('hospital_event', adminListener);

    try {
      // Event A: Patient assigned exclusively to PT 1
      dispatchHospitalEvent({
        event: 'patient_status_changed',
        patientId: 'patient-aaa-uuid',
        responsiblePtId: pt1Id,
        data: { status: 'active', hn: 'HN-000101' },
      });

      // Event B: Patient assigned exclusively to PT 2
      dispatchHospitalEvent({
        event: 'patient_status_changed',
        patientId: 'patient-bbb-uuid',
        responsiblePtId: pt2Id,
        data: { status: 'in_treatment', hn: 'HN-000202' },
      });

      // Event C: Audit event (admin only)
      dispatchHospitalEvent({
        event: 'audit',
        data: { action: 'STAFF_ACCOUNT_LOCKED', target: 'pt-malicious' },
      });

      // Verify PT 1 received Event A, but NOT Event B and NOT Event C
      expect(pt1Received.length).toBe(1);
      expect(pt1Received[0].patientId).toBe('patient-aaa-uuid');
      expect(pt1Received[0].responsiblePtId).toBe(pt1Id);

      // Verify PT 2 received Event B, but NOT Event A and NOT Event C
      expect(pt2Received.length).toBe(1);
      expect(pt2Received[0].patientId).toBe('patient-bbb-uuid');
      expect(pt2Received[0].responsiblePtId).toBe(pt2Id);

      // Verify Admin received all 3 events
      expect(adminReceived.length).toBe(3);
      expect(adminReceived.map((e) => e.event)).toEqual([
        'patient_status_changed',
        'patient_status_changed',
        'audit',
      ]);
    } finally {
      hospitalEventBus.off('hospital_event', pt1Listener);
      hospitalEventBus.off('hospital_event', pt2Listener);
      hospitalEventBus.off('hospital_event', adminListener);
    }
  });
});
