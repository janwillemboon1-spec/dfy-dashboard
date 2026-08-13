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

function formatteerDatum(datum: string): string {
  return new Date(`${datum}T00:00:00Z`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function AirbnbFunnelNulmeting({
  clientId,
  listingId,
  listingNaam,
  waarden,
  nulmetingDatum,
  magBewerken,
}: {
  clientId: string;
  listingId: string;
  listingNaam: string;
  waarden: AirbnbFunnelWaarden;
  nulmetingDatum: string | null;
  magBewerken: boolean;
}) {
  const [invoer, setInvoer] = useState(waarden);
  const [datum, setDatum] = useState(nulmetingDatum ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const titel = listingNaam ? `Nulmeting Airbnb funnel — ${listingNaam}` : 'Nulmeting Airbnb funnel';

  if (!magBewerken) {
    return (
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-medium">{titel}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {VELDEN.map((veld) => (
            <div key={veld.sleutel} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{veld.label}</p>
              <p className="text-lg font-bold">
                {waarden[veld.sleutel] !== null ? `${waarden[veld.sleutel]}%` : '—'}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {nulmetingDatum ? `Gemeten op ${formatteerDatum(nulmetingDatum)}` : 'Meetdatum nog niet ingevuld'}
        </p>
      </div>
    );
  }

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await werkAirbnbFunnelNulmetingBij({ clientId, listingId, ...invoer, nulmetingDatum: datum || null });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-sm font-medium">{titel}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {VELDEN.map((veld) => (
          <div key={veld.sleutel} className="bg-card border border-border rounded-xl p-4">
            <label htmlFor={`funnel-${veld.sleutel}-${listingId}`} className="block text-xs text-muted-foreground mb-1">
              {veld.label}
            </label>
            <div className="flex items-center gap-1">
              <Input
                id={`funnel-${veld.sleutel}-${listingId}`}
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
                className="text-lg font-bold"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
      <div>
        <label htmlFor={`funnel-datum-${listingId}`} className="block text-xs text-muted-foreground mb-1">
          Datum van de meting
        </label>
        <Input
          id={`funnel-datum-${listingId}`}
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          className="w-auto"
        />
      </div>
      <Button size="sm" disabled={isPending} onClick={opslaan}>
        {isPending ? 'Bezig...' : 'Opslaan'}
      </Button>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
