'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetWachtwoordPage() {
  const router = useRouter();
  const [sessieStatus, setSessieStatus] = useState<'laden' | 'geldig' | 'ongeldig'>('laden');
  const [wachtwoord, setWachtwoord] = useState('');
  const [bevestiging, setBevestiging] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'bezig' | 'opgeslagen'>('idle');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setSessieStatus(user ? 'geldig' : 'ongeldig');
    });
  }, []);

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setFoutmelding(null);
    if (wachtwoord.length < 6) {
      setFoutmelding('Wachtwoord moet minimaal 6 tekens zijn.');
      return;
    }
    if (wachtwoord !== bevestiging) {
      setFoutmelding('De wachtwoorden komen niet overeen.');
      return;
    }
    setStatus('bezig');
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: wachtwoord });
    if (error) {
      setStatus('idle');
      setFoutmelding(error.message);
      return;
    }
    setStatus('opgeslagen');
  }

  if (sessieStatus === 'laden') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <p className="text-muted-foreground">Bezig met laden...</p>
      </main>
    );
  }

  if (sessieStatus === 'ongeldig') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-serif text-2xl">Link verlopen</h1>
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

  if (status === 'opgeslagen') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-serif text-2xl">Wachtwoord ingesteld</h1>
        <p className="mt-2 text-muted-foreground">Je kunt nu inloggen met je nieuwe wachtwoord.</p>
        <Button className="mt-6" onClick={() => router.push('/dashboard')}>
          Naar het dashboard
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md py-24">
      <h1 className="font-serif text-2xl mb-6">Nieuw wachtwoord instellen</h1>
      <form onSubmit={opslaan} className="space-y-4">
        <div>
          <Label htmlFor="wachtwoord">Nieuw wachtwoord</Label>
          <Input
            id="wachtwoord"
            type="password"
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="bevestiging">Bevestig wachtwoord</Label>
          <Input
            id="bevestiging"
            type="password"
            value={bevestiging}
            onChange={(e) => setBevestiging(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={status === 'bezig'} className="w-full">
          {status === 'bezig' ? 'Bezig...' : 'Wachtwoord instellen'}
        </Button>
        {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
      </form>
    </main>
  );
}
