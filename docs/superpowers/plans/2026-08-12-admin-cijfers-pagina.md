# Admin Cijfers-pagina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin Cijfers-pagina placeholder with real portfolio cijfers (Impactmeter, omzet-dashboard, resultatengrafiek) for a chosen klant, via a new admin-only, explicitly `client_id`-filtered API route.

**Architecture:** The existing `/api/dashboard/omzet` route is 403-blocked for admin sessions because its queries rely entirely on RLS (no explicit `client_id` filter) to scope data to the logged-in klant — unsafe for an admin session, whose RLS policies grant unrestricted access. A new, separate route `/api/admin/klanten/[id]/omzet` handles the admin case with explicit filtering. The ~150 lines of aggregation/trend logic shared by both routes is extracted into `src/lib/dashboard/omzet-voor-periode.ts` so it isn't duplicated. `OmzetDashboard` gets an optional `clientId` prop to switch which endpoint it calls and to hide the klant-only sync button.

**Tech Stack:** Next.js App Router route handlers, Supabase Postgres (RLS), Vitest integration tests against local Supabase.

**Reference:** Spec at `docs/superpowers/specs/2026-08-12-admin-cijfers-pagina-design.md`.

---

### Task 1: Extract shared omzet-computation helper

**Files:**
- Create: `src/lib/dashboard/omzet-voor-periode.ts`
- Modify: `src/app/api/dashboard/omzet/route.ts`

There is no existing test coverage for `/api/dashboard/omzet` (only the lower-level `aggregeer`/`dagenInPeriode`/`groepeerPerListing` functions it calls have unit tests, in `tests/unit/omzet-aggregatie.test.ts` — those are untouched by this task and remain valid). This task is a mechanical extraction: the safety net is careful line-by-line fidelity to the original code, plus the build.

- [ ] **Step 1: Create the shared helper module**

Create `src/lib/dashboard/omzet-voor-periode.ts`:

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

export interface OmzetData {
  periode: { start: string; eind: string; stlyStart: string; stlyEind: string };
  periodeType: 'vast' | 'eigen';
  portfolio: OmzetMetrics;
  portfolioStly: OmzetMetrics;
  portfolioNulmeting: OmzetMetrics | null;
  listings: Array<OmzetMetrics & { listing_id: string; listing_naam: string; stly: OmzetMetrics; nulmeting: OmzetMetrics | null }>;
  trend: Array<{ maand: string; omzet: number; omzetStly: number; omzetNulmeting: number | null }>;
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

  const listingsUitkomst = listings.map((l) => {
    const metrics = aggregeer(perListingHuidig[l.id] ?? [], start, eindExclusief, dagen);
    const stlyMetrics = aggregeer(perListingStly[l.id] ?? [], stlyStart, stlyEindExclusief, stlyDagen);
    const nulmetingMetrics = periodeType === 'vast' ? nulmetingAlsMetrics(l.nulmeting ?? [], start, eind) : null;
    return {
      listing_id: l.id,
      listing_naam: l.naam,
      ...metrics,
      stly: stlyMetrics,
      nulmeting: nulmetingMetrics,
    };
  }).sort((a, b) => b.omzet - a.omzet);

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

  // Hergebruikt de al overlap-gefetchte huidigeRijen/stlyRijen (i.p.v. per maand vooraf te
  // bucketen): aggregeer() filtert zelf al op overlap met [maandStart, maandEind), dus een
  // reservering die een maandgrens overschrijdt telt vanzelf naar rato mee in beide maanden.
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
      omzet: aggregeer(huidigeRijen, maandStart, maandEind, 30).omzet,
      omzetStly: aggregeer(stlyRijen, stlyMaandStart, stlyMaandEind, 30).omzet,
      omzetNulmeting,
    };
  });

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

This is a line-by-line move of `src/app/api/dashboard/omzet/route.ts`'s existing logic (currently lines 6-8, 12-22, and 65-177 in that file), with route-local variables (`start`, `eind`, `periodeType`, `listings`, `huidigeRijen`, `stlyRijen`) turned into function parameters, and the two route-specific concerns (query-param validation, and building the final `NextResponse.json(...)`) left out — those stay in the route.

- [ ] **Step 2: Refactor the klant route to use the helper**

Replace the full contents of `src/app/api/dashboard/omzet/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { berekenOmzetVoorPeriode, shiftJaar, waarschuwBijMogelijkeAfkapping } from '@/lib/dashboard/omzet-voor-periode';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

// Geen expliciet client_id-filter nodig op onderstaande queries: de RLS-policies
// ("klant leest eigen listings/reserveringen") scopen dit al af tot precies de data
// van de ingelogde klant, zelfde patroon als src/app/[locale]/dashboard/page.tsx. Dat
// patroon werkt alléén omdat admin-sessies hieronder expliciet geweigerd worden — voor
// role=admin laten de "admin volledige toegang ..."-policies namelijk juist alles
// ongefilterd door (zie de admin-redirect + toelichting in dashboard/page.tsx voor de
// achtergrond van precies dit risico). De admin-variant van dit endpoint zit apart in
// src/app/api/admin/klanten/[id]/omzet/route.ts, met een expliciet client_id-filter.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (profile?.role === 'admin') {
    return NextResponse.json({ error: 'Dit endpoint is alleen voor klant-sessies.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const eind = url.searchParams.get('eind');
  const periodeType = url.searchParams.get('periodeType') === 'vast' ? 'vast' : 'eigen';

  if (!start || !eind) {
    return NextResponse.json({ error: 'start en eind zijn verplicht.' }, { status: 400 });
  }
  if (!ISO_DATUM.test(start) || !ISO_DATUM.test(eind)) {
    return NextResponse.json({ error: 'start en eind moeten het formaat JJJJ-MM-DD hebben.' }, { status: 400 });
  }
  if (start > eind) {
    return NextResponse.json({ error: 'start mag niet na eind liggen.' }, { status: 400 });
  }

  const stlyStart = shiftJaar(start, -1);
  const stlyEind = shiftJaar(eind, -1);

  const [
    { data: listings, error: listingsError },
    { data: huidigeRijen, error: huidigeError },
    { data: stlyRijen, error: stlyError },
  ] = await Promise.all([
    supabase.from('listings').select('id, naam, nulmeting(jaar, maand, omzet, bezetting)'),
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
  ]);
  if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });
  if (huidigeError) return NextResponse.json({ error: huidigeError.message }, { status: 500 });
  if (stlyError) return NextResponse.json({ error: stlyError.message }, { status: 500 });

  waarschuwBijMogelijkeAfkapping('huidige periode', huidigeRijen);
  waarschuwBijMogelijkeAfkapping('STLY-periode', stlyRijen);

  const data = berekenOmzetVoorPeriode({
    listings: listings ?? [],
    huidigeRijen: huidigeRijen ?? [],
    stlyRijen: stlyRijen ?? [],
    start,
    eind,
    periodeType,
  });

  return NextResponse.json(data);
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds successfully, no TypeScript errors.

- [ ] **Step 4: Self-review — verify behavior preservation**

Open the original route from git history (`git show HEAD:src/app/api/dashboard/omzet/route.ts`) side by side with the new `omzet-voor-periode.ts` + refactored route. Confirm every computation (STLY shift, `dagenInPeriode` calls, `exclusieveGrens`, the `aggregeer` calls with their exact arguments, `nulmetingAlsMetrics` calls, the trend-months loop, `maandGrenzen`) is present with identical logic — only parameter passing and file boundaries should differ. This is the primary safety net for this task since no automated test covers this route.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/omzet-voor-periode.ts "src/app/api/dashboard/omzet/route.ts"
git commit -m "refactor: verplaats omzet-rekenlogica naar gedeelde helper"
```

---

### Task 2: New admin-only omzet API route

**Files:**
- Create: `src/app/api/admin/klanten/[id]/omzet/route.ts`
- Test: `tests/integration/admin-omzet-route.test.ts` (new)

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/admin-omzet-route.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

const { GET } = await import('@/app/api/admin/klanten/[id]/omzet/route');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createRawClient(url, serviceKey);

const wachtwoord = 'test-wachtwoord-1234';

async function loginAlsCookieStore(email: string, password: string) {
  const store = new Map<string, string>();
  const browserClient = createBrowserClient(url, anonKey, {
    cookies: {
      getAll: () => Array.from(store.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet: { name: string; value: string }[]) => {
        cookiesToSet.forEach(({ name, value }) => store.set(name, value));
      },
    },
  });
  const { error } = await browserClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return store;
}

// GET() gebruikt van het request-object alleen request.url — een echte NextRequest
// instantiëren zou hier alleen onnodige complexiteit toevoegen; een minimaal object met
// enkel .url volstaat en is type-veilig via een cast.
function verzoek(clientId: string, query: string) {
  const request = { url: `http://localhost/api/admin/klanten/${clientId}/omzet${query}` } as NextRequest;
  return GET(request, { params: Promise.resolve({ id: clientId }) });
}

let clientAId: string;
let klantAEmail: string;
let klantAUserId: string;

let clientBId: string;

let adminEmail: string;
let adminUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: clientA } = await admin
    .from('clients')
    .insert({ naam: 'Omzetroute Klant A', email: `omzetroute-a-${suffix}@test.local` })
    .select()
    .single();
  clientAId = clientA!.id;
  const { data: listingA } = await admin
    .from('listings')
    .insert({ client_id: clientAId, naam: 'Listing A' })
    .select()
    .single();
  await admin.from('pricelabs_reserveringen_cache').insert({
    listing_id: listingA!.id,
    reservation_id: `res-a-${suffix}`,
    check_in: '2026-01-01',
    check_out: '2026-01-04',
    rental_revenue: 300,
    no_of_days: 3,
    booking_status: 'booked',
  });

  const { data: clientB } = await admin
    .from('clients')
    .insert({ naam: 'Omzetroute Klant B', email: `omzetroute-b-${suffix}@test.local` })
    .select()
    .single();
  clientBId = clientB!.id;
  const { data: listingB } = await admin
    .from('listings')
    .insert({ client_id: clientBId, naam: 'Listing B' })
    .select()
    .single();
  await admin.from('pricelabs_reserveringen_cache').insert({
    listing_id: listingB!.id,
    reservation_id: `res-b-${suffix}`,
    check_in: '2026-01-01',
    check_out: '2026-01-04',
    rental_revenue: 900,
    no_of_days: 3,
    booking_status: 'booked',
  });

  klantAEmail = `omzetroute-klant-a-${suffix}@test.local`;
  const { data: klantAUserRes } = await admin.auth.admin.createUser({
    email: klantAEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantAUserId = klantAUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantAUserId, role: 'klant', client_id: clientAId, email: klantAEmail, naam: 'Klant A' });

  adminEmail = `omzetroute-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientAId);
  await admin.from('clients').delete().eq('id', clientBId);
  await admin.auth.admin.deleteUser(klantAUserId);
  await admin.auth.admin.deleteUser(adminUserId);
});

describe('GET /api/admin/klanten/[id]/omzet', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=2026-01-01&eind=2026-01-31&periodeType=eigen');
    expect(response.status).toBe(403);
  });

  it('weigert ontbrekende periode-params', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('start en eind zijn verplicht.');
  });

  it('weigert een ongeldig datumformaat', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=1-1-2026&eind=2026-01-31&periodeType=eigen');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('start en eind moeten het formaat JJJJ-MM-DD hebben.');
  });

  it('weigert start na eind', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=2026-02-01&eind=2026-01-01&periodeType=eigen');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('start mag niet na eind liggen.');
  });

  it('retourneert alleen omzetdata van de opgegeven client_id, geen lekkage van andere klanten', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=2026-01-01&eind=2026-01-31&periodeType=eigen');
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.portfolio.omzet).toBe(300);
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0].listing_naam).toBe('Listing A');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/admin-omzet-route.test.ts`
Expected: FAIL — the route module `@/app/api/admin/klanten/[id]/omzet/route` doesn't exist yet.

Note: this is the first test in this codebase that imports a Next.js route handler directly and calls it in Vitest's Node environment. If the failure is something other than "module not found" (e.g. an error about `next/server` internals), stop and report — that would mean the approach itself needs rethinking, not just the missing route file.

- [ ] **Step 3: Implement the admin route**

Create `src/app/api/admin/klanten/[id]/omzet/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';
import type { CacheReservering } from '@/lib/dashboard/omzet-aggregatie';
import { berekenOmzetVoorPeriode, shiftJaar, waarschuwBijMogelijkeAfkapping } from '@/lib/dashboard/omzet-voor-periode';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertIsAdmin();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const eind = url.searchParams.get('eind');
  const periodeType = url.searchParams.get('periodeType') === 'vast' ? 'vast' : 'eigen';

  if (!start || !eind) {
    return NextResponse.json({ error: 'start en eind zijn verplicht.' }, { status: 400 });
  }
  if (!ISO_DATUM.test(start) || !ISO_DATUM.test(eind)) {
    return NextResponse.json({ error: 'start en eind moeten het formaat JJJJ-MM-DD hebben.' }, { status: 400 });
  }
  if (start > eind) {
    return NextResponse.json({ error: 'start mag niet na eind liggen.' }, { status: 400 });
  }

  const stlyStart = shiftJaar(start, -1);
  const stlyEind = shiftJaar(eind, -1);

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, nulmeting(jaar, maand, omzet, bezetting)')
    .eq('client_id', id);
  if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });

  const listingIds = (listings ?? []).map((l) => l.id);

  // .in('listing_id', []) is niet gegarandeerd betrouwbaar tussen PostgREST-versies bij een
  // lege lijst — voor een klant zonder (nog) gekoppelde listings slaan we de queries dus over
  // i.p.v. te vertrouwen op hoe een lege .in() zich toevallig gedraagt.
  let huidigeRijen: CacheReservering[] = [];
  let stlyRijen: CacheReservering[] = [];

  if (listingIds.length > 0) {
    const [{ data: huidigeData, error: huidigeError }, { data: stlyData, error: stlyError }] = await Promise.all([
      supabase
        .from('pricelabs_reserveringen_cache')
        .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
        .in('listing_id', listingIds)
        .lte('check_in', eind)
        .gt('check_out', start),
      supabase
        .from('pricelabs_reserveringen_cache')
        .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
        .in('listing_id', listingIds)
        .lte('check_in', stlyEind)
        .gt('check_out', stlyStart),
    ]);
    if (huidigeError) return NextResponse.json({ error: huidigeError.message }, { status: 500 });
    if (stlyError) return NextResponse.json({ error: stlyError.message }, { status: 500 });

    huidigeRijen = huidigeData ?? [];
    stlyRijen = stlyData ?? [];

    waarschuwBijMogelijkeAfkapping('huidige periode', huidigeRijen);
    waarschuwBijMogelijkeAfkapping('STLY-periode', stlyRijen);
  }

  const data = berekenOmzetVoorPeriode({
    listings: listings ?? [],
    huidigeRijen,
    stlyRijen,
    start,
    eind,
    periodeType,
  });

  return NextResponse.json(data);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/admin-omzet-route.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/admin/klanten/[id]/omzet/route.ts" tests/integration/admin-omzet-route.test.ts
git commit -m "feat: admin-only omzetroute per client_id"
```

---

### Task 3: `OmzetDashboard` gets an optional `clientId` prop

**Files:**
- Modify: `src/components/dashboard/omzet-dashboard.tsx`

There is no component-test infrastructure in this codebase (Vitest runs with `environment: 'node'`, no jsdom/Testing Library) — this task is verified via build + the manual verification in Task 5, consistent with how every other UI-only component in this codebase is handled.

- [ ] **Step 1: Add the `clientId` prop and switch the fetch endpoint**

In `src/components/dashboard/omzet-dashboard.tsx`, change the function signature from:

```typescript
export function OmzetDashboard() {
```

to:

```typescript
export function OmzetDashboard({ clientId }: { clientId?: string }) {
```

Change the `laadData` callback's fetch call from:

```typescript
    const { start, eind } = berekenPeriode(periodeId, eigenStart, eigenEind);
    const periodeType = periodeId === 'eigen' ? 'eigen' : 'vast';
    fetch(`/api/dashboard/omzet?start=${start}&eind=${eind}&periodeType=${periodeType}`)
```

to:

```typescript
    const { start, eind } = berekenPeriode(periodeId, eigenStart, eigenEind);
    const periodeType = periodeId === 'eigen' ? 'eigen' : 'vast';
    const endpoint = clientId ? `/api/admin/klanten/${clientId}/omzet` : '/api/dashboard/omzet';
    fetch(`${endpoint}?start=${start}&eind=${eind}&periodeType=${periodeType}`)
```

Add `clientId` to `laadData`'s dependency array, changing:

```typescript
  }, [periodeId, eigenStart, eigenEind]);
```

(the one immediately closing the `laadData` `useCallback`) to:

```typescript
  }, [periodeId, eigenStart, eigenEind, clientId]);
```

- [ ] **Step 2: Hide the klant-only sync button when `clientId` is set**

Change:

```tsx
          <Button size="sm" onClick={synchroniseer} disabled={isPending}>
            {isPending ? 'Bezig...' : 'Data synchroniseren'}
          </Button>
```

to:

```tsx
          {!clientId && (
            <Button size="sm" onClick={synchroniseer} disabled={isPending}>
              {isPending ? 'Bezig...' : 'Data synchroniseren'}
            </Button>
          )}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds successfully, no TypeScript or ESLint errors (in particular, no `react-hooks/exhaustive-deps` warning about `clientId`).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/omzet-dashboard.tsx
git commit -m "feat: OmzetDashboard ondersteunt admin-gebruik via clientId-prop"
```

---

### Task 4: Wire the admin Cijfers page

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx`

- [ ] **Step 1: Replace the placeholder with real content**

Replace the full contents of `src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx` (currently just a placeholder with "Deze sectie is binnenkort beschikbaar.") with:

```tsx
import { createClient } from '@/lib/supabase/server';
import { berekenMaandVergelijkingen, berekenWowCijfer, vroegsteSamenwerkingGestart } from '@/lib/dashboard/bereken-resultaten';
import { WowCijfer } from '@/components/dashboard/wow-cijfer';
import { OmzetDashboard } from '@/components/dashboard/omzet-dashboard';
import { ResultatenGrafiek } from '@/components/dashboard/resultaten-grafiek';

export default async function CijfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet)')
    .eq('client_id', id);
  if (listingsError) console.error('Kon listings niet laden voor cijferpagina:', listingsError);

  const vergelijkingen = berekenMaandVergelijkingen(
    (listings ?? []).map((listing) => ({
      nulmeting: listing.nulmeting ?? [],
      monthlyActuals: listing.monthly_actuals ?? [],
      samenwerkingGestart: listing.samenwerking_gestart,
    }))
  );
  const wowCijfer = berekenWowCijfer(vergelijkingen);
  const startmaand = vroegsteSamenwerkingGestart((listings ?? []).map((listing) => listing.samenwerking_gestart));

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Cijfers</h1>

      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
      <OmzetDashboard clientId={id} />
      <ResultatenGrafiek data={vergelijkingen} />
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx"
git commit -m "feat: admin-Cijferspagina toont Impactmeter, omzetdashboard en resultatengrafiek"
```

---

### Task 5: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (previous total was 141; this plan adds 5 more from Task 2 — expect 146).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors (the two pre-existing, unrelated lint issues in `src/app/auth/confirm/page.tsx` and the gitignored `supabase/.temp/` directory are not part of this change and can be ignored).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and, as an admin session, open `/admin/klanten/[id]/cijfers` for a klant with PriceLabs-gekoppelde listings:
- Confirm the Impactmeter, omzet-dashboard (with period switcher — deze maand/vorige maand/dit jaar/eigen periode), and resultatengrafiek all render with real numbers.
- Confirm there is no "Data synchroniseren" button on this page (unlike the klant's own Cijferspagina).
- Confirm the numbers match what the same klant sees on their own `/dashboard/cijfers` page when logged in as that klant.
- Confirm a klant session still cannot reach `/api/dashboard/omzet` as an admin would, and that an admin session still gets a 403 from `/api/dashboard/omzet` directly (unchanged behavior).

- [ ] **Step 5: Push to `main`**

```bash
git push origin main
```

Railway auto-deploys on push to `main`. No database migration in this deelproject — nothing to hand over for manual application in Supabase.
