import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { addBannedIp, removeBannedIp } from '../middleware/banCheck';
import { createLogger } from '../middleware/logger';
import { Writable } from 'stream';
import { Express } from 'express';

describe('DrTech.Care Express API Core — Security & Error Masking Test Suite', () => {
  let app: Express;

  beforeAll(() => {
    // Ensure test environment variables are active
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.FACE_T_ACCEPT = '0.60';
    process.env.FACE_T_REJECT = '0.45';
    process.env.FACE_T_MARGIN = '0.10';
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
    process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173';

    app = createApp();
  });

  describe('1. Security Headers (Helmet Verification)', () => {
    it('should include all required Helmet security headers', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);

      // 1. MIME-sniffing protection
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      // 2. Clickjacking frame protection
      expect(res.headers['x-frame-options']).toMatch(/SAMEORIGIN|DENY/i);

      // 3. Strict Transport Security (HSTS)
      expect(res.headers['strict-transport-security']).toBeDefined();

      // 4. Content Security Policy (CSP)
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");

      // 5. Download & Domain policies
      expect(res.headers['x-download-options']).toBe('noopen');
      expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');

      // 6. X-Powered-By MUST be stripped to prevent technology fingerprinting
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('2. CORS Allowlist & Origin Enforcement', () => {
    it('should allow requests from whitelisted origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should reject requests from unauthorized foreign origins with 403', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-attacker.com');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: {
          code: 'CORS_REJECTED',
          message: 'Origin not allowed',
        },
      });
    });
  });

  describe('3. Strict Payload Size Limiting (100kb Body Protection)', () => {
    it('should accept payloads within the 100kb limit', async () => {
      const payload = { data: 'a'.repeat(1024) }; // ~1KB payload
      const res = await request(app)
        .post('/api/test-echo')
        .set('Origin', 'http://localhost:3000')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.received).toEqual(payload);
    });

    it('should reject payloads exceeding 100kb with 413 Payload Too Large', async () => {
      const oversizedPayload = { data: 'a'.repeat(110 * 1024) }; // ~110KB payload (>100kb)
      const res = await request(app)
        .post('/api/test-echo')
        .set('Origin', 'http://localhost:3000')
        .send(oversizedPayload);

      expect(res.status).toBe(413);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(res.body.error.message).toContain('100kb limit');
    });
  });

  describe('4. Error Masking & Sensitive Data Protection (Zero-Leakage)', () => {
    it('should format operational AppErrors in standard { error: { code, message } } format', async () => {
      const res = await request(app)
        .post('/api/test-error')
        .set('Origin', 'http://localhost:3000')
        .send({ type: 'app' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: 'CUSTOM_BAD_REQUEST',
          message: 'Custom operational failure',
        },
      });
      // Ensure stack trace is NEVER leaked
      expect(res.body.stack).toBeUndefined();
    });

    it('should securely MASK internal database crashes and NEVER leak SQL/stack/PII to client', async () => {
      const res = await request(app)
        .post('/api/test-error')
        .set('Origin', 'http://localhost:3000')
        .send({ type: 'db' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.error.message).toBe('An unexpected internal error occurred');
      expect(res.body.error.ref).toBeDefined(); // Tracking reference ID present

      // CRITICAL LEAKAGE ASSERTIONS:
      const bodyString = JSON.stringify(res.body);
      expect(bodyString).not.toContain('secret_passwords');
      expect(bodyString).not.toContain('syntax error at or near');
      expect(bodyString).not.toContain('stack');
      expect(bodyString).not.toContain('Error:');
    });

    it('should safely handle malformed JSON syntax errors with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/test-echo')
        .set('Content-Type', 'application/json')
        .set('Origin', 'http://localhost:3000')
        .send('{"invalid_json": true, missing_closing_bracket');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: 'BAD_REQUEST',
          message: 'Malformed JSON payload',
        },
      });
    });

    it('should return 404 with standard error format for undefined routes', async () => {
      const res = await request(app).get('/api/non-existent-route-404');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
        },
      });
    });
  });

  describe('5. CSRF Guard: Mutating Methods Protection (POST, PUT, PATCH, DELETE)', () => {
    const mutatingMethods = ['post', 'put', 'patch', 'delete'] as const;

    mutatingMethods.forEach((method) => {
      it(`[${method.toUpperCase()}] should block mutating requests missing both Origin and X-Requested-With`, async () => {
        const res = await (request(app)[method])('/api/test-csrf');

        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          error: {
            code: 'CSRF_REJECTED',
            message: 'Missing CSRF verification header (X-Requested-With required when Origin is omitted)',
          },
        });
      });

      it(`[${method.toUpperCase()}] should block mutating requests with an unauthorized foreign Origin`, async () => {
        const res = await (request(app)[method])('/api/test-csrf')
          .set('Origin', 'http://evil-cross-origin.com');

        expect(res.status).toBe(403);
        expect(['CSRF_REJECTED', 'CORS_REJECTED']).toContain(res.body.error.code);
      });

      it(`[${method.toUpperCase()}] should block mutating requests with an unauthorized foreign Referer`, async () => {
        const res = await (request(app)[method])('/api/test-csrf')
          .set('Referer', 'http://evil-cross-origin.com/attack');

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('CSRF_REJECTED');
      });

      it(`[${method.toUpperCase()}] should allow mutating requests with valid Origin`, async () => {
        const res = await (request(app)[method])('/api/test-csrf')
          .set('Origin', 'http://localhost:3000');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      });

      it(`[${method.toUpperCase()}] should allow mutating requests with X-Requested-With header (API/AJAX clients)`, async () => {
        const res = await (request(app)[method])('/api/test-csrf')
          .set('X-Requested-With', 'XMLHttpRequest');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      });
    });
  });

  describe('6. Rate Limiting: Quota Exceeded Enforcement', () => {
    it('should return 429 RATE_LIMIT_EXCEEDED when quota is exhausted', async () => {
      // Endpoint /api/test-tight-rate-limit has max quota of 5 requests
      for (let i = 1; i <= 5; i++) {
        const res = await request(app).get('/api/test-tight-rate-limit');
        expect(res.status).toBe(200);
        expect(Number(res.headers['ratelimit-remaining'])).toBe(5 - i);
      }

      // 6th request exceeds quota -> MUST return 429
      const overLimitRes = await request(app).get('/api/test-tight-rate-limit');
      expect(overLimitRes.status).toBe(429);
      expect(overLimitRes.body).toEqual({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
      });
    });
  });

  describe('7. Logger PII, Token & Biometrics Redaction', () => {
    it('should strictly redact password, token, and embeddings in logger output', () => {
      let loggedChunks = '';
      const customStream = new Writable({
        write(chunk, _encoding, callback) {
          loggedChunks += chunk.toString();
          callback();
        },
      });

      const testLogger = createLogger(customStream, 'info');

      // Log simulated request containing highly sensitive credentials and biometric vectors
      testLogger.info({
        req: {
          headers: {
            authorization: 'Bearer secret-jwt-token-abcdef123456',
            cookie: 'access_token=cookie-secret-token-789',
          },
          body: {
            password: 'super-secret-password-xyz',
            token: 'refresh-token-value-999',
            embedding: [0.1234567, 0.9876543, 0.456789],
            vector: [0.555, 0.666],
          },
        },
        msg: 'User authentication and biometric check',
      });

      // Assert that sensitive values are COMPLETELY censored
      expect(loggedChunks).toContain('[REDACTED]');
      expect(loggedChunks).not.toContain('secret-jwt-token-abcdef123456');
      expect(loggedChunks).not.toContain('cookie-secret-token-789');
      expect(loggedChunks).not.toContain('super-secret-password-xyz');
      expect(loggedChunks).not.toContain('refresh-token-value-999');
      expect(loggedChunks).not.toContain('0.1234567');
      expect(loggedChunks).not.toContain('0.9876543');
      expect(loggedChunks).not.toContain('0.555');
    });
  });

  describe('8. Trust Proxy Security & Spoofing Resistance', () => {
    it('spoofed X-Forwarded-For must NOT allow banned clients to bypass banCheck', async () => {
      // Mock ban on localhost client socket IP
      const localIp = '::ffff:127.0.0.1';
      addBannedIp(localIp);
      addBannedIp('127.0.0.1');

      try {
        // Attacker attempts to forge X-Forwarded-For header to look like a clean IP
        const res = await request(app)
          .get('/api/health')
          .set('X-Forwarded-For', '203.0.113.195');

        // Because trust proxy is disabled, Express relies on real socket address
        // The attacker remains BANNED (403)
        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access restricted by administrator',
          },
        });
      } finally {
        removeBannedIp(localIp);
        removeBannedIp('127.0.0.1');
      }
    });

    it('spoofed X-Forwarded-For rotation must NOT allow clients to evade rate limiting', async () => {
      // Create fresh app to test rate limit spoofing
      const freshApp = createApp();

      // Attacker fires 5 requests, rotating fake X-Forwarded-For on each request
      for (let i = 1; i <= 5; i++) {
        const res = await request(freshApp)
          .get('/api/test-tight-rate-limit')
          .set('X-Forwarded-For', `198.51.100.${i}`);
        expect(res.status).toBe(200);
      }

      // 6th request with yet another fake IP
      const overLimitRes = await request(freshApp)
        .get('/api/test-tight-rate-limit')
        .set('X-Forwarded-For', '198.51.100.99');

      // Must STILL be rejected with 429 because trust proxy is disabled
      expect(overLimitRes.status).toBe(429);
      expect(overLimitRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('9. Health Endpoint Contract', () => {
    it('GET /api/health should return complete system health status', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('drtechcare-api');
      expect(res.body.version).toBe('0.1.0');
      expect(typeof res.body.uptime).toBe('number');
      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('10. Fail-Fast Environment Validation', () => {
    it('should throw an error and refuse to start if required FACE_T_* or Supabase env is missing', async () => {
      const { parseEnv } = await import('../config/env');

      // 1. Missing FACE_T_ACCEPT
      expect(() => {
        parseEnv({
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
          // FACE_T_ACCEPT is missing
        });
      }).toThrow(/Environment validation failed/);

      // 2. Missing SUPABASE_URL
      expect(() => {
        parseEnv({
          FACE_T_ACCEPT: 0.60,
          FACE_T_REJECT: 0.45,
          FACE_T_MARGIN: 0.10,
          FACE_CHALLENGE_EXPIRE_SECONDS: 60,
          // SUPABASE_URL is missing
        });
      }).toThrow(/Environment validation failed/);
    });
  });
});
