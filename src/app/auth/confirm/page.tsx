'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Handles magic links generated via supabase.auth.admin.generateLink() (used for the
// branded welcome email, see src/lib/email/send-welkomstmail.ts). Those links carry
// their tokens in the URL fragment (#access_token=...), unlike the browser-initiated
// signInWithOtp() flow used by /login, which produces a ?code= param handled server-side
// by /auth/callback. Fragments are never sent to the server, so only client-side code
// (the Supabase browser client's built-in detectSessionInUrl behaviour) can process them.
export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'bezig' | 'mislukt'>('bezig');

  useEffect(() => {
    const supabase = createClient();
    let gestopt = false;

    const timeout = setTimeout(() => {
      if (!gestopt) setStatus('mislukt');
    }, 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        gestopt = true;
        clearTimeout(timeout);
        router.replace('/dashboard');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        gestopt = true;
        clearTimeout(timeout);
        router.replace('/dashboard');
      }
    });

    return () => {
      gestopt = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
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
