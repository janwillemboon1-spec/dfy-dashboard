# Klantportaal — Voortgang: fasen & voortgangsbalk (deelproject 2/7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De Voortgang-pagina (klant en admin) toont een gesegmenteerde voortgangsbalk met 3 onafhankelijke fasen (Onboarding / Marktanalyse & concurrentieanalyse / Optimalisaties APH), waarvan de admin het percentage per fase kan instellen.

**Architecture:** Nieuwe tabel `voortgang_fasen` (één rij per client+fase, ontbrekende rij = 0%). Eén server-actie (`werkFaseVoortgangBij`, dunne upsert, geen automatisch doorschakelen). Eén gedeelde read-only `VoortgangsBalk`-component voor beide rollen; een apart admin-only bewerkformulier.

**Tech Stack:** Next.js Server Components + één Server Action, Supabase (Postgres/RLS), Vitest.

**Referentie-spec:** `docs/superpowers/specs/2026-08-12-voortgang-fasen-design.md`

---

### Task 1: Migratie — `voortgang_fasen`-tabel

**Files:**
- Create: `supabase/migrations/20260812100000_voortgang_fasen.sql`

- [ ] **Step 1: Maak het migratiebestand aan**

```sql
create table voortgang_fasen (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  fase_nummer int not null check (fase_nummer between 1 and 3),
  percentage int not null default 0 check (percentage between 0 and 100),
  bijgewerkt_op timestamptz not null default now(),
  unique (client_id, fase_nummer)
);

create index voortgang_fasen_client_id_idx on voortgang_fasen(client_id);

-- Zonder deze expliciete grant kan geen enkele rol (ook niet service_role) deze tabel
-- lezen/schrijven in deze lokale Supabase-omgeving — zie de toelichting bij de
-- vergelijkbare grant in 20260804102114_rls_and_functions.sql.
grant select, insert, update, delete on voortgang_fasen to anon, authenticated, service_role;

alter table voortgang_fasen enable row level security;

create policy "admin volledige toegang voortgang_fasen" on voortgang_fasen
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_fasen" on voortgang_fasen
  for select using (client_id = current_client_id());
```

- [ ] **Step 2: Pas de migratie toe op de lokale database**

Run: `npx supabase migration up`
Expected: de migratie wordt toegepast zonder errors; `npx supabase status` blijft draaien.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260812100000_voortgang_fasen.sql
git commit -m "feat: voortgang_fasen-tabel voor onafhankelijke fase-percentages per klant"
```

---

### Task 2: `FASE_NAMEN`-constante + `faseStatusLabel`-functie

**Files:**
- Create: `src/lib/constants/fasen.ts`
- Create: `src/lib/dashboard/fase-status.ts`
- Test: `tests/unit/fase-status.test.ts`

- [ ] **Step 1: Maak `src/lib/constants/fasen.ts` aan**

```ts
export const FASE_NAMEN = ['Onboarding', 'Marktanalyse & concurrentieanalyse', 'Optimalisaties APH'] as const;
```

- [ ] **Step 2: Schrijf de failing test voor `faseStatusLabel`**

```ts
import { describe, it, expect } from 'vitest';
import { faseStatusLabel } from '@/lib/dashboard/fase-status';

describe('faseStatusLabel', () => {
  it('toont "Afgerond" bij 100%', () => {
    expect(faseStatusLabel(100)).toBe('Afgerond');
  });

  it('toont "Nog niet gestart" bij 0%', () => {
    expect(faseStatusLabel(0)).toBe('Nog niet gestart');
  });

  it('toont het percentage voor waarden ertussen', () => {
    expect(faseStatusLabel(45)).toBe('45%');
  });
});
```

- [ ] **Step 3: Run de test om te bevestigen dat hij faalt**

Run: `npm test -- tests/unit/fase-status.test.ts`
Expected: FAIL — `src/lib/dashboard/fase-status.ts` bestaat nog niet.

- [ ] **Step 4: Implementeer `faseStatusLabel`**

```ts
export function faseStatusLabel(percentage: number): string {
  if (percentage >= 100) return 'Afgerond';
  if (percentage <= 0) return 'Nog niet gestart';
  return `${percentage}%`;
}
```

- [ ] **Step 5: Run de test om te bevestigen dat hij slaagt**

Run: `npm test -- tests/unit/fase-status.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants/fasen.ts src/lib/dashboard/fase-status.ts tests/unit/fase-status.test.ts
git commit -m "feat: FASE_NAMEN-constante en faseStatusLabel-hulpfunctie"
```

---

### Task 3: `VoortgangsBalk`-component

**Files:**
- Create: `src/components/portal/voortgangs-balk.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
import { FASE_NAMEN } from '@/lib/constants/fasen';
import { faseStatusLabel } from '@/lib/dashboard/fase-status';

export interface FaseVoortgang {
  faseNummer: 1 | 2 | 3;
  percentage: number;
}

const ALLE_FASEN = [1, 2, 3] as const;

export function VoortgangsBalk({ fasen }: { fasen: FaseVoortgang[] }) {
  const percentagePerFase = new Map(fasen.map((f) => [f.faseNummer, f.percentage]));
  const fase3Percentage = percentagePerFase.get(3) ?? 0;

  return (
    <div>
      <div className="flex gap-3">
        {ALLE_FASEN.map((faseNummer) => {
          const percentage = percentagePerFase.get(faseNummer) ?? 0;
          return (
            <div key={faseNummer} className="flex-1">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {faseNummer}. {FASE_NAMEN[faseNummer - 1]}
              </p>
              <p className="text-xs font-medium">{faseStatusLabel(percentage)}</p>
            </div>
          );
        })}
      </div>
      {fase3Percentage >= 100 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Fase 3 is volledig doorlopen — toekomstige optimalisaties zijn te volgen in het
          activiteitenlog.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/voortgangs-balk.tsx
git commit -m "feat: VoortgangsBalk-component (gesegmenteerde balk per fase)"
```

---

### Task 4: Server-actie `werkFaseVoortgangBij`

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/werk-fase-voortgang-bij.test.ts`

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

const { werkFaseVoortgangBij } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
    .insert({ naam: 'Fase-voortgang Klant', email: `fase-voortgang-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `fase-voortgang-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `fase-voortgang-klant-${suffix}@test.local`;
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

describe('werkFaseVoortgangBij', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: 50 })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een percentage buiten 0-100', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: 150 })
    ).rejects.toThrow('Percentage moet een geheel getal tussen 0 en 100 zijn.');
    await expect(
      werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: -5 })
    ).rejects.toThrow('Percentage moet een geheel getal tussen 0 en 100 zijn.');
  });

  it('maakt een nieuwe rij aan voor een fase die nog geen percentage had', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 40 });

    const { data: rij } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 2)
      .single();
    expect(rij!.percentage).toBe(40);
  });

  it('werkt een bestaande rij bij i.p.v. een dubbele aan te maken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 40 });
    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 75 });

    const { data: rijen } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 2);
    expect(rijen).toHaveLength(1);
    expect(rijen![0].percentage).toBe(75);
  });

  it('houdt fases volledig onafhankelijk van elkaar', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: 40 });
    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 100 });

    const { data: fase1 } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 1)
      .single();
    expect(fase1!.percentage).toBe(40);

    const { data: fase2 } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 2)
      .single();
    expect(fase2!.percentage).toBe(100);
  });
});
```

- [ ] **Step 2: Run de test om te bevestigen dat hij faalt**

Run: `npm test -- tests/integration/werk-fase-voortgang-bij.test.ts`
Expected: FAIL — `werkFaseVoortgangBij` bestaat nog niet in `actions.ts`.

- [ ] **Step 3: Voeg de server-actie toe**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, voeg helemaal onderaan het bestand toe:

```ts

export async function werkFaseVoortgangBij(input: {
  clientId: string;
  faseNummer: 1 | 2 | 3;
  percentage: number;
}) {
  await assertIsAdmin();
  if (!Number.isInteger(input.percentage) || input.percentage < 0 || input.percentage > 100) {
    throw new Error('Percentage moet een geheel getal tussen 0 en 100 zijn.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('voortgang_fasen')
    .upsert(
      { client_id: input.clientId, fase_nummer: input.faseNummer, percentage: input.percentage },
      { onConflict: 'client_id,fase_nummer' }
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

- [ ] **Step 4: Run de test om te bevestigen dat hij slaagt**

Run: `npm test -- tests/integration/werk-fase-voortgang-bij.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/werk-fase-voortgang-bij.test.ts
git commit -m "feat: werkFaseVoortgangBij server-actie (onafhankelijke upsert per fase)"
```

---

### Task 5: `FaseVoortgangFormulier`-component (admin)

**Files:**
- Create: `src/components/admin/fase-voortgang-formulier.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { werkFaseVoortgangBij } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FASE_NAMEN } from '@/lib/constants/fasen';

export function FaseVoortgangFormulier({ clientId }: { clientId: string }) {
  const [faseNummer, setFaseNummer] = useState<1 | 2 | 3>(1);
  const [percentage, setPercentage] = useState(0);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function bijwerken() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await werkFaseVoortgangBij({ clientId, faseNummer, percentage });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor={`fase-select-${clientId}`} className="block text-xs text-muted-foreground">
            Fase
          </label>
          <select
            id={`fase-select-${clientId}`}
            value={faseNummer}
            onChange={(e) => setFaseNummer(Number(e.target.value) as 1 | 2 | 3)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {FASE_NAMEN.map((naam, i) => (
              <option key={naam} value={i + 1}>
                {i + 1}. {naam}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`fase-percentage-${clientId}`} className="block text-xs text-muted-foreground">
            Percentage
          </label>
          <Input
            id={`fase-percentage-${clientId}`}
            type="number"
            min={0}
            max={100}
            value={percentage}
            onChange={(e) => setPercentage(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <Button size="sm" disabled={isPending} onClick={bijwerken}>
          {isPending ? 'Bezig...' : 'Bijwerken'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/fase-voortgang-formulier.tsx
git commit -m "feat: FaseVoortgangFormulier voor admin om fase-percentages bij te werken"
```

---

### Task 6: Wiring in de Voortgang-pagina's

**Files:**
- Modify: `src/app/[locale]/dashboard/voortgang/page.tsx`
- Modify: `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx`

- [ ] **Step 1: Vervang de klant-placeholder**

Vervang de volledige inhoud van `src/app/[locale]/dashboard/voortgang/page.tsx` door:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';

// Geen expliciet client_id-filter nodig: de "klant leest eigen voortgang_fasen"-RLS-policy
// (client_id = current_client_id()) scopet dit al af tot precies de fasen van de ingelogde
// klant. Dit klopt alleen voor een klant-sessie — dashboard/layout.tsx redirect een
// admin-sessie al weg vóórdat deze pagina rendert.
export default async function VoortgangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: fasen } = await supabase.from('voortgang_fasen').select('fase_nummer, percentage');

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <div className="mt-6">
        <VoortgangsBalk fasen={fasenData} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Vervang de admin-placeholder**

Vervang de volledige inhoud van `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx` door:

```tsx
import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';
import { FaseVoortgangFormulier } from '@/components/admin/fase-voortgang-formulier';

export default async function VoortgangPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: fasen } = await supabase
    .from('voortgang_fasen')
    .select('fase_nummer, percentage')
    .eq('client_id', id);

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <div className="mt-6">
        <VoortgangsBalk fasen={fasenData} />
      </div>
      <FaseVoortgangFormulier clientId={id} />
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/voortgang/page.tsx" "src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx"
git commit -m "feat: Voortgang-pagina's tonen de echte voortgangsbalk i.p.v. de placeholder"
```

---

### Task 7: Verificatie

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

Als admin: open een klant → Voortgang-tab. Zet fase 2 op 100% terwijl fase 1 op 40% staat —
beide blijven onafhankelijk zichtbaar in de balk, geen automatische verschuiving. Zet fase 3
op 100% — de speciale eindtekst verschijnt.

Als klant: open Voortgang — dezelfde balk is zichtbaar, alleen-lezen (geen bewerkformulier).

Sluit de dev-server af (Ctrl+C) na verificatie.
