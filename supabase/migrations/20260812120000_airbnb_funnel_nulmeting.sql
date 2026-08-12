create table airbnb_funnel_nulmeting (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade unique,
  gemiddeld_conversiepercentage numeric(5,2) check (gemiddeld_conversiepercentage between 0 and 100),
  percentage_zoekvertoningen_eerste_pagina numeric(5,2) check (percentage_zoekvertoningen_eerste_pagina between 0 and 100),
  conversie_zoekopdracht_naar_advertentie numeric(5,2) check (conversie_zoekopdracht_naar_advertentie between 0 and 100),
  conversie_advertentie_naar_boeking numeric(5,2) check (conversie_advertentie_naar_boeking between 0 and 100),
  bijgewerkt_op timestamptz not null default now()
);

grant select, insert, update, delete on airbnb_funnel_nulmeting to anon, authenticated, service_role;

alter table airbnb_funnel_nulmeting enable row level security;

create policy "admin volledige toegang airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting
  for select using (client_id = current_client_id());
