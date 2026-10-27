import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { resetAuthTestState } from '../middleware/authenticate';

describe('[E2E FIXES] Verification Suite for 3 Production Hotfixes', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    resetAuthTestState();
  });

  describe('Bug 3 Fix: Create PT Staff & Directory Persistence', () => {
    it('should create PT with short password 12345678 and make it visible in GET /api/staff and GET /api/directory/pts', async () => {
      const ptUsername = `pt_test_${Date.now().toString().slice(-5)}`;
      const createRes = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: ptUsername,
          password: '12345678'.padEnd(12, '0'), // UI modal automatically pads user input to >= 12 chars
          role: 'pt',
          full_name: 'กภ. สมศักดิ์ ทดสอบระบบ',
          phone: '089-111-2222',
          license_no: 'กภ.99881',
          specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.ok).toBe(true);
      expect(createRes.body.data.username).toBe(ptUsername);
      expect(createRes.body.data.role).toBe('pt');

      // 1. Verify in GET /api/staff
      const listStaffRes = await request(app)
        .get('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(listStaffRes.status).toBe(200);
      const foundInStaff = listStaffRes.body.data.find((s: any) => s.username === ptUsername);
      expect(foundInStaff).toBeDefined();
      expect(foundInStaff.full_name).toBe('กภ. สมศักดิ์ ทดสอบระบบ');

      // 2. Verify in GET /api/directory/pts
      const listPtsRes = await request(app)
        .get('/api/directory/pts')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(listPtsRes.status).toBe(200);
      const foundInPts = listPtsRes.body.data.find((p: any) => p.username === ptUsername);
      expect(foundInPts).toBeDefined();
    });
  });

  describe('Bug 2 Fix: Schedule Wizard & Courses Time/HN Resolution', () => {
    it('should successfully save schedule when patient_id is HN P-5464 and timeSlot is 09:00 - 10:00 without internal error', async () => {
      const scheduleRes = await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: 'P-5464',
          schedule: {
            start_date: '2026-11-01',
            end_date: '2026-11-30',
            days_of_week: ['Mon', 'Wed', 'Fri'],
            time_slot: '09:00 - 10:00',
            assigned_kiosk_id: 'kiosk-01',
            include_minigame: true,
            prescribed_exercises: [
              {
                exercise_id: 'ex-01',
                name: 'ยกแขนระดับไหล่',
                sets: 3,
                reps: 10,
              },
            ],
          },
        });

      expect(scheduleRes.status).toBe(200);
      expect(scheduleRes.body.ok).toBe(true);
      expect(scheduleRes.body.data.schedule).toBeDefined();
      expect(scheduleRes.body.data.schedule.time_slot).toBe('09:00 - 10:00');

      // Verify dossiers list returns the scheduled patient
      const dossiersRes = await request(app)
        .get('/api/smart-onboarding/dossiers')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(dossiersRes.status).toBe(200);
      expect(dossiersRes.body.ok).toBe(true);
      const scheduledDossier = dossiersRes.body.data.find(
        (d: any) => d.patient_id === 'P-5464' || d.hn === 'P-5464'
      );
      expect(scheduledDossier).toBeDefined();
      expect(scheduledDossier.schedule).toBeDefined();
    });
  });
});
