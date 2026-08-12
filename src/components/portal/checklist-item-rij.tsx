'use client';

import { useState, useTransition } from 'react';
import { vinkChecklistItemAf } from '@/app/[locale]/admin/klanten/[id]/actions';

export function ChecklistItemRij({
  clientId,
  itemId,
  faseNummer,
  naam,
  afgevinkt,
  magBewerken,
}: {
  clientId: string;
  itemId: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
  afgevinkt: boolean;
  magBewerken: boolean;
}) {
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!magBewerken) {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden>{afgevinkt ? '☑' : '☐'}</span>
        {naam}
      </span>
    );
  }

  function toggle() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await vinkChecklistItemAf({ clientId, itemId, faseNummer, afgevinkt: !afgevinkt });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={afgevinkt} disabled={isPending} onChange={toggle} />
        {naam}
      </label>
      {foutmelding && <p className="text-xs text-destructive">{foutmelding}</p>}
    </div>
  );
}
