import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from './logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Standard Error Handler Middleware
 * Strict rule: Format must be { "error": { "code", "message" } }
 * Never leak stack traces, SQL errors, or PII to the client or raw unredacted logs.
 * Uses req.log (pino) logging ONLY safe metadata: ref, code, and error name.
 */
export function errorHandler(
  err: Error & { statusCode?: number; code?: string; type?: string; status?: number; body?: unknown },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const errorRef = randomUUID();

  // 1. Operational application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // 2. Body-parser size limit exceeded (100kb limit)
  if (err.type === 'entity.too.large' || err.status === 413) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Payload exceeds the 100kb limit',
      },
    });
    return;
  }

  // 3. JSON Syntax error in body
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload',
      },
    });
    return;
  }

  // 4. CORS Errors
  if (err.message && err.message.includes('Not allowed by CORS')) {
    res.status(403).json({
      error: {
        code: 'CORS_REJECTED',
        message: 'Origin not allowed',
      },
    });
    return;
  }

  // 5. Unhandled / Unexpected server errors
  // Record ONLY safe metadata (ref, code, name) via pino logger (req.log or logger)
  // NEVER log err.message or err.stack directly as it may contain patient clinical notes, PII or raw SQL
  const logData = {
    ref: errorRef,
    code: err.code || 'INTERNAL_ERROR',
    name: err.name || 'Error',
  };

  const reqWithLog = req as Request & { log?: { error: (data: unknown, msg: string) => void } };
  if (reqWithLog.log) {
    reqWithLog.log.error(logData, 'Unhandled application error masked');
  } else {
    logger.error(logData, 'Unhandled application error masked');
  }

  // Mask completely: return generic message with reference ID, NEVER leaking internal stack/DB info
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
      ref: errorRef,
    },
  });
}
