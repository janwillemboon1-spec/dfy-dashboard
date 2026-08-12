import { TodoRij, type Todo } from './todo-rij';

export function VoortgangsTodos({
  todos,
  clientId,
  isAdmin,
}: {
  todos: Todo[];
  clientId: string;
  isAdmin: boolean;
}) {
  const gesorteerd = [...todos].sort((a, b) => (a.deadline < b.deadline ? -1 : 1));

  if (gesorteerd.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen to-do&apos;s.</p>;
  }

  return (
    <ul className="space-y-2">
      {gesorteerd.map((todo) => (
        <li key={todo.id}>
          <TodoRij clientId={clientId} todo={todo} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  );
}
