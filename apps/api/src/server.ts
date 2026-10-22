import { createApp } from './app';
import { getEnv } from './config/env';
import { logger } from './middleware/logger';

function startServer(): void {
  try {
    const env = getEnv();
    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`DrTech.Care Express 5 API Server started on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    const shutdown = (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err: unknown) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
