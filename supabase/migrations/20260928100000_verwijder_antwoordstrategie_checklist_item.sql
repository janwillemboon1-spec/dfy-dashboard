-- Verwijdert "Antwoordstrategie bepaald" uit de standaard-checklist (fase 2, Marktanalyse
-- & Concurrentieanalyse) — zowel voor toekomstige klanten (seed-functie voor de
-- clients_seed_standaard_checklist-trigger) als voor klanten die het item al hadden
-- (bestaande rijen worden verwijderd, en het fase-2-percentage wordt herberekend zodat
-- het weer klopt met het nieuwe, kortere itemaantal).

create or replace function standaard_checklist_items()
returns table(fase_nummer int, naam text)
language sql
immutable
as $$
  select * from (values
    (1, 'Koppeling met dynamic pricing software tot stand gebracht'),
    (1, 'Dashboard geactiveerd'),
    (1, 'Klant geïnformeerd'),
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

-- Verwijder het item bij klanten die het al hadden (ongeacht afgevinkt of niet).
delete from voortgang_checklist_items
where fase_nummer = 2 and naam = 'Antwoordstrategie bepaald';

-- Herbereken het fase-2-percentage per klant met dezelfde formule als
-- herberekenFasePercentage() in src/app/[locale]/admin/klanten/[id]/actions.ts, zodat een
-- klant die het verwijderde item al had afgevinkt niet ineens een lager percentage krijgt
-- puur door de kleinere noemer, en andersom een klant die het nog niet had afgevinkt niet
-- blijft steken op een percentage dat op het oude, langere lijstje was gebaseerd.
insert into voortgang_fasen (client_id, fase_nummer, percentage)
select
  c.id,
  2,
  coalesce(
    round((count(vci.id) filter (where vci.afgevinkt) * 100.0) / nullif(count(vci.id), 0)),
    0
  )
from clients c
left join voortgang_checklist_items vci on vci.client_id = c.id and vci.fase_nummer = 2
group by c.id
on conflict (client_id, fase_nummer) do update set percentage = excluded.percentage;
