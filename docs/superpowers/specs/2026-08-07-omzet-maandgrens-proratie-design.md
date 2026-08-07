# Maandgrens-proratie voor omzetberekening — Design

## Probleem

Het omzetdashboard telt een reservering volledig mee bij de periode waarin de **incheckdatum**
valt. Een boeking die een periodegrens overschrijdt (bv. incheck 25 juli, uitcheck 4 augustus)
wordt dus met al zijn nachten én omzet aan juli toegekend, terwijl PriceLabs zelf naar rato
prorateert over de maanden waarin de boeking daadwerkelijk plaatsvindt.

Root cause bevestigd aan de hand van chalet 7, juli 2026: het dashboard toonde €2598,30/32
nachten, PriceLabs €2356,65. Het verschil (€241,65) komt exact overeen met 3 van de 10 nachten
(en het bijbehorende omzetdeel) van reservering `HMS8NQ5TRW` (25 juli → 4 augustus, €805,50) die
in augustus vallen. Er is geen dubbele boeking, geen overlap, geen sync-bug — de sync levert één
schone, niet-overlappende dataset. Het is een methodologisch verschil in hoe een grensoverschrijdende
boeking wordt toegerekend.

Dit speelt overal waar `pricelabs_reserveringen_cache`-rijen per periode worden opgeteld:
- Het klantdashboard (`src/app/api/dashboard/omzet/route.ts`): portfolio-totalen, per-listing
  tabel, kanalen-uitsplitsing, trendgrafiek per maand.
- De admin-berekening van de nulmeting uit historische PriceLabs-data
  (`src/app/[locale]/admin/klanten/[id]/actions.ts`, `berekenNulmetingUitPricelabs`).

## Precedent in de codebase

`src/lib/pricelabs/sync.ts` (`berekenMaandTotalen`, Fase 2a, vult de — momenteel nergens
uitgelezen — tabel `monthly_actuals`) prorateert al op precies dit principe: nachten per
kalendermaand tellen, omzet naar rato van nachtenaandeel verdelen. Dat bevestigt dat proratie
het juiste principe is; deze functie zelf wordt niet hergebruikt omdat ze (a) nacht-voor-nacht
itereert i.p.v. een directe intervaloverlap berekent, en (b) hard aan kalendermaandgrenzen
gebonden is, terwijl het klantdashboard ook een vrij gekozen periode ("eigen periode") moet
kunnen prorateren die niet op een maandgrens hoeft te beginnen/eindigen.

## Doel

Elke plek die reserveringen optelt over een periode `[start, eind)` moet van een reservering die
de periodegrens overschrijdt alleen het deel meetellen dat binnen die periode valt — nachten
naar rato, omzet (`rental_revenue`, `total_cost`) naar rato van het nachtenaandeel.

**Buiten scope:** `nulmeting-metrics.ts` (leest al vastgestelde, handmatig ingevoerde
maandtotalen — geen reserveringsniveau-data, dus niets te prorateren) en `monthly_actuals`/
`berekenMaandTotalen` (aparte, momenteel ongebruikte tabel; blijft ongewijzigd).

## Ontwerp

### 1. Kernfunctie: overlap in nachten

Nieuwe pure functie in `src/lib/dashboard/omzet-aggregatie.ts`:

```ts
function overlapNachten(reservering: { check_in: string; check_out: string }, periodeStart: string, periodeEind: string): number {
  const checkIn = new Date(`${reservering.check_in}T00:00:00Z`).getTime();
  const checkOut = new Date(`${reservering.check_out}T00:00:00Z`).getTime();
  const start = new Date(`${periodeStart}T00:00:00Z`).getTime();
  const eind = new Date(`${periodeEind}T00:00:00Z`).getTime();
  const overlapStart = Math.max(checkIn, start);
  const overlapEind = Math.min(checkOut, eind);
  return Math.max(0, Math.round((overlapEind - overlapStart) / 86_400_000));
}
```

`periodeEind` is exclusief (net als `check_out`), zodat een reservering met `check_out` gelijk
aan `periodeStart` van de volgende maand geen nacht dubbel telt — consistent met hoe
`check_out` nu al als exclusieve einddatum wordt gebruikt (`no_of_days` check-constraint
`check_out > check_in`).

### 2. `aggregeer()` krijgt periodegrenzen en prorateert

Signatuur wijzigt van `aggregeer(reserveringen, totaleDagen)` naar
`aggregeer(reserveringen, periodeStart, periodeEind, totaleDagen)`. Per reservering:

```ts
const nachtenInPeriode = overlapNachten(r, periodeStart, periodeEind);
const aandeel = r.no_of_days > 0 ? nachtenInPeriode / r.no_of_days : 0;
const omzetAandeel = r.rental_revenue * aandeel;
const omzetInclAandeel = (r.total_cost ?? 0) * aandeel;
```

Reserveringen met `nachtenInPeriode === 0` (geen overlap) tellen niet mee — dit vervangt de
huidige aanpak waarbij de aanroeper al had voorgefilterd op `check_in` binnen de periode.
`omzet`, `omzetIncl` en `nachten` worden opgebouwd uit deze geprorateerde waarden. De
kanalen-uitsplitsing (`kanalen[kanaal].omzet`) gebruikt óók `omzetAandeel` in plaats van de
volle `rental_revenue`, zodat de som van de kanalen altijd optelt tot het (geprorateerde)
totaal.

`adr`, `bezetting`, `revpar` blijven afgeleid van de al-geprorateerde `omzet`/`nachten` —
geen aparte aanpassing nodig.

### 3. Query: van check_in-filter naar overlap-filter

`route.ts` en `actions.ts` filteren nu op `.gte('check_in', start).lte('check_in', eind)`. Dit
sluit boekingen uit die vóór `start` begonnen maar de periode inlopen. Wordt:

```ts
.lte('check_in', eind)
.gt('check_out', start)
```

Geen ondergrens op `check_in` nodig — een boeking die (veel) eerder is begonnen maar nu nog
loopt, moet gewoon meetellen voor zijn overlappend deel. Gegeven de datavolumes (cache is per
listing, RLS-gescoped) is een extra index niet nodig; `check_in`-index dekt de eerste filter,
`check_out` wordt als tweede voorwaarde toegepast op een klein resultaat.

### 4. Trendgrafiek: `groepeerPerMaand` vervalt

`groepeerPerMaand` bucket't nu een reservering volledig bij de kalendermaand van `check_in` —
dezelfde bug, één laag hoger. Wordt vervangen: voor elke maand in `trendMaanden` wordt
`aggregeer()` opnieuw aangeroepen tegen **dezelfde volledige, al opgehaalde** `huidigeRijen`
(resp. `stlyRijen`) set, met die maand als `[maandStart, maandEind)`-grens:

```ts
const trend = trendMaanden.map((maand) => {
  const [jaarStr, maandNummerStr] = maand.split('-');
  const jaar = Number(jaarStr);
  const maandNummer = Number(maandNummerStr);
  const { jaar: volgJaar, maand: volgMaand } = volgendeMaand(jaar, maandNummer);
  const maandStart = `${maand}-01`;
  const maandEind = `${volgJaar}-${String(volgMaand).padStart(2, '0')}-01`;
  const metrics = aggregeer(huidigeRijen ?? [], maandStart, maandEind, dagenInMaand(jaar, maandNummer));
  // stly-equivalent: dezelfde berekening met stlyMaand-grenzen tegen stlyRijen
  ...
});
```

`volgendeMaand` (uit `src/lib/pricelabs/sync.ts`, al elders geïmporteerd, zie
`reserveringen-sync.ts`) en `dagenInMaand` (idem) zijn bestaande helpers — geen nieuwe nodig.
Omdat `huidigeRijen` al overlap-gefetcht is over de hele gevraagde periode (punt 3), bevat die
set alle reserveringen die in enige maand van de trend (deels) vallen — geen aparte query per
maand nodig. `groepeerPerMaand` en zijn export worden verwijderd; er zijn geen andere
aanroepers dan de twee die hier worden aangepast.

### 5. Nulmeting-berekening uit PriceLabs (`actions.ts`)

`berekenNulmetingUitPricelabs` heeft exact hetzelfde patroon (`groepeerPerMaand` + `aggregeer`
per bronmaand) en krijgt dezelfde behandeling: de cache-query wordt overlap-based
(`.lte('check_in', ...)` + `.gt('check_out', ...)` i.p.v. alleen `check_in`-grenzen), en per
bronmaand wordt `aggregeer(cacheRijen, maandStart, maandEind, dagenInMaand(bron.bronJaar, bron.bronMaand))`
aangeroepen tegen de volledige opgehaalde set.

Dit lost meteen ook de bestaande defensieve clamp op regel 267-281 (bezetting > 100%,
gelabeld als "mogelijk overlappende reserveringen") gedeeltelijk op: die waarschuwing kon
mede getriggerd worden door exact dit maandgrens-effect. De clamp zelf blijft staan als
vangnet — hij wordt niet verwijderd, want een score > 100% kan ook door een echt
datakwaliteitsprobleem komen.

### 6. Wat ongewijzigd blijft

- `dagenInPeriode`, `groepeerPerListing`: geen wijziging.
- `nulmeting-metrics.ts` / `nulmetingAlsMetrics`: geen wijziging (geen reserveringsdata).
- `monthly_actuals` / `berekenMaandTotalen` / `syncListing` in `sync.ts`: geen wijziging
  (aparte, ongebruikte tabel — buiten scope, zie "Doel").
- Afronding: geen speciale centen-afronding in `aggregeer()` zelf; bestaande
  `Math.round(x * 100) / 100`-afronding bij opslag/weergave (zoals nu al in
  `berekenNulmetingUitPricelabs`) blijft de plek waar naar centen wordt afgerond.

## Testen

- `tests/unit/omzet-aggregatie.test.ts`: bestaande tests aanpassen aan nieuwe
  `aggregeer(reserveringen, periodeStart, periodeEind, totaleDagen)`-signatuur. Nieuwe cases:
  - Reservering die volledig vóór de periode ligt → telt niet mee.
  - Reservering die de linkergrens overschrijdt (check_in vóór start, check_out in periode) →
    alleen het deel binnen de periode telt.
  - Reservering die de rechtergrens overschrijdt (het chalet 7-scenario: 10 nachten, 7 in
    periode) → omzet/nachten naar rato (7/10).
  - Kanalen-uitsplitsing bij een grensoverschrijdende boeking → prorateert mee.
  - `groepeerPerMaand`-tests verwijderen (functie vervalt).
- Nieuwe tests voor `overlapNachten` (of impliciet via `aggregeer`, als de functie niet
  geëxporteerd wordt): exacte grens (`check_out === periodeStart` → 0 nachten), volledige
  overlap, gedeeltelijke overlap aan beide kanten.
- `tests/integration/bereken-nulmeting-uit-pricelabs.test.ts`: aanpassen aan de nieuwe
  overlap-query + per-maand-proratie; test toevoegen voor een bronmaand met een
  grensoverschrijdende boeking.
- Handmatige verificatie: chalet 7 juli 2026 opnieuw doorrekenen, dashboard moet €2356,65 en
  29 nachten tonen (in plaats van €2598,30/32).
