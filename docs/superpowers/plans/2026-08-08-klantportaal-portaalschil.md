# Klantportaal — Portaalschil (deelproject 1/7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een gedeelde portaal-sidebar (Voortgang/Cijfers/Instellingen) voor zowel klant als admin, met bestaande inhoud verplaatst naar de juiste nieuwe route en placeholders voor de nog te bouwen secties.

**Architecture:** Eén herbruikbare client-component `PortaalSidebar` (actieve sectie via `usePathname()`), gebruikt door een nieuwe klant-layout (`dashboard/layout.tsx`, met de auth/rol-check die nu in `page.tsx` zit) en een nieuwe admin-per-klant-layout (`admin/klanten/[id]/layout.tsx`, nieuw). Bestaande, werkende pagina-inhoud verhuist ongewijzigd naar de nieuwe subroutes; de oude route-URLs worden kale server-redirects.

**Tech Stack:** Next.js App Router (Server Components + één Client Component), Supabase, Tailwind.

**Referentie-spec:** `docs/superpowers/specs/2026-08-08-klantportaal-portaalschil-design.md`

---

### Task 1: `PortaalSidebar`-component

**Files:**
- Create: `src/components/portal/portaal-sidebar.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface PortaalMenuItem {
  label: string;
  href: string;
}

export function PortaalSidebar({
  titel,
  subtitel,
  items,
}: {
  titel: string;
  subtitel?: string;
  items: PortaalMenuItem[];
}) {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 border-r border-border p-4 space-y-6">
      <div>
        <p className="font-serif text-lg">{titel}</p>
        {subtitel && <p className="text-xs text-muted-foreground">{subtitel}</p>}
      </div>
      <ul className="space-y-1">
        {items.map((item) => {
          // startsWith i.p.v. alleen ===: een geneste route binnen een sectie (bv. later
          // /dashboard/voortgang/iets) moet die sectie ook als actief markeren.
          const actief = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm',
                  actief
                    ? 'bg-secondary text-secondary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/portaal-sidebar.tsx
git commit -m "feat: herbruikbare PortaalSidebar-component"
```

---

### Task 2: Klant-routes

**Files:**
- Modify: `src/app/[locale]/dashboard/layout.tsx`
- Modify: `src/app/[locale]/dashboard/page.tsx`
- Create: `src/app/[locale]/dashboard/cijfers/page.tsx`
- Create: `src/app/[locale]/dashboard/voortgang/page.tsx`
- Create: `src/app/[locale]/dashboard/instellingen/page.tsx`

- [ ] **Step 1: Herschrijf `dashboard/layout.tsx`**

Vervang de volledige inhoud door:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { PortaalSidebar } from '@/components/portal/portaal-sidebar';

// De auth/rol-check (voorheen in page.tsx) staat nu hier, centraal voor alle
// klant-portaalpagina's (cijfers/voortgang/instellingen) — zelfde patroon als
// admin/layout.tsx al gebruikt. Faalt dicht i.p.v. open: als de rol niet betrouwbaar
// vastgesteld kan worden (query-fout), NIET stilzwijgend doorgaan alsof het een klant is
// — dat zou een admin-sessie hier laten binnenkomen en, via de RLS-scoping in de
// onderliggende pagina's, een opgeteld mengelmoes van alle klanten laten zien.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Kon profiel niet laden voor dashboard:', profileError);
    redirect('/login');
  }
  if (profile?.role === 'admin') redirect('/admin/klanten');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-end gap-1">
        <ThemeToggle />
        <SignOutButton />
      </header>
      <div className="flex">
        <PortaalSidebar
          titel="Boon Vakantieverhuur"
          items={[
            { label: 'Voortgang', href: '/dashboard/voortgang' },
            { label: 'Cijfers', href: '/dashboard/cijfers' },
            { label: 'Instellingen', href: '/dashboard/instellingen' },
          ]}
        />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Herschrijf `dashboard/page.tsx`**

Vervang de volledige inhoud door:

```tsx
import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/dashboard/cijfers');
}
```

- [ ] **Step 3: Maak `dashboard/cijfers/page.tsx` aan**

Dit is de huidige inhoud van `dashboard/page.tsx`, met het auth-check-blok eruit (zit al in
`dashboard/layout.tsx`) en een defensieve her-check op `user` (de layout-check garandeert een
sessie, maar deze pagina doet zijn eigen onafhankelijke `getUser()`-aanroep, dus behandelt een
onverwacht lege `user` hier zelf ook fail-closed i.p.v. een non-null-assertion te gebruiken):

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { berekenMaandVergelijkingen, berekenWowCijfer, vroegsteSamenwerkingGestart } from '@/lib/dashboard/bereken-resultaten';
import { WowCijfer } from '@/components/dashboard/wow-cijfer';
import { OmzetDashboard } from '@/components/dashboard/omzet-dashboard';
import { ResultatenGrafiek } from '@/components/dashboard/resultaten-grafiek';
import { ActielogTijdlijn } from '@/components/dashboard/actielog-tijdlijn';

// Geen expliciet client_id-filter nodig op de listings-query hieronder: de
// "klant leest eigen listings"-RLS-policy (client_id = current_client_id()) scopet dit
// al af tot precies de listings van de ingelogde klant. Dit klopt alleen voor een
// klant-sessie — dashboard/layout.tsx redirect een admin-sessie al weg vóórdat deze
// pagina rendert, dus de admin-volledige-toegang-policies komen hier nooit in het spel.
export default async function CijfersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('naam')
    .eq('id', user.id)
    .maybeSingle();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet), action_log(id, datum, omschrijving)');
  if (listingsError) console.error('Kon listings niet laden voor cijferpagina:', listingsError);

  const vergelijkingen = berekenMaandVergelijkingen(
    (listings ?? []).map((listing) => ({
      nulmeting: listing.nulmeting ?? [],
      monthlyActuals: listing.monthly_actuals ?? [],
      samenwerkingGestart: listing.samenwerking_gestart,
    }))
  );
  const wowCijfer = berekenWowCijfer(vergelijkingen);
  const startmaand = vroegsteSamenwerkingGestart((listings ?? []).map((listing) => listing.samenwerking_gestart));
  const actielogItems = (listings ?? []).flatMap((listing) => listing.action_log ?? []);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Welkom, {profile?.naam ?? 'daar'}!</h1>

      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
      <OmzetDashboard />
      <ResultatenGrafiek data={vergelijkingen} />
      <ActielogTijdlijn items={actielogItems} />
    </main>
  );
}
```

- [ ] **Step 4: Maak `dashboard/voortgang/page.tsx` aan**

```tsx
export default function VoortgangPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <p className="mt-4 text-muted-foreground">Deze sectie is binnenkort beschikbaar.</p>
    </main>
  );
}
```

- [ ] **Step 5: Maak `dashboard/instellingen/page.tsx` aan**

```tsx
export default function InstellingenPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Instellingen</h1>
      <p className="mt-4 text-muted-foreground">Deze sectie is binnenkort beschikbaar.</p>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/dashboard"
git commit -m "feat: klant-portaalroutes (voortgang/cijfers/instellingen)"
```

---

### Task 3: Admin-routes per klant

**Files:**
- Create: `src/app/[locale]/admin/klanten/[id]/layout.tsx`
- Modify: `src/app/[locale]/admin/klanten/[id]/page.tsx`
- Create: `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`
- Create: `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx`
- Create: `src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx`

- [ ] **Step 1: Lees de huidige inhoud van `admin/klanten/[id]/page.tsx`**

Deze inhoud wordt in Step 3 hieronder één-op-één (ongewijzigd) verplaatst naar
`admin/klanten/[id]/instellingen/page.tsx`. Open het bestand en bewaar de volledige inhoud —
niets aan de logica verandert, alleen de bestandslocatie.

- [ ] **Step 2: Maak `admin/klanten/[id]/layout.tsx` aan**

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortaalSidebar } from '@/components/portal/portaal-sidebar';

// Geen eigen rol-check hier: admin/layout.tsx (hoger in de boom) checkt al dat dit een
// admin-sessie is. Wél een eigen, lichte klant-lookup + notFound()-guard, zodat élke
// subroute (ook de voortgang/cijfers-placeholders) 404't op een ongeldig klant-id, niet
// alleen instellingen/page.tsx.
export default async function KlantPortaalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: klant } = await supabase.from('clients').select('naam').eq('id', id).maybeSingle();
  if (!klant) notFound();

  return (
    <div className="flex">
      <PortaalSidebar
        titel={klant.naam}
        subtitel="Klantportaal"
        items={[
          { label: 'Voortgang', href: `/admin/klanten/${id}/voortgang` },
          { label: 'Cijfers', href: `/admin/klanten/${id}/cijfers` },
          { label: 'Instellingen', href: `/admin/klanten/${id}/instellingen` },
        ]}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Maak `admin/klanten/[id]/instellingen/page.tsx` aan**

Kopieer de volledige, ongewijzigde inhoud van het huidige `admin/klanten/[id]/page.tsx`
(uit Step 1) naar dit nieuwe bestand — exacte imports, exacte JSX, geen enkele
functionele wijziging. Ter referentie de volledige inhoud die gekopieerd moet worden:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NulmetingTabel } from '@/components/admin/nulmeting-tabel';
import { ResultatenTabel } from '@/components/admin/resultaten-tabel';
import { ActielogFormulier } from '@/components/admin/actielog-formulier';
import { PricelabsKoppeling } from '@/components/admin/pricelabs-koppeling';
import { SamenwerkingNulmetingForm } from '@/components/admin/samenwerking-nulmeting-form';
import { KlantBewerkenFormulier } from '@/components/admin/klant-bewerken-formulier';
import { KlantVerwijderenDialoog } from '@/components/admin/klant-verwijderen-dialoog';
import { ListingBewerkenFormulier } from '@/components/admin/listing-bewerken-formulier';
import { ListingVerwijderenDialoog } from '@/components/admin/listing-verwijderen-dialoog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function KlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: klant } = await supabase.from('clients').select('*').eq('id', id).single();
  if (!klant) notFound();

  const { data: listings } = await supabase
    .from('listings')
    .select('*, nulmeting(*), action_log(*), monthly_actuals(*)')
    .eq('client_id', id)
    .order('aangemaakt_op');

  const { data: pricelabsCache } = await supabase
    .from('pricelabs_listings_cache')
    .select('pricelabs_listing_id, naam, pms')
    .order('naam');

  return (
    <main className="mx-auto max-w-5xl py-10 px-4 space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl">{klant.naam}</h1>
          <p className="text-muted-foreground">{klant.email} · status: {klant.status}</p>
        </div>
        <div className="flex gap-2">
          <KlantBewerkenFormulier
            clientId={id}
            naam={klant.naam}
            email={klant.email}
            telefoon={klant.telefoon}
            status={klant.status}
          />
          <KlantVerwijderenDialoog clientId={id} naam={klant.naam} />
        </div>
      </div>

      {listings?.map((listing) => {
        const heeftBestaandeNulmeting = (listing.nulmeting ?? []).length > 0;
        return (
          <section key={listing.id} className="space-y-4 border-t border-border pt-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">{listing.naam}</h2>
              <div className="flex gap-2">
                <ListingBewerkenFormulier
                  listingId={listing.id}
                  clientId={id}
                  naam={listing.naam}
                  adres={listing.adres}
                  airbnbUrl={listing.airbnb_url}
                />
                <ListingVerwijderenDialoog listingId={listing.id} clientId={id} naam={listing.naam} />
              </div>
            </div>

            <Tabs defaultValue="nulmeting">
              <TabsList>
                <TabsTrigger value="koppeling">Koppeling</TabsTrigger>
                <TabsTrigger value="nulmeting">Nulmeting</TabsTrigger>
                <TabsTrigger value="resultaten">Resultaten</TabsTrigger>
                <TabsTrigger value="actielog">Actielog</TabsTrigger>
              </TabsList>

              <TabsContent value="koppeling">
                <PricelabsKoppeling
                  listingId={listing.id}
                  clientId={id}
                  pricelabsListingId={listing.pricelabs_listing_id}
                  cache={pricelabsCache ?? []}
                />
              </TabsContent>

              <TabsContent value="nulmeting" className="space-y-4">
                <SamenwerkingNulmetingForm
                  listingId={listing.id}
                  clientId={id}
                  pricelabsListingId={listing.pricelabs_listing_id}
                  samenwerkingGestart={listing.samenwerking_gestart}
                  heeftBestaandeNulmeting={heeftBestaandeNulmeting}
                />
                <NulmetingTabel listingId={listing.id} clientId={id} rijen={listing.nulmeting ?? []} />
              </TabsContent>

              <TabsContent value="resultaten">
                <ResultatenTabel
                  nulmeting={listing.nulmeting ?? []}
                  actueel={listing.monthly_actuals ?? []}
                  pricelabsListingId={listing.pricelabs_listing_id}
                />
              </TabsContent>

              <TabsContent value="actielog" className="space-y-4">
                <ActielogFormulier listingId={listing.id} clientId={id} />
                <ul className="space-y-1 text-sm">
                  {(listing.action_log ?? [])
                    .slice()
                    .sort((a, b) => (a.datum < b.datum ? 1 : -1))
                    .map((item) => (
                      <li key={item.id} className="text-muted-foreground">
                        {new Date(item.datum).toLocaleDateString('nl-NL')} — {item.omschrijving}
                      </li>
                    ))}
                </ul>
              </TabsContent>
            </Tabs>
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 4: Vervang `admin/klanten/[id]/page.tsx` door een redirect**

Vervang de volledige inhoud door:

```tsx
import { redirect } from 'next/navigation';

export default async function KlantDetailRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/klanten/${id}/instellingen`);
}
```

- [ ] **Step 5: Maak `admin/klanten/[id]/voortgang/page.tsx` aan**

```tsx
export default function VoortgangPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <p className="mt-4 text-muted-foreground">Deze sectie is binnenkort beschikbaar.</p>
    </main>
  );
}
```

- [ ] **Step 6: Maak `admin/klanten/[id]/cijfers/page.tsx` aan**

```tsx
export default function CijfersPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Cijfers</h1>
      <p className="mt-4 text-muted-foreground">Deze sectie is binnenkort beschikbaar.</p>
    </main>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]"
git commit -m "feat: admin-portaalroutes per klant (voortgang/cijfers/instellingen)"
```

---

### Task 4: Opruimwerk — revalidatePath en klantenlijst-link

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Modify: `src/app/[locale]/admin/klanten/page.tsx`

- [ ] **Step 1: Werk alle `revalidatePath`-aanroepen bij die naar de klantdetailpagina wijzen**

In `src/app/[locale]/admin/klanten/[id]/actions.ts` komt de exacte tekst
`revalidatePath(\`/admin/klanten/${input.clientId}\`);` 9 keer voor (in `corrigeerNulmeting`,
`voegActielogToe`, `koppelListing`, `ontkoppelListing`, `syncListingNow`,
`berekenNulmetingUitPricelabs`, `wijzigKlant`, `wijzigListing`, `verwijderListing`). Vervang
**alle 9** voorkomens door:

```ts
  revalidatePath(`/admin/klanten/${input.clientId}/instellingen`);
```

Gebruik een `replace_all`-bewerking op de exacte string
`revalidatePath(\`/admin/klanten/${input.clientId}\`);` → `revalidatePath(\`/admin/klanten/${input.clientId}/instellingen\`);`.

Let op: `verwijderKlant` bevat een 10e, ándere aanroep — `revalidatePath('/admin/klanten')`
(zonder `${input.clientId}`, wijst naar de klantenlijst) — die blijft **ongewijzigd**, niet
onderdeel van deze vervanging.

- [ ] **Step 2: Werk de link in de klantenlijst bij**

In `src/app/[locale]/admin/klanten/page.tsx`, vervang:

```tsx
                  <Link href={`/admin/klanten/${klant.id}`} className="hover:underline">{klant.naam}</Link>
```

door:

```tsx
                  <Link href={`/admin/klanten/${klant.id}/instellingen`} className="hover:underline">{klant.naam}</Link>
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" "src/app/[locale]/admin/klanten/page.tsx"
git commit -m "fix: revalidatePath en klantenlijst-link wijzen naar de nieuwe instellingen-route"
```

---

### Task 5: Verificatie

**Files:** geen wijzigingen — verificatiestap.

- [ ] **Step 1: Run de volledige testsuite**

Run: `npm test`
Expected: alle tests slagen (geen enkele bestaande test steunt op de oude URL-structuur, zie
de spec).

- [ ] **Step 2: Lint en build**

Run: `npm run lint && npm run build`
Expected: geen lint-errors in de gewijzigde/nieuwe bestanden (negeer bestaande fouten in
`supabase/.temp/`, zie eerdere toelichting in deze sessie); build/typecheck slaagt — dit
controleert ook dat er geen dubbele/verweesde route-conflicten zijn (bv. zowel
`admin/klanten/[id]/page.tsx` als `admin/klanten/[id]/instellingen/page.tsx` mogen naast
elkaar bestaan, Next.js staat dat toe zolang het geen exact dezelfde route is).

- [ ] **Step 3: Handmatig testen tegen de dev-server**

Run: `npm run dev`.

Als klant inloggen:
- Land automatisch op `/dashboard/cijfers` met de bestaande, werkende inhoud (Impactmeter,
  omzetdashboard, resultatengrafiek, actielog).
- Sidebar toont Voortgang/Cijfers/Instellingen, Cijfers is gemarkeerd als actief.
- Klik op Voortgang en Instellingen: beide tonen de "binnenkort beschikbaar"-placeholder, met
  de juiste sectie gemarkeerd als actief in de sidebar.

Als admin inloggen, een klant openen:
- Land automatisch op `/admin/klanten/[id]/instellingen` met de bestaande accommodatie-tabs,
  functioneel ongewijzigd (koppelen, nulmeting berekenen, corrigeren, actielog toevoegen
  werken nog steeds en de pagina revalideert correct na elke actie).
- Sidebar toont de klantnaam bovenaan en Voortgang/Cijfers/Instellingen, Instellingen is
  gemarkeerd als actief.
- Klik op Voortgang en Cijfers: beide tonen de placeholder.
- Vanuit de klantenlijst (`/admin/klanten`) op een klant klikken gaat direct naar
  `/admin/klanten/[id]/instellingen` (geen zichtbare tussenstap via een redirect).

Sluit de dev-server af (Ctrl+C) na verificatie.
