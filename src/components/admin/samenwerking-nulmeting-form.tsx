'use client';

import { useState, useTransition } from 'react';
import { berekenNulmetingUitPricelabs, type NulmetingMaandResultaat } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAAND_NAMEN_KORT } from '@/lib/constants/maanden';

export function SamenwerkingNulmetingForm({
  listingId,
  clientId,
  pricelabsListingId,
  samenwerkingGestart,
  nulmetingJaren,
}: {
  listingId: string;
  clientId: string;
  pricelabsListingId: string | null;
  samenwerkingGestart: string | null;
  // Platte array i.p.v. een callback-prop: Server Components kunnen geen functies
  // doorgeven aan Client Components (niet serialiseerbaar over die grens in Next.js
  // App Router) — de "heeft dit jaar al nulmeting?"-check gebeurt daarom hier zelf.
  nulmetingJaren: number[];
}) {
  const [datum, setDatum] = useState(samenwerkingGestart ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [resultaat, setResultaat] = useState<{ jaar: number; maanden: NulmetingMaandResultaat[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  function berekenen() {
    setFoutmelding(null);
    setResultaat(null);

    if (!datum) {
      setFoutmelding('Kies eerst een datum.');
      return;
    }

    const jaar = Number(datum.slice(0, 4));
    if (nulmetingJaren.includes(jaar)) {
      const bevestigd = window.confirm(`Dit overschrijft de bestaande nulmeting voor ${jaar}. Doorgaan?`);
      if (!bevestigd) return;
    }

    startTransition(async () => {
      try {
        const nieuwResultaat = await berekenNulmetingUitPricelabs({
          listingId,
          clientId,
          samenwerkingGestart: datum,
        });
        setResultaat(nieuwResultaat);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <label htmlFor={`samenwerking-gestart-${listingId}`} className="block text-xs text-muted-foreground">
        Samenwerking gestart op
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={`samenwerking-gestart-${listingId}`}
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          className="w-auto"
        />
        <Button
          size="sm"
          disabled={isPending || !pricelabsListingId}
          title={pricelabsListingId ? undefined : 'Koppel eerst deze accommodatie aan PriceLabs.'}
          onClick={berekenen}
        >
          {isPending ? 'Bezig...' : 'Nulmeting berekenen uit PriceLabs'}
        </Button>
      </div>

      {!pricelabsListingId && (
        <p className="text-muted-foreground">Koppel eerst deze accommodatie aan PriceLabs.</p>
      )}
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}

      {resultaat && (
        <div className="space-y-1">
          <p className="font-medium">Nulmeting {resultaat.jaar} berekend:</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            {resultaat.maanden.map((m) => (
              <li key={m.maand} className={m.leeg ? 'text-destructive' : 'text-muted-foreground'}>
                {MAAND_NAMEN_KORT[m.maand - 1]}: {m.bron === 'echt' ? 'echt' : 'STLY'}
                {m.leeg ? ' — geen data gevonden' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
