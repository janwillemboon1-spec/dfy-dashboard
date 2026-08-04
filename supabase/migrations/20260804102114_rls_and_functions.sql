create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function current_client_id()
returns uuid
language sql
security definer
stable
as $$
  select client_id from profiles where id = auth.uid();
$$;

create or replace function create_client_with_listings(payload jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  new_client_id uuid;
  listing_record jsonb;
  new_listing_id uuid;
  nulmeting_record jsonb;
begin
  insert into clients (naam, email, telefoon, status)
  values (
    payload->>'naam',
    payload->>'email',
    payload->>'telefoon',
    'onboarding'
  )
  returning id into new_client_id;

  for listing_record in select * from jsonb_array_elements(payload->'listings')
  loop
    insert into listings (client_id, naam, adres)
    values (
      new_client_id,
      listing_record->>'naam',
      listing_record->>'adres'
    )
    returning id into new_listing_id;

    for nulmeting_record in select * from jsonb_array_elements(listing_record->'nulmeting')
    loop
      insert into nulmeting (listing_id, jaar, maand, omzet, bezetting)
      values (
        new_listing_id,
        (nulmeting_record->>'jaar')::int,
        (nulmeting_record->>'maand')::int,
        (nulmeting_record->>'omzet')::numeric,
        (nulmeting_record->>'bezetting')::numeric
      );
    end loop;
  end loop;

  return new_client_id;
end;
$$;

create or replace function delete_client_cascade(target_client_id uuid)
returns void
language sql
security definer
as $$
  delete from clients where id = target_client_id;
$$;

-- Note: this local Supabase Postgres image's default privileges for the `postgres`
-- role (owner of these tables) only grant Dxtm (truncate/references/trigger/maintain)
-- to anon/authenticated/service_role on new tables in schema public — not
-- select/insert/update/delete. GRANT is checked independently of and before RLS, so
-- without these explicit grants no role (including service_role) can read or write
-- any table and RLS policies never even get evaluated. This block is not part of the
-- originally specified SQL; it is required for the specified RLS policies to have any
-- effect at all in this environment.
grant select, insert, update, delete on
  clients, profiles, listings, nulmeting, pricelabs_listings_cache, action_log
  to anon, authenticated, service_role;

alter table clients enable row level security;
alter table profiles enable row level security;
alter table listings enable row level security;
alter table nulmeting enable row level security;
alter table pricelabs_listings_cache enable row level security;
alter table action_log enable row level security;

create policy "admin volledige toegang clients" on clients
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen client" on clients
  for select using (id = current_client_id());

create policy "admin volledige toegang profiles" on profiles
  for all using (is_admin()) with check (is_admin());
create policy "gebruiker leest eigen profiel" on profiles
  for select using (id = auth.uid());

create policy "admin volledige toegang listings" on listings
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen listings" on listings
  for select using (client_id = current_client_id());

create policy "admin volledige toegang nulmeting" on nulmeting
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen nulmeting" on nulmeting
  for select using (
    listing_id in (select id from listings where client_id = current_client_id())
  );

create policy "admin volledige toegang pricelabs cache" on pricelabs_listings_cache
  for all using (is_admin()) with check (is_admin());

create policy "admin volledige toegang action_log" on action_log
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen action_log" on action_log
  for select using (
    listing_id in (select id from listings where client_id = current_client_id())
  );
