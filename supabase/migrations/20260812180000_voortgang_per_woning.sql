-- Voortgang per woning: checklist-items, to-do's en activiteitenlog-regels krijgen een
-- optioneel listing_id-label (null = "algemeen", geldt voor de hele klant, blijft
-- zichtbaar bij elke woning-filter). Airbnb-funnel-nulmeting gaat van client_id naar een
-- verplicht, uniek listing_id — die cijfers gaan immers over de individuele
-- Airbnb-advertentie van één woning, niet over het klantaccount als geheel.

alter table voortgang_checklist_items add column listing_id uuid references listings(id) on delete set null;
alter table voortgang_todos add column listing_id uuid references listings(id) on delete set null;
alter table voortgang_activiteitenlog add column listing_id uuid references listings(id) on delete set null;

-- De drie automatische log-triggers nemen voortaan ook de listing_id over van de rij die
-- de logregel triggerde, zodat het activiteitenlog straks ook per woning filterbaar is.
create or replace function log_checklist_item_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, listing_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    new.listing_id,
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

create or replace function log_todo_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, listing_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    new.listing_id,
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

create or replace function log_todo_toegevoegd()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, listing_id, datum, omschrijving, toegevoegd_door)
  values (new.client_id, new.listing_id, current_date, 'Nieuwe taak toegevoegd: ' || new.naam, auth.uid());
  return new;
end;
$$;

-- airbnb_funnel_nulmeting: client_id -> listing_id.
alter table airbnb_funnel_nulmeting add column listing_id uuid references listings(id) on delete cascade;

-- Backfill: koppel elke bestaande rij aan de (op aangemaakt_op gesorteerd) eerste woning
-- van die klant. Bij klanten met precies 1 woning is dit correct en definitief. Bij
-- klanten met meerdere woningen komt de bestaande set cijfers op de eerste woning terecht
-- — welke woning de bestaande cijfers oorspronkelijk betroffen is niet uit de data af te
-- leiden, dus die moeten dan handmatig herverdeeld worden over de andere woningen.
-- Als een klant met een bestaande funnel-rij inmiddels 0 woningen heeft, blijft
-- listing_id null en faalt de "set not null" hieronder met een duidelijke foutmelding —
-- dat orphaned geval moet dan handmatig opgelost worden (rij verwijderen of eerst een
-- woning aanmaken) voordat deze migratie verder kan.
update airbnb_funnel_nulmeting f
set listing_id = (
  select l.id from listings l
  where l.client_id = f.client_id
  order by l.aangemaakt_op asc
  limit 1
);

alter table airbnb_funnel_nulmeting alter column listing_id set not null;
alter table airbnb_funnel_nulmeting add constraint airbnb_funnel_nulmeting_listing_id_key unique (listing_id);

drop policy "klant leest eigen airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting;
create policy "klant leest eigen airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting
  for select using (listing_id in (select id from listings where client_id = current_client_id()));

alter table airbnb_funnel_nulmeting drop constraint airbnb_funnel_nulmeting_client_id_fkey;
alter table airbnb_funnel_nulmeting drop constraint airbnb_funnel_nulmeting_client_id_key;
alter table airbnb_funnel_nulmeting drop column client_id;
