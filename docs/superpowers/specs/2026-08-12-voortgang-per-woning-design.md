# Voortgang per woning (deelproject 1/2) — Design

## Context

Bij klanten met meerdere woningen (listings) is de hele Voortgang-pagina (fasen, checklist,
to-do's, activiteitenlog, Airbnb-funnel-nulmeting) nu volledig client-breed: één gedeelde set
data voor het hele account, ongeacht hoeveel woningen de klant heeft. Dit deelproject maakt de
Voortgangpagina (admin én klant) filterbaar per woning, zonder de bestaande, werkende
client-brede flow te breken voor klanten met precies 1 woning (verreweg de meeste klanten
vandaag).

Dit is deelproject 1 van 2 (deelproject 2 is Cijfers per woning, apart te brainstormen/bouwen).
Instellingen per woning is uit scope gehaald — niet meer van toepassing.

## Ontwerp

### 1. Datamodel: optionele woning-koppeling

`voortgang_checklist_items` en `voortgang_todos` krijgen een nieuwe, **nullable** kolom:

```sql
listing_id uuid references listings(id) on delete set null
```

`null` betekent "Algemeen" — het item geldt voor de hele klant en blijft zichtbaar ongeacht
welke woning is geselecteerd in de filter. Een niet-`null` waarde koppelt het item aan die
specifieke woning. `on delete set null` (i.p.v. cascade) matcht het bestaande patroon van
`toegevoegd_door` op dezelfde tabellen: het verwijderen van een woning verwijdert niet
stilzwijgend historische checklist-items/to-do's, het maakt ze gewoon weer "algemeen".

`voortgang_activiteitenlog` krijgt dezelfde nullable `listing_id`-kolom. De drie bestaande
automatische log-triggers (checklist afgevinkt, todo afgevinkt, todo toegevoegd) nemen de
`listing_id` van de bron-rij (het checklist-item resp. de to-do) automatisch over in de
gelogde regel. De handmatige `voegActiviteitToe`-actie krijgt een optioneel `listingId`-veld,
met een bijbehorende woning-dropdown in het formulier.

`airbnb_funnel_nulmeting` verandert fundamenteel: de kolom `client_id` (verplicht, uniek) wordt
vervangen door `listing_id` (verplicht, uniek) — deze conversiepercentages gaan immers over de
individuele Airbnb-advertentie van één woning, niet over het klantaccount als geheel. RLS-policies
worden herschreven naar het bestaande patroon voor listing-gescoopte tabellen (vergelijk
`pricelabs_reserveringen_cache`): klant leest via `listing_id in (select id from listings where
client_id = current_client_id())`.

**Backfill van bestaande data:** de migratie koppelt elke bestaande
`airbnb_funnel_nulmeting`-rij aan de (op `aangemaakt_op` gesorteerd) eerste woning van die
klant. Bij klanten met precies 1 woning is dit correct en definitief. Bij klanten met meerdere
woningen komt de bestaande set cijfers op de eerste woning terecht — de admin moet die dan
handmatig herverdelen/opnieuw invullen voor de andere woningen, want welke woning de bestaande
cijfers oorspronkelijk betroffen, is niet uit de data af te leiden.

### 2. Fase-percentage: opgeslagen blijft client-breed, per-woning wordt live herberekend

`voortgang_fasen` blijft ongewijzigd: nog steeds client-breed opgeslagen, nog steeds
automatisch herberekend bij elke checklist-toggle (`herberekenFasePercentage`, tellend over
*alle* items van de klant, ongeacht woning-label), en nog steeds handmatig overschrijfbaar door
de admin (`werkFaseVoortgangBij`).

Bij **"Alle woningen"** in de filter toont de voortgangsbalk dit opgeslagen percentage, exact
zoals vandaag — geen enkele wijziging in dat pad.

Zodra je op **één specifieke woning** filtert, wordt het percentage voor die fase **live in de
UI herberekend** uit de al-geladen checklist-items van die fase: (afgevinkte algemene items +
afgevinkte items van díe woning) gedeeld door (totaal algemene items + totaal items van díe
woning). Dit gebeurt puur client-side in de React-component, niet in de database — er komt geen
aparte, per-woning opgeslagen percentage-rij bij. Bewuste consequentie: de handmatige
admin-override (`werkFaseVoortgangBij`) is inherent één getal voor de hele klant en geldt dus
niet meer zodra er op een specifieke woning wordt gefilterd — die override blijft alleen gelden
in de "Alle woningen"-weergave.

### 3. UI

Een dropdown "Woning: [Alle woningen ▾]" bovenaan de Voortgangpagina (zowel
`src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx` als
`src/app/[locale]/dashboard/voortgang/page.tsx`), **alleen zichtbaar wanneer de klant meer dan 1
woning heeft** (bij 1 woning: geen dropdown, exact het huidige gedrag). Opties: "Alle woningen"
+ elke woning bij naam.

De filter werkt client-side (alle client-brede data wordt zoals nu in één keer opgehaald; een
nieuwe, kleine client-component houdt de geselecteerde woning in state en filtert wat wordt
getoond) — geen server-rondtrip nodig om van woning te wisselen.

Gefilterd op één woning tonen checklist, to-do's en activiteitenlog alleen de algemene items
plus de items van die woning. De Airbnb-funnel-nulmeting toont, bij "Alle woningen", alle
woningen se blokken onder elkaar (elk met eigen koppeling/nulmeting-status); bij een
woning-filter alleen het blok van die woning.

De drie toevoeg-formulieren (checklist-item, to-do, handmatige activiteit) krijgen elk een
extra "Woning"-dropdown (Algemeen + elke woning van de klant). `wijzigTodo` (bewerken) krijgt
die dropdown er ook bij, zodat een to-do's woning-label achteraf aanpasbaar is — consistent met
dat naam/deadline daar ook al wijzigbaar zijn.

## Testen

- Migratietests/integratietests voor de nieuwe `listing_id`-kolommen: een checklist-item/to-do
  zonder woning ("algemeen") blijft zichtbaar bij elke woning-filter; een item mét woning-label
  is alleen zichtbaar bij "alle woningen" en bij die ene woning.
- Integratietest voor de auto-log-triggers: een afgevinkt checklist-item met woning-label
  produceert een activiteitenlog-regel met dezelfde `listing_id`.
- Integratietest voor `airbnb_funnel_nulmeting`: RLS-grenstest (klant leest alleen de
  funnel-data van haar eigen woningen), en dat de unieke-constraint nu op `listing_id` zit
  (twee woningen van dezelfde klant kunnen allebei hun eigen funnel-rij hebben).
- Handmatige verificatie: bij een klant met 2 woningen, de dropdown gebruiken en controleren
  dat checklist/to-do's/activiteitenlog/funnel-blok correct filteren, en dat het fase-percentage
  klopt bij het wisselen tussen "Alle woningen" en een specifieke woning.
