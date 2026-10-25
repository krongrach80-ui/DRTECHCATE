/**
 * apps/api/src/__tests__/patient_dossier_vault_v6.test.ts
 * Master Prompt v6: Strict Patient-Centric Dossier Vault, 10-Snapshot Retention Policy & Schedule / Minigame Sync Test Suite
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { defaultPatientVaultService } from '../modules/smart-onboarding/vault.service';
import {
  l2Normalize,
  PatientRecordFile,
} from '../../../../packages/smart-biometric-core/src/index.js';

describe('[MASTER PROMPT v6] Strict Patient-Centric Dossier Vault, 10-Snapshot Retention & Therapy Sync', () => {
  const app = createApp();
  const testPatientId = `P-TEST6-${Date.now()}`;
  const baseUploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'patients');
  const patientDir = path.join(baseUploadDir, testPatientId);

  // Helper to generate normalized 512-dim vector
  function generateVector(seed: number): number[] {
    const raw = new Array(512).fill(0).map((_, i) => Math.cos(seed * (i + 1)));
    return l2Normalize(raw);
  }

  afterAll(() => {
    // Clean up test vault folder
    if (fs.existsSync(patientDir)) {
      try {
        fs.rmSync(patientDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  describe('1. Strict Isolated Directory Structure & Schema (Section 1 & 2)', () => {
    it('1.1 creates isolated folder /public/uploads/patients/{patient_id}/ and outputs mandatory debug log', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      defaultPatientVaultService.ensurePatientVault(testPatientId);

      expect(fs.existsSync(patientDir)).toBe(true);
      expect(fs.existsSync(path.join(patientDir, 'login_history'))).toBe(true);

      const createdLogFound = consoleSpy.mock.calls.some((call) =>
        call[0]?.includes(`[STORAGE] Created directory: /public/uploads/patients/${testPatientId}/`)
      );
      expect(createdLogFound).toBe(true);
      consoleSpy.mockRestore();
    });

    it('1.2 saves profile_face.jpg and patient_record.json with 512-D vector and outputs mandatory log', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const vector = generateVector(42);
      const mockProfileJpeg = Buffer.from('fake-jpeg-raw-bytes-high-res');

      const record: PatientRecordFile = {
        patient_id: testPatientId,
        hn: testPatientId,
        first_name: 'วิภาดา',
        last_name: 'รักสุขภาพ',
        age: 58,
        gender: 'female',
        phone: '0812345678',
        initial_symptoms: 'ปวดข้อเข่าเสื่อมระยะ 2',
        registration_status: 'active',
        registered_via: 'smart_onboarding',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        biometrics: {
          face_vector: vector,
          registered_face_url: `/uploads/patients/${testPatientId}/profile_face.jpg`,
          confidence_score: 0.99,
          model_version: 'w600k_r50',
          enrolled_at: new Date().toISOString(),
        },
        schedule: null,
        daily_checklists: {},
        rehab_scores: [],
        clinical: {
          diagnosis: 'Knee Osteoarthritis Grade 2',
          treatment_plan: 'Quad strengthening and range of motion',
          progress_notes: [],
        },
      };

      defaultPatientVaultService.savePatientRecord(testPatientId, record, mockProfileJpeg);

      // Verify files on disk
      const profilePath = path.join(patientDir, 'profile_face.jpg');
      const jsonPath = path.join(patientDir, 'patient_record.json');
      expect(fs.existsSync(profilePath)).toBe(true);
      expect(fs.existsSync(jsonPath)).toBe(true);

      // Verify exact JSON contents
      const savedJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(savedJson.patient_id).toBe(testPatientId);
      expect(savedJson.hn).toBe(testPatientId);
      expect(savedJson.first_name).toBe('วิภาดา');
      expect(savedJson.biometrics.face_vector.length).toBe(512);
      expect(savedJson.biometrics.face_vector[0]).toBeCloseTo(vector[0], 5);

      // Verify mandatory console log
      const savedLogFound = consoleSpy.mock.calls.some((call) =>
        call[0]?.includes(
          `[STORAGE] Saved profile_face.jpg and patient_record.json for ${testPatientId} successfully.`
        )
      );
      expect(savedLogFound).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('2. 10-Snapshot Rolling Retention Policy (Section 2)', () => {
    it('2.1 retains exactly 10 latest snapshots and automatically purges older snapshots', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const loginHistDir = path.join(patientDir, 'login_history');
      defaultPatientVaultService.ensurePatientVault(testPatientId);

      // Record 13 consecutive snapshots
      for (let i = 1; i <= 13; i++) {
        const dummyBuf = Buffer.from(`snapshot-payload-#${i}`);
        defaultPatientVaultService.recordLoginSnapshot(testPatientId, dummyBuf);
        // Small delay to ensure timestamp resolution if needed
        await new Promise((r) => setTimeout(r, 10));
      }

      // Read files in login_history/
      const remainingFiles = fs
        .readdirSync(loginHistDir)
        .filter((f) => f.endsWith('.jpg') || f.endsWith('.jpeg'));

      expect(remainingFiles.length).toBe(10);

      // Verify mandatory console log
      const retentionLogFound = consoleSpy.mock.calls.some((call) =>
        call[0]?.includes(
          `[STORAGE] Saved login snapshot and enforced 10-file retention limit for ${testPatientId}.`
        )
      );
      expect(retentionLogFound).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('3. Dynamic Dossier Fetching (Section 3)', () => {
    it('3.1 GET /api/smart-onboarding/patient/:id/dossier returns complete patient dossier', async () => {
      const vector = generateVector(10);
      defaultPatientVaultService.savePatientRecord(
        testPatientId,
        {
          patient_id: testPatientId,
          hn: testPatientId,
          first_name: 'มานะ',
          last_name: 'ขยันยิ่ง',
          age: 45,
          gender: 'male',
          phone: '0899999999',
          registration_status: 'active',
          registered_via: 'smart_onboarding',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          biometrics: {
            face_vector: vector,
            registered_face_url: `/uploads/patients/${testPatientId}/profile_face.jpg`,
            confidence_score: 0.97,
            model_version: 'w600k_r50',
            enrolled_at: new Date().toISOString(),
          },
          schedule: {
            startDate: '2026-10-01',
            endDate: '2026-10-31',
            daysOfWeek: ['Mon', 'Wed', 'Fri'],
            timeSlot: '09:30 - 10:30',
            kioskId: 'kiosk-01',
            include_minigame: true,
            assigned_exercises: [
              { exercise_id: 'ex-01', name: 'กางแขนยกด้านข้าง', target_joint: 'ไหล่', sets: 3, reps: 10 },
            ],
          },
          daily_checklists: {},
          rehab_scores: [
            {
              timestamp: '2026-10-24T09:00:00Z',
              completion_rate: 100,
              exercises_completed: 1,
              minigame_score: 35,
              total_score: 135,
            },
          ],
          clinical: {
            diagnosis: 'ข้อไหล่ติด',
            treatment_plan: 'ฝึกกายภาพประจำวัน',
            progress_notes: [],
          },
        },
        Buffer.from('fake-face')
      );

      // Add a login snapshot
      defaultPatientVaultService.recordLoginSnapshot(testPatientId, Buffer.from('snap-1'));

      const res = await request(app)
        .get(`/api/smart-onboarding/patient/${testPatientId}/dossier`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.record.patient_id).toBe(testPatientId);
      expect(res.body.data.profile_face_url).toBe(`/uploads/patients/${testPatientId}/profile_face.jpg`);
      expect(res.body.data.login_snapshots.length).toBe(10);
      expect(res.body.data.schedule.include_minigame).toBe(true);
      expect(res.body.data.rehab_scores.length).toBe(1);
    });

    it('3.2 GET /api/smart-onboarding/dossiers returns all dossiers for admin schedule overview', async () => {
      const res = await request(app)
        .get('/api/smart-onboarding/dossiers')
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((d: any) => d.patient_id === testPatientId);
      expect(found).toBeDefined();
      expect(found.first_name).toBe('มานะ');
    });
  });

  describe('4. Therapy Schedule Sync & Interactive Minigame Workflow (Section 4)', () => {
    it('4.1 saves schedule with include_minigame toggle and updates patient_record.json', async () => {
      const schedulePayload = {
        patient_id: testPatientId,
        schedule: {
          start_date: '2026-10-01',
          end_date: '2026-10-31',
          days_of_week: ['Mon', 'Wed', 'Fri'],
          time_slot: '10:00 - 11:00',
          assigned_kiosk_id: 'kiosk-02',
          include_minigame: true,
          prescribed_exercises: [
            {
              exercise_id: 'ex-shoulder-01',
              name: 'ท่ากางแขนยกด้านข้าง',
              target_joint: 'ข้อไหล่',
              sets: 3,
              reps: 10,
            },
          ],
        },
      };

      const res = await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(schedulePayload)
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Verify on disk in patient_record.json
      const record = defaultPatientVaultService.getPatientRecord(testPatientId);
      expect(record?.schedule).toBeDefined();
      expect(record?.schedule?.include_minigame).toBe(true);
      expect(record?.schedule?.days_of_week).toContain('Mon');
      expect(record?.schedule?.assigned_kiosk_id).toBe('kiosk-02');
    });

    it('4.2 Daily plan Bangkok evaluation: returns active course on scheduled day with include_minigame', async () => {
      // 2026-10-26 is a Monday (Mon)
      const resMonday = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${testPatientId}?date=2026-10-26T09:00:00+07:00`)
        .expect(200);

      expect(resMonday.body.ok).toBe(true);
      expect(resMonday.body.data.is_scheduled_today).toBe(true);
      expect(resMonday.body.data.include_minigame).toBe(true);
      expect(resMonday.body.data.exercises.length).toBe(1);
      expect(resMonday.body.data.exercises[0].name).toBe('ท่ากางแขนยกด้านข้าง');
    });

    it('4.3 Daily plan Bangkok evaluation: returns friendly rest day notice on non-scheduled day', async () => {
      // 2026-10-27 is a Tuesday (Tue - not in Mon, Wed, Fri)
      const resTuesday = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${testPatientId}?date=2026-10-27T09:00:00+07:00`)
        .expect(200);

      expect(resTuesday.body.ok).toBe(true);
      expect(resTuesday.body.data.is_scheduled_today).toBe(false);
      expect(resTuesday.body.data.include_minigame).toBe(false);
      expect(resTuesday.body.data.reason).toBe(
        'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้'
      );
    });

    it('4.4 Daily plan Bangkok evaluation: returns rest day notice when outside course date range', async () => {
      // 2026-12-07 is a Monday but outside October course window
      const resDec = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${testPatientId}?date=2026-12-07T09:00:00+07:00`)
        .expect(200);

      expect(resDec.body.ok).toBe(true);
      expect(resDec.body.data.is_scheduled_today).toBe(false);
      expect(resDec.body.data.reason).toBe(
        'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้'
      );
    });

    it('4.5 records rehab and minigame scores to rehab_scores in patient_record.json', async () => {
      const scorePayload = {
        patient_id: testPatientId,
        score: {
          timestamp: new Date().toISOString(),
          completion_rate: 100,
          exercises_completed: 1,
          minigame_score: 70,
          total_score: 170,
        },
      };

      const res = await request(app)
        .post('/api/smart-onboarding/rehab-score')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(scorePayload)
        .expect(200);

      expect(res.body.ok).toBe(true);

      const record = defaultPatientVaultService.getPatientRecord(testPatientId);
      expect(record?.rehab_scores.length).toBeGreaterThanOrEqual(1);
      const latest = record?.rehab_scores[record.rehab_scores.length - 1];
      expect(latest?.minigame_score).toBe(70);
      expect(latest?.total_score).toBe(170);
    });
  });
});
