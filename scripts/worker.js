export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. CORS Preflight for all origins
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, X-Requested-With, x-auth-token, x-staff-role, x-actor-id, drtech_access_token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 2. API Endpoints: Return clean 404 JSON with CORS to trigger client-side live Supabase fallback
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/.netlify')) {
      if (url.pathname === '/api/health' || url.pathname === '/api/health/') {
        return new Response(JSON.stringify({ ok: true, status: 'healthy', provider: 'cloudflare-worker' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'DELEGATE_TO_SUPABASE_CLOUD',
            message: 'Static edge mode: API delegated to live Supabase Cloud',
          },
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers':
              'Content-Type, Authorization, X-Requested-With, x-auth-token, x-staff-role, x-actor-id, drtech_access_token',
          },
        }
      );
    }

    // Non-GET/HEAD methods that aren't preflight OPTIONS delegate to Supabase Cloud
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'DELEGATE_TO_SUPABASE_CLOUD',
            message: 'Static edge mode: API delegated to live Supabase Cloud',
          },
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers':
              'Content-Type, Authorization, X-Requested-With, x-auth-token, x-staff-role, x-actor-id, drtech_access_token',
          },
        }
      );
    }

    if (!env || !env.ASSETS) {
      return new Response('DrTech.Care Kiosk System', { status: 200 });
    }

    const addNoCacheHeaders = (res) => {
      const newHeaders = new Headers(res.headers);
      newHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      newHeaders.set('CDN-Cache-Control', 'no-store');
      newHeaders.set('Cloudflare-CDN-Cache-Control', 'no-store');
      newHeaders.set('Pragma', 'no-cache');
      newHeaders.set('Expires', '0');
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    };

    // 3. Static Assets fetch
    const assetUrl = new URL(request.url);
    const isRootOrHtml = assetUrl.pathname === '/' || assetUrl.pathname.endsWith('.html') || !assetUrl.pathname.includes('.');
    const fetchPath = assetUrl.pathname === '/' ? '/index.html' : assetUrl.pathname;
    let response = await env.ASSETS.fetch(new Request(new URL(fetchPath, request.url), {
      method: 'GET',
      headers: request.headers,
    }));
    if (response.status !== 404 && response.status !== 405) {
      // Never cache HTML entries at Edge or in browser to ensure fresh bundles
      if (isRootOrHtml) {
        return addNoCacheHeaders(response);
      }
      return response;
    }

    // Do NOT route missing static assets (.js, .css, .wasm, etc.) to index.html
    const isStaticAsset = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (isStaticAsset) {
      return new Response(`Asset not found: ${url.pathname}`, {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // 4. SPA Deep-linking fallback for clinical portals (always use GET for index.html with fresh no-cache headers)
    const spaGetReq = (targetPath) =>
      new Request(new URL(targetPath, request.url), {
        method: 'GET',
        headers: request.headers,
      });

    if (url.pathname.startsWith('/admin')) {
      const adminRes = await env.ASSETS.fetch(spaGetReq('/admin/index.html'));
      if (adminRes.status < 400) return addNoCacheHeaders(adminRes);
      const rootRes = await env.ASSETS.fetch(spaGetReq('/index.html'));
      return addNoCacheHeaders(rootRes);
    }
    if (url.pathname.startsWith('/pt')) {
      const ptRes = await env.ASSETS.fetch(spaGetReq('/pt/index.html'));
      if (ptRes.status < 400) return addNoCacheHeaders(ptRes);
      const rootRes = await env.ASSETS.fetch(spaGetReq('/index.html'));
      return addNoCacheHeaders(rootRes);
    }
    if (url.pathname.startsWith('/kiosk')) {
      const kioskRes = await env.ASSETS.fetch(spaGetReq('/kiosk/index.html'));
      if (kioskRes.status < 400) return addNoCacheHeaders(kioskRes);
      const rootRes = await env.ASSETS.fetch(spaGetReq('/index.html'));
      return addNoCacheHeaders(rootRes);
    }

    // 5. Root SPA fallback
    const rootRes = await env.ASSETS.fetch(spaGetReq('/index.html'));
    return addNoCacheHeaders(rootRes);
  },
};
