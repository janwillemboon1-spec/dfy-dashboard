'use client';

import { useState, useTransition } from 'react';
import { voegInloggegevenToe } from '@/lib/inloggegevens/acties';
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

export function InloggegevenToevoegenFormulier() {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState('');
  const [gebruikersnaam, setGebruikersnaam] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [notitie, setNotitie] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await voegInloggegevenToe({
          naam: naam.trim(),
          gebruikersnaam: gebruikersnaam.trim() || null,
          wachtwoord,
          notitie: notitie.trim() || null,
        });
        setOpen(false);
        setNaam('');
        setGebruikersnaam('');
        setWachtwoord('');
        setNotitie('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (!nieuweOpen) {
      setNaam('');
      setGebruikersnaam('');
      setWachtwoord('');
      setNotitie('');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button size="sm" />}>+ Inloggegeven toevoegen</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inloggegeven toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="inloggegeven-naam">Naam</Label>
            <Input id="inloggegeven-naam" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Airbnb" />
          </div>
          <div>
            <Label htmlFor="inloggegeven-gebruikersnaam">Gebruikersnaam / e-mail (optioneel)</Label>
            <Input
              id="inloggegeven-gebruikersnaam"
              value={gebruikersnaam}
              onChange={(e) => setGebruikersnaam(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-wachtwoord">Wachtwoord</Label>
            <Input
              id="inloggegeven-wachtwoord"
              type="password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-notitie">Notitie (optioneel)</Label>
            <Input id="inloggegeven-notitie" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={isPending || !naam.trim() || !wachtwoord.trim()} onClick={toevoegen}>
            {isPending ? 'Bezig...' : 'Toevoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
