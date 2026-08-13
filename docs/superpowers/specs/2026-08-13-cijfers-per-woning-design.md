# Cijfers per woning (deelproject 2/2) — Design

## Context

Deelproject 1/2 ("Voortgang per woning") is klaar en live: bij klanten met meerdere woningen
(listings) is de Voortgang-pagina filterbaar per woning via een gedeelde dropdown. Dit
deelproject doet hetzelfde voor de Cijfers-pagina (admin `/admin/klanten/[id]/cijfers` en klant
`/dashboard/cijfers`), die nu drie widgets bevat die allemaal client-breed (over alle woningen
samen) rekenen:

- **WowCijfer** — hero-cijfer ("Impactmeter"): totale extra omzet sinds start samenwerking,
  opgeteld over alle woningen.
- **ResultatenGrafiek** — staafdiagram nulmeting vs. actuele omzet per maand, ook opgeteld.
- **OmzetDashboard** — periode-gebaseerd dashboard (deze maand/vorige maand/dit
  jaar/eigen periode) met KPI-kaarten, kanaal-uitsplitsing, een trendtabel en een
  "Accommodaties vergelijken"-tabel die al wél per woning uitsplitst.

De onderliggende data is al per woning gestructureerd (elke `listings`-rij heeft haar eigen
`nulmeting`/`monthly_actuals`; `pricelabs_reserveringen_cache` heeft `listing_id`), dus dit is
vooral een kwestie van filteren, geen nieuw datamodel.

Dit is deelproject 2 van 2 van de "per woning"-decompositie. Deelproject 1 (Voortgang) staat in
`docs/superpowers/specs/2026-08-12-voortgang-per-woning-design.md`.

## Ontwerp

### 1. UI: één gedeelde woning-filter, zelfde patroon als Voortgang

Eén dropdown "Woning: Alle woningen ▾" bovenaan de Cijfers-pagina (admin + klant), **alleen
zichtbaar wanneer de klant meer dan 1 woning heeft**. Eén selectie stuurt alle drie de widgets
tegelijk aan — geen aparte filters per widget. Dit vereist een nieuwe client-component
`CijfersInhoud` (naar analogie van `VoortgangInhoud` uit deelproject 1) die de
"geselecteerde woning"-state bezit en de dropdown + de drie widgets rendert.

Beide Cijfers-pagina's (`admin/klanten/[id]/cijfers/page.tsx`, `dashboard/cijfers/page.tsx`)
breiden hun bestaande `listings`-query uit met `id, naam` (nu alleen
`samenwerking_gestart, nulmeting(...), monthly_actuals(...)`) en geven de ruwe per-woning array
door aan `CijfersInhoud`. De al-berekende client-brede `vergelijkingen`/`wowCijfer`/`startmaand`
worden niet langer als losse props doorgegeven — die berekening verhuist in zijn geheel naar
`CijfersInhoud` (zie hieronder), zodat hij bij een woning-wissel opnieuw kan draaien zonder
server-rondtrip.

### 2. WowCijfer + ResultatenGrafiek: client-side herberekenen, geen nieuwe fetch

`berekenMaandVergelijkingen`, `berekenWowCijfer` en `vroegsteSamenwerkingGestart`
(`src/lib/dashboard/bereken-resultaten.ts`) blijven ongewijzigd — ze nemen nu al een
`ListingData[]`/`(string | null)[]` aan en werken intern al per woning vóór het optellen.
`CijfersInhoud` roept deze functies aan via `useMemo`, met als input: bij "Alle woningen" de
volledige lijst woningen, bij een specifieke woning een array met daarin alléén die ene woning.
Resultaat: `WowCijfer` en `ResultatenGrafiek` wisselen instant mee met de filter, zonder
netwerk-aanvraag — dezelfde aanpak als de live fase-percentage-herberekening in
`VoortgangInhoud`.

### 3. OmzetDashboard: API breidt uit met per-woning trend, client filtert

`berekenOmzetVoorPeriode` (`src/lib/dashboard/omzet-voor-periode.ts`) berekent al per woning
volledige `OmzetMetrics` (omzet, adr, bezetting, kanalen, RevPAR, ...) plus de bijbehorende
STLY- en nulmeting-vergelijking — dat zit al in `listingsUitkomst`, gebruikt door de bestaande
"Accommodaties vergelijken"-tabel. Alleen de `trend`-array (omzet per maand, voor de trendtabel)
wordt nu alléén client-breed berekend. Dat wordt uitgebreid: `listingsUitkomst` krijgt een extra
`trend`-veld per woning, berekend met dezelfde `aggregeer()`-aanroepen maar op de per-woning
gegroepeerde rijen (`perListingHuidig[l.id]`/`perListingStly[l.id]`, al aanwezig) in plaats van de
volledige `huidigeRijen`/`stlyRijen`. Dit raakt maar één functie en werkt automatisch door naar
beide API-routes (`/api/dashboard/omzet` en `/api/admin/klanten/[id]/omzet`), die allebei
`berekenOmzetVoorPeriode` aanroepen.

`OmzetDashboard` krijgt een nieuwe prop `geselecteerdeWoning: string | null` (doorgegeven vanuit
`CijfersInhoud`). Bij een gekozen woning:
- `KpiKaarten` krijgt `huidig`/`vergelijking` uit `data.listings.find(l => l.listing_id ===
  geselecteerdeWoning)` (`.stly`/`.nulmeting`) i.p.v. `data.portfolio`/`data.portfolioStly`/
  `data.portfolioNulmeting`.
- `KanaalUitsplitsing` krijgt `kanalen` van diezelfde per-woning entry.
- `TrendTabel` krijgt het nieuwe per-woning `trend`-veld i.p.v. `data.trend`.
- `ListingsTabel` ("Accommodaties vergelijken") wordt **verborgen** — een vergelijkingstabel met
  1 rij voegt niets toe boven de KPI-kaarten die al zichtbaar zijn.

Bij "Alle woningen" verandert er niets aan het bestaande gedrag. Wisselen van periode blijft een
nieuwe fetch triggeren (zoals nu al); wisselen van woning kost geen fetch, want alle benodigde
per-woning cijfers zitten al in de respons van de lopende periode.

Geen wijziging nodig aan `KpiKaarten`, `KanaalUitsplitsing` of `TrendTabel` zelf — die
accepteren nu al een generieke `OmzetMetrics`/`trend`-vorm, ongeacht of die van het portfolio of
van één woning komt. De "Data synchroniseren"-knop (klant-only) blijft ongewijzigd: die
synchroniseert altijd alle eigen woningen, onafhankelijk van de filter.

## Testen

- Unit-test voor `berekenOmzetVoorPeriode`'s nieuwe per-woning `trend`-veld
  (`tests/unit/omzet-voor-periode.test.ts`, nieuw bestand — deze functie heeft nog geen
  dedicated test-bestand): bij twee woningen met verschillende maandpatronen moet de
  per-woning trend alleen die ene woning weerspiegelen, en moet de som van beide woningen se
  per-woning trend gelijk zijn aan de bestaande portfolio-trend (regressie-garantie dat de
  bestaande aggregatie niet is gebroken).
- Bestaande `tests/unit/bereken-resultaten.test.ts` blijft ongewijzigd van toepassing
  (`berekenMaandVergelijkingen`/`berekenWowCijfer` zelf veranderen niet) — geen nieuwe tests
  nodig daar, wel handmatige verificatie dat `CijfersInhoud` ze met de juiste gefilterde input
  aanroept.
- Handmatige verificatie: bij een klant met 2 woningen, de dropdown gebruiken en controleren
  dat WowCijfer/ResultatenGrafiek/OmzetDashboard (KPI-kaarten, kanalen, trendtabel) correct
  filteren, dat de "Accommodaties vergelijken"-tabel verdwijnt zodra een specifieke woning is
  gekozen en terugkomt bij "Alle woningen", en dat wisselen van periode binnen OmzetDashboard
  de gekozen woning-filter niet ongedaan maakt.
