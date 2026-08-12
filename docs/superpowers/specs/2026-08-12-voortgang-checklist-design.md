# Klantportaal — Voortgang: checklist per fase (deelproject 3/7) — Design

## Context

Vervolg op deelproject 2 (fasen & voortgangsbalk). Elke fase krijgt een eigen checklist met
items die de admin toevoegt en afvinkt. Zodra de checklist bestaat, wordt het fase-percentage
(`voortgang_fasen.percentage`, tot nu toe alleen handmatig instelbaar) automatisch herberekend
uit de afvink-status van de checklist-items — het handmatige formulier uit deelproject 2 blijft
wel bestaan als los, direct schrijfpad.

## Ontwerp

### 1. Datamodel

Nieuwe migratie, nieuwe tabel `voortgang_checklist_items`:

```sql
create table voortgang_checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  fase_nummer int not null check (fase_nummer between 1 and 3),
  naam text not null,
  afgevinkt boolean not null default false,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_checklist_items_client_id_idx on voortgang_checklist_items(client_id);

grant select, insert, update, delete on voortgang_checklist_items to anon, authenticated, service_role;

alter table voortgang_checklist_items enable row level security;

create policy "admin volledige toegang voortgang_checklist_items" on voortgang_checklist_items
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_checklist_items" on voortgang_checklist_items
  for select using (client_id = current_client_id());
```

Geen `unique`-constraint nodig — meerdere items met dezelfde naam binnen één fase zijn prima
(bv. terugkerende taken).

### 1a. Standaard-checklist — automatisch voor elke klant

De klant wil niet elke keer handmatig dezelfde items hoeven toevoegen. Daarom bevat dezelfde
migratie ook een vaste standaardlijst van 19 items, ingedeeld op inhoud (de klant gaf de
volledige lijst aan, inclusief correcties op de eerste fase-indeling en een item dat niet
standaard blijkt te zijn):

**Fase 1 — Onboarding** (4): Koppeling met dynamic pricing software tot stand gebracht;
Dashboard geactiveerd; Klant geïnformeerd; Live gegaan.

("Geautomatiseerd bericht instellen over voorbereiding bedden" is bewust géén standaard-item —
niet elke accommodatie heeft dit nodig; kan per klant handmatig worden toegevoegd via het
toevoeg-formulier als het van toepassing is.)

**Fase 2 — Marktanalyse & concurrentieanalyse** (4): Concurrentie analyse; Reviews
geanalyseerd; Antwoordstrategie bepaald; Host profiel beoordeeld.

**Fase 3 — Optimalisaties APH** (12): Advertentietitel geanalyseerd; Omschrijving herschreven;
Foto's beoordeeld en aanbevelingen gegeven; Voorzieningenlijst gecontroleerd; Huisregels
gecheckt; Alles gereviewed; Basisprijs ingesteld; Weekendtoeslag geconfigureerd;
Seizoensprijzen ingesteld; Minimum nachten bepaald; Last-minute korting ingesteld; Nulmeting
Airbnb funnel.

("Nulmeting Airbnb funnel" is een gewoon checklist-item met een eigen vinkje, net als de
andere — zie 1b hieronder voor het losstaande 4-velden-formulier dat er in de UI naast komt te
staan, zonder functionele koppeling met dit vinkje.)

Deze standaardlijst wordt op twee manieren toegepast, beide in dezelfde migratie:

1. **Backfill voor bestaande klanten**: een eenmalige `insert ... select` die de 20 items voor
   elke rij die al in `clients` staat aanmaakt (cross join tussen `clients` en een
   `values`-lijst met de 20 (fase_nummer, naam)-paren).
2. **Trigger voor nieuwe klanten**: een `after insert on clients`-trigger
   (`seed_standaard_checklist_items`, `security definer`, dezelfde 20-item-lijst) die
   automatisch dezelfde 20 items aanmaakt zodra een nieuwe klant wordt aangemaakt — ongeacht
   via welke weg (het "nieuwe klant"-formulier, de CSV-import, enz.), omdat de trigger op
   tabelniveau zit i.p.v. in één specifieke server-actie.

De admin kan na deze seed nog steeds extra items toevoegen en items afvinken zoals gewoonlijk
— de standaardlijst is een startpunt, geen vergrendelde set. Een verwijder-actie voor items
zit niet in dit deelproject (niet gevraagd); kan later alsnog toegevoegd worden als daar
behoefte aan blijkt.

### 1b. Airbnb funnel-nulmeting — los formulier, 4 percentagevelden

Nieuwe tabel, één rij per klant (niet gekoppeld aan het checklist-item hierboven — puur los
ernaast, zoals afgesproken):

```sql
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
```

Alle 4 velden zijn losstaand nullable — de admin hoeft niet alles in één keer in te vullen, en
elk veld kan apart later nog aangevuld/gecorrigeerd worden. `unique` op `client_id`: precies
één rij per klant, geen losse historie nodig (dit is één huidige meting, geen tijdreeks).

Nieuwe server-actie `werkAirbnbFunnelNulmetingBij` in `actions.ts` (admin-only, eenvoudige
upsert op `onConflict: 'client_id'`, geen koppeling met `herberekenFasePercentage` — dit
formulier raakt het fase-percentage niet aan).

### 2. Server-acties

Twee nieuwe functies in `src/app/[locale]/admin/klanten/[id]/actions.ts`, beide admin-only, en
beide na hun eigen wijziging het fase-percentage herberekenen via een gedeelde, niet-geëxporteerde
hulpfunctie:

```ts
async function herberekenFasePercentage(
  supabase: SupabaseClient<Database>,
  clientId: string,
  faseNummer: number
) {
  const { data: items } = await supabase
    .from('voortgang_checklist_items')
    .select('afgevinkt')
    .eq('client_id', clientId)
    .eq('fase_nummer', faseNummer);

  const totaal = items?.length ?? 0;
  const afgevinkt = items?.filter((i) => i.afgevinkt).length ?? 0;
  const percentage = totaal > 0 ? Math.round((afgevinkt / totaal) * 100) : 0;

  await supabase
    .from('voortgang_fasen')
    .upsert(
      { client_id: clientId, fase_nummer: faseNummer, percentage },
      { onConflict: 'client_id,fase_nummer' }
    );
}
```

- `voegChecklistItemToe({clientId, faseNummer, naam})`: valideert dat `naam` niet leeg is,
  insert het item, herberekent daarna het percentage van die fase (een nieuw, nog-niet-afgevinkt
  item kan het percentage laten dalen, ook zonder dat er iets is afgevinkt).
- `vinkChecklistItemAf({clientId, itemId, faseNummer, afgevinkt})`: update het item, herberekent
  daarna het percentage van die fase.

Beide `revalidatePath`'n dezelfde route als `werkFaseVoortgangBij` al doet:
`/admin/klanten/${clientId}/voortgang`.

**Samenspel met het handmatige formulier (deelproject 2)**: geen aparte
override-vergrendeling. `werkFaseVoortgangBij` blijft een direct schrijfpad naar
`voortgang_fasen.percentage`; de checklist-acties hierboven zijn een tweede, automatisch
schrijfpad naar dezelfde kolom. Wie het laatst heeft geschreven bepaalt de weergegeven waarde —
zet een admin handmatig 80%, dan blijft dat staan totdat de checklist van die fase opnieuw
wijzigt (item toegevoegd of afgevinkt), wat het percentage weer herberekent.

### 3. UI

Nieuwe sectie "Checklist" op de Voortgang-pagina, onder de `VoortgangsBalk`, per fase
gegroepeerd (fase-naam als kop, items eronder). Nieuwe component
`src/components/portal/voortgangs-checklist.tsx` (server-component, ontvangt de items en een
`magBewerken: boolean`-vlag): toont per item een vinkje + naam. Bij `magBewerken=true` (admin)
is het vinkje een echte, klikbare checkbox (client-subcomponent die `vinkChecklistItemAf`
aanroept); bij `magBewerken=false` (klant) is het puur decoratief/alleen-lezen.

Admin krijgt daaronder een toevoeg-formulier (nieuwe component
`src/components/admin/checklist-item-toevoegen-formulier.tsx`): fase kiezen (dropdown, zelfde
stijl als `FaseVoortgangFormulier`) + naam-invoerveld + "+"-knop, roept `voegChecklistItemToe`
aan.

In de Fase 3-groep, ná de checklist-items van die fase, komt een nieuwe component
`src/components/portal/airbnb-funnel-nulmeting.tsx`: toont de 4 percentages. Bij de klant
alleen-lezen (`{waarde}%` of "Nog niet ingevuld" per veld); bij de admin 4 bewerkbare
number-inputs (0-100, stap 0.01) + "Opslaan"-knop die `werkAirbnbFunnelNulmetingBij` aanroept.
Geen link/koppeling naar het "Nulmeting Airbnb funnel"-checklist-item — puur naast elkaar in
dezelfde Fase 3-sectie.

## Testen

- Handmatige verificatie van de backfill/trigger: na de migratie heeft een bestaande klant
  meteen 20 items verdeeld over de 3 fasen (4/4/12); een nieuw aangemaakte klant (via het
  "nieuwe klant"-formulier) krijgt dezelfde 20 items automatisch mee.
- Integratietest voor beide checklist-server-acties: weigert niet-admin, weigert een lege naam
  bij toevoegen, en — het belangrijkste — controleert dat het fase-percentage na
  toevoegen/afvinken correct herberekend wordt (bv. 2 items, 1 afgevinkt → 50%; een 3e nieuw
  item toevoegen → 33%; dat 3e item ook afvinken → 100%).
- Integratietest voor `werkAirbnbFunnelNulmetingBij`: weigert niet-admin, upsert't correct
  (nieuwe rij + bijwerken bestaande rij), en bevestigt dat het checklist-item "Nulmeting Airbnb
  funnel" zijn eigen afgevinkt-status behoudt ongeacht wat er in dit formulier wordt ingevuld.
- Handmatige verificatie: als admin een checklist-item afvinken en zien dat de voortgangsbalk
  van die fase meteen het nieuwe percentage toont; hetzelfde vanuit de klant-sessie bekijken
  (alleen-lezen, geen klikbare vinkjes, funnel-percentages ook alleen-lezen).
