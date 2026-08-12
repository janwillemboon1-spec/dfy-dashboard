# Klantportaal — Voortgang: activiteitenlog (deelproject 5/7) — Design

## Context

Laatste inhoudelijke sectie van de Voortgang-pagina: een logboek dat automatisch bijhoudt wat
er gebeurt (checklist-items en to-do's af-/uitvinken, nieuwe to-do's toegevoegd), plus
handmatige regels die de admin zelf toevoegt.

Het bestaande `action_log` (per accommodatie, gebruikt op de admin-Instellingen-tab voor
optimalisatie-acties als prijsregels/foto's) blijft **ongewijzigd** bestaan — dit is een ander
concept met een ander schaalniveau (listing i.p.v. client). Het nieuwe activiteitenlog is een
losse, klant-gescoopte tabel.

De bestaande `ActielogTijdlijn` op de klant-Cijfers-pagina (deelproject 1 had 'm daar
tijdelijk laten staan) verdwijnt nu — het activiteitenlog op Voortgang is de vervanging.

## Ontwerp

### 1. Datamodel

Nieuwe migratie, nieuwe tabel `voortgang_activiteitenlog`:

```sql
create table voortgang_activiteitenlog (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  datum date not null,
  omschrijving text not null,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_activiteitenlog_client_id_idx on voortgang_activiteitenlog(client_id);

grant select, insert, update, delete on voortgang_activiteitenlog to anon, authenticated, service_role;

alter table voortgang_activiteitenlog enable row level security;

create policy "admin volledige toegang voortgang_activiteitenlog" on voortgang_activiteitenlog
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_activiteitenlog" on voortgang_activiteitenlog
  for select using (client_id = current_client_id());
```

Bewust **geen** insert-policy voor de klant: automatische logregels ontstaan via
database-triggers (zie hieronder), die als `security definer` draaien en dus RLS omzeilen —
een klant-sessie die zelf een to-do afvinkt hoeft dus geen eigen schrijfrecht op deze tabel te
hebben.

### 2. Automatisch loggen via triggers

Drie triggerfuncties, elk `security definer`, die `auth.uid()` gebruiken om te registreren wíe
de onderliggende actie deed (dit werkt betrouwbaar ondanks `security definer`: `auth.uid()`
leest een sessie/request-gebonden instelling die PostgREST per request zet, niet beïnvloed door
een rolwissel binnen de functie — zelfde principe als de bestaande `is_admin()`/
`current_client_id()`-hulpfuncties):

- **Op `voortgang_checklist_items`, na een update van `afgevinkt`**: logt "Checklist-item
  afgevinkt: {naam}" of "Checklist-item uitgevinkt: {naam}".
- **Op `voortgang_todos`, na een update van `afgevinkt`**: logt "To-do afgevinkt: {naam}" /
  "To-do uitgevinkt: {naam}".
- **Op `voortgang_todos`, na een insert**: logt "Nieuwe taak toegevoegd: {naam}".

Voordeel van triggers i.p.v. het loggen vanuit de server-acties zelf: de bestaande, al geteste
server-acties (`vinkChecklistItemAf`, `vinkTodoAf`, `voegTodoToe`) hoeven **niet** aangepast te
worden — het loggen gebeurt transactioneel en gegarandeerd consistent, ook als er later een
ander code-pad bijkomt dat dezelfde tabellen bijwerkt.

### 3. Handmatige regel toevoegen

Nieuwe server-actie `voegActiviteitToe({clientId, datum, omschrijving})` in
`src/app/[locale]/admin/klanten/[id]/actions.ts`, admin-only. Zelfde twee velden als het
bestaande `ActielogFormulier` (datum + omschrijving), geen categorie/type nodig.

### 4. UI

Nieuwe sectie "Activiteitenlog" onderaan de Voortgang-pagina (na de to-do-sectie). Nieuwe
component `src/components/portal/voortgangs-activiteitenlog.tsx`, zelfde weergavepatroon als
de bestaande `ActielogTijdlijn` (chronologisch aflopend, 5 tonen + "Toon meer"-knop). Bij de
admin komt daaronder een nieuw toevoeg-formulier
(`src/components/admin/activiteit-toevoegen-formulier.tsx`): datum + omschrijving + knop.

### 5. Opruiming

- `src/app/[locale]/dashboard/cijfers/page.tsx`: `ActielogTijdlijn` en de bijbehorende
  `action_log`-query/`actielogItems`-opbouw verdwijnen.
- Admin-Instellingen-tab (`action_log`, `ActielogTijdlijn`/`ActielogFormulier` daar) blijft
  volledig ongewijzigd — ander concept, niet in scope.

## Testen

- Integratietest voor `voegActiviteitToe`: weigert niet-admin, weigert lege omschrijving,
  insert de rij correct.
- Integratietest voor de triggers: vinkt een checklist-item af → controleert dat er een
  passende rij in `voortgang_activiteitenlog` verschijnt met de juiste `client_id` en
  `toegevoegd_door`; vinkt 'm weer uit → tweede rij met "uitgevinkt"-tekst; voegt een to-do toe
  → "Nieuwe taak toegevoegd"-rij; vinkt die to-do af als klant → "afgevinkt"-rij met de
  klant als `toegevoegd_door`.
- Handmatige verificatie: als admin een checklist-item en een to-do afvinken/uitvinken, een
  to-do toevoegen, en zelf een regel toevoegen — alles verschijnt in de juiste volgorde in het
  log, ook zichtbaar (alleen-lezen) vanuit de klant-sessie. Cijfers-pagina toont geen actielog
  meer.
