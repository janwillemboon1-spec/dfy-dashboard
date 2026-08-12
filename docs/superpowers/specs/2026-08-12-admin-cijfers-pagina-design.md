# Klantportaal — Cijfers-pagina voor de admin (deelproject 6/7) — Design

## Context

De admin-Cijferspagina (`/admin/klanten/[id]/cijfers`) is sinds de portaalschil (deelproject 1)
een placeholder ("Deze sectie is binnenkort beschikbaar."). Doel: de admin moet, net als de
klant op zijn eigen Cijferspagina, de echte cijfers kunnen zien voor een gekozen klant:
omzet-dashboard, resultatengrafiek, en de Impactmeter.

## Het kernprobleem

`/api/dashboard/omzet` geeft bewust een 403 voor admin-sessies. De queries daarbinnen filteren
nergens expliciet op `client_id` — ze vertrouwen volledig op RLS ("klant leest eigen
listings/reserveringen") om de data van de ingelogde klant af te bakenen. Voor een
admin-sessie zouden dezelfde queries (omdat de admin-RLS-policies juist alles ongefilterd
doorlaten) de omzetdata van *alle* klanten tegelijk teruggeven — vandaar de expliciete blokkade
met een uitgebreide toelichting in de route zelf.

## Ontwerp

### 1. Nieuwe, aparte admin-route

`src/app/api/admin/klanten/[id]/omzet/route.ts` — admin-only (via `assertIsAdmin()`), filtert
expliciet:
1. `listings` opgehaald met `.eq('client_id', id)`.
2. Uit die listings de lijst van listing-ID's gehaald, en `pricelabs_reserveringen_cache`
   bevraagd met `.in('listing_id', listingIds)` — die cache-tabel heeft zelf geen
   `client_id`-kolom, alleen `listing_id`, dus filteren kan alleen via de listing-ID's.

Dezelfde query-parameters als de bestaande route: `start`, `eind`, `periodeType`
(`vast`/`eigen`), met dezelfde validatie (verplicht, ISO-datumformaat, `start <= eind`).

De bestaande `/api/dashboard/omzet` blijft **volledig ongewijzigd** — geen enkel risico op
regressie in de al-werkende klantflow.

### 2. Gedeelde rekenlogica

De aggregatie-logica binnen de huidige route (STLY-verschuiving, `aggregeer()`,
`groepeerPerListing()`, nulmeting-vergelijking, trend-per-maand — zo'n 150 regels) is voor
beide routes identiek; alleen de databron (RLS-gescoped vs. expliciet `client_id`-gefilterd)
verschilt. Die logica verhuist naar een gedeelde helper
`src/lib/dashboard/omzet-voor-periode.ts`, functie:

```
berekenOmzetVoorPeriode({
  listings,       // { id, naam, nulmeting }[]
  huidigeRijen,    // reserveringen-cache-rijen voor de huidige periode
  stlyRijen,       // reserveringen-cache-rijen voor de STLY-periode
  start, eind,     // ISO-datums van de gekozen periode
  periodeType,     // 'vast' | 'eigen'
}) => OmzetData    // { periode, periodeType, portfolio, portfolioStly, portfolioNulmeting, listings, trend }
```

Beide routes doen zelf alleen nog: auth/validatie, de drie Supabase-queries (listings +
huidige rijen + STLY-rijen), en roepen daarna deze ene functie aan voor de rest van de
berekening. Dit voorkomt dat de aggregatie-logica dubbel bestaat en ooit uit elkaar loopt.

### 3. Component-hergebruik

`OmzetDashboard` krijgt een optionele `clientId?: string`-prop:
- **Zonder prop** (klant-gebruik, huidig gedrag): fetcht `/api/dashboard/omzet`, toont de
  "Data synchroniseren"-knop.
- **Met prop** (admin-gebruik): fetcht `/api/admin/klanten/${clientId}/omzet` in plaats
  daarvan. De "Data synchroniseren"-knop (en de bijbehorende foutmelding-state) wordt niet
  getoond — de admin heeft al een "Sync nu"-knop per listing op het Instellingen-tabblad; een
  portfolio-brede sync-actie voor admin is expliciet buiten scope voor dit deelproject.

`WowCijfer` (Impactmeter) en `ResultatenGrafiek` hebben geen wijziging nodig: die zijn al puur
data-driven (props in, JSX uit) zonder eigen fetch- of RLS-aannames.

### 4. De nieuwe pagina

`src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx` vervangt de huidige placeholder:
- Titel: `"Cijfers"` (i.p.v. de klant-versie's `"Welkom, {naam}!"`, wat voor een admin die
  andermans data bekijkt niet past — consistent met hoe de admin-Voortgangpagina ook gewoon
  "Voortgang" als titel heeft).
- Haalt `listings` op met expliciete `.eq('client_id', id)` (zelfde patroon als de
  Voortgang-/Instellingen-tabbladen), berekent `vergelijkingen`/`wowCijfer`/`startmaand` met de
  bestaande, ongewijzigde `bereken-resultaten`-functies.
- Rendert, in dezelfde volgorde/opmaak als de klant-versie: `<WowCijfer .../>`,
  `<OmzetDashboard clientId={id} />`, `<ResultatenGrafiek .../>`.

## Testen

- Integratietest voor de nieuwe admin-route: weigert een niet-admin-sessie met 403, weigert
  ontbrekende/ongeldige periode-params (zelfde validatie als de bestaande route), en
  retourneert bij een geldige aanroep alleen data van de opgegeven `client_id` — met een
  tweede, ongerelateerde klant en diens eigen listing/reserveringen in de testfixture, om aan
  te tonen dat er geen lekkage optreedt tussen klanten.
- De gedeelde rekenhelper (`berekenOmzetVoorPeriode`) krijgt geen aparte nieuwe unit-tests: de
  logica verplaatst 1-op-1 vanuit de bestaande, al-geteste route-code, niet herschreven — de
  bestaande dekking via de klant-route blijft dus inhoudelijk gelden.
- Handmatige verificatie: als admin naar `/admin/klanten/[id]/cijfers` van een klant met
  PriceLabs-gekoppelde listings — Impactmeter, omzet-dashboard (met periode-wisselaar) en
  resultatengrafiek tonen dezelfde cijfers als wanneer die klant zelf inlogt en naar zijn eigen
  Cijferspagina gaat. Geen "Data synchroniseren"-knop zichtbaar op de admin-versie.
