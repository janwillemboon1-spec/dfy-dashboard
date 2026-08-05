create table pricelabs_reserveringen_cache (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  reservation_id text not null,
  check_in date not null,
  check_out date not null,
  rental_revenue numeric(10,2) not null,
  total_cost numeric(10,2),
  no_of_days int not null,
  booking_status text not null,
  booking_channel text,
  laatst_gesynchroniseerd timestamptz not null default now(),
  unique (listing_id, reservation_id)
);

create index pricelabs_reserveringen_cache_listing_id_idx on pricelabs_reserveringen_cache(listing_id);
create index pricelabs_reserveringen_cache_check_in_idx on pricelabs_reserveringen_cache(check_in);

alter table pricelabs_reserveringen_cache enable row level security;

-- Bewust geen klant-schrijfpolicy: de sync-server-action schrijft via de service-role
-- client, na een expliciete eigendomscheck via de RLS-scoped listings-query (zie Taak 5).
create policy "admin volledige toegang pricelabs_reserveringen_cache" on pricelabs_reserveringen_cache
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen pricelabs_reserveringen_cache" on pricelabs_reserveringen_cache
  for select using (
    listing_id in (select id from listings where client_id = current_client_id())
  );

grant select, insert, update, delete on pricelabs_reserveringen_cache to anon, authenticated, service_role;
