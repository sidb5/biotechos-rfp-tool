import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getSession() instead of getUser() for the routing decision.
  // getSession() reads from the cookie (no network round-trip to Supabase),
  // while getUser() makes an API call on every request (~200-500ms).
  // Individual pages that need verified auth should call getUser() themselves.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  // API routes handle their own auth and return JSON — never redirect them
  if (pathname.startsWith('/api/')) {
    return supabaseResponse;
  }

  // Public routes that don't require auth
  const publicRoutes = ['/', '/login', '/signup', '/auth/callback', '/admin/login', '/extension-privacy'];
  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/auth/')
  )
    || pathname.startsWith('/q/')   // quote share links (password-protected at page level)
    || pathname.startsWith('/p/')   // proposal share links (password-protected at page level)
    || pathname.startsWith('/sme/'); // SME micro-form links (auth-less by design)

  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
