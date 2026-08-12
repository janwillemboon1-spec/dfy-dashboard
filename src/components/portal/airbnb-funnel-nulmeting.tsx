'use client';

import { useState, useTransition } from 'react';
import { werkAirbnbFunnelNulmetingBij } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AirbnbFunnelWaarden {
  gemiddeldConversiepercentage: number | null;
  percentageZoekvertoningenEerstePagina: number | null;
  conversieZoekopdrachtNaarAdvertentie: number | null;
  conversieAdvertentieNaarBoeking: number | null;
}

const VELDEN: { sleutel: keyof AirbnbFunnelWaarden; label: string }[] = [
  { sleutel: 'gemiddeldConversiepercentage', label: 'Gemiddelde totale conversiepercentage' },
  { sleutel: 'percentageZoekvertoningenEerstePagina', label: 'Percentage zoekvertoningen op de eerste pagina' },
  { sleutel: 'conversieZoekopdrachtNaarAdvertentie', label: 'Gemiddelde conversie van zoekopdracht naar advertentie' },
  { sleutel: 'conversieAdvertentieNaarBoeking', label: 'Gemiddelde conversie van advertentie naar boeking' },
];

export function AirbnbFunnelNulmeting({
  clientId,
  waarden,
  magBewerken,
}: {
  clientId: string;
  waarden: AirbnbFunnelWaarden;
  magBewerken: boolean;
}) {
  const [invoer, setInvoer] = useState(waarden);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!magBewerken) {
    return (
      <div className="mt-6 space-y-1 text-sm">
        <h3 className="font-medium">Nulmeting Airbnb funnel</h3>
        {VELDEN.map((veld) => (
          <p key={veld.sleutel} className="text-muted-foreground">
            {veld.label}: {waarden[veld.sleutel] !== null ? `${waarden[veld.sleutel]}%` : 'Nog niet ingevuld'}
          </p>
        ))}
      </div>
    );
  }

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await werkAirbnbFunnelNulmetingBij({ clientId, ...invoer });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <h3 className="font-medium">Nulmeting Airbnb funnel</h3>
      {VELDEN.map((veld) => (
        <div key={veld.sleutel} className="flex items-center gap-2">
          <label htmlFor={`funnel-${veld.sleutel}-${clientId}`} className="flex-1 text-xs text-muted-foreground">
            {veld.label}
          </label>
          <Input
            id={`funnel-${veld.sleutel}-${clientId}`}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={invoer[veld.sleutel] ?? ''}
            onChange={(e) =>
              setInvoer((huidig) => ({
                ...huidig,
                [veld.sleutel]: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
            className="w-24"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      ))}
      <Button size="sm" disabled={isPending} onClick={opslaan}>
        {isPending ? 'Bezig...' : 'Opslaan'}
      </Button>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
