create table voortgang_checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  fase_nummer int not null check (fase_nummer between 1 and 3),
  naam text not null,
  afgevinkt boolean not null default false,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_checklist_items_client_id_idx on voortgang_checklist_items(client_id);

grant select, insert, update, delete on voortgang_checklist_items to anon, authenticated, service_role;

alter table voortgang_checklist_items enable row level security;

create policy "admin volledige toegang voortgang_checklist_items" on voortgang_checklist_items
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_checklist_items" on voortgang_checklist_items
  for select using (client_id = current_client_id());

-- Eén bron van waarheid voor de standaard-checklist (20 items), hergebruikt door zowel de
-- eenmalige backfill hieronder als de trigger voor nieuwe klanten — zodat de lijst niet op
-- twee plekken in sync gehouden hoeft te worden.
create or replace function standaard_checklist_items()
returns table(fase_nummer int, naam text)
language sql
immutable
as $$
  select * from (values
    (1, 'Koppeling met dynamic pricing software tot stand gebracht'),
    (1, 'Dashboard geactiveerd'),
    (1, 'Klant geïnformeerd'),
    (1, 'Live gegaan'),
    (2, 'Concurrentie analyse'),
    (2, 'Reviews geanalyseerd'),
    (2, 'Antwoordstrategie bepaald'),
    (2, 'Host profiel beoordeeld'),
    (3, 'Advertentietitel geanalyseerd'),
    (3, 'Omschrijving herschreven'),
    (3, 'Foto''s beoordeeld en aanbevelingen gegeven'),
    (3, 'Voorzieningenlijst gecontroleerd'),
    (3, 'Huisregels gecheckt'),
    (3, 'Alles gereviewed'),
    (3, 'Basisprijs ingesteld'),
    (3, 'Weekendtoeslag geconfigureerd'),
    (3, 'Seizoensprijzen ingesteld'),
    (3, 'Minimum nachten bepaald'),
    (3, 'Last-minute korting ingesteld'),
    (3, 'Nulmeting Airbnb funnel')
  ) as v(fase_nummer, naam);
$$;

revoke execute on function standaard_checklist_items() from public, anon, authenticated;

-- Backfill: elke klant die al bestaat krijgt de standaard-checklist meteen.
insert into voortgang_checklist_items (client_id, fase_nummer, naam)
select c.id, v.fase_nummer, v.naam
from clients c
cross join standaard_checklist_items() v;

-- Trigger: elke nieuw aangemaakte klant krijgt dezelfde standaard-checklist automatisch,
-- ongeacht via welke weg de klant wordt aangemaakt (nieuwe-klant-formulier, CSV-import, enz.)
-- — de trigger zit op tabelniveau, niet in één specifieke server-actie.
create or replace function seed_standaard_checklist_items()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_checklist_items (client_id, fase_nummer, naam)
  select new.id, v.fase_nummer, v.naam
  from standaard_checklist_items() v;
  return new;
end;
$$;

revoke execute on function seed_standaard_checklist_items() from public, anon, authenticated;

create trigger clients_seed_standaard_checklist
  after insert on clients
  for each row execute function seed_standaard_checklist_items();
