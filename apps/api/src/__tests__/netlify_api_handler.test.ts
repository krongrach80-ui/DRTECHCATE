import { describe, it, expect, beforeAll } from 'vitest';
import { handler } from '../../../../netlify/functions/api';

describe('Netlify Serverless Function Handler (/api/* -> /.netlify/functions/api)', () => {
  const NETLIFY_ORIGIN = 'https://storied-basbousa-42f3be.netlify.app';

  beforeAll(async () => {
    process.env.ALLOW_BEARER_IN_PROD = 'true';
    process.env.USE_LOCAL_STORAGE = 'true';
    const { activateLocalPersistenceEngine } = await import('../lib/localStorage/localPersistenceEngine');
    activateLocalPersistenceEngine();
  });

  it('1. POST /api/auth/login - Successfully logs in Director and returns 200 OK with session and CORS', async () => {
    const event = {
      httpMethod: 'POST',
      path: '/api/auth/login',
      headers: {
        'content-type': 'application/json',
        'origin': NETLIFY_ORIGIN,
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        username: 'director',
        password: 'Admin12345678!',
      }),
    };

    const res = await handler(event, {});
    expect(res.statusCode).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.user).toBeDefined();
    expect(data.user.role).toBe('admin');
    expect(data.token || data.accessToken).toBeDefined();

    // Check CORS
    const headers = res.headers || {};
    const allowOrigin = headers['Access-Control-Allow-Origin'] || headers['access-control-allow-origin'];
    expect(allowOrigin).toBe(NETLIFY_ORIGIN);
  });

  it('2. POST /api/smart-onboarding/register - Registers new patient with 10 biometric frames and returns 200/201', async () => {
    // 10 biometric frames (4 front, 2 left, 2 right, 2 nod)
    const normalizedVector = Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.1) * (1 / Math.sqrt(512)));
    const frames = [
      { pose: 'front', embedding: normalizedVector, jpeg_base64: 'mock_front1' },
      { pose: 'front', embedding: normalizedVector, jpeg_base64: 'mock_front2' },
      { pose: 'front', embedding: normalizedVector, jpeg_base64: 'mock_front3' },
      { pose: 'front', embedding: normalizedVector, jpeg_base64: 'mock_front4' },
      { pose: 'left', embedding: normalizedVector, jpeg_base64: 'mock_left1' },
      { pose: 'left', embedding: normalizedVector, jpeg_base64: 'mock_left2' },
      { pose: 'right', embedding: normalizedVector, jpeg_base64: 'mock_right1' },
      { pose: 'right', embedding: normalizedVector, jpeg_base64: 'mock_right2' },
      { pose: 'nod', embedding: normalizedVector, jpeg_base64: 'mock_nod1' },
      { pose: 'nod', embedding: normalizedVector, jpeg_base64: 'mock_nod2' },
    ];

    const testHn = `TEST-NETLIFY-${Date.now()}`;
    const event = {
      httpMethod: 'POST',
      path: '/.netlify/functions/api/smart-onboarding/register', // Test rewrite path
      headers: {
        'content-type': 'application/json',
        'origin': NETLIFY_ORIGIN,
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        hn: testHn,
        first_name: 'กิตติศักดิ์',
        last_name: 'มั่นคง',
        age: 52,
        sex: 'male',
        injury: 'ข้อเข่าเสื่อมระยะที่ 2',
        pin: '5678',
        frames,
        model_version: 'w600k_r50',
      }),
    };

    const res = await handler(event, {});
    expect([200, 201]).toContain(res.statusCode);

    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.patient_id).toBeDefined();
    expect(data.hn).toBe(testHn);
  });

  it('3. POST /api/smart-onboarding/scan-login - Matches scanned face and returns 200 OK', async () => {
    const probe = Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.1) * (1 / Math.sqrt(512)));

    const event = {
      httpMethod: 'POST',
      path: '/api/smart-onboarding/scan-login',
      headers: {
        'content-type': 'application/json',
        'origin': NETLIFY_ORIGIN,
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        probe,
      }),
    };

    const res = await handler(event, {});
    expect(res.statusCode).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
  });

  it('4. GET /.netlify/functions/api/health - Normalizes path to /api/health and returns 200 OK', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/.netlify/functions/api/health',
      headers: {
        'origin': NETLIFY_ORIGIN,
      },
    };

    const res = await handler(event, {});
    expect(res.statusCode).toBe(200);

    const data = JSON.parse(res.body);
    expect(['ok', 'healthy']).toContain(data.status);
  });

  it('5. OPTIONS /api/* - Fast preflight returns 204 No Content with CORS allow headers', async () => {
    const event = {
      httpMethod: 'OPTIONS',
      path: '/api/auth/login',
      headers: {
        'origin': NETLIFY_ORIGIN,
      },
    };

    const res = await handler(event, {});
    expect(res.statusCode).toBe(204);

    const headers = res.headers || {};
    expect(headers['Access-Control-Allow-Origin']).toBe(NETLIFY_ORIGIN);
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('6. GET /api/courses/exercises - Returns catalog containing Shoulder Pendulum with pendulum_circular', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/api/courses/exercises',
      headers: {
        'origin': NETLIFY_ORIGIN,
      },
    };

    const res = await handler(event, {});
    if (res.statusCode !== 200) {
      console.log('TEST 6 FAILURE BODY:', res.body);
    }
    expect(res.statusCode).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);

    const pendulum = data.data.find(
      (e: any) =>
        e.title?.toLowerCase().includes('pendulum') ||
        e.title?.includes('แกว่งแขน') ||
        e.detection_config?.evaluationMode === 'pendulum_circular'
    );
    expect(pendulum).toBeDefined();
    expect(pendulum.detection_config).toBeDefined();
    expect(pendulum.detection_config.evaluationMode).toBe('pendulum_circular');
  });

  it('7. POST /api/courses/session-logs - Persists session telemetry and returns 201 Created', async () => {
    const event = {
      httpMethod: 'POST',
      path: '/api/courses/session-logs',
      headers: {
        'content-type': 'application/json',
        'origin': NETLIFY_ORIGIN,
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        patient_id: 'd1000000-0000-0000-0000-000000000001',
        exercise_id: 'e1000000-0000-0000-0000-000000000001',
        kiosk_id: 'kiosk-01',
        completion_mode: 'ai_verified',
        correct_reps: 10,
        incorrect_reps: 1,
        target_reps: 10,
        current_set: 3,
        total_sets: 3,
        max_angle_achieved: 92.5,
        consistency_score: 91.0,
        pain_reported: false,
        duration_seconds: 145,
        telemetry_summary: {
          test: true,
          scapular_hiking_rate: 0.02,
        },
      }),
    };

    const res = await handler(event, {});
    if (![200, 201].includes(res.statusCode)) {
      console.log('TEST 7 FAILURE STATUS:', res.statusCode, 'BODY:', res.body);
    }
    expect([200, 201]).toContain(res.statusCode);

    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.completion_mode).toBe('ai_verified');
    expect(data.data.correct_reps).toBe(10);
  });

  it('8. POST /api/courses/session-logs (Emergency Pain Stop) & GET returns telemetry', async () => {
    const painEvent = {
      httpMethod: 'POST',
      path: '/api/courses/session-logs',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        patient_id: 'd1000000-0000-0000-0000-000000000001',
        exercise_id: 'e1000000-0000-0000-0000-000000000001',
        kiosk_id: 'kiosk-01',
        completion_mode: 'stopped_pain',
        correct_reps: 3,
        incorrect_reps: 0,
        target_reps: 10,
        current_set: 1,
        total_sets: 3,
        max_angle_achieved: 65.0,
        consistency_score: 100.0,
        pain_reported: true,
        duration_seconds: 25,
        telemetry_summary: {
          emergency_stop: true,
          pain_reported: true,
        },
      }),
    };

    const painRes = await handler(painEvent, {});
    expect([200, 201]).toContain(painRes.statusCode);
    const painData = JSON.parse(painRes.body);
    expect(painData.ok).toBe(true);
    expect(painData.data.completion_mode).toBe('stopped_pain');
    expect(painData.data.pain_reported).toBe(true);

    // Verify GET retrieves the pain log
    const getEvent = {
      httpMethod: 'GET',
      path: '/api/courses/session-logs',
      headers: {},
      queryStringParameters: {
        patient_id: 'd1000000-0000-0000-0000-000000000001',
      },
    };
    const getRes = await handler(getEvent, {});
    expect(getRes.statusCode).toBe(200);
    const getData = JSON.parse(getRes.body);
    expect(getData.ok).toBe(true);
    expect(Array.isArray(getData.data)).toBe(true);
    expect(getData.data.some((l: any) => l.completion_mode === 'stopped_pain')).toBe(true);
  });
});

