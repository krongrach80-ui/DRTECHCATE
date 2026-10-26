import { createApp } from './app';
import { getEnv } from './config/env';
import { logger } from './middleware/logger';
import { syncBansFromDatabase } from './middleware/banCheck';
import { startCleanupScheduler, stopCleanupScheduler } from './jobs/cleanup';

export async function startServer(): Promise<void> {
  try {
    const env = getEnv();

    // Local Persistence Engine Activation (Docker-Bypass Mode for standalone local execution)
    if (env.USE_LOCAL_STORAGE) {
      if (env.NODE_ENV === 'production') {
        throw new Error('USE_LOCAL_STORAGE=true is strictly forbidden in production mode. Real Supabase connection is required.');
      }
      const { activateLocalPersistenceEngine } = await import('./lib/localStorage/localPersistenceEngine');
      activateLocalPersistenceEngine();
    } else {
      try {
        await syncBansFromDatabase();
      } catch (err: unknown) {
        if (env.NODE_ENV === 'production') {
          logger.fatal({ err }, 'Supabase database unreachable in production mode. Fail-closed: in-memory fallback is strictly forbidden.');
          throw err;
        }
        logger.warn({ err }, 'Supabase database unreachable. Falling back to Local Persistence Engine.');
        const { activateLocalPersistenceEngine } = await import('./lib/localStorage/localPersistenceEngine');
        activateLocalPersistenceEngine();
      }
    }

    // Security Warning & Boot Audit Log (Item H5 & Spec 7.5.1)
    if (env.PAD_MODE === 'active_only') {
      logger.warn(
        { pad_mode: env.PAD_MODE, provider: env.PAD_PROVIDER },
        'SECURITY WARNING (Spec 7.5.1 / Item H5): Server running in PAD_MODE=active_only. Server verifies one-time challenge nonce, timestamp expiry, and client-claimed head poses. Server cannot independently prove physical liveness without certified passive/depth sensors. Kiosk physical hardening, single-use nonces, and device cookies are primary barriers.'
      );
    }

    const { audit } = await import('./modules/audit');
    await audit.write({
      actor_type: 'system',
      action: 'SYSTEM_BOOT',
      entity: 'server',
      metadata: {
        pad_mode: env.PAD_MODE,
        pad_provider: env.PAD_PROVIDER,
        port: env.PORT,
        node_env: env.NODE_ENV,
      },
    }).catch((err: unknown) => {
      logger.warn({ err }, 'Could not record boot audit log');
    });

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`DrTech.Care Express 5 API Server started on port ${env.PORT} [${env.NODE_ENV}]`);
      startCleanupScheduler();
    });

    const shutdown = (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      stopCleanupScheduler();
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

if (getEnv().NODE_ENV !== 'test') {
  startServer();
}
