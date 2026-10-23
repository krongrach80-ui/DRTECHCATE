import { describe, it, expect } from 'vitest';
import http from 'http';
import https from 'https';
import net from 'net';
import { blockedNetworkCalls, assertNoBlockedNetworkCalls, extractHostname } from '../../../../vitest.setup';
import { envSchema } from '../config/env';

describe('[UNIT] DrTech.Care F1 & Item H7: Network Guard Invariant Suite', () => {
  it('F1.1: Outgoing fetch to external host (https://example.com) is trapped and recorded in central audit list', async () => {
    let caughtError: Error | null = null;
    try {
      await fetch('https://example.com/api/test');
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain('[SECURITY GUARD]');
    expect(caughtError?.message).toContain('example.com');

    // Recorded in central audit list
    expect(blockedNetworkCalls.length).toBe(1);
    expect(blockedNetworkCalls[0].host).toBe('example.com');
    expect(blockedNetworkCalls[0].type).toBe('fetch');

    // Prove that assertNoBlockedNetworkCalls() throws violation
    expect(() => assertNoBlockedNetworkCalls()).toThrow(
      /\[SECURITY GUARD INVARIANT VIOLATION\] Detected 1 unauthorized outgoing network call/
    );

    blockedNetworkCalls.length = 0;
  });

  it('F1.2: Host separation correctly parses IPv6 using new URL(...).hostname', () => {
    expect(extractHostname('http://[::1]:54321/api')).toBe('::1');
    expect(extractHostname('https://[2001:db8::1]:8080')).toBe('2001:db8::1');
    expect(extractHostname('http://127.0.0.1:4000')).toBe('127.0.0.1');
    expect(extractHostname('http://localhost:3000')).toBe('localhost');
  });

  it('F1.3: Loopback requests (127.0.0.1 and IPv6 [::1]) are permitted without recording violations', async () => {
    expect(blockedNetworkCalls.length).toBe(0);
    expect(() => assertNoBlockedNetworkCalls()).not.toThrow();
  });

  it('H7.1 [NEGATIVE TEST]: Outgoing http.get to external host is trapped', () => {
    let caught: Error | null = null;
    try {
      http.get('http://malicious-external-host.com/data');
    } catch (err: any) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain('[SECURITY GUARD]');
    expect(caught?.message).toContain('malicious-external-host.com');
    expect(blockedNetworkCalls.some((c) => c.type === 'http.get' && c.host === 'malicious-external-host.com')).toBe(true);

    blockedNetworkCalls.length = 0;
  });

  it('H7.2 [NEGATIVE TEST]: Outgoing https.get to external host is trapped', () => {
    let caught: Error | null = null;
    try {
      https.get('https://malicious-secure-host.org/telemetry');
    } catch (err: any) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain('[SECURITY GUARD]');
    expect(caught?.message).toContain('malicious-secure-host.org');
    expect(blockedNetworkCalls.some((c) => c.type === 'https.get' && c.host === 'malicious-secure-host.org')).toBe(true);

    blockedNetworkCalls.length = 0;
  });

  it('H7.3 [NEGATIVE TEST]: Outgoing net.connect to external IP is trapped at TCP socket level', () => {
    let caught: Error | null = null;
    try {
      net.connect({ host: '93.184.216.34', port: 80 });
    } catch (err: any) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain('[SECURITY GUARD]');
    expect(caught?.message).toContain('93.184.216.34');
    expect(blockedNetworkCalls.some((c) => c.type === 'net.connect' && c.host === '93.184.216.34')).toBe(true);

    blockedNetworkCalls.length = 0;
  });

  it('H7.4 [NEGATIVE TEST]: env validation fails closed in test mode when SUPABASE_URL is not 127.0.0.1 / localhost', () => {
    const invalidTestEnv = {
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://mctegvnrvmglbibuuczi.supabase.co', // Non-local URL in test mode
      SUPABASE_ANON_KEY: 'test-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      KIOSK_PAIRING_SECRET: 'test-kiosk-pairing-hmac-secret-min-16-chars',
      FACE_T_ACCEPT: 0.70,
      FACE_T_REJECT: 0.50,
      FACE_T_MARGIN: 0.08,
      FACE_T_ENROLL_CONSISTENCY: 0.75,
      FACE_T_DUPLICATE: 0.85,
      FACE_MIN_IOD: 60,
      PAD_MODE: 'active_only',
      PAD_PROVIDER: 'active_challenge_tracker',
      TRUST_PROXY_HOPS: 1,
    };

    const result = envSchema.safeParse(invalidTestEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      const supabaseIssue = result.error.issues.find((i) => i.path.includes('SUPABASE_URL'));
      expect(supabaseIssue).toBeDefined();
      expect(supabaseIssue?.message).toContain('In test mode, SUPABASE_URL must strictly point to 127.0.0.1 loopback');
    }
  });
});
