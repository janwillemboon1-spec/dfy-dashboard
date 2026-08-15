'use client';

import { useState, useTransition } from 'react';
import { onthulWachtwoord, verwijderInloggegeven } from '@/lib/inloggegevens/acties';
import { Button } from '@/components/ui/button';
import { InloggegevenBewerkenFormulier } from './inloggegeven-bewerken-formulier';

export interface Inloggegeven {
  id: string;
  naam: string;
  gebruikersnaam: string | null;
  notitie: string | null;
}

export function InloggegevenRij({ item, kanBewerken }: { item: Inloggegeven; kanBewerken: boolean }) {
  const [wachtwoord, setWachtwoord] = useState<string | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function wachtwoordKnop() {
    if (wachtwoord !== null) {
      setWachtwoord(null);
      return;
    }
    setFoutmelding(null);
    startTransition(async () => {
      const resultaat = await onthulWachtwoord({ id: item.id });
      if (!resultaat.succes) {
        setFoutmelding(resultaat.fout ?? 'Kon wachtwoord niet onthullen.');
        return;
      }
      setWachtwoord(resultaat.wachtwoord ?? null);
    });
  }

  function verwijderen() {
    const bevestigd = window.confirm(`Weet je zeker dat je "${item.naam}" wilt verwijderen?`);
    if (!bevestigd) return;
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await verwijderInloggegeven({ id: item.id });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{item.naam}</h3>
        {kanBewerken && (
          <div className="flex gap-1">
            <InloggegevenBewerkenFormulier item={item} />
            <Button size="sm" variant="ghost" onClick={verwijderen} disabled={isPending}>
              Verwijderen
            </Button>
          </div>
        )}
      </div>
      {item.gebruikersnaam && (
        <p className="text-sm text-muted-foreground">Gebruikersnaam: {item.gebruikersnaam}</p>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Wachtwoord:</span>
        <span className="font-mono">{wachtwoord !== null ? wachtwoord : '••••••••'}</span>
        <Button size="sm" variant="ghost" onClick={wachtwoordKnop} disabled={isPending}>
          {isPending ? 'Bezig...' : wachtwoord !== null ? 'Verberg' : 'Toon'}
        </Button>
      </div>
      {item.notitie && <p className="text-sm text-muted-foreground">{item.notitie}</p>}
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
    </div>
  );
}
