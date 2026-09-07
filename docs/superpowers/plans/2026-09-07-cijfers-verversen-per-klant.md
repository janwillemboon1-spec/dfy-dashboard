# Cijfers verversen per klant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een nieuwe knop op de admin-klantdetailpagina die in één keer alle aan PriceLabs gekoppelde accommodaties van die klant ververst, zodat Cijfers/Impactmeter direct up-to-date zijn zonder op de nachtelijke cron te wachten.

**Architecture:** Eén nieuwe server-actie (`ververCijfersVoorKlant`) die exact dezelfde synchronisatielogica hergebruikt als de al bestaande, per-listing `syncListingNow` (`syncListing()` uit `src/lib/pricelabs/sync.ts`), maar geloopt over alle gekoppelde listings van één klant — zelfde meerdere-listings-in-één-actie-patroon als de al bestaande klant-kant `syncEigenListings`. Eén nieuw UI-component ernaast op de bestaande "Accommodaties"-kop. Geen databasewijziging nodig — alles leunt op bestaande tabellen/kolommen.

**Tech Stack:** Next.js Server Actions, Supabase, vitest (met de al bestaande PriceLabs-client-mock-conventie uit `tests/integration/sync-listing.test.ts`). Geen nieuwe dependencies.

**Reference:** Spec op `docs/superpowers/specs/2026-09-07-cijfers-verversen-per-klant-design.md`.

---

### Task 1: Server-actie `ververCijfersVoorKlant`

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/verver-cijfers-voor-klant.test.ts`

De nieuwe functie mirrort `syncListingNow` (dezelfde PMS-opzoek-stap, dezelfde `vanaf`/`tot`-berekening via `volgendeMaand`), maar itereert over alle gekoppelde listings van de klant i.p.v. één specifieke listing, met per-listing try/catch zodat één mislukte accommodatie de rest niet blokkeert — zelfde meerdere-items-in-één-actie-patroon als `syncEigenListings` in `src/app/[locale]/dashboard/actions.ts`.

- [ ] **Step 1: Voeg de functie toe aan `actions.ts`**

Voeg dit toe aan `src/app/[locale]/admin/klanten/[id]/actions.ts`, direct na `syncListingNow` (alle benodigde imports — `assertIsAdmin`, `createClient`, `syncListing`, `volgendeMaand`, `revalidatePath` — staan al bovenaan het bestand):

```typescript
export interface CijfersSyncResultaat {
  listingNaam: string;
  succes: boolean;
  fout?: string;
}

export async function ververCijfersVoorKlant(clientId: string): Promise<CijfersSyncResultaat[]> {
  await assertIsAdmin();
  const supabase = await createClient();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, pricelabs_listing_id')
    .eq('client_id', clientId)
    .not('pricelabs_listing_id', 'is', null);

  if (listingsError) throw new Error(listingsError.message);
  if (!listings || listings.length === 0) return [];

  const nu = new Date();
  const huidigeMaand = { jaar: nu.getUTCFullYear(), maand: nu.getUTCMonth() + 1 };
  const resultaten: CijfersSyncResultaat[] = [];

  for (const listing of listings) {
    try {
      const { data: cacheRow, error: cacheError } = await supabase
        .from('pricelabs_listings_cache')
        .select('pms')
        .eq('pricelabs_listing_id', listing.pricelabs_listing_id!)
        .single();
      if (cacheError || !cacheRow?.pms) {
        throw new Error('Kon PMS-type niet bepalen voor deze PriceLabs-listing.');
      }

      const { data: laatsteNulmeting } = await supabase
        .from('nulmeting')
        .select('jaar, maand')
        .eq('listing_id', listing.id)
        .order('jaar', { ascending: false })
        .order('maand', { ascending: false })
        .limit(1)
        .maybeSingle();

      const vanaf = laatsteNulmeting
        ? volgendeMaand(laatsteNulmeting.jaar, laatsteNulmeting.maand)
        : huidigeMaand;

      await syncListing(supabase, {
        listingId: listing.id,
        pricelabsListingId: listing.pricelabs_listing_id!,
        pms: cacheRow.pms,
        vanaf,
        tot: huidigeMaand,
      });

      resultaten.push({ listingNaam: listing.naam, succes: true });
    } catch (error) {
      resultaten.push({ listingNaam: listing.naam, succes: false, fout: (error as Error).message });
    }
  }

  revalidatePath(`/admin/klanten/${clientId}/instellingen`);

  return resultaten;
}
```

Let op: een lege array (`[]`) betekent hier expliciet "geen gekoppelde accommodaties" — dat is bewust geen fout, de aanroepende UI toont dan een eigen nette melding (Task 2).

- [ ] **Step 2: Schrijf de integratietest**

Create `tests/integration/verver-cijfers-voor-klant.test.ts` (zelfde login-via-cookie-store-patroon als `tests/integration/voeg-accommodatie-toe.test.ts`, gecombineerd met de PriceLabs-client-mock uit `tests/integration/sync-listing.test.ts`):

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return {
    ...actual,
    fetchReservationData: vi.fn().mockResolvedValue([
      { check_in: '2025-01-10', check_out: '2025-01-12', rental_revenue: '200', booking_status: 'booked' },
    ]),
  };
});

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

const { ververCijfersVoorKlant } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
let adminEmail: string;
let adminUserId: string;
let klantEmail: string;
let klantUserId: string;
let gekoppeldeListingId: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Cijfers Verversen Klant', email: `cijfers-verversen-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  const { data: gekoppeld } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Gekoppelde Listing', pricelabs_listing_id: `pl-cijfers-test-${suffix}` })
    .select()
    .single();
  gekoppeldeListingId = gekoppeld!.id;
  await admin
    .from('pricelabs_listings_cache')
    .upsert(
      { pricelabs_listing_id: `pl-cijfers-test-${suffix}`, naam: 'Test', pms: 'hostaway' },
      { onConflict: 'pricelabs_listing_id' }
    );

  await admin.from('listings').insert({ client_id: clientId, naam: 'Niet-gekoppelde Listing' });

  adminEmail = `cijfers-verversen-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `cijfers-verversen-klant-${suffix}@test.local`;
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
});

describe('ververCijfersVoorKlant', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(ververCijfersVoorKlant(clientId)).rejects.toThrow('Niet geautoriseerd.');
  });

  it('ververst alleen gekoppelde listings en slaat niet-gekoppelde over', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const resultaten = await ververCijfersVoorKlant(clientId);

    expect(resultaten).toHaveLength(1);
    expect(resultaten[0].listingNaam).toBe('Gekoppelde Listing');
    expect(resultaten[0].succes).toBe(true);

    const { data: actuals } = await admin
      .from('monthly_actuals')
      .select('*')
      .eq('listing_id', gekoppeldeListingId);
    expect(actuals!.length).toBeGreaterThan(0);
  });

  it('geeft een lege lijst terug als er geen gekoppelde accommodaties zijn', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const suffix = Date.now();
    const { data: kaleKlant } = await admin
      .from('clients')
      .insert({ naam: 'Kale Klant', email: `kaal-${suffix}@test.local` })
      .select()
      .single();

    const resultaten = await ververCijfersVoorKlant(kaleKlant!.id);
    expect(resultaten).toEqual([]);

    await admin.from('clients').delete().eq('id', kaleKlant!.id);
  });
});
```

- [ ] **Step 3: Run de tests**

Run: `npx vitest run --fileParallelism=false tests/integration/verver-cijfers-voor-klant.test.ts`
Expected: 3 tests slagen. Vereist een lokaal draaiende Supabase-stack (`npx supabase start` als die nog niet draait — check met `docker ps`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/verver-cijfers-voor-klant.test.ts
git commit -m "feat: server-actie om PriceLabs-cijfers van alle accommodaties van één klant te verversen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Note: quote het pad met `[locale]`/`[id]` zodat de shell de blokhaken niet probeert te expanden.)

---

### Task 2: UI-knop "Cijfers verversen"

**Files:**
- Create: `src/components/admin/cijfers-verversen-knop.tsx`
- Modify: `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`

- [ ] **Step 1: Schrijf het component**

Create `src/components/admin/cijfers-verversen-knop.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { ververCijfersVoorKlant } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';

export function CijfersVerversenKnop({ clientId }: { clientId: string }) {
  const [resultaat, setResultaat] = useState<string | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function ververs() {
    setFoutmelding(null);
    setResultaat(null);
    startTransition(async () => {
      try {
        const resultaten = await ververCijfersVoorKlant(clientId);

        if (resultaten.length === 0) {
          setResultaat('Geen gekoppelde accommodaties om te verversen.');
          return;
        }

        const geslaagd = resultaten.filter((r) => r.succes).length;
        const mislukt = resultaten.filter((r) => !r.succes);

        if (mislukt.length === 0) {
          setResultaat(`${geslaagd} van ${resultaten.length} accommodaties bijgewerkt.`);
        } else {
          setResultaat(
            `${geslaagd} van ${resultaten.length} accommodaties bijgewerkt. Mislukt: ${mislukt
              .map((r) => `${r.listingNaam} (${r.fout})`)
              .join(', ')}`
          );
        }
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={ververs} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Cijfers verversen'}
      </Button>
      {resultaat && <p className="text-sm text-muted-foreground">{resultaat}</p>}
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire het component in op de klantdetailpagina**

In `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`, voeg de import toe bovenaan (bij de andere `@/components/admin/*`-imports):

```tsx
import { CijfersVerversenKnop } from '@/components/admin/cijfers-verversen-knop';
```

En verander:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Accommodaties</h2>
        <div className="flex gap-2">
          <ListingToevoegenFormulier clientId={id} />
          <PricelabsCacheVerversen clientId={id} />
        </div>
      </div>
```

naar:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Accommodaties</h2>
        <div className="flex gap-2">
          <ListingToevoegenFormulier clientId={id} />
          <CijfersVerversenKnop clientId={id} />
          <PricelabsCacheVerversen clientId={id} />
        </div>
      </div>
```

- [ ] **Step 3: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/cijfers-verversen-knop.tsx "src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx"
git commit -m "feat: knop 'Cijfers verversen' op klantdetailpagina

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Volledige verificatie en push

- [ ] **Step 1: Run de volledige testsuite**

Run: `npx vitest run --fileParallelism=false`
Expected: alle tests slagen, inclusief de 3 nieuwe tests uit Task 1. Bij brede, uniforme "fetch failed"-fouten op *alle* integratietests tegelijk: check `docker ps`/`npx supabase status` en herstart zo nodig met `npx supabase start` vóórdat je verder zoekt naar een echte regressie.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: geen nieuwe fouten. De twee al bekende, ongerelateerde issues (`src/app/auth/confirm/page.tsx`, de gitignorede `supabase/.temp/`-map) zijn verwacht.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 4: Handmatige verificatie**

Start de dev-server (`npm run dev`) en loop het volgende door — vraagt een echte browser die in deze omgeving niet beschikbaar is:

- Open de klantdetailpagina van een klant met minstens één aan PriceLabs gekoppelde accommodatie → klik "Cijfers verversen" → na afloop verschijnt een samenvatting ("X van Y accommodaties bijgewerkt").
- Ga naar de Cijfers-pagina van diezelfde klant → controleer dat de omzet van de huidige maand en de impactmeter kloppen met de recentste PriceLabs-data.
- Test ook bij een klant zonder gekoppelde accommodaties → nette melding, geen fout.

- [ ] **Step 5: Push**

```bash
git push origin main
```

Geen productie-migratie nodig voor dit plan (geen databasewijzigingen).
