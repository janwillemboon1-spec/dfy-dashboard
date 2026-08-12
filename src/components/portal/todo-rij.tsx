'use client';

import { useState, useTransition } from 'react';
import { vinkTodoAf, wijzigTodo, verwijderTodo } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface Todo {
  id: string;
  naam: string;
  deadline: string;
  afgevinkt: boolean;
}

function formatteerDeadline(deadline: string): string {
  return new Date(`${deadline}T00:00:00Z`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function TodoRij({
  clientId,
  todo,
  isAdmin,
}: {
  clientId: string;
  todo: Todo;
  isAdmin: boolean;
}) {
  const [bewerken, setBewerken] = useState(false);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleAfvinken() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await vinkTodoAf({ clientId, todoId: todo.id, afgevinkt: !todo.afgevinkt });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function verwijder() {
    const bevestigd = window.confirm(`Weet je zeker dat je "${todo.naam}" wilt verwijderen?`);
    if (!bevestigd) return;
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await verwijderTodo({ clientId, todoId: todo.id });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  if (bewerken) {
    return <TodoBewerkRij clientId={clientId} todo={todo} onKlaar={() => setBewerken(false)} />;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={todo.afgevinkt} disabled={isPending} onChange={toggleAfvinken} />
      <span className={todo.afgevinkt ? 'line-through text-muted-foreground' : ''}>{todo.naam}</span>
      <span className="text-xs text-muted-foreground">— {formatteerDeadline(todo.deadline)}</span>
      {isAdmin && (
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setBewerken(true)}>
            Bewerken
          </Button>
          <Button size="sm" variant="ghost" onClick={verwijder} disabled={isPending}>
            Verwijderen
          </Button>
        </div>
      )}
      {foutmelding && <p className="text-xs text-destructive">{foutmelding}</p>}
    </div>
  );
}

function TodoBewerkRij({
  clientId,
  todo,
  onKlaar,
}: {
  clientId: string;
  todo: Todo;
  onKlaar: () => void;
}) {
  const [naam, setNaam] = useState(todo.naam);
  const [deadline, setDeadline] = useState(todo.deadline);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await wijzigTodo({ clientId, todoId: todo.id, naam, deadline });
        onKlaar();
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Input value={naam} onChange={(e) => setNaam(e.target.value)} className="flex-1" />
      <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-auto" />
      <Button size="sm" disabled={isPending} onClick={opslaan}>
        Opslaan
      </Button>
      <Button size="sm" variant="ghost" onClick={onKlaar}>
        Annuleren
      </Button>
      {foutmelding && <p className="text-xs text-destructive">{foutmelding}</p>}
    </div>
  );
}
