'use client';

import { useState, useTransition } from 'react';
import { voegAccommodatieToe } from '@/app/[locale]/admin/klanten/[id]/actions';
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

export function ListingToevoegenFormulier({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState('');
  const [adres, setAdres] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await voegAccommodatieToe({ clientId, naam: naam.trim(), adres: adres.trim() || null });
        setOpen(false);
        setNaam('');
        setAdres('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (!nieuweOpen) {
      setNaam('');
      setAdres('');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>+ Accommodatie toevoegen</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accommodatie toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Naam</label>
            <Input value={naam} onChange={(e) => setNaam(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Adres (optioneel)</label>
            <Input value={adres} onChange={(e) => setAdres(e.target.value)} />
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={isPending || !naam.trim()} onClick={toevoegen}>
            {isPending ? 'Bezig...' : 'Toevoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
