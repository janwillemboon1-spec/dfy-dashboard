-- App-brede instellingen, niet per klant — vandaar geen client_id. Er wordt precies één
-- rij verwacht; de server-actie die deze rij beheert (Task 2) doet dat als een upsert
-- (eerst kijken of er al een rij bestaat, dan updaten, anders aanmaken), zodat het ook
-- werkt vóórdat er ooit een rij is aangemaakt.
create table portaal_instellingen (
  id uuid primary key default gen_random_uuid(),
  video_url text,
  formulier_url text,
  gewijzigd_op timestamptz not null default now()
);

-- Zonder deze expliciete grant kan geen enkele rol (ook niet service_role) deze tabel
-- lezen/schrijven in deze lokale Supabase-omgeving — zie de toelichting bij de
-- vergelijkbare grant in 20260804102114_rls_and_functions.sql.
grant select, insert, update, delete on portaal_instellingen to anon, authenticated, service_role;

alter table portaal_instellingen enable row level security;

-- Admin kan de instellingen volledig beheren (lezen, aanmaken, bijwerken).
create policy "admin volledige toegang portaal_instellingen" on portaal_instellingen
  for all using (is_admin()) with check (is_admin());

-- Elke ingelogde gebruiker (klant én admin) mag de instellingen lezen — de "Start
-- hier"-pagina in het klantportaal heeft dit nodig, en de inhoud (twee video-/
-- formulier-links) is niet gevoelig.
create policy "ingelogde gebruikers lezen portaal_instellingen" on portaal_instellingen
  for select to authenticated using (true);
