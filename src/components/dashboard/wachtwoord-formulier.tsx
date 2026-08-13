'use client';

import { useState, useTransition } from 'react';
import { wijzigEigenWachtwoord } from '@/app/[locale]/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function WachtwoordFormulier() {
  const [huidigWachtwoord, setHuidigWachtwoord] = useState('');
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState('');
  const [bevestiging, setBevestiging] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    setOpgeslagen(false);
    if (nieuwWachtwoord !== bevestiging) {
      setFoutmelding('De wachtwoorden komen niet overeen.');
      return;
    }
    startTransition(async () => {
      const resultaat = await wijzigEigenWachtwoord({ huidigWachtwoord, nieuwWachtwoord });
      if (!resultaat.succes) {
        setFoutmelding(resultaat.fout ?? 'Onbekende fout bij opslaan.');
        return;
      }
      // Wachtwoordvelden mogen na een geslaagde submit nooit blijven staan — anders dan
      // ContactgegevensFormulier, dat de opgeslagen waarden juist laat staan.
      setHuidigWachtwoord('');
      setNieuwWachtwoord('');
      setBevestiging('');
      setOpgeslagen(true);
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <Label htmlFor="wachtwoord-huidig">Huidig wachtwoord</Label>
        <Input
          id="wachtwoord-huidig"
          type="password"
          autoComplete="current-password"
          value={huidigWachtwoord}
          onChange={(e) => setHuidigWachtwoord(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="wachtwoord-nieuw">Nieuw wachtwoord</Label>
        <Input
          id="wachtwoord-nieuw"
          type="password"
          autoComplete="new-password"
          value={nieuwWachtwoord}
          onChange={(e) => setNieuwWachtwoord(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="wachtwoord-bevestiging">Bevestig nieuw wachtwoord</Label>
        <Input
          id="wachtwoord-bevestiging"
          type="password"
          autoComplete="new-password"
          value={bevestiging}
          onChange={(e) => setBevestiging(e.target.value)}
        />
      </div>
      <Button onClick={opslaan} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Wachtwoord wijzigen'}
      </Button>
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
      {opgeslagen && !foutmelding && <p className="text-sm text-muted-foreground">Wachtwoord gewijzigd.</p>}
    </div>
  );
}
