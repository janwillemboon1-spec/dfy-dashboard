create type client_status as enum ('onboarding', 'actief', 'gepauzeerd', 'opgezegd');
create type profile_role as enum ('admin', 'klant');

create table clients (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  email text not null,
  telefoon text,
  status client_status not null default 'onboarding',
  aangemaakt_op timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role profile_role not null default 'klant',
  client_id uuid references clients(id) on delete cascade,
  email text not null,
  naam text not null,
  aangemaakt_op timestamptz not null default now(),
  constraint profiles_klant_heeft_client check (
    (role = 'klant' and client_id is not null) or (role = 'admin')
  )
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  naam text not null,
  adres text,
  pricelabs_listing_id text,
  airbnb_url text,
  aangemaakt_op timestamptz not null default now()
);

create table nulmeting (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  jaar int not null,
  maand int not null check (maand between 1 and 12),
  omzet numeric(10,2) not null,
  bezetting numeric(5,2) not null check (bezetting between 0 and 100),
  vastgesteld_op timestamptz not null default now(),
  laatst_gecorrigeerd_op timestamptz,
  correctie_reden text,
  unique (listing_id, jaar, maand)
);

create table pricelabs_listings_cache (
  id uuid primary key default gen_random_uuid(),
  pricelabs_listing_id text not null unique,
  naam text not null,
  adres text,
  laatst_gesynchroniseerd timestamptz
);

create table action_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  datum date not null,
  omschrijving text not null,
  type text not null default 'overig',
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create unique index clients_email_lower_idx on clients (lower(email));
create index listings_client_id_idx on listings(client_id);
create index nulmeting_listing_id_idx on nulmeting(listing_id);
create index action_log_listing_id_idx on action_log(listing_id);
