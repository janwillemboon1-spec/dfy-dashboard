'use client';

import { useState, useTransition } from 'react';
import { voegChecklistItemToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FASE_NAMEN } from '@/lib/constants/fasen';

export function ChecklistItemToevoegenFormulier({ clientId }: { clientId: string }) {
  const [faseNummer, setFaseNummer] = useState<1 | 2 | 3>(1);
  const [naam, setNaam] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!naam.trim()) {
      setFoutmelding('Naam is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegChecklistItemToe({ clientId, faseNummer, naam });
        setNaam('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor={`checklist-fase-${clientId}`} className="block text-xs text-muted-foreground">
            Fase
          </label>
          <select
            id={`checklist-fase-${clientId}`}
            value={faseNummer}
            onChange={(e) => setFaseNummer(Number(e.target.value) as 1 | 2 | 3)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {FASE_NAMEN.map((naamOptie, i) => (
              <option key={naamOptie} value={i + 1}>
                {i + 1}. {naamOptie}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor={`checklist-naam-${clientId}`} className="block text-xs text-muted-foreground">
            Naam
          </label>
          <Input id={`checklist-naam-${clientId}`} value={naam} onChange={(e) => setNaam(e.target.value)} />
        </div>
        <Button size="sm" disabled={isPending} onClick={toevoegen}>
          {isPending ? 'Bezig...' : '+'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
