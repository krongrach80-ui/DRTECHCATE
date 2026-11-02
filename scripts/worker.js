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
    if (url.pathname.startsWith('/api')) {
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

    if (!env || !env.ASSETS) {
      return new Response('DrTech.Care Kiosk System', { status: 200 });
    }

    // 3. Static Assets fetch
    let response = await env.ASSETS.fetch(request);
    if (response.status !== 404 && response.status !== 405) {
      return response;
    }

    // 4. SPA Deep-linking fallback for clinical portals
    if (url.pathname.startsWith('/admin')) {
      return env.ASSETS.fetch(new Request(new URL('/admin/index.html', request.url), request));
    }
    if (url.pathname.startsWith('/pt')) {
      return env.ASSETS.fetch(new Request(new URL('/pt/index.html', request.url), request));
    }
    if (url.pathname.startsWith('/kiosk')) {
      return env.ASSETS.fetch(new Request(new URL('/kiosk/index.html', request.url), request));
    }

    // 5. Root SPA fallback
    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  },
};
