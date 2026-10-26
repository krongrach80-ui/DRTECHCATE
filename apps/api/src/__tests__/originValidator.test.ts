import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../lib/originValidator';

describe('[UNIT] Origin & CSRF Validator (Multi-Environment & Vercel Support)', () => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://drtechcarev2.vercel.app',
  ];

  it('allows exact configured origins', () => {
    expect(isAllowedOrigin('http://localhost:3000', allowedOrigins)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', allowedOrigins)).toBe(true);
    expect(isAllowedOrigin('https://drtechcarev2.vercel.app', allowedOrigins)).toBe(true);
  });

  it('allows the user preview URL on Vercel from screenshot', () => {
    expect(
      isAllowedOrigin('https://drtechcarev2-d784cq5kk-lym5.vercel.app', allowedOrigins)
    ).toBe(true);
  });

  it('allows any branch or deployment URL on Vercel for drtechcarev2', () => {
    expect(
      isAllowedOrigin('https://drtechcarev2-git-main-lym5.vercel.app', allowedOrigins)
    ).toBe(true);
    expect(
      isAllowedOrigin('https://drtechcarev2-preview.vercel.app', allowedOrigins)
    ).toBe(true);
  });

  it('allows same-origin requests matching request Host header', () => {
    expect(
      isAllowedOrigin(
        'https://my-hospital-domain.org',
        [],
        'my-hospital-domain.org'
      )
    ).toBe(true);
  });

  it('allows same-origin requests matching X-Forwarded-Host header', () => {
    expect(
      isAllowedOrigin(
        'https://clinic.internal',
        [],
        '10.0.0.1:3000',
        'clinic.internal'
      )
    ).toBe(true);
  });

  it('allows local dev loopbacks', () => {
    expect(isAllowedOrigin('http://localhost:8080', [])).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4173', [])).toBe(true);
  });

  it('strictly rejects malicious foreign cross-origins', () => {
    expect(isAllowedOrigin('http://evil-cross-origin.com', allowedOrigins)).toBe(false);
    expect(isAllowedOrigin('https://attacker.site', allowedOrigins)).toBe(false);
    expect(isAllowedOrigin('https://fake-drtechcarev2.com', allowedOrigins)).toBe(false);
    expect(isAllowedOrigin('https://otherproject.vercel.app', allowedOrigins)).toBe(false);
  });

  it('strictly rejects null, undefined, or empty origins', () => {
    expect(isAllowedOrigin(null, allowedOrigins)).toBe(false);
    expect(isAllowedOrigin(undefined, allowedOrigins)).toBe(false);
    expect(isAllowedOrigin('', allowedOrigins)).toBe(false);
  });
});
