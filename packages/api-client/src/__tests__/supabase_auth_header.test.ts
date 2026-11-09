import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isValidSupabaseJwt,
  ApiClient,
  DEFAULT_SUPABASE_ANON_KEY,
} from '../index.js';

describe('Supabase REST Auth Header & JWT Sanitization', () => {
  it('should reject null, undefined, empty, or non-string tokens', () => {
    expect(isValidSupabaseJwt(null)).toBe(false);
    expect(isValidSupabaseJwt(undefined)).toBe(false);
    expect(isValidSupabaseJwt('')).toBe(false);
    expect(isValidSupabaseJwt('   ')).toBe(false);
  });

  it('should reject internal resilient fallback tokens', () => {
    const fallbackToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.drtechcare_resilient_signature';
    expect(isValidSupabaseJwt(fallbackToken)).toBe(false);
  });

  it('should reject prefixed non-JWT tokens (pat_, stf_, usr_)', () => {
    expect(isValidSupabaseJwt('pat_1234567890')).toBe(false);
    expect(isValidSupabaseJwt('stf_admin_abc')).toBe(false);
    expect(isValidSupabaseJwt('usr_pt_999')).toBe(false);
  });

  it('should reject malformed tokens with wrong segment count', () => {
    expect(isValidSupabaseJwt('header.payload')).toBe(false);
    expect(isValidSupabaseJwt('header.payload.signature.extra')).toBe(false);
    expect(isValidSupabaseJwt('not-a-jwt')).toBe(false);
  });

  it('should accept valid Supabase JWT structure with active expiration', () => {
    const validPayload = {
      sub: 'b1000000-0000-0000-0000-000000000003',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const b64Payload = Buffer.from(JSON.stringify(validPayload)).toString('base64');
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64Payload}.real_valid_signature_abc123`;
    expect(isValidSupabaseJwt(validToken)).toBe(true);
  });

  it('should reject expired JWT tokens', () => {
    const expiredPayload = {
      sub: 'b1000000-0000-0000-0000-000000000003',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    };
    const b64Payload = Buffer.from(JSON.stringify(expiredPayload)).toString('base64');
    const expiredToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64Payload}.valid_signature_abc123`;
    expect(isValidSupabaseJwt(expiredToken)).toBe(false);
  });

  it('ApiClient.getSupabaseAuthHeader should fallback to DEFAULT_SUPABASE_ANON_KEY when token is internal resilient fallback', () => {
    const client = new ApiClient();
    const fallbackToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.drtechcare_resilient_signature';
    client.setAuthToken(fallbackToken);

    const authHeader = client.getSupabaseAuthHeader();
    expect(authHeader).toBe(`Bearer ${DEFAULT_SUPABASE_ANON_KEY}`);
  });

  it('ApiClient.getSupabaseAuthHeader should use Bearer <token> when token is valid Supabase JWT', () => {
    const client = new ApiClient();
    const validPayload = {
      sub: 'b1000000-0000-0000-0000-000000000003',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 7200,
    };
    const b64Payload = Buffer.from(JSON.stringify(validPayload)).toString('base64');
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64Payload}.valid_supabase_signature`;
    client.setAuthToken(validToken);

    const authHeader = client.getSupabaseAuthHeader();
    expect(authHeader).toBe(`Bearer ${validToken}`);
  });
});
