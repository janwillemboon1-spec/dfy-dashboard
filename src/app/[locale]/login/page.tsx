'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'versturen' | 'verstuurd' | 'mislukt'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('versturen');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? 'mislukt' : 'verstuurd');
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mailadres</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <Button type="submit" disabled={status === 'versturen'} className="w-full">
          {status === 'versturen' ? 'Versturen...' : 'Stuur inloglink'}
        </Button>
        {status === 'mislukt' && <p className="text-sm text-destructive">Er ging iets mis, probeer het opnieuw.</p>}
      </form>
    </main>
  );
}
