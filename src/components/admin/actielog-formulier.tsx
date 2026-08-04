'use client';

import { useState, useTransition } from 'react';
import { voegActielogToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TYPES = ['prijsregel', 'foto', 'titel', 'overig'];

export function ActielogFormulier({ listingId, clientId }: { listingId: string; clientId: string }) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [omschrijving, setOmschrijving] = useState('');
  const [type, setType] = useState('overig');
  const [isPending, startTransition] = useTransition();

  function versturen() {
    if (!omschrijving.trim()) return;
    startTransition(async () => {
      await voegActielogToe({ listingId, clientId, datum, omschrijving, type });
      setOmschrijving('');
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-border p-3">
      <div>
        <label className="text-xs text-muted-foreground">Datum</label>
        <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Type</label>
        <select
          className="rounded border border-input bg-background px-2 py-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="text-xs text-muted-foreground">Omschrijving</label>
        <Input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
      </div>
      <Button size="sm" disabled={isPending || !omschrijving.trim()} onClick={versturen}>Toevoegen</Button>
    </div>
  );
}
