create table voortgang_todos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  naam text not null,
  deadline date not null,
  afgevinkt boolean not null default false,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_todos_client_id_idx on voortgang_todos(client_id);

grant select, insert, update, delete on voortgang_todos to anon, authenticated, service_role;

alter table voortgang_todos enable row level security;

create policy "admin volledige toegang voortgang_todos" on voortgang_todos
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_todos" on voortgang_todos
  for select using (client_id = current_client_id());
-- Eerste klant-schrijfbare policy in dit systeem: de klant mag de héle rij updaten
-- (RLS kent geen kolom-restrictie), de bescherming dat een klant alleen `afgevinkt`
-- verandert komt van de server-actie (vinkTodoAf), die nooit naam/deadline meestuurt.
create policy "klant vinkt eigen voortgang_todos af" on voortgang_todos
  for update using (client_id = current_client_id()) with check (client_id = current_client_id());
