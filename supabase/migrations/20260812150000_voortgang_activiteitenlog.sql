create table voortgang_activiteitenlog (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  datum date not null,
  omschrijving text not null,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_activiteitenlog_client_id_idx on voortgang_activiteitenlog(client_id);

grant select, insert, update, delete on voortgang_activiteitenlog to anon, authenticated, service_role;

alter table voortgang_activiteitenlog enable row level security;

create policy "admin volledige toegang voortgang_activiteitenlog" on voortgang_activiteitenlog
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_activiteitenlog" on voortgang_activiteitenlog
  for select using (client_id = current_client_id());

-- Bewust geen insert-policy voor de klant: automatische logregels (hieronder) ontstaan via
-- `security definer`-triggers, die RLS omzeilen — dezelfde aanpak als de bestaande
-- `seed_standaard_checklist_items`-trigger op de `clients`-tabel.

create or replace function log_checklist_item_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    current_date,
    case when new.afgevinkt
      then 'Checklist-item afgevinkt: ' || new.naam
      else 'Checklist-item uitgevinkt: ' || new.naam
    end,
    auth.uid()
  );
  return new;
end;
$$;

revoke execute on function log_checklist_item_afgevinkt() from public, anon, authenticated;

create trigger voortgang_checklist_items_log_afgevinkt
  after update of afgevinkt on voortgang_checklist_items
  for each row
  when (old.afgevinkt is distinct from new.afgevinkt)
  execute function log_checklist_item_afgevinkt();

create or replace function log_todo_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    current_date,
    case when new.afgevinkt
      then 'To-do afgevinkt: ' || new.naam
      else 'To-do uitgevinkt: ' || new.naam
    end,
    auth.uid()
  );
  return new;
end;
$$;

revoke execute on function log_todo_afgevinkt() from public, anon, authenticated;

create trigger voortgang_todos_log_afgevinkt
  after update of afgevinkt on voortgang_todos
  for each row
  when (old.afgevinkt is distinct from new.afgevinkt)
  execute function log_todo_afgevinkt();

create or replace function log_todo_toegevoegd()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, datum, omschrijving, toegevoegd_door)
  values (new.client_id, current_date, 'Nieuwe taak toegevoegd: ' || new.naam, auth.uid());
  return new;
end;
$$;

revoke execute on function log_todo_toegevoegd() from public, anon, authenticated;

create trigger voortgang_todos_log_toegevoegd
  after insert on voortgang_todos
  for each row execute function log_todo_toegevoegd();
