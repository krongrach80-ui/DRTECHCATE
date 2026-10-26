import rateLimit, { Options } from 'express-rate-limit';

export function createRateLimiter(options?: Partial<Options>) {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1500, // max 1500 requests per minute (25 req/s) for clinical operations and multi-tab dashboards
    standardHeaders: true, // Return standard `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req) => {
      // Never rate-limit lightweight health probes or long-lived SSE connections
      const url = req.originalUrl || req.url || '';
      return url.includes('/health') || url.includes('/events');
    },
    validate: {
      xForwardedForHeader: false, // Safely ignore client-sent X-Forwarded-For when trust proxy is false
    },
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    },
    statusCode: 429,
    ...options,
  });
}

export const apiRateLimiter = createRateLimiter();
