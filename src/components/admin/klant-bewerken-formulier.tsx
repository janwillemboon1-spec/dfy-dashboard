'use client';

import { useState, useTransition } from 'react';
import { wijzigKlant } from '@/app/[locale]/admin/klanten/[id]/actions';
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

const STATUSSEN = ['onboarding', 'actief', 'gepauzeerd', 'opgezegd'] as const;

export function KlantBewerkenFormulier({
  clientId,
  naam: huidigeNaam,
  email: huidigeEmail,
  telefoon: huidigeTelefoon,
  status: huidigeStatus,
}: {
  clientId: string;
  naam: string;
  email: string;
  telefoon: string | null;
  status: (typeof STATUSSEN)[number];
}) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState(huidigeNaam);
  const [email, setEmail] = useState(huidigeEmail);
  const [telefoon, setTelefoon] = useState(huidigeTelefoon ?? '');
  const [status, setStatus] = useState<(typeof STATUSSEN)[number]>(huidigeStatus);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await wijzigKlant({ clientId, naam, email, telefoon: telefoon.trim() || null, status });
        setOpen(false);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Bewerken</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Klant bewerken</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Naam</label>
            <Input value={naam} onChange={(e) => setNaam(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">E-mailadres</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Telefoon</label>
            <Input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <select
              className="w-full rounded border border-input bg-background px-2 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSSEN)[number])}
            >
              {STATUSSEN.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={isPending || !naam.trim() || !email.trim()} onClick={opslaan}>
            {isPending ? 'Bezig...' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
