# Mobiele formulieren & tabellen (deelproject 2/3 van de mobiele-compatibiliteit-audit) — Design

## Context

Vervolg op de mobiele-compatibiliteit-audit (deelproject 1/3, de sidebar-navigatie, is klaar en
live). Dit deelproject pakt de twee "medium"/"medium-high" bevindingen uit die audit aan:
formulierrijen die op smalle schermen kunnen overlopen (controls schuiven van het scherm i.p.v.
netjes af te breken), en tabellen die op smalle schermen clippen i.p.v. horizontaal scrollen.
Deelproject 3/3 (systeembreed te kleine tap-targets) blijft apart, buiten scope hier.

## Ontwerp

### 1. Tabellen: elk in een `overflow-x-auto`-wrapper

`src/components/ui/table.tsx`'s eigen `Table`-component wrapt zich al correct in
`<div className="relative w-full overflow-x-auto"><table>...</table></div>`. Zes losse
`<table>`-elementen in de app volgen dat patroon niet en clippen (`overflow-hidden`) of hebben
helemaal geen overflow-behandeling, waardoor content op een smal scherm wordt afgesneden i.p.v.
scrollbaar. Elke tabel krijgt exact dezelfde wrapper-`div`, zonder verder iets aan de bestaande
tabel-markup/styling te veranderen:

- `src/components/dashboard/kanaal-uitsplitsing.tsx` — wrapper-div gaat van `overflow-hidden`
  naar `overflow-x-auto`.
- `src/components/dashboard/trend-tabel.tsx` — geen wrapper-div, alleen de tabel zelf heeft
  `overflow-hidden`; krijgt een nieuwe `<div className="overflow-x-auto">` eromheen, `<table>`
  verliest zijn eigen `overflow-hidden` (die zat toch al niet op de juiste plek om iets te
  clippen — de rounded corners komen gewoon van `rounded-xl` op de tabel zelf, ongeacht
  overflow-instelling).
- `src/components/dashboard/listings-tabel.tsx` — zelfde behandeling als `trend-tabel.tsx`.
- `src/app/[locale]/admin/klanten/page.tsx` — geen enkele overflow-behandeling nu; krijgt een
  nieuwe `<div className="overflow-x-auto">` eromheen.
- `src/components/admin/nulmeting-tabel.tsx` — zelfde, geen overflow-behandeling nu.
- `src/components/admin/resultaten-tabel.tsx` — zelfde, geen overflow-behandeling nu (kleinste
  risico van de zes qua inhoud, maar de fix is gratis en zorgt voor consistentie).

### 2. Formulierrijen: `flex-wrap` toevoegen

Zes plekken hebben een `flex items-end/items-center gap-2`-rij met 2-5 velden/knoppen, zonder
`flex-wrap` — op een smal scherm lopen die van het scherm af i.p.v. netjes af te breken naar een
volgende regel. Dit patroon bestaat al correct in een zusje van deze formulieren
(`activiteit-toevoegen-formulier.tsx` gebruikt al `flex flex-wrap items-end gap-2`) — de fix is
dus het bestaande, al-werkende patroon toepassen, niet iets nieuws bedenken:

- `src/components/portal/todo-rij.tsx` (`TodoBewerkRij`)
- `src/components/admin/checklist-item-toevoegen-formulier.tsx`
- `src/components/admin/todo-toevoegen-formulier.tsx`
- `src/components/admin/fase-voortgang-formulier.tsx`
- `src/components/admin/samenwerking-nulmeting-form.tsx`
- `src/components/admin/pricelabs-koppeling.tsx`

### 3. Tab-strips: horizontaal scrollen i.p.v. wrappen

Twee plekken zijn geen "formulier" maar een horizontale tab-strip met een `border-b` (onderlijn
onder de actieve tab). Daar `flex-wrap` op toepassen ziet er kapot uit zodra er een tweede regel
ontstaat (de onderlijn zou dan per regel afbreken). In plaats daarvan krijgen deze twee
`overflow-x-auto` (plus `whitespace-nowrap` op de knoppen zelf, zodat tekst niet middenin een
label afbreekt vóórdat er horizontaal gescrold wordt) — dezelfde behandeling die
`ui/table.tsx`'s wrapper al gebruikt, toegepast op een tab-strip in plaats van een tabel:

- `src/components/ui/tabs.tsx` — `TabsList` krijgt `max-w-full overflow-x-auto` (centrale fix,
  werkt overal waar `TabsList` gebruikt wordt, nu alleen op de admin-instellingenpagina's
  Koppeling/Nulmeting/Resultaten/Actielog-tabs).
- `src/components/dashboard/omzet-dashboard.tsx` — de periode-tabstrip
  (Deze maand/Vorige maand/Dit jaar/Eigen periode) krijgt `overflow-x-auto` op zijn eigen rij,
  plus `whitespace-nowrap` op de knoppen.

## Testen

Geen componenttest-infrastructuur in dit project (zelfde als bij deelproject 1) — verificatie
via `npm run build` (compileert/type-checkt schoon) en handmatige verificatie op een smal scherm:
elke aangepaste tabel scrollt horizontaal i.p.v. content af te snijden; elke aangepaste
formulierrij breekt netjes af naar een volgende regel i.p.v. van het scherm te lopen; beide
tab-strips scrollen horizontaal i.p.v. te wrappen of over te lopen. Desktop-weergave (ruim
scherm) blijft in alle gevallen ongewijzigd, aangezien geen van deze wijzigingen iets doet zolang
content toch al past.
