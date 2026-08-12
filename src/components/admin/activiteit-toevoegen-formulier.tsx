'use client';

import { useState, useTransition } from 'react';
import { voegActiviteitToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ActiviteitToevoegenFormulier({ clientId }: { clientId: string }) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [omschrijving, setOmschrijving] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!omschrijving.trim()) {
      setFoutmelding('Omschrijving is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegActiviteitToe({ clientId, datum, omschrijving });
        setOmschrijving('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3 text-sm">
      <div>
        <label htmlFor={`activiteit-datum-${clientId}`} className="block text-xs text-muted-foreground">
          Datum
        </label>
        <Input
          id={`activiteit-datum-${clientId}`}
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
        />
      </div>
      <div className="min-w-[200px] flex-1">
        <label htmlFor={`activiteit-omschrijving-${clientId}`} className="block text-xs text-muted-foreground">
          Omschrijving
        </label>
        <Input
          id={`activiteit-omschrijving-${clientId}`}
          value={omschrijving}
          onChange={(e) => setOmschrijving(e.target.value)}
        />
      </div>
      <Button size="sm" disabled={isPending} onClick={toevoegen}>
        {isPending ? 'Bezig...' : '+'}
      </Button>
      {foutmelding && <p className="w-full text-destructive">{foutmelding}</p>}
    </div>
  );
}
