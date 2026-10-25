import type { IncomingMessage, ServerResponse } from 'http';

let appInstance: any = null;

async function getOrInitApp() {
  if (!appInstance) {
    const { activateLocalPersistenceEngine } = await import('../apps/api/src/lib/localStorage/localPersistenceEngine');
    activateLocalPersistenceEngine();

    try {
      const { getEnv } = await import('../apps/api/src/config/env');
      const env = getEnv();
      if (!env.USE_LOCAL_STORAGE) {
        const { syncBansFromDatabase } = await import('../apps/api/src/middleware/banCheck');
        await syncBansFromDatabase().catch(() => {});
      }
    } catch {
      // Local engine fallback
    }

    const { createApp } = await import('../apps/api/src/app');
    appInstance = createApp();
  }
  return appInstance;
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getOrInitApp();

    let requestPath = req.url || '';
    const matchedPath = req.headers['x-matched-path'] as string | undefined;
    if (matchedPath && matchedPath.startsWith('/api') && (!requestPath || requestPath === '/' || requestPath === '/api')) {
      requestPath = matchedPath;
    }
    if (!requestPath.startsWith('/api') && requestPath !== '/') {
      requestPath = '/api' + requestPath;
    }
    req.url = requestPath;

    return app(req, res);
  } catch (err: any) {
    console.error('Serverless Handler Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: 'error',
      message: err?.message || String(err),
      stack: err?.stack,
    }));
  }
}
