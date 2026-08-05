'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Handles magic links generated via supabase.auth.admin.generateLink() (used for the
// branded welcome email, see src/lib/email/send-welkomstmail.ts). Those links carry
// their tokens in the URL fragment (#access_token=...&refresh_token=...), unlike the
// browser-initiated signInWithOtp() flow used by /login, which produces a ?code= param
// handled server-side by /auth/callback.
//
// @supabase/ssr's createBrowserClient hardcodes flowType: 'pkce', which means its
// built-in detectSessionInUrl logic only looks for a ?code= param and will NOT parse
// an implicit-flow #access_token= fragment automatically, even though
// detectSessionInUrl itself is enabled. So this page parses the fragment by hand and
// establishes the session explicitly via setSession() — verified directly against the
// live project that this works regardless of flowType, since it's just handing the
// client two already-valid tokens rather than asking it to derive them from the URL.
export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'bezig' | 'mislukt'>('bezig');

  useEffect(() => {
    const supabase = createClient();
    let gestopt = false;

    async function verwerkFragment() {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (!access_token || !refresh_token) {
        if (!gestopt) setStatus('mislukt');
        return;
      }

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (gestopt) return;

      if (error) {
        console.error('[auth/confirm] setSession failed:', error);
        setStatus('mislukt');
        return;
      }

      router.replace('/dashboard');
    }

    verwerkFragment();

    return () => {
      gestopt = true;
    };
  }, [router]);

  if (status === 'mislukt') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-serif text-2xl">Inloggen mislukt</h1>
        <p className="mt-2 text-muted-foreground">
          Deze link is verlopen of al gebruikt. Vraag een nieuwe aan via{' '}
          <a href="/login" className="underline">
            de inlogpagina
          </a>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md py-24 text-center">
      <p className="text-muted-foreground">Bezig met inloggen...</p>
    </main>
  );
}
