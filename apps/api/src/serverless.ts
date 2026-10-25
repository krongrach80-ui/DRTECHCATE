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

    // 1. Check if Vercel rewrite passed __path in query
    try {
      const parsedUrl = new URL(requestPath, 'http://localhost');
      const paramPath = parsedUrl.searchParams.get('__path');
      if (paramPath !== null) {
        parsedUrl.searchParams.delete('__path');
        const remainingQuery = parsedUrl.searchParams.toString();
        requestPath = '/api/' + paramPath.replace(/^\/+/, '') + (remainingQuery ? `?${remainingQuery}` : '');
      }
    } catch {
      // fallback
    }

    // 2. Check forwarded headers injected by Vercel / proxies
    const forwardedUri = (req.headers['x-forwarded-uri'] || req.headers['x-original-url']) as string | undefined;
    const matchedPath = (req.headers['x-matched-path'] || req.headers['x-invoke-path']) as string | undefined;

    if (!requestPath.startsWith('/api') || requestPath === '/api' || requestPath === '/api/') {
      if (forwardedUri && forwardedUri.startsWith('/api')) {
        requestPath = forwardedUri;
      } else if (matchedPath && matchedPath.startsWith('/api') && matchedPath !== '/api') {
        // Reconstruct full URL including query if present
        const queryIndex = (req.url || '').indexOf('?');
        const queryString = queryIndex !== -1 ? (req.url || '').substring(queryIndex) : '';
        requestPath = matchedPath + (matchedPath.includes('?') ? '' : queryString);
      }
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
