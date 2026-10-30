import serverless from 'serverless-http';
import { createApp } from '../../apps/api/src/app';
import { getEnv } from '../../apps/api/src/config/env';

// 1. Enforce Serverless Runtime Flags & Supabase Fallback Credentials (outside tests)
if (!process.env.VITEST) {
  process.env.ALLOW_BEARER_IN_PROD = 'true';
  process.env.NETLIFY = 'true';
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mctegvnrvmglbibuuczi.supabase.co';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key-prod-safe-placeholder';
  process.env.KIOSK_PAIRING_SECRET = process.env.KIOSK_PAIRING_SECRET || 'kiosk-pairing-secret-prod-safe-16chars';
  process.env.TRUST_PROXY_HOPS = process.env.TRUST_PROXY_HOPS || '1';
  process.env.PAD_MODE = process.env.PAD_MODE || 'active_only';
  process.env.PAD_PROVIDER = process.env.PAD_PROVIDER || 'active_challenge_tracker';
}

let serverlessHandler: any = null;

async function getHandler() {
  if (!serverlessHandler) {
    const env = getEnv();
    if (env.USE_LOCAL_STORAGE) {
      try {
        const { activateLocalPersistenceEngine } = await import(
          '../../apps/api/src/lib/localStorage/localPersistenceEngine'
        );
        activateLocalPersistenceEngine();
      } catch {
        // Safe fallback
      }
    }
    const app = createApp();
    // Invariant: Do NOT set basePath: '/api' because Express routes in app.ts are already mounted at /api/*
    serverlessHandler = serverless(app);
  }
  return serverlessHandler;
}

export const handler = async (event: any, context: any) => {
  const origin = event.headers?.origin || event.headers?.Origin || '*';

  // 1. Fast Preflight CORS Handling
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-Requested-With, x-auth-token, x-staff-role, x-actor-id, x-portal-token, drtech_access_token',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  // 2. Comprehensive Path Normalization for Netlify Rewrites
  // Netlify rewrites /api/* to /.netlify/functions/api/:splat
  let requestPath = event.path || '';
  if (requestPath.includes('?')) {
    requestPath = requestPath.substring(0, requestPath.indexOf('?'));
  }

  if (requestPath.startsWith('/.netlify/functions/api')) {
    requestPath = requestPath.replace(/^\/\.netlify\/functions\/api/, '/api');
  }

  if (!requestPath.startsWith('/api') && requestPath !== '/') {
    requestPath = '/api' + (requestPath.startsWith('/') ? requestPath : '/' + requestPath);
  }

  // Set normalized path for serverless-http to route into Express
  event.path = requestPath;

  // Ensure client IP headers are present for rate limiter and audit logging
  event.headers = event.headers || {};
  event.headers['x-forwarded-for'] =
    event.headers['x-forwarded-for'] ||
    event.headers['X-Forwarded-For'] ||
    event.headers['client-ip'] ||
    event.requestContext?.identity?.sourceIp ||
    '127.0.0.1';

  try {
    const h = await getHandler();
    const response = await h(event, context);

    // Ensure CORS headers on all Netlify Lambda responses
    response.headers = response.headers || {};
    if (!response.headers['Access-Control-Allow-Origin'] && !response.headers['access-control-allow-origin']) {
      response.headers['Access-Control-Allow-Origin'] = origin;
      response.headers['Access-Control-Allow-Credentials'] = 'true';
    }

    return response;
  } catch (err: any) {
    console.error('[Netlify Function api] Unhandled invocation error:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        ok: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: err?.message || 'Netlify Function Internal Server Error',
        },
      }),
    };
  }
};

export default handler;
