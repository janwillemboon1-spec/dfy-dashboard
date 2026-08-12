# Klant Instellingen-pagina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the klant Instellingen-pagina placeholder with a "Contactgegevens" section where the klant can view/edit their account name and phone number (email stays read-only).

**Architecture:** A new RLS update-policy lets a klant update only their own `clients` row. A new server action `wijzigEigenClientGegevens` (in the existing klant-scoped `dashboard/actions.ts`, matching that file's result-object convention rather than the admin actions file's throw convention) writes `naam`/`telefoon` only — never `email`/`status`. A small client component renders the form; the page wires it together.

**Tech Stack:** Next.js App Router, Supabase Postgres (RLS), Vitest integration tests against local Supabase.

**Reference:** Spec at `docs/superpowers/specs/2026-08-12-klant-instellingen-pagina-design.md`.

---

### Task 1: Migration — klant update-policy on `clients`

**Files:**
- Create: `supabase/migrations/20260812160000_clients_klant_update.sql`

- [ ] **Step 1: Write the migration**

```sql
create policy "klant wijzigt eigen client" on clients
  for update using (id = current_client_id()) with check (id = current_client_id());
```

The `grant update on clients to anon, authenticated, service_role` already exists (from `supabase/migrations/20260804102114_rls_and_functions.sql`) — this migration only adds the missing RLS policy that currently blocks all klant updates (klant only has a select policy on `clients` today).

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: output lists `20260812160000_clients_klant_update.sql` as applied, no errors. (If Docker/Supabase isn't running, `open -a Docker`, wait for it to be ready, then `npx supabase start`.)

- [ ] **Step 3: Regenerate database types**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

The `2>/dev/null` must come before the `>` redirect — otherwise CLI status text corrupts the output file. This migration doesn't change any table shape (only a policy), so the diff in `src/types/database.ts` should be empty or near-empty — that's expected, run the regen anyway for consistency with how every other migration in this project has been handled.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260812160000_clients_klant_update.sql src/types/database.ts
git commit -m "feat: klant mag eigen client-rij wijzigen (RLS-policy)"
```

---

### Task 2: `wijzigEigenClientGegevens` server action + tests

**Files:**
- Modify: `src/app/[locale]/dashboard/actions.ts` (append after `syncEigenListings`)
- Test: `tests/integration/wijzig-eigen-client-gegevens.test.ts` (new)
- Test: `tests/integration/rls.test.ts` (add one test case to the existing `describe('RLS: klant-isolatie')` block)

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/wijzig-eigen-client-gegevens.test.ts`:

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

const { wijzigEigenClientGegevens } = await import('@/app/[locale]/dashboard/actions');

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
let klantEmail: string;
let klantUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  klantEmail = `contactgegevens-klant-${suffix}@test.local`;
  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Oude Naam', email: klantEmail, telefoon: '0600000000' })
    .select()
    .single();
  clientId = client!.id;

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
  await admin.auth.admin.deleteUser(klantUserId);
});

describe('wijzigEigenClientGegevens', () => {
  it('weigert een lege naam', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenClientGegevens({ naam: '   ', telefoon: '0611111111' });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Naam is verplicht.');
  });

  it('wijzigt de naam en het telefoonnummer van de eigen client', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenClientGegevens({ naam: 'Nieuwe Naam', telefoon: '0622222222' });
    expect(resultaat.succes).toBe(true);

    const { data: clientNa } = await admin.from('clients').select('naam, telefoon').eq('id', clientId).single();
    expect(clientNa!.naam).toBe('Nieuwe Naam');
    expect(clientNa!.telefoon).toBe('0622222222');
  });

  it('staat een leeg telefoonnummer toe (optioneel veld)', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenClientGegevens({ naam: 'Weer Een Naam', telefoon: null });
    expect(resultaat.succes).toBe(true);

    const { data: clientNa } = await admin.from('clients').select('telefoon').eq('id', clientId).single();
    expect(clientNa!.telefoon).toBeNull();
  });
});
```

Then add one test case to the existing `describe('RLS: klant-isolatie')` block in `tests/integration/rls.test.ts`, directly after the existing `it('klant B kan client A niet zien', ...)` test (same file, same `describe`, reusing the already-provisioned `clientAId`/`klantBEmail`/`klantBWachtwoord` fixtures from that file's `beforeAll` — no new setup needed):

```typescript
  it('klant B kan de gegevens van client A niet wijzigen', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    await klantClient.from('clients').update({ naam: 'Gehackt' }).eq('id', clientAId);

    const { data } = await admin.from('clients').select('naam').eq('id', clientAId).single();
    expect(data!.naam).toBe('Klant A');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/integration/wijzig-eigen-client-gegevens.test.ts tests/integration/rls.test.ts`
Expected: the new `wijzig-eigen-client-gegevens.test.ts` file FAILs on all 3 tests (`wijzigEigenClientGegevens` is not exported from `actions.ts` yet). The new case added to `rls.test.ts` ("klant B kan de gegevens van client A niet wijzigen") is expected to PASS immediately, even before Step 3's implementation — it doesn't exercise the new action at all, only RLS's default-deny behavior (Task 1's policy, already applied, still requires `id = current_client_id()`, which klant B's session never satisfies for client A's row). That test is a permanent regression guard against a future overly-permissive policy change, not a red/green step for this task's own implementation.

- [ ] **Step 3: Implement `wijzigEigenClientGegevens`**

Append to `src/app/[locale]/dashboard/actions.ts` (after `syncEigenListings`, at the end of the file):

```typescript
export async function wijzigEigenClientGegevens(input: {
  naam: string;
  telefoon: string | null;
}): Promise<{ succes: boolean; fout?: string }> {
  if (!input.naam.trim()) return { succes: false, fout: 'Naam is verplicht.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { succes: false, fout: 'Niet ingelogd.' };

  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user.id).maybeSingle();
  if (!profile?.client_id) return { succes: false, fout: 'Geen account gevonden.' };

  const { error } = await supabase
    .from('clients')
    .update({ naam: input.naam.trim(), telefoon: input.telefoon })
    .eq('id', profile.client_id);
  if (error) return { succes: false, fout: error.message };

  revalidatePath('/dashboard/instellingen');
  return { succes: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/integration/wijzig-eigen-client-gegevens.test.ts tests/integration/rls.test.ts`
Expected: PASS — all 3 tests in the new file, and all tests (including the new one) in `rls.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/dashboard/actions.ts" tests/integration/wijzig-eigen-client-gegevens.test.ts tests/integration/rls.test.ts
git commit -m "feat: wijzigEigenClientGegevens server-actie + tests"
```

---

### Task 3: `ContactgegevensFormulier` component

**Files:**
- Create: `src/components/dashboard/contactgegevens-formulier.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { wijzigEigenClientGegevens } from '@/app/[locale]/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ContactgegevensFormulier({
  naam: initieleNaam,
  telefoon: initieelTelefoon,
  email,
}: {
  naam: string;
  telefoon: string | null;
  email: string;
}) {
  const [naam, setNaam] = useState(initieleNaam);
  const [telefoon, setTelefoon] = useState(initieelTelefoon ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    setOpgeslagen(false);
    startTransition(async () => {
      const resultaat = await wijzigEigenClientGegevens({ naam, telefoon: telefoon || null });
      if (!resultaat.succes) {
        setFoutmelding(resultaat.fout ?? 'Onbekende fout bij opslaan.');
        return;
      }
      setOpgeslagen(true);
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <Label htmlFor="contactgegevens-naam">Naam</Label>
        <Input id="contactgegevens-naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="contactgegevens-telefoon">Telefoonnummer</Label>
        <Input id="contactgegevens-telefoon" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="contactgegevens-email">E-mailadres</Label>
        <Input id="contactgegevens-email" value={email} disabled />
      </div>
      <Button onClick={opslaan} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Opslaan'}
      </Button>
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
      {opgeslagen && !foutmelding && <p className="text-sm text-muted-foreground">Opgeslagen.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully (the component has no importers yet — that's expected, Task 4 wires it up).

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/contactgegevens-formulier.tsx
git commit -m "feat: ContactgegevensFormulier voor klant-Instellingenpagina"
```

---

### Task 4: Wire the klant Instellingen page

**Files:**
- Modify: `src/app/[locale]/dashboard/instellingen/page.tsx`

- [ ] **Step 1: Replace the placeholder with real content**

Replace the full contents of `src/app/[locale]/dashboard/instellingen/page.tsx` (currently just a placeholder with "Deze sectie is binnenkort beschikbaar.") with:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContactgegevensFormulier } from '@/components/dashboard/contactgegevens-formulier';

// Geen expliciet client_id-filter nodig op de query hieronder: de "klant leest eigen
// client"-RLS-policy (id = current_client_id()) scopet dit al af tot precies de klant van de
// ingelogde gebruiker. Dit klopt alleen voor een klant-sessie — dashboard/layout.tsx redirect
// een admin-sessie al weg vóórdat deze pagina rendert.
export default async function InstellingenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: client } = await supabase.from('clients').select('naam, telefoon, email').maybeSingle();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Instellingen</h1>
      <div className="mt-10">
        <h2 className="font-serif text-xl">Contactgegevens</h2>
        <div className="mt-4">
          <ContactgegevensFormulier
            naam={client?.naam ?? ''}
            telefoon={client?.telefoon ?? null}
            email={client?.email ?? ''}
          />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/instellingen/page.tsx"
git commit -m "feat: klant-Instellingenpagina toont Contactgegevens-formulier"
```

---

### Task 5: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (previous total was 147; this plan adds 3 in the new test file plus 1 in `rls.test.ts` — expect 151).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors (the two pre-existing, unrelated lint issues in `src/app/auth/confirm/page.tsx` and the gitignored `supabase/.temp/` directory are not part of this change).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and, as a klant session, open `/dashboard/instellingen`:
- Confirm the current naam/telefoon/email show correctly.
- Change the naam and telefoon, save, and confirm the "Opgeslagen." message appears.
- Refresh the page and confirm the new values persist.
- Confirm the e-mailveld cannot be edited.
- Confirm an admin session viewing this same klant's data elsewhere (e.g. the admin klantenlijst, or the to-do e-mail greeting) reflects the updated naam after the change.

- [ ] **Step 5: Push to `main`**

```bash
git push origin main
```

Railway auto-deploys on push to `main`.

- [ ] **Step 6: Give the user the migration SQL for production**

Since there is no production Supabase CLI/credentials access in this environment, paste the full contents of `supabase/migrations/20260812160000_clients_klant_update.sql` for the user to run manually via the Supabase Dashboard SQL Editor, exactly as done for every prior migration.
