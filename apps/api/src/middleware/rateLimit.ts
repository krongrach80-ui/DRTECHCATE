import rateLimit, { Options } from 'express-rate-limit';

export function createRateLimiter(options?: Partial<Options>) {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // max 100 requests per minute by default
    standardHeaders: true, // Return standard `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
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
