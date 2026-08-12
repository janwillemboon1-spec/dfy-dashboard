'use client';

import { useState, useTransition } from 'react';
import { ververPricelabsListingsCache } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';

export function PricelabsCacheVerversen({ clientId }: { clientId: string }) {
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function ververs() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await ververPricelabsListingsCache(clientId);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={ververs} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Ververs PriceLabs-lijst'}
      </Button>
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
    </div>
  );
}
