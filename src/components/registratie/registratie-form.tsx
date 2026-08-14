'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registratieSchema, type RegistratieInput } from '@/lib/validation/registratie-schema';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RegistratieForm() {
  const router = useRouter();
  const [status, setStatus] = useState<
    'idle' | 'versturen' | 'mislukt' | 'account-aangemaakt-login-mislukt'
  >('idle');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  const form = useForm<RegistratieInput>({
    resolver: zodResolver(registratieSchema),
    defaultValues: {
      naam: '',
      email: '',
      telefoon: '',
      wachtwoord: '',
      wachtwoordBevestiging: '',
      honeypot: '',
    },
  });

  async function onSubmit(data: RegistratieInput) {
    setStatus('versturen');
    setFoutmelding(null);
    try {
      const response = await fetch('/api/registreren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? 'Er ging iets mis.');
      }

      // Het formulier heeft het net gekozen wachtwoord nog in state — hiermee kunnen we
      // de klant client-side meteen inloggen, zelfde patroon als het bestaande
      // wachtwoord-inloggen op /login (signInWithPassword).
      const supabase = createClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.wachtwoord,
      });
      if (loginError) {
        // Het account bestaat al succesvol op de server — dit is geen registratiefout.
        // Eigen status i.p.v. de generieke foutmelding-flow: bij een retry zou de klant
        // anders alleen de verwarrende "e-mailadres bestaat al"-melding van de server
        // te zien krijgen, zonder duidelijke weg terug naar /login.
        setStatus('account-aangemaakt-login-mislukt');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setStatus('mislukt');
      setFoutmelding((error as Error).message);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-4">
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register('honeypot')} />

      <div>
        <Label htmlFor="naam">Naam</Label>
        <Input id="naam" {...form.register('naam')} />
        {form.formState.errors.naam && (
          <p className="text-sm text-destructive">{form.formState.errors.naam.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" {...form.register('email')} />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="telefoon">Telefoon (optioneel)</Label>
        <Input id="telefoon" {...form.register('telefoon')} />
      </div>
      <div>
        <Label htmlFor="wachtwoord">Wachtwoord</Label>
        <Input id="wachtwoord" type="password" {...form.register('wachtwoord')} />
        {form.formState.errors.wachtwoord && (
          <p className="text-sm text-destructive">{form.formState.errors.wachtwoord.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="wachtwoordBevestiging">Wachtwoord bevestigen</Label>
        <Input id="wachtwoordBevestiging" type="password" {...form.register('wachtwoordBevestiging')} />
        {form.formState.errors.wachtwoordBevestiging && (
          <p className="text-sm text-destructive">{form.formState.errors.wachtwoordBevestiging.message}</p>
        )}
      </div>

      {status === 'mislukt' && foutmelding && (
        <p className="text-sm text-destructive">{foutmelding}</p>
      )}

      {status === 'account-aangemaakt-login-mislukt' ? (
        <p className="text-sm text-destructive">
          Je account is aangemaakt! Automatisch inloggen is helaas mislukt.{' '}
          <Link href="/login" className="underline">
            Log handmatig in
          </Link>
          .
        </p>
      ) : (
        <Button type="submit" disabled={status === 'versturen'} className="w-full sm:w-auto">
          {status === 'versturen' ? 'Bezig...' : 'Account aanmaken'}
        </Button>
      )}
    </form>
  );
}
