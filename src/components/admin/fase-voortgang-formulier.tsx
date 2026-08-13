'use client';

import { useState, useTransition } from 'react';
import { werkFaseVoortgangBij } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FASE_NAMEN } from '@/lib/constants/fasen';

export function FaseVoortgangFormulier({ clientId }: { clientId: string }) {
  const [faseNummer, setFaseNummer] = useState<1 | 2 | 3>(1);
  const [percentage, setPercentage] = useState(0);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function bijwerken() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await werkFaseVoortgangBij({ clientId, faseNummer, percentage });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`fase-select-${clientId}`} className="block text-xs text-muted-foreground">
            Fase
          </label>
          <select
            id={`fase-select-${clientId}`}
            value={faseNummer}
            onChange={(e) => setFaseNummer(Number(e.target.value) as 1 | 2 | 3)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {FASE_NAMEN.map((naam, i) => (
              <option key={naam} value={i + 1}>
                {i + 1}. {naam}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`fase-percentage-${clientId}`} className="block text-xs text-muted-foreground">
            Percentage
          </label>
          <Input
            id={`fase-percentage-${clientId}`}
            type="number"
            min={0}
            max={100}
            value={percentage}
            onChange={(e) => setPercentage(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <Button size="sm" disabled={isPending} onClick={bijwerken}>
          {isPending ? 'Bezig...' : 'Bijwerken'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
