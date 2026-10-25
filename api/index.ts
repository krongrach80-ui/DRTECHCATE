import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../apps/api/src/app';
import { getEnv } from '../apps/api/src/config/env';
import { activateLocalPersistenceEngine } from '../apps/api/src/lib/localStorage/localPersistenceEngine';
import { syncBansFromDatabase } from '../apps/api/src/middleware/banCheck';

let appInstance: ReturnType<typeof createApp> | null = null;
let isInitialized = false;

async function bootstrapApp() {
  if (!isInitialized) {
    isInitialized = true;
    try {
      const env = getEnv();
      if (env.USE_LOCAL_STORAGE) {
        activateLocalPersistenceEngine();
      } else {
        try {
          await syncBansFromDatabase();
        } catch {
          activateLocalPersistenceEngine();
        }
      }
    } catch {
      activateLocalPersistenceEngine();
    }
    appInstance = createApp();
  }
  return appInstance!;
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await bootstrapApp();

  // If Vercel rewrote the request to /api, recover original path from x-matched-path
  let requestPath = req.url || '';
  const matchedPath = req.headers['x-matched-path'] as string | undefined;
  if (matchedPath && matchedPath.startsWith('/api') && (!requestPath || requestPath === '/' || requestPath === '/api')) {
    requestPath = matchedPath;
  }
  if (!requestPath.startsWith('/api') && requestPath !== '/') {
    requestPath = '/api' + requestPath;
  }
  req.url = requestPath;

  return (app as any)(req, res);
}
