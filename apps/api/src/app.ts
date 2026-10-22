import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { httpLogger } from './middleware/logger';
import { createCorsMiddleware } from './middleware/cors';
import { banCheck } from './middleware/banCheck';
import { apiRateLimiter } from './middleware/rateLimit';
import { csrfGuard } from './middleware/csrfGuard';
import { errorHandler, AppError } from './middleware/errorHandler';
import { healthRoutes } from './modules/health/routes';
import { eventRoutes } from './modules/events/routes';

export function createApp(): Express {
  const app: Express = express();

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
  app.use(httpLogger);

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

  // 8. CSRF Guard for mutating methods
  app.use('/api', csrfGuard);

  // 9. Public / System routes
  app.use('/api', healthRoutes);
  app.use('/api', eventRoutes);

  // Testing-only error simulation endpoint
  if (process.env.NODE_ENV === 'test') {
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
