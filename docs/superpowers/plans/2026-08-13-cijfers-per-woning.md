# Cijfers per woning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-listing filter to the Cijfers page (admin `/admin/klanten/[id]/cijfers` and klant `/dashboard/cijfers`), so a client with multiple accommodations can view WowCijfer, OmzetDashboard, and ResultatenGrafiek either combined ("Alle woningen") or scoped to a single listing.

**Architecture:** A single "Woning: Alle woningen ▾" dropdown, shown only when a client has more than 1 listing, drives all three widgets via a new client orchestrator component `CijfersInhoud` (mirroring `VoortgangInhoud` from the earlier "Voortgang per woning" sub-project). WowCijfer/ResultatenGrafiek are recomputed client-side from already-fetched per-listing data (no new fetch). OmzetDashboard's underlying API already computes full per-listing metrics for its existing "Accommodaties vergelijken" table — this plan extends it to also compute a per-listing trend, so OmzetDashboard can switch woning instantly too, with zero new network requests when the filter changes (only period changes still fetch, exactly as today).

**Tech Stack:** Next.js App Router Server Components (data fetching) + Client Components (interactive filtering), Vitest for unit tests, no new dependencies.

**Reference:** Spec at `docs/superpowers/specs/2026-08-13-cijfers-per-woning-design.md`. No DB schema changes are needed for this plan — everything reuses existing columns (`listings.id/naam`, `nulmeting`, `monthly_actuals`, `pricelabs_reserveringen_cache.listing_id`), so there's no separate backend/frontend split like the earlier "Voortgang per woning" plan needed.

---

### Task 1: Per-listing `trend` in `berekenOmzetVoorPeriode`

**Files:**
- Modify: `src/lib/dashboard/omzet-voor-periode.ts`
- Create: `tests/unit/omzet-voor-periode.test.ts`

`berekenOmzetVoorPeriode` already computes full per-listing `OmzetMetrics` (used by the existing "Accommodaties vergelijken" table) but only computes the month-by-month `trend` array once, for the whole portfolio. This task extracts the trend computation into a reusable helper and calls it once per listing too, so each listing gets its own `trend` array with the exact same shape as the portfolio one.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/omzet-voor-periode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { berekenOmzetVoorPeriode, type OmzetVoorPeriodeListing } from '@/lib/dashboard/omzet-voor-periode';
import type { CacheReservering } from '@/lib/dashboard/omzet-aggregatie';

function reservering(overrides: Partial<CacheReservering> = {}): CacheReservering {
  return {
    listing_id: 'listing-a',
    check_in: '2025-07-05',
    check_out: '2025-07-06',
    rental_revenue: 100,
    total_cost: null,
    no_of_days: 1,
    booking_status: 'booked',
    booking_channel: 'airbnb',
    ...overrides,
  };
}

function listing(overrides: Partial<OmzetVoorPeriodeListing> = {}): OmzetVoorPeriodeListing {
  return {
    id: 'listing-a',
    naam: 'Listing A',
    nulmeting: [],
    ...overrides,
  };
}

describe('berekenOmzetVoorPeriode — trend per woning', () => {
  it('berekent voor elke woning een eigen trend die alleen haar eigen omzet weerspiegelt', () => {
    const listings = [listing({ id: 'listing-a', naam: 'A' }), listing({ id: 'listing-b', naam: 'B' })];
    const huidigeRijen: CacheReservering[] = [
      reservering({ listing_id: 'listing-a', check_in: '2025-07-05', check_out: '2025-07-06', rental_revenue: 300 }),
      reservering({ listing_id: 'listing-a', check_in: '2025-08-05', check_out: '2025-08-06', rental_revenue: 100 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-07-10', check_out: '2025-07-11', rental_revenue: 50 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-08-10', check_out: '2025-08-11', rental_revenue: 400 }),
    ];

    const result = berekenOmzetVoorPeriode({
      listings,
      huidigeRijen,
      stlyRijen: [],
      start: '2025-07-01',
      eind: '2025-08-31',
      periodeType: 'eigen',
    });

    const trendA = result.listings.find((l) => l.listing_id === 'listing-a')!.trend;
    const trendB = result.listings.find((l) => l.listing_id === 'listing-b')!.trend;

    expect(trendA.map((t) => ({ maand: t.maand, omzet: t.omzet }))).toEqual([
      { maand: '2025-07', omzet: 300 },
      { maand: '2025-08', omzet: 100 },
    ]);
    expect(trendB.map((t) => ({ maand: t.maand, omzet: t.omzet }))).toEqual([
      { maand: '2025-07', omzet: 50 },
      { maand: '2025-08', omzet: 400 },
    ]);
  });

  it('de som van de per-woning trend over alle woningen komt overeen met de portfolio-trend', () => {
    const listings = [listing({ id: 'listing-a', naam: 'A' }), listing({ id: 'listing-b', naam: 'B' })];
    const huidigeRijen: CacheReservering[] = [
      reservering({ listing_id: 'listing-a', check_in: '2025-07-05', check_out: '2025-07-06', rental_revenue: 300 }),
      reservering({ listing_id: 'listing-a', check_in: '2025-08-05', check_out: '2025-08-06', rental_revenue: 100 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-07-10', check_out: '2025-07-11', rental_revenue: 50 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-08-10', check_out: '2025-08-11', rental_revenue: 400 }),
    ];

    const result = berekenOmzetVoorPeriode({
      listings,
      huidigeRijen,
      stlyRijen: [],
      start: '2025-07-01',
      eind: '2025-08-31',
      periodeType: 'eigen',
    });

    const trendA = result.listings.find((l) => l.listing_id === 'listing-a')!.trend;
    const trendB = result.listings.find((l) => l.listing_id === 'listing-b')!.trend;
    const somPerMaand = result.trend.map((portfolioPunt) => {
      const a = trendA.find((t) => t.maand === portfolioPunt.maand)!.omzet;
      const b = trendB.find((t) => t.maand === portfolioPunt.maand)!.omzet;
      return { maand: portfolioPunt.maand, omzet: a + b };
    });

    expect(somPerMaand).toEqual(result.trend.map((t) => ({ maand: t.maand, omzet: t.omzet })));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/omzet-voor-periode.test.ts`
Expected: FAIL — `result.listings.find(...)!.trend` is `undefined` at runtime (the field doesn't exist yet on the per-listing objects returned by `berekenOmzetVoorPeriode`), so calling `.map` on it throws a `TypeError`.

- [ ] **Step 3: Replace the full contents of `omzet-voor-periode.ts`**

Replace the full contents of `src/lib/dashboard/omzet-voor-periode.ts` with:

```typescript
import { aggregeer, dagenInPeriode, groepeerPerListing, type CacheReservering, type OmzetMetrics } from './omzet-aggregatie';
import { nulmetingAlsMetrics, type NulmetingRij } from './nulmeting-metrics';

export function shiftJaar(datum: string, jaren: number): string {
  return datum.replace(/^(\d{4})/, (jaarStr) => String(Number(jaarStr) + jaren));
}

// PostgREST's max_rows staat op 1000 (supabase/config.toml) — geen paginering op de
// reserveringen-queries die deze rijen aanleveren, dus een resultaat van precies 1000 rijen
// is een signaal dat de data mogelijk afgekapt is i.p.v. compleet. Geen harde fout (de
// dashboardcijfers zijn dan nog steeds bruikbaar, alleen mogelijk een onderschatting), wel
// zichtbaar loggen zodat dit opvalt vóórdat een klant het zelf meldt.
const MAX_RIJEN_PER_QUERY = 1000;
export function waarschuwBijMogelijkeAfkapping(label: string, rijen: unknown[] | null): void {
  if ((rijen?.length ?? 0) >= MAX_RIJEN_PER_QUERY) {
    console.warn(`[omzet-voor-periode] ${label}: ${rijen!.length} rijen opgehaald — mogelijk afgekapt door PostgREST's max_rows.`);
  }
}

export interface OmzetVoorPeriodeListing {
  id: string;
  naam: string;
  nulmeting: NulmetingRij[];
}

export interface TrendPunt {
  maand: string;
  omzet: number;
  omzetStly: number;
  omzetNulmeting: number | null;
}

export interface OmzetData {
  periode: { start: string; eind: string; stlyStart: string; stlyEind: string };
  periodeType: 'vast' | 'eigen';
  portfolio: OmzetMetrics;
  portfolioStly: OmzetMetrics;
  portfolioNulmeting: OmzetMetrics | null;
  listings: Array<
    OmzetMetrics & { listing_id: string; listing_naam: string; stly: OmzetMetrics; nulmeting: OmzetMetrics | null; trend: TrendPunt[] }
  >;
  trend: TrendPunt[];
}

export function berekenOmzetVoorPeriode({
  listings,
  huidigeRijen,
  stlyRijen,
  start,
  eind,
  periodeType,
}: {
  listings: OmzetVoorPeriodeListing[];
  huidigeRijen: CacheReservering[];
  stlyRijen: CacheReservering[];
  start: string;
  eind: string;
  periodeType: 'vast' | 'eigen';
}): OmzetData {
  const stlyStart = shiftJaar(start, -1);
  const stlyEind = shiftJaar(eind, -1);

  const aantalListings = listings.length;
  const dagen = dagenInPeriode(start, eind);
  const stlyDagen = dagenInPeriode(stlyStart, stlyEind);

  const alleNulmeting: NulmetingRij[] = listings.flatMap((l) => l.nulmeting ?? []);

  // aggregeer() gebruikt een exclusieve periodeEind (net als check_out) om de overlap per
  // reservering te bepalen — eind/stlyEind zelf zijn de laatste inclusieve kalenderdag
  // (dagenInPeriode telt daarom ook inclusief), dus hier +1 dag zodat een reservering die
  // op eind zelf incheckt niet ten onrechte buiten de periode valt.
  function exclusieveGrens(datum: string): string {
    const d = new Date(`${datum}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const eindExclusief = exclusieveGrens(eind);
  const stlyEindExclusief = exclusieveGrens(stlyEind);

  const portfolio = aggregeer(huidigeRijen, start, eindExclusief, dagen * aantalListings);
  const portfolioStly = aggregeer(stlyRijen, stlyStart, stlyEindExclusief, stlyDagen * aantalListings);
  const portfolioNulmeting = periodeType === 'vast' ? nulmetingAlsMetrics(alleNulmeting, start, eind) : null;

  const perListingHuidig = groepeerPerListing(huidigeRijen);
  const perListingStly = groepeerPerListing(stlyRijen);

  const trendMaanden: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const eindMaand = eind.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= eindMaand) {
    trendMaanden.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  function maandGrenzen(maand: string): { start: string; eind: string } {
    const [jaarStr, maandNummerStr] = maand.split('-');
    const jaar = Number(jaarStr);
    const maandNummer = Number(maandNummerStr);
    const volgende = maandNummer === 12 ? { jaar: jaar + 1, maand: 1 } : { jaar, maand: maandNummer + 1 };
    return {
      start: `${maand}-01`,
      eind: `${volgende.jaar}-${String(volgende.maand).padStart(2, '0')}-01`,
    };
  }

  // Hergebruikt door zowel de portfolio-trend als de per-woning trend hieronder — telkens
  // met een andere (al overlap-gefetchte) subset van dezelfde rijen, zodat een reservering
  // die een maandgrens overschrijdt vanzelf naar rato meetelt in beide maanden, exact zoals
  // de (voorheen alleen portfolio-brede) trend dat al deed vóór deze functie werd
  // uitgesplitst in een herbruikbare helper.
  function berekenTrend(rijen: CacheReservering[], stlyRijenVoorTrend: CacheReservering[], nulmetingRijen: NulmetingRij[]): TrendPunt[] {
    return trendMaanden.map((maand) => {
      const stlyMaand = shiftJaar(`${maand}-01`, -1).slice(0, 7);
      const [, maandNummerStr] = maand.split('-');
      const maandNummer = Number(maandNummerStr);
      const omzetNulmeting = periodeType === 'vast'
        ? nulmetingRijen.filter((r) => r.maand === maandNummer).reduce((s, r) => s + r.omzet, 0)
        : null;
      const { start: maandStart, eind: maandEind } = maandGrenzen(maand);
      const { start: stlyMaandStart, eind: stlyMaandEind } = maandGrenzen(stlyMaand);
      return {
        maand,
        omzet: aggregeer(rijen, maandStart, maandEind, 30).omzet,
        omzetStly: aggregeer(stlyRijenVoorTrend, stlyMaandStart, stlyMaandEind, 30).omzet,
        omzetNulmeting,
      };
    });
  }

  const listingsUitkomst = listings.map((l) => {
    const eigenHuidigeRijen = perListingHuidig[l.id] ?? [];
    const eigenStlyRijen = perListingStly[l.id] ?? [];
    const metrics = aggregeer(eigenHuidigeRijen, start, eindExclusief, dagen);
    const stlyMetrics = aggregeer(eigenStlyRijen, stlyStart, stlyEindExclusief, stlyDagen);
    const nulmetingMetrics = periodeType === 'vast' ? nulmetingAlsMetrics(l.nulmeting ?? [], start, eind) : null;
    return {
      listing_id: l.id,
      listing_naam: l.naam,
      ...metrics,
      stly: stlyMetrics,
      nulmeting: nulmetingMetrics,
      trend: berekenTrend(eigenHuidigeRijen, eigenStlyRijen, l.nulmeting ?? []),
    };
  }).sort((a, b) => b.omzet - a.omzet);

  const trend = berekenTrend(huidigeRijen, stlyRijen, alleNulmeting);

  return {
    periode: { start, eind, stlyStart, stlyEind },
    periodeType,
    portfolio,
    portfolioStly,
    portfolioNulmeting,
    listings: listingsUitkomst,
    trend,
  };
}
```

The only behavioral changes versus the original file: the trend-building logic that used to be inlined once (for the portfolio) is now the `berekenTrend` helper, called once for the portfolio (identical inputs and output to before) and once per listing (new). Nothing about the portfolio-level `trend`, `portfolio`, `portfolioStly`, or `portfolioNulmeting` computation changed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/omzet-voor-periode.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full unit test suite to check for regressions**

Run: `npx vitest run tests/unit/`
Expected: all tests pass, including the untouched `tests/unit/omzet-aggregatie.test.ts` and `tests/unit/nulmeting-metrics.test.ts` (this task didn't change `aggregeer`/`nulmetingAlsMetrics` themselves, only how `omzet-voor-periode.ts` calls them).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/omzet-voor-periode.ts tests/unit/omzet-voor-periode.test.ts
git commit -m "feat: berekenOmzetVoorPeriode berekent nu ook een trend per woning"
```

---

### Task 2: `OmzetDashboard` gains an optional `geselecteerdeWoning` prop

**Files:**
- Modify: `src/components/dashboard/omzet-dashboard.tsx`

The new prop is optional (`geselecteerdeWoning?: string | null`) so this task alone keeps every existing caller (`<OmzetDashboard clientId={id} />`, `<OmzetDashboard />`) valid without any changes to them — the build stays green throughout this task.

- [ ] **Step 1: Replace the full contents of the file**

Replace the full contents of `src/components/dashboard/omzet-dashboard.tsx` with:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { syncEigenListings } from '@/app/[locale]/dashboard/actions';
import { Button } from '@/components/ui/button';
import { KpiKaarten } from './kpi-kaarten';
import { KanaalUitsplitsing } from './kanaal-uitsplitsing';
import { ListingsTabel } from './listings-tabel';
import { TrendTabel } from './trend-tabel';
import type { OmzetMetrics } from '@/lib/dashboard/omzet-aggregatie';

const PERIODES = [
  { id: 'deze_maand', label: 'Deze maand' },
  { id: 'vorige_maand', label: 'Vorige maand' },
  { id: 'dit_jaar', label: 'Dit jaar' },
  { id: 'eigen', label: 'Eigen periode' },
] as const;
type PeriodeId = (typeof PERIODES)[number]['id'];

function berekenPeriode(id: PeriodeId, eigenStart: string, eigenEind: string): { start: string; eind: string } {
  const nu = new Date();
  const jaar = nu.getFullYear();
  const maand = nu.getMonth();

  if (id === 'deze_maand') {
    const laatsteDag = new Date(jaar, maand + 1, 0).getDate();
    return { start: `${jaar}-${String(maand + 1).padStart(2, '0')}-01`, eind: `${jaar}-${String(maand + 1).padStart(2, '0')}-${laatsteDag}` };
  }
  if (id === 'vorige_maand') {
    const vorigeMaand = maand === 0 ? 11 : maand - 1;
    const vorigJaar = maand === 0 ? jaar - 1 : jaar;
    const laatsteDag = new Date(vorigJaar, vorigeMaand + 1, 0).getDate();
    return { start: `${vorigJaar}-${String(vorigeMaand + 1).padStart(2, '0')}-01`, eind: `${vorigJaar}-${String(vorigeMaand + 1).padStart(2, '0')}-${laatsteDag}` };
  }
  if (id === 'dit_jaar') {
    return { start: `${jaar}-01-01`, eind: `${jaar}-12-31` };
  }
  return { start: eigenStart, eind: eigenEind };
}

interface TrendPunt {
  maand: string;
  omzet: number;
  omzetStly: number;
  omzetNulmeting: number | null;
}

interface OmzetData {
  portfolio: OmzetMetrics;
  portfolioStly: OmzetMetrics;
  portfolioNulmeting: OmzetMetrics | null;
  listings: Array<OmzetMetrics & { listing_id: string; listing_naam: string; stly: OmzetMetrics; nulmeting: OmzetMetrics | null; trend: TrendPunt[] }>;
  trend: TrendPunt[];
}

interface OmzetWeergave {
  huidig: OmzetMetrics;
  vergelijking: OmzetMetrics | null;
  kanalen: Record<string, { omzet: number; boekingen: number }>;
  trend: TrendPunt[];
  toonListingsTabel: boolean;
}

// Kiest, op basis van de woning-filter, welke cijfers de KPI-kaarten/kanalen/trend moeten
// tonen: het portfolio-totaal (alle woningen) of de al-berekende cijfers van precies één
// woning uit data.listings — de API levert die al kant-en-klaar mee (berekenOmzetVoorPeriode),
// dus dit is puur een keuze uit al-opgehaalde data, zonder nieuwe netwerk-aanvraag.
function bepaalWeergave(data: OmzetData, geselecteerdeWoning: string | null | undefined, vergelijkModus: 'stly' | 'nulmeting'): OmzetWeergave {
  const geselecteerdeListing = geselecteerdeWoning ? data.listings.find((l) => l.listing_id === geselecteerdeWoning) : undefined;

  if (geselecteerdeListing) {
    return {
      huidig: geselecteerdeListing,
      vergelijking: vergelijkModus === 'stly' ? geselecteerdeListing.stly : geselecteerdeListing.nulmeting,
      kanalen: geselecteerdeListing.kanalen,
      trend: geselecteerdeListing.trend,
      toonListingsTabel: false,
    };
  }

  return {
    huidig: data.portfolio,
    vergelijking: vergelijkModus === 'stly' ? data.portfolioStly : data.portfolioNulmeting,
    kanalen: data.portfolio.kanalen,
    trend: data.trend,
    toonListingsTabel: true,
  };
}

export function OmzetDashboard({ clientId, geselecteerdeWoning }: { clientId?: string; geselecteerdeWoning?: string | null }) {
  const [periodeId, setPeriodeId] = useState<PeriodeId>('dit_jaar');
  const [eigenStart, setEigenStart] = useState('');
  const [eigenEind, setEigenEind] = useState('');
  const [vergelijkModus, setVergelijkModus] = useState<'stly' | 'nulmeting'>('stly');
  const [data, setData] = useState<OmzetData | null>(null);
  const [laden, setLaden] = useState(true);
  const [dataFoutmelding, setDataFoutmelding] = useState<string | null>(null);
  const [syncFoutmelding, setSyncFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Voorkomt dat een trage response een snellere overschrijft wanneer de klant snel
  // van periode wisselt of tijdens het laden op "synchroniseren" klikt: alleen de
  // laatst gestarte aanvraag mag nog state zetten.
  const laatsteAanvraagId = useRef(0);

  const laadData = useCallback(() => {
    if (periodeId === 'eigen') {
      if (!eigenStart || !eigenEind) {
        // Bumpt de teller ook hier: anders kan een nog lopende aanvraag van een eerder
        // ingevulde, geldige periode alsnog data zetten onder een inmiddels leeg
        // datumveld.
        laatsteAanvraagId.current += 1;
        return;
      }
      if (eigenStart > eigenEind) {
        laatsteAanvraagId.current += 1;
        setDataFoutmelding('De startdatum mag niet na de einddatum liggen.');
        return;
      }
    }
    const aanvraagId = ++laatsteAanvraagId.current;
    setLaden(true);
    setDataFoutmelding(null);
    const { start, eind } = berekenPeriode(periodeId, eigenStart, eigenEind);
    const periodeType = periodeId === 'eigen' ? 'eigen' : 'vast';
    const endpoint = clientId ? `/api/admin/klanten/${clientId}/omzet` : '/api/dashboard/omzet';
    fetch(`${endpoint}?start=${start}&eind=${eind}&periodeType=${periodeType}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Ophalen van omzetdata is mislukt.');
        return body as OmzetData;
      })
      .then((body) => {
        if (aanvraagId !== laatsteAanvraagId.current) return;
        setData(body);
      })
      .catch((fout: Error) => {
        if (aanvraagId !== laatsteAanvraagId.current) return;
        setDataFoutmelding(fout.message);
      })
      .finally(() => {
        if (aanvraagId !== laatsteAanvraagId.current) return;
        setLaden(false);
      });
  }, [periodeId, eigenStart, eigenEind, clientId]);

  useEffect(() => {
    // laadData zelf roept setLaden/setData aan (fetch naar een externe API-route) —
    // dat is precies het "synchroniseren met een extern systeem"-geval waarvoor effects
    // bedoeld zijn, geen state-afgeleide berekening die in render zou kunnen. De regel
    // hieronder klopt inhoudelijk; alleen de eslint-heuristiek herkent dat verschil niet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadData();
  }, [laadData]);

  function synchroniseer() {
    setSyncFoutmelding(null);
    startTransition(async () => {
      const resultaat = await syncEigenListings();
      if (!resultaat.succes) {
        setSyncFoutmelding(resultaat.fout ?? 'Onbekende fout bij synchroniseren.');
        return;
      }
      // succes: true betekent alleen dat de actie zelf niet is vastgelopen — niet dat
      // elke listing gelukt is (zie het commentaar bij syncEigenListings). Als alle
      // rijen individueel faalden, is dat voor de klant net zo goed een mislukte sync.
      const rijen = resultaat.resultaten ?? [];
      if (rijen.length > 0 && rijen.every((rij) => !rij.succes)) {
        setSyncFoutmelding(rijen[0].fout ?? 'Synchroniseren is voor geen enkele accommodatie gelukt.');
        return;
      }
      laadData();
    });
  }

  function kiesPeriode(id: PeriodeId) {
    setPeriodeId(id);
    // De nulmeting-vergelijking bestaat alleen voor vaste periodes (periodeType=vast) —
    // bij "Eigen periode" geeft de API altijd portfolioNulmeting: null terug. Zonder
    // deze reset blijft de Nulmeting-knop optisch actief terwijl hij niets vergelijkt.
    if (id === 'eigen') setVergelijkModus('stly');
  }

  const nulmetingBeschikbaar = periodeId !== 'eigen';
  const weergave = data ? bepaalWeergave(data, geselecteerdeWoning, vergelijkModus) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 border-b border-border">
          {PERIODES.map((p) => (
            <button
              key={p.id}
              onClick={() => kiesPeriode(p.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${periodeId === p.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVergelijkModus('stly')}
            disabled={!nulmetingBeschikbaar && vergelijkModus === 'stly'}
            className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${vergelijkModus === 'stly' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            STLY
          </button>
          <button
            onClick={() => setVergelijkModus('nulmeting')}
            disabled={!nulmetingBeschikbaar}
            className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${vergelijkModus === 'nulmeting' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            Nulmeting
          </button>
          {!clientId && (
            <Button size="sm" onClick={synchroniseer} disabled={isPending}>
              {isPending ? 'Bezig...' : 'Data synchroniseren'}
            </Button>
          )}
        </div>
      </div>

      {syncFoutmelding && <p className="text-sm text-destructive">{syncFoutmelding}</p>}

      {periodeId === 'eigen' && (
        <div className="flex items-center gap-3">
          <input type="date" value={eigenStart} onChange={(e) => setEigenStart(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-2" />
          <span className="text-muted-foreground">tot</span>
          <input type="date" value={eigenEind} onChange={(e) => setEigenEind(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-2" />
        </div>
      )}

      {dataFoutmelding && <p className="text-sm text-destructive">{dataFoutmelding}</p>}

      {laden ? (
        <p className="text-sm text-muted-foreground animate-pulse">Omzetdata ophalen...</p>
      ) : !data || !weergave ? null : (
        <div className="space-y-8">
          <KpiKaarten
            huidig={weergave.huidig}
            vergelijking={weergave.vergelijking}
            vergelijkLabel={vergelijkModus === 'stly' ? 'STLY' : 'nulmeting'}
          />
          <KanaalUitsplitsing kanalen={weergave.kanalen} />
          {weergave.toonListingsTabel && <ListingsTabel listings={data.listings} />}
          <TrendTabel trend={weergave.trend} vergelijkModus={vergelijkModus} />
        </div>
      )}
    </div>
  );
}
```

What changed from the original: the `OmzetData` interface's per-listing entries gained a `trend: TrendPunt[]` field (matching Task 1's backend change), a new `bepaalWeergave` helper picks either the portfolio-wide or the selected-listing's metrics/comparison/channels/trend, and the render branch uses `weergave.*` instead of `data.portfolio`/`data.trend` directly. `ListingsTabel` now only renders when `weergave.toonListingsTabel` is true (i.e. no specific woning selected). Nothing else changed — the period tabs, STLY/Nulmeting toggle, sync button, and date-range inputs are untouched.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors — both existing call sites (`<OmzetDashboard clientId={id} />` in the admin Cijfers page, `<OmzetDashboard />` in the klant Cijfers page) remain valid since `geselecteerdeWoning` is optional.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/omzet-dashboard.tsx
git commit -m "feat: OmzetDashboard kan cijfers van één specifieke woning tonen i.p.v. het portfolio-totaal"
```

---

### Task 3: `CijfersListing` type + `CijfersInhoud` orchestrator

**Files:**
- Create: `src/components/dashboard/cijfers-listing.ts`
- Create: `src/components/dashboard/cijfers-inhoud.tsx`

- [ ] **Step 1: Create the shared listing type**

Create `src/components/dashboard/cijfers-listing.ts`:

```typescript
export interface CijfersListing {
  id: string;
  naam: string;
}
```

- [ ] **Step 2: Create the orchestrator component**

Create `src/components/dashboard/cijfers-inhoud.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { berekenMaandVergelijkingen, berekenWowCijfer, vroegsteSamenwerkingGestart, type ListingData } from '@/lib/dashboard/bereken-resultaten';
import { WowCijfer } from './wow-cijfer';
import { OmzetDashboard } from './omzet-dashboard';
import { ResultatenGrafiek } from './resultaten-grafiek';
import type { CijfersListing } from './cijfers-listing';

export interface CijfersListingData extends CijfersListing, ListingData {}

export function CijfersInhoud({ clientId, listings }: { clientId?: string; listings: CijfersListingData[] }) {
  const [geselecteerdeWoning, setGeselecteerdeWoning] = useState<string | null>(null);

  const gefilterdeListings = useMemo(
    () => (geselecteerdeWoning === null ? listings : listings.filter((l) => l.id === geselecteerdeWoning)),
    [listings, geselecteerdeWoning]
  );

  const vergelijkingen = useMemo(() => berekenMaandVergelijkingen(gefilterdeListings), [gefilterdeListings]);
  const wowCijfer = useMemo(() => berekenWowCijfer(vergelijkingen), [vergelijkingen]);
  const startmaand = useMemo(
    () => vroegsteSamenwerkingGestart(gefilterdeListings.map((l) => l.samenwerkingGestart)),
    [gefilterdeListings]
  );

  return (
    <>
      {listings.length > 1 && (
        <div>
          <label htmlFor="cijfers-woning-filter" className="block text-xs text-muted-foreground">
            Woning
          </label>
          <select
            id="cijfers-woning-filter"
            value={geselecteerdeWoning ?? ''}
            onChange={(e) => setGeselecteerdeWoning(e.target.value || null)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Alle woningen</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.naam}
              </option>
            ))}
          </select>
        </div>
      )}

      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
      <OmzetDashboard clientId={clientId} geselecteerdeWoning={geselecteerdeWoning} />
      <ResultatenGrafiek data={vergelijkingen} />
    </>
  );
}
```

This mirrors `VoortgangInhoud` (`src/components/portal/voortgang-inhoud.tsx`) from the earlier "Voortgang per woning" sub-project: it owns the woning-selection state, re-derives everything WowCijfer/ResultatenGrafiek need via `useMemo` (no new network request — `berekenMaandVergelijkingen`/`berekenWowCijfer`/`vroegsteSamenwerkingGestart` are pure functions over the already-fetched `listings` prop), and passes `geselecteerdeWoning` straight through to `OmzetDashboard`, which picks its own data internally (Task 2). Returning a `<>` fragment (not a wrapping `<div>`) matters here: both Cijfers pages apply `space-y-10` directly on `<main>`, and Tailwind's `space-y-*` uses a `> * + *` sibling selector — a fragment keeps the dropdown/WowCijfer/OmzetDashboard/ResultatenGrafiek as direct children of `<main>` so that spacing keeps working exactly as it does today.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds successfully — this is a new, currently-unused file (nothing imports it yet), so it can't break anything; this step only confirms `cijfers-inhoud.tsx` itself type-checks cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/cijfers-listing.ts src/components/dashboard/cijfers-inhoud.tsx
git commit -m "feat: CijfersInhoud-component met woning-filter voor WowCijfer/OmzetDashboard/ResultatenGrafiek"
```

---

### Task 4: Wire both Cijfers pages to `CijfersInhoud`

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx`
- Modify: `src/app/[locale]/dashboard/cijfers/page.tsx`

- [ ] **Step 1: Replace the full contents of the admin page**

Replace the full contents of `src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server';
import { CijfersInhoud, type CijfersListingData } from '@/components/dashboard/cijfers-inhoud';

export default async function CijfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet)')
    .eq('client_id', id)
    .order('aangemaakt_op');
  if (listingsError) console.error('Kon listings niet laden voor cijferpagina:', listingsError);

  const listingsData: CijfersListingData[] = (listings ?? []).map((listing) => ({
    id: listing.id,
    naam: listing.naam,
    nulmeting: listing.nulmeting ?? [],
    monthlyActuals: listing.monthly_actuals ?? [],
    samenwerkingGestart: listing.samenwerking_gestart,
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Cijfers</h1>
      <CijfersInhoud clientId={id} listings={listingsData} />
    </main>
  );
}
```

- [ ] **Step 2: Replace the full contents of the klant page**

Replace the full contents of `src/app/[locale]/dashboard/cijfers/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CijfersInhoud, type CijfersListingData } from '@/components/dashboard/cijfers-inhoud';

// Geen expliciet client_id-filter nodig op de listings-query hieronder: de
// "klant leest eigen listings"-RLS-policy (client_id = current_client_id()) scopet dit
// al af tot precies de listings van de ingelogde klant. Dit klopt alleen voor een
// klant-sessie — dashboard/layout.tsx redirect een admin-sessie al weg vóórdat deze
// pagina rendert, dus de admin-volledige-toegang-policies komen hier nooit in het spel.
export default async function CijfersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('naam')
    .eq('id', user.id)
    .maybeSingle();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet)')
    .order('aangemaakt_op');
  if (listingsError) console.error('Kon listings niet laden voor cijferpagina:', listingsError);

  const listingsData: CijfersListingData[] = (listings ?? []).map((listing) => ({
    id: listing.id,
    naam: listing.naam,
    nulmeting: listing.nulmeting ?? [],
    monthlyActuals: listing.monthly_actuals ?? [],
    samenwerkingGestart: listing.samenwerking_gestart,
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Welkom, {profile?.naam ?? 'daar'}!</h1>
      <CijfersInhoud listings={listingsData} />
    </main>
  );
}
```

Note the klant page's `<CijfersInhoud listings={listingsData} />` omits `clientId` — `CijfersInhoud`'s `clientId` prop is optional and passes straight through to `OmzetDashboard`, which already uses `clientId`'s presence/absence to decide which API endpoint to call and whether to show the "Data synchroniseren" button (unchanged behavior from before this plan).

- [ ] **Step 3: Verify the build is fully clean**

Run: `npm run build`
Expected: builds successfully, zero errors. This is the task where both pages stop doing their own aggregation inline and delegate to `CijfersInhoud` — confirm no leftover unused imports (`berekenMaandVergelijkingen`, `berekenWowCijfer`, `vroegsteSamenwerkingGestart`, `WowCijfer`, `OmzetDashboard`, `ResultatenGrafiek` should no longer be imported directly in either page file).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx" "src/app/[locale]/dashboard/cijfers/page.tsx"
git commit -m "feat: Cijferspagina's (admin + klant) gebruiken CijfersInhoud met woning-filter"
```

---

### Task 5: Full verification and push

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --fileParallelism=false`
Expected: all tests pass, including the 2 new tests from Task 1. `--fileParallelism=false` serializes test files — this local Supabase/Docker setup has shown connection-contention flakiness under full parallel runs in past sessions; serializing is more reliable for a full-suite check.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors. Two pre-existing, unrelated issues are expected and fine: `src/app/auth/confirm/page.tsx` (`no-html-link-for-pages`) and the gitignored `supabase/.temp/` directory (generated file, not part of this change).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully, zero errors (already confirmed in Task 4, re-confirm here as the final gate).

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`). Using a test client with 2+ listings, on both `/admin/klanten/[id]/cijfers` and `/dashboard/cijfers`:
- Confirm the "Woning" dropdown appears with "Alle woningen" + each listing by name, and stays hidden for a single-listing client (verify that too, to confirm the common case didn't regress).
- Switch to one specific woning: confirm WowCijfer's hero number and "sinds ..." caption change to reflect just that listing, ResultatenGrafiek's bars update, and OmzetDashboard's KPI cards/channel breakdown/trend table update — all without a visible loading flicker on OmzetDashboard (no new fetch should fire).
- Confirm the "Accommodaties vergelijken" table disappears when a specific woning is selected and reappears when switching back to "Alle woningen".
- Switch periods (Deze maand / Vorige maand / Dit jaar / Eigen periode) while a specific woning is selected — confirm the woning filter stays selected and the numbers shown remain scoped to that woning after the new period's data loads.
- Toggle STLY vs. Nulmeting comparison while a woning is selected — confirm the comparison badge values change accordingly, using that woning's own STLY/nulmeting figures.

- [ ] **Step 5: Push**

```bash
git push origin main
```

No manual production-database migration is needed for this plan (no schema changes) — nothing further to hand off after this push.
