# Inloggegevens delen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klanten kunnen versleuteld inloggegevens (bijvoorbeeld voor Airbnb of een PMS-systeem) met de admin delen via een nieuwe pagina in het klantportaal; de admin ziet ze read-only op de klantdetailpagina en kan wachtwoorden per item onthullen.

**Architecture:** Eén nieuwe tabel (`inloggegevens`, client-scoped via RLS), één nieuwe versleutelingsmodule (AES-256-GCM, sleutel alleen als env-variabele), één gedeelde set UI-componenten (herbruikt door zowel de klant-pagina als de admin-sectie, met een `kanBewerken`-prop die het verschil regelt — zelfde patroon als de al bestaande gedeelde Voortgang-componenten).

**Tech Stack:** Next.js Server Actions, Supabase Postgres met RLS, Node's ingebouwde `crypto`-module (geen nieuwe dependency), Resend voor de notificatiemail, vitest voor tests.

**Reference:** Spec op `docs/superpowers/specs/2026-08-15-inloggegevens-delen-design.md`.

**Belangrijke correctie t.o.v. de letterlijke spec-tekst:** de spec noemt de admin-kant "een nieuw tabblad naast de bestaande listing-tabbladen". Bij het uitschrijven van dit plan bleek dat de bestaande Koppeling/Nulmeting/Resultaten/Actielog-tabbladen **per accommodatie** worden gerenderd (binnen een `listings?.map(...)`-loop), terwijl inloggegevens **klant-breed** zijn, niet per accommodatie. Functioneel/UX-doel blijft exact hetzelfde (een duidelijk afgebakende, read-only plek op de klantdetailpagina) — alleen de technische vorm wordt een nieuwe top-level `<section>` op de pagina (net als de bestaande "Accommodaties"-sectie), vóór de per-listing-tabbladen, in plaats van een `<TabsTrigger>` erbinnen. Task 7 hieronder implementeert deze gecorrigeerde vorm.

---

### Task 1: Database — `inloggegevens`-tabel

**Files:**
- Create: `supabase/migrations/20260815110000_inloggegevens.sql`
- Modify: `src/types/database.ts` (via regeneratie, niet handmatig)

- [ ] **Step 1: Schrijf de migratie**

Create `supabase/migrations/20260815110000_inloggegevens.sql`:

```sql
-- Inloggegevens die een klant met de admin deelt (bv. voor Airbnb of een PMS-systeem),
-- t.b.v. koppelingen zoals PriceLabs. Het wachtwoord wordt versleuteld opgeslagen (zie
-- src/lib/inloggegevens/versleuteling.ts) — deze kolom bevat dus nooit platte tekst.
create table inloggegevens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  naam text not null,
  gebruikersnaam text,
  wachtwoord_versleuteld text not null,
  notitie text,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_op timestamptz not null default now()
);

create index inloggegevens_client_id_idx on inloggegevens(client_id);

alter table inloggegevens enable row level security;

grant select, insert, update, delete on inloggegevens to anon, authenticated, service_role;

-- Klant beheert alleen eigen items volledig (aanmaken, lezen, wijzigen, verwijderen).
create policy "klant volledige toegang eigen inloggegevens" on inloggegevens
  for all using (client_id = current_client_id()) with check (client_id = current_client_id());

-- Admin leest alle items, maar mag ze niet zelf aanmaken/wijzigen/verwijderen — dit blijft
-- puur iets dat de klant met de admin deelt.
create policy "admin leest inloggegevens" on inloggegevens
  for select using (is_admin());
```

- [ ] **Step 2: Pas de migratie lokaal toe en regenereer de types**

Run (start eerst `npx supabase start` als de lokale stack nog niet draait — check met `docker ps`):
```bash
npx supabase db reset
npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts
```
Expected: `db reset` past alle migraties (inclusief de nieuwe) opnieuw toe zonder fouten; `src/types/database.ts` bevat nu een `inloggegevens`-tabel met `id`, `client_id`, `naam`, `gebruikersnaam`, `wachtwoord_versleuteld`, `notitie`, `aangemaakt_op`, `gewijzigd_op`.

- [ ] **Step 3: Verifieer**

Run: `npx tsc --noEmit` en `npm run build` — beide moeten zonder fouten slagen.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815110000_inloggegevens.sql src/types/database.ts
git commit -m "feat: voeg inloggegevens-tabel toe (versleuteld, klant deelt met admin)"
```

**Let op voor Task 8:** deze migratie moet ook handmatig op productie toegepast worden — Task 8 herhaalt de exacte SQL.

---

### Task 2: Versleutelingsmodule

**Files:**
- Create: `src/lib/inloggegevens/versleuteling.ts`
- Test: `tests/unit/versleuteling.test.ts`

- [ ] **Step 1: Schrijf de falende tests**

Create `tests/unit/versleuteling.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { versleutel, ontsleutel } from '@/lib/inloggegevens/versleuteling';

// Een deterministieve, geldige 32-byte testsleutel (base64) — niet de echte productiesleutel.
const TEST_SLEUTEL = Buffer.alloc(32, 7).toString('base64');

describe('versleuteling', () => {
  beforeEach(() => {
    process.env.INLOGGEGEVENS_SLEUTEL = TEST_SLEUTEL;
  });

  it('versleutelt en ontsleutelt een waarde correct', () => {
    const origineel = 'super-geheim-wachtwoord-123';
    const versleuteld = versleutel(origineel);
    expect(versleuteld).not.toBe(origineel);
    expect(ontsleutel(versleuteld)).toBe(origineel);
  });

  it('geeft elke keer een andere cijfertekst voor dezelfde waarde (willekeurige IV)', () => {
    const a = versleutel('zelfde-wachtwoord');
    const b = versleutel('zelfde-wachtwoord');
    expect(a).not.toBe(b);
    expect(ontsleutel(a)).toBe('zelfde-wachtwoord');
    expect(ontsleutel(b)).toBe('zelfde-wachtwoord');
  });

  it('laat ontsleutel falen bij geknoei met de cijfertekst', () => {
    const versleuteld = versleutel('wachtwoord');
    const delen = versleuteld.split('.');
    const geknoeideCijfertekst = `${delen[0]}.${delen[1]}.${delen[2].slice(0, -4)}AAAA`;
    expect(() => ontsleutel(geknoeideCijfertekst)).toThrow();
  });

  it('gooit een duidelijke fout als INLOGGEGEVENS_SLEUTEL ontbreekt bij versleutelen', () => {
    delete process.env.INLOGGEGEVENS_SLEUTEL;
    expect(() => versleutel('wachtwoord')).toThrow('INLOGGEGEVENS_SLEUTEL ontbreekt');
  });

  it('gooit een duidelijke fout als INLOGGEGEVENS_SLEUTEL ontbreekt bij ontsleutelen', () => {
    const versleuteld = versleutel('wachtwoord');
    delete process.env.INLOGGEGEVENS_SLEUTEL;
    expect(() => ontsleutel(versleuteld)).toThrow('INLOGGEGEVENS_SLEUTEL ontbreekt');
  });
});
```

- [ ] **Step 2: Run de tests en verifieer dat ze falen**

Run: `npx vitest run tests/unit/versleuteling.test.ts`
Expected: FAIL met "Cannot find module '@/lib/inloggegevens/versleuteling'"

- [ ] **Step 3: Schrijf de module**

Create `src/lib/inloggegevens/versleuteling.ts`:

```typescript
import 'server-only';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITME = 'aes-256-gcm';
const IV_LENGTE = 12; // 96-bit — de aanbevolen/standaard IV-lengte voor GCM.

function haalSleutel(): Buffer {
  const sleutelBase64 = process.env.INLOGGEGEVENS_SLEUTEL;
  if (!sleutelBase64) {
    throw new Error('INLOGGEGEVENS_SLEUTEL ontbreekt — controleer de env vars van deze service.');
  }
  const sleutel = Buffer.from(sleutelBase64, 'base64');
  if (sleutel.length !== 32) {
    throw new Error('INLOGGEGEVENS_SLEUTEL moet een base64-gecodeerde 32-byte sleutel zijn.');
  }
  return sleutel;
}

export function versleutel(platteTekst: string): string {
  const sleutel = haalSleutel();
  const iv = randomBytes(IV_LENGTE);
  const cipher = createCipheriv(ALGORITME, sleutel, iv);
  const cijfertekst = Buffer.concat([cipher.update(platteTekst, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${cijfertekst.toString('base64')}`;
}

export function ontsleutel(cijfertekstToken: string): string {
  const sleutel = haalSleutel();
  const [ivBase64, authTagBase64, cijfertekstBase64] = cijfertekstToken.split('.');
  if (!ivBase64 || !authTagBase64 || !cijfertekstBase64) {
    throw new Error('Ongeldig versleutelingsformaat.');
  }
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const cijfertekst = Buffer.from(cijfertekstBase64, 'base64');
  const decipher = createDecipheriv(ALGORITME, sleutel, iv);
  decipher.setAuthTag(authTag);
  const platteTekst = Buffer.concat([decipher.update(cijfertekst), decipher.final()]);
  return platteTekst.toString('utf8');
}
```

- [ ] **Step 4: Run de tests en verifieer dat ze slagen**

Run: `npx vitest run tests/unit/versleuteling.test.ts`
Expected: alle 5 tests slagen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inloggegevens/versleuteling.ts tests/unit/versleuteling.test.ts
git commit -m "feat: AES-256-GCM-versleutelingsmodule voor inloggegevens"
```

---

### Task 3: Admin-notificatiemail bij nieuw inloggegeven

**Files:**
- Create: `src/lib/email/templates/admin-notificatie-nieuw-inloggegeven.ts`
- Create: `src/lib/email/send-admin-notificatie-nieuw-inloggegeven.ts`
- Modify: `.env.local.example`

Zelfde Resend-patroon als de al bestaande `send-admin-notificatie-nieuwe-klant.ts`.

- [ ] **Step 1: Schrijf de e-mailtemplate**

Create `src/lib/email/templates/admin-notificatie-nieuw-inloggegeven.ts`:

```typescript
export function adminNotificatieNieuwInloggegevenHtml({
  klantNaam,
  itemNaam,
  link,
}: {
  klantNaam: string;
  itemNaam: string;
  link: string;
}) {
  return `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #042C53;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">Nieuw inloggegeven gedeeld</h1>
    <p><strong>${klantNaam}</strong> heeft een nieuw inloggegeven toegevoegd: <strong>${itemNaam}</strong>.</p>
    <p>
      <a href="${link}" style="display:inline-block; background:#EF9F27; color:#042C53; font-weight:600; padding:12px 24px; border-radius:8px; text-decoration:none;">
        Bekijk in het admin-portaal
      </a>
    </p>
  </div>
  `;
}
```

Let op: bewust geen gebruikersnaam of wachtwoord in deze e-mail — e-mail is geen beveiligd kanaal.

- [ ] **Step 2: Schrijf de send-functie**

Create `src/lib/email/send-admin-notificatie-nieuw-inloggegeven.ts`:

```typescript
import 'server-only';
import { Resend } from 'resend';
import { adminNotificatieNieuwInloggegevenHtml } from './templates/admin-notificatie-nieuw-inloggegeven';

export async function sendAdminNotificatieNieuwInloggegeven({
  klantNaam,
  itemNaam,
  clientId,
}: {
  klantNaam: string;
  itemNaam: string;
  clientId: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.ADMIN_NOTIFICATIE_EMAIL!,
    subject: `Nieuw inloggegeven: ${itemNaam}`,
    html: adminNotificatieNieuwInloggegevenHtml({
      klantNaam,
      itemNaam,
      link: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/klanten/${clientId}/instellingen`,
    }),
  });

  if (error) {
    throw new Error(`Kon admin-notificatiemail niet versturen: ${error.message}`);
  }
}
```

- [ ] **Step 3: Voeg de nieuwe env-variabele toe aan het voorbeeldbestand**

In `.env.local.example`, voeg toe (na de bestaande `REGISTRATIE_WACHTWOORD=` regel):

```
INLOGGEGEVENS_SLEUTEL=
```

Genereer een geldige waarde voor je eigen lokale `.env.local` (niet gecommit) met:
```bash
openssl rand -base64 32
```
en zet die als `INLOGGEGEVENS_SLEUTEL=<uitkomst>` in je lokale `.env.local`.

- [ ] **Step 4: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/admin-notificatie-nieuw-inloggegeven.ts src/lib/email/send-admin-notificatie-nieuw-inloggegeven.ts .env.local.example
git commit -m "feat: e-mailfunctie voor admin-notificatie bij nieuw inloggegeven"
```

---

### Task 4: Server-acties

**Files:**
- Create: `src/lib/inloggegevens/acties.ts`
- Test: `tests/integration/inloggegevens-acties.test.ts`

Alle autorisatie loopt via RLS (Task 1), niet via losse app-laag-checks: `voegInloggegevenToe` wijst een admin-sessie automatisch af omdat admin-profielen geen `client_id` hebben (`if (!profile?.client_id) throw ...`); `wijzigInloggegeven`/`verwijderInloggegeven` raken bij een niet-eigen `id` simpelweg 0 rijen (RLS filtert ze onzichtbaar weg), wat wordt afgevangen met een nette foutmelding i.p.v. een technische lege-respons; `onthulWachtwoord` werkt voor zowel admin (leest alles) als klant (leest alleen eigen rijen) puur omdat de onderliggende `select` al RLS-gescoped is — er is dus geen aparte `is_admin()`-vs-eigenaar-vertakking in de code nodig.

- [ ] **Step 1: Schrijf de server-acties**

Create `src/lib/inloggegevens/acties.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { versleutel, ontsleutel } from './versleuteling';
import { sendAdminNotificatieNieuwInloggegeven } from '@/lib/email/send-admin-notificatie-nieuw-inloggegeven';

export async function voegInloggegevenToe(input: {
  naam: string;
  gebruikersnaam: string | null;
  wachtwoord: string;
  notitie: string | null;
}): Promise<void> {
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.wachtwoord.trim()) throw new Error('Wachtwoord is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd.');

  const { data: profile } = await supabase.from('profiles').select('client_id, naam').eq('id', user.id).maybeSingle();
  // Admin-profielen hebben geen client_id — dit weigert een admin-sessie dus automatisch,
  // zonder aparte rolcheck: alleen een klant-sessie kan hier voorbij komen.
  if (!profile?.client_id) throw new Error('Geen account gevonden.');

  const { error } = await supabase.from('inloggegevens').insert({
    client_id: profile.client_id,
    naam: input.naam.trim(),
    gebruikersnaam: input.gebruikersnaam,
    wachtwoord_versleuteld: versleutel(input.wachtwoord),
    notitie: input.notitie,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/inloggegevens');
  revalidatePath(`/admin/klanten/${profile.client_id}/instellingen`);

  // Bewust geen rollback op een mislukte notificatiemail: het inloggegeven is al
  // opgeslagen, en e-mail is puur een seintje — geen onderdeel van het daadwerkelijke
  // delen van de gegevens (dat gebeurt via de database, niet via de mail).
  try {
    await sendAdminNotificatieNieuwInloggegeven({
      klantNaam: profile.naam,
      itemNaam: input.naam.trim(),
      clientId: profile.client_id,
    });
  } catch (emailError) {
    console.error('[voegInloggegevenToe] admin-notificatiemail is mislukt:', emailError);
  }
}

export async function wijzigInloggegeven(input: {
  id: string;
  naam: string;
  gebruikersnaam: string | null;
  wachtwoord: string;
  notitie: string | null;
}): Promise<void> {
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd.');

  const updates: Record<string, unknown> = {
    naam: input.naam.trim(),
    gebruikersnaam: input.gebruikersnaam,
    notitie: input.notitie,
    gewijzigd_op: new Date().toISOString(),
  };
  // Leeg wachtwoordveld betekent: bestaande versleutelde waarde ongewijzigd laten — zo
  // hoeft er nooit ontsleuteld te worden puur om een bewerkformulier te vullen.
  if (input.wachtwoord.trim()) {
    updates.wachtwoord_versleuteld = versleutel(input.wachtwoord);
  }

  const { data: bijgewerkt, error } = await supabase
    .from('inloggegevens')
    .update(updates)
    .eq('id', input.id)
    .select('id, client_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Geen rij terug betekent hier: RLS heeft dit item onzichtbaar gemaakt (niet van deze
  // klant), niet per se dat het echt niet bestaat — dezelfde nette foutmelding dekt beide
  // gevallen zonder details te lekken over wat er wél bestaat.
  if (!bijgewerkt) throw new Error('Kon dit item niet vinden — mogelijk is het al verwijderd.');

  revalidatePath('/dashboard/inloggegevens');
  revalidatePath(`/admin/klanten/${bijgewerkt.client_id}/instellingen`);
}

export async function verwijderInloggegeven(input: { id: string }): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd.');

  const { data: verwijderd, error } = await supabase
    .from('inloggegevens')
    .delete()
    .eq('id', input.id)
    .select('client_id')
    .maybeSingle();
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/inloggegevens');
  if (verwijderd) {
    revalidatePath(`/admin/klanten/${verwijderd.client_id}/instellingen`);
  }
}

export async function onthulWachtwoord(input: {
  id: string;
}): Promise<{ succes: boolean; wachtwoord?: string; fout?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { succes: false, fout: 'Niet ingelogd.' };

  const { data: item, error } = await supabase
    .from('inloggegevens')
    .select('wachtwoord_versleuteld')
    .eq('id', input.id)
    .maybeSingle();
  if (error) return { succes: false, fout: error.message };
  if (!item) return { succes: false, fout: 'Item niet gevonden.' };

  try {
    return { succes: true, wachtwoord: ontsleutel(item.wachtwoord_versleuteld) };
  } catch {
    return { succes: false, fout: 'Kon wachtwoord niet ontsleutelen.' };
  }
}
```

- [ ] **Step 2: Schrijf de integratietest**

Create `tests/integration/inloggegevens-acties.test.ts` (zelfde login-via-cookie-store-patroon als eerdere authz-tests in dit project):

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/email/send-admin-notificatie-nieuw-inloggegeven', () => ({
  sendAdminNotificatieNieuwInloggegeven: vi.fn().mockResolvedValue(undefined),
}));

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

process.env.INLOGGEGEVENS_SLEUTEL = Buffer.alloc(32, 9).toString('base64');

const { voegInloggegevenToe, wijzigInloggegeven, verwijderInloggegeven, onthulWachtwoord } = await import(
  '@/lib/inloggegevens/acties'
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

let adminEmail: string;
let adminUserId: string;
let klantAClientId: string;
let klantAEmail: string;
let klantAUserId: string;
let klantBClientId: string;
let klantBEmail: string;
let klantBUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  adminEmail = `inloggegevens-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  const { data: klantA } = await admin
    .from('clients')
    .insert({ naam: 'Klant A', email: `inloggegevens-klant-a-${suffix}@test.local` })
    .select()
    .single();
  klantAClientId = klantA!.id;
  klantAEmail = `inloggegevens-klant-a-${suffix}@test.local`;
  const { data: klantAUserRes } = await admin.auth.admin.createUser({
    email: klantAEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantAUserId = klantAUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantAUserId, role: 'klant', client_id: klantAClientId, email: klantAEmail, naam: 'Klant A' });

  const { data: klantB } = await admin
    .from('clients')
    .insert({ naam: 'Klant B', email: `inloggegevens-klant-b-${suffix}@test.local` })
    .select()
    .single();
  klantBClientId = klantB!.id;
  klantBEmail = `inloggegevens-klant-b-${suffix}@test.local`;
  const { data: klantBUserRes } = await admin.auth.admin.createUser({
    email: klantBEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantBUserId = klantBUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantBUserId, role: 'klant', client_id: klantBClientId, email: klantBEmail, naam: 'Klant B' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', klantAClientId);
  await admin.from('clients').delete().eq('id', klantBClientId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(klantAUserId);
  await admin.auth.admin.deleteUser(klantBUserId);
});

describe('inloggegevens-acties', () => {
  it('klant A maakt een item aan, ziet het, en kan het wachtwoord onthullen', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);

    await voegInloggegevenToe({
      naam: 'Airbnb',
      gebruikersnaam: 'jan@voorbeeld.nl',
      wachtwoord: 'geheim-airbnb-wachtwoord',
      notitie: null,
    });

    const { data: items } = await admin.from('inloggegevens').select('*').eq('client_id', klantAClientId);
    expect(items).toHaveLength(1);
    expect(items![0].wachtwoord_versleuteld).not.toBe('geheim-airbnb-wachtwoord');

    const resultaat = await onthulWachtwoord({ id: items![0].id });
    expect(resultaat.succes).toBe(true);
    expect(resultaat.wachtwoord).toBe('geheim-airbnb-wachtwoord');
  });

  it('klant B kan het item van klant A niet zien of onthullen', async () => {
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    activeCookieStore = await loginAlsCookieStore(klantBEmail, wachtwoord);

    const resultaat = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Item niet gevonden.');

    await expect(
      wijzigInloggegeven({ id: itemVanA!.id, naam: 'Gekaapt', gebruikersnaam: null, wachtwoord: '', notitie: null })
    ).rejects.toThrow('Kon dit item niet vinden');
  });

  it('admin kan het item van klant A lezen en onthullen', async () => {
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const resultaat = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaat.succes).toBe(true);
    expect(resultaat.wachtwoord).toBe('geheim-airbnb-wachtwoord');
  });

  it('admin kan geen inloggegeven aanmaken namens een klant', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await expect(
      voegInloggegevenToe({ naam: 'Test', gebruikersnaam: null, wachtwoord: 'x', notitie: null })
    ).rejects.toThrow('Geen account gevonden.');
  });

  it('klant A kan een item bewerken; leeg wachtwoordveld behoudt het bestaande wachtwoord', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    await wijzigInloggegeven({
      id: itemVanA!.id,
      naam: 'Airbnb (bijgewerkt)',
      gebruikersnaam: 'jan@voorbeeld.nl',
      wachtwoord: '',
      notitie: 'geen wijziging aan wachtwoord',
    });

    const resultaat = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaat.wachtwoord).toBe('geheim-airbnb-wachtwoord');

    await wijzigInloggegeven({
      id: itemVanA!.id,
      naam: 'Airbnb (bijgewerkt)',
      gebruikersnaam: 'jan@voorbeeld.nl',
      wachtwoord: 'nieuw-wachtwoord',
      notitie: null,
    });

    const resultaatNa = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaatNa.wachtwoord).toBe('nieuw-wachtwoord');
  });

  it('klant A kan het item verwijderen', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    await verwijderInloggegeven({ id: itemVanA!.id });

    const { data: itemsNa } = await admin.from('inloggegevens').select('*').eq('client_id', klantAClientId);
    expect(itemsNa).toEqual([]);
  });
});
```

- [ ] **Step 3: Run de tests**

Run: `npx vitest run --fileParallelism=false tests/integration/inloggegevens-acties.test.ts`
Expected: 6 tests slagen.

- [ ] **Step 4: Commit**

```bash
git add src/lib/inloggegevens/acties.ts tests/integration/inloggegevens-acties.test.ts
git commit -m "feat: server-acties voor inloggegevens (aanmaken, wijzigen, verwijderen, onthullen)"
```

---

### Task 5: Gedeelde UI-componenten

**Files:**
- Create: `src/components/portal/inloggegeven-rij.tsx`
- Create: `src/components/portal/inloggegevens-lijst.tsx`
- Create: `src/components/portal/inloggegeven-toevoegen-formulier.tsx`
- Create: `src/components/portal/inloggegeven-bewerken-formulier.tsx`

Deze componenten worden in Task 6 (klant) en Task 7 (admin) hergebruikt — een `kanBewerken`-prop bepaalt of de bewerk-/verwijderknoppen en de toevoeg-knop zichtbaar zijn. Het "Toon"-wachtwoord-mechanisme werkt voor beide even hetzelfde (roept `onthulWachtwoord` aan, ongeacht rol — de server-actie zelf regelt via RLS wie welk item mag onthullen).

- [ ] **Step 1: Rij-component (met "Toon"-wachtwoord en, indien `kanBewerken`, bewerken/verwijderen)**

Create `src/components/portal/inloggegeven-rij.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { onthulWachtwoord, verwijderInloggegeven } from '@/lib/inloggegevens/acties';
import { Button } from '@/components/ui/button';
import { InloggegevenBewerkenFormulier } from './inloggegeven-bewerken-formulier';

export interface Inloggegeven {
  id: string;
  naam: string;
  gebruikersnaam: string | null;
  notitie: string | null;
}

export function InloggegevenRij({ item, kanBewerken }: { item: Inloggegeven; kanBewerken: boolean }) {
  const [wachtwoord, setWachtwoord] = useState<string | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toonWachtwoord() {
    setFoutmelding(null);
    startTransition(async () => {
      const resultaat = await onthulWachtwoord({ id: item.id });
      if (!resultaat.succes) {
        setFoutmelding(resultaat.fout ?? 'Kon wachtwoord niet onthullen.');
        return;
      }
      setWachtwoord(resultaat.wachtwoord ?? null);
    });
  }

  function verwijderen() {
    const bevestigd = window.confirm(`Weet je zeker dat je "${item.naam}" wilt verwijderen?`);
    if (!bevestigd) return;
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await verwijderInloggegeven({ id: item.id });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{item.naam}</h3>
        {kanBewerken && (
          <div className="flex gap-1">
            <InloggegevenBewerkenFormulier item={item} />
            <Button size="sm" variant="ghost" onClick={verwijderen} disabled={isPending}>
              Verwijderen
            </Button>
          </div>
        )}
      </div>
      {item.gebruikersnaam && (
        <p className="text-sm text-muted-foreground">Gebruikersnaam: {item.gebruikersnaam}</p>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Wachtwoord:</span>
        {wachtwoord ? (
          <span className="font-mono">{wachtwoord}</span>
        ) : (
          <>
            <span className="font-mono">••••••••</span>
            <Button size="sm" variant="ghost" onClick={toonWachtwoord} disabled={isPending}>
              {isPending ? 'Bezig...' : 'Toon'}
            </Button>
          </>
        )}
      </div>
      {item.notitie && <p className="text-sm text-muted-foreground">{item.notitie}</p>}
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Lijst-wrapper**

Create `src/components/portal/inloggegevens-lijst.tsx`:

```tsx
import { InloggegevenRij, type Inloggegeven } from './inloggegeven-rij';

export function InloggegevensLijst({ items, kanBewerken }: { items: Inloggegeven[]; kanBewerken: boolean }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen inloggegevens gedeeld.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <InloggegevenRij key={item.id} item={item} kanBewerken={kanBewerken} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Toevoegen-formulier**

Create `src/components/portal/inloggegeven-toevoegen-formulier.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegInloggegevenToe } from '@/lib/inloggegevens/acties';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function InloggegevenToevoegenFormulier() {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState('');
  const [gebruikersnaam, setGebruikersnaam] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [notitie, setNotitie] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await voegInloggegevenToe({
          naam: naam.trim(),
          gebruikersnaam: gebruikersnaam.trim() || null,
          wachtwoord,
          notitie: notitie.trim() || null,
        });
        setOpen(false);
        setNaam('');
        setGebruikersnaam('');
        setWachtwoord('');
        setNotitie('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (!nieuweOpen) {
      setNaam('');
      setGebruikersnaam('');
      setWachtwoord('');
      setNotitie('');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button size="sm" />}>+ Inloggegeven toevoegen</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inloggegeven toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="inloggegeven-naam">Naam</Label>
            <Input id="inloggegeven-naam" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Airbnb" />
          </div>
          <div>
            <Label htmlFor="inloggegeven-gebruikersnaam">Gebruikersnaam / e-mail (optioneel)</Label>
            <Input
              id="inloggegeven-gebruikersnaam"
              value={gebruikersnaam}
              onChange={(e) => setGebruikersnaam(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-wachtwoord">Wachtwoord</Label>
            <Input
              id="inloggegeven-wachtwoord"
              type="password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-notitie">Notitie (optioneel)</Label>
            <Input id="inloggegeven-notitie" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={isPending || !naam.trim() || !wachtwoord.trim()} onClick={toevoegen}>
            {isPending ? 'Bezig...' : 'Toevoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Bewerken-formulier**

Create `src/components/portal/inloggegeven-bewerken-formulier.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { wijzigInloggegeven } from '@/lib/inloggegevens/acties';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Inloggegeven } from './inloggegeven-rij';

export function InloggegevenBewerkenFormulier({ item }: { item: Inloggegeven }) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState(item.naam);
  const [gebruikersnaam, setGebruikersnaam] = useState(item.gebruikersnaam ?? '');
  const [wachtwoord, setWachtwoord] = useState('');
  const [notitie, setNotitie] = useState(item.notitie ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await wijzigInloggegeven({
          id: item.id,
          naam: naam.trim(),
          gebruikersnaam: gebruikersnaam.trim() || null,
          wachtwoord,
          notitie: notitie.trim() || null,
        });
        setOpen(false);
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function dialoogWisselen(nieuweOpen: boolean) {
    setOpen(nieuweOpen);
    if (nieuweOpen) {
      // Zelfde reden als bij andere bewerk-dialogen in dit project: deze component blijft
      // gemonteerd terwijl alleen de dialoog zelf sluit/opent, dus zonder reset zou een
      // niet-opgeslagen bewerking of een oude foutmelding blijven staan. Het wachtwoordveld
      // begint bewust leeg (zie hint hieronder) — nooit vooraf ontsleuteld.
      setNaam(item.naam);
      setGebruikersnaam(item.gebruikersnaam ?? '');
      setWachtwoord('');
      setNotitie(item.notitie ?? '');
      setFoutmelding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dialoogWisselen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Bewerken</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inloggegeven bewerken</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="inloggegeven-bewerk-naam">Naam</Label>
            <Input id="inloggegeven-bewerk-naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="inloggegeven-bewerk-gebruikersnaam">Gebruikersnaam / e-mail</Label>
            <Input
              id="inloggegeven-bewerk-gebruikersnaam"
              value={gebruikersnaam}
              onChange={(e) => setGebruikersnaam(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-bewerk-wachtwoord">Wachtwoord</Label>
            <Input
              id="inloggegeven-bewerk-wachtwoord"
              type="password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
              placeholder="Laat leeg om het huidige wachtwoord te behouden"
            />
          </div>
          <div>
            <Label htmlFor="inloggegeven-bewerk-notitie">Notitie</Label>
            <Input id="inloggegeven-bewerk-notitie" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
          </div>
          {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={isPending || !naam.trim()} onClick={opslaan}>
            {isPending ? 'Bezig...' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten (deze componenten worden pas in Task 6/7 daadwerkelijk gebruikt, dit is een syntax/type-check).

- [ ] **Step 6: Commit**

```bash
git add src/components/portal/inloggegeven-rij.tsx src/components/portal/inloggegevens-lijst.tsx src/components/portal/inloggegeven-toevoegen-formulier.tsx src/components/portal/inloggegeven-bewerken-formulier.tsx
git commit -m "feat: gedeelde UI-componenten voor inloggegevens (rij, lijst, toevoegen, bewerken)"
```

---

### Task 6: Klant — "Inloggegevens"-pagina en navigatie

**Files:**
- Create: `src/app/[locale]/dashboard/inloggegevens/page.tsx`
- Modify: `src/app/[locale]/dashboard/layout.tsx`

- [ ] **Step 1: Schrijf de pagina**

Create `src/app/[locale]/dashboard/inloggegevens/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { InloggegevensLijst } from '@/components/portal/inloggegevens-lijst';
import { InloggegevenToevoegenFormulier } from '@/components/portal/inloggegeven-toevoegen-formulier';

export default async function InloggegevensPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: items } = await supabase
    .from('inloggegevens')
    .select('id, naam, gebruikersnaam, notitie')
    .order('aangemaakt_op', { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-2xl">Inloggegevens</h1>
        <InloggegevenToevoegenFormulier />
      </div>
      <p className="text-muted-foreground">
        Deel hier inloggegevens (bijvoorbeeld voor Airbnb of je PMS-systeem) die wij nodig
        hebben om koppelingen voor je tot stand te brengen.
      </p>
      <InloggegevensLijst items={items ?? []} kanBewerken={true} />
    </main>
  );
}
```

Let op: geen expliciet `client_id`-filter nodig op de query — de "klant volledige toegang eigen inloggegevens"-RLS-policy (Task 1) scopet dit al af tot precies de rijen van de ingelogde klant.

- [ ] **Step 2: Voeg de pagina toe aan de portaal-sidebar**

Open `src/app/[locale]/dashboard/layout.tsx` en voeg een nieuw item toe direct na "Start hier":

```tsx
items={[
  { label: 'Start hier', href: '/dashboard/start-hier' },
  { label: 'Inloggegevens', href: '/dashboard/inloggegevens' },
  { label: 'Voortgang', href: '/dashboard/voortgang' },
  { label: 'Cijfers', href: '/dashboard/cijfers' },
  { label: 'Instellingen', href: '/dashboard/instellingen' },
]}
```

Preserveer de exacte bestaande inspringing/opmaakstijl van de omliggende JSX in dat bestand — alleen dit ene item toevoegen, verder niets herformatteren.

- [ ] **Step 3: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten; `/[locale]/dashboard/inloggegevens` verschijnt in de route-tabel.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/inloggegevens/page.tsx" "src/app/[locale]/dashboard/layout.tsx"
git commit -m "feat: Inloggegevens-pagina in klantportaal"
```

---

### Task 7: Admin — inloggegevens-sectie op klantdetailpagina

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`

Zoals bovenaan dit plan toegelicht: dit wordt een nieuwe top-level `<section>` (net als de bestaande "Accommodaties"-sectie), niet een `<TabsTrigger>` binnen de per-listing-tabbladen — inloggegevens zijn klant-breed, niet per accommodatie.

- [ ] **Step 1: Voeg de query en de sectie toe**

In `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`, voeg de import toe bovenaan:

```tsx
import { InloggegevensLijst } from '@/components/portal/inloggegevens-lijst';
```

Voeg een nieuwe query toe naast de bestaande `klant`/`listings`/`pricelabsCache`-queries:

```tsx
  const { data: inloggegevens } = await supabase
    .from('inloggegevens')
    .select('id, naam, gebruikersnaam, notitie')
    .eq('client_id', id)
    .order('aangemaakt_op', { ascending: false });
```

Voeg een nieuwe sectie toe direct na de klant-header (naam/email/status/`KlantBewerkenFormulier`/`KlantVerwijderenDialoog`) en vóór de "Accommodaties"-sectie:

```tsx
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Inloggegevens</h2>
        <InloggegevensLijst items={inloggegevens ?? []} kanBewerken={false} />
      </section>
```

`kanBewerken={false}` verbergt automatisch de "Bewerken"/"Verwijderen"-knoppen en het toevoegformulier — de admin ziet alleen de lijst met een "Toon"-knop per wachtwoord.

- [ ] **Step 2: Verifieer met de build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx"
git commit -m "feat: read-only inloggegevens-sectie op admin-klantdetailpagina"
```

---

### Task 8: Volledige verificatie en push

- [ ] **Step 1: Run de volledige testsuite**

Run: `npx vitest run --fileParallelism=false`
Expected: alle tests slagen, inclusief de 11 nieuwe tests uit dit plan (Task 2: 5, Task 4: 6). Vereist een lokaal draaiende Supabase-stack (`npx supabase start`) — bij brede, uniforme "fetch failed"-fouten op *alle* integratietests tegelijk: check `docker ps`/`npx supabase status` en herstart zo nodig, vóórdat je verder zoekt naar een echte regressie.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: geen nieuwe fouten. De twee al bekende, ongerelateerde issues (`src/app/auth/confirm/page.tsx`, de gitignorede `supabase/.temp/`-map) zijn verwacht.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: bouwt zonder fouten.

- [ ] **Step 4: Handmatige verificatie**

Start de dev-server (`npm run dev`) en loop het volgende door — vraagt een echte browser die in deze omgeving niet beschikbaar is:

- **Klant voegt een item toe:** log in als klant, ga naar "Inloggegevens", voeg een item toe (naam/gebruikersnaam/wachtwoord/notitie) → item verschijnt in de lijst, wachtwoord staat verborgen.
- **Toon-knop:** klik "Toon" bij het wachtwoord → het echte wachtwoord verschijnt.
- **Bewerken zonder wachtwoordwijziging:** open "Bewerken", laat het wachtwoordveld leeg, wijzig alleen de naam, sla op → wachtwoord blijft (via "Toon" te controleren) hetzelfde.
- **Bewerken mét wachtwoordwijziging:** vul een nieuw wachtwoord in, sla op → "Toon" laat het nieuwe wachtwoord zien.
- **Verwijderen:** verwijder het item → verdwijnt uit de lijst.
- **Admin-notificatiemail:** na het toevoegen van een item is er een e-mail aangekomen op `ADMIN_NOTIFICATIE_EMAIL`, zonder de gebruikersnaam/het wachtwoord erin.
- **Admin-kant:** open de klantdetailpagina van deze klant in `/admin/klanten` → de "Inloggegevens"-sectie toont hetzelfde item, read-only (geen toevoeg-/bewerk-/verwijderknoppen), met een eigen "Toon"-knop die het wachtwoord onthult.
- **Klant B kan klant A's gegevens niet zien:** log in als een andere klant → diens eigen "Inloggegevens"-pagina toont niets van klant A.

- [ ] **Step 5: Productie-migratie en sleutel**

Voer dit zelf uit via het Supabase-dashboard (SQL editor) tegen de productie-database, vóór je deze branch naar productie deployt:

```sql
create table inloggegevens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  naam text not null,
  gebruikersnaam text,
  wachtwoord_versleuteld text not null,
  notitie text,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_op timestamptz not null default now()
);

create index inloggegevens_client_id_idx on inloggegevens(client_id);

alter table inloggegevens enable row level security;

grant select, insert, update, delete on inloggegevens to anon, authenticated, service_role;

create policy "klant volledige toegang eigen inloggegevens" on inloggegevens
  for all using (client_id = current_client_id()) with check (client_id = current_client_id());

create policy "admin leest inloggegevens" on inloggegevens
  for select using (is_admin());
```

Genereer een productie-sleutel (**apart van je lokale testsleutel**) met:
```bash
openssl rand -base64 32
```
en zet die als `INLOGGEGEVENS_SLEUTEL` in de Railway-omgevingsvariabelen. **Bewaar deze sleutel ook zelf ergens veilig (bijvoorbeeld een password manager) — hem kwijtraken betekent dat alle al opgeslagen wachtwoorden definitief niet meer te ontsleutelen zijn.**

- [ ] **Step 6: Push**

```bash
git push origin main
```
