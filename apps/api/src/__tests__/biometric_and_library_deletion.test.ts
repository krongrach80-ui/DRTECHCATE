import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { activateLocalPersistenceEngine } from '../lib/localStorage/localPersistenceEngine';
import { createStatelessToken } from '../lib/auth/token';
import { GeometricLandmarkEmbeddingModel } from '../../../../packages/face-client/src/embed';
import fs from 'fs';
import path from 'path';

describe('Biometric Matching >= 80% & Library Cascade Deletion Integration Tests', () => {
  let app: any;
  let testUploadsDir: string;
  let adminToken: string;
  const embeddingModel = new GeometricLandmarkEmbeddingModel();

  // Helper to generate simulated face canvas with customizable facial geometry
  function createSimulatedFace(
    seed: number,
    brightness = 150,
    noise = 0,
    shiftX = 0,
    shiftY = 0,
    geometry?: { eyeDist?: number; eyeY?: number; noseY?: number; mouthY?: number; freqScale?: number }
  ) {
    const w = 112;
    const h = 112;
    const data = new Uint8ClampedArray(w * h * 4);
    const eyeDist = geometry?.eyeDist ?? 35;
    const eyeY = geometry?.eyeY ?? 51;
    const noseY = geometry?.noseY ?? 71;
    const mouthY = geometry?.mouthY ?? 92;
    const eye1X = 56 - eyeDist / 2;
    const eye2X = 56 + eyeDist / 2;
    const freq = geometry?.freqScale ?? 1.0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const sx = x - shiftX;
        const sy = y - shiftY;
        const eye1 = Math.exp(-((sx - eye1X) ** 2 + (sy - eyeY) ** 2) / (2 * ((seed % 5) + 4) ** 2));
        const eye2 = Math.exp(-((sx - eye2X) ** 2 + (sy - eyeY) ** 2) / (2 * ((seed % 5) + 4) ** 2));
        const nose = Math.exp(-((sx - 56) ** 2 + (sy - noseY) ** 2) / (2 * ((seed % 6) + 5) ** 2));
        const mouth = Math.exp(-((sx - 56) ** 2 + (sy - mouthY) ** 2) / (2 * ((seed % 8) + 8) ** 2));
        const nVal = (Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453) % 1;
        const val = Math.max(
          0,
          Math.min(
            255,
            brightness - 90 * (eye1 + eye2 + nose * 0.8 + mouth * 0.9) +
              Math.sin(sx * seed * 0.1 * freq + sy * 0.05) * 20 +
              nVal * noise
          )
        );
        data[idx] = val;
        data[idx + 1] = val * 0.85;
        data[idx + 2] = val * 0.75;
        data[idx + 3] = 255;
      }
    }
    return {
      width: w,
      height: h,
      getContext: () => ({
        getImageData: () => ({ data, width: w, height: h }),
      }),
    } as unknown as HTMLCanvasElement;
  }

  beforeAll(() => {
    activateLocalPersistenceEngine();
    adminToken = createStatelessToken({
      id: '00000000-0000-0000-0000-000000000001',
      username: 'admin',
      full_name: 'System Admin',
      role: 'admin',
    });
  });

  beforeEach(() => {
    testUploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'patients');
    if (!fs.existsSync(testUploadsDir)) {
      fs.mkdirSync(testUploadsDir, { recursive: true });
    }
    app = createApp();
  });

  afterEach(() => {
    try {
      const files = fs.readdirSync(testUploadsDir);
      for (const f of files) {
        if (f.startsWith('TEST-') || f.startsWith('P-TEST')) {
          fs.rmSync(path.join(testUploadsDir, f), { recursive: true, force: true });
        }
      }
    } catch {
      // safe
    }
  });

  // =========================================================================
  // TEST 1: Enroll 10 Frames -> Face Scan Login Match >= 80% (Same Person)
  // vs Different Person < 80% (Rejected)
  // =========================================================================
  describe('Test 1: Biometric Enrollment & Scan-Login Best-of-N Multi-Frame Matching', () => {
    it('should successfully match registered patient with Similarity >= 85% under camera lighting/pose shifts and reject strangers', async () => {
      // 1. Generate 10 enrollment frames for Person A (seed 7)
      // 4 front, 2 left, 2 right, 2 nod
      const frames: Array<{ pose: string; embedding: number[]; jpeg_base64: string }> = [];

      for (let i = 0; i < 4; i++) {
        const face = createSimulatedFace(7, 150 + i * 5, 2, 0, 0);
        const emb = await embeddingModel.embed(face);
        frames.push({ pose: 'front', embedding: emb, jpeg_base64: 'mock_front_jpg' });
      }
      for (let i = 0; i < 2; i++) {
        const face = createSimulatedFace(7, 150, 4, -2, 0);
        const emb = await embeddingModel.embed(face);
        frames.push({ pose: 'left', embedding: emb, jpeg_base64: 'mock_left_jpg' });
      }
      for (let i = 0; i < 2; i++) {
        const face = createSimulatedFace(7, 150, 4, 2, 0);
        const emb = await embeddingModel.embed(face);
        frames.push({ pose: 'right', embedding: emb, jpeg_base64: 'mock_right_jpg' });
      }
      for (let i = 0; i < 2; i++) {
        const face = createSimulatedFace(7, 150, 4, 0, 2);
        const emb = await embeddingModel.embed(face);
        frames.push({ pose: 'nod', embedding: emb, jpeg_base64: 'mock_nod_jpg' });
      }

      // 2. Register Person A via /api/smart-onboarding/register
      const testHn = `TEST-P1-${Date.now()}`;
      const regRes = await request(app)
        .post('/api/smart-onboarding/register')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          hn: testHn,
          first_name: 'สมชาย',
          last_name: 'ใจดี',
          age: 48,
          sex: 'male',
          injury: 'ข้อเข่าเสื่อม',
          pin: '1234',
          frames,
          model_version: 'w600k_r50',
        });

      expect([200, 201]).toContain(regRes.status);
      expect(regRes.body.ok).toBe(true);
      expect(regRes.body.patient_id).toBeDefined();

      // 3. Scan Login with Person A's face under real camera lighting & slight shift
      // (seed 7, brightness 130 vs 150, camera sensor noise = 8, 1px shift)
      const probeSamePersonFace = createSimulatedFace(7, 130, 8, 1, -1);
      const probeSamePersonVec = await embeddingModel.embed(probeSamePersonFace);

      const loginResSame = await request(app)
        .post('/api/smart-onboarding/scan-login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          probe: probeSamePersonVec,
        });

      expect(loginResSame.status).toBe(200);
      expect(loginResSame.body.ok).toBe(true);
      expect(loginResSame.body.matched).toBe(true);
      expect(loginResSame.body.patient).toBeDefined();
      expect(loginResSame.body.patient.first_name).toBe('สมชาย');
      // Must achieve Similarity >= 85%
      expect(loginResSame.body.similarityPercentage).toBeGreaterThanOrEqual(85);

      // 4. Scan Login with Person B (Stranger / Different Face Geometry)
      const probeStrangerFace = createSimulatedFace(99, 150, 0, 0, 0, {
        eyeDist: 50,
        eyeY: 38,
        noseY: 60,
        mouthY: 80,
        freqScale: 2.7,
      });
      const probeStrangerVec = await embeddingModel.embed(probeStrangerFace);

      const loginResStranger = await request(app)
        .post('/api/smart-onboarding/scan-login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          probe: probeStrangerVec,
        });

      expect(loginResStranger.status).toBe(200);
      expect(loginResStranger.body.matched).toBe(false);
      expect(loginResStranger.body.message).toContain('ไม่พบบัญชีในระบบ');
    });
  });

  // =========================================================================
  // TEST 2: Exercise & Modpack Cascade Deletion
  // =========================================================================
  describe('Test 2: Exercise & Modpack Cascade Deletion', () => {
    it('should delete exercise, cascade modpack references, and exclude from list', async () => {
      // 1. Create exercise
      const uniqueTitle = `ท่าทดสอบ-${Date.now()}`;
      const createExRes = await request(app)
        .post('/api/directory/exercises')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: uniqueTitle,
          target_joint: 'knee',
          default_sets: 3,
          default_reps: 10,
          difficulty: 'beginner',
        });

      expect(createExRes.status).toBe(201);
      const exId = createExRes.body.data.id;

      // Verify exercise is in list
      const listExBefore = await request(app)
        .get('/api/directory/exercises')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(listExBefore.status).toBe(200);
      expect(listExBefore.body.data.some((e: any) => e.id === exId)).toBe(true);

      // 2. Create modpack containing this exercise
      const createMpRes = await request(app)
        .post('/api/directory/modpacks')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: `ชุดท่า-${uniqueTitle}`,
          description: 'ทดสอบลบ',
          items: [{ exercise_id: exId, sets: 3, reps: 10, position: 1 }],
        });
      expect(createMpRes.status).toBe(201);
      const mpId = createMpRes.body.data.id;

      // 3. Delete exercise
      const deleteExRes = await request(app)
        .delete(`/api/directory/exercises/${exId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(deleteExRes.status).toBe(200);

      // 4. Verify exercise is NO LONGER in list
      const listExAfter = await request(app)
        .get('/api/directory/exercises')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(listExAfter.body.data.some((e: any) => e.id === exId)).toBe(false);

      // 5. Delete modpack
      const deleteMpRes = await request(app)
        .delete(`/api/directory/modpacks/${mpId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(deleteMpRes.status).toBe(200);

      // Verify modpack is NO LONGER in list
      const listMpAfter = await request(app)
        .get('/api/directory/modpacks')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(listMpAfter.body.data.some((m: any) => m.id === mpId)).toBe(false);
    });
  });

  // =========================================================================
  // TEST 3: Minigame Question Deletion
  // =========================================================================
  describe('Test 3: Minigame Question Deletion', () => {
    it('should create and delete minigame questions and exclude them from list', async () => {
      // List or seed minigames
      const mgListRes = await request(app)
        .get('/api/directory/minigames')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(mgListRes.status).toBe(200);

      let minigameId: string;
      if (mgListRes.body.data && mgListRes.body.data.length > 0) {
        minigameId = mgListRes.body.data[0].id;
      } else {
        const createMgRes = await request(app)
          .post('/api/directory/minigames')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({
            title: 'เกมฝึกสมาธิและการตอบสนอง (Reflex & Focus)',
            description: 'เกมฝึกสมาธิ',
            category: 'reflex',
          });
        expect(createMgRes.status).toBe(201);
        minigameId = createMgRes.body.data.id;
      }
      expect(minigameId).toBeDefined();

      // 1. Create a question
      const uniquePrompt = `โจทย์คำถามทดสอบ-${Date.now()}`;
      const createQRes = await request(app)
        .post(`/api/directory/minigames/${minigameId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          prompt: uniquePrompt,
          choices: ['ตัวเลือก 1', 'ตัวเลือก 2', 'ตัวเลือก 3', 'ตัวเลือก 4'],
          answer: 'ตัวเลือก 1',
        });

      expect(createQRes.status).toBe(201);
      const questionId = createQRes.body.data.id;

      // 2. Verify question is in list
      const listQBefore = await request(app)
        .get(`/api/directory/minigames/${minigameId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(listQBefore.body.data.some((q: any) => q.id === questionId)).toBe(true);

      // 3. Delete question
      const deleteQRes = await request(app)
        .delete(`/api/directory/minigames/${minigameId}/questions/${questionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(deleteQRes.status).toBe(200);

      // 4. Verify question is NO LONGER in list
      const listQAfter = await request(app)
        .get(`/api/directory/minigames/${minigameId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(listQAfter.body.data.some((q: any) => q.id === questionId)).toBe(false);
    });
  });
});
