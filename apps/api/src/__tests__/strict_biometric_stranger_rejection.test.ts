/**
 * apps/api/src/__tests__/strict_biometric_stranger_rejection.test.ts
 * Strict Biometric Threshold Guard & Zero-False-Positive Enrollment Verification
 * US NIST SP 800-63B + Clinical Smart Kiosk Compliance
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { defaultPatientVaultService } from '../modules/smart-onboarding/vault.service';
import {
  l2Normalize,
  cosineSimilarity,
  evaluateBiometricMatch,
  calibrateCosineSimilarity,
  PatientRecordFile,
} from '../../../../packages/smart-biometric-core/src/index.js';
import { purgeStaleBiometricVault } from '../lib/localStorage/localPersistenceEngine';
import { purgeStaleBiometricCache, CURRENT_BIOMETRIC_VAULT_VERSION, RESILIENT_PATIENTS_CACHE_KEY, BIOMETRIC_VAULT_VERSION_KEY } from '../../../../packages/face-client/src/cache';

describe('Strict Biometric Threshold Guard & Zero-False-Positive Verification', () => {
  const app = createApp();
  const testPatientId = `test-strict-guard-${Date.now()}`;
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'patients');

  // Helper to create unit-normalized 512-dim vector
  function createUnitVector(index: number): number[] {
    const vec = new Array(512).fill(0);
    vec[index % 512] = 1.0;
    return vec;
  }

  // Helper to create vector with specific target cosine similarity to baseVector
  function createVectorWithTargetCosine(baseVector: number[], targetCos: number): number[] {
    const normBase = l2Normalize(baseVector);
    // Find orthogonal vector
    const orth = new Array(512).fill(0);
    orth[(normBase.indexOf(Math.max(...normBase)) + 1) % 512] = 1.0;
    const normOrth = l2Normalize(orth);

    // targetCos * normBase + sqrt(1 - targetCos^2) * normOrth
    const res = new Array(512).fill(0);
    const weightOrth = Math.sqrt(Math.max(0, 1 - targetCos * targetCos));
    for (let i = 0; i < 512; i++) {
      res[i] = targetCos * normBase[i] + weightOrth * normOrth[i];
    }
    return l2Normalize(res);
  }

  function createTestVaultRecord(
    id: string,
    vector: number[],
    name: string = 'สมชาย ใจดี'
  ): PatientRecordFile {
    const [firstName, lastName] = name.split(' ');
    return {
      patient_id: id,
      hn: `HN-${id}`,
      first_name: firstName || 'สมชาย',
      last_name: lastName || 'ใจดี',
      age: 45,
      gender: 'male',
      registration_status: 'active',
      registered_via: 'smart_onboarding',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      biometrics: {
        face_vector: vector,
        registered_face_url: `/uploads/patients/${id}/profile_face.jpg`,
        confidence_score: 0.99,
        model_version: 'w600k_r50',
        enrolled_at: new Date().toISOString(),
      },
      daily_checklists: {},
      rehab_scores: [],
      clinical: { diagnosis: 'Frozen Shoulder', treatment_plan: '', progress_notes: [] },
    };
  }

  beforeEach(() => {
    // Register patient in vault
    const registeredVector = createUnitVector(10);
    defaultPatientVaultService.initPatientVault(
      testPatientId,
      createTestVaultRecord(testPatientId, registeredVector, 'Lym มั่นคง')
    );
  });

  afterEach(() => {
    try {
      const patientDir = path.join(uploadsDir, testPatientId);
      if (fs.existsSync(patientDir)) {
        fs.rmSync(patientDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. Strictly rejects stranger/unregistered face without matching or exposing any patient name (< 50%)', async () => {
    // Create stranger vector with raw cosine ~0.20 to registered patient
    const registeredVector = createUnitVector(10);
    const strangerVector = createVectorWithTargetCosine(registeredVector, 0.20);

    const rawCos = cosineSimilarity(strangerVector, registeredVector);
    expect(rawCos).toBeCloseTo(0.20, 2);

    const calPercent = Math.round(calibrateCosineSimilarity(rawCos) * 100);
    expect(calPercent).toBeLessThan(50);

    const res = await request(app)
      .post('/api/smart-onboarding/scan-login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ probe: strangerVector });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.matched).toBe(false);
    // CRITICAL: MUST NOT expose patient identity, candidate name or candidate HN
    expect(res.body.patient).toBeUndefined();
    expect(res.body.candidateName).toBeUndefined();
    expect(res.body.candidateHn).toBeUndefined();
    expect(res.body.requirePin).toBeFalsy();
    expect(res.body.similarityPercentage).toBeLessThan(50);
    expect(res.body.message).toContain('ไม่พบบัญชีในระบบ');
  });

  it('2. Flags ambiguous candidate (50% - 79%) and prompts for PIN confirmation without auto-matching', async () => {
    // Create borderline probe with raw cosine ~0.48 (which maps to ~63% similarity)
    const registeredVector = createUnitVector(10);
    const ambiguousVector = createVectorWithTargetCosine(registeredVector, 0.48);

    const rawCos = cosineSimilarity(ambiguousVector, registeredVector);
    expect(rawCos).toBeCloseTo(0.48, 2);

    const evalResult = evaluateBiometricMatch(ambiguousVector, registeredVector, { useCalibration: true });
    expect(evalResult.similarityPercentage).toBeGreaterThanOrEqual(50);
    expect(evalResult.similarityPercentage).toBeLessThan(80);
    expect(evalResult.isMatch).toBe(false);

    const res = await request(app)
      .post('/api/smart-onboarding/scan-login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ probe: ambiguousVector });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.matched).toBe(false);
    expect(res.body.requirePin).toBe(true);
    expect(res.body.candidateName).toContain('Lym');
    expect(res.body.candidateHn).toBe(`HN-${testPatientId}`);
    expect(res.body.similarityPercentage).toBeGreaterThanOrEqual(50);
    expect(res.body.similarityPercentage).toBeLessThan(80);
    expect(res.body.message).toContain('เพื่อความปลอดภัยของผู้ป่วย กรุณายืนยันตัวตนด้วยรหัส PIN 4 หลัก');
  });

  it('3. Successfully matches genuine patient face (>= 80% similarity with rawCos >= 0.55)', async () => {
    // Create genuine probe with raw cosine ~0.65 (maps to >= 84%)
    const registeredVector = createUnitVector(10);
    const genuineVector = createVectorWithTargetCosine(registeredVector, 0.65);

    const rawCos = cosineSimilarity(genuineVector, registeredVector);
    expect(rawCos).toBeCloseTo(0.65, 2);

    const evalResult = evaluateBiometricMatch(genuineVector, registeredVector, { useCalibration: true });
    expect(evalResult.similarityPercentage).toBeGreaterThanOrEqual(80);
    expect(evalResult.isMatch).toBe(true);

    const res = await request(app)
      .post('/api/smart-onboarding/scan-login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ probe: genuineVector });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.matched).toBe(true);
    expect(res.body.patient).toBeDefined();
    expect(res.body.patient.patient_id).toBe(testPatientId);
    expect(res.body.patient.first_name).toBe('Lym');
    expect(res.body.similarityPercentage).toBeGreaterThanOrEqual(80);
  });

  it('4. purgeStaleBiometricVault successfully purges ghost profiles and corrupt templates', () => {
    const result = purgeStaleBiometricVault();
    expect(result).toHaveProperty('purgedTemplates');
    expect(result).toHaveProperty('purgedPatients');
  });

  it('5. purgeStaleBiometricCache upgrades vault version and filters invalid profiles', () => {
    // Mock localStorage in node environment
    const storage = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, val: string) => { storage.set(key, val); },
      removeItem: (key: string) => { storage.delete(key); },
    };

    const originalWindow = (global as any).window;
    (global as any).window = { localStorage: mockLocalStorage };

    // Setup outdated cache with a ghost patient and a valid patient
    mockLocalStorage.setItem(BIOMETRIC_VAULT_VERSION_KEY, 'v1_legacy');
    mockLocalStorage.setItem(
      RESILIENT_PATIENTS_CACHE_KEY,
      JSON.stringify([
        { id: 'p-ghost', first_name: 'Ghost', last_name: 'Test', biometrics: {} },
        { id: 'p-valid', first_name: 'สมชาย', last_name: 'มั่นคง', biometrics: { face_vector: new Array(512).fill(0.1) } },
      ])
    );

    const purgeRes = purgeStaleBiometricCache();
    expect(purgeRes.vaultUpgraded).toBe(true);
    expect(purgeRes.purgedCount).toBe(1); // ghost was purged
    expect(purgeRes.remainingCount).toBe(1); // valid remained

    expect(mockLocalStorage.getItem(BIOMETRIC_VAULT_VERSION_KEY)).toBe(CURRENT_BIOMETRIC_VAULT_VERSION);

    // Restore window
    if (originalWindow) {
      (global as any).window = originalWindow;
    } else {
      delete (global as any).window;
    }
  });
});
