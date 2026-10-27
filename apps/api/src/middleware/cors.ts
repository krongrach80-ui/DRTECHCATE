import cors from 'cors';
import { getEnv } from '../config/env';
import { isAllowedOrigin } from '../lib/originValidator';

export function createCorsMiddleware() {
  const env = getEnv();
  const allowedOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl without Origin, mobile app)
      if (!origin) {
        return callback(null, true);
      }

      if (isAllowedOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }

      // Disallow: do NOT set Access-Control-Allow-Origin header
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-auth-token',
      'x-staff-role',
      'x-actor-id',
      'x-portal-token',
      'drtech_access_token',
    ],
  });
}
