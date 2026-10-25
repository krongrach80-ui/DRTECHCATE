/**
 * apps/api/src/__tests__/ai_settings_and_onboarding_audit.test.ts
 * In-depth verification of AI Calibration, Smart Onboarding DB persistence & End-to-End Pipeline
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { resetAuthTestState } from '../middleware/authenticate';
import { defaultDirectoryRepository } from '../modules/directory/repository';

describe('[AUDIT & END-TO-END] AI Settings, Smart Onboarding Repository & Button Invariants', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    resetAuthTestState();
  });

  describe('1. AI Calibration Endpoints (UI ➔ Express ➔ Supabase Pipeline)', () => {
    it('1.1 GET /api/security/settings/ai should allow admin to read active calibration thresholds', async () => {
      const res = await request(app)
        .get('/api/security/settings/ai')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.cosine_similarity).toBe(0.80);
      expect(res.body.data.margin_threshold).toBe(0.08);
      expect(res.body.data.liveness_enabled).toBe(true);
    });

    it('1.2 PATCH /api/security/settings/ai should allow admin to calibrate settings and persist to DB', async () => {
      const updatePayload = {
        cosine_similarity: 0.85,
        margin_threshold: 0.12,
        rom_tolerance: 15,
        voice_guidance: false,
      };

      const res = await request(app)
        .patch('/api/security/settings/ai')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.cosine_similarity).toBe(0.85);
      expect(res.body.data.margin_threshold).toBe(0.12);
      expect(res.body.data.rom_tolerance).toBe(15);
      expect(res.body.data.voice_guidance).toBe(false);

      // Verify persistence on subsequent GET
      const getRes = await request(app)
        .get('/api/security/settings/ai')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.cosine_similarity).toBe(0.85);
      expect(getRes.body.data.voice_guidance).toBe(false);
    });

    it('1.3 POST /api/security/settings/ai/reset should revert thresholds back to medical defaults', async () => {
      // Modify first
      await request(app)
        .patch('/api/security/settings/ai')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ cosine_similarity: 0.92 });

      // Reset
      const resetRes = await request(app)
        .post('/api/security/settings/ai/reset')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.ok).toBe(true);
      expect(resetRes.body.data.cosine_similarity).toBe(0.80);
      expect(resetRes.body.data.margin_threshold).toBe(0.08);
    });

    it('1.4 PT should receive 403 Forbidden on AI Calibration endpoints', async () => {
      const getRes = await request(app)
        .get('/api/security/settings/ai')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);
      expect(getRes.status).toBe(403);

      const patchRes = await request(app)
        .patch('/api/security/settings/ai')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ cosine_similarity: 0.90 });
      expect(patchRes.status).toBe(403);
    });
  });

  describe('2. Smart Onboarding DB Repository Integration (Zero Disk Data Files)', () => {
    it('2.1 exercises saved via smart-onboarding must persist in DirectoryRepository', async () => {
      const exRes = await request(app)
        .post('/api/smart-onboarding/exercises')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'กายภาพบำบัดกล้ามเนื้อไหล่ (Shoulder ER)',
          target_joint: 'Shoulder',
          safety_warnings: 'ห้ามออกแรงกระชาก',
          default_sets: 4,
          default_reps: 12,
        });

      expect(exRes.status).toBe(201);
      expect(exRes.body.ok).toBe(true);

      // Verify DirectoryRepository received it
      const dbExercises = await defaultDirectoryRepository.listExercises();
      const match = dbExercises.find((x) => x.title.includes('Shoulder ER'));
      expect(match).toBeDefined();
      expect(match?.default_sets).toBe(4);
      expect(match?.default_reps).toBe(12);

      // Confirm no data/exercises.json written
      const diskPath = path.resolve(process.cwd(), 'data', 'exercises.json');
      expect(fs.existsSync(diskPath)).toBe(false);
    });

    it('2.2 modpacks saved via smart-onboarding must persist in DirectoryRepository', async () => {
      const mpRes = await request(app)
        .post('/api/smart-onboarding/modpacks')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'ชุดฝึกข้อไหล่ระยะฟื้นฟู',
          description: 'สำหรับผู้ป่วยหลังผ่าตัดไหล่',
          items: [],
        });

      expect(mpRes.status).toBe(201);
      expect(mpRes.body.ok).toBe(true);

      // Verify DirectoryRepository received it
      const dbModpacks = await defaultDirectoryRepository.listModpacks();
      const match = dbModpacks.find((m) => m.name.includes('ชุดฝึกข้อไหล่ระยะฟื้นฟู'));
      expect(match).toBeDefined();

      // Confirm no data/modpacks.json written
      const diskPath = path.resolve(process.cwd(), 'data', 'modpacks.json');
      expect(fs.existsSync(diskPath)).toBe(false);
    });
  });

  describe('3. Rule 2.3 Strict Audit: Zero Fake Form Actions in Frontend Views', () => {
    it('3.1 SystemAiSettingsView.tsx must call real security API', () => {
      const viewPath = path.resolve(process.cwd(), 'apps/admin/src/clinical-ui/SystemAiSettingsView.tsx');
      const content = fs.readFileSync(viewPath, 'utf-8');

      expect(content).toContain('defaultApiClient.security.getAiSettings');
      expect(content).toContain('defaultApiClient.security.updateAiSettings');
      expect(content).toContain('defaultApiClient.security.resetAiSettings');
    });

    it('3.2 SmartExerciseLibraryModal.tsx must call real exercises.create API', () => {
      const modalPath = path.resolve(process.cwd(), 'apps/admin/src/smart-portal/SmartExerciseLibraryModal.tsx');
      const content = fs.readFileSync(modalPath, 'utf-8');

      expect(content).toContain('defaultApiClient.exercises.create');
      expect(content).not.toContain('defaultApiClient.smartOnboarding.saveExercise');
    });

    it('3.3 SystemAuditLogView.tsx must call real audit.list and security.createBan APIs', () => {
      const viewPath = path.resolve(process.cwd(), 'apps/admin/src/clinical-ui/SystemAuditLogView.tsx');
      const content = fs.readFileSync(viewPath, 'utf-8');

      expect(content).toContain('defaultApiClient.audit.list');
      expect(content).toContain('defaultApiClient.security.createBan');
      expect(content).toContain('defaultApiClient.security.forceLogout');
    });
  });
});
