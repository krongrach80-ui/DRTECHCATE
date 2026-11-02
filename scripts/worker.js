export default {
  async fetch(request, env) {
    if (!env || !env.ASSETS) {
      return new Response('DrTech.Care Kiosk System', { status: 200 });
    }

    const url = new URL(request.url);

    // 1. Direct assets fetch
    let response = await env.ASSETS.fetch(request);
    if (response.status !== 404) {
      return response;
    }

    // 2. SPA Deep-linking fallback for clinical portals
    if (url.pathname.startsWith('/admin')) {
      return env.ASSETS.fetch(new Request(new URL('/admin/index.html', request.url), request));
    }
    if (url.pathname.startsWith('/pt')) {
      return env.ASSETS.fetch(new Request(new URL('/pt/index.html', request.url), request));
    }
    if (url.pathname.startsWith('/kiosk')) {
      return env.ASSETS.fetch(new Request(new URL('/kiosk/index.html', request.url), request));
    }

    // 3. Root SPA fallback
    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  },
};

