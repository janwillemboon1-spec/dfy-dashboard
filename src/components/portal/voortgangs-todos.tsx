import { TodoRij, type Todo } from './todo-rij';
import type { VoortgangListing } from './voortgang-listing';

export function VoortgangsTodos({
  todos,
  clientId,
  isAdmin,
  listings,
}: {
  todos: Todo[];
  clientId: string;
  isAdmin: boolean;
  listings: VoortgangListing[];
}) {
  const gesorteerd = [...todos].sort((a, b) => (a.deadline < b.deadline ? -1 : 1));

  if (gesorteerd.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen to-do&apos;s.</p>;
  }

  return (
    <ul className="space-y-2">
      {gesorteerd.map((todo) => (
        <li key={todo.id}>
          <TodoRij clientId={clientId} todo={todo} isAdmin={isAdmin} listings={listings} />
        </li>
      ))}
    </ul>
  );
}
