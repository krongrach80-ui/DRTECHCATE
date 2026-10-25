import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'pino';
import { httpLogger, createHttpLogger } from './middleware/logger';
import { createCorsMiddleware } from './middleware/cors';
import { banCheck } from './middleware/banCheck';
import { apiRateLimiter } from './middleware/rateLimit';
import { csrfGuard } from './middleware/csrfGuard';
import { errorHandler, AppError } from './middleware/errorHandler';
import { healthRoutes } from './modules/health/routes';
import { eventRoutes } from './modules/events/routes';
import { authRoutes, createAuthRouter } from './modules/auth/routes';
import { kioskRoutes } from './modules/kiosk/routes';
import { createSecurityRouter, securityRoutes } from './modules/security/routes';
import { AuthController } from './modules/auth/controller';
import { SecurityController } from './modules/security/controller';
import { auditRoutes, createAuditRouter } from './modules/audit/routes';
import { AuditController } from './modules/audit/controller';
import { staffRoutes } from './modules/staff/routes';
import { directoryRoutes } from './modules/directory/routes';
import { createPatientsRouter } from './modules/patients/routes';
import { createFaceRouter, FaceEnrollmentController } from './modules/face';
import { createCoursesRouter } from './modules/courses/routes';
import { createRecordsRouter } from './modules/records/routes';
import { smartOnboardingRoutes } from './modules/smart-onboarding/routes';
import { authenticate } from './middleware/authenticate';
import { getEnv } from './config/env';
import path from 'path';
import fs from 'fs';

export function createApp(
  customLogger?: Logger,
  authController?: AuthController,
  securityController?: SecurityController,
  auditController?: AuditController,
  faceEnrollmentController?: FaceEnrollmentController
): Express {
  const app: Express = express();
  const env = getEnv();

  // Configure trust proxy based on actual reverse proxy hop count (default 1 for Caddy/Nginx)
  // NEVER trusts arbitrary client-supplied X-Forwarded-For directly (Item H10)
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // 1. Security Headers (CSP compliant with 1b.6: connect-src 'self' only, STORAGE_HOST for signed URLs)
  let storageHost: string | undefined;
  try {
    const rawStorageHost = env.STORAGE_HOST;
    if (rawStorageHost) {
      storageHost = new URL(rawStorageHost).origin;
    }
  } catch {
    // Ignore invalid URL
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          workerSrc: ["'self'", 'blob:'],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:', ...(storageHost ? [storageHost] : [])],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self)');
    next();
  });

  // 2. Structured Request Logging (Pino, redacts PII and vectors)
  app.use(customLogger ? createHttpLogger(customLogger) : httpLogger);

  // 3. CORS with explicit origin allowlist
  app.use(createCorsMiddleware());

  // 4. Strict JSON body parser with 100kb payload limit for general API routes,
  // with 10mb limit for biometric enrollment endpoints (/api/face/enroll, /api/kiosk/enroll, /api/smart-onboarding/create-pending)
  app.use('/api/face/enroll', express.json({ limit: '10mb' }));
  app.use('/api/kiosk/enroll', express.json({ limit: '10mb' }));
  app.use('/api/smart-onboarding/create-pending', express.json({ limit: '10mb' }));
  app.use('/api/smart-onboarding/scan-login', express.json({ limit: '10mb' }));
  app.use('/api/smart-onboarding/exercises', express.json({ limit: '10mb' }));
  app.use(express.json({ limit: '100kb' }));

  // 5. Cookie Parser (for HttpOnly JWT / Kiosk device tokens)
  app.use(cookieParser());

  // 6. Security ban check (denies requests from banned IPs/devices)
  app.use(banCheck);

  // 7. General API Rate Limiter
  app.use('/api', apiRateLimiter);

  // 8. CSRF Guard for mutating methods (POST, PUT, PATCH, DELETE)
  app.use('/api', csrfGuard);

  // 9. Public / System routes
  app.use('/', healthRoutes);
  app.use('/api', healthRoutes);
  app.use('/api', eventRoutes);
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(path.join(uploadsDir, 'patients'))) {
    fs.mkdirSync(path.join(uploadsDir, 'patients'), { recursive: true });
  }
  if (!fs.existsSync(path.join(uploadsDir, 'exercises'))) {
    fs.mkdirSync(path.join(uploadsDir, 'exercises'), { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));
  app.use('/public/uploads', express.static(uploadsDir));
  app.use('/api/auth', authController ? createAuthRouter(authController) : authRoutes);
  app.use('/api/kiosk', kioskRoutes);
  app.use('/api/smart-onboarding', smartOnboardingRoutes);
  app.use(
    '/api/security',
    authController || securityController
      ? createSecurityRouter(authController, securityController)
      : securityRoutes
  );
  app.use('/api/audit', auditController ? createAuditRouter(auditController) : auditRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api', directoryRoutes);
  app.use('/api/patients', createPatientsRouter());
  app.use('/api/face', createFaceRouter(faceEnrollmentController));
  app.use('/api/courses', createCoursesRouter());
  app.use('/api', createRecordsRouter());
  app.get(['/me', '/api/me'], authenticate, (req: Request, res: Response) => {
    res.status(200).json({ ok: true, data: req.user });
  });

  // 10. 404 Route Not Found
  app.use((_req: Request, _res: Response, next) => {
    next(new AppError('Endpoint not found', 404, 'NOT_FOUND'));
  });

  // 11. Centralized Error Handler (Strict error masking)
  app.use(errorHandler);

  return app;
}
