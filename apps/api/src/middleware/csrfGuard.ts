import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  // Safe read-only methods don't require CSRF checks
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const env = getEnv();
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

  if (origin) {
    const isAllowed = allowedOrigins.some((allowed) => origin.startsWith(allowed));
    if (!isAllowed) {
      res.status(403).json({
        error: {
          code: 'CSRF_REJECTED',
          message: 'Cross-site request forgery protection triggered (Invalid origin)',
        },
      });
      return;
    }
  }

  // Check X-Requested-With header for mutating requests
  const xRequestedWith = req.headers['x-requested-with'];
  // If no origin and no X-Requested-With on browser request, reject
  if (!origin && !xRequestedWith && process.env.NODE_ENV === 'production') {
    res.status(403).json({
      error: {
        code: 'CSRF_REJECTED',
        message: 'Missing CSRF verification header',
      },
    });
    return;
  }

  next();
}
