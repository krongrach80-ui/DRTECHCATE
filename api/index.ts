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
  // Ensure req.url preserves /api if rewritten by Vercel
  if (req.url && !req.url.startsWith('/api') && req.url !== '/') {
    req.url = '/api' + req.url;
  }
  return (app as any)(req, res);
}
