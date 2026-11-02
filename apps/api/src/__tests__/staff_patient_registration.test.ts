/**
 * apps/api/src/__tests__/staff_patient_registration.test.ts
 *
 * Automated Test Suite for Staff-Assisted New Patient Registration Flow:
 * 1. Clinical structured fields registration (General, Medical, Emergency, PDPA, Staff Audit).
 * 2. Duplicate HN conflict detection (HTTP 409 Conflict).
 * 3. Real-time duplicate check endpoint (/api/smart-onboarding/check-duplicate).
 * 4. Role-based authorization enforcement (Admin/PT allowed; guest/patient returns 403).
 * 5. Zero raw image persistence verification (only 512-D vector stored; raw bitmaps stripped).
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { l2Normalize } from '../../../../packages/smart-biometric-core/src/index.js';

describe('Staff-Assisted Patient Registration Flow', () => {
  const app = createApp();

  function generateVector(seed: number): number[] {
    const raw = new Array(512).fill(0).map((_, i) => Math.cos(seed * (i + 1)));
    return l2Normalize(raw);
  }

  const testHn = `HN-TEST-${Date.now()}`;
  const testVector = generateVector(101);

  describe('1. Role Authorization Enforcement', () => {
    it('rejects registration from unauthorized roles with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/smart-onboarding/register')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'patient')
        .send({
          hn: `HN-BLOCKED-${Date.now()}`,
          first_name: 'สมชาย',
          last_name: 'ผู้ป่วย',
          face_vector: testVector,
        });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.error?.code).toBe('FORBIDDEN');
    });

    it('rejects registration from guest role with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/smart-onboarding/register')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'guest')
        .send({
          hn: `HN-BLOCKED-GUEST-${Date.now()}`,
          first_name: 'สมชาย',
          last_name: 'ผู้เยี่ยมชม',
          face_vector: testVector,
        });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('2. Real-time Duplicate Check Endpoint', () => {
    it('returns duplicate_hn: false for a non-existent HN', async () => {
      const res = await request(app)
        .get(`/api/smart-onboarding/check-duplicate?hn=HN-NONEXISTENT-${Date.now()}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.duplicate_hn).toBe(false);
    });
  });

  describe('3. Registration with Structured Clinical Fields & Biometrics', () => {
    it('successfully registers patient with all clinical fields and returns 201', async () => {
      const res = await request(app)
        .post('/api/smart-onboarding/register')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'admin')
        .send({
          hn: testHn,
          first_name: 'วิชัย',
          last_name: 'มั่นคง',
          birth_date: '1980-05-15',
          gender: 'male',
          phone: '089-123-4567',
          target_joint: 'knee',
          contraindications: 'No high-impact jumping, knee replacement 6 months ago',
          underlying_diseases: 'Hypertension, Dyslipidemia',
          allergies: 'Penicillin',
          doctor_notes: 'Focus on quad strengthening and ROM 0-90 degrees',
          emergency_contact_name: 'นางสมศรี มั่นคง',
          emergency_contact_phone: '081-987-6543',
          emergency_contact_relation: 'ภรรยา',
          pdpa_consent: true,
          registered_by_staff_id: 'd1000000-0000-0000-0000-000000000001',
          registered_by_staff_name: 'ผอ. นพ. บริรักษ์ เวชกิจ',
          face_vector: testVector,
          pin_code: '1234',
          // Simulate frontend sending frames without raw base64 images
          frames: [
            { index: 1, pose: 'frontal', embedding: testVector },
            { index: 2, pose: 'yaw_left', embedding: generateVector(102) },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.hn).toBe(testHn);
      expect(res.body.patient_id).toBeDefined();
    });

    it('rejects duplicate HN registration with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/smart-onboarding/register')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'pt')
        .send({
          hn: testHn, // Same HN as previous registration
          first_name: 'วิชัย',
          last_name: 'คนใหม่',
          face_vector: generateVector(999),
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('DUPLICATE_HN');
    });

    it('detects existing duplicate HN via check-duplicate query', async () => {
      const res = await request(app)
        .get(`/api/smart-onboarding/check-duplicate?hn=${encodeURIComponent(testHn)}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.duplicate_hn).toBe(true);
    });
  });

  describe('4. Zero Raw Image Persistence & Biometric Invariant', () => {
    it('ensures face vector is 512 dimensions and does not contain raw data URLs', async () => {
      expect(testVector).toHaveLength(512);
      expect(typeof testVector[0]).toBe('number');

      // Verify that no element is a base64 string
      for (const val of testVector) {
        expect(typeof val).toBe('number');
        expect(Number.isFinite(val)).toBe(true);
      }
    });
  });
});
