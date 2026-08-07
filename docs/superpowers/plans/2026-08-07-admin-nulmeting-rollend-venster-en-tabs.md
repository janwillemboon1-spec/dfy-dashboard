# Admin nulmeting: rollend 12-maandsvenster + tabstructuur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De admin-nulmetingberekening gebruikt een rollend venster van de 12 kalendermaanden vóór de opgegeven startmaand (altijd echte historische data, geen STLY-schatting meer), en de admin-klantpagina krijgt een tabstructuur met een Nulmeting-tab die standaard alleen de huidige cijfers toont.

**Architecture:** `bepaalNulmetingBronnen` levert het rollende venster; `berekenNulmetingUitPricelabs` slaat elke maand onder zijn eigen echte kalenderjaar op en vervangt bij elke berekening de volledige bestaande baseline. De UI krijgt een nieuwe herbruikbare `Tabs`-component (op `@base-ui/react/tabs`, zelfde patroon als `Dialog`) en het berekenen-formulier wordt standaard ingeklapt.

**Tech Stack:** TypeScript, Next.js Server Components/Server Actions, Vitest, Supabase, `@base-ui/react`.

**Referentie-spec:** `docs/superpowers/specs/2026-08-07-admin-nulmeting-rollend-venster-en-tabs-design.md`

---

### Task 1: `bepaalNulmetingBronnen` — rollend venster

**Files:**
- Modify: `src/lib/dashboard/nulmeting-uit-pricelabs.ts`
- Test: `tests/unit/nulmeting-uit-pricelabs.test.ts`

- [ ] **Step 1: Vervang de tests door de nieuwe cases**

Vervang de volledige inhoud van `tests/unit/nulmeting-uit-pricelabs.test.ts` door:

```ts
import { describe, it, expect } from 'vitest';
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';

describe('bepaalNulmetingBronnen', () => {
  it('geeft de 12 kalendermaanden vóór een startmaand in het midden van het jaar, chronologisch', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 9);
    expect(bronnen).toEqual([
      { jaar: 2025, maand: 9 },
      { jaar: 2025, maand: 10 },
      { jaar: 2025, maand: 11 },
      { jaar: 2025, maand: 12 },
      { jaar: 2026, maand: 1 },
      { jaar: 2026, maand: 2 },
      { jaar: 2026, maand: 3 },
      { jaar: 2026, maand: 4 },
      { jaar: 2026, maand: 5 },
      { jaar: 2026, maand: 6 },
      { jaar: 2026, maand: 7 },
      { jaar: 2026, maand: 8 },
    ]);
  });

  it('geeft het volledige vorige kalenderjaar terug als de startmaand januari is', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 1);
    expect(bronnen).toEqual([
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 2 },
      { jaar: 2025, maand: 3 },
      { jaar: 2025, maand: 4 },
      { jaar: 2025, maand: 5 },
      { jaar: 2025, maand: 6 },
      { jaar: 2025, maand: 7 },
      { jaar: 2025, maand: 8 },
      { jaar: 2025, maand: 9 },
      { jaar: 2025, maand: 10 },
      { jaar: 2025, maand: 11 },
      { jaar: 2025, maand: 12 },
    ]);
  });

  it('geeft 11 maanden van dit jaar en december van vorig jaar als de startmaand december is', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 12);
    expect(bronnen).toEqual([
      { jaar: 2025, maand: 12 },
      { jaar: 2026, maand: 1 },
      { jaar: 2026, maand: 2 },
      { jaar: 2026, maand: 3 },
      { jaar: 2026, maand: 4 },
      { jaar: 2026, maand: 5 },
      { jaar: 2026, maand: 6 },
      { jaar: 2026, maand: 7 },
      { jaar: 2026, maand: 8 },
      { jaar: 2026, maand: 9 },
      { jaar: 2026, maand: 10 },
      { jaar: 2026, maand: 11 },
    ]);
  });

  it('geeft altijd 12 unieke (jaar, maand)-combinaties terug', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 6);
    expect(bronnen).toHaveLength(12);
    const sleutels = new Set(bronnen.map((b) => `${b.jaar}-${b.maand}`));
    expect(sleutels.size).toBe(12);
  });
});
```

- [ ] **Step 2: Run de tests om te bevestigen dat ze falen**

Run: `npm test -- tests/unit/nulmeting-uit-pricelabs.test.ts`
Expected: FAIL — de huidige `bepaalNulmetingBronnen` retourneert `{maand, bron, bronJaar, bronMaand}`-objecten, niet `{jaar, maand}`.

- [ ] **Step 3: Herschrijf `nulmeting-uit-pricelabs.ts`**

Vervang de volledige inhoud van `src/lib/dashboard/nulmeting-uit-pricelabs.ts` door:

```ts
export interface NulmetingBron {
  jaar: number;
  maand: number;
}

// De 12 kalendermaanden die direct voorafgaan aan (startJaar, startMaand), chronologisch
// (oudste eerst). Voor start = september 2026 (9, 2026): augustus 2026 t/m januari 2026,
// gevolgd door december 2025 t/m september 2025 — 12 maanden, altijd al verstreken op het
// moment dat de samenwerking start, dus allemaal bruikbaar als échte PriceLabs-data. Geen
// STLY-schatting meer nodig: er zit per definitie geen toekomstige maand in dit venster.
export function bepaalNulmetingBronnen(startJaar: number, startMaand: number): NulmetingBron[] {
  const bronnen: NulmetingBron[] = [];
  let jaar = startJaar;
  let maand = startMaand;
  for (let i = 0; i < 12; i++) {
    maand -= 1;
    if (maand === 0) {
      maand = 12;
      jaar -= 1;
    }
    bronnen.unshift({ jaar, maand });
  }
  return bronnen;
}
```

- [ ] **Step 4: Run de tests om te bevestigen dat ze slagen**

Run: `npm test -- tests/unit/nulmeting-uit-pricelabs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/nulmeting-uit-pricelabs.ts tests/unit/nulmeting-uit-pricelabs.test.ts
git commit -m "fix: bepaalNulmetingBronnen gebruikt een rollend 12-maandsvenster i.p.v. echt/STLY-kalenderjaar"
```

---

### Task 2: `berekenNulmetingUitPricelabs` — eigen jaar per rij, volledige vervanging

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/bereken-nulmeting-uit-pricelabs.test.ts`

- [ ] **Step 1: Pas `NulmetingMaandResultaat` aan**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, vervang:

```ts
export interface NulmetingMaandResultaat {
  maand: number;
  bron: 'echt' | 'stly';
  omzet: number;
  bezetting: number;
  leeg: boolean;
}
```

door:

```ts
export interface NulmetingMaandResultaat {
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
  leeg: boolean;
}
```

- [ ] **Step 2: Pas de retourtype-signatuur aan**

Vervang:

```ts
export async function berekenNulmetingUitPricelabs(input: {
  listingId: string;
  clientId: string;
  samenwerkingGestart: string; // 'JJJJ-MM-DD'
}): Promise<{ jaar: number; maanden: NulmetingMaandResultaat[] }> {
```

door:

```ts
export async function berekenNulmetingUitPricelabs(input: {
  listingId: string;
  clientId: string;
  samenwerkingGestart: string; // 'JJJJ-MM-DD'
}): Promise<{ startJaar: number; startMaand: number; maanden: NulmetingMaandResultaat[] }> {
```

- [ ] **Step 3: Pas de per-bronmaand-berekening aan**

Vervang:

```ts
  const maanden: NulmetingMaandResultaat[] = bronnen.map((bron) => {
    const { jaar: volgJaar, maand: volgMaand } = volgendeMaand(bron.bronJaar, bron.bronMaand);
    const maandStart = `${bron.bronJaar}-${String(bron.bronMaand).padStart(2, '0')}-01`;
    const maandEind = `${volgJaar}-${String(volgMaand).padStart(2, '0')}-01`;
    const rijen = (cacheRijen ?? []).filter((r) => r.check_in <= maandEind && r.check_out > maandStart);
    const metrics = aggregeer(rijen, maandStart, maandEind, dagenInMaand(bron.bronJaar, bron.bronMaand));
    const leeg = rijen.length === 0;
    return {
      maand: bron.maand,
      bron: bron.bron,
      omzet: Math.round(metrics.omzet * 100) / 100,
      bezetting: (() => {
        // Defensieve clamp: nulmeting.bezetting heeft een DB check-constraint (0-100).
        // aggregeer() zou dat in theorie kunnen overschrijden bij overlappende
        // reserveringen; dat mag de hele berekening niet laten klappen op een
        // constraint-violation. Wél zichtbaar loggen — een clamp die stilzwijgend
        // gebeurt, verbergt een reëel datakwaliteitsprobleem (overlappende of
        // dubbel-getelde reserveringen) i.p.v. het te signaleren.
        const afgerond = Math.round(metrics.bezetting * 100) / 100;
        if (afgerond > 100) {
          console.warn(
            `[berekenNulmetingUitPricelabs] bezetting ${afgerond}% voor ${bron.bronJaar}-${String(bron.bronMaand).padStart(2, '0')} (listing ${input.listingId}) overschrijdt 100% — geclampt. Mogelijk overlappende reserveringen.`
          );
        }
        return Math.min(100, afgerond);
      })(),
      leeg,
    };
  });
```

door:

```ts
  const maanden: NulmetingMaandResultaat[] = bronnen.map((bron) => {
    const { jaar: volgJaar, maand: volgMaand } = volgendeMaand(bron.jaar, bron.maand);
    const maandStart = `${bron.jaar}-${String(bron.maand).padStart(2, '0')}-01`;
    const maandEind = `${volgJaar}-${String(volgMaand).padStart(2, '0')}-01`;
    const rijen = (cacheRijen ?? []).filter((r) => r.check_in <= maandEind && r.check_out > maandStart);
    const metrics = aggregeer(rijen, maandStart, maandEind, dagenInMaand(bron.jaar, bron.maand));
    const leeg = rijen.length === 0;
    return {
      jaar: bron.jaar,
      maand: bron.maand,
      omzet: Math.round(metrics.omzet * 100) / 100,
      bezetting: (() => {
        // Defensieve clamp: nulmeting.bezetting heeft een DB check-constraint (0-100).
        // aggregeer() zou dat in theorie kunnen overschrijden bij overlappende
        // reserveringen; dat mag de hele berekening niet laten klappen op een
        // constraint-violation. Wél zichtbaar loggen — een clamp die stilzwijgend
        // gebeurt, verbergt een reëel datakwaliteitsprobleem (overlappende of
        // dubbel-getelde reserveringen) i.p.v. het te signaleren.
        const afgerond = Math.round(metrics.bezetting * 100) / 100;
        if (afgerond > 100) {
          console.warn(
            `[berekenNulmetingUitPricelabs] bezetting ${afgerond}% voor ${bron.jaar}-${String(bron.maand).padStart(2, '0')} (listing ${input.listingId}) overschrijdt 100% — geclampt. Mogelijk overlappende reserveringen.`
          );
        }
        return Math.min(100, afgerond);
      })(),
      leeg,
    };
  });
```

- [ ] **Step 4: Pas de opslag aan — eigen jaar per rij, onvoorwaardelijke vervanging**

Vervang:

```ts
  const nulmetingRijen = maanden.map((m) => ({
    listing_id: input.listingId,
    jaar: startJaar,
    maand: m.maand,
    omzet: m.omzet,
    bezetting: m.bezetting,
    vastgesteld_op: new Date().toISOString(),
    laatst_gecorrigeerd_op: null,
    correctie_reden: null,
  }));

  // Een nulmeting-baseline die via de onboarding-CSV is aangemaakt (berekenNulmetingMaanden
  // in parse-clients-csv.ts) start vaak niet in januari en spant dan bewust twee
  // kalenderjaren (bv. juli t/m juni). De klant-dashboardconsumenten van deze tabel
  // (nulmetingAlsMetrics hier, berekenMaandVergelijkingen in bereken-resultaten.ts) matchen
  // uitsluitend op maandnummer, niet op jaar — als hier alleen op (listing_id, startJaar,
  // maand) geüpsert wordt, blijven de rijen van het andere kalenderjaar van de oude baseline
  // staan. Voor de overlappende maandnummers zou dat dan twee rijen opleveren die bij het
  // uitlezen stilzwijgend bij elkaar opgeteld worden (dubbele omzet/bezetting). Daarom eerst
  // elke bestaande nulmeting-rij van déze listing buiten het nieuwe startjaar verwijderen,
  // zodat er na deze berekening weer precies één rij per maandnummer over is.
  const { error: deleteError } = await admin
    .from('nulmeting')
    .delete()
    .eq('listing_id', input.listingId)
    .neq('jaar', startJaar);
  if (deleteError) throw new Error(deleteError.message);
```

door:

```ts
  const nulmetingRijen = maanden.map((m) => ({
    listing_id: input.listingId,
    jaar: m.jaar,
    maand: m.maand,
    omzet: m.omzet,
    bezetting: m.bezetting,
    vastgesteld_op: new Date().toISOString(),
    laatst_gecorrigeerd_op: null,
    correctie_reden: null,
  }));

  // Een nulmeting is altijd een complete 12-maands-vervanging, nooit een gedeeltelijke
  // aanvulling: het rollende venster (bepaalNulmetingBronnen) kan van berekening tot
  // berekening andere kalenderjaren/maanden beslaan (bv. een eerdere berekening met een
  // andere startmaand), en elke rij wordt nu onder zijn eigen échte kalenderjaar opgeslagen
  // i.p.v. onder één vast ankerjaar. Daarom eerst onvoorwaardelijk alle bestaande
  // nulmeting-rijen van déze listing verwijderen, ongeacht jaar, zodat er na deze
  // berekening altijd precies de nieuwe 12 rijen over zijn — nooit rijen van een vorige
  // berekening die niet meer in het huidige venster vallen.
  const { error: deleteError } = await admin
    .from('nulmeting')
    .delete()
    .eq('listing_id', input.listingId);
  if (deleteError) throw new Error(deleteError.message);
```

- [ ] **Step 5: Pas de retourwaarde aan**

Zoek `return { jaar: startJaar, maanden };` (helemaal aan het einde van de functie) en vervang door:

```ts
  return { startJaar, startMaand, maanden };
```

- [ ] **Step 6: Vervang de integratietests**

Vervang de volledige inhoud van `tests/integration/bereken-nulmeting-uit-pricelabs.test.ts` door:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return { ...actual, fetchReservationData: vi.fn().mockResolvedValue([]) };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

const { berekenNulmetingUitPricelabs } = await import('@/app/[locale]/admin/klanten/[id]/actions');
const { fetchReservationData } = await import('@/lib/pricelabs/client');

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

let clientId: string;
let listingId: string;
let listingZonderKoppelingId: string;
let adminUserId: string;
let adminEmail: string;
let klantUserId: string;
let klantEmail: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Nulmeting-uit-Pricelabs Klant', email: `nulmeting-pricelabs-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  const { data: listing } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Gekoppelde Listing', pricelabs_listing_id: `pl-nulmeting-${suffix}` })
    .select()
    .single();
  listingId = listing!.id;

  await admin
    .from('pricelabs_listings_cache')
    .insert({ pricelabs_listing_id: `pl-nulmeting-${suffix}`, naam: 'PL Listing', pms: 'hostaway' });

  const { data: listingZonderKoppeling } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Niet-gekoppelde Listing' })
    .select()
    .single();
  listingZonderKoppelingId = listingZonderKoppeling!.id;

  // Bestaande nulmeting voor januari 2026 — moet volledig overschreven worden door de
  // berekening (januari 2026 valt binnen het rollende venster voor start = maart 2026).
  await admin
    .from('nulmeting')
    .insert({ listing_id: listingId, jaar: 2026, maand: 1, omzet: 999, bezetting: 99 });

  adminEmail = `nulmeting-pricelabs-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `nulmeting-pricelabs-klant-${suffix}@test.local`;
  const { data: klantUserRes } = await admin.auth.admin.createUser({
    email: klantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantUserId = klantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantUserId, role: 'klant', client_id: clientId, email: klantEmail, naam: 'Klant' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(klantUserId);
  await admin.from('pricelabs_listings_cache').delete().like('pricelabs_listing_id', 'pl-nulmeting-%');
});

describe('berekenNulmetingUitPricelabs', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      berekenNulmetingUitPricelabs({ listingId, clientId, samenwerkingGestart: '2026-03-15' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een accommodatie die nog niet aan PriceLabs is gekoppeld', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      berekenNulmetingUitPricelabs({
        listingId: listingZonderKoppelingId,
        clientId,
        samenwerkingGestart: '2026-03-15',
      })
    ).rejects.toThrow('Koppel eerst deze accommodatie aan PriceLabs.');
  });

  it('berekent en overschrijft de nulmeting op basis van het rollende 12-maandsvenster', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    // start = maart 2026 → venster = maart 2025 t/m februari 2026 (bepaalNulmetingBronnen).
    // Cache-data die de berekening moet gebruiken, aangeleverd via de (gemockte)
    // PriceLabs-fetch i.p.v. rechtstreeks in de cache voor-geïnsert: berekenNulmetingUitPricelabs
    // synct eerst (syncListingReserveringen), en die sync ruimt sinds de reconcile-fix
    // alles binnen het opgevraagde venster op vóórdat de verse fetch wordt weggeschreven —
    // rechtstreeks voor-geïnsette rijen zouden dus alweer verdwenen zijn vóórdat de
    // nulmeting-berekening ze zou kunnen gebruiken.
    // - januari 2026 (binnen het venster): 1 reservering, omzet 500.
    // - mei 2025 (binnen het venster): 1 reservering, omzet 800.
    // - maart 2025 (oudste maand van het venster) blijft bewust leeg, om de
    //   'leeg: true'-markering te testen.
    vi.mocked(fetchReservationData).mockResolvedValueOnce([
      {
        reservation_id: `nulmeting-jan2026-${listingId}`,
        check_in: '2026-01-10',
        check_out: '2026-01-12',
        rental_revenue: '500',
        total_cost: null,
        no_of_days: 2,
        booking_status: 'booked',
        booking_channel: null,
      },
      {
        reservation_id: `nulmeting-mei2025-${listingId}`,
        check_in: '2025-05-10',
        check_out: '2025-05-12',
        rental_revenue: '800',
        total_cost: null,
        no_of_days: 2,
        booking_status: 'booked',
        booking_channel: null,
      },
    ]);

    const resultaat = await berekenNulmetingUitPricelabs({
      listingId,
      clientId,
      samenwerkingGestart: '2026-03-15',
    });

    expect(resultaat.startJaar).toBe(2026);
    expect(resultaat.startMaand).toBe(3);
    expect(resultaat.maanden).toHaveLength(12);

    const januari2026 = resultaat.maanden.find((m) => m.jaar === 2026 && m.maand === 1)!;
    expect(januari2026.omzet).toBe(500);
    expect(januari2026.leeg).toBe(false);

    const maart2025 = resultaat.maanden.find((m) => m.jaar === 2025 && m.maand === 3)!;
    expect(maart2025.leeg).toBe(true);
    expect(maart2025.omzet).toBe(0);

    const mei2025 = resultaat.maanden.find((m) => m.jaar === 2025 && m.maand === 5)!;
    expect(mei2025.omzet).toBe(800);
    expect(mei2025.leeg).toBe(false);

    // Overschrijven geverifieerd: januari 2026 was 999/99, moet nu 500 zijn met lege
    // correctie-velden (verse berekening, geen handmatige correctie).
    const { data: nulmetingRij } = await admin
      .from('nulmeting')
      .select('*')
      .eq('listing_id', listingId)
      .eq('jaar', 2026)
      .eq('maand', 1)
      .single();
    expect(nulmetingRij!.omzet).toBe(500);
    expect(nulmetingRij!.laatst_gecorrigeerd_op).toBeNull();
    expect(nulmetingRij!.correctie_reden).toBeNull();

    // samenwerking_gestart is opgeslagen op de listing.
    const { data: listingRij } = await admin
      .from('listings')
      .select('samenwerking_gestart')
      .eq('id', listingId)
      .single();
    expect(listingRij!.samenwerking_gestart).toBe('2026-03-15');

    // Actielog-regel is toegevoegd.
    const { data: logRijen } = await admin
      .from('action_log')
      .select('*')
      .eq('listing_id', listingId)
      .eq('type', 'nulmeting_berekend');
    expect(logRijen).toHaveLength(1);
  });

  it('ruimt een oude nulmeting-baseline die buiten het nieuwe venster valt volledig op', async () => {
    // Regressietest: een nulmeting-berekening vervangt altijd de VOLLEDIGE bestaande
    // baseline, ongeacht welk(e) kalenderjaar/jaren de oude baseline gebruikte. Dit dekt
    // zowel het geval "oude baseline spant twee kalenderjaren" (de oorspronkelijke bug bij
    // de finale whole-branch review) als "oude baseline heeft geen enkele overlap met het
    // nieuwe venster" (bv. een baseline van een heel ander jaar) — in beide gevallen mag er
    // na de berekening niets van de oude baseline overblijven.
    const suffix = `${Date.now()}-oude-baseline`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Oude-baseline Nulmeting Klant', email: `nulmeting-oude-baseline-${suffix}@test.local` })
      .select()
      .single();
    const oudeBaselineClientId = client!.id;

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: oudeBaselineClientId, naam: 'Oude-baseline Listing', pricelabs_listing_id: `pl-${suffix}` })
      .select()
      .single();
    const oudeBaselineListingId = listing!.id;

    await admin
      .from('pricelabs_listings_cache')
      .insert({ pricelabs_listing_id: `pl-${suffix}`, naam: 'PL Listing', pms: 'hostaway' });

    // Oude baseline: kalenderjaar 2023, volledig — overlapt niet met het nieuwe venster
    // (maart 2025 t/m februari 2026) voor start = maart 2026.
    const oudeBaseline = Array.from({ length: 12 }, (_, i) => ({
      listing_id: oudeBaselineListingId,
      jaar: 2023,
      maand: i + 1,
      omzet: 100,
      bezetting: 10,
    }));
    await admin.from('nulmeting').insert(oudeBaseline);

    const { data: adminUserRes } = await admin.auth.admin.createUser({
      email: `nulmeting-oude-baseline-admin-${suffix}@test.local`,
      email_confirm: true,
      password: wachtwoord,
    });
    const oudeBaselineAdminUserId = adminUserRes!.user!.id;
    await admin.from('profiles').insert({
      id: oudeBaselineAdminUserId,
      role: 'admin',
      email: `nulmeting-oude-baseline-admin-${suffix}@test.local`,
      naam: 'Admin',
    });

    try {
      activeCookieStore = await loginAlsCookieStore(`nulmeting-oude-baseline-admin-${suffix}@test.local`, wachtwoord);

      await berekenNulmetingUitPricelabs({
        listingId: oudeBaselineListingId,
        clientId: oudeBaselineClientId,
        samenwerkingGestart: '2026-03-15',
      });

      const { data: alleRijen } = await admin
        .from('nulmeting')
        .select('jaar, maand')
        .eq('listing_id', oudeBaselineListingId);

      // Precies 12 rijen over, allemaal binnen het nieuwe venster (maart 2025 t/m
      // februari 2026) — geen enkele rij meer van de oude 2023-baseline.
      expect(alleRijen).toHaveLength(12);
      expect(alleRijen!.some((r) => r.jaar === 2023)).toBe(false);
      const sleutels = alleRijen!.map((r) => `${r.jaar}-${r.maand}`).sort();
      expect(sleutels).toEqual([
        '2025-10', '2025-11', '2025-12', '2025-3', '2025-4', '2025-5',
        '2025-6', '2025-7', '2025-8', '2025-9', '2026-1', '2026-2',
      ].sort());
    } finally {
      await admin.from('clients').delete().eq('id', oudeBaselineClientId);
      await admin.auth.admin.deleteUser(oudeBaselineAdminUserId);
      await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', `pl-${suffix}`);
    }
  });

  it('prorateert een reservering die twee bronmaanden overschrijdt', async () => {
    // Regressietest voor de maandgrens-proratie-fix: een boeking die start in december
    // 2025 en doorloopt tot in januari 2026 (beide binnen het venster voor start = maart
    // 2026) moet zijn nachten/omzet naar rato over beide maanden verdelen i.p.v. volledig
    // aan december (de incheckmaand) toegekend te worden.
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

      const december2025 = resultaat.maanden.find((m) => m.jaar === 2025 && m.maand === 12)!;
      expect(december2025.omzet).toBeCloseTo(700, 5); // 7/11 * 1100
      expect(december2025.leeg).toBe(false);

      const januari2026 = resultaat.maanden.find((m) => m.jaar === 2026 && m.maand === 1)!;
      expect(januari2026.omzet).toBeCloseTo(400, 5); // 4/11 * 1100
      expect(januari2026.leeg).toBe(false);
    } finally {
      await admin.from('clients').delete().eq('id', maandgrensClientId);
      await admin.auth.admin.deleteUser(maandgrensAdminUserId);
      await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', `pl-${suffix}`);
    }
  });
});
```

- [ ] **Step 7: Run de integratietest**

Run: `npm test -- tests/integration/bereken-nulmeting-uit-pricelabs.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/bereken-nulmeting-uit-pricelabs.test.ts
git commit -m "fix: nulmeting-rijen krijgen eigen kalenderjaar en berekening vervangt altijd de volledige baseline"
```

---

### Task 3: `SamenwerkingNulmetingForm` — maand-kiezer, standaard ingeklapt

**Files:**
- Modify: `src/components/admin/samenwerking-nulmeting-form.tsx`

- [ ] **Step 1: Herschrijf het component**

Vervang de volledige inhoud van `src/components/admin/samenwerking-nulmeting-form.tsx` door:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { berekenNulmetingUitPricelabs } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAAND_NAMEN_VOL } from '@/lib/constants/maanden';

export function SamenwerkingNulmetingForm({
  listingId,
  clientId,
  pricelabsListingId,
  samenwerkingGestart,
  heeftBestaandeNulmeting,
}: {
  listingId: string;
  clientId: string;
  pricelabsListingId: string | null;
  samenwerkingGestart: string | null;
  heeftBestaandeNulmeting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [maand, setMaand] = useState(samenwerkingGestart ? samenwerkingGestart.slice(0, 7) : '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [succesmelding, setSuccesmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function berekenen() {
    setFoutmelding(null);

    if (!maand) {
      setFoutmelding('Kies eerst een maand.');
      return;
    }

    if (heeftBestaandeNulmeting) {
      const bevestigd = window.confirm('Dit overschrijft de volledige bestaande nulmeting. Doorgaan?');
      if (!bevestigd) return;
    }

    startTransition(async () => {
      try {
        const resultaat = await berekenNulmetingUitPricelabs({
          listingId,
          clientId,
          samenwerkingGestart: `${maand}-01`,
        });
        const eerste = resultaat.maanden[0];
        const laatste = resultaat.maanden[resultaat.maanden.length - 1];
        setSuccesmelding(
          `Nulmeting berekend: ${MAAND_NAMEN_VOL[eerste.maand - 1]} ${eerste.jaar} t/m ${MAAND_NAMEN_VOL[laatste.maand - 1]} ${laatste.jaar}.`
        );
        setOpen(false);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <Button
          size="sm"
          variant="outline"
          disabled={!pricelabsListingId}
          title={pricelabsListingId ? undefined : 'Koppel eerst deze accommodatie aan PriceLabs.'}
          onClick={() => setOpen(true)}
        >
          Nulmeting (her)berekenen
        </Button>
        {succesmelding && <p className="text-sm text-muted-foreground">{succesmelding}</p>}
        {!pricelabsListingId && (
          <p className="text-sm text-muted-foreground">Koppel eerst deze accommodatie aan PriceLabs.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <label htmlFor={`samenwerking-gestart-${listingId}`} className="block text-xs text-muted-foreground">
        Samenwerking gestart in
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={`samenwerking-gestart-${listingId}`}
          type="month"
          value={maand}
          onChange={(e) => setMaand(e.target.value)}
          className="w-auto"
        />
        <Button size="sm" disabled={isPending} onClick={berekenen}>
          {isPending ? 'Bezig...' : 'Berekenen'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuleren
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

Let op: `nulmetingJaren: number[]` is vervangen door `heeftBestaandeNulmeting: boolean` — de aanroeper (`page.tsx`, Taak 5) moet dit meegeven.

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/samenwerking-nulmeting-form.tsx
git commit -m "feat: nulmeting-formulier gebruikt maand-kiezer en staat standaard ingeklapt"
```

(Dit component compileert pas weer correct nadat Taak 5 `page.tsx` heeft aangepast — commit toch nu al voor kleine, behapbare stappen; de build-check in Taak 6 vangt eventuele resterende inconsistenties op.)

---

### Task 4: Herbruikbare `Tabs`-component

**Files:**
- Create: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("w-full", className)} {...props} />
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 data-active:bg-background data-active:text-foreground data-active:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel data-slot="tabs-content" className={cn("mt-4 outline-none", className)} {...props} />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "feat: herbruikbare Tabs-component op @base-ui/react/tabs"
```

---

### Task 5: Admin-klantpagina — tabstructuur per accommodatie

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/page.tsx`

- [ ] **Step 1: Herschrijf de pagina**

Vervang de volledige inhoud van `src/app/[locale]/admin/klanten/[id]/page.tsx` door:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NulmetingTabel } from '@/components/admin/nulmeting-tabel';
import { ResultatenTabel } from '@/components/admin/resultaten-tabel';
import { ActielogFormulier } from '@/components/admin/actielog-formulier';
import { PricelabsKoppeling } from '@/components/admin/pricelabs-koppeling';
import { SamenwerkingNulmetingForm } from '@/components/admin/samenwerking-nulmeting-form';
import { KlantBewerkenFormulier } from '@/components/admin/klant-bewerken-formulier';
import { KlantVerwijderenDialoog } from '@/components/admin/klant-verwijderen-dialoog';
import { ListingBewerkenFormulier } from '@/components/admin/listing-bewerken-formulier';
import { ListingVerwijderenDialoog } from '@/components/admin/listing-verwijderen-dialoog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function KlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: klant } = await supabase.from('clients').select('*').eq('id', id).single();
  if (!klant) notFound();

  const { data: listings } = await supabase
    .from('listings')
    .select('*, nulmeting(*), action_log(*), monthly_actuals(*)')
    .eq('client_id', id)
    .order('aangemaakt_op');

  const { data: pricelabsCache } = await supabase
    .from('pricelabs_listings_cache')
    .select('pricelabs_listing_id, naam, pms')
    .order('naam');

  return (
    <main className="mx-auto max-w-5xl py-10 px-4 space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl">{klant.naam}</h1>
          <p className="text-muted-foreground">{klant.email} · status: {klant.status}</p>
        </div>
        <div className="flex gap-2">
          <KlantBewerkenFormulier
            clientId={id}
            naam={klant.naam}
            email={klant.email}
            telefoon={klant.telefoon}
            status={klant.status}
          />
          <KlantVerwijderenDialoog clientId={id} naam={klant.naam} />
        </div>
      </div>

      {listings?.map((listing) => {
        const heeftBestaandeNulmeting = (listing.nulmeting ?? []).length > 0;
        return (
          <section key={listing.id} className="space-y-4 border-t border-border pt-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">{listing.naam}</h2>
              <div className="flex gap-2">
                <ListingBewerkenFormulier
                  listingId={listing.id}
                  clientId={id}
                  naam={listing.naam}
                  adres={listing.adres}
                  airbnbUrl={listing.airbnb_url}
                />
                <ListingVerwijderenDialoog listingId={listing.id} clientId={id} naam={listing.naam} />
              </div>
            </div>

            <Tabs defaultValue="nulmeting">
              <TabsList>
                <TabsTrigger value="koppeling">Koppeling</TabsTrigger>
                <TabsTrigger value="nulmeting">Nulmeting</TabsTrigger>
                <TabsTrigger value="resultaten">Resultaten</TabsTrigger>
                <TabsTrigger value="actielog">Actielog</TabsTrigger>
              </TabsList>

              <TabsContent value="koppeling">
                <PricelabsKoppeling
                  listingId={listing.id}
                  clientId={id}
                  pricelabsListingId={listing.pricelabs_listing_id}
                  cache={pricelabsCache ?? []}
                />
              </TabsContent>

              <TabsContent value="nulmeting" className="space-y-4">
                <SamenwerkingNulmetingForm
                  listingId={listing.id}
                  clientId={id}
                  pricelabsListingId={listing.pricelabs_listing_id}
                  samenwerkingGestart={listing.samenwerking_gestart}
                  heeftBestaandeNulmeting={heeftBestaandeNulmeting}
                />
                <NulmetingTabel listingId={listing.id} clientId={id} rijen={listing.nulmeting ?? []} />
              </TabsContent>

              <TabsContent value="resultaten">
                <ResultatenTabel
                  nulmeting={listing.nulmeting ?? []}
                  actueel={listing.monthly_actuals ?? []}
                  pricelabsListingId={listing.pricelabs_listing_id}
                />
              </TabsContent>

              <TabsContent value="actielog" className="space-y-4">
                <ActielogFormulier listingId={listing.id} clientId={id} />
                <ul className="space-y-1 text-sm">
                  {(listing.action_log ?? [])
                    .slice()
                    .sort((a, b) => (a.datum < b.datum ? 1 : -1))
                    .map((item) => (
                      <li key={item.id} className="text-muted-foreground">
                        {new Date(item.datum).toLocaleDateString('nl-NL')} — {item.omschrijving}
                      </li>
                    ))}
                </ul>
              </TabsContent>
            </Tabs>
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/page.tsx"
git commit -m "feat: admin-klantpagina krijgt tabstructuur per accommodatie (Koppeling/Nulmeting/Resultaten/Actielog)"
```

---

### Task 6: Volledige verificatie

**Files:** geen wijzigingen — verificatiestap.

- [ ] **Step 1: Run de volledige testsuite**

Run: `npm test`
Expected: alle tests slagen.

- [ ] **Step 2: Lint en build**

Run: `npm run lint && npm run build`
Expected: geen lint-errors in de gewijzigde bestanden (negeer eventuele bestaande fouten in
`supabase/.temp/` — dat is gitignored, lokaal Supabase-gegenereerde code, geen onderdeel van
deze wijziging); build/typecheck slaagt zonder errors.

- [ ] **Step 3: Handmatig testen tegen de dev-server**

Run: `npm run dev`, log in als admin, open een klant-detailpagina.
Expected:
- Vier tabs zichtbaar per accommodatie (Koppeling, Nulmeting, Resultaten, Actielog), Nulmeting
  actief bij openen.
- Nulmeting-tab toont bij openen alleen de tabel met huidige cijfers plus een
  "Nulmeting (her)berekenen"-knop — geen open formulier.
- Klik op de knop toont een maand-kiezer (geen dag-invoer); een berekening met een datum in
  het (nabije) verleden levert 12 maanden op, chronologisch aflopend, zonder "toekomstige"
  maanden die niet kloppen.

Sluit de dev-server af (Ctrl+C) na verificatie.
