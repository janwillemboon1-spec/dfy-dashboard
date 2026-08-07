'use client';

import { useState, useTransition } from 'react';
import { berekenNulmetingUitPricelabs } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAAND_NAMEN_VOL } from '@/lib/constants/maanden';

export function SamenwerkingNulmetingForm({
  listingId,
  clientId,
  pricelabsListingId,
  samenwerkingGestart,
  heeftBestaandeNulmeting,
}: {
  listingId: string;
  clientId: string;
  pricelabsListingId: string | null;
  samenwerkingGestart: string | null;
  heeftBestaandeNulmeting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [maand, setMaand] = useState(samenwerkingGestart ? samenwerkingGestart.slice(0, 7) : '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [succesmelding, setSuccesmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function berekenen() {
    setFoutmelding(null);

    if (!maand) {
      setFoutmelding('Kies eerst een maand.');
      return;
    }

    if (heeftBestaandeNulmeting) {
      const bevestigd = window.confirm('Dit overschrijft de volledige bestaande nulmeting. Doorgaan?');
      if (!bevestigd) return;
    }

    startTransition(async () => {
      try {
        const resultaat = await berekenNulmetingUitPricelabs({
          listingId,
          clientId,
          samenwerkingGestart: `${maand}-01`,
        });
        const eerste = resultaat.maanden[0];
        const laatste = resultaat.maanden[resultaat.maanden.length - 1];
        setSuccesmelding(
          `Nulmeting berekend: ${MAAND_NAMEN_VOL[eerste.maand - 1]} ${eerste.jaar} t/m ${MAAND_NAMEN_VOL[laatste.maand - 1]} ${laatste.jaar}.`
        );
        setOpen(false);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <Button
          size="sm"
          variant="outline"
          disabled={!pricelabsListingId}
          title={pricelabsListingId ? undefined : 'Koppel eerst deze accommodatie aan PriceLabs.'}
          onClick={() => setOpen(true)}
        >
          Nulmeting (her)berekenen
        </Button>
        {succesmelding && <p className="text-sm text-muted-foreground">{succesmelding}</p>}
        {!pricelabsListingId && (
          <p className="text-sm text-muted-foreground">Koppel eerst deze accommodatie aan PriceLabs.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <label htmlFor={`samenwerking-gestart-${listingId}`} className="block text-xs text-muted-foreground">
        Samenwerking gestart in
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={`samenwerking-gestart-${listingId}`}
          type="month"
          value={maand}
          onChange={(e) => setMaand(e.target.value)}
          className="w-auto"
        />
        <Button size="sm" disabled={isPending} onClick={berekenen}>
          {isPending ? 'Bezig...' : 'Berekenen'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuleren
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
