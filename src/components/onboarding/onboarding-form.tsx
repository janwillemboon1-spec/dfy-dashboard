'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { onboardingSchema, type OnboardingInput } from '@/lib/validation/onboarding-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NulmetingFields } from './nulmeting-fields';

const legeNulmeting = () =>
  Array.from({ length: 12 }, (_, i) => ({
    jaar: new Date().getFullYear(),
    maand: i + 1,
    omzet: 0,
    bezetting: 0,
  }));

export function OnboardingForm() {
  const [status, setStatus] = useState<'idle' | 'versturen' | 'gelukt' | 'mislukt'>('idle');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      naam: '',
      email: '',
      telefoon: '',
      accommodaties: [{ naam: '', adres: '', nulmeting: legeNulmeting() }],
      honeypot: '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'accommodaties' });

  async function onSubmit(data: OnboardingInput) {
    setStatus('versturen');
    setFoutmelding(null);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? 'Er ging iets mis.');
      }
      setStatus('gelukt');
    } catch (error) {
      setStatus('mislukt');
      setFoutmelding((error as Error).message);
    }
  }

  if (status === 'gelukt') {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h2 className="font-serif text-2xl">Bedankt!</h2>
        <p className="mt-2 text-muted-foreground">
          Check je mailbox — je ontvangt zo een link om in te loggen op je dashboard.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register('honeypot')} />

      <section className="space-y-4">
        <h2 className="font-serif text-xl">Jouw gegevens</h2>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">Accommodaties & nulmeting</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ naam: '', adres: '', nulmeting: legeNulmeting() })}
          >
            + Accommodatie toevoegen
          </Button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="rounded-lg border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Accommodatie {index + 1}</h3>
              {fields.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => remove(index)}>
                  Verwijderen
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`accommodaties.${index}.naam`}>Naam</Label>
                <Input {...form.register(`accommodaties.${index}.naam` as const)} />
              </div>
              <div>
                <Label htmlFor={`accommodaties.${index}.adres`}>Adres</Label>
                <Input {...form.register(`accommodaties.${index}.adres` as const)} />
              </div>
            </div>
            <NulmetingFields
              register={form.register}
              errors={form.formState.errors}
              accommodatieIndex={index}
            />
          </div>
        ))}
      </section>

      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}

      {status !== 'versturen' &&
        Object.keys(form.formState.errors).length > 0 && (
          <p className="text-sm text-destructive">
            Controleer de gemarkeerde velden hierboven — er staat nog een fout in het formulier.
          </p>
        )}

      <Button type="submit" disabled={status === 'versturen'} className="w-full sm:w-auto">
        {status === 'versturen' ? 'Versturen...' : 'Versturen'}
      </Button>
    </form>
  );
}
