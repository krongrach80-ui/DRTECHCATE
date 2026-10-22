import cors from 'cors';
import { getEnv } from '../config/env';

export function createCorsMiddleware() {
  const env = getEnv();
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, mobile/curl, or same-origin in some browsers)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });
}
