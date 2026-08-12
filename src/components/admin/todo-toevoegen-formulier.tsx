'use client';

import { useState, useTransition } from 'react';
import { voegTodoToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STANDAARD_TODO_NAMEN } from '@/lib/constants/todos';

export function TodoToevoegenFormulier({ clientId }: { clientId: string }) {
  const [naam, setNaam] = useState('');
  const [deadline, setDeadline] = useState('');
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
        await voegTodoToe({ clientId, naam, deadline });
        setNaam('');
        setDeadline('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-end gap-2">
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
        <Button size="sm" disabled={isPending} onClick={toevoegen}>
          {isPending ? 'Bezig...' : '+'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
