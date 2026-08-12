'use client';

import { useState, useTransition } from 'react';
import { wijzigEigenClientGegevens } from '@/app/[locale]/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ContactgegevensFormulier({
  naam: initieleNaam,
  telefoon: initieelTelefoon,
  email,
}: {
  naam: string;
  telefoon: string | null;
  email: string;
}) {
  const [naam, setNaam] = useState(initieleNaam);
  const [telefoon, setTelefoon] = useState(initieelTelefoon ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    setOpgeslagen(false);
    startTransition(async () => {
      const resultaat = await wijzigEigenClientGegevens({ naam, telefoon: telefoon || null });
      if (!resultaat.succes) {
        setFoutmelding(resultaat.fout ?? 'Onbekende fout bij opslaan.');
        return;
      }
      setOpgeslagen(true);
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <Label htmlFor="contactgegevens-naam">Naam</Label>
        <Input id="contactgegevens-naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="contactgegevens-telefoon">Telefoonnummer</Label>
        <Input id="contactgegevens-telefoon" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="contactgegevens-email">E-mailadres</Label>
        <Input id="contactgegevens-email" value={email} disabled />
      </div>
      <Button onClick={opslaan} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Opslaan'}
      </Button>
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
      {opgeslagen && !foutmelding && <p className="text-sm text-muted-foreground">Opgeslagen.</p>}
    </div>
  );
}
