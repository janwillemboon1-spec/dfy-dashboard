# "Start hier"-pagina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een nieuwe pagina in het klantportaal ("Start hier") die een introductievideo en een extern formulier toont (beide als iframe), met de links daarvoor instelbaar door de admin via een nieuw, eerste app-breed instellingenscherm — deelproject 2/2 van de zelfregistratie-feature.

**Architecture:** Eén nieuwe, minimale databasetabel (`portaal_instellingen`, precies één rij, geen `client_id`) plus twee nieuwe pagina's: een admin-instellingenpagina om de video-/formulier-link te beheren, en een klant-pagina die ze toont. Beide video en formulier zijn externe, ingesloten content (Vimeo/Loom, Typeform/Tally) — geen eigen video-hosting of formulierlogica.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres met RLS, vitest voor de nieuwe server-actie-test. Geen nieuwe dependencies.

**Reference:** Spec op `docs/superpowers/specs/2026-08-15-start-hier-pagina-design.md`.

---

### Task 1: Database — `portaal_instellingen`-tabel

**Files:**
- Create: `supabase/migrations/20260815100000_portaal_instellingen.sql`
- Modify: `src/types/database.ts` (via regeneratie, niet handmatig)

- [ ] **Step 1: Schrijf de migratie**

Create `supabase/migrations/20260815100000_portaal_instellingen.sql`:

```sql
-- App-brede instellingen, niet per klant — vandaar geen client_id. Er wordt precies één
-- rij verwacht; de server-actie die deze rij beheert (Task 2) doet dat als een upsert
-- (eerst kijken of er al een rij bestaat, dan updaten, anders aanmaken), zodat het ook
-- werkt vóórdat er ooit een rij is aangemaakt.
create table portaal_instellingen (
  id uuid primary key default gen_random_uuid(),
  video_url text,
  formulier_url text,
  gewijzigd_op timestamptz not null default now()
);

alter table portaal_instellingen enable row level security;

-- Admin kan de instellingen volledig beheren (lezen, aanmaken, bijwerken).
create policy "admin volledige toegang portaal_instellingen" on portaal_instellingen
  for all using (is_admin()) with check (is_admin());

-- Elke ingelogde gebruiker (klant én admin) mag de instellingen lezen — de "Start
-- hier"-pagina in het klantportaal heeft dit nodig, en de inhoud (twee video-/
-- formulier-links) is niet gevoelig.
create policy "ingelogde gebruikers lezen portaal_instellingen" on portaal_instellingen
  for select to authenticated using (true);
```

- [ ] **Step 2: Pas de migratie lokaal toe en regenereer de types**

Run (start eerst `npx supabase start` als de lokale stack nog niet draait — check met `docker ps`):
```bash
npx supabase db reset
npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts
```
Expected: `db reset` past alle migraties (inclusief de nieuwe) opnieuw toe zonder fouten; `src/types/database.ts` bevat nu een `portaal_instellingen`-tabel met `id`, `video_url`, `formulier_url`, `gewijzigd_op`.

- [ ] **Step 3: Verifieer**

Run: `npx tsc --noEmit` en `npm run build` — beide moeten zonder fouten slagen (dit is een puur additieve wijziging, niets bestaands gebruikt deze tabel nog).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815100000_portaal_instellingen.sql src/types/database.ts
git commit -m "feat: voeg portaal_instellingen-tabel toe (video-/formulier-link voor Start hier)"
```

**Let op voor Task 4:** deze migratie moet ook handmatig op productie toegepast worden (geen productie-DB-credentials beschikbaar in deze omgeving) — Task 4 herhaalt de exacte SQL.

---

### Task 2: Admin — instellingenpagina

**Files:**
- Create: `src/app/[locale]/admin/instellingen/actions.ts`
- Create: `src/components/admin/portaal-instellingen-formulier.tsx`
- Create: `src/app/[locale]/admin/instellingen/page.tsx`
- Modify: `src/app/[locale]/admin/klanten/page.tsx`
- Test: `tests/integration/wijzig-portaal-instellingen.test.ts`

Deze pagina zit automatisch achter de bestaande `/admin`-bescherming (`src/app/[locale]/admin/layout.tsx` — vereist een ingelogde gebruiker met `profiles.role === 'admin'`, geen extra code nodig). Er bestaat nog geen plain (niet-dialoog) formulier ergens in het admin-gedeelte — dit spiegelt in plaats daarvan het bestaande klant-kant patroon in `src/app/[locale]/dashboard/instellingen/page.tsx` + `src/components/dashboard/contactgegevens-formulier.tsx`.

- [ ] **Step 1: Schrijf de server-actie**

Create `src/app/[locale]/admin/instellingen/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';

export async function wijzigPortaalInstellingen(input: {
  videoUrl: string | null;
  formulierUrl: string | null;
}): Promise<{ succes: boolean; fout?: string }> {
  await assertIsAdmin();

  const supabase = await createClient();

  const { data: bestaande, error: leesError } = await supabase
    .from('portaal_instellingen')
    .select('id')
    .maybeSingle();

  if (leesError) return { succes: false, fout: leesError.message };

  if (bestaande) {
    const { error } = await supabase
      .from('portaal_instellingen')
      .update({
        video_url: input.videoUrl,
        formulier_url: input.formulierUrl,
        gewijzigd_op: new Date().toISOString(),
      })
      .eq('id', bestaande.id);
    if (error) return { succes: false, fout: error.message };
  } else {
    const { error } = await supabase.from('portaal_instellingen').insert({
      video_url: input.videoUrl,
      formulier_url: input.formulierUrl,
    });
    if (error) return { succes: false, fout: error.message };
  }

  revalidatePath('/admin/instellingen');
  revalidatePath('/dashboard/start-hier');
  return { succes: true };
}
```

Let op: `assertIsAdmin()` gooit een `Error('Niet geautoriseerd.')` bij een niet-admin — dat is bewust een throw (niet een `{ succes: false }`-return), consistent met hoe elke andere admin-actie in dit project (`src/app/[locale]/admin/klanten/[id]/actions.ts`) dat doet.

- [ ] **Step 2: Schrijf het formulier-component**

Create `src/components/admin/portaal-instellingen-formulier.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { wijzigPortaalInstellingen } from '@/app/[locale]/admin/instellingen/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PortaalInstellingenFormulier({
  videoUrl: initieleVideoUrl,
  formulierUrl: initieleFormulierUrl,
}: {
  videoUrl: string | null;
  formulierUrl: string | null;
}) {
  const [videoUrl, setVideoUrl] = useState(initieleVideoUrl ?? '');
  const [formulierUrl, setFormulierUrl] = useState(initieleFormulierUrl ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    setOpgeslagen(false);
    startTransition(async () => {
      const resultaat = await wijzigPortaalInstellingen({
        videoUrl: videoUrl.trim() || null,
        formulierUrl: formulierUrl.trim() || null,
      });
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
        <Label htmlFor="instellingen-video-url">Video-link</Label>
        <Input
          id="instellingen-video-url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://player.vimeo.com/video/..."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Plak hier de embed-link van Vimeo of Loom, niet de gewone deel-link.
        </p>
      </div>
      <div>
        <Label htmlFor="instellingen-formulier-url">Formulier-link</Label>
        <Input
          id="instellingen-formulier-url"
          value={formulierUrl}
          onChange={(e) => setFormulierUrl(e.target.value)}
          placeholder="https://tally.so/embed/..."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Plak hier de embed-link van je formuliertool (Typeform, Tally, enz.).
        </p>
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

- [ ] **Step 3: Schrijf de pagina**

Create `src/app/[locale]/admin/instellingen/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { PortaalInstellingenFormulier } from '@/components/admin/portaal-instellingen-formulier';

export default async function AdminInstellingenPage() {
  const supabase = await createClient();
  const { data: instellingen } = await supabase
    .from('portaal_instellingen')
    .select('video_url, formulier_url')
    .maybeSingle();

  return (
    <main className="mx-auto max-w-5xl py-10 px-4 space-y-8">
      <h1 className="font-serif text-2xl">Instellingen</h1>
      <div>
        <h2 className="font-serif text-xl mb-4">&quot;Start hier&quot;-pagina</h2>
        <PortaalInstellingenFormulier
          videoUrl={instellingen?.video_url ?? null}
          formulierUrl={instellingen?.formulier_url ?? null}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Wire een link naar deze pagina vanaf het klantenoverzicht**

In `src/app/[locale]/admin/klanten/page.tsx`, verander:

```tsx
          <div className="flex gap-2">
            <Link href="/admin/klanten/nieuw" className="rounded bg-primary px-4 py-2 text-primary-foreground text-sm">
              + Nieuwe klant
            </Link>
            <Link href="/admin/import" className="rounded border border-border px-4 py-2 text-sm">
              CSV importeren
            </Link>
          </div>
```

naar:

```tsx
          <div className="flex gap-2">
            <Link href="/admin/klanten/nieuw" className="rounded bg-primary px-4 py-2 text-primary-foreground text-sm">
              + Nieuwe klant
            </Link>
            <Link href="/admin/import" className="rounded border border-border px-4 py-2 text-sm">
              CSV importeren
            </Link>
            <Link href="/admin/instellingen" className="rounded border border-border px-4 py-2 text-sm">
              Instellingen
            </Link>
          </div>
```

- [ ] **Step 5: Schrijf de integratietest**

Create `tests/integration/wijzig-portaal-instellingen.test.ts` (zelfde login-via-cookie-store-patroon als `tests/integration/listing-crud-authz.test.ts`):

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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

const { wijzigPortaalInstellingen } = await import('@/app/[locale]/admin/instellingen/actions');

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

let adminEmail: string;
let adminUserId: string;
let klantClientId: string;
let klantEmail: string;
let klantUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  adminEmail = `portaal-instellingen-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Portaal Instellingen Klant', email: `portaal-instellingen-klant-${suffix}@test.local` })
    .select()
    .single();
  klantClientId = client!.id;

  klantEmail = `portaal-instellingen-klant-${suffix}@test.local`;
  const { data: klantUserRes } = await admin.auth.admin.createUser({
    email: klantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantUserId = klantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantUserId, role: 'klant', client_id: klantClientId, email: klantEmail, naam: 'Klant' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', klantClientId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(klantUserId);
});

afterEach(async () => {
  // portaal_instellingen heeft geen client_id om op te filteren — deze test-suite is de
  // enige plek die deze tabel vult, dus na elke test alle rijen wissen om vanaf een
  // schone lei te beginnen (neq op een garandeerd-niet-bestaand id is hier simpelweg een
  // "verwijder alles"-filter, want Supabase staat geen .delete() zonder filter toe).
  await admin.from('portaal_instellingen').delete().neq('id', '00000000-0000-0000-0000-000000000000');
});

describe('wijzigPortaalInstellingen', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      wijzigPortaalInstellingen({
        videoUrl: 'https://player.vimeo.com/video/1',
        formulierUrl: 'https://tally.so/embed/x',
      })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('maakt een nieuwe rij aan als er nog geen instellingen bestaan', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const resultaat = await wijzigPortaalInstellingen({
      videoUrl: 'https://player.vimeo.com/video/1',
      formulierUrl: 'https://tally.so/embed/x',
    });
    expect(resultaat.succes).toBe(true);

    const { data: rijen } = await admin.from('portaal_instellingen').select('*');
    expect(rijen).toHaveLength(1);
    expect(rijen![0].video_url).toBe('https://player.vimeo.com/video/1');
    expect(rijen![0].formulier_url).toBe('https://tally.so/embed/x');
  });

  it('werkt de bestaande rij bij i.p.v. een tweede rij aan te maken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await wijzigPortaalInstellingen({
      videoUrl: 'https://player.vimeo.com/video/1',
      formulierUrl: 'https://tally.so/embed/x',
    });
    await wijzigPortaalInstellingen({
      videoUrl: 'https://player.vimeo.com/video/2',
      formulierUrl: 'https://tally.so/embed/y',
    });

    const { data: rijen } = await admin.from('portaal_instellingen').select('*');
    expect(rijen).toHaveLength(1);
    expect(rijen![0].video_url).toBe('https://player.vimeo.com/video/2');
    expect(rijen![0].formulier_url).toBe('https://tally.so/embed/y');
  });
});
```

- [ ] **Step 6: Run de tests**

Run: `npx vitest run --fileParallelism=false tests/integration/wijzig-portaal-instellingen.test.ts`
Expected: 3 tests slagen.

- [ ] **Step 7: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/admin/instellingen/actions.ts" src/components/admin/portaal-instellingen-formulier.tsx "src/app/[locale]/admin/instellingen/page.tsx" "src/app/[locale]/admin/klanten/page.tsx" tests/integration/wijzig-portaal-instellingen.test.ts
git commit -m "feat: admin-instellingenpagina voor de video-/formulier-link van Start hier"
```

(Note: quote paths met `[locale]` zodat de shell de blokhaken niet probeert te expanden.)

---

### Task 3: Klant — "Start hier"-pagina en navigatie

**Files:**
- Create: `src/app/[locale]/dashboard/start-hier/page.tsx`
- Modify: `src/app/[locale]/dashboard/layout.tsx`

- [ ] **Step 1: Schrijf de pagina**

Create `src/app/[locale]/dashboard/start-hier/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';

export default async function StartHierPage() {
  const supabase = await createClient();
  const { data: instellingen } = await supabase
    .from('portaal_instellingen')
    .select('video_url, formulier_url')
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-10">
      <div>
        <h1 className="font-serif text-2xl">Start hier</h1>
        <p className="mt-2 text-muted-foreground">
          Bekijk de video hieronder en vul alvast het formulier in — dat heeft ons team nodig
          om jouw accommodatie(s) te koppelen.
        </p>
      </div>

      <section>
        <h2 className="font-serif text-lg mb-3">Introductievideo</h2>
        {instellingen?.video_url ? (
          <div className="aspect-video w-full">
            <iframe
              src={instellingen.video_url}
              className="h-full w-full rounded-lg border border-border"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title="Introductievideo"
            />
          </div>
        ) : (
          <p className="rounded-lg border border-border py-8 text-center text-sm text-muted-foreground">
            Deze video wordt binnenkort toegevoegd.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-serif text-lg mb-3">Formulier</h2>
        {instellingen?.formulier_url ? (
          <iframe
            src={instellingen.formulier_url}
            className="h-[800px] w-full rounded-lg border border-border"
            title="Formulier"
          />
        ) : (
          <p className="rounded-lg border border-border py-8 text-center text-sm text-muted-foreground">
            Dit formulier wordt binnenkort toegevoegd.
          </p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Voeg de pagina toe aan de portaal-sidebar**

In `src/app/[locale]/dashboard/layout.tsx`, verander:

```tsx
        items={[
          { label: 'Voortgang', href: '/dashboard/voortgang' },
          { label: 'Cijfers', href: '/dashboard/cijfers' },
          { label: 'Instellingen', href: '/dashboard/instellingen' },
        ]}
```

naar:

```tsx
        items={[
          { label: 'Start hier', href: '/dashboard/start-hier' },
          { label: 'Voortgang', href: '/dashboard/voortgang' },
          { label: 'Cijfers', href: '/dashboard/cijfers' },
          { label: 'Instellingen', href: '/dashboard/instellingen' },
        ]}
```

(De exacte inspringing/omliggende JSX kan licht afwijken van bovenstaand fragment — pas het `items`-array aan op de plek waar het al staat, de rest van `PortaalSidebar`'s props blijft ongewijzigd.)

- [ ] **Step 3: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten; `/[locale]/dashboard/start-hier` verschijnt in de route-tabel.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/start-hier/page.tsx" "src/app/[locale]/dashboard/layout.tsx"
git commit -m "feat: Start hier-pagina in klantportaal met video- en formulier-embed"
```

---

### Task 4: Volledige verificatie en push

- [ ] **Step 1: Run de volledige testsuite**

Run: `npx vitest run --fileParallelism=false`
Expected: alle tests slagen, inclusief de 3 nieuwe tests uit Task 2. Vereist een lokaal draaiende Supabase-stack (`npx supabase start`) — als eerdere runs "fetch failed"-fouten op *alle* integratietests tegelijk gaven, is de lokale Supabase-stack waarschijnlijk gestopt; check `docker ps`/`npx supabase status` en herstart zo nodig met `npx supabase start` vóórdat je verder zoekt naar een echte regressie.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: geen nieuwe fouten. De twee al bekende, ongerelateerde issues (`src/app/auth/confirm/page.tsx`, de gitignorede `supabase/.temp/`-map) zijn verwacht.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: bouwt zonder fouten (laatste gate, al eerder bevestigd per taak).

- [ ] **Step 4: Handmatige verificatie**

Start de dev-server (`npm run dev`) en loop het volgende door — vraagt een echte browser die in deze omgeving niet beschikbaar is, dus dit is voor de gebruiker:

- **Admin-instellingenpagina:** open `/admin/klanten`, klik "Instellingen" → vul een video- en formulier-embed-link in, klik "Opslaan" → bevestiging verschijnt.
- **Start hier, met links ingesteld:** log in als klant, klik "Start hier" (nu het eerste item in de sidebar) → video en formulier tonen correct.
- **Start hier, zonder links ingesteld:** (test dit vóórdat je de admin-instellingen invult, of verwijder de rij tijdelijk) → nette "wordt binnenkort toegevoegd"-teksten in plaats van kapotte iframes.
- **Alleen video of alleen formulier ingesteld:** het ontbrekende onderdeel toont zijn eigen lege-status-tekst, onafhankelijk van het andere onderdeel.

- [ ] **Step 5: Productie-migratie**

Voer dit zelf uit via het Supabase-dashboard (SQL editor) tegen de productie-database, vóór je deze branch naar productie deployt:

```sql
create table portaal_instellingen (
  id uuid primary key default gen_random_uuid(),
  video_url text,
  formulier_url text,
  gewijzigd_op timestamptz not null default now()
);

alter table portaal_instellingen enable row level security;

create policy "admin volledige toegang portaal_instellingen" on portaal_instellingen
  for all using (is_admin()) with check (is_admin());

create policy "ingelogde gebruikers lezen portaal_instellingen" on portaal_instellingen
  for select to authenticated using (true);
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

Dit is ook de afsluiting van de volledige zelfregistratie-feature (deelproject 1/2 + 2/2 beide klaar).
