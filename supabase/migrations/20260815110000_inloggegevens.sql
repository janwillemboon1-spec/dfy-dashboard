-- Inloggegevens die een klant met de admin deelt (bv. voor Airbnb of een PMS-systeem),
-- t.b.v. koppelingen zoals PriceLabs. Het wachtwoord wordt versleuteld opgeslagen (zie
-- src/lib/inloggegevens/versleuteling.ts) — deze kolom bevat dus nooit platte tekst.
create table inloggegevens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  naam text not null,
  gebruikersnaam text,
  wachtwoord_versleuteld text not null,
  notitie text,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_op timestamptz not null default now()
);

create index inloggegevens_client_id_idx on inloggegevens(client_id);

grant select, insert, update, delete on inloggegevens to anon, authenticated, service_role;

alter table inloggegevens enable row level security;

-- Klant beheert alleen eigen items volledig (aanmaken, lezen, wijzigen, verwijderen).
create policy "klant volledige toegang eigen inloggegevens" on inloggegevens
  for all using (client_id = current_client_id()) with check (client_id = current_client_id());

-- Admin leest alle items, maar mag ze niet zelf aanmaken/wijzigen/verwijderen — dit blijft
-- puur iets dat de klant met de admin deelt.
create policy "admin leest inloggegevens" on inloggegevens
  for select using (is_admin());
