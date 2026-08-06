'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { verwijderKlant } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function KlantVerwijderenDialoog({ clientId, naam }: { clientId: string; naam: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bevestiging, setBevestiging] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function verwijderen() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await verwijderKlant({ clientId });
        router.push('/admin/klanten');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (nieuweOpen) {
      // Zelfde reden als bij KlantBewerkenFormulier: deze component blijft gemonteerd
      // terwijl alleen de dialoog zelf sluit/opent, dus zonder reset zou een eerder
      // getypte bevestiging of foutmelding blijven staan.
      setBevestiging('');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>Verwijderen</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Klant verwijderen</DialogTitle>
          <DialogDescription>
            Dit verwijdert &quot;{naam}&quot; permanent, inclusief alle accommodaties, nulmeting,
            actielog en het inlogaccount. Dit kan niet ongedaan worden gemaakt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">
              Typ &quot;{naam}&quot; ter bevestiging
            </label>
            <Input value={bevestiging} onChange={(e) => setBevestiging(e.target.value)} />
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending || bevestiging.trim() !== naam.trim()}
            onClick={verwijderen}
          >
            {isPending ? 'Bezig...' : 'Definitief verwijderen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
