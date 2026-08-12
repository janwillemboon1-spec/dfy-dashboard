# Voortgang: activiteitenlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic + manual activity log to the klantportaal's Voortgang page, replacing the old per-listing `ActielogTijdlijn` that currently (temporarily) lives on the klant Cijfers page.

**Architecture:** A new client-scoped table `voortgang_activiteitenlog` is written to two ways: (1) automatically, via three `security definer` Postgres triggers on `voortgang_checklist_items` and `voortgang_todos` that fire on checkbox toggles and new to-do inserts — so the already-tested server actions (`vinkChecklistItemAf`, `vinkTodoAf`, `voegTodoToe`) need zero changes; (2) manually, via a new admin-only server action `voegActiviteitToe`. The existing `ActielogTijdlijn` display component is renamed/relocated to `src/components/portal/voortgangs-activiteitenlog.tsx` and reused as-is (its item shape — `id`, `datum`, `omschrijving` — already matches) for both the admin and klant Voortgang pages.

**Tech Stack:** Next.js App Router server actions, Supabase Postgres (RLS + `security definer` triggers), Vitest integration tests against local Supabase.

**Reference:** Spec at `docs/superpowers/specs/2026-08-12-voortgang-activiteitenlog-design.md`.

---

### Task 1: Migration — table, RLS, and logging triggers

**Files:**
- Create: `supabase/migrations/20260812150000_voortgang_activiteitenlog.sql`

- [ ] **Step 1: Write the migration**

```sql
create table voortgang_activiteitenlog (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  datum date not null,
  omschrijving text not null,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_activiteitenlog_client_id_idx on voortgang_activiteitenlog(client_id);

grant select, insert, update, delete on voortgang_activiteitenlog to anon, authenticated, service_role;

alter table voortgang_activiteitenlog enable row level security;

create policy "admin volledige toegang voortgang_activiteitenlog" on voortgang_activiteitenlog
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_activiteitenlog" on voortgang_activiteitenlog
  for select using (client_id = current_client_id());

-- Bewust geen insert-policy voor de klant: automatische logregels (hieronder) ontstaan via
-- `security definer`-triggers, die RLS omzeilen — dezelfde aanpak als de bestaande
-- `seed_standaard_checklist_items`-trigger op de `clients`-tabel.

create or replace function log_checklist_item_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    current_date,
    case when new.afgevinkt
      then 'Checklist-item afgevinkt: ' || new.naam
      else 'Checklist-item uitgevinkt: ' || new.naam
    end,
    auth.uid()
  );
  return new;
end;
$$;

revoke execute on function log_checklist_item_afgevinkt() from public, anon, authenticated;

create trigger voortgang_checklist_items_log_afgevinkt
  after update of afgevinkt on voortgang_checklist_items
  for each row
  when (old.afgevinkt is distinct from new.afgevinkt)
  execute function log_checklist_item_afgevinkt();

create or replace function log_todo_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    current_date,
    case when new.afgevinkt
      then 'To-do afgevinkt: ' || new.naam
      else 'To-do uitgevinkt: ' || new.naam
    end,
    auth.uid()
  );
  return new;
end;
$$;

revoke execute on function log_todo_afgevinkt() from public, anon, authenticated;

create trigger voortgang_todos_log_afgevinkt
  after update of afgevinkt on voortgang_todos
  for each row
  when (old.afgevinkt is distinct from new.afgevinkt)
  execute function log_todo_afgevinkt();

create or replace function log_todo_toegevoegd()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, datum, omschrijving, toegevoegd_door)
  values (new.client_id, current_date, 'Nieuwe taak toegevoegd: ' || new.naam, auth.uid());
  return new;
end;
$$;

revoke execute on function log_todo_toegevoegd() from public, anon, authenticated;

create trigger voortgang_todos_log_toegevoegd
  after insert on voortgang_todos
  for each row execute function log_todo_toegevoegd();
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: output lists `20260812150000_voortgang_activiteitenlog.sql` as applied, no errors. (If Docker/Supabase isn't running yet, run `open -a Docker` and `npx supabase start` first.)

- [ ] **Step 3: Regenerate database types**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

Note the `2>/dev/null` must come before the `>` redirect — otherwise CLI status text corrupts the output file.

- [ ] **Step 4: Verify the new table appears in the generated types**

Run: `grep -c "voortgang_activiteitenlog" src/types/database.ts`
Expected: a non-zero number.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260812150000_voortgang_activiteitenlog.sql src/types/database.ts
git commit -m "feat: voortgang_activiteitenlog tabel met automatische logtriggers"
```

---

### Task 2: `voegActiviteitToe` server action

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts` (append after `verwijderTodo`, which currently ends at line 716)
- Test: `tests/integration/activiteitenlog.test.ts` (new)

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/activiteitenlog.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('@/lib/email/send-todo-notificatie', () => ({
  sendTodoNotificatie: vi.fn().mockResolvedValue(undefined),
}));

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

const { voegActiviteitToe, voegChecklistItemToe, vinkChecklistItemAf, voegTodoToe, vinkTodoAf } = await import(
  '@/app/[locale]/admin/klanten/[id]/actions'
);

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
    .insert({ naam: 'Activiteitenlog Klant', email: `activiteitenlog-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `activiteitenlog-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `activiteitenlog-klant-${suffix}@test.local`;
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

describe('voegActiviteitToe', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Test' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een lege omschrijving', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: '   ' })
    ).rejects.toThrow('Omschrijving is verplicht.');
  });

  it('maakt de activiteit aan met de ingelogde admin als toegevoegd_door', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Handmatige regel' });

    const { data: activiteit } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Handmatige regel')
      .single();
    expect(activiteit!.datum).toBe('2026-08-12');
    expect(activiteit!.toegevoegd_door).toBe(adminUserId);
  });
});

describe('automatisch loggen via triggers', () => {
  it('logt een checklist-item dat wordt afgevinkt en weer uitgevinkt', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Trigger-test item' });
    const { data: item } = await admin
      .from('voortgang_checklist_items')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Trigger-test item')
      .single();

    await vinkChecklistItemAf({ clientId, itemId: item!.id, faseNummer: 1, afgevinkt: true });
    const { data: afgevinktLog } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Checklist-item afgevinkt: Trigger-test item')
      .single();
    expect(afgevinktLog!.toegevoegd_door).toBe(adminUserId);

    await vinkChecklistItemAf({ clientId, itemId: item!.id, faseNummer: 1, afgevinkt: false });
    const { data: uitgevinktLog } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Checklist-item uitgevinkt: Trigger-test item')
      .single();
    expect(uitgevinktLog!.toegevoegd_door).toBe(adminUserId);
  });

  it('logt een nieuwe to-do die door de admin wordt toegevoegd', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegTodoToe({ clientId, naam: 'Trigger-test taak', deadline: '2026-09-01' });

    const { data: log } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Nieuwe taak toegevoegd: Trigger-test taak')
      .single();
    expect(log!.toegevoegd_door).toBe(adminUserId);
  });

  it('logt een to-do die door de klant wordt afgevinkt, met de klant als toegevoegd_door', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Klant-trigger-taak', deadline: '2026-09-02' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Klant-trigger-taak')
      .single();

    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await vinkTodoAf({ clientId, todoId: todo!.id, afgevinkt: true });

    const { data: log } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'To-do afgevinkt: Klant-trigger-taak')
      .single();
    expect(log!.toegevoegd_door).toBe(klantUserId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/activiteitenlog.test.ts`
Expected: FAIL — `voegActiviteitToe` is not exported from `actions.ts`.

- [ ] **Step 3: Implement `voegActiviteitToe`**

Append to `src/app/[locale]/admin/klanten/[id]/actions.ts` (after `verwijderTodo`, i.e. at the end of the file):

```typescript
export async function voegActiviteitToe(input: {
  clientId: string;
  datum: string;
  omschrijving: string;
}) {
  await assertIsAdmin();
  if (!input.omschrijving.trim()) throw new Error('Omschrijving is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('voortgang_activiteitenlog').insert({
    client_id: input.clientId,
    datum: input.datum,
    omschrijving: input.omschrijving.trim(),
    toegevoegd_door: user?.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/activiteitenlog.test.ts`
Expected: PASS — all 6 tests green (3 in `voegActiviteitToe`, 3 in `automatisch loggen via triggers`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/activiteitenlog.test.ts
git commit -m "feat: voegActiviteitToe server-actie + tests voor automatisch loggen"
```

---

### Task 3: Relocate the display component

**Files:**
- Create: `src/components/portal/voortgangs-activiteitenlog.tsx`
- Delete: `src/components/dashboard/actielog-tijdlijn.tsx`

- [ ] **Step 1: Create the relocated component**

Create `src/components/portal/voortgangs-activiteitenlog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ActiviteitenlogItem {
  id: string;
  datum: string;
  omschrijving: string;
}

export function VoortgangsActiviteitenlog({ items }: { items: ActiviteitenlogItem[] }) {
  const [toonAlles, setToonAlles] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen activiteiten geregistreerd.</p>;
  }

  const gesorteerd = [...items].sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const zichtbaar = toonAlles ? gesorteerd : gesorteerd.slice(0, 5);

  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-sm">
        {zichtbaar.map((item) => (
          <li key={item.id} className="text-muted-foreground">
            {new Date(item.datum).toLocaleDateString('nl-NL')} — {item.omschrijving}
          </li>
        ))}
      </ul>
      {!toonAlles && gesorteerd.length > 5 && (
        <Button variant="ghost" size="sm" onClick={() => setToonAlles(true)}>
          Toon meer
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old component**

```bash
git rm src/components/dashboard/actielog-tijdlijn.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/voortgangs-activiteitenlog.tsx
git commit -m "refactor: verplaats ActielogTijdlijn naar VoortgangsActiviteitenlog in portal/"
```

(This commit will show as a delete + an add — that's expected, `git rm` already staged the deletion.)

---

### Task 4: Admin "add entry" form

**Files:**
- Create: `src/components/admin/activiteit-toevoegen-formulier.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegActiviteitToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ActiviteitToevoegenFormulier({ clientId }: { clientId: string }) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [omschrijving, setOmschrijving] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!omschrijving.trim()) {
      setFoutmelding('Omschrijving is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegActiviteitToe({ clientId, datum, omschrijving });
        setOmschrijving('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3 text-sm">
      <div>
        <label htmlFor={`activiteit-datum-${clientId}`} className="block text-xs text-muted-foreground">
          Datum
        </label>
        <Input
          id={`activiteit-datum-${clientId}`}
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
        />
      </div>
      <div className="min-w-[200px] flex-1">
        <label htmlFor={`activiteit-omschrijving-${clientId}`} className="block text-xs text-muted-foreground">
          Omschrijving
        </label>
        <Input
          id={`activiteit-omschrijving-${clientId}`}
          value={omschrijving}
          onChange={(e) => setOmschrijving(e.target.value)}
        />
      </div>
      <Button size="sm" disabled={isPending} onClick={toevoegen}>
        {isPending ? 'Bezig...' : '+'}
      </Button>
      {foutmelding && <p className="w-full text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/activiteit-toevoegen-formulier.tsx
git commit -m "feat: ActiviteitToevoegenFormulier voor handmatige logregels"
```

---

### Task 5: Wire into the klant Voortgang page, remove old actielog from Cijfers

**Files:**
- Modify: `src/app/[locale]/dashboard/voortgang/page.tsx`
- Modify: `src/app/[locale]/dashboard/cijfers/page.tsx`

- [ ] **Step 1: Add the activiteitenlog query and section to the Voortgang page**

In `src/app/[locale]/dashboard/voortgang/page.tsx`, add the import:

```typescript
import { VoortgangsActiviteitenlog, type ActiviteitenlogItem } from '@/components/portal/voortgangs-activiteitenlog';
```

Change the `Promise.all` block from:

```typescript
  const [{ data: fasen }, { data: items }, { data: funnel }, { data: todos }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt'),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .maybeSingle(),
    supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt'),
  ]);
```

to:

```typescript
  const [{ data: fasen }, { data: items }, { data: funnel }, { data: todos }, { data: activiteiten }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt'),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .maybeSingle(),
    supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt'),
    supabase.from('voortgang_activiteitenlog').select('id, datum, omschrijving'),
  ]);
```

Add, right after the `itemsData` mapping:

```typescript
  const activiteitenData: ActiviteitenlogItem[] = (activiteiten ?? []).map((a) => ({
    id: a.id,
    datum: a.datum,
    omschrijving: a.omschrijving,
  }));
```

Add a new section at the end of the returned JSX, after the To-do's `</div>` block and before the closing `</main>`:

```tsx
      <div className="mt-10">
        <h2 className="font-serif text-xl">Activiteitenlog</h2>
        <div className="mt-4">
          <VoortgangsActiviteitenlog items={activiteitenData} />
        </div>
      </div>
```

- [ ] **Step 2: Remove the old actielog from the Cijfers page**

In `src/app/[locale]/dashboard/cijfers/page.tsx`, remove the import:

```typescript
import { ActielogTijdlijn } from '@/components/dashboard/actielog-tijdlijn';
```

Change the listings select from:

```typescript
  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet), action_log(id, datum, omschrijving)');
```

to:

```typescript
  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet)');
```

Remove this line:

```typescript
  const actielogItems = (listings ?? []).flatMap((listing) => listing.action_log ?? []);
```

Remove `<ActielogTijdlijn items={actielogItems} />` from the JSX, so the return block ends with:

```tsx
      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
      <OmzetDashboard />
      <ResultatenGrafiek data={vergelijkingen} />
    </main>
  );
}
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: builds successfully, no TypeScript errors about `action_log` or `ActielogTijdlijn`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/voortgang/page.tsx" "src/app/[locale]/dashboard/cijfers/page.tsx"
git commit -m "feat: activiteitenlog op klant-Voortgangpagina, oude actielog weg bij Cijfers"
```

---

### Task 6: Wire into the admin Voortgang page

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx`

- [ ] **Step 1: Add the activiteitenlog query, section, and add-form**

Add the imports:

```typescript
import { VoortgangsActiviteitenlog, type ActiviteitenlogItem } from '@/components/portal/voortgangs-activiteitenlog';
import { ActiviteitToevoegenFormulier } from '@/components/admin/activiteit-toevoegen-formulier';
```

Change the `Promise.all` block from:

```typescript
  const [{ data: fasen }, { data: items }, { data: funnel }, { data: todos }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt').eq('client_id', id),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .eq('client_id', id)
      .maybeSingle(),
    supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt').eq('client_id', id),
  ]);
```

to:

```typescript
  const [{ data: fasen }, { data: items }, { data: funnel }, { data: todos }, { data: activiteiten }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt').eq('client_id', id),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .eq('client_id', id)
      .maybeSingle(),
    supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt').eq('client_id', id),
    supabase.from('voortgang_activiteitenlog').select('id, datum, omschrijving').eq('client_id', id),
  ]);
```

Add, right after the `itemsData` mapping:

```typescript
  const activiteitenData: ActiviteitenlogItem[] = (activiteiten ?? []).map((a) => ({
    id: a.id,
    datum: a.datum,
    omschrijving: a.omschrijving,
  }));
```

Add a new section at the end of the returned JSX, after the To-do's block's `<TodoToevoegenFormulier clientId={id} />` and before the closing `</main>`:

```tsx
      <div className="mt-10">
        <h2 className="font-serif text-xl">Activiteitenlog</h2>
        <div className="mt-4">
          <VoortgangsActiviteitenlog items={activiteitenData} />
        </div>
        <ActiviteitToevoegenFormulier clientId={id} />
      </div>
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx"
git commit -m "feat: activiteitenlog + handmatig-toevoegen op admin-Voortgangpagina"
```

---

### Task 7: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (previous total was 135; this plan adds 6 more from Task 2 — expect 141).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and, as both an admin session and a klant session:
- Confirm the Voortgang page shows an "Activiteitenlog" section.
- As admin: check off a checklist item, add a to-do, check off a to-do, and add a manual activiteit via the new form — confirm each shows up in the log in the right order (newest first) after a page refresh.
- Confirm the log is visible (read-only, no add-form) on the klant session's Voortgang page.
- Confirm the klant Cijfers page no longer shows an actielog section.

- [ ] **Step 5: Push to `main`**

```bash
git push origin main
```

Railway auto-deploys on push to `main`.

- [ ] **Step 6: Give the user the migration SQL for production**

Since there is no production Supabase CLI/credentials access in this environment, paste the full contents of `supabase/migrations/20260812150000_voortgang_activiteitenlog.sql` for the user to run manually via the Supabase Dashboard SQL Editor, exactly as done for every prior migration this session.
