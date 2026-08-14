# Zelfregistratie klantportaal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat nieuwe klanten zichzelf via een wachtwoord-beveiligde aanmeldpagina registreren (naam/telefoon/e-mail/wachtwoord, geen accommodaties), met directe portaaltoegang, een admin-notificatiemail, een "Nieuw"-badge in het klantenoverzicht, en een nieuwe admin-functie om later een accommodatie aan zo'n klant toe te voegen.

**Architecture:** Twee onafhankelijke, parallelle toevoegingen naast de bestaande zware onboarding-flow (die ongewijzigd blijft): (1) een generieke admin-actie `voegAccommodatieToe` die op elk moment een accommodatie aan een bestaande klant toevoegt, en (2) een lichte, publieke zelfregistratie-flow (`registreerKlant`) die alleen een `clients`-rij (zonder listings), een Supabase Auth-account mét wachtwoord, en een `profiles`-rij aanmaakt. Eén nieuwe databasekolom (`clients.zelf_geregistreerd`) drijft zowel de "Nieuw"-badge als het onderscheid met andere aanmaakwegen.

**Tech Stack:** Next.js App Router (Server Components + Route Handlers), Supabase (service-role admin-client voor het aanmaken van klanten, RLS/`assertIsAdmin()` voor admin-acties), react-hook-form + zod, Resend voor e-mail, vitest voor tests. Geen nieuwe dependencies.

**Reference:** Spec op `docs/superpowers/specs/2026-08-14-zelfregistratie-klantportaal-design.md`. Deelproject 1/2 — de "start hier"-pagina (deelproject 2/2) wordt apart uitgewerkt.

---

### Task 1: Admin — accommodatie toevoegen aan bestaande klant

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts` (voeg `voegAccommodatieToe` toe aan het einde van het bestand)
- Create: `src/components/admin/listing-toevoegen-formulier.tsx`
- Modify: `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`
- Test: `tests/integration/voeg-accommodatie-toe.test.ts`

Dit staat los van de rest van dit plan (geen databasewijziging nodig) en lost meteen het bestaande gat op: vandaag bestaat er geen enkele manier om een accommodatie aan een al bestaande klant toe te voegen. `assertIsAdmin()` (uit `src/lib/auth/assert-admin.ts`) en `createAdminClient()` (uit `src/lib/supabase/admin.ts`) bestaan al en worden overal elders in `actions.ts` op dezelfde manier gebruikt — zie bijvoorbeeld `verwijderKlant` in hetzelfde bestand.

- [ ] **Step 1: Voeg `voegAccommodatieToe` toe aan `actions.ts`**

Voeg dit toe aan het **einde** van `src/app/[locale]/admin/klanten/[id]/actions.ts` (alle imports die dit nodig heeft — `assertIsAdmin`, `createAdminClient`, `revalidatePath` — staan al bovenaan het bestand):

```typescript
export async function voegAccommodatieToe(input: {
  clientId: string;
  naam: string;
  adres: string | null;
}): Promise<{ listingId: string }> {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');

  const admin = createAdminClient();

  const { data: listing, error: listingError } = await admin
    .from('listings')
    .insert({ client_id: input.clientId, naam: input.naam.trim(), adres: input.adres })
    .select('id')
    .single();
  if (listingError) throw new Error(listingError.message);

  // Zelfde patroon als legeNulmeting() in onboarding-form.tsx: 12 maanden op 0, klaar om
  // door de admin gecorrigeerd te worden via de al bestaande nulmeting-correctierij.
  const jaar = new Date().getFullYear();
  const nulmetingRijen = Array.from({ length: 12 }, (_, i) => ({
    listing_id: listing.id,
    jaar,
    maand: i + 1,
    omzet: 0,
    bezetting: 0,
  }));
  const { error: nulmetingError } = await admin.from('nulmeting').insert(nulmetingRijen);
  if (nulmetingError) throw new Error(nulmetingError.message);

  revalidatePath(`/admin/klanten/${input.clientId}/instellingen`);

  return { listingId: listing.id };
}
```

We gebruiken hier bewust `createAdminClient()` (service-role, omzeilt RLS) i.p.v. de gewone RLS-gebonden `createClient()` — net als `verwijderKlant` in hetzelfde bestand al doet voor zijn `delete_client_cascade`-aanroep. Er bestaat vandaag geen bevestigde admin-INSERT-policy op `listings`/`nulmeting` (alleen UPDATE/DELETE-acties zoals `corrigeerNulmeting`/`wijzigListing` gebruiken de gewone client), dus dit voorkomt een gok over RLS die pas bij het draaien van de tests aan het licht zou komen.

- [ ] **Step 2: Maak het formulier-component**

Create `src/components/admin/listing-toevoegen-formulier.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegAccommodatieToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ListingToevoegenFormulier({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState('');
  const [adres, setAdres] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await voegAccommodatieToe({ clientId, naam: naam.trim(), adres: adres.trim() || null });
        setOpen(false);
        setNaam('');
        setAdres('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (!nieuweOpen) {
      setNaam('');
      setAdres('');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>+ Accommodatie toevoegen</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accommodatie toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Naam</label>
            <Input value={naam} onChange={(e) => setNaam(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Adres (optioneel)</label>
            <Input value={adres} onChange={(e) => setAdres(e.target.value)} />
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={isPending || !naam.trim()} onClick={toevoegen}>
            {isPending ? 'Bezig...' : 'Toevoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Dit is een letterlijke stijl-kopie van `src/components/admin/listing-bewerken-formulier.tsx` (zelfde Dialog-opbouw, zelfde reset-bij-openen/sluiten-patroon), met alleen naam/adres-velden i.p.v. naam/adres/airbnbUrl.

- [ ] **Step 3: Wire het formulier in op de klantdetailpagina**

In `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`, voeg de import toe bovenaan (bij de andere `@/components/admin/*`-imports):

```tsx
import { ListingToevoegenFormulier } from '@/components/admin/listing-toevoegen-formulier';
```

En verander:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Accommodaties</h2>
        <PricelabsCacheVerversen clientId={id} />
      </div>
```

naar:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Accommodaties</h2>
        <div className="flex gap-2">
          <ListingToevoegenFormulier clientId={id} />
          <PricelabsCacheVerversen clientId={id} />
        </div>
      </div>
```

- [ ] **Step 4: Schrijf de integratietest**

Create `tests/integration/voeg-accommodatie-toe.test.ts` (dit spiegelt exact het patroon van het al bestaande `tests/integration/listing-crud-authz.test.ts` — zelfde mocks, zelfde login-via-cookie-store-helper):

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

const { voegAccommodatieToe } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
    .insert({ naam: 'Voeg Accommodatie Klant', email: `voeg-accommodatie-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `voeg-accommodatie-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `voeg-accommodatie-klant-${suffix}@test.local`;
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

describe('voegAccommodatieToe', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      voegAccommodatieToe({ clientId, naam: 'Weigert Accommodatie', adres: null })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('voegt een listing toe met 12 nulmeting-rijen op 0', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const result = await voegAccommodatieToe({ clientId, naam: 'Nieuwe Accommodatie', adres: 'Teststraat 5' });

    const { data: listing } = await admin.from('listings').select('*').eq('id', result.listingId).single();
    expect(listing!.naam).toBe('Nieuwe Accommodatie');
    expect(listing!.adres).toBe('Teststraat 5');
    expect(listing!.client_id).toBe(clientId);

    const { data: nulmeting } = await admin.from('nulmeting').select('*').eq('listing_id', result.listingId);
    expect(nulmeting).toHaveLength(12);
    expect(nulmeting!.every((rij) => rij.omzet === 0 && rij.bezetting === 0)).toBe(true);
  });

  it('werkt ook voor een klant met al bestaande accommodaties', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegAccommodatieToe({ clientId, naam: 'Eerste', adres: null });
    await voegAccommodatieToe({ clientId, naam: 'Tweede', adres: null });

    const { data: listings } = await admin.from('listings').select('id').eq('client_id', clientId);
    expect(listings!.length).toBeGreaterThanOrEqual(2);
  });
});
```

`afterAll`'s `clients`-delete cascadeert automatisch naar alle listings/nulmeting van deze test-klant (`on delete cascade`), dus er is geen aparte listing-opruiming nodig.

- [ ] **Step 5: Run de tests**

Run: `npx vitest run --fileParallelism=false tests/integration/voeg-accommodatie-toe.test.ts`
Expected: 3 tests slagen. (Vereist een lokaal draaiende Supabase-stack: `npx supabase start` als die nog niet draait.)

- [ ] **Step 6: Commit**

```bash
git add src/app/\[locale\]/admin/klanten/\[id\]/actions.ts src/components/admin/listing-toevoegen-formulier.tsx src/app/\[locale\]/admin/klanten/\[id\]/instellingen/page.tsx tests/integration/voeg-accommodatie-toe.test.ts
git commit -m "feat: admin kan een accommodatie toevoegen aan een bestaande klant"
```

---

### Task 2: Database — `zelf_geregistreerd`-kolom

**Files:**
- Create: `supabase/migrations/20260814100000_zelfregistratie.sql`
- Modify: `src/types/database.ts` (via regeneratie, niet handmatig)

- [ ] **Step 1: Schrijf de migratie**

Create `supabase/migrations/20260814100000_zelfregistratie.sql`:

```sql
-- Onderscheidt "klant heeft zichzelf via de aanmeldpagina geregistreerd" van elke andere
-- manier waarop een klant ontstaat (admin "Nieuwe klant", CSV-import) — beide starten op
-- status 'onboarding', maar alleen zelfregistratie zet dit veld op true. Wordt gebruikt
-- voor de "Nieuw"-badge in het admin-klantenoverzicht (verdwijnt zodra de admin de status
-- handmatig op 'actief' zet).
alter table clients add column zelf_geregistreerd boolean not null default false;
```

Geen RLS-wijziging nodig: RLS in Postgres werkt op rij-niveau, niet kolom-niveau, dus bestaande policies die al `select`/`update` op `clients` toestaan dekken deze nieuwe kolom automatisch mee.

- [ ] **Step 2: Pas de migratie lokaal toe en regenereer de types**

Run (start eerst `npx supabase start` als de lokale stack nog niet draait):
```bash
npx supabase db reset
npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts
```
Expected: `db reset` past alle migraties (inclusief de nieuwe) opnieuw toe zonder fouten; `src/types/database.ts` bevat nu `zelf_geregistreerd: boolean` in de `clients`-Row/Insert/Update-types.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814100000_zelfregistratie.sql src/types/database.ts
git commit -m "feat: voeg zelf_geregistreerd-kolom toe aan clients"
```

**Let op voor de laatste taak van dit plan (Task 10):** deze migratie moet ook op de productie-database toegepast worden. Omdat er in deze omgeving geen productie-DB-credentials beschikbaar zijn, gebeurt dat niet automatisch — Task 10 herhaalt de exacte SQL hierboven zodat de gebruiker die zelf via het Supabase-dashboard kan uitvoeren.

---

### Task 3: Validatieschema voor registratie

**Files:**
- Create: `src/lib/validation/registratie-schema.ts`
- Test: `tests/unit/registratie-schema.test.ts`

- [ ] **Step 1: Schrijf de falende tests**

Create `tests/unit/registratie-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { registratieSchema } from '@/lib/validation/registratie-schema';

describe('registratieSchema', () => {
  it('accepteert een geldige registratie', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      telefoon: '0612345678',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'geheimwachtwoord123',
    });
    expect(result.success).toBe(true);
  });

  it('wijst niet-overeenkomende wachtwoorden af', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'anderwachtwoord456',
    });
    expect(result.success).toBe(false);
  });

  it('wijst een te kort wachtwoord af', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      wachtwoord: 'kort1',
      wachtwoordBevestiging: 'kort1',
    });
    expect(result.success).toBe(false);
  });

  it('wijst een ongeldig e-mailadres af', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'niet-een-email',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'geheimwachtwoord123',
    });
    expect(result.success).toBe(false);
  });

  it('wijst een ontbrekende naam af', () => {
    const result = registratieSchema.safeParse({
      naam: '',
      email: 'jan@voorbeeld.nl',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'geheimwachtwoord123',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run de tests en verifieer dat ze falen**

Run: `npx vitest run tests/unit/registratie-schema.test.ts`
Expected: FAIL met "Cannot find module '@/lib/validation/registratie-schema'"

- [ ] **Step 3: Schrijf het schema**

Create `src/lib/validation/registratie-schema.ts`:

```typescript
import { z } from 'zod';

export const registratieSchema = z
  .object({
    naam: z.string().min(1, 'Naam is verplicht'),
    email: z.string().email('Ongeldig e-mailadres'),
    telefoon: z.string().optional(),
    wachtwoord: z.string().min(8, 'Wachtwoord moet minimaal 8 tekens zijn'),
    wachtwoordBevestiging: z.string(),
    honeypot: z.string().max(0).optional(),
  })
  .refine((data) => data.wachtwoord === data.wachtwoordBevestiging, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['wachtwoordBevestiging'],
  });

export type RegistratieInput = z.infer<typeof registratieSchema>;
```

- [ ] **Step 4: Run de tests en verifieer dat ze slagen**

Run: `npx vitest run tests/unit/registratie-schema.test.ts`
Expected: alle 5 tests slagen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/registratie-schema.ts tests/unit/registratie-schema.test.ts
git commit -m "feat: validatieschema voor zelfregistratie-formulier"
```

---

### Task 4: Admin-notificatiemail

**Files:**
- Create: `src/lib/email/templates/admin-notificatie-nieuwe-klant.ts`
- Create: `src/lib/email/send-admin-notificatie-nieuwe-klant.ts`
- Modify: `.env.local.example`

Zelfde Resend-patroon als het al bestaande `src/lib/email/send-todo-notificatie.ts` + `src/lib/email/templates/todo-notificatie.ts` — alleen andere ontvanger (een vast admin-adres i.p.v. de klant zelf) en andere inhoud.

- [ ] **Step 1: Schrijf de e-mailtemplate**

Create `src/lib/email/templates/admin-notificatie-nieuwe-klant.ts`:

```typescript
export function adminNotificatieNieuweKlantHtml({
  naam,
  email,
  telefoon,
  link,
}: {
  naam: string;
  email: string;
  telefoon: string | null;
  link: string;
}) {
  return `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #042C53;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">Nieuwe zelfregistratie</h1>
    <p>Er heeft zich een nieuwe klant aangemeld via de aanmeldpagina:</p>
    <p style="font-weight: 600; font-size: 16px;">${naam}</p>
    <p>${email}${telefoon ? ` · ${telefoon}` : ''}</p>
    <p>
      <a href="${link}" style="display:inline-block; background:#EF9F27; color:#042C53; font-weight:600; padding:12px 24px; border-radius:8px; text-decoration:none;">
        Bekijk in het admin-portaal
      </a>
    </p>
  </div>
  `;
}
```

- [ ] **Step 2: Schrijf de send-functie**

Create `src/lib/email/send-admin-notificatie-nieuwe-klant.ts`:

```typescript
import 'server-only';
import { Resend } from 'resend';
import { adminNotificatieNieuweKlantHtml } from './templates/admin-notificatie-nieuwe-klant';

export async function sendAdminNotificatieNieuweKlant({
  naam,
  email,
  telefoon,
  clientId,
}: {
  naam: string;
  email: string;
  telefoon: string | null;
  clientId: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.ADMIN_NOTIFICATIE_EMAIL!,
    subject: `Nieuwe zelfregistratie: ${naam}`,
    html: adminNotificatieNieuweKlantHtml({
      naam,
      email,
      telefoon,
      link: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/klanten/${clientId}/instellingen`,
    }),
  });

  if (error) {
    throw new Error(`Kon admin-notificatiemail niet versturen: ${error.message}`);
  }
}
```

- [ ] **Step 3: Voeg de nieuwe env-variabelen toe aan het voorbeeldbestand**

In `.env.local.example`, voeg toe (na de bestaande `RESEND_FROM_EMAIL=` regel):

```
ADMIN_NOTIFICATIE_EMAIL=
REGISTRATIE_WACHTWOORD=
```

(`REGISTRATIE_WACHTWOORD` wordt pas in Task 6 daadwerkelijk gebruikt, maar we documenteren beide nieuwe variabelen in één keer.) Zet in je eigen lokale `.env.local` (niet gecommit) `ADMIN_NOTIFICATIE_EMAIL=info@bnbassistant.com` en een test-wachtwoord voor `REGISTRATIE_WACHTWOORD`, bijvoorbeeld `REGISTRATIE_WACHTWOORD=test-lokaal-wachtwoord`.

- [ ] **Step 4: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten (dit bestand wordt nog nergens aangeroepen, dus dit is puur een syntax/type-check).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/admin-notificatie-nieuwe-klant.ts src/lib/email/send-admin-notificatie-nieuwe-klant.ts .env.local.example
git commit -m "feat: e-mailfunctie voor admin-notificatie bij nieuwe zelfregistratie"
```

---

### Task 5: `registreerKlant` — kernlogica

**Files:**
- Create: `src/lib/registratie/registreer-klant.ts`
- Test: `tests/integration/registreer-klant.test.ts`

Analoog aan `src/lib/onboarding/create-client-with-listings.ts`, maar zonder listings/nulmeting, mét wachtwoord bij het aanmaken van de auth-gebruiker, en met een bewust niet-blokkerende adminmail (in tegenstelling tot de bestaande welkomstmail, die wél de hele registratie laat mislukken als hij niet verstuurd kan worden — dat kan hier niet, want de welkomstmail is in de bestaande flow de enige manier voor de klant om in te loggen, terwijl de klant hier al meteen een eigen wachtwoord heeft en de admin-notificatiemail dus puur een bonus-signaal is naast de "Nieuw"-badge).

- [ ] **Step 1: Schrijf de kernlogica**

Create `src/lib/registratie/registreer-klant.ts`:

```typescript
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { registratieSchema, type RegistratieInput } from '@/lib/validation/registratie-schema';
import { sendAdminNotificatieNieuweKlant } from '@/lib/email/send-admin-notificatie-nieuwe-klant';

export class RegistratieError extends Error {}

export async function registreerKlant(input: RegistratieInput) {
  const data = registratieSchema.parse(input);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('email', data.email)
    .maybeSingle();

  if (existing) {
    throw new RegistratieError('Er bestaat al een klant met dit e-mailadres.');
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      naam: data.naam,
      email: data.email,
      telefoon: data.telefoon ?? null,
      status: 'onboarding',
      zelf_geregistreerd: true,
    })
    .select('id')
    .single();

  if (clientError || !client) {
    throw new RegistratieError(`Kon klant niet aanmaken: ${clientError?.message}`);
  }

  const clientId = client.id;
  let authUserId: string | undefined;

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.wachtwoord,
      email_confirm: true,
    });

    if (authError || !authUser.user) {
      throw new RegistratieError(`Kon account niet aanmaken: ${authError?.message}`);
    }
    authUserId = authUser.user.id;

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authUser.user.id,
      role: 'klant',
      client_id: clientId,
      email: data.email,
      naam: data.naam,
    });

    if (profileError) {
      throw new RegistratieError(`Kon profiel niet aanmaken: ${profileError.message}`);
    }

    // Bewust geen rollback op een mislukte adminmail: de klant heeft op dit punt al een
    // volledig werkend account (met eigen wachtwoord, in tegenstelling tot de bestaande
    // onboarding-flow die voor inloggen afhankelijk is van de welkomstmail). De admin ziet
    // de nieuwe klant sowieso terug via de "Nieuw"-badge in het klantenoverzicht.
    try {
      await sendAdminNotificatieNieuweKlant({
        naam: data.naam,
        email: data.email,
        telefoon: data.telefoon ?? null,
        clientId,
      });
    } catch (emailError) {
      console.error('[registreerKlant] admin-notificatiemail is mislukt:', emailError);
    }

    return { clientId };
  } catch (error) {
    const { error: cascadeError } = await supabase.rpc('delete_client_cascade', {
      target_client_id: clientId,
    });
    if (cascadeError) {
      console.error(`[registreerKlant] rollback van client ${clientId} is mislukt:`, cascadeError);
    }

    if (authUserId) {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(authUserId);
      if (deleteUserError) {
        console.error(`[registreerKlant] opruimen van auth user ${authUserId} is mislukt:`, deleteUserError);
      }
    }

    console.error('[registreerKlant] registratie mislukt, oorspronkelijke fout:', error);
    throw error;
  }
}
```

- [ ] **Step 2: Schrijf de integratietest**

Create `tests/integration/registreer-klant.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { registreerKlant, RegistratieError } from '@/lib/registratie/registreer-klant';

vi.mock('@/lib/email/send-admin-notificatie-nieuwe-klant', () => ({
  sendAdminNotificatieNieuweKlant: vi.fn().mockResolvedValue(undefined),
}));

import { sendAdminNotificatieNieuweKlant } from '@/lib/email/send-admin-notificatie-nieuwe-klant';

const admin = createAdminClient();

const geldigeInput = {
  naam: 'Test Klant',
  email: `registratie-${Date.now()}@voorbeeld.nl`,
  telefoon: '0612345678',
  wachtwoord: 'geheimwachtwoord123',
  wachtwoordBevestiging: 'geheimwachtwoord123',
  honeypot: '',
};

let aangemaakteClientId: string | undefined;

afterEach(async () => {
  if (aangemaakteClientId) {
    await admin.from('clients').delete().eq('id', aangemaakteClientId);
    aangemaakteClientId = undefined;
  }
});

describe('registreerKlant', () => {
  it('maakt client (zelf_geregistreerd), auth user en profiel aan, zonder listings', async () => {
    const input = { ...geldigeInput, email: `registratie-${Date.now()}@voorbeeld.nl` };
    const result = await registreerKlant(input);
    aangemaakteClientId = result.clientId;

    const { data: client } = await admin.from('clients').select('*').eq('id', result.clientId).single();
    expect(client?.email).toBe(input.email);
    expect(client?.zelf_geregistreerd).toBe(true);
    expect(client?.status).toBe('onboarding');

    const { data: listings } = await admin.from('listings').select('*').eq('client_id', result.clientId);
    expect(listings).toEqual([]);

    const { data: profile } = await admin.from('profiles').select('*').eq('client_id', result.clientId).single();
    expect(profile?.role).toBe('klant');

    await admin.auth.admin.deleteUser(profile!.id);
  });

  it('wijst een dubbel e-mailadres af zonder een tweede client aan te maken', async () => {
    const eersteInput = { ...geldigeInput, email: `registratie-dubbel-${Date.now()}@voorbeeld.nl` };
    const eersteResult = await registreerKlant(eersteInput);
    aangemaakteClientId = eersteResult.clientId;

    await expect(registreerKlant(eersteInput)).rejects.toThrow(RegistratieError);

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('client_id', eersteResult.clientId)
      .single();
    await admin.auth.admin.deleteUser(profile!.id);
  });

  it('rolt de client en de auth user niet terug wanneer alleen de notificatiemail mislukt', async () => {
    const email = `registratie-notificatie-${Date.now()}@voorbeeld.nl`;
    const input = { ...geldigeInput, email };

    vi.mocked(sendAdminNotificatieNieuweKlant).mockRejectedValueOnce(new Error('SMTP timeout (test)'));

    const result = await registreerKlant(input);
    aangemaakteClientId = result.clientId;

    const { data: client } = await admin.from('clients').select('id').eq('email', email).maybeSingle();
    expect(client).not.toBeNull();

    const { data: profile } = await admin.from('profiles').select('id').eq('client_id', result.clientId).single();
    expect(profile).not.toBeNull();
    await admin.auth.admin.deleteUser(profile!.id);
  });
});
```

- [ ] **Step 3: Run de tests**

Run: `npx vitest run --fileParallelism=false tests/integration/registreer-klant.test.ts`
Expected: 3 tests slagen. (Vereist `ADMIN_NOTIFICATIE_EMAIL`/`RESEND_API_KEY`/`RESEND_FROM_EMAIL` niet per se geldig, want de e-mailfunctie is gemockt in deze test — alleen de Supabase-omgevingsvariabelen moeten kloppen, net als bij de bestaande onboarding-integratietest.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/registratie/registreer-klant.ts tests/integration/registreer-klant.test.ts
git commit -m "feat: kernlogica voor zelfregistratie (client + auth user + profiel, zonder listings)"
```

---

### Task 6: Wachtwoord-gate voor de aanmeldpagina

**Files:**
- Create: `src/lib/registratie/toegang-token.ts`
- Create: `src/lib/registratie/toegang.ts`
- Create: `src/app/api/registreren/toegang/route.ts`
- Test: `tests/unit/toegang-token.test.ts`

De ondertekenings-/verificatielogica staat in een apart, puur bestand (`toegang-token.ts`, geen afhankelijkheid van `next/headers`) zodat die zonder gemockte cookies te unit-testen is. `toegang.ts` is de dunne wrapper die deze logica aan een httpOnly-cookie koppelt.

- [ ] **Step 1: Schrijf de falende tests**

Create `tests/unit/toegang-token.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { maakToegangsToken, tokenIsGeldig } from '@/lib/registratie/toegang-token';

describe('toegang-token', () => {
  beforeEach(() => {
    process.env.REGISTRATIE_WACHTWOORD = 'test-wachtwoord';
  });

  it('accepteert een geldig, niet-verlopen token', () => {
    const token = maakToegangsToken(Date.now() + 60_000);
    expect(tokenIsGeldig(token)).toBe(true);
  });

  it('wijst een verlopen token af', () => {
    const token = maakToegangsToken(Date.now() - 1000);
    expect(tokenIsGeldig(token)).toBe(false);
  });

  it('wijst een geknoeid token af', () => {
    const token = maakToegangsToken(Date.now() + 60_000);
    const laatsteChar = token.slice(-1);
    const geknoeid = token.slice(0, -1) + (laatsteChar === '0' ? '1' : '0');
    expect(tokenIsGeldig(geknoeid)).toBe(false);
  });

  it('wijst een ontbrekend token af', () => {
    expect(tokenIsGeldig(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run de tests en verifieer dat ze falen**

Run: `npx vitest run tests/unit/toegang-token.test.ts`
Expected: FAIL met "Cannot find module '@/lib/registratie/toegang-token'"

- [ ] **Step 3: Schrijf de token-logica**

Create `src/lib/registratie/toegang-token.ts`:

```typescript
import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

function handtekening(verlooptOp: number): string {
  const hmac = createHmac('sha256', process.env.REGISTRATIE_WACHTWOORD ?? '');
  hmac.update(String(verlooptOp));
  return hmac.digest('hex');
}

export function maakToegangsToken(verlooptOp: number): string {
  return `${verlooptOp}.${handtekening(verlooptOp)}`;
}

export function tokenIsGeldig(token: string | undefined): boolean {
  if (!token) return false;

  const [verlooptOpStr, opgegevenHandtekening] = token.split('.');
  const verlooptOp = Number(verlooptOpStr);
  if (!verlooptOp || !opgegevenHandtekening || Date.now() > verlooptOp) return false;

  const verwacht = handtekening(verlooptOp);
  const a = Buffer.from(opgegevenHandtekening);
  const b = Buffer.from(verwacht);
  // timingSafeEqual vereist gelijke buffer-lengte — een lengteverschil betekent sowieso
  // een ongeldig/geknoeid token.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run de tests en verifieer dat ze slagen**

Run: `npx vitest run tests/unit/toegang-token.test.ts`
Expected: alle 4 tests slagen.

- [ ] **Step 5: Schrijf de cookie-wrapper**

Create `src/lib/registratie/toegang.ts`:

```typescript
import 'server-only';
import { cookies } from 'next/headers';
import { maakToegangsToken, tokenIsGeldig } from './toegang-token';

const COOKIE_NAAM = 'registratie_toegang';
const GELDIGHEID_MS = 24 * 60 * 60 * 1000;

export async function zetRegistratieToegangCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAAM, maakToegangsToken(Date.now() + GELDIGHEID_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GELDIGHEID_MS / 1000,
    path: '/',
  });
}

export async function heeftRegistratieToegang(): Promise<boolean> {
  const cookieStore = await cookies();
  return tokenIsGeldig(cookieStore.get(COOKIE_NAAM)?.value);
}
```

- [ ] **Step 6: Schrijf de gate-route**

Create `src/app/api/registreren/toegang/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { magPogingDoen } from '@/lib/rate-limit';
import { zetRegistratieToegangCookie } from '@/lib/registratie/toegang';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'onbekend';
  if (!magPogingDoen(ip)) {
    return NextResponse.json({ error: 'Te veel pogingen, probeer het later opnieuw.' }, { status: 429 });
  }

  const { wachtwoord } = await request.json();

  if (wachtwoord !== process.env.REGISTRATIE_WACHTWOORD) {
    return NextResponse.json({ error: 'Onjuist wachtwoord.' }, { status: 401 });
  }

  await zetRegistratieToegangCookie();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 8: Commit**

```bash
git add src/lib/registratie/toegang-token.ts src/lib/registratie/toegang.ts src/app/api/registreren/toegang/route.ts tests/unit/toegang-token.test.ts
git commit -m "feat: wachtwoord-gate voor de zelfregistratie-pagina"
```

---

### Task 7: Registratiepagina, formulier en auto-login

**Files:**
- Create: `src/components/registratie/wachtwoord-gate.tsx`
- Create: `src/components/registratie/registratie-form.tsx`
- Create: `src/app/[locale]/registreren/page.tsx`
- Create: `src/app/api/registreren/route.ts`

Dit is de laatste laag die alles samenbrengt: de pagina beslist server-side of de gate getoond wordt (via `heeftRegistratieToegang()` uit Task 6), en het formulier logt de klant na een succesvolle registratie direct in — hetzelfde `signInWithPassword`-patroon dat `/login` al gebruikt.

- [ ] **Step 1: Schrijf het wachtwoord-gate-component**

Create `src/components/registratie/wachtwoord-gate.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function WachtwoordGate() {
  const router = useRouter();
  const [wachtwoord, setWachtwoord] = useState('');
  const [status, setStatus] = useState<'idle' | 'bezig' | 'mislukt'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('bezig');
    const response = await fetch('/api/registreren/toegang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wachtwoord }),
    });
    if (!response.ok) {
      setStatus('mislukt');
      return;
    }
    // Herlaadt de server component (registreren/page.tsx), die nu via de zojuist gezette
    // cookie heeftRegistratieToegang() === true ziet en het echte formulier toont.
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="gate-wachtwoord">Wachtwoord</Label>
        <Input
          id="gate-wachtwoord"
          type="password"
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={status === 'bezig'}>
        {status === 'bezig' ? 'Bezig...' : 'Doorgaan'}
      </Button>
      {status === 'mislukt' && (
        <p className="text-sm text-destructive">Onjuist wachtwoord, probeer het opnieuw.</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Schrijf het registratieformulier**

Create `src/components/registratie/registratie-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registratieSchema, type RegistratieInput } from '@/lib/validation/registratie-schema';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RegistratieForm() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'versturen' | 'mislukt'>('idle');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  const form = useForm<RegistratieInput>({
    resolver: zodResolver(registratieSchema),
    defaultValues: {
      naam: '',
      email: '',
      telefoon: '',
      wachtwoord: '',
      wachtwoordBevestiging: '',
      honeypot: '',
    },
  });

  async function onSubmit(data: RegistratieInput) {
    setStatus('versturen');
    setFoutmelding(null);
    try {
      const response = await fetch('/api/registreren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? 'Er ging iets mis.');
      }

      // Het formulier heeft het net gekozen wachtwoord nog in state — hiermee kunnen we
      // de klant client-side meteen inloggen, zelfde patroon als het bestaande
      // wachtwoord-inloggen op /login (signInWithPassword).
      const supabase = createClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.wachtwoord,
      });
      if (loginError) {
        throw new Error('Account is aangemaakt, maar automatisch inloggen is mislukt. Log handmatig in via /login.');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setStatus('mislukt');
      setFoutmelding((error as Error).message);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-4">
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register('honeypot')} />

      <div>
        <Label htmlFor="naam">Naam</Label>
        <Input id="naam" {...form.register('naam')} />
        {form.formState.errors.naam && (
          <p className="text-sm text-destructive">{form.formState.errors.naam.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" {...form.register('email')} />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="telefoon">Telefoon (optioneel)</Label>
        <Input id="telefoon" {...form.register('telefoon')} />
      </div>
      <div>
        <Label htmlFor="wachtwoord">Wachtwoord</Label>
        <Input id="wachtwoord" type="password" {...form.register('wachtwoord')} />
        {form.formState.errors.wachtwoord && (
          <p className="text-sm text-destructive">{form.formState.errors.wachtwoord.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="wachtwoordBevestiging">Wachtwoord bevestigen</Label>
        <Input id="wachtwoordBevestiging" type="password" {...form.register('wachtwoordBevestiging')} />
        {form.formState.errors.wachtwoordBevestiging && (
          <p className="text-sm text-destructive">{form.formState.errors.wachtwoordBevestiging.message}</p>
        )}
      </div>

      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}

      <Button type="submit" disabled={status === 'versturen'} className="w-full sm:w-auto">
        {status === 'versturen' ? 'Bezig...' : 'Account aanmaken'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Schrijf de pagina**

Create `src/app/[locale]/registreren/page.tsx`:

```tsx
import { heeftRegistratieToegang } from '@/lib/registratie/toegang';
import { WachtwoordGate } from '@/components/registratie/wachtwoord-gate';
import { RegistratieForm } from '@/components/registratie/registratie-form';

export default async function RegistrerenPage() {
  const toegang = await heeftRegistratieToegang();

  return (
    <main className="mx-auto max-w-3xl py-16 px-4">
      <h1 className="font-serif text-3xl mb-2">Maak je account aan</h1>
      <p className="text-muted-foreground mb-10">
        Vul je gegevens in om toegang te krijgen tot je klantportaal.
      </p>
      {toegang ? <RegistratieForm /> : <WachtwoordGate />}
    </main>
  );
}
```

Deze route heeft geen middleware-wijziging nodig: `src/lib/supabase/middleware.ts` gate alleen paden die met `/admin` of `/dashboard` beginnen — `/registreren` valt daar buiten en is dus al publiek toegankelijk.

- [ ] **Step 4: Schrijf de registratie-API-route**

Create `src/app/api/registreren/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { registreerKlant, RegistratieError } from '@/lib/registratie/registreer-klant';
import { magPogingDoen } from '@/lib/rate-limit';
import { heeftRegistratieToegang } from '@/lib/registratie/toegang';

export async function POST(request: NextRequest) {
  if (!(await heeftRegistratieToegang())) {
    return NextResponse.json({ error: 'Niet geautoriseerd.' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'onbekend';
  if (!magPogingDoen(ip)) {
    return NextResponse.json({ error: 'Te veel pogingen, probeer het later opnieuw.' }, { status: 429 });
  }

  const body = await request.json();

  if (body.honeypot) {
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await registreerKlant(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RegistratieError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Er ging iets mis, probeer het later opnieuw.' }, { status: 500 });
  }
}
```

De `heeftRegistratieToegang()`-check hier voorkomt dat iemand de gate omzeilt door deze route rechtstreeks aan te roepen zonder ooit het juiste wachtwoord op `/registreren` te hebben ingevoerd.

- [ ] **Step 5: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 6: Commit**

```bash
git add src/components/registratie/wachtwoord-gate.tsx src/components/registratie/registratie-form.tsx src/app/\[locale\]/registreren/page.tsx src/app/api/registreren/route.ts
git commit -m "feat: publieke zelfregistratiepagina met wachtwoord-gate en auto-login"
```

---

### Task 8: "Nieuw"-badge in klantenoverzicht

**Files:**
- Modify: `src/app/[locale]/admin/klanten/page.tsx`

- [ ] **Step 1: Voeg de kolom toe aan de query en render de badge**

In `src/app/[locale]/admin/klanten/page.tsx`, verander:

```tsx
  const { data: klanten, error } = await supabase
    .from('clients')
    .select('id, naam, email, status, aangemaakt_op, listings(count)')
    .order('aangemaakt_op', { ascending: false });
```

naar:

```tsx
  const { data: klanten, error } = await supabase
    .from('clients')
    .select('id, naam, email, status, zelf_geregistreerd, aangemaakt_op, listings(count)')
    .order('aangemaakt_op', { ascending: false });
```

En verander:

```tsx
                  <td className="py-2">
                    <Link href={`/admin/klanten/${klant.id}/instellingen`} className="hover:underline">{klant.naam}</Link>
                  </td>
```

naar:

```tsx
                  <td className="py-2">
                    <Link href={`/admin/klanten/${klant.id}/instellingen`} className="hover:underline">{klant.naam}</Link>
                    {klant.zelf_geregistreerd && klant.status !== 'actief' && (
                      <span className="ml-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary align-middle">
                        Nieuw
                      </span>
                    )}
                  </td>
```

De badge verschijnt dus alleen bij klanten die zichzelf hebben geregistreerd én nog niet handmatig op "actief" zijn gezet door de admin — precies zoals afgesproken in de spec.

- [ ] **Step 2: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 3: Commit**

```bash
git add src/app/\[locale\]/admin/klanten/page.tsx
git commit -m "feat: Nieuw-badge voor zelfregistratie-klanten in klantenoverzicht"
```

---

### Task 9: Cijfers-pagina — lege status bij nul accommodaties

**Files:**
- Modify: `src/components/dashboard/omzet-dashboard.tsx`

`WowCijfer` en `ResultatenGrafiek` handelen 0 listings al netjes af (bestaande `null`/lege-array-paden, geen wijziging nodig). Alleen `OmzetDashboard`'s KPI-kaarten/kanaaluitsplitsing/trendtabel-blok toont nu nog een raster vol €0-rijen; die vervangen we door een korte melding.

- [ ] **Step 1: Voeg de lege-status toe**

In `src/components/dashboard/omzet-dashboard.tsx`, verander:

```tsx
      {laden ? (
        <p className="text-sm text-muted-foreground animate-pulse">Omzetdata ophalen...</p>
      ) : !data || !weergave ? null : (
        <div className="space-y-8">
          <KpiKaarten
            huidig={weergave.huidig}
            vergelijking={weergave.vergelijking}
            vergelijkLabel={vergelijkModus === 'stly' ? 'STLY' : 'nulmeting'}
          />
          <KanaalUitsplitsing kanalen={weergave.kanalen} />
          {weergave.toonListingsTabel && <ListingsTabel listings={data.listings} />}
          <TrendTabel trend={weergave.trend} vergelijkModus={vergelijkModus} />
        </div>
      )}
```

naar:

```tsx
      {laden ? (
        <p className="text-sm text-muted-foreground animate-pulse">Omzetdata ophalen...</p>
      ) : !data || !weergave ? null : data.listings.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          We zijn je accommodatie(s) nog aan het koppelen — kom hier binnenkort terug.
        </p>
      ) : (
        <div className="space-y-8">
          <KpiKaarten
            huidig={weergave.huidig}
            vergelijking={weergave.vergelijking}
            vergelijkLabel={vergelijkModus === 'stly' ? 'STLY' : 'nulmeting'}
          />
          <KanaalUitsplitsing kanalen={weergave.kanalen} />
          {weergave.toonListingsTabel && <ListingsTabel listings={data.listings} />}
          <TrendTabel trend={weergave.trend} vergelijkModus={vergelijkModus} />
        </div>
      )}
```

`data.listings` komt uit de eigen fetch van dit component (`/api/dashboard/omzet` of `/api/admin/klanten/{clientId}/omzet`) en is al bevestigd een lege array te zijn bij een klant zonder accommodaties (geen crash, geen `NaN`) — deze wijziging raakt alleen de weergave, niet de dataverwerking.

- [ ] **Step 2: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/omzet-dashboard.tsx
git commit -m "fix: nette lege status op Cijfers-pagina bij nul accommodaties i.p.v. een raster vol €0"
```

---

### Task 10: Volledige verificatie en push

- [ ] **Step 1: Run de volledige testsuite**

Run: `npx vitest run --fileParallelism=false`
Expected: alle tests slagen, inclusief 15 nieuwe tests uit dit plan (Task 1: 3, Task 3: 5, Task 5: 3, Task 6: 4). Vereist een lokaal draaiende Supabase-stack (`npx supabase start`).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: geen nieuwe fouten. De twee al bestaande, ongerelateerde issues (`src/app/auth/confirm/page.tsx`, de gitignorede `supabase/.temp/`-map) zijn bekend en verwacht.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: bouwt zonder fouten (al eerder bevestigd per taak, dit is de laatste gate).

- [ ] **Step 4: Handmatige verificatie**

Start de dev-server (`npm run dev`) en loop de volgende checklist door — dit vraagt echte browser/e-mail-toegang die in deze omgeving niet beschikbaar is, dus dit is voor de gebruiker om zelf te doen:

- **Wachtwoord-gate:** open `/registreren` zonder cookie → alleen het wachtwoordveld is zichtbaar. Verkeerd wachtwoord → foutmelding. Juist wachtwoord (uit je lokale `REGISTRATIE_WACHTWOORD`) → het echte formulier verschijnt.
- **Registratieformulier:** vul naam/e-mail/telefoon/wachtwoord in, klik "Account aanmaken" → je wordt automatisch ingelogd en komt op `/dashboard` terecht.
- **Voortgang:** de standaardchecklist (20 items, alles uitgevinkt) is meteen zichtbaar.
- **Cijfers:** toont de nieuwe "we zijn je accommodatie(s) nog aan het koppelen"-melding, geen raster vol €0.
- **Admin-notificatiemail:** een e-mail is aangekomen op het `ADMIN_NOTIFICATIE_EMAIL`-adres met naam/e-mail/telefoon en een link naar de klantdetailpagina.
- **"Nieuw"-badge:** de nieuwe klant staat bovenaan `/admin/klanten` met een "Nieuw"-label naast de naam.
- **Accommodatie toevoegen:** open de klantdetailpagina van deze nieuwe klant, klik "+ Accommodatie toevoegen", vul een naam in → de listing verschijnt met een Nulmeting-tabblad vol nullen, die je met de bestaande correctierij kunt bijwerken; de PriceLabs-koppeling-UI werkt op deze listing zoals op elke andere.
- **Badge verdwijnt:** zet de status van deze klant via "Bewerken" op "actief" → de "Nieuw"-badge verdwijnt uit het overzicht.
- **Dubbele registratie:** probeer nogmaals te registreren met hetzelfde e-mailadres → duidelijke foutmelding, geen nieuwe klant aangemaakt.

- [ ] **Step 5: Productie-migratie**

Deze plan bevat één databasewijziging die **niet automatisch** op productie wordt toegepast (geen productie-DB-credentials beschikbaar in deze omgeving). Voer dit zelf uit via het Supabase-dashboard (SQL editor) tegen de productie-database, vóór je deze branch naar productie deployt:

```sql
alter table clients add column zelf_geregistreerd boolean not null default false;
```

Zet daarnaast in de Railway-omgevingsvariabelen (naast de al bestaande `RESEND_API_KEY`/`RESEND_FROM_EMAIL`/etc.):
- `ADMIN_NOTIFICATIE_EMAIL=info@bnbassistant.com`
- `REGISTRATIE_WACHTWOORD=` (kies zelf een wachtwoord — dit is wat je straks per e-mail aan nieuwe klanten doorgeeft)

- [ ] **Step 6: Push**

```bash
git push origin main
```
