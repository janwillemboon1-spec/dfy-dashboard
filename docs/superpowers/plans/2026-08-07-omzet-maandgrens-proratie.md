# Maandgrens-proratie voor omzetberekening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boekingen die een periodegrens (kalendermaand of eigen periode) overschrijden naar rato van nachten prorateren over de betrokken periodes, i.p.v. volledig toe te rekenen aan de incheckmaand.

**Architecture:** Eén nieuwe pure functie (`overlapNachten`) berekent de intervaloverlap tussen een reservering en een periode; `aggregeer()` krijgt periodegrenzen als parameter en gebruikt die overlap om omzet/nachten/kanalen naar rato te berekenen. Alle aanroepers (klantdashboard-API, trendgrafiek, admin-nulmetingberekening) gaan van een `check_in`-gefilterde query naar een overlap-gefilterde query, en roepen `aggregeer()` aan met de juiste periodegrenzen.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, Supabase (Postgres/PostgREST).

**Referentie-spec:** `docs/superpowers/specs/2026-08-07-omzet-maandgrens-proratie-design.md`

---

### Task 1: `overlapNachten` + geprorateerde `aggregeer()` in `omzet-aggregatie.ts`

**Files:**
- Modify: `src/lib/dashboard/omzet-aggregatie.ts`
- Test: `tests/unit/omzet-aggregatie.test.ts`

- [ ] **Step 1: Vervang de bestaande test-cases voor `aggregeer` door de nieuwe signatuur + proratie-cases**

Vervang de volledige inhoud van `tests/unit/omzet-aggregatie.test.ts` door:

```ts
import { describe, it, expect } from 'vitest';
import { aggregeer, dagenInPeriode, groepeerPerListing, type CacheReservering } from '@/lib/dashboard/omzet-aggregatie';

function reservering(overrides: Partial<CacheReservering> = {}): CacheReservering {
  return {
    listing_id: 'listing-1',
    check_in: '2025-07-10',
    check_out: '2025-07-12',
    rental_revenue: 200,
    total_cost: 260,
    no_of_days: 2,
    booking_status: 'booked',
    booking_channel: 'airbnb',
    ...overrides,
  };
}

describe('aggregeer', () => {
  it('telt omzet, nachten en kanalen op voor geboekte reserveringen die volledig binnen de periode vallen', () => {
    const result = aggregeer(
      [
        reservering({ check_in: '2025-07-01', check_out: '2025-07-03', rental_revenue: 200, no_of_days: 2, booking_channel: 'airbnb' }),
        reservering({ check_in: '2025-07-05', check_out: '2025-07-06', rental_revenue: 150, no_of_days: 1, booking_channel: 'bcom' }),
      ],
      '2025-07-01',
      '2025-08-01',
      10
    );
    expect(result.omzet).toBe(350);
    expect(result.nachten).toBe(3);
    expect(result.adr).toBeCloseTo(350 / 3, 5);
    expect(result.bezetting).toBeCloseTo(30, 5); // 3 nachten / 10 dagen * 100
    expect(result.revpar).toBe(35); // 350 / 10
    expect(result.kanalen).toEqual({
      airbnb: { omzet: 200, boekingen: 1 },
      bcom: { omzet: 150, boekingen: 1 },
    });
  });

  it('negeert geannuleerde reserveringen volledig', () => {
    const result = aggregeer(
      [reservering({ booking_status: 'cancelled', rental_revenue: 500, check_in: '2025-07-01', check_out: '2025-07-03' })],
      '2025-07-01',
      '2025-08-01',
      10
    );
    expect(result.omzet).toBe(0);
    expect(result.nachten).toBe(0);
    expect(result.kanalen).toEqual({});
  });

  it('groepeert alle airbnb-varianten onder één kanaalsleutel', () => {
    const result = aggregeer(
      [
        reservering({ booking_channel: 'Airbnb', check_in: '2025-07-01', check_out: '2025-07-03' }),
        reservering({ booking_channel: 'airbnb_official', check_in: '2025-07-05', check_out: '2025-07-07' }),
      ],
      '2025-07-01',
      '2025-08-01',
      10
    );
    expect(Object.keys(result.kanalen)).toEqual(['airbnb']);
    expect(result.kanalen.airbnb.boekingen).toBe(2);
  });

  it('geeft 0 terug voor adr/bezetting/revpar bij geen boekingen', () => {
    const result = aggregeer([], '2025-07-01', '2025-08-01', 10);
    expect(result).toEqual({ omzet: 0, omzetIncl: 0, adr: 0, nachten: 0, bezetting: 0, revpar: 0, kanalen: {} });
  });

  it('telt een reservering die volledig vóór de periode ligt niet mee', () => {
    const result = aggregeer(
      [reservering({ check_in: '2025-06-01', check_out: '2025-06-05', rental_revenue: 400, no_of_days: 4 })],
      '2025-07-01',
      '2025-08-01',
      10
    );
    expect(result.omzet).toBe(0);
    expect(result.nachten).toBe(0);
  });

  it('prorateert een reservering die de linkergrens van de periode overschrijdt', () => {
    // check_in 28 juni, check_out 3 juli: 5 nachten totaal, waarvan 2 (1 en 2 juli) in juli vallen.
    const result = aggregeer(
      [reservering({ check_in: '2025-06-28', check_out: '2025-07-03', rental_revenue: 500, total_cost: 550, no_of_days: 5, booking_channel: 'bcom' })],
      '2025-07-01',
      '2025-08-01',
      31
    );
    expect(result.nachten).toBe(2);
    expect(result.omzet).toBe(200); // 2/5 * 500
    expect(result.omzetIncl).toBe(220); // 2/5 * 550
    expect(result.kanalen.bcom.omzet).toBe(200);
  });

  it('prorateert een reservering die de rechtergrens van de periode overschrijdt (chalet 7-scenario)', () => {
    // check_in 25 juli, check_out 4 augustus: 10 nachten totaal, waarvan 7 (25-31 juli) in juli vallen.
    const result = aggregeer(
      [reservering({ check_in: '2025-07-25', check_out: '2025-08-04', rental_revenue: 805.5, total_cost: null, no_of_days: 10, booking_channel: 'airbnb' })],
      '2025-07-01',
      '2025-08-01',
      31
    );
    expect(result.nachten).toBe(7);
    expect(result.omzet).toBeCloseTo(563.85, 5); // 7/10 * 805.50
    expect(result.omzetIncl).toBe(0);
  });

  it('telt een reservering die de hele periode overspant volledig mee, geclipt aan de periodegrenzen', () => {
    // check_in 15 juni, check_out 15 augustus: periode is precies juli (31 dagen).
    const result = aggregeer(
      [reservering({ check_in: '2025-06-15', check_out: '2025-08-15', rental_revenue: 6200, no_of_days: 61 })],
      '2025-07-01',
      '2025-08-01',
      31
    );
    expect(result.nachten).toBe(31);
    expect(result.omzet).toBeCloseTo((31 / 61) * 6200, 5);
  });

  it('telt geen nacht wanneer check_out exact op periodeStart valt', () => {
    const result = aggregeer(
      [reservering({ check_in: '2025-06-29', check_out: '2025-07-01', rental_revenue: 200, no_of_days: 2 })],
      '2025-07-01',
      '2025-08-01',
      31
    );
    expect(result.nachten).toBe(0);
    expect(result.omzet).toBe(0);
  });
});

describe('dagenInPeriode', () => {
  it('telt het aantal dagen tussen twee datums inclusief', () => {
    expect(dagenInPeriode('2025-07-01', '2025-07-31')).toBe(31);
  });

  it('geeft minstens 1 terug voor een periode van één dag', () => {
    expect(dagenInPeriode('2025-07-01', '2025-07-01')).toBe(1);
  });
});

describe('groepeerPerListing', () => {
  it('groepeert rijen op listing_id', () => {
    const result = groepeerPerListing([
      reservering({ listing_id: 'a' }),
      reservering({ listing_id: 'a' }),
      reservering({ listing_id: 'b' }),
    ]);
    expect(result.a).toHaveLength(2);
    expect(result.b).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run de tests om te bevestigen dat ze falen op de oude signatuur**

Run: `npm test -- tests/unit/omzet-aggregatie.test.ts`
Expected: FAIL — `aggregeer` accepteert nu nog maar 2 argumenten, en `groepeerPerMaand` bestaat nog wel maar wordt niet meer geïmporteerd (dus geen importfout daarvoor); de fouten komen van verkeerde resultaten/type-mismatches op de `aggregeer`-aanroepen met 4 argumenten.

- [ ] **Step 3: Herschrijf `omzet-aggregatie.ts`**

Vervang de volledige inhoud van `src/lib/dashboard/omzet-aggregatie.ts` door:

```ts
export interface CacheReservering {
  listing_id: string;
  check_in: string;
  check_out: string;
  rental_revenue: number;
  total_cost: number | null;
  no_of_days: number;
  booking_status: string;
  booking_channel: string | null;
}

export interface OmzetMetrics {
  omzet: number;
  omzetIncl: number;
  adr: number;
  nachten: number;
  bezetting: number;
  revpar: number;
  kanalen: Record<string, { omzet: number; boekingen: number }>;
}

// Intervaloverlap in hele nachten tussen een reservering en [periodeStart, periodeEind).
// periodeEind is exclusief, net als check_out — een reservering met check_out gelijk aan
// periodeStart draagt dus 0 nachten bij, consistent met hoe periodes elders aaneensluiten
// (bv. de trendgrafiek: juli eindigt om 2025-08-01, augustus begint daar).
function overlapNachten(reservering: { check_in: string; check_out: string }, periodeStart: string, periodeEind: string): number {
  const checkIn = new Date(`${reservering.check_in}T00:00:00Z`).getTime();
  const checkOut = new Date(`${reservering.check_out}T00:00:00Z`).getTime();
  const start = new Date(`${periodeStart}T00:00:00Z`).getTime();
  const eind = new Date(`${periodeEind}T00:00:00Z`).getTime();
  const overlapStart = Math.max(checkIn, start);
  const overlapEind = Math.min(checkOut, eind);
  return Math.max(0, Math.round((overlapEind - overlapStart) / 86_400_000));
}

// periodeStart/periodeEind bepalen welk deel van elke reservering meetelt: een reservering
// die de grens overschrijdt (check_in vóór periodeStart, of check_out ná periodeEind) draagt
// alleen zijn overlappende nachten en het daarmee evenredige deel van de omzet bij. Dit
// geldt ook voor de kanalen-uitsplitsing, zodat de som van de kanalen altijd optelt tot het
// totaal hierboven. periodeEind is exclusief.
export function aggregeer(reserveringen: CacheReservering[], periodeStart: string, periodeEind: string, totaleDagen: number): OmzetMetrics {
  const geboekt = reserveringen.filter((r) => r.booking_status === 'booked');

  let omzet = 0;
  let omzetIncl = 0;
  let nachten = 0;
  const kanalen: Record<string, { omzet: number; boekingen: number }> = {};

  for (const r of geboekt) {
    const overlap = overlapNachten(r, periodeStart, periodeEind);
    if (overlap === 0) continue;

    const aandeel = r.no_of_days > 0 ? overlap / r.no_of_days : 0;
    const omzetAandeel = r.rental_revenue * aandeel;
    const omzetInclAandeel = (r.total_cost ?? 0) * aandeel;

    omzet += omzetAandeel;
    omzetIncl += omzetInclAandeel;
    nachten += overlap;

    const ruw = (r.booking_channel || 'overig').toLowerCase();
    const kanaal = ruw.includes('airbnb') ? 'airbnb' : ruw;
    if (!kanalen[kanaal]) kanalen[kanaal] = { omzet: 0, boekingen: 0 };
    kanalen[kanaal].omzet += omzetAandeel;
    kanalen[kanaal].boekingen += 1;
  }

  const adr = nachten > 0 ? omzet / nachten : 0;
  const bezetting = totaleDagen > 0 ? (nachten / totaleDagen) * 100 : 0;
  const revpar = totaleDagen > 0 ? omzet / totaleDagen : 0;

  return { omzet, omzetIncl, adr, nachten, bezetting, revpar, kanalen };
}

export function dagenInPeriode(start: string, eind: string): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${eind}T00:00:00Z`);
  // Inclusief beide grenzen (1 juli t/m 31 juli = 31 dagen, niet 30): dit moet dezelfde
  // kalenderdagen-basis zijn als dagenInMaand() in nulmeting-metrics.ts, anders wordt een
  // bezetting op basis van deze functie stelselmatig tegen een andere noemer vergeleken
  // dan de nulmeting-bezetting waarmee hij wordt afgezet.
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

export function groepeerPerListing<T extends { listing_id: string }>(rijen: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of rijen) {
    (map[r.listing_id] ??= []).push(r);
  }
  return map;
}
```

Let op: `groepeerPerMaand` is volledig verwijderd (vervangen door herhaald aanroepen van `aggregeer` met maandgrenzen, zie Taak 2 en 3).

- [ ] **Step 4: Run de tests om te bevestigen dat ze slagen**

Run: `npm test -- tests/unit/omzet-aggregatie.test.ts`
Expected: PASS (alle 12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/omzet-aggregatie.ts tests/unit/omzet-aggregatie.test.ts
git commit -m "fix: prorateer omzet/nachten over periodegrenzen in aggregeer()"
```

---

### Task 2: Klantdashboard-API — overlap-query en geprorateerde trend

**Files:**
- Modify: `src/app/api/dashboard/omzet/route.ts`

- [ ] **Step 1: Pas de queries aan van check_in-filter naar overlap-filter**

In `src/app/api/dashboard/omzet/route.ts`, vervang (regels 74-83):

```ts
    supabase
      .from('pricelabs_reserveringen_cache')
      .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
      .gte('check_in', start)
      .lte('check_in', eind),
    supabase
      .from('pricelabs_reserveringen_cache')
      .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
      .gte('check_in', stlyStart)
      .lte('check_in', stlyEind),
```

door:

```ts
    supabase
      .from('pricelabs_reserveringen_cache')
      .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
      .lte('check_in', eind)
      .gt('check_out', start),
    supabase
      .from('pricelabs_reserveringen_cache')
      .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
      .lte('check_in', stlyEind)
      .gt('check_out', stlyStart),
```

- [ ] **Step 2: Pas de import aan**

Vervang (regel 3):

```ts
import { aggregeer, dagenInPeriode, groepeerPerMaand, groepeerPerListing } from '@/lib/dashboard/omzet-aggregatie';
```

door:

```ts
import { aggregeer, dagenInPeriode, groepeerPerListing } from '@/lib/dashboard/omzet-aggregatie';
```

- [ ] **Step 3: Geef `aggregeer()` de periodegrenzen mee bij portfolio en per-listing**

Vervang (regels 98-99):

```ts
  const portfolio = aggregeer(huidigeRijen ?? [], dagen * aantalListings);
  const portfolioStly = aggregeer(stlyRijen ?? [], stlyDagen * aantalListings);
```

door:

```ts
  const portfolio = aggregeer(huidigeRijen ?? [], start, eind, dagen * aantalListings);
  const portfolioStly = aggregeer(stlyRijen ?? [], stlyStart, stlyEind, stlyDagen * aantalListings);
```

Let op: `dagenInPeriode` (en dus `dagen`/`stlyDagen`) blijft ongewijzigd inclusief-tellend (`eind` is de laatste kalenderdag, niet exclusief) — dat is een aparte conventie dan de nieuwe `periodeEind`-parameter van `aggregeer` (exclusief). Dit is geen inconsistentie in het gedrag: `aggregeer` gebruikt `eind` alleen als exclusieve bovengrens voor de overlapberekening, terwijl `dagenInPeriode` society het aantal kalenderdagen in de periode telt voor de bezettingsnoemer. Geef daarom bij de aanroep van `aggregeer` de string `eind` zelf door (niet "eind + 1 dag"): omdat `check_out`/reserveringsdata altijd op dagniveau is en `eind` als YYYY-MM-DD-datum wordt geïnterpreteerd als `T00:00:00Z`, zou een boeking die op `eind` zelf inchecken en own diezelfde dag níet meetellen. Corrigeer dit door bij het doorgeven aan `aggregeer` de exclusieve grens te berekenen: vervang bovenstaande door:

```ts
  const eindExclusief = new Date(`${eind}T00:00:00Z`);
  eindExclusief.setUTCDate(eindExclusief.getUTCDate() + 1);
  const eindExclusiefStr = eindExclusief.toISOString().slice(0, 10);
  const stlyEindExclusief = new Date(`${stlyEind}T00:00:00Z`);
  stlyEindExclusief.setUTCDate(stlyEindExclusief.getUTCDate() + 1);
  const stlyEindExclusiefStr = stlyEindExclusief.toISOString().slice(0, 10);

  const portfolio = aggregeer(huidigeRijen ?? [], start, eindExclusiefStr, dagen * aantalListings);
  const portfolioStly = aggregeer(stlyRijen ?? [], stlyStart, stlyEindExclusiefStr, stlyDagen * aantalListings);
```

- [ ] **Step 4: Zelfde correctie voor de per-listing aggregatie**

Vervang (regel 106-107):

```ts
    const metrics = aggregeer(perListingHuidig[l.id] ?? [], dagen);
    const stlyMetrics = aggregeer(perListingStly[l.id] ?? [], stlyDagen);
```

door:

```ts
    const metrics = aggregeer(perListingHuidig[l.id] ?? [], start, eindExclusiefStr, dagen);
    const stlyMetrics = aggregeer(perListingStly[l.id] ?? [], stlyStart, stlyEindExclusiefStr, stlyDagen);
```

- [ ] **Step 5: Vervang de trend-berekening (geen `groepeerPerMaand` meer)**

Vervang (regels 126-142):

```ts
  const huidigPerMaand = groepeerPerMaand(huidigeRijen ?? []);
  const stlyPerMaand = groepeerPerMaand(stlyRijen ?? []);

  const trend = trendMaanden.map((maand) => {
    const stlyMaand = shiftJaar(`${maand}-01`, -1).slice(0, 7);
    const [, maandNummerStr] = maand.split('-');
    const maandNummer = Number(maandNummerStr);
    const omzetNulmeting = periodeType === 'vast'
      ? alleNulmeting.filter((r) => r.maand === maandNummer).reduce((s, r) => s + r.omzet, 0)
      : null;
    return {
      maand,
      omzet: aggregeer(huidigPerMaand[maand] ?? [], 30).omzet,
      omzetStly: aggregeer(stlyPerMaand[stlyMaand] ?? [], 30).omzet,
      omzetNulmeting,
    };
  });
```

door:

```ts
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

  const trend = trendMaanden.map((maand) => {
    const stlyMaand = shiftJaar(`${maand}-01`, -1).slice(0, 7);
    const [, maandNummerStr] = maand.split('-');
    const maandNummer = Number(maandNummerStr);
    const omzetNulmeting = periodeType === 'vast'
      ? alleNulmeting.filter((r) => r.maand === maandNummer).reduce((s, r) => s + r.omzet, 0)
      : null;
    const { start: maandStart, eind: maandEind } = maandGrenzen(maand);
    const { start: stlyMaandStart, eind: stlyMaandEind } = maandGrenzen(stlyMaand);
    return {
      maand,
      omzet: aggregeer(huidigeRijen ?? [], maandStart, maandEind, 30).omzet,
      omzetStly: aggregeer(stlyRijen ?? [], stlyMaandStart, stlyMaandEind, 30).omzet,
      omzetNulmeting,
    };
  });
```

Let op: de trend hergebruikt hier bewust `huidigeRijen`/`stlyRijen` (de volledige, al overlap-gefetchte sets) i.p.v. vooraf per maand gebucket'e subsets — `aggregeer()` filtert zelf al op overlap met `[maandStart, maandEind)`, dus reserveringen buiten die maand dragen vanzelf 0 nachten bij.

- [ ] **Step 6: Handmatig testen tegen de dev-server**

Run: `npm run dev` (in een aparte terminal), log in als de klant van chalet 7, open het omzetdashboard voor juli 2026.
Expected: omzet ≈ €2356,65 en nachten ≈ 29 voor chalet 7 (in plaats van €2598,30/32). Sluit de dev-server af (Ctrl+C) na verificatie.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/dashboard/omzet/route.ts
git commit -m "fix: prorateer klantdashboard-omzet (portfolio, per listing, trend) over periodegrenzen"
```

---

### Task 3: Admin-nulmetingberekening — overlap-query en per-maand proratie

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/bereken-nulmeting-uit-pricelabs.test.ts`

- [ ] **Step 1: Pas de import aan**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, vervang (regel 9):

```ts
import { aggregeer, groepeerPerMaand } from '@/lib/dashboard/omzet-aggregatie';
```

door:

```ts
import { aggregeer } from '@/lib/dashboard/omzet-aggregatie';
```

- [ ] **Step 2: Pas de query en de per-bronmaand-berekening aan**

Vervang (regels 249-262):

```ts
  const { data: cacheRijen, error: cacheError } = await supabase
    .from('pricelabs_reserveringen_cache')
    .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
    .eq('listing_id', input.listingId)
    .gte('check_in', `${startJaar - 1}-01-01`)
    .lte('check_in', `${startJaar}-12-31`);
  if (cacheError) throw new Error(cacheError.message);

  const perMaand = groepeerPerMaand(cacheRijen ?? []);

  const maanden: NulmetingMaandResultaat[] = bronnen.map((bron) => {
    const sleutel = `${bron.bronJaar}-${String(bron.bronMaand).padStart(2, '0')}`;
    const rijen = perMaand[sleutel] ?? [];
    const metrics = aggregeer(rijen, dagenInMaand(bron.bronJaar, bron.bronMaand));
    return {
      maand: bron.maand,
```

door:

```ts
  const { data: cacheRijen, error: cacheError } = await supabase
    .from('pricelabs_reserveringen_cache')
    .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
    .eq('listing_id', input.listingId)
    .lte('check_in', `${startJaar}-12-31`)
    .gt('check_out', `${startJaar - 1}-01-01`);
  if (cacheError) throw new Error(cacheError.message);

  const maanden: NulmetingMaandResultaat[] = bronnen.map((bron) => {
    const { jaar: volgJaar, maand: volgMaand } = volgendeMaand(bron.bronJaar, bron.bronMaand);
    const maandStart = `${bron.bronJaar}-${String(bron.bronMaand).padStart(2, '0')}-01`;
    const maandEind = `${volgJaar}-${String(volgMaand).padStart(2, '0')}-01`;
    const rijen = (cacheRijen ?? []).filter((r) => r.check_in <= maandEind && r.check_out > maandStart);
    const metrics = aggregeer(rijen, maandStart, maandEind, dagenInMaand(bron.bronJaar, bron.bronMaand));
    const leeg = rijen.length === 0;
    return {
      maand: bron.maand,
```

Verderop in dezelfde `.map()` (rond regel 282) staat nog een aparte regel die `rijen.length === 0` gebruikt voor het `leeg`-veld. Vervang:

```ts
      leeg: rijen.length === 0,
```

door:

```ts
      leeg,
```

(`leeg` is de variabele die in Step 2 hierboven al is berekend als `rijen.length === 0`, met de nieuwe, overlap-gefilterde `rijen` — puur een naamgevingsconsistentie, geen gedragswijziging.)

- [ ] **Step 3: Voeg een regressietest toe voor een grensoverschrijdende bronmaand**

In `tests/integration/bereken-nulmeting-uit-pricelabs.test.ts`, voeg vóór de afsluitende `});` van het bestand (na de `'ruimt een oude, ...'`-test, dus als laatste test in de `describe`-block) toe:

```ts

  it('prorateert een reservering die twee bronmaanden overschrijdt', async () => {
    // Regressietest voor de maandgrens-proratie-fix: een boeking die start in december
    // (STLY-bron voor doelmaand 12, want > startmaand maart) en doorloopt tot in januari
    // (echt-bron voor doelmaand 1) moet zijn nachten/omzet naar rato over beide bronmaanden
    // verdelen i.p.v. volledig aan december (de incheckmaand) toegekend te worden.
    const suffix = `${Date.now()}-maandgrens`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Maandgrens Nulmeting Klant', email: `nulmeting-maandgrens-${suffix}@test.local` })
      .select()
      .single();
    const maandgrensClientId = client!.id;

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: maandgrensClientId, naam: 'Maandgrens Listing', pricelabs_listing_id: `pl-${suffix}` })
      .select()
      .single();
    const maandgrensListingId = listing!.id;

    await admin
      .from('pricelabs_listings_cache')
      .insert({ pricelabs_listing_id: `pl-${suffix}`, naam: 'PL Listing', pms: 'hostaway' });

    const { data: adminUserRes } = await admin.auth.admin.createUser({
      email: `nulmeting-maandgrens-admin-${suffix}@test.local`,
      email_confirm: true,
      password: wachtwoord,
    });
    const maandgrensAdminUserId = adminUserRes!.user!.id;
    await admin.from('profiles').insert({
      id: maandgrensAdminUserId,
      role: 'admin',
      email: `nulmeting-maandgrens-admin-${suffix}@test.local`,
      naam: 'Admin',
    });

    try {
      activeCookieStore = await loginAlsCookieStore(`nulmeting-maandgrens-admin-${suffix}@test.local`, wachtwoord);

      // 2025-12-25 t/m 2026-01-05: 11 nachten totaal, waarvan 7 in december 2025
      // (25 t/m 31) en 4 in januari 2026 (1 t/m 4), à €100/nacht (rental_revenue 1100).
      vi.mocked(fetchReservationData).mockResolvedValueOnce([
        {
          reservation_id: `nulmeting-maandgrens-${maandgrensListingId}`,
          check_in: '2025-12-25',
          check_out: '2026-01-05',
          rental_revenue: '1100',
          total_cost: null,
          no_of_days: 11,
          booking_status: 'booked',
          booking_channel: null,
        },
      ]);

      const resultaat = await berekenNulmetingUitPricelabs({
        listingId: maandgrensListingId,
        clientId: maandgrensClientId,
        samenwerkingGestart: '2026-03-15',
      });

      const december = resultaat.maanden.find((m) => m.maand === 12)!;
      expect(december.bron).toBe('stly'); // > startmaand maart, dus STLY-bron (2025-12)
      expect(december.omzet).toBeCloseTo(700, 5); // 7/11 * 1100
      expect(december.leeg).toBe(false);

      const januari = resultaat.maanden.find((m) => m.maand === 1)!;
      expect(januari.bron).toBe('echt'); // <= startmaand maart, dus echt-bron (2026-01)
      expect(januari.omzet).toBeCloseTo(400, 5); // 4/11 * 1100
      expect(januari.leeg).toBe(false);
    } finally {
      await admin.from('clients').delete().eq('id', maandgrensClientId);
      await admin.auth.admin.deleteUser(maandgrensAdminUserId);
      await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', `pl-${suffix}`);
    }
  });
```

- [ ] **Step 4: Run de integratietest**

Run: `npm test -- tests/integration/bereken-nulmeting-uit-pricelabs.test.ts`
Expected: PASS (alle 4 tests, inclusief de nieuwe)

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/bereken-nulmeting-uit-pricelabs.test.ts
git commit -m "fix: prorateer nulmeting-berekening uit PriceLabs over bronmaandgrenzen"
```

---

### Task 4: Volledige testsuite + deploy

**Files:** geen wijzigingen — verificatie- en deploystap.

- [ ] **Step 1: Run de volledige testsuite**

Run: `npm test`
Expected: alle tests slagen (geen regressies in andere bestanden die `aggregeer`/`dagenInPeriode`/`groepeerPerListing` indirect raken).

- [ ] **Step 2: Lint en build**

Run: `npm run lint && npm run build`
Expected: geen lint-errors, build slaagt zonder type-errors (de gewijzigde `aggregeer`-signatuur moet overal consistent zijn doorgevoerd — een gemiste aanroep met de oude 2-argumenten-vorm zou hier als TypeScript-fout naar boven komen).

- [ ] **Step 3: Push naar main (triggert Railway-deploy)**

```bash
git push origin main
```

Expected: push slaagt; Railway pikt de nieuwe commit op main op en start een nieuwe deploy (gebaseerd op de GitHub-koppeling, geen aparte Railway-CLI-stap nodig in deze repo).
