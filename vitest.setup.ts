import http from 'http';
import https from 'https';
import net from 'net';
import { beforeEach, afterEach, afterAll } from 'vitest';

// 1. Force environment variables strictly to 127.0.0.1 loopback for tests (Item H7)
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key-strictly-isolated-127-0-0-1';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key-strictly-isolated-127-0-0-1';
process.env.INTERNAL_EMAIL_DOMAIN = 'clinic.internal';
process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173';
process.env.FACE_T_ACCEPT = '0.70';
process.env.FACE_T_REJECT = '0.50';
process.env.FACE_T_MARGIN = '0.08';
process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
process.env.FACE_T_DUPLICATE = '0.85';
process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
process.env.KIOSK_PAIRING_SECRET = 'test-kiosk-pairing-hmac-secret-min-16-chars';
process.env.FACE_MIN_IOD = '60';
process.env.TRUST_PROXY_HOPS = '1';
process.env.PAD_MODE = 'active_only';
process.env.PAD_PROVIDER = 'active_challenge_tracker';
process.env.HOSPITAL_IPS = '127.0.0.1,::1,localhost,10.0.0.1';

// Provide WebSocket fallback for Node test environments when @supabase/realtime-js initializes
if (typeof (globalThis as any).WebSocket === 'undefined') {
  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readyState = 3;
    onopen: any = null;
    onclose: any = null;
    onmessage: any = null;
    onerror: any = null;
    constructor(_url?: string) {}
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  }
  (globalThis as any).WebSocket = MockWebSocket;
}

import { setupTestAuthFixture } from './apps/api/src/__tests__/fixtures/authFixture';
import { setupTestFakeRepositories } from './apps/api/src/__tests__/fixtures/fakeRepositories';

// Global audit list of attempted non-local network calls
export const blockedNetworkCalls: Array<{ type: string; url: string; host: string }> = [];

beforeEach(() => {
  blockedNetworkCalls.length = 0;
  setupTestAuthFixture();
  setupTestFakeRepositories();
});

export function assertNoBlockedNetworkCalls(): void {
  if (blockedNetworkCalls.length > 0) {
    const calls = [...blockedNetworkCalls];
    blockedNetworkCalls.length = 0;
    throw new Error(
      `[SECURITY GUARD INVARIANT VIOLATION] Detected ${calls.length} unauthorized outgoing network call(s) outside 127.0.0.1: ${JSON.stringify(calls)}`
    );
  }
}

// Item F1: Assert that no unauthorized non-local network calls were recorded,
// even if a repository caught the error and converted it to HTTP 503.
afterEach(() => {
  assertNoBlockedNetworkCalls();
});

// 2. Network Guard: Trap any outgoing network calls that leave 127.0.0.1 / localhost
const originalFetch = globalThis.fetch;
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;
const originalNetConnect = net.connect;
const originalSocketConnect = net.Socket.prototype.connect;

export function extractHostname(input: string | URL | undefined): string {
  if (!input) return '';
  try {
    if (input instanceof URL) {
      return input.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    }
    const str = String(input);
    const hasScheme = str.startsWith('http://') || str.startsWith('https://');
    const urlStr = hasScheme ? str : `http://${str}`;
    try {
      return new URL(urlStr).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    } catch {
      if (str.includes(':') && !str.includes('[')) {
        return new URL(`http://[${str}]`).hostname.toLowerCase().replace(/^\[|\]$/g, '');
      }
      throw new Error('Invalid URL');
    }
  } catch {
    return String(input).split(':')[0].toLowerCase().replace(/^\[|\]$/g, '');
  }
}

function isAllowedHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const cleanHost = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    cleanHost === '127.0.0.1' ||
    cleanHost === 'localhost' ||
    cleanHost === '::1' ||
    cleanHost === '0.0.0.0' ||
    cleanHost === ''
  );
}

// Monkey-patch global fetch
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let urlStr = '';
  if (typeof input === 'string') {
    urlStr = input;
  } else if (input instanceof URL) {
    urlStr = input.toString();
  } else if (typeof input === 'object' && 'url' in input) {
    urlStr = (input as Request).url;
  }

  const hostname = extractHostname(urlStr);
  if (!isAllowedHost(hostname)) {
    const errorMsg = `[SECURITY GUARD] Outgoing network fetch to non-local host '${hostname}' blocked in unit tests! Target: ${urlStr}`;
    blockedNetworkCalls.push({ type: 'fetch', url: urlStr, host: hostname });
    throw new Error(errorMsg);
  }

  return originalFetch(input, init);
};

// Monkey-patch http.request
http.request = function (options: any, callback?: any) {
  let hostname = '';
  if (typeof options === 'string' || options instanceof URL) {
    hostname = extractHostname(options);
  } else if (options && typeof options === 'object') {
    hostname = extractHostname(options.hostname || options.host || '');
  }

  if (!isAllowedHost(hostname)) {
    const errorMsg = `[SECURITY GUARD] Outgoing HTTP request to non-local host '${hostname}' blocked in unit tests!`;
    blockedNetworkCalls.push({ type: 'http.request', url: String(options), host: hostname });
    throw new Error(errorMsg);
  }

  return originalHttpRequest.call(http, options, callback);
} as typeof http.request;

// Monkey-patch https.request
https.request = function (options: any, callback?: any) {
  let hostname = '';
  if (typeof options === 'string' || options instanceof URL) {
    hostname = extractHostname(options);
  } else if (options && typeof options === 'object') {
    hostname = extractHostname(options.hostname || options.host || '');
  }

  if (!isAllowedHost(hostname)) {
    const errorMsg = `[SECURITY GUARD] Outgoing HTTPS request to non-local host '${hostname}' blocked in unit tests!`;
    blockedNetworkCalls.push({ type: 'https.request', url: String(options), host: hostname });
    throw new Error(errorMsg);
  }

  return originalHttpsRequest.call(https, options, callback);
} as typeof https.request;

// Monkey-patch http.get (Item H7)
http.get = function (...args: any[]) {
  const options = args[0];
  let hostname = '';
  if (typeof options === 'string' || options instanceof URL) {
    hostname = extractHostname(options);
  } else if (options && typeof options === 'object') {
    hostname = extractHostname(options.hostname || options.host || '');
  }

  if (!isAllowedHost(hostname)) {
    const errorMsg = `[SECURITY GUARD] Outgoing http.get to non-local host '${hostname}' blocked in unit tests!`;
    blockedNetworkCalls.push({ type: 'http.get', url: String(options), host: hostname });
    throw new Error(errorMsg);
  }

  return originalHttpGet.apply(http, args as any);
} as typeof http.get;

// Monkey-patch https.get (Item H7)
https.get = function (...args: any[]) {
  const options = args[0];
  let hostname = '';
  if (typeof options === 'string' || options instanceof URL) {
    hostname = extractHostname(options);
  } else if (options && typeof options === 'object') {
    hostname = extractHostname(options.hostname || options.host || '');
  }

  if (!isAllowedHost(hostname)) {
    const errorMsg = `[SECURITY GUARD] Outgoing https.get to non-local host '${hostname}' blocked in unit tests!`;
    blockedNetworkCalls.push({ type: 'https.get', url: String(options), host: hostname });
    throw new Error(errorMsg);
  }

  return originalHttpsGet.apply(https, args as any);
} as typeof https.get;

// Monkey-patch net.connect (Item H7)
(net as any).connect = function (...args: any[]) {
  const options = typeof args[0] === 'object' ? args[0] : { port: args[0], host: args[1] };
  const hostname = extractHostname(options?.host || options?.hostname || 'localhost');
  if (!isAllowedHost(hostname)) {
    const errorMsg = `[SECURITY GUARD] Outgoing net.connect to non-local host '${hostname}' blocked in unit tests!`;
    blockedNetworkCalls.push({ type: 'net.connect', url: `${hostname}:${options?.port || 0}`, host: hostname });
    throw new Error(errorMsg);
  }
  return originalNetConnect.apply(net, args as any);
};

// Monkey-patch net.Socket.prototype.connect (Item H7)
net.Socket.prototype.connect = function (...args: any[]) {
  const options = typeof args[0] === 'object' ? args[0] : { port: args[0], host: args[1] };
  const hostname = extractHostname(options?.host || options?.hostname || 'localhost');
  if (!isAllowedHost(hostname)) {
    const errorMsg = `[SECURITY GUARD] Outgoing Socket.connect to non-local host '${hostname}' blocked in unit tests!`;
    blockedNetworkCalls.push({ type: 'net.Socket.connect', url: `${hostname}:${options?.port || 0}`, host: hostname });
    throw new Error(errorMsg);
  }
  return originalSocketConnect.apply(this, args as any);
};

afterAll(() => {
  globalThis.fetch = originalFetch;
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;
  net.connect = originalNetConnect;
  net.Socket.prototype.connect = originalSocketConnect;
});
