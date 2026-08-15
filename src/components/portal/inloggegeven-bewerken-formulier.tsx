'use client';

import { useState, useTransition } from 'react';
import { wijzigInloggegeven } from '@/lib/inloggegevens/acties';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Inloggegeven } from './inloggegeven-rij';

export function InloggegevenBewerkenFormulier({ item }: { item: Inloggegeven }) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState(item.naam);
  const [gebruikersnaam, setGebruikersnaam] = useState(item.gebruikersnaam ?? '');
  const [wachtwoord, setWachtwoord] = useState('');
  const [notitie, setNotitie] = useState(item.notitie ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await wijzigInloggegeven({
          id: item.id,
          naam: naam.trim(),
          gebruikersnaam: gebruikersnaam.trim() || null,
          wachtwoord,
          notitie: notitie.trim() || null,
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
      // Zelfde reden als bij andere bewerk-dialogen in dit project: deze component blijft
      // gemonteerd terwijl alleen de dialoog zelf sluit/opent, dus zonder reset zou een
      // niet-opgeslagen bewerking of een oude foutmelding blijven staan. Het wachtwoordveld
      // begint bewust leeg (zie hint hieronder) — nooit vooraf ontsleuteld.
      setNaam(item.naam);
      setGebruikersnaam(item.gebruikersnaam ?? '');
      setWachtwoord('');
      setNotitie(item.notitie ?? '');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Bewerken</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inloggegeven bewerken</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="inloggegeven-bewerk-naam">Naam</Label>
            <Input id="inloggegeven-bewerk-naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="inloggegeven-bewerk-gebruikersnaam">Gebruikersnaam / e-mail</Label>
            <Input
              id="inloggegeven-bewerk-gebruikersnaam"
              value={gebruikersnaam}
              onChange={(e) => setGebruikersnaam(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-bewerk-wachtwoord">Wachtwoord</Label>
            <Input
              id="inloggegeven-bewerk-wachtwoord"
              type="password"
              autoComplete="new-password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
              placeholder="Laat leeg om het huidige wachtwoord te behouden"
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-bewerk-notitie">Notitie</Label>
            <Input id="inloggegeven-bewerk-notitie" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
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
