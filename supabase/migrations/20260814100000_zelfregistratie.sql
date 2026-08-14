-- Onderscheidt "klant heeft zichzelf via de aanmeldpagina geregistreerd" van elke andere
-- manier waarop een klant ontstaat (admin "Nieuwe klant", CSV-import) — beide starten op
-- status 'onboarding', maar alleen zelfregistratie zet dit veld op true. Wordt gebruikt
-- voor de "Nieuw"-badge in het admin-klantenoverzicht (verdwijnt zodra de admin de status
-- handmatig op 'actief' zet).
alter table clients add column zelf_geregistreerd boolean not null default false;
