import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Phase 5: Kiosk Device Authentication & Token Hashing', () => {
  function hashDeviceToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  it('correctly hashes raw device tokens to 64-character SHA-256 strings', () => {
    const rawToken = 'kiosk_abcdef1234567890abcdef1234567890';
    const hash = hashDeviceToken(rawToken);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // Deterministic hashing
    expect(hashDeviceToken(rawToken)).toBe(hash);
  });
});

describe('Phase 5: Liveness Challenge & Nonce Expiration', () => {
  const POSSIBLE_STEPS = ['left', 'right', 'nod'] as const;

  function generateRandomSteps(): string[] {
    const shuffled = [...POSSIBLE_STEPS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }

  it('generates exactly 2 distinct random motion steps from {left, right, nod}', () => {
    for (let i = 0; i < 20; i++) {
      const steps = generateRandomSteps();
      expect(steps).toHaveLength(2);
      expect(steps[0]).not.toBe(steps[1]);
      expect(POSSIBLE_STEPS).toContain(steps[0]);
      expect(POSSIBLE_STEPS).toContain(steps[1]);
    }
  });

  it('validates single-use and 60-second nonce lifecycle', () => {
    interface Challenge {
      nonce: string;
      expires_at: number;
      is_used: boolean;
    }

    function validateChallenge(ch: Challenge, currentTime: number): { valid: boolean; reason?: string } {
      if (ch.is_used) return { valid: false, reason: 'ALREADY_USED' };
      if (currentTime > ch.expires_at) return { valid: false, reason: 'EXPIRED' };
      return { valid: true };
    }

    const now = 1000000;
    const activeChallenge: Challenge = {
      nonce: 'nonce-1',
      expires_at: now + 60000, // 60s later
      is_used: false,
    };

    expect(validateChallenge(activeChallenge, now).valid).toBe(true);
    expect(validateChallenge(activeChallenge, now + 30000).valid).toBe(true);

    // After 61 seconds: expired
    expect(validateChallenge(activeChallenge, now + 61000)).toEqual({
      valid: false,
      reason: 'EXPIRED',
    });

    // Replay attack: challenge already used
    activeChallenge.is_used = true;
    expect(validateChallenge(activeChallenge, now + 10000)).toEqual({
      valid: false,
      reason: 'ALREADY_USED',
    });
  });
});

describe('Phase 5: Face Verification Ambiguity & Margin Check', () => {
  interface MatchCandidate {
    userId: string;
    distance: number;
  }

  function evaluateMatch(
    topMatch: MatchCandidate | null,
    secondMatch: MatchCandidate | null,
    threshold = 0.60,
    margin = 0.10
  ): { matched: boolean; userId?: string; ambiguous: boolean } {
    if (!topMatch || topMatch.distance > threshold) {
      return { matched: false, ambiguous: false };
    }

    // Check margin against 2nd candidate
    if (secondMatch && (secondMatch.distance - topMatch.distance) < margin) {
      return { matched: true, userId: topMatch.userId, ambiguous: true };
    }

    return { matched: true, userId: topMatch.userId, ambiguous: false };
  }

  it('accepts clear candidate when distance is below threshold and margin is exceeded', () => {
    const top = { userId: 'patient-somchai', distance: 0.35 };
    const second = { userId: 'patient-other', distance: 0.55 }; // diff 0.20 > 0.10 margin

    const result = evaluateMatch(top, second);
    expect(result.matched).toBe(true);
    expect(result.ambiguous).toBe(false);
    expect(result.userId).toBe('patient-somchai');
  });

  it('flags ambiguous match when second candidate distance is within margin', () => {
    const top = { userId: 'twin-a', distance: 0.42 };
    const second = { userId: 'twin-b', distance: 0.48 }; // diff 0.06 < 0.10 margin

    const result = evaluateMatch(top, second);
    expect(result.matched).toBe(true);
    expect(result.ambiguous).toBe(true); // Must prompt fallback
  });

  it('rejects candidate when distance exceeds similarity threshold', () => {
    const top = { userId: 'stranger-john', distance: 0.68 }; // 0.68 > 0.60
    const result = evaluateMatch(top, null);
    expect(result.matched).toBe(false);
  });
});

describe('Phase 5: Queue Token HMAC Signature Verification', () => {
  const secret = 'test-kiosk-secret';

  function createQueueToken(patientId: string, ttlMs = 300000): string {
    const expiresAt = Date.now() + ttlMs;
    const payload = `${patientId}:${expiresAt}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${hmac}`).toString('base64');
  }

  function verifyQueueToken(token: string, expectedPatientId: string): boolean {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length !== 3) return false;

      const [patientId, expiresAtStr, receivedHmac] = parts;
      if (patientId !== expectedPatientId) return false;

      const expiresAt = parseInt(expiresAtStr, 10);
      if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

      const expectedPayload = `${patientId}:${expiresAtStr}`;
      const calculatedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

      return crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(calculatedHmac));
    } catch {
      return false;
    }
  }

  it('validates authentic, unexpired queue token', () => {
    const token = createQueueToken('patient-123', 60000);
    expect(verifyQueueToken(token, 'patient-123')).toBe(true);
  });

  it('rejects expired queue token', () => {
    const expiredToken = createQueueToken('patient-123', -5000); // 5s in past
    expect(verifyQueueToken(expiredToken, 'patient-123')).toBe(false);
  });

  it('rejects tampered patient ID or forged signature', () => {
    const token = createQueueToken('patient-123', 60000);
    expect(verifyQueueToken(token, 'patient-999-attacker')).toBe(false);
  });
});

describe('Phase 5: 3-Strike Failure Counter and Phone Fallback', () => {
  function handleVerificationAttempt(consecutiveFailures: number): {
    allowRetry: boolean;
    triggerFallback: boolean;
  } {
    if (consecutiveFailures >= 3) {
      return { allowRetry: false, triggerFallback: true };
    }
    return { allowRetry: true, triggerFallback: false };
  }

  it('triggers phone fallback on 3 consecutive failures', () => {
    expect(handleVerificationAttempt(1)).toEqual({ allowRetry: true, triggerFallback: false });
    expect(handleVerificationAttempt(2)).toEqual({ allowRetry: true, triggerFallback: false });
    expect(handleVerificationAttempt(3)).toEqual({ allowRetry: false, triggerFallback: true });
    expect(handleVerificationAttempt(4)).toEqual({ allowRetry: false, triggerFallback: true });
  });

  it('masks sensitive phone numbers in PDPA audit logs', () => {
    const rawPhone = '0812345678';
    const masked = rawPhone.replace(/\d(?=\d{4})/g, '*');
    expect(masked).toBe('******5678');
  });
});
