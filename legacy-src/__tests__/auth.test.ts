import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimit, hashToken } from '@/lib/security/rate-limit';
import { isPathAllowedForRole, getRedirectPathForRole } from '@/lib/rbac/roles';
import { z } from 'zod';

describe('Rate Limiter & Security Utilities', () => {
  const testKey = 'test_ip_192_168_1_1';

  beforeEach(() => {
    resetRateLimit(testKey);
  });

  it('allows requests within max limits', () => {
    const res1 = checkRateLimit(testKey, 3, 10000, 20000);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = checkRateLimit(testKey, 3, 10000, 20000);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = checkRateLimit(testKey, 3, 10000, 20000);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('blocks and locks out when max attempts exceeded', () => {
    checkRateLimit(testKey, 2, 5000, 10000);
    checkRateLimit(testKey, 2, 5000, 10000);

    const blockedRes = checkRateLimit(testKey, 2, 5000, 10000);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.remaining).toBe(0);
    expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('correctly hashes tokens with SHA-256', () => {
    const token = 'kiosk-secret-device-key-12345';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // 64 hex chars for SHA-256
  });
});

describe('Phase 2 Authentication Validation', () => {
  const verifySchema = z.object({
    nonce: z.string().min(1),
    embedding: z.array(z.number()).length(128),
  });

  it('strictly validates 128-dimensional face embedding', () => {
    const validVector = Array(128).fill(0.123);
    const resultValid = verifySchema.safeParse({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      embedding: validVector,
    });
    expect(resultValid.success).toBe(true);

    const shortVector = Array(127).fill(0.123);
    const resultShort = verifySchema.safeParse({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      embedding: shortVector,
    });
    expect(resultShort.success).toBe(false);

    const longVector = Array(129).fill(0.123);
    const resultLong = verifySchema.safeParse({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      embedding: longVector,
    });
    expect(resultLong.success).toBe(false);
  });

  it('enforces RBAC isolation strictly across roles', () => {
    expect(isPathAllowedForRole('admin', '/admin')).toBe(true);
    expect(isPathAllowedForRole('admin', '/pt')).toBe(false);
    expect(isPathAllowedForRole('admin', '/me')).toBe(false);

    expect(isPathAllowedForRole('pt', '/pt')).toBe(true);
    expect(isPathAllowedForRole('pt', '/admin')).toBe(false);
    expect(isPathAllowedForRole('pt', '/me')).toBe(false);

    expect(isPathAllowedForRole('patient', '/me')).toBe(true);
    expect(isPathAllowedForRole('patient', '/admin')).toBe(false);
    expect(isPathAllowedForRole('patient', '/pt')).toBe(false);

    expect(getRedirectPathForRole('admin')).toBe('/admin');
    expect(getRedirectPathForRole('pt')).toBe('/pt');
    expect(getRedirectPathForRole('patient')).toBe('/me');
  });
});
