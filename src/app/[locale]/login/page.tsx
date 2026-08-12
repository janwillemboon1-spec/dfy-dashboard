'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'versturen' | 'verstuurd' | 'mislukt'>('idle');
  const [linkFout, setLinkFout] = useState(searchParams.get('fout') === '1');
  const [wachtwoordStatus, setWachtwoordStatus] = useState<'idle' | 'bezig' | 'mislukt'>('idle');
  const [resetStatus, setResetStatus] = useState<'idle' | 'bezig' | 'verstuurd'>('idle');
  const [resetFoutmelding, setResetFoutmelding] = useState<string | null>(null);

  async function handleMagicLink() {
    setLinkFout(false);
    setStatus('versturen');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? 'mislukt' : 'verstuurd');
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWachtwoordStatus('bezig');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setWachtwoordStatus('mislukt');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleResetPassword() {
    setResetFoutmelding(null);
    if (!email) {
      setResetFoutmelding('Vul eerst je e-mailadres in.');
      return;
    }
    setResetStatus('bezig');
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-wachtwoord`,
    });
    if (error) {
      setResetStatus('idle');
      setResetFoutmelding('Er ging iets mis, probeer het opnieuw.');
      return;
    }
    setResetStatus('verstuurd');
  }

  if (status === 'verstuurd') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-serif text-2xl">Check je mailbox</h1>
        <p className="mt-2 text-muted-foreground">We hebben een inloglink gestuurd naar {email}.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md py-24">
      <h1 className="font-serif text-2xl mb-6">Inloggen</h1>
      <form onSubmit={handlePasswordSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mailadres</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="password">Wachtwoord</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={wachtwoordStatus === 'bezig'} className="w-full">
          {wachtwoordStatus === 'bezig' ? 'Bezig...' : 'Inloggen'}
        </Button>
        {wachtwoordStatus === 'mislukt' && (
          <p className="text-sm text-destructive">
            Inloggen mislukt. Controleer je e-mailadres en wachtwoord, of vraag een nieuwe wachtwoordlink aan.
          </p>
        )}
      </form>

      <div className="mt-3 text-sm">
        <button
          type="button"
          onClick={handleResetPassword}
          disabled={resetStatus === 'bezig'}
          className="underline text-muted-foreground disabled:opacity-50"
        >
          Wachtwoord vergeten of nog geen wachtwoord ingesteld? Stel er een in
        </button>
        {resetStatus === 'bezig' && <p className="mt-2 text-muted-foreground">Bezig...</p>}
        {resetStatus === 'verstuurd' && (
          <p className="mt-2 text-muted-foreground">
            We hebben een link gestuurd naar {email} om een wachtwoord in te stellen.
          </p>
        )}
        {resetFoutmelding && <p className="mt-2 text-destructive">{resetFoutmelding}</p>}
      </div>

      <div className="mt-6 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground mb-2">Liever een inloglink per e-mail?</p>
        <Button
          type="button"
          variant="outline"
          onClick={handleMagicLink}
          disabled={status === 'versturen'}
          className="w-full"
        >
          {status === 'versturen' ? 'Versturen...' : 'Stuur inloglink'}
        </Button>
        {linkFout && (
          <p className="mt-2 text-sm text-destructive">Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.</p>
        )}
        {status === 'mislukt' && <p className="mt-2 text-sm text-destructive">Er ging iets mis, probeer het opnieuw.</p>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
