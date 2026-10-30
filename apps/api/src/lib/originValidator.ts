/**
 * apps/api/src/lib/originValidator.ts
 * Robust, production-grade Origin validation for CORS and CSRF protection.
 * Supports configured origins, first-party Same-Origin requests, and Vercel deployments.
 */

export function isAllowedOrigin(
  originStr?: string | null,
  allowedOrigins: string[] = [],
  reqHost?: string | null,
  forwardedHost?: string | null
): boolean {
  if (!originStr) return false;

  const trimmed = originStr.trim();
  if (!trimmed) return false;

  // 1. Exact or prefix match with configured allowedOrigins, or wildcard allowlist
  if (allowedOrigins.includes('*') || allowedOrigins.some((allowed) => trimmed === allowed || trimmed.startsWith(allowed + '/'))) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    const originHost = parsed.host.toLowerCase(); // e.g. "storied-basbousa-42f3be.netlify.app" or "localhost:3000"
    const originHostname = parsed.hostname.toLowerCase(); // e.g. "storied-basbousa-42f3be.netlify.app" or "localhost"

    // 2. Same-Origin Check: Matches current request Host or X-Forwarded-Host
    if (reqHost) {
      const cleanHost = reqHost.trim().toLowerCase();
      if (originHost === cleanHost || originHostname === cleanHost.split(':')[0]) {
        return true;
      }
    }
    if (forwardedHost) {
      const cleanFwdHost = forwardedHost.trim().toLowerCase();
      if (originHost === cleanFwdHost || originHostname === cleanFwdHost.split(':')[0]) {
        return true;
      }
    }

    // 3. Netlify deployment domains for DrTech.Care
    // Any *.netlify.app domain or matching Netlify runtime env
    if (originHostname.endsWith('.netlify.app')) {
      return true;
    }

    // 4. Vercel deployment domains for DrTech.Care
    // Any *.vercel.app domain belonging to drtechcarev2 or matching Vercel runtime env
    if (originHostname.endsWith('.vercel.app')) {
      const vercelUrl = (process.env.VERCEL_URL || '').toLowerCase();
      const vercelProdUrl = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').toLowerCase();

      if (
        originHostname.startsWith('drtechcarev2') ||
        originHostname.includes('drtechcarev2') ||
        (vercelUrl && (originHostname === vercelUrl || originHostname === vercelUrl.replace(/^https?:\/\//, ''))) ||
        (vercelProdUrl && (originHostname === vercelProdUrl || originHostname === vercelProdUrl.replace(/^https?:\/\//, '')))
      ) {
        return true;
      }
    }

    // 5. Local development / Loopback
    if (originHostname === 'localhost' || originHostname === '127.0.0.1' || originHostname === '::1') {
      return true;
    }
  } catch {
    // Malformed URL format is rejected
    return false;
  }

  return false;
}
