# Klantportaal — Voortgang: checklist per fase (deelproject 3/7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De Voortgang-pagina krijgt een checklist per fase (met een vaste standaard-set van 20 items, automatisch voor elke klant) en een los "Airbnb funnel nulmeting"-formulier met 4 percentagevelden; het fase-percentage wordt voortaan automatisch herberekend uit de afvink-status van de checklist.

**Architecture:** Twee nieuwe tabellen (`voortgang_checklist_items`, `airbnb_funnel_nulmeting`), een Postgres-trigger die nieuwe klanten automatisch van de standaard-checklist voorziet, twee nieuwe server-acties die na elke wijziging het fase-percentage herberekenen via een gedeelde interne hulpfunctie, en een derde, ongekoppelde server-actie voor de funnel-percentages.

**Tech Stack:** Supabase (Postgres/RLS/trigger), Next.js Server Components + Server Actions, Vitest.

**Referentie-spec:** `docs/superpowers/specs/2026-08-12-voortgang-checklist-design.md`

---

### Task 1: Migratie — `voortgang_checklist_items` + standaard-checklist

**Files:**
- Create: `supabase/migrations/20260812110000_voortgang_checklist_items.sql`

- [ ] **Step 1: Maak het migratiebestand aan**

```sql
create table voortgang_checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  fase_nummer int not null check (fase_nummer between 1 and 3),
  naam text not null,
  afgevinkt boolean not null default false,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_checklist_items_client_id_idx on voortgang_checklist_items(client_id);

grant select, insert, update, delete on voortgang_checklist_items to anon, authenticated, service_role;

alter table voortgang_checklist_items enable row level security;

create policy "admin volledige toegang voortgang_checklist_items" on voortgang_checklist_items
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_checklist_items" on voortgang_checklist_items
  for select using (client_id = current_client_id());

-- Eén bron van waarheid voor de standaard-checklist (20 items), hergebruikt door zowel de
-- eenmalige backfill hieronder als de trigger voor nieuwe klanten — zodat de lijst niet op
-- twee plekken in sync gehouden hoeft te worden.
create or replace function standaard_checklist_items()
returns table(fase_nummer int, naam text)
language sql
immutable
as $$
  select * from (values
    (1, 'Koppeling met dynamic pricing software tot stand gebracht'),
    (1, 'Dashboard geactiveerd'),
    (1, 'Klant geïnformeerd'),
    (1, 'Live gegaan'),
    (2, 'Concurrentie analyse'),
    (2, 'Reviews geanalyseerd'),
    (2, 'Antwoordstrategie bepaald'),
    (2, 'Host profiel beoordeeld'),
    (3, 'Advertentietitel geanalyseerd'),
    (3, 'Omschrijving herschreven'),
    (3, 'Foto''s beoordeeld en aanbevelingen gegeven'),
    (3, 'Voorzieningenlijst gecontroleerd'),
    (3, 'Huisregels gecheckt'),
    (3, 'Alles gereviewed'),
    (3, 'Basisprijs ingesteld'),
    (3, 'Weekendtoeslag geconfigureerd'),
    (3, 'Seizoensprijzen ingesteld'),
    (3, 'Minimum nachten bepaald'),
    (3, 'Last-minute korting ingesteld'),
    (3, 'Nulmeting Airbnb funnel')
  ) as v(fase_nummer, naam);
$$;

revoke execute on function standaard_checklist_items() from public, anon, authenticated;

-- Backfill: elke klant die al bestaat krijgt de standaard-checklist meteen.
insert into voortgang_checklist_items (client_id, fase_nummer, naam)
select c.id, v.fase_nummer, v.naam
from clients c
cross join standaard_checklist_items() v;

-- Trigger: elke nieuw aangemaakte klant krijgt dezelfde standaard-checklist automatisch,
-- ongeacht via welke weg de klant wordt aangemaakt (nieuwe-klant-formulier, CSV-import, enz.)
-- — de trigger zit op tabelniveau, niet in één specifieke server-actie.
create or replace function seed_standaard_checklist_items()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_checklist_items (client_id, fase_nummer, naam)
  select new.id, v.fase_nummer, v.naam
  from standaard_checklist_items() v;
  return new;
end;
$$;

revoke execute on function seed_standaard_checklist_items() from public, anon, authenticated;

create trigger clients_seed_standaard_checklist
  after insert on clients
  for each row execute function seed_standaard_checklist_items();
```

- [ ] **Step 2: Pas de migratie toe op de lokale database**

Run: `npx supabase migration up`
Expected: de migratie wordt toegepast zonder errors.

- [ ] **Step 3: Verifieer de backfill handmatig**

Open Supabase Studio (de `Studio URL` staat in de output van `npx supabase status`) en
controleer in de tabel `voortgang_checklist_items` dat elke bestaande rij in `clients` nu 20
checklist-rijen heeft: 4 voor fase 1, 4 voor fase 2, 12 voor fase 3 (filter op `client_id` en
tel, of gebruik de SQL Editor in Studio met
`select fase_nummer, count(*) from voortgang_checklist_items group by fase_nummer order by fase_nummer;`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260812110000_voortgang_checklist_items.sql
git commit -m "feat: voortgang_checklist_items-tabel + standaard-checklist (backfill + trigger)"
```

---

### Task 2: Migratie — `airbnb_funnel_nulmeting`

**Files:**
- Create: `supabase/migrations/20260812120000_airbnb_funnel_nulmeting.sql`

- [ ] **Step 1: Maak het migratiebestand aan**

```sql
create table airbnb_funnel_nulmeting (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade unique,
  gemiddeld_conversiepercentage numeric(5,2) check (gemiddeld_conversiepercentage between 0 and 100),
  percentage_zoekvertoningen_eerste_pagina numeric(5,2) check (percentage_zoekvertoningen_eerste_pagina between 0 and 100),
  conversie_zoekopdracht_naar_advertentie numeric(5,2) check (conversie_zoekopdracht_naar_advertentie between 0 and 100),
  conversie_advertentie_naar_boeking numeric(5,2) check (conversie_advertentie_naar_boeking between 0 and 100),
  bijgewerkt_op timestamptz not null default now()
);

grant select, insert, update, delete on airbnb_funnel_nulmeting to anon, authenticated, service_role;

alter table airbnb_funnel_nulmeting enable row level security;

create policy "admin volledige toegang airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting
  for select using (client_id = current_client_id());
```

- [ ] **Step 2: Pas de migratie toe**

Run: `npx supabase migration up`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260812120000_airbnb_funnel_nulmeting.sql
git commit -m "feat: airbnb_funnel_nulmeting-tabel (4 losse percentagevelden per klant)"
```

---

### Task 3: Database-types regenereren

**Files:**
- Modify: `src/types/database.ts`

Zonder deze stap faalt de TypeScript-build straks (dit is bij deelproject 2 ook misgegaan —
de gegenereerde types kennen de nieuwe tabellen dan nog niet).

- [ ] **Step 1: Regenereer**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Let op**: gebruik exact deze vorm (`2>/dev/null` vóór de `>`-redirect) — als de CLI's
statusmeldingen (bv. "Connecting to db ...") in het bestand terechtkomen i.p.v. alleen naar de
terminal, breekt dat de gegenereerde TypeScript volledig.

Expected: `grep -c "voortgang_checklist_items" src/types/database.ts` en
`grep -c "airbnb_funnel_nulmeting" src/types/database.ts` geven allebei een getal > 0.

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenereer database-types na checklist- en funnel-migraties"
```

---

### Task 4: Checklist-server-acties (`voegChecklistItemToe`, `vinkChecklistItemAf`)

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/checklist-items.test.ts`

- [ ] **Step 1: Schrijf de integratietest**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

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

const { voegChecklistItemToe, vinkChecklistItemAf } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Checklist Klant', email: `checklist-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `checklist-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `checklist-klant-${suffix}@test.local`;
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

describe('voegChecklistItemToe', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Test' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een lege naam', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      voegChecklistItemToe({ clientId, faseNummer: 1, naam: '   ' })
    ).rejects.toThrow('Naam is verplicht.');
  });
});

describe('checklist en fase-percentage herberekening', () => {
  it('herberekent het fase-percentage correct bij toevoegen en afvinken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const suffix = `${Date.now()}-percentage`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Percentage Klant', email: `checklist-percentage-${suffix}@test.local` })
      .select()
      .single();
    const percentageClientId = client!.id;

    try {
      // De standaard-checklist-trigger heeft net 4 items voor fase 1 aangemaakt — eerst
      // opruimen zodat deze test met een schone, voorspelbare lei begint.
      await admin.from('voortgang_checklist_items').delete().eq('client_id', percentageClientId);

      await voegChecklistItemToe({ clientId: percentageClientId, faseNummer: 1, naam: 'Item A' });
      await voegChecklistItemToe({ clientId: percentageClientId, faseNummer: 1, naam: 'Item B' });

      const { data: itemsNaToevoegen } = await admin
        .from('voortgang_checklist_items')
        .select('id, naam')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1);
      const itemA = itemsNaToevoegen!.find((i) => i.naam === 'Item A')!;

      await vinkChecklistItemAf({
        clientId: percentageClientId,
        itemId: itemA.id,
        faseNummer: 1,
        afgevinkt: true,
      });

      const { data: faseNa1Afvink } = await admin
        .from('voortgang_fasen')
        .select('percentage')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1)
        .single();
      expect(faseNa1Afvink!.percentage).toBe(50);

      await voegChecklistItemToe({ clientId: percentageClientId, faseNummer: 1, naam: 'Item C' });

      const { data: faseNa3eItem } = await admin
        .from('voortgang_fasen')
        .select('percentage')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1)
        .single();
      expect(faseNa3eItem!.percentage).toBe(33);

      const { data: itemsNa3e } = await admin
        .from('voortgang_checklist_items')
        .select('id, naam')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1);
      const itemC = itemsNa3e!.find((i) => i.naam === 'Item C')!;

      await vinkChecklistItemAf({
        clientId: percentageClientId,
        itemId: itemC.id,
        faseNummer: 1,
        afgevinkt: true,
      });

      const { data: faseNaC } = await admin
        .from('voortgang_fasen')
        .select('percentage')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1)
        .single();
      // Item A en C zijn afgevinkt, Item B nog niet: 2 van de 3 = 67%.
      expect(faseNaC!.percentage).toBe(67);
    } finally {
      await admin.from('clients').delete().eq('id', percentageClientId);
    }
  });
});
```

- [ ] **Step 2: Run de test om te bevestigen dat hij faalt**

Run: `npm test -- tests/integration/checklist-items.test.ts`
Expected: FAIL — `voegChecklistItemToe`/`vinkChecklistItemAf` bestaan nog niet.

- [ ] **Step 3: Voeg de import toe en de server-acties**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, vervang de importregels bovenaan:

```ts
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';
import { syncListing, volgendeMaand, dagenInMaand } from '@/lib/pricelabs/sync';
import { syncListingReserveringen } from '@/lib/pricelabs/reserveringen-sync';
import { createAdminClient } from '@/lib/supabase/admin';
import { aggregeer } from '@/lib/dashboard/omzet-aggregatie';
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';
```

door:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';
import { syncListing, volgendeMaand, dagenInMaand } from '@/lib/pricelabs/sync';
import { syncListingReserveringen } from '@/lib/pricelabs/reserveringen-sync';
import { createAdminClient } from '@/lib/supabase/admin';
import { aggregeer } from '@/lib/dashboard/omzet-aggregatie';
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';
```

Voeg helemaal onderaan het bestand toe (ná `werkFaseVoortgangBij`):

```ts

async function herberekenFasePercentage(
  supabase: SupabaseClient<Database>,
  clientId: string,
  faseNummer: number
) {
  const { data: items } = await supabase
    .from('voortgang_checklist_items')
    .select('afgevinkt')
    .eq('client_id', clientId)
    .eq('fase_nummer', faseNummer);

  const totaal = items?.length ?? 0;
  const afgevinkt = items?.filter((i) => i.afgevinkt).length ?? 0;
  const percentage = totaal > 0 ? Math.round((afgevinkt / totaal) * 100) : 0;

  await supabase
    .from('voortgang_fasen')
    .upsert(
      { client_id: clientId, fase_nummer: faseNummer, percentage },
      { onConflict: 'client_id,fase_nummer' }
    );
}

export async function voegChecklistItemToe(input: {
  clientId: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('voortgang_checklist_items').insert({
    client_id: input.clientId,
    fase_nummer: input.faseNummer,
    naam: input.naam.trim(),
    toegevoegd_door: user?.id,
  });
  if (error) throw new Error(error.message);

  await herberekenFasePercentage(supabase, input.clientId, input.faseNummer);
  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}

export async function vinkChecklistItemAf(input: {
  clientId: string;
  itemId: string;
  faseNummer: 1 | 2 | 3;
  afgevinkt: boolean;
}) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from('voortgang_checklist_items')
    .update({ afgevinkt: input.afgevinkt })
    .eq('id', input.itemId);
  if (error) throw new Error(error.message);

  await herberekenFasePercentage(supabase, input.clientId, input.faseNummer);
  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

- [ ] **Step 4: Run de test om te bevestigen dat hij slaagt**

Run: `npm test -- tests/integration/checklist-items.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/checklist-items.test.ts
git commit -m "feat: voegChecklistItemToe en vinkChecklistItemAf herberekenen automatisch het fase-percentage"
```

---

### Task 5: Server-actie `werkAirbnbFunnelNulmetingBij`

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts`

- [ ] **Step 1: Schrijf de integratietest**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

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

const { werkAirbnbFunnelNulmetingBij } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Funnel Klant', email: `funnel-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `funnel-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `funnel-klant-${suffix}@test.local`;
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

describe('werkAirbnbFunnelNulmetingBij', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      werkAirbnbFunnelNulmetingBij({
        clientId,
        gemiddeldConversiepercentage: 5,
        percentageZoekvertoningenEerstePagina: 10,
        conversieZoekopdrachtNaarAdvertentie: 15,
        conversieAdvertentieNaarBoeking: 20,
      })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('maakt een nieuwe rij aan en werkt die daarna bij i.p.v. te dupliceren', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      gemiddeldConversiepercentage: 5.5,
      percentageZoekvertoningenEerstePagina: 10.25,
      conversieZoekopdrachtNaarAdvertentie: 15,
      conversieAdvertentieNaarBoeking: 20,
    });

    const { data: rij1 } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('client_id', clientId)
      .single();
    expect(rij1!.gemiddeld_conversiepercentage).toBe(5.5);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      gemiddeldConversiepercentage: 6,
      percentageZoekvertoningenEerstePagina: 10.25,
      conversieZoekopdrachtNaarAdvertentie: 15,
      conversieAdvertentieNaarBoeking: 20,
    });

    const { data: rijen } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('client_id', clientId);
    expect(rijen).toHaveLength(1);
    expect(rijen![0].gemiddeld_conversiepercentage).toBe(6);
  });

  it('laat het bijbehorende checklist-item "Nulmeting Airbnb funnel" ongemoeid', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: itemVoor } = await admin
      .from('voortgang_checklist_items')
      .select('afgevinkt')
      .eq('client_id', clientId)
      .eq('naam', 'Nulmeting Airbnb funnel')
      .single();
    expect(itemVoor!.afgevinkt).toBe(false);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      gemiddeldConversiepercentage: 8,
      percentageZoekvertoningenEerstePagina: 12,
      conversieZoekopdrachtNaarAdvertentie: 18,
      conversieAdvertentieNaarBoeking: 22,
    });

    const { data: itemNa } = await admin
      .from('voortgang_checklist_items')
      .select('afgevinkt')
      .eq('client_id', clientId)
      .eq('naam', 'Nulmeting Airbnb funnel')
      .single();
    expect(itemNa!.afgevinkt).toBe(false);
  });
});
```

- [ ] **Step 2: Run de test om te bevestigen dat hij faalt**

Run: `npm test -- tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts`
Expected: FAIL — `werkAirbnbFunnelNulmetingBij` bestaat nog niet.

- [ ] **Step 3: Voeg de server-actie toe**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, voeg helemaal onderaan toe:

```ts

export async function werkAirbnbFunnelNulmetingBij(input: {
  clientId: string;
  gemiddeldConversiepercentage: number | null;
  percentageZoekvertoningenEerstePagina: number | null;
  conversieZoekopdrachtNaarAdvertentie: number | null;
  conversieAdvertentieNaarBoeking: number | null;
}) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from('airbnb_funnel_nulmeting')
    .upsert(
      {
        client_id: input.clientId,
        gemiddeld_conversiepercentage: input.gemiddeldConversiepercentage,
        percentage_zoekvertoningen_eerste_pagina: input.percentageZoekvertoningenEerstePagina,
        conversie_zoekopdracht_naar_advertentie: input.conversieZoekopdrachtNaarAdvertentie,
        conversie_advertentie_naar_boeking: input.conversieAdvertentieNaarBoeking,
      },
      { onConflict: 'client_id' }
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

- [ ] **Step 4: Run de test om te bevestigen dat hij slaagt**

Run: `npm test -- tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts
git commit -m "feat: werkAirbnbFunnelNulmetingBij server-actie"
```

---

### Task 6: `VoortgangsChecklist` + `ChecklistItemRij`-componenten

**Files:**
- Create: `src/components/portal/checklist-item-rij.tsx`
- Create: `src/components/portal/voortgangs-checklist.tsx`

- [ ] **Step 1: Maak `checklist-item-rij.tsx` aan**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { vinkChecklistItemAf } from '@/app/[locale]/admin/klanten/[id]/actions';

export function ChecklistItemRij({
  clientId,
  itemId,
  faseNummer,
  naam,
  afgevinkt,
  magBewerken,
}: {
  clientId: string;
  itemId: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
  afgevinkt: boolean;
  magBewerken: boolean;
}) {
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!magBewerken) {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden>{afgevinkt ? '☑' : '☐'}</span>
        {naam}
      </span>
    );
  }

  function toggle() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await vinkChecklistItemAf({ clientId, itemId, faseNummer, afgevinkt: !afgevinkt });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={afgevinkt} disabled={isPending} onChange={toggle} />
        {naam}
      </label>
      {foutmelding && <p className="text-xs text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Maak `voortgangs-checklist.tsx` aan**

```tsx
import { FASE_NAMEN } from '@/lib/constants/fasen';
import { ChecklistItemRij } from './checklist-item-rij';

export interface ChecklistItem {
  id: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
  afgevinkt: boolean;
}

const ALLE_FASEN = [1, 2, 3] as const;

export function VoortgangsChecklist({
  items,
  clientId,
  magBewerken,
}: {
  items: ChecklistItem[];
  clientId: string;
  magBewerken: boolean;
}) {
  return (
    <div className="space-y-6">
      {ALLE_FASEN.map((faseNummer) => {
        const faseItems = items.filter((i) => i.faseNummer === faseNummer);
        return (
          <div key={faseNummer}>
            <h3 className="text-sm font-medium">
              {faseNummer}. {FASE_NAMEN[faseNummer - 1]}
            </h3>
            <ul className="mt-2 space-y-1">
              {faseItems.map((item) => (
                <li key={item.id}>
                  <ChecklistItemRij
                    clientId={clientId}
                    itemId={item.id}
                    faseNummer={item.faseNummer}
                    naam={item.naam}
                    afgevinkt={item.afgevinkt}
                    magBewerken={magBewerken}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/checklist-item-rij.tsx src/components/portal/voortgangs-checklist.tsx
git commit -m "feat: VoortgangsChecklist-component (per fase gegroepeerd, admin kan afvinken)"
```

---

### Task 7: `ChecklistItemToevoegenFormulier` (admin)

**Files:**
- Create: `src/components/admin/checklist-item-toevoegen-formulier.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegChecklistItemToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FASE_NAMEN } from '@/lib/constants/fasen';

export function ChecklistItemToevoegenFormulier({ clientId }: { clientId: string }) {
  const [faseNummer, setFaseNummer] = useState<1 | 2 | 3>(1);
  const [naam, setNaam] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!naam.trim()) {
      setFoutmelding('Naam is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegChecklistItemToe({ clientId, faseNummer, naam });
        setNaam('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor={`checklist-fase-${clientId}`} className="block text-xs text-muted-foreground">
            Fase
          </label>
          <select
            id={`checklist-fase-${clientId}`}
            value={faseNummer}
            onChange={(e) => setFaseNummer(Number(e.target.value) as 1 | 2 | 3)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {FASE_NAMEN.map((naamOptie, i) => (
              <option key={naamOptie} value={i + 1}>
                {i + 1}. {naamOptie}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor={`checklist-naam-${clientId}`} className="block text-xs text-muted-foreground">
            Naam
          </label>
          <Input id={`checklist-naam-${clientId}`} value={naam} onChange={(e) => setNaam(e.target.value)} />
        </div>
        <Button size="sm" disabled={isPending} onClick={toevoegen}>
          {isPending ? 'Bezig...' : '+'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/checklist-item-toevoegen-formulier.tsx
git commit -m "feat: ChecklistItemToevoegenFormulier voor admin"
```

---

### Task 8: `AirbnbFunnelNulmeting`-component

**Files:**
- Create: `src/components/portal/airbnb-funnel-nulmeting.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { werkAirbnbFunnelNulmetingBij } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AirbnbFunnelWaarden {
  gemiddeldConversiepercentage: number | null;
  percentageZoekvertoningenEerstePagina: number | null;
  conversieZoekopdrachtNaarAdvertentie: number | null;
  conversieAdvertentieNaarBoeking: number | null;
}

const VELDEN: { sleutel: keyof AirbnbFunnelWaarden; label: string }[] = [
  { sleutel: 'gemiddeldConversiepercentage', label: 'Gemiddelde totale conversiepercentage' },
  { sleutel: 'percentageZoekvertoningenEerstePagina', label: 'Percentage zoekvertoningen op de eerste pagina' },
  { sleutel: 'conversieZoekopdrachtNaarAdvertentie', label: 'Gemiddelde conversie van zoekopdracht naar advertentie' },
  { sleutel: 'conversieAdvertentieNaarBoeking', label: 'Gemiddelde conversie van advertentie naar boeking' },
];

export function AirbnbFunnelNulmeting({
  clientId,
  waarden,
  magBewerken,
}: {
  clientId: string;
  waarden: AirbnbFunnelWaarden;
  magBewerken: boolean;
}) {
  const [invoer, setInvoer] = useState(waarden);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!magBewerken) {
    return (
      <div className="mt-6 space-y-1 text-sm">
        <h3 className="font-medium">Nulmeting Airbnb funnel</h3>
        {VELDEN.map((veld) => (
          <p key={veld.sleutel} className="text-muted-foreground">
            {veld.label}: {waarden[veld.sleutel] !== null ? `${waarden[veld.sleutel]}%` : 'Nog niet ingevuld'}
          </p>
        ))}
      </div>
    );
  }

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await werkAirbnbFunnelNulmetingBij({ clientId, ...invoer });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <h3 className="font-medium">Nulmeting Airbnb funnel</h3>
      {VELDEN.map((veld) => (
        <div key={veld.sleutel} className="flex items-center gap-2">
          <label htmlFor={`funnel-${veld.sleutel}-${clientId}`} className="flex-1 text-xs text-muted-foreground">
            {veld.label}
          </label>
          <Input
            id={`funnel-${veld.sleutel}-${clientId}`}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={invoer[veld.sleutel] ?? ''}
            onChange={(e) =>
              setInvoer((huidig) => ({
                ...huidig,
                [veld.sleutel]: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
            className="w-24"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      ))}
      <Button size="sm" disabled={isPending} onClick={opslaan}>
        {isPending ? 'Bezig...' : 'Opslaan'}
      </Button>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/airbnb-funnel-nulmeting.tsx
git commit -m "feat: AirbnbFunnelNulmeting-component (4 losse percentagevelden)"
```

---

### Task 9: Wiring in de Voortgang-pagina's

**Files:**
- Modify: `src/app/[locale]/dashboard/voortgang/page.tsx`
- Modify: `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx`

- [ ] **Step 1: Vervang de klant-pagina**

Vervang de volledige inhoud van `src/app/[locale]/dashboard/voortgang/page.tsx` door:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';
import { VoortgangsChecklist, type ChecklistItem } from '@/components/portal/voortgangs-checklist';
import { AirbnbFunnelNulmeting } from '@/components/portal/airbnb-funnel-nulmeting';

// Geen expliciet client_id-filter nodig op de queries hieronder: de "klant leest eigen ..."
// RLS-policies scopen dit al af tot precies de data van de ingelogde klant. Dit klopt alleen
// voor een klant-sessie — dashboard/layout.tsx redirect een admin-sessie al weg vóórdat deze
// pagina rendert.
export default async function VoortgangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user.id).maybeSingle();
  const clientId = profile?.client_id ?? '';

  const [{ data: fasen }, { data: items }, { data: funnel }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt'),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking'
      )
      .maybeSingle(),
  ]);

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));
  const itemsData: ChecklistItem[] = (items ?? []).map((i) => ({
    id: i.id,
    faseNummer: i.fase_nummer as 1 | 2 | 3,
    naam: i.naam,
    afgevinkt: i.afgevinkt,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <div className="mt-6">
        <VoortgangsBalk fasen={fasenData} />
      </div>
      <div className="mt-10">
        <h2 className="font-serif text-xl">Checklist</h2>
        <div className="mt-4">
          <VoortgangsChecklist items={itemsData} clientId={clientId} magBewerken={false} />
        </div>
        <AirbnbFunnelNulmeting
          clientId={clientId}
          waarden={{
            gemiddeldConversiepercentage: funnel?.gemiddeld_conversiepercentage ?? null,
            percentageZoekvertoningenEerstePagina: funnel?.percentage_zoekvertoningen_eerste_pagina ?? null,
            conversieZoekopdrachtNaarAdvertentie: funnel?.conversie_zoekopdracht_naar_advertentie ?? null,
            conversieAdvertentieNaarBoeking: funnel?.conversie_advertentie_naar_boeking ?? null,
          }}
          magBewerken={false}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Vervang de admin-pagina**

Vervang de volledige inhoud van `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx` door:

```tsx
import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';
import { VoortgangsChecklist, type ChecklistItem } from '@/components/portal/voortgangs-checklist';
import { AirbnbFunnelNulmeting } from '@/components/portal/airbnb-funnel-nulmeting';
import { FaseVoortgangFormulier } from '@/components/admin/fase-voortgang-formulier';
import { ChecklistItemToevoegenFormulier } from '@/components/admin/checklist-item-toevoegen-formulier';

export default async function VoortgangPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: fasen }, { data: items }, { data: funnel }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt').eq('client_id', id),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking'
      )
      .eq('client_id', id)
      .maybeSingle(),
  ]);

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));
  const itemsData: ChecklistItem[] = (items ?? []).map((i) => ({
    id: i.id,
    faseNummer: i.fase_nummer as 1 | 2 | 3,
    naam: i.naam,
    afgevinkt: i.afgevinkt,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <div className="mt-6">
        <VoortgangsBalk fasen={fasenData} />
      </div>
      <FaseVoortgangFormulier clientId={id} />
      <div className="mt-10">
        <h2 className="font-serif text-xl">Checklist</h2>
        <div className="mt-4">
          <VoortgangsChecklist items={itemsData} clientId={id} magBewerken />
        </div>
        <ChecklistItemToevoegenFormulier clientId={id} />
        <AirbnbFunnelNulmeting
          clientId={id}
          waarden={{
            gemiddeldConversiepercentage: funnel?.gemiddeld_conversiepercentage ?? null,
            percentageZoekvertoningenEerstePagina: funnel?.percentage_zoekvertoningen_eerste_pagina ?? null,
            conversieZoekopdrachtNaarAdvertentie: funnel?.conversie_zoekopdracht_naar_advertentie ?? null,
            conversieAdvertentieNaarBoeking: funnel?.conversie_advertentie_naar_boeking ?? null,
          }}
          magBewerken
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/voortgang/page.tsx" "src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx"
git commit -m "feat: Voortgang-pagina's tonen checklist per fase en de Airbnb funnel-nulmeting"
```

---

### Task 10: Verificatie

**Files:** geen wijzigingen — verificatiestap.

- [ ] **Step 1: Run de volledige testsuite**

Run: `npm test`
Expected: alle tests slagen.

- [ ] **Step 2: Lint en build**

Run: `npm run lint && npm run build`
Expected: geen lint-errors in de gewijzigde/nieuwe bestanden (negeer bestaande fouten in
`supabase/.temp/`); build/typecheck slaagt.

- [ ] **Step 3: Handmatig testen tegen de dev-server**

Run: `npm run dev`.

Als admin: open een (bestaande) klant → Voortgang-tab. Controleer dat de checklist meteen 20
items toont, verdeeld over de 3 fasen (4/4/12). Vink een item af in fase 1 en zie de
voortgangsbalk van fase 1 meteen het nieuwe percentage tonen. Voeg via het toevoeg-formulier
een extra item toe aan fase 2 en zie het percentage van fase 2 dalen. Vul de 4
Airbnb-funnel-percentages in en sla op.

Als klant: open Voortgang — dezelfde checklist en funnel-percentages zijn zichtbaar,
alleen-lezen (geen klikbare vinkjes, geen invoervelden).

Sluit de dev-server af (Ctrl+C) na verificatie.
