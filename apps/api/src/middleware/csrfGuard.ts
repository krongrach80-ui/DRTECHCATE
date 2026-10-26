import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env';
import { isAllowedOrigin } from '../lib/originValidator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  // Safe read-only methods don't require CSRF checks
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = (req.headers.origin as string) || (req.headers.referer as string);
  const env = getEnv();
  const allowedOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // 1. If Origin or Referer is present, it MUST match an allowed origin or same-origin
  if (origin) {
    const isAllowed = isAllowedOrigin(
      origin,
      allowedOrigins,
      req.headers.host,
      req.headers['x-forwarded-host'] as string | undefined
    );
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

  // 2. If Origin is absent, request MUST contain X-Requested-With header
  const xRequestedWith = req.headers['x-requested-with'];
  if (!origin && !xRequestedWith) {
    res.status(403).json({
      error: {
        code: 'CSRF_REJECTED',
        message: 'Missing CSRF verification header (X-Requested-With required when Origin is omitted)',
      },
    });
    return;
  }

  next();
}
