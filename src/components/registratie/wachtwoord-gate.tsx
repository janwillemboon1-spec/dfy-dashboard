'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function WachtwoordGate() {
  const router = useRouter();
  const [wachtwoord, setWachtwoord] = useState('');
  const [status, setStatus] = useState<'idle' | 'bezig' | 'mislukt'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('bezig');
    const response = await fetch('/api/registreren/toegang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wachtwoord }),
    });
    if (!response.ok) {
      setStatus('mislukt');
      return;
    }
    // Herlaadt de server component (registreren/page.tsx), die nu via de zojuist gezette
    // cookie heeftRegistratieToegang() === true ziet en het echte formulier toont.
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="gate-wachtwoord">Wachtwoord</Label>
        <Input
          id="gate-wachtwoord"
          type="password"
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={status === 'bezig'}>
        {status === 'bezig' ? 'Bezig...' : 'Doorgaan'}
      </Button>
      {status === 'mislukt' && (
        <p className="text-sm text-destructive">Onjuist wachtwoord, probeer het opnieuw.</p>
      )}
    </form>
  );
}
