import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './app';
import { getEnv } from './config/env';
import { activateLocalPersistenceEngine } from './lib/localStorage/localPersistenceEngine';
import { syncBansFromDatabase } from './middleware/banCheck';

let appInstance: any = null;

async function getOrInitApp() {
  if (!appInstance) {
    activateLocalPersistenceEngine();
    try {
      const env = getEnv();
      if (!env.USE_LOCAL_STORAGE) {
        await syncBansFromDatabase().catch(() => {});
      }
    } catch {
      // Local fallback
    }
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
