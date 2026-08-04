import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '../i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const intlResponse = intlMiddleware(request);
  return updateSession(request, intlResponse ?? NextResponse.next());
}

export const config = {
  // Match all paths except API routes, the auth callback route (Task 10),
  // Next.js internals, Vercel internals, and any path with a file extension.
  // Kept Task 3's blanket `_next` and `_vercel` exclusions (broader than a
  // `_next/static|_next/image` split — also covers `_next/webpack-hmr` etc.,
  // which must not be intercepted by this middleware) and added `auth` so
  // Task 10's magic-link callback route isn't hit by the auth guard.
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
