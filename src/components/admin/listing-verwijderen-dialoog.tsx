'use client';

import { useState, useTransition } from 'react';
import { verwijderListing } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ListingVerwijderenDialoog({
  listingId,
  clientId,
  naam,
}: {
  listingId: string;
  clientId: string;
  naam: string;
}) {
  const [open, setOpen] = useState(false);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function verwijderen() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await verwijderListing({ listingId, clientId });
        setOpen(false);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (nieuweOpen) {
      // Zelfde reden als bij ListingBewerkenFormulier: zonder reset zou een oude
      // foutmelding van de vorige keer blijven staan.
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>Verwijderen</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accommodatie verwijderen</DialogTitle>
          <DialogDescription>
            Weet je zeker dat je &quot;{naam}&quot; wilt verwijderen? Dit verwijdert ook de
            nulmeting, het actielog en gesynchroniseerde PriceLabs-data.
          </DialogDescription>
        </DialogHeader>
        {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        <DialogFooter>
          <Button variant="destructive" size="sm" disabled={isPending} onClick={verwijderen}>
            {isPending ? 'Bezig...' : 'Verwijderen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
