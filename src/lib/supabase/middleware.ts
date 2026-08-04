import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Defense-in-depth only — Row Level Security (see supabase/migrations/) is the
// actual authorization boundary. This middleware exists for redirect UX, not
// as the sole guard: never rely on it alone when adding new protected data.
export async function updateSession(request: NextRequest, response: NextResponse) {
  let currentResponse = response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Recreate the response from the mutated request so refreshed
          // cookies are visible to this request's own SSR render, not just
          // sent to the browser via Set-Cookie for the next one.
          currentResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            currentResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  // NOTE: assumes a single locale with no visible URL prefix (routing.ts:
  // locales: ['nl'], localePrefix: 'as-needed'). If a second locale is ever
  // added, these checks need to account for a possible locale segment prefix.
  const isAdminRoute = pathname.startsWith('/admin');
  const isDashboardRoute = pathname.startsWith('/dashboard');

  if ((isAdminRoute || isDashboardRoute) && !user) {
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
    currentResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url));
      currentResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }

  return currentResponse;
}
