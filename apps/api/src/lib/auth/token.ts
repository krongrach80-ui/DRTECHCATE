import crypto from 'crypto';
import { getEnv } from '../../config/env';

export interface StatelessTokenPayload {
  id: string;
  username?: string;
  role: string;
  full_name: string;
  status: string;
  iat: number;
  exp: number;
}

export const DEFAULT_AUTH_SECRET = 'drtechcare-production-stateless-jwt-secret-stable-2026';

export function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.JWT_SECRET ||
    DEFAULT_AUTH_SECRET
  );
}

/**
 * Creates a stateless HMAC-SHA256 signed JWT token.
 * Valid for 7 days.
 */
export function createStatelessToken(user: {
  id: string;
  username?: string;
  role: string;
  full_name: string;
  status?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: StatelessTokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    status: user.status || 'active',
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = getAuthSecret();

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies a stateless HMAC-SHA256 signed JWT token.
 * Returns decoded payload if valid and unexpired, else null.
 */
export function verifyStatelessToken(token: string): StatelessTokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const secret = getAuthSecret();

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    // Constant-time comparison
    if (
      signatureB64.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSig))
    ) {
      return null;
    }

    const payloadRaw = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadRaw) as StatelessTokenPayload;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      return null; // Expired
    }

    if (!payload.id || !payload.role) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
