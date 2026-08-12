-- Bugfix: fase-percentages bleven op 0% ("nog niet gestart") staan na het afvinken van
-- checklist-items, ook als er wél items waren afgevinkt. Root cause: de
-- voortgang_fasen-upsert in herberekenFasePercentage() faalde stilzwijgend (de fout werd
-- niet gecontroleerd — apart gefixt in de code) wanneer de unique-constraint op
-- (client_id, fase_nummer) ontbrak, waardoor de ON CONFLICT-clausule niets had om op te
-- matchen. Deze migratie zorgt er idempotent voor dat de constraint bestaat, ook als
-- 20260812100000_voortgang_fasen.sql om wat voor reden dan ook niet volledig is
-- toegepast.
do $$
begin
  alter table voortgang_fasen
    add constraint voortgang_fasen_client_id_fase_nummer_key unique (client_id, fase_nummer);
exception
  when duplicate_table then
    null; -- constraint (en de onderliggende index) bestaat al, niets te doen
  when duplicate_object then
    null; -- idem, andere SQLSTATE-variant
end $$;
