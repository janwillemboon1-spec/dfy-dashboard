import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  // Behind a reverse proxy (Railway, and most other hosts), request.url reflects the
  // internal container address, not the public-facing domain — trust the standard
  // forwarded headers instead, falling back to the request's own origin for local dev
  // where there's no proxy in front and these headers aren't set.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[auth/callback] exchangeCodeForSession failed:', error);
  }

  return NextResponse.redirect(`${origin}/login?fout=1`);
}
