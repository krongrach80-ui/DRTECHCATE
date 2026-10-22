import pinoHttp from 'pino-http';
import pino, { DestinationStream } from 'pino';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'req.body.accessToken',
  'req.body.refreshToken',
  'req.body.probe',
  'req.body.template',
  'req.body.templates',
  'req.body.vector',
  'req.body.embedding',
  'req.body.embeddings',
  'password',
  'token',
  'embedding',
  'embeddings',
  'vector',
];

export function createLogger(destination?: DestinationStream, level?: string) {
  return pino(
    {
      level: level || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
    },
    destination
  );
}

export const logger = createLogger();

export function createHttpLogger(customLogger?: pino.Logger) {
  return pinoHttp({
    logger: customLogger || logger,
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}

export const httpLogger = createHttpLogger();
