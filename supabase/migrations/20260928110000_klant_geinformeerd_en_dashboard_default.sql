-- Twee wijzigingen aan de standaard-checklist (fase 1, Onboarding):
-- 1. "Klant geïnformeerd" wordt verwijderd — voor toekomstige klanten (seed-functie) én
--    voor klanten die het al hadden (bestaande rijen worden verwijderd, fase-1-percentage
--    herberekend).
-- 2. "Dashboard geactiveerd" begint voortaan standaard aangevinkt — maar alleen voor
--    NIEUWE klanten vanaf nu (de trigger). Bestaande klanten die dit item nog open hebben
--    staan, blijven bewust ongewijzigd: dat kan een echte, actuele status zijn die niet
--    zomaar overschreven mag worden.

create or replace function standaard_checklist_items()
returns table(fase_nummer int, naam text)
language sql
immutable
as $$
  select * from (values
    (1, 'Koppeling met dynamic pricing software tot stand gebracht'),
    (1, 'Dashboard geactiveerd'),
    (1, 'Live gegaan'),
    (2, 'Concurrentie analyse'),
    (2, 'Reviews geanalyseerd'),
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

-- "Dashboard geactiveerd" komt voortaan aangevinkt binnen bij een nieuwe klant; alle
-- andere standaard-items blijven ongewijzigd op niet-aangevinkt starten. Meteen ook het
-- fase-1-percentage voor die nieuwe klant meegeven, zodat de voortgangsbalk vanaf het
-- allereerste moment al klopt met de vooraf-aangevinkte staat, i.p.v. pas na de eerste
-- handmatige aan/uitvink-actie (die herberekenFasePercentage() in actions.ts aanroept).
create or replace function seed_standaard_checklist_items()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_checklist_items (client_id, fase_nummer, naam, afgevinkt)
  select new.id, v.fase_nummer, v.naam, (v.naam = 'Dashboard geactiveerd')
  from standaard_checklist_items() v;

  insert into voortgang_fasen (client_id, fase_nummer, percentage)
  select
    new.id,
    1,
    round((count(*) filter (where naam = 'Dashboard geactiveerd')) * 100.0 / count(*))
  from standaard_checklist_items()
  where fase_nummer = 1
  on conflict (client_id, fase_nummer) do update set percentage = excluded.percentage;

  return new;
end;
$$;

-- Verwijder "Klant geïnformeerd" bij klanten die het al hadden (ongeacht afgevinkt of
-- niet) — dit item wordt volledig uit de checklist gehaald, niet alleen de standaardstatus
-- gewijzigd, dus dit raakt bewust wél bestaande klanten (zelfde aanpak als de eerdere
-- verwijdering van "Antwoordstrategie bepaald").
delete from voortgang_checklist_items
where fase_nummer = 1 and naam = 'Klant geïnformeerd';

-- Herbereken het fase-1-percentage per bestaande klant op basis van hun eigen, actuele
-- afgevinkt-status (niet geforceerd op aangevinkt voor "Dashboard geactiveerd") — dit
-- corrigeert alleen voor de kleinere noemer na het verwijderen van "Klant geïnformeerd".
insert into voortgang_fasen (client_id, fase_nummer, percentage)
select
  c.id,
  1,
  coalesce(
    round((count(vci.id) filter (where vci.afgevinkt) * 100.0) / nullif(count(vci.id), 0)),
    0
  )
from clients c
left join voortgang_checklist_items vci on vci.client_id = c.id and vci.fase_nummer = 1
group by c.id
on conflict (client_id, fase_nummer) do update set percentage = excluded.percentage;
