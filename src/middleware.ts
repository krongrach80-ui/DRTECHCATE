import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getRedirectPathForRole, isPathAllowedForRole } from '@/lib/rbac/roles';
import { UserRole } from '@/types/database';

// Public paths that do not require user authentication
const PUBLIC_PATHS = ['/login', '/kiosk', '/api/face', '/api/auth/login'];

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // Skip static files, Next.js internal files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/models') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase credentials are not configured yet, allow public access
    return res;
  }

  // Create Supabase SSR client to manage and refresh cookies
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          req.cookies.set(name, value);
        });
        res = NextResponse.next({
          request: {
            headers: req.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // 1. IP Ban Enforcement Check
  try {
    const { data: bannedRecord } = await supabase
      .from('banned_ips')
      .select('ip, reason, expires_at')
      .eq('ip', ip)
      .maybeSingle();

    if (bannedRecord) {
      const isExpired = bannedRecord.expires_at && new Date(bannedRecord.expires_at) < new Date();
      if (!isExpired) {
        return new NextResponse(`Access Denied: Your IP (${ip}) is banned. Reason: ${bannedRecord.reason || 'Security policy violation'}`, {
          status: 403,
        });
      }
    }
  } catch {
    // Ignore error if database is not reachable during setup
  }

  // 2. Fetch authenticated user session
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // If unauthenticated:
  if (authError || !user) {
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
    if (!isPublic && pathname !== '/') {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return res;
  }

  // 3. User is authenticated -> Verify profile and role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active, force_logout_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    // Inactive user or missing profile -> Force logout
    await supabase.auth.signOut();
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', 'inactive');
    return NextResponse.redirect(loginUrl);
  }

  // 4. Force Logout Check
  if (profile.force_logout_at && user.last_sign_in_at) {
    const forceLogoutTime = new Date(profile.force_logout_at).getTime();
    const lastSignInTime = new Date(user.last_sign_in_at).getTime();

    if (lastSignInTime < forceLogoutTime) {
      await supabase.auth.signOut();
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'session_expired');
      return NextResponse.redirect(loginUrl);
    }
  }

  const userRole = profile.role as UserRole;

  // 5. If logged-in user visits /login, redirect to their role home page
  if (pathname === '/login' || pathname === '/') {
    return NextResponse.redirect(new URL(getRedirectPathForRole(userRole), req.url));
  }

  // 6. Role-Based Route Authorization
  if (!isPathAllowedForRole(userRole, pathname)) {
    // Redirect unauthorized user to their designated dashboard
    return NextResponse.redirect(new URL(getRedirectPathForRole(userRole), req.url));
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
