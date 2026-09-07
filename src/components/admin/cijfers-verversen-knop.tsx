'use client';

import { useState, useTransition } from 'react';
import { ververCijfersVoorKlant } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';

export function CijfersVerversenKnop({ clientId }: { clientId: string }) {
  const [resultaat, setResultaat] = useState<string | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function ververs() {
    setFoutmelding(null);
    setResultaat(null);
    startTransition(async () => {
      try {
        const resultaten = await ververCijfersVoorKlant(clientId);

        if (resultaten.length === 0) {
          setResultaat('Geen gekoppelde accommodaties om te verversen.');
          return;
        }

        const geslaagd = resultaten.filter((r) => r.succes).length;
        const mislukt = resultaten.filter((r) => !r.succes);

        if (mislukt.length === 0) {
          setResultaat(`${geslaagd} van ${resultaten.length} accommodaties bijgewerkt.`);
        } else {
          setResultaat(
            `${geslaagd} van ${resultaten.length} accommodaties bijgewerkt. Mislukt: ${mislukt
              .map((r) => `${r.listingNaam} (${r.fout})`)
              .join(', ')}`
          );
        }
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={ververs} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Cijfers verversen'}
      </Button>
      {resultaat && <p className="text-sm text-muted-foreground">{resultaat}</p>}
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
    </div>
  );
}
