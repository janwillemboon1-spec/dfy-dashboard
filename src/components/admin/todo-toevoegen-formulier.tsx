'use client';

import { useState, useTransition } from 'react';
import { voegTodoToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STANDAARD_TODO_NAMEN } from '@/lib/constants/todos';
import type { VoortgangListing } from '@/components/portal/voortgang-listing';

export function TodoToevoegenFormulier({
  clientId,
  listings,
}: {
  clientId: string;
  listings: VoortgangListing[];
}) {
  const [naam, setNaam] = useState('');
  const [deadline, setDeadline] = useState('');
  const [listingId, setListingId] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!naam.trim()) {
      setFoutmelding('Naam is verplicht.');
      return;
    }
    if (!deadline) {
      setFoutmelding('Deadline is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegTodoToe({ clientId, naam, deadline, listingId: listingId || null });
        setNaam('');
        setDeadline('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`todo-naam-${clientId}`} className="block text-xs text-muted-foreground">
            Taak
          </label>
          <Input
            id={`todo-naam-${clientId}`}
            list={`todo-suggesties-${clientId}`}
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
          />
          <datalist id={`todo-suggesties-${clientId}`}>
            {STANDAARD_TODO_NAMEN.map((suggestie) => (
              <option key={suggestie} value={suggestie} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor={`todo-deadline-${clientId}`} className="block text-xs text-muted-foreground">
            Deadline
          </label>
          <Input
            id={`todo-deadline-${clientId}`}
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        {listings.length > 1 && (
          <div>
            <label htmlFor={`todo-woning-${clientId}`} className="block text-xs text-muted-foreground">
              Woning
            </label>
            <select
              id={`todo-woning-${clientId}`}
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">Algemeen</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.naam}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button size="sm" disabled={isPending} onClick={toevoegen}>
          {isPending ? 'Bezig...' : '+'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
