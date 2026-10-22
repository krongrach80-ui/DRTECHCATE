import crypto from 'crypto';

interface RateLimitRecord {
  count: number;
  resetAt: number;
  lockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * In-memory sliding window rate limiter
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 60000, // 1 minute
  lockoutMs: number = 300000 // 5 minutes lockout if exceeded
): { allowed: boolean; remaining: number; lockedUntil?: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  // If locked out
  if (record && record.lockedUntil && record.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      lockedUntil: record.lockedUntil,
      retryAfterSeconds,
    };
  }

  // If new or expired window
  if (!record || record.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
    };
  }

  // Window is active
  if (record.count >= maxAttempts) {
    record.lockedUntil = now + lockoutMs;
    const retryAfterSeconds = Math.ceil(lockoutMs / 1000);
    return {
      allowed: false,
      remaining: 0,
      lockedUntil: record.lockedUntil,
      retryAfterSeconds,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxAttempts - record.count,
  };
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Hash utility for tokens (e.g., Kiosk device token)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Clean up expired rate limit records periodically
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetAt <= now && (!record.lockedUntil || record.lockedUntil <= now)) {
        rateLimitStore.delete(key);
      }
    }
  }, 120000); // Clean every 2 minutes
}
