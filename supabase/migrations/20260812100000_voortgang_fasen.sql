create table voortgang_fasen (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  fase_nummer int not null check (fase_nummer between 1 and 3),
  percentage int not null default 0 check (percentage between 0 and 100),
  bijgewerkt_op timestamptz not null default now(),
  unique (client_id, fase_nummer)
);

create index voortgang_fasen_client_id_idx on voortgang_fasen(client_id);

-- Zonder deze expliciete grant kan geen enkele rol (ook niet service_role) deze tabel
-- lezen/schrijven in deze lokale Supabase-omgeving — zie de toelichting bij de
-- vergelijkbare grant in 20260804102114_rls_and_functions.sql.
grant select, insert, update, delete on voortgang_fasen to anon, authenticated, service_role;

alter table voortgang_fasen enable row level security;

create policy "admin volledige toegang voortgang_fasen" on voortgang_fasen
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_fasen" on voortgang_fasen
  for select using (client_id = current_client_id());
