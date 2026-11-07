/**
 * apps/api/src/__tests__/continuous_face_verify.test.ts
 * Unit & Integration Tests for Continuous Face Verification During Dynamic Exercise
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as adminClientModule from '../lib/supabase/adminClient';
import { SmartOnboardingService } from '../modules/smart-onboarding/service';

describe('Continuous Face Verification Service & Identity Gatekeeper', () => {
  let mockSupabase: any;
  let mockVault: any;
  let service: SmartOnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };

    vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(mockSupabase);

    mockVault = {
      getPatientRecord: vi.fn(),
    };

    service = new SmartOnboardingService(mockVault as any);
  });

  it('1. Returns has_template: false when patient has no biometric face template', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });
    mockVault.getPatientRecord.mockReturnValue(null);

    const probe = Array(512).fill(0.1);
    const result = await service.continuousFaceVerify({
      patient_id: 'p-no-template',
      probe,
      session_id: 'sess-123',
      exercise_id: 'shoulder_flexion',
    });

    expect(result.has_template).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('no_face_enrolled');
  });

  it('2. Passes verification when cosine similarity is >= 0.50 (active exercise threshold)', async () => {
    const probe = Array(512).fill(1 / Math.sqrt(512));

    mockSupabase.rpc.mockResolvedValue({
      data: [{ candidate_id: 'p-100', score: 0.88 }],
      error: null,
    });

    const result = await service.continuousFaceVerify({
      patient_id: 'p-100',
      probe,
      session_id: 'sess-100',
    });

    expect(result.has_template).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.score).toBe(0.88);
  });

  it('3. Rejects verification (imposter/stranger) when cosine similarity < 0.50', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ candidate_id: 'p-100', score: 0.32 }],
      error: null,
    });

    const probe = Array(512).fill(1 / Math.sqrt(512));
    const result = await service.continuousFaceVerify({
      patient_id: 'p-100',
      probe,
    });

    expect(result.has_template).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.score).toBe(0.32);
  });

  it('4. Falls back to PatientVaultService template when Supabase RPC returns empty', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [],
      error: null,
    });

    const templateVec = Array(512).fill(0);
    templateVec[0] = 1; // unit vector along dimension 0

    mockVault.getPatientRecord.mockReturnValue({
      id: 'p-vault-fallback',
      biometrics: {
        face_vector: templateVec,
      },
    });

    const probe = Array(512).fill(0);
    probe[0] = 1; // perfectly matches dimension 0

    const result = await service.continuousFaceVerify({
      patient_id: 'p-vault-fallback',
      probe,
    });

    expect(result.has_template).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.score).toBeCloseTo(1.0, 2);
  });

  it('5. Audit log is written with event type without exposing raw probe vector', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ candidate_id: 'p-audit', score: 0.75 }],
      error: null,
    });

    const insertMock = vi.fn().mockReturnValue({ error: null });
    mockSupabase.from.mockReturnValue({ insert: insertMock });

    const probe = Array(512).fill(1 / Math.sqrt(512));
    await service.continuousFaceVerify({
      patient_id: 'p-audit',
      probe,
      session_id: 'sess-audit-1',
      exercise_id: 'cervical_retraction',
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('audit_logs');
    expect(insertMock).toHaveBeenCalled();
    const insertedPayload = insertMock.mock.calls[0][0];
    expect(insertedPayload.action).toBe('continuous_exercise_face_verify');
    expect(insertedPayload.status).toBe('success');
    expect(insertedPayload.details.verified).toBe(true);
    // Raw probe or vector MUST NOT be stored in audit logs
    expect(insertedPayload.details.probe).toBeUndefined();
    expect(insertedPayload.details.vector).toBeUndefined();
  });
});
