'use client';

import { useState, useTransition } from 'react';
import { wijzigListing } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ListingBewerkenFormulier({
  listingId,
  clientId,
  naam: huidigeNaam,
  adres: huidigAdres,
  airbnbUrl: huidigeAirbnbUrl,
}: {
  listingId: string;
  clientId: string;
  naam: string;
  adres: string | null;
  airbnbUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState(huidigeNaam);
  const [adres, setAdres] = useState(huidigAdres ?? '');
  const [airbnbUrl, setAirbnbUrl] = useState(huidigeAirbnbUrl ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await wijzigListing({
          listingId,
          clientId,
          naam: naam.trim(),
          adres: adres.trim() || null,
          airbnbUrl: airbnbUrl.trim() || null,
        });
        setOpen(false);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (nieuweOpen) {
      // Deze component blijft gemonteerd terwijl alleen de dialoog zelf sluit/opent,
      // dus zonder reset zou een niet-opgeslagen bewerking of een oude foutmelding van
      // de vorige keer blijven staan.
      setNaam(huidigeNaam);
      setAdres(huidigAdres ?? '');
      setAirbnbUrl(huidigeAirbnbUrl ?? '');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Bewerken</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accommodatie bewerken</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Naam</label>
            <Input value={naam} onChange={(e) => setNaam(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Adres</label>
            <Input value={adres} onChange={(e) => setAdres(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Airbnb-URL</label>
            <Input value={airbnbUrl} onChange={(e) => setAirbnbUrl(e.target.value)} />
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={isPending || !naam.trim()} onClick={opslaan}>
            {isPending ? 'Bezig...' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
