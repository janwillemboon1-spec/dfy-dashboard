# Voortgang per woning — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the data model and server-action support for labeling checklist-items/to-do's/activiteitenlog-regels with an optional woning (listing), and convert `airbnb_funnel_nulmeting` from client-scoped to listing-scoped — with zero visible behavior change yet (no UI changes in this plan; that's a separate follow-up plan).

**Architecture:** `voortgang_checklist_items`, `voortgang_todos`, and `voortgang_activiteitenlog` get a new nullable `listing_id` column (`null` = "algemeen", applies to the whole client). `airbnb_funnel_nulmeting` moves from a unique `client_id` to a required, unique `listing_id`, since those conversion percentages are inherently per-Airbnb-listing. The three existing auto-log trigger functions propagate `listing_id` from the row that triggered them. `voortgang_fasen` is untouched — it stays client-wide; per-woning fase-percentage display will be computed live in the frontend (a later plan), not stored.

**Tech Stack:** Supabase Postgres (migrations, RLS, `security definer` triggers), Next.js Server Actions, Vitest integration tests against local Supabase.

**Reference:** Spec at `docs/superpowers/specs/2026-08-12-voortgang-per-woning-design.md`. This plan covers the "Datamodel" section only — the "UI" section is a separate follow-up plan.

---

### Task 1: Migration — `listing_id` columns, trigger updates, `airbnb_funnel_nulmeting` conversion

**Files:**
- Create: `supabase/migrations/20260812180000_voortgang_per_woning.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Voortgang per woning: checklist-items, to-do's en activiteitenlog-regels krijgen een
-- optioneel listing_id-label (null = "algemeen", geldt voor de hele klant, blijft
-- zichtbaar bij elke woning-filter). Airbnb-funnel-nulmeting gaat van client_id naar een
-- verplicht, uniek listing_id — die cijfers gaan immers over de individuele
-- Airbnb-advertentie van één woning, niet over het klantaccount als geheel.

alter table voortgang_checklist_items add column listing_id uuid references listings(id) on delete set null;
alter table voortgang_todos add column listing_id uuid references listings(id) on delete set null;
alter table voortgang_activiteitenlog add column listing_id uuid references listings(id) on delete set null;

-- De drie automatische log-triggers nemen voortaan ook de listing_id over van de rij die
-- de logregel triggerde, zodat het activiteitenlog straks ook per woning filterbaar is.
create or replace function log_checklist_item_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, listing_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    new.listing_id,
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

create or replace function log_todo_afgevinkt()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, listing_id, datum, omschrijving, toegevoegd_door)
  values (
    new.client_id,
    new.listing_id,
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

create or replace function log_todo_toegevoegd()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into voortgang_activiteitenlog (client_id, listing_id, datum, omschrijving, toegevoegd_door)
  values (new.client_id, new.listing_id, current_date, 'Nieuwe taak toegevoegd: ' || new.naam, auth.uid());
  return new;
end;
$$;

-- airbnb_funnel_nulmeting: client_id -> listing_id.
alter table airbnb_funnel_nulmeting add column listing_id uuid references listings(id) on delete cascade;

-- Backfill: koppel elke bestaande rij aan de (op aangemaakt_op gesorteerd) eerste woning
-- van die klant. Bij klanten met precies 1 woning is dit correct en definitief. Bij
-- klanten met meerdere woningen komt de bestaande set cijfers op de eerste woning terecht
-- — welke woning de bestaande cijfers oorspronkelijk betroffen is niet uit de data af te
-- leiden, dus die moeten dan handmatig herverdeeld worden over de andere woningen.
-- Als een klant met een bestaande funnel-rij inmiddels 0 woningen heeft, blijft
-- listing_id null en faalt de "set not null" hieronder met een duidelijke foutmelding —
-- dat orphaned geval moet dan handmatig opgelost worden (rij verwijderen of eerst een
-- woning aanmaken) voordat deze migratie verder kan.
update airbnb_funnel_nulmeting f
set listing_id = (
  select l.id from listings l
  where l.client_id = f.client_id
  order by l.aangemaakt_op asc
  limit 1
);

alter table airbnb_funnel_nulmeting alter column listing_id set not null;
alter table airbnb_funnel_nulmeting add constraint airbnb_funnel_nulmeting_listing_id_key unique (listing_id);

drop policy "klant leest eigen airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting;
create policy "klant leest eigen airbnb_funnel_nulmeting" on airbnb_funnel_nulmeting
  for select using (listing_id in (select id from listings where client_id = current_client_id()));

alter table airbnb_funnel_nulmeting drop constraint airbnb_funnel_nulmeting_client_id_fkey;
alter table airbnb_funnel_nulmeting drop constraint airbnb_funnel_nulmeting_client_id_key;
alter table airbnb_funnel_nulmeting drop column client_id;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: output lists `20260812180000_voortgang_per_woning.sql` as applied, no errors. (If Docker/Supabase isn't running, `open -a Docker`, wait for it to be ready, then `npx supabase start`.)

If the migration fails on `alter table airbnb_funnel_nulmeting alter column listing_id set not null` with a "null value in column listing_id" error, it means the local dev database has an orphaned `airbnb_funnel_nulmeting` row for a client with zero listings (likely leftover test data). Find it with `select * from airbnb_funnel_nulmeting where client_id not in (select distinct client_id from listings);` via `docker exec supabase_db_dfy-dashboard psql -U postgres -d postgres -c "..."` and delete that row, then re-run the migration.

- [ ] **Step 3: Regenerate database types**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

The `2>/dev/null` must come before the `>` redirect — otherwise CLI status text corrupts the output file. Verify `src/types/database.ts` now has a `listing_id` field on `voortgang_checklist_items`, `voortgang_todos`, `voortgang_activiteitenlog`, and `airbnb_funnel_nulmeting` (and no more `client_id` field on `airbnb_funnel_nulmeting`) via `grep -A 30 "airbnb_funnel_nulmeting: {" src/types/database.ts | head -40`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260812180000_voortgang_per_woning.sql src/types/database.ts
git commit -m "feat: listing_id-kolommen voor voortgang per woning + airbnb_funnel_nulmeting per listing"
```

---

### Task 2: Optional `listingId` on the four "algemeen of per woning" actions

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/checklist-items.test.ts`
- Test: `tests/integration/todo-acties.test.ts`
- Test: `tests/integration/activiteitenlog.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this test case to `tests/integration/checklist-items.test.ts`, inside the existing `describe('voegChecklistItemToe', ...)` block (after the `'weigert een lege naam'` test):

```typescript
  it('slaat listingId op als die is meegegeven, en laat het veld leeg (algemeen) als die ontbreekt', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Checklist-test woning' })
      .select()
      .single();

    await voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Item voor specifieke woning', listingId: listing!.id });
    await voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Algemeen item' });

    const { data: items } = await admin
      .from('voortgang_checklist_items')
      .select('naam, listing_id')
      .eq('client_id', clientId)
      .in('naam', ['Item voor specifieke woning', 'Algemeen item']);

    const specifiek = items!.find((i) => i.naam === 'Item voor specifieke woning');
    const algemeen = items!.find((i) => i.naam === 'Algemeen item');
    expect(specifiek!.listing_id).toBe(listing!.id);
    expect(algemeen!.listing_id).toBeNull();
  });
```

Add this test case to `tests/integration/todo-acties.test.ts`, inside the existing `describe('voegTodoToe', ...)` block (after the `'geeft een foutmelding als de notificatie faalt...'` test):

```typescript
  it('slaat listingId op als die is meegegeven, en laat het veld leeg (algemeen) als die ontbreekt', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    vi.mocked(sendTodoNotificatie).mockClear();

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Todo-test woning' })
      .select()
      .single();

    await voegTodoToe({ clientId, naam: 'Taak voor specifieke woning', deadline: '2026-09-05', listingId: listing!.id });
    await voegTodoToe({ clientId, naam: 'Algemene taak', deadline: '2026-09-05' });

    const { data: todos } = await admin
      .from('voortgang_todos')
      .select('naam, listing_id')
      .eq('client_id', clientId)
      .in('naam', ['Taak voor specifieke woning', 'Algemene taak']);

    const specifiek = todos!.find((t) => t.naam === 'Taak voor specifieke woning');
    const algemeen = todos!.find((t) => t.naam === 'Algemene taak');
    expect(specifiek!.listing_id).toBe(listing!.id);
    expect(algemeen!.listing_id).toBeNull();
  });
```

Add this test case to the `describe('wijzigTodo en verwijderTodo', ...)` block in the same file (after the `'wijzigt naam en deadline'` test):

```typescript
  it('wijzigt het listingId-label van een to-do', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Taak om te herlabelen', deadline: '2026-09-11' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Taak om te herlabelen')
      .single();

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Herlabel-test woning' })
      .select()
      .single();

    await wijzigTodo({ clientId, todoId: todo!.id, naam: 'Taak om te herlabelen', deadline: '2026-09-11', listingId: listing!.id });

    const { data: todoNa } = await admin.from('voortgang_todos').select('listing_id').eq('id', todo!.id).single();
    expect(todoNa!.listing_id).toBe(listing!.id);
  });
```

Add this test case to `tests/integration/activiteitenlog.test.ts`, inside the existing `describe('voegActiviteitToe', ...)` block (after the `'maakt de activiteit aan...'` test):

```typescript
  it('slaat listingId op als die is meegegeven, en laat het veld leeg (algemeen) als die ontbreekt', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Activiteit-test woning' })
      .select()
      .single();

    await voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Regel voor specifieke woning', listingId: listing!.id });
    await voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Algemene regel' });

    const { data: activiteiten } = await admin
      .from('voortgang_activiteitenlog')
      .select('omschrijving, listing_id')
      .eq('client_id', clientId)
      .in('omschrijving', ['Regel voor specifieke woning', 'Algemene regel']);

    const specifiek = activiteiten!.find((a) => a.omschrijving === 'Regel voor specifieke woning');
    const algemeen = activiteiten!.find((a) => a.omschrijving === 'Algemene regel');
    expect(specifiek!.listing_id).toBe(listing!.id);
    expect(algemeen!.listing_id).toBeNull();
  });
```

Add this test case to the `describe('automatisch loggen via triggers', ...)` block in the same file (after the last existing test):

```typescript
  it('logt een afgevinkt checklist-item met de listing_id van dat item', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Trigger-listing-test woning' })
      .select()
      .single();

    await voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Item met woning-label', listingId: listing!.id });
    const { data: item } = await admin
      .from('voortgang_checklist_items')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Item met woning-label')
      .single();

    await vinkChecklistItemAf({ clientId, itemId: item!.id, faseNummer: 1, afgevinkt: true });

    const { data: log } = await admin
      .from('voortgang_activiteitenlog')
      .select('listing_id')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Checklist-item afgevinkt: Item met woning-label')
      .single();
    expect(log!.listing_id).toBe(listing!.id);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/integration/checklist-items.test.ts tests/integration/todo-acties.test.ts tests/integration/activiteitenlog.test.ts`
Expected: FAIL — the new tests fail because `listingId` isn't accepted/persisted yet by `voegChecklistItemToe`, `voegTodoToe`, `wijzigTodo`, and `voegActiviteitToe` (TypeScript itself may already reject the extra `listingId` property depending on how strict the object literal check is — either a type error or a runtime assertion failure is an acceptable "fails for the right reason" here).

- [ ] **Step 3: Implement the `listingId` parameter on the four actions**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, change `voegChecklistItemToe` from:

```typescript
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
```

to:

```typescript
export async function voegChecklistItemToe(input: {
  clientId: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
  listingId?: string | null;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('voortgang_checklist_items').insert({
    client_id: input.clientId,
    fase_nummer: input.faseNummer,
    naam: input.naam.trim(),
    listing_id: input.listingId ?? null,
    toegevoegd_door: user?.id,
  });
  if (error) throw new Error(error.message);

  await herberekenFasePercentage(supabase, input.clientId, input.faseNummer);
  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

Change `voegTodoToe` from:

```typescript
export async function voegTodoToe(input: {
  clientId: string;
  naam: string;
  deadline: string;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.deadline) throw new Error('Deadline is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('voortgang_todos').insert({
    client_id: input.clientId,
    naam: input.naam.trim(),
    deadline: input.deadline,
    toegevoegd_door: user?.id,
  });
  if (error) throw new Error(error.message);
```

to:

```typescript
export async function voegTodoToe(input: {
  clientId: string;
  naam: string;
  deadline: string;
  listingId?: string | null;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.deadline) throw new Error('Deadline is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('voortgang_todos').insert({
    client_id: input.clientId,
    naam: input.naam.trim(),
    deadline: input.deadline,
    listing_id: input.listingId ?? null,
    toegevoegd_door: user?.id,
  });
  if (error) throw new Error(error.message);
```

(the rest of `voegTodoToe`, from `const { data: klant, ...` onward, stays unchanged).

Change `wijzigTodo` from:

```typescript
export async function wijzigTodo(input: {
  clientId: string;
  todoId: string;
  naam: string;
  deadline: string;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.deadline) throw new Error('Deadline is verplicht.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('voortgang_todos')
    .update({ naam: input.naam.trim(), deadline: input.deadline })
    .eq('id', input.todoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

to:

```typescript
export async function wijzigTodo(input: {
  clientId: string;
  todoId: string;
  naam: string;
  deadline: string;
  listingId?: string | null;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.deadline) throw new Error('Deadline is verplicht.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('voortgang_todos')
    .update({ naam: input.naam.trim(), deadline: input.deadline, listing_id: input.listingId ?? null })
    .eq('id', input.todoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

Change `voegActiviteitToe` from:

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

to:

```typescript
export async function voegActiviteitToe(input: {
  clientId: string;
  datum: string;
  omschrijving: string;
  listingId?: string | null;
}) {
  await assertIsAdmin();
  if (!input.omschrijving.trim()) throw new Error('Omschrijving is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('voortgang_activiteitenlog').insert({
    client_id: input.clientId,
    datum: input.datum,
    omschrijving: input.omschrijving.trim(),
    listing_id: input.listingId ?? null,
    toegevoegd_door: user?.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/integration/checklist-items.test.ts tests/integration/todo-acties.test.ts tests/integration/activiteitenlog.test.ts`
Expected: PASS — all tests in all three files, including the new ones.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/checklist-items.test.ts tests/integration/todo-acties.test.ts tests/integration/activiteitenlog.test.ts
git commit -m "feat: optioneel listingId-label op checklist-items, to-do's en activiteitenlog"
```

---

### Task 3: `werkAirbnbFunnelNulmetingBij` moves from `clientId` to `listingId`

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts` (full rewrite — the `clientId`-based upsert target no longer exists after Task 1's migration)

This is a breaking signature change (`clientId` → `listingId`, `clientId` still present for `revalidatePath` but no longer identifies the row being upserted) — the entire existing test file needs rewriting, not just an addition.

- [ ] **Step 1: Replace the full contents of the test file**

Replace the full contents of `tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts` with:

```typescript
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
let listingAId: string;
let listingBId: string;
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

  const { data: listingA } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Funnel Klant Woning A' })
    .select()
    .single();
  listingAId = listingA!.id;

  const { data: listingB } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Funnel Klant Woning B' })
    .select()
    .single();
  listingBId = listingB!.id;

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
        listingId: listingAId,
        gemiddeldConversiepercentage: 5,
        percentageZoekvertoningenEerstePagina: 10,
        conversieZoekopdrachtNaarAdvertentie: 15,
        conversieAdvertentieNaarBoeking: 20,
        nulmetingDatum: '2026-08-01',
      })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('maakt een nieuwe rij aan voor de woning en werkt die daarna bij i.p.v. te dupliceren', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      listingId: listingAId,
      gemiddeldConversiepercentage: 5.5,
      percentageZoekvertoningenEerstePagina: 10.25,
      conversieZoekopdrachtNaarAdvertentie: 15,
      conversieAdvertentieNaarBoeking: 20,
      nulmetingDatum: '2026-08-01',
    });

    const { data: rij1 } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('listing_id', listingAId)
      .single();
    expect(rij1!.gemiddeld_conversiepercentage).toBe(5.5);
    expect(rij1!.nulmeting_datum).toBe('2026-08-01');

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      listingId: listingAId,
      gemiddeldConversiepercentage: 6,
      percentageZoekvertoningenEerstePagina: 10.25,
      conversieZoekopdrachtNaarAdvertentie: 15,
      conversieAdvertentieNaarBoeking: 20,
      nulmetingDatum: '2026-08-01',
    });

    const { data: rijen } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('listing_id', listingAId);
    expect(rijen).toHaveLength(1);
    expect(rijen![0].gemiddeld_conversiepercentage).toBe(6);
  });

  it('houdt de funnel-cijfers van twee woningen van dezelfde klant volledig onafhankelijk van elkaar', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      listingId: listingAId,
      gemiddeldConversiepercentage: 10,
      percentageZoekvertoningenEerstePagina: 10,
      conversieZoekopdrachtNaarAdvertentie: 10,
      conversieAdvertentieNaarBoeking: 10,
      nulmetingDatum: '2026-08-01',
    });
    await werkAirbnbFunnelNulmetingBij({
      clientId,
      listingId: listingBId,
      gemiddeldConversiepercentage: 20,
      percentageZoekvertoningenEerstePagina: 20,
      conversieZoekopdrachtNaarAdvertentie: 20,
      conversieAdvertentieNaarBoeking: 20,
      nulmetingDatum: '2026-08-02',
    });

    const { data: rijA } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('gemiddeld_conversiepercentage')
      .eq('listing_id', listingAId)
      .single();
    expect(rijA!.gemiddeld_conversiepercentage).toBe(10);

    const { data: rijB } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('gemiddeld_conversiepercentage')
      .eq('listing_id', listingBId)
      .single();
    expect(rijB!.gemiddeld_conversiepercentage).toBe(20);
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
      listingId: listingAId,
      gemiddeldConversiepercentage: 8,
      percentageZoekvertoningenEerstePagina: 12,
      conversieZoekopdrachtNaarAdvertentie: 18,
      conversieAdvertentieNaarBoeking: 22,
      nulmetingDatum: '2026-08-01',
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

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts`
Expected: FAIL — `werkAirbnbFunnelNulmetingBij` doesn't accept/use `listingId` yet, so the upserts still target the (now-removed) `client_id` column.

- [ ] **Step 3: Implement the `listingId` parameter**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, change `werkAirbnbFunnelNulmetingBij` from:

```typescript
export async function werkAirbnbFunnelNulmetingBij(input: {
  clientId: string;
  gemiddeldConversiepercentage: number | null;
  percentageZoekvertoningenEerstePagina: number | null;
  conversieZoekopdrachtNaarAdvertentie: number | null;
  conversieAdvertentieNaarBoeking: number | null;
  nulmetingDatum: string | null;
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
        nulmeting_datum: input.nulmetingDatum,
      },
      { onConflict: 'client_id' }
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

to:

```typescript
export async function werkAirbnbFunnelNulmetingBij(input: {
  clientId: string;
  listingId: string;
  gemiddeldConversiepercentage: number | null;
  percentageZoekvertoningenEerstePagina: number | null;
  conversieZoekopdrachtNaarAdvertentie: number | null;
  conversieAdvertentieNaarBoeking: number | null;
  nulmetingDatum: string | null;
}) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from('airbnb_funnel_nulmeting')
    .upsert(
      {
        listing_id: input.listingId,
        gemiddeld_conversiepercentage: input.gemiddeldConversiepercentage,
        percentage_zoekvertoningen_eerste_pagina: input.percentageZoekvertoningenEerstePagina,
        conversie_zoekopdracht_naar_advertentie: input.conversieZoekopdrachtNaarAdvertentie,
        conversie_advertentie_naar_boeking: input.conversieAdvertentieNaarBoeking,
        nulmeting_datum: input.nulmetingDatum,
      },
      { onConflict: 'listing_id' }
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

`clientId` stays in the input purely to build the `revalidatePath` target (the client-level Voortgang page) — the row being upserted is now identified entirely by `listingId`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Note the now-unused import in the existing `AirbnbFunnelNulmeting` component and page usage**

Do NOT fix this yet — `src/components/portal/airbnb-funnel-nulmeting.tsx` still calls `werkAirbnbFunnelNulmetingBij({ clientId, ...invoer, nulmetingDatum })` without a `listingId`, which will now fail TypeScript compilation (`listingId` is a required field). This is expected and intentional: this plan is backend-only, and the component update is deliberately deferred to the follow-up frontend plan. Confirm this is the ONLY build error by running `npm run build` and checking that the failure is exactly this one call site and not something else.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/werk-airbnb-funnel-nulmeting-bij.test.ts
git commit -m "feat: werkAirbnbFunnelNulmetingBij wordt listing-gescoopt i.p.v. client-gescoopt"
```

---

### Task 4: RLS boundary test for the new listing-scoped `airbnb_funnel_nulmeting`

**Files:**
- Modify: `tests/integration/rls.test.ts`

This mirrors the pattern already used in this file for `pricelabs_listings_cache` (a listing-adjacent, klant-isolated table) — proving a klant can only read `airbnb_funnel_nulmeting` rows for their own listings, not another client's.

- [ ] **Step 1: Add a new test case**

Add this test case to the existing `describe('RLS: klant-isolatie', ...)` block in `tests/integration/rls.test.ts`, anywhere after the existing `klantBListingId`-dependent tests (reuses the file's existing `clientAId`, `klantBListingId`, `klantBEmail`, `klantBWachtwoord` fixtures — no new setup needed, but this test creates its own two funnel rows directly via the `admin` service-role client since `airbnb_funnel_nulmeting` isn't part of this file's existing fixture data):

```typescript
  it('klant B leest alleen de airbnb_funnel_nulmeting van de eigen woning, niet van klant A', async () => {
    const { data: funnelA } = await admin
      .from('airbnb_funnel_nulmeting')
      .insert({ listing_id: klantAListingId, gemiddeld_conversiepercentage: 5 })
      .select()
      .single();
    const { data: funnelB } = await admin
      .from('airbnb_funnel_nulmeting')
      .insert({ listing_id: klantBListingId, gemiddeld_conversiepercentage: 15 })
      .select()
      .single();

    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const eigen = await klantClient
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('listing_id', klantBListingId);
    expect(eigen.data).toHaveLength(1);
    expect(eigen.data![0].gemiddeld_conversiepercentage).toBe(15);

    const ander = await klantClient
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('listing_id', klantAListingId);
    expect(ander.data).toEqual([]);

    await admin.from('airbnb_funnel_nulmeting').delete().eq('id', funnelA!.id);
    await admin.from('airbnb_funnel_nulmeting').delete().eq('id', funnelB!.id);
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/integration/rls.test.ts`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls.test.ts
git commit -m "test: RLS-grenstest voor listing-gescoopte airbnb_funnel_nulmeting"
```

---

### Task 5: Full verification (build failure expected — do not fix it in this plan)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass. Previous total was 155; this plan adds 5 to `checklist-items.test.ts`/`todo-acties.test.ts`/`activiteitenlog.test.ts` combined (1 + 1 + 1 + 1 + 1), keeps `werk-airbnb-funnel-nulmeting-bij.test.ts` at 5 (rewritten, was 3), and adds 1 to `rls.test.ts` — expect roughly 155 + 5 + 2 + 1 = 163 (exact count isn't critical; what matters is zero failures).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors beyond the two pre-existing, unrelated ones (`src/app/auth/confirm/page.tsx`, the gitignored `supabase/.temp/` directory).

- [ ] **Step 3: Run build — EXPECT ONE FAILURE, do not fix it here**

Run: `npm run build`
Expected: FAILS with a TypeScript error in `src/components/portal/airbnb-funnel-nulmeting.tsx`, because that component's call to `werkAirbnbFunnelNulmetingBij` is now missing the required `listingId` field. **This is the expected, deliberate boundary between this backend plan and the follow-up frontend plan — do not fix it here.** Confirm the error is exactly this one call site (and not some other, unrelated break) and stop.

- [ ] **Step 4: Commit is already done per-task; push to `main`**

```bash
git push origin main
```

Railway auto-deploys on push to `main`. **Important:** since `npm run build` currently fails (Step 3), the Railway deploy of this push will also fail — this is expected and acceptable only if the follow-up frontend plan is implemented and pushed immediately afterward in the same session, so the broken build window is momentary. Do not leave `main` in this state for longer than it takes to implement the next plan.

- [ ] **Step 5: Give the user the migration SQL for production**

Since there is no production Supabase CLI/credentials access in this environment, paste the full contents of `supabase/migrations/20260812180000_voortgang_per_woning.sql` for the user to run manually via the Supabase Dashboard SQL Editor — but explicitly tell them to **wait to run it until the follow-up frontend plan's code has also been pushed and deployed**, since the currently-deployed frontend code (before the frontend plan lands) still references `airbnb_funnel_nulmeting.client_id`, which this migration removes. Applying the migration before the frontend update ships would break the currently-live Airbnb-funnel section of the Voortgang page in production.
