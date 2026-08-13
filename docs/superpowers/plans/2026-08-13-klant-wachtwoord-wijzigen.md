# Wachtwoord wijzigen (klantportaal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in klant change their own password from `/dashboard/instellingen`, without needing the existing "forgot password" e-mail-link flow.

**Architecture:** A new server action (`wijzigEigenWachtwoord`) re-verifies the current password via `supabase.auth.signInWithPassword`, then applies the change via `supabase.auth.updateUser`. A new client-component form (`WachtwoordFormulier`) collects the three fields and calls the action, following the exact same pattern as the existing `ContactgegevensFormulier`/`wijzigEigenClientGegevens` pair on the same page.

**Tech Stack:** Next.js Server Actions, Supabase Auth (`@supabase/ssr`), Vitest integration tests against a local Supabase instance.

**Reference:** Spec at `docs/superpowers/specs/2026-08-13-klant-wachtwoord-wijzigen-design.md`. Klant portal only — no admin-side change.

---

### Task 1: `wijzigEigenWachtwoord` server action

**Files:**
- Modify: `src/app/[locale]/dashboard/actions.ts`
- Create: `tests/integration/wijzig-eigen-wachtwoord.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/wijzig-eigen-wachtwoord.test.ts`:

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

const { wijzigEigenWachtwoord } = await import('@/app/[locale]/dashboard/actions');

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

  klantEmail = `wachtwoord-klant-${suffix}@test.local`;
  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Wachtwoord Klant', email: klantEmail })
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

describe('wijzigEigenWachtwoord', () => {
  it('weigert een te kort nieuw wachtwoord', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenWachtwoord({ huidigWachtwoord: wachtwoord, nieuwWachtwoord: 'kort' });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Nieuw wachtwoord moet minimaal 6 tekens zijn.');
  });

  it('weigert een niet-ingelogde aanroep', async () => {
    activeCookieStore = new Map();
    const resultaat = await wijzigEigenWachtwoord({
      huidigWachtwoord: wachtwoord,
      nieuwWachtwoord: 'nieuw-wachtwoord-1234',
    });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Niet ingelogd.');
  });

  it('weigert een onjuist huidig wachtwoord', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenWachtwoord({
      huidigWachtwoord: 'helemaal-het-verkeerde-wachtwoord',
      nieuwWachtwoord: 'nieuw-wachtwoord-1234',
    });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Huidig wachtwoord is onjuist.');
  });

  it('wijzigt het wachtwoord bij een juist huidig wachtwoord + geldig nieuw wachtwoord, en staat vanaf dan alleen nog het nieuwe wachtwoord toe', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const nieuwWachtwoord = 'gloednieuw-wachtwoord-5678';

    const resultaat = await wijzigEigenWachtwoord({ huidigWachtwoord: wachtwoord, nieuwWachtwoord });
    expect(resultaat.succes).toBe(true);

    await expect(loginAlsCookieStore(klantEmail, nieuwWachtwoord)).resolves.toBeDefined();
    await expect(loginAlsCookieStore(klantEmail, wachtwoord)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/integration/wijzig-eigen-wachtwoord.test.ts`
Expected: FAIL with `wijzigEigenWachtwoord is not a function` (or similar) — the export doesn't exist yet.

- [ ] **Step 3: Add the server action**

In `src/app/[locale]/dashboard/actions.ts`, add this function after `wijzigEigenClientGegevens`:

```typescript
export async function wijzigEigenWachtwoord(input: {
  huidigWachtwoord: string;
  nieuwWachtwoord: string;
}): Promise<{ succes: boolean; fout?: string }> {
  if (input.nieuwWachtwoord.length < 6) {
    return { succes: false, fout: 'Nieuw wachtwoord moet minimaal 6 tekens zijn.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { succes: false, fout: 'Niet ingelogd.' };

  // Supabase's updateUser-API vereist zelf geen herbevestiging van het huidige
  // wachtwoord (alleen een actieve sessie) — deze aparte signInWithPassword-stap is er
  // bewust bij, zodat iemand met tijdelijke toegang tot een ontgrendelde/ingelogde
  // sessie (bv. een gedeelde computer) het wachtwoord niet kan overnemen zonder het
  // huidige wachtwoord te kennen.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: input.huidigWachtwoord,
  });
  if (reauthError) return { succes: false, fout: 'Huidig wachtwoord is onjuist.' };

  const { error: updateError } = await supabase.auth.updateUser({ password: input.nieuwWachtwoord });
  if (updateError) return { succes: false, fout: updateError.message };

  return { succes: true };
}
```

No `revalidatePath` call: unlike `wijzigEigenClientGegevens` (which changes data shown on the same server-rendered page), a password change doesn't affect anything rendered on `/dashboard/instellingen`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/integration/wijzig-eigen-wachtwoord.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/dashboard/actions.ts tests/integration/wijzig-eigen-wachtwoord.test.ts
git commit -m "feat: server action wijzigEigenWachtwoord voor klant-zelfbediening"
```

---

### Task 2: `WachtwoordFormulier` component

**Files:**
- Create: `src/components/dashboard/wachtwoord-formulier.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/wachtwoord-formulier.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { wijzigEigenWachtwoord } from '@/app/[locale]/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function WachtwoordFormulier() {
  const [huidigWachtwoord, setHuidigWachtwoord] = useState('');
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState('');
  const [bevestiging, setBevestiging] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    setOpgeslagen(false);
    if (nieuwWachtwoord !== bevestiging) {
      setFoutmelding('De wachtwoorden komen niet overeen.');
      return;
    }
    startTransition(async () => {
      const resultaat = await wijzigEigenWachtwoord({ huidigWachtwoord, nieuwWachtwoord });
      if (!resultaat.succes) {
        setFoutmelding(resultaat.fout ?? 'Onbekende fout bij opslaan.');
        return;
      }
      // Wachtwoordvelden mogen na een geslaagde submit nooit blijven staan — anders dan
      // ContactgegevensFormulier, dat de opgeslagen waarden juist laat staan.
      setHuidigWachtwoord('');
      setNieuwWachtwoord('');
      setBevestiging('');
      setOpgeslagen(true);
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <Label htmlFor="wachtwoord-huidig">Huidig wachtwoord</Label>
        <Input
          id="wachtwoord-huidig"
          type="password"
          autoComplete="current-password"
          value={huidigWachtwoord}
          onChange={(e) => setHuidigWachtwoord(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="wachtwoord-nieuw">Nieuw wachtwoord</Label>
        <Input
          id="wachtwoord-nieuw"
          type="password"
          autoComplete="new-password"
          value={nieuwWachtwoord}
          onChange={(e) => setNieuwWachtwoord(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="wachtwoord-bevestiging">Bevestig nieuw wachtwoord</Label>
        <Input
          id="wachtwoord-bevestiging"
          type="password"
          autoComplete="new-password"
          value={bevestiging}
          onChange={(e) => setBevestiging(e.target.value)}
        />
      </div>
      <Button onClick={opslaan} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Wachtwoord wijzigen'}
      </Button>
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
      {opgeslagen && !foutmelding && <p className="text-sm text-muted-foreground">Wachtwoord gewijzigd.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully — this is a new, currently-unused file (nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/wachtwoord-formulier.tsx
git commit -m "feat: WachtwoordFormulier-component"
```

---

### Task 3: Wire `WachtwoordFormulier` into the Instellingen page

**Files:**
- Modify: `src/app/[locale]/dashboard/instellingen/page.tsx`

- [ ] **Step 1: Replace the full contents of the file**

Replace the full contents of `src/app/[locale]/dashboard/instellingen/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContactgegevensFormulier } from '@/components/dashboard/contactgegevens-formulier';
import { WachtwoordFormulier } from '@/components/dashboard/wachtwoord-formulier';

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
      <div className="mt-10">
        <h2 className="font-serif text-xl">Wachtwoord</h2>
        <div className="mt-4">
          <WachtwoordFormulier />
        </div>
      </div>
    </main>
  );
}
```

The only change from the original: the new `WachtwoordFormulier` import and a second `mt-10` section, matching the existing "Contactgegevens" section's structure exactly.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/instellingen/page.tsx"
git commit -m "feat: Wachtwoord-sectie op de klant-Instellingenpagina"
```

---

### Task 4: Full verification and push

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --fileParallelism=false`
Expected: all tests pass, including the 4 new tests from Task 1.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors. The two pre-existing, unrelated issues (`src/app/auth/confirm/page.tsx`, the gitignored `supabase/.temp/` directory) are expected and fine.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully, zero errors.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`). Log in as a klant, go to `/dashboard/instellingen`:
- Confirm the new "Wachtwoord"-section appears below "Contactgegevens", with three password fields.
- Try an incorrect current password — confirm the "Huidig wachtwoord is onjuist." error appears and nothing changes.
- Try mismatched new-password/confirmation fields — confirm the "De wachtwoorden komen niet overeen." error appears without a server round-trip.
- Successfully change the password — confirm the success message appears and all three fields clear. Log out, confirm logging in with the old password fails and the new one works.

- [ ] **Step 5: Push**

```bash
git push origin main
```

No manual production-database migration is needed for this plan (no schema changes).
