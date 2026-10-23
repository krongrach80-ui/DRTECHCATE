import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'pino';
import { httpLogger, createHttpLogger } from './middleware/logger';
import { createCorsMiddleware } from './middleware/cors';
import { banCheck } from './middleware/banCheck';
import { apiRateLimiter, createRateLimiter } from './middleware/rateLimit';
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
import { createPatientsRouter, createFaceRouter } from './modules/patients/routes';
import { createCoursesRouter } from './modules/courses/routes';
import { createRecordsRouter } from './modules/records/routes';
import { authenticate } from './middleware/authenticate';

export function createApp(
  customLogger?: Logger,
  authController?: AuthController,
  securityController?: SecurityController,
  auditController?: AuditController
): Express {
  const app: Express = express();

  // Configure trust proxy based on actual reverse proxy hop count (default 1 for Caddy/Nginx)
  // NEVER trusts arbitrary client-supplied X-Forwarded-For directly
  const trustHops = process.env.TRUST_PROXY_HOPS !== undefined ? parseInt(process.env.TRUST_PROXY_HOPS, 10) : 1;
  app.set('trust proxy', trustHops);

  // 1. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. Structured Request Logging (Pino, redacts PII and vectors)
  app.use(customLogger ? createHttpLogger(customLogger) : httpLogger);

  // 3. CORS with explicit origin allowlist
  app.use(createCorsMiddleware());

  // 4. Strict JSON body parser with 100kb payload limit
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
  app.use('/api/auth', authController ? createAuthRouter(authController) : authRoutes);
  app.use('/api/kiosk', kioskRoutes);
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
  app.use('/api/face', createFaceRouter());
  app.use('/api/courses', createCoursesRouter());
  app.use('/api', createRecordsRouter());
  app.get(['/me', '/api/me'], authenticate, (req: Request, res: Response) => {
    res.status(200).json({ ok: true, data: req.user });
  });

  // Testing-only endpoints
  if (process.env.NODE_ENV === 'test') {
    // Tight rate limiter endpoint for quota testing (max 5 requests)
    const tightLimiter = createRateLimiter({
      max: 5,
      windowMs: 60 * 1000,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.get('/api/test-tight-rate-limit', tightLimiter, (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    // Mutating endpoints for testing CSRF across POST, PUT, PATCH, DELETE
    app.post('/api/test-csrf', (_req: Request, res: Response) => {
      res.status(200).json({ method: 'POST', ok: true });
    });
    app.put('/api/test-csrf', (_req: Request, res: Response) => {
      res.status(200).json({ method: 'PUT', ok: true });
    });
    app.patch('/api/test-csrf', (_req: Request, res: Response) => {
      res.status(200).json({ method: 'PATCH', ok: true });
    });
    app.delete('/api/test-csrf', (_req: Request, res: Response) => {
      res.status(200).json({ method: 'DELETE', ok: true });
    });

    app.post('/api/test-error', (req: Request, _res: Response) => {
      if (req.body?.type === 'app') {
        throw new AppError('Custom operational failure', 400, 'CUSTOM_BAD_REQUEST');
      }
      if (req.body?.type === 'db') {
        // Simulate an internal database error with stack & table leak
        const dbErr = new Error('syntax error at or near "SELECT * FROM secret_passwords"');
        (dbErr as Error & { table?: string }).table = 'secret_passwords';
        throw dbErr;
      }
      if (req.body?.type === 'patient_leak') {
        throw new Error('Database query failed for patient HN-998877 (Somchai Jaidee, diagnosis: HIV, stroke)');
      }
      throw new Error('Unexpected crash simulation');
    });

    app.post('/api/test-echo', (req: Request, res: Response) => {
      res.status(200).json({ received: req.body });
    });
  }

  // 10. 404 Route Not Found
  app.use((_req: Request, _res: Response, next) => {
    next(new AppError('Endpoint not found', 404, 'NOT_FOUND'));
  });

  // 11. Centralized Error Handler (Strict error masking)
  app.use(errorHandler);

  return app;
}
