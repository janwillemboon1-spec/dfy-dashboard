-- Nodig omdat reservation_data een pms-parameter vereist (bv. "hostaway"); de sync
-- leest dit op via een join op pricelabs_listing_id i.p.v. het te dupliceren op listings.
alter table pricelabs_listings_cache add column pms text;

-- Voorkomt dat dezelfde PriceLabs-listing per ongeluk aan twee klant-accommodaties
-- gekoppeld wordt.
create unique index listings_pricelabs_listing_id_idx
  on listings (pricelabs_listing_id)
  where pricelabs_listing_id is not null;

create table monthly_actuals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  jaar int not null,
  maand int not null check (maand between 1 and 12),
  omzet numeric(10,2) not null,
  bezetting numeric(5,2) not null check (bezetting between 0 and 100),
  laatst_gesynchroniseerd timestamptz not null default now(),
  unique (listing_id, jaar, maand)
);

create index monthly_actuals_listing_id_idx on monthly_actuals(listing_id);

alter table monthly_actuals enable row level security;

-- Bewust nog geen klant-leespolicy — dat hoort bij de latere dashboard-spec (zie
-- "Open punten" in de spec). Alleen admin kan deze tabel voorlopig lezen/schrijven.
create policy "admin volledige toegang monthly_actuals" on monthly_actuals
  for all using (is_admin()) with check (is_admin());

grant select, insert, update, delete on monthly_actuals to anon, authenticated, service_role;
