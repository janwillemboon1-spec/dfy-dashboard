# Klantportaal — Portaalschil (deelproject 1 van 7) — Design

## Context

Dit is het eerste van 7 deelprojecten om het klantdashboard uit te breiden tot een volwaardig
klantportaal met een gedeeld menu (Voortgang / Cijfers / Instellingen) voor zowel klant als
admin. De overige 6 deelprojecten (fasen & voortgangsbalk, checklist per fase, to-do's met
notificaties, activiteitenlog, cijfers-pagina volvullen, instellingen-pagina) bouwen hierop
voort en krijgen elk hun eigen spec.

**Uitgangspunt uit onderzoek van de huidige codebase:**
- Er bestaat nog geen gedeeld nav/menu-component. Admin (`/admin/*`) en klant (`/dashboard`)
  zijn twee losse routebomen met elk hun eigen (bijna identieke) header, geen tabs/sidebar.
- De huidige klant-dashboardpagina (`src/app/[locale]/dashboard/page.tsx`) bevat exact de
  inhoud die "Cijfers" moet worden: `WowCijfer` (Impactmeter), `OmzetDashboard`,
  `ResultatenGrafiek`, `ActielogTijdlijn`.
- De admin-klantdetailpagina (`src/app/[locale]/admin/klanten/[id]/page.tsx`) bevat de
  accommodatie-tabs (Koppeling/Nulmeting/Resultaten/Actielog) die ik in de vorige sessie heb
  gebouwd — deze blijven functioneel ongewijzigd, maar verhuizen naar een nieuwe
  `/instellingen`-subroute.

## Doel van dit deelproject

Alleen de **navigatiestructuur**: een gedeelde sidebar-component, nieuwe routes voor
Voortgang/Cijfers/Instellingen (klant én admin-per-klant), en het verplaatsen van bestaande,
al-werkende inhoud naar de juiste nieuwe plek. **Geen nieuwe functionaliteit** — Voortgang
(beide rollen) en Instellingen (klant) en Cijfers (admin) worden dit deelproject nog
placeholder-pagina's ("binnenkort beschikbaar"); hun echte inhoud komt in de latere
deelprojecten.

## Ontwerp

### 1. Gedeelde sidebar-component

Nieuwe client-component `src/components/portal/portaal-sidebar.tsx`:

```tsx
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
}) { /* ... */ }
```

Gebruikt `usePathname()` (uit `next/navigation`, zelfde als de rest van de codebase — geen
next-intl navigatiewrapper nodig, want er is maar één locale en `localePrefix: 'as-needed'`
toont die toch nooit) om de actieve sectie te markeren (`pathname === href` of
`pathname.startsWith(href + '/')`, zodat geneste routes binnen een sectie ook als actief
gelden). Links via gewone `next/link` `<Link>`, zelfde patroon als de rest van de codebase.

`titel`/`subtitel` verschillen bewust per rol: bij de klant een vaste titel (geen
personalisatie nodig in de sidebar zelf — "Welkom, {naam}" staat al op de Cijfers-pagina), bij
de admin de naam van de klant die bekeken wordt (essentieel, want de admin navigeert tussen
meerdere klanten).

### 2. Klant-routes

- `src/app/[locale]/dashboard/layout.tsx`: de auth/rol-check die nu in `page.tsx` staat
  (geen sessie → `/login`; profiel-fout → `/login`; rol `admin` → `/admin/klanten`) verhuist
  hierheen — zelfde centralisatie-patroon als `admin/layout.tsx` al gebruikt. Rendert daarna de
  bestaande header (ThemeToggle/SignOutButton) + `<PortaalSidebar>` (vaste titel, items:
  Voortgang/Cijfers/Instellingen) + `{children}`.
- `src/app/[locale]/dashboard/page.tsx`: wordt een kale server-redirect naar
  `/dashboard/cijfers` (geen auth-check meer nodig, die zit al in de layout die hoe dan ook
  eerst rendert).
- `src/app/[locale]/dashboard/cijfers/page.tsx` (nieuw): exact de huidige inhoud van
  `dashboard/page.tsx` (profiel-naam ophalen, listings-query, wow-cijfer/vergelijkingen/
  startmaand-berekening, en de render van `WowCijfer`/`OmzetDashboard`/`ResultatenGrafiek`/
  `ActielogTijdlijn`) — ongewijzigd, alleen het auth-check-blok bovenaan vervalt (zit al in de
  layout).
- `src/app/[locale]/dashboard/voortgang/page.tsx` (nieuw): placeholder.
- `src/app/[locale]/dashboard/instellingen/page.tsx` (nieuw): placeholder.

Het actielog (`ActielogTijdlijn`) blijft dus **voorlopig op Cijfers** staan, niet weggehaald —
pas deelproject 5 (activiteitenlog) verhuist het naar Voortgang. Zo verliest de klant geen
bestaande, nuttige informatie terwijl Voortgang nog een placeholder is.

### 3. Admin-routes (per klant)

- `src/app/[locale]/admin/klanten/[id]/layout.tsx` (nieuw): haalt alleen `clients.naam` op
  voor de sidebar-header, met een eigen `notFound()`-guard bij een ongeldig `id` (zodat élke
  subroute — ook de placeholders — 404't op een ongeldige klant, niet alleen Instellingen).
  Rendert `<PortaalSidebar titel={klant.naam} items={[...]}>` + `{children}`. De
  rol-check (alleen admin) gebeurt al hoger op in `admin/layout.tsx`, hoeft hier niet herhaald.
- `src/app/[locale]/admin/klanten/[id]/page.tsx`: wordt een kale server-redirect naar
  `/admin/klanten/${id}/instellingen`.
- `src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx` (nieuw): de **volledige,
  functioneel ongewijzigde** inhoud van de huidige `admin/klanten/[id]/page.tsx` (header met
  klantnaam/bewerken/verwijderen-knoppen + per-accommodatie tabs Koppeling/Nulmeting/
  Resultaten/Actielog).
- `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx` (nieuw): placeholder.
- `src/app/[locale]/admin/klanten/[id]/cijfers/page.tsx` (nieuw): placeholder — een admin kan
  op dit moment sowieso geen cijfers van een klant zien; de omzet-API
  (`/api/dashboard/omzet`) blokkeert admin-sessies nu expliciet. Dat oplossen hoort bij
  deelproject 6, niet hier.

### 4. Opruimwerk dat meeverhuist

- `src/app/[locale]/admin/klanten/[id]/actions.ts`: alle 9 voorkomens van
  `revalidatePath(\`/admin/klanten/${input.clientId}\`)` worden
  `revalidatePath(\`/admin/klanten/${input.clientId}/instellingen\`)` — anders revalideert een
  mutatie (bv. actielog toevoegen, nulmeting herberekenen) straks een pad dat alleen nog een
  kale redirect is, en blijft de Instellingen-pagina de oude cache tonen.
- `src/app/[locale]/admin/klanten/page.tsx` (klantenlijst): de link naar een klant
  (regel 46, `href={\`/admin/klanten/${klant.id}\`}`) wordt direct
  `href={\`/admin/klanten/${klant.id}/instellingen\`}` — bespaart de admin een onnodige
  redirect-hop bij elke klik.

## Testen

Geen nieuwe pure-logica-functies in dit deelproject (alleen routing/lay-out), dus geen nieuwe
unit tests. Geverifieerd dat geen enkele bestaande test op de URL `/admin/klanten/${id}` steunt
(de treffers voor die string in `tests/integration/` zijn allemaal module-importpaden van
`actions.ts`, dat bestandspad verandert niet) — de routewijziging kan dus geen bestaande test
breken. Handmatige verificatie via de dev-server: inloggen als klant → land op
`/dashboard/cijfers` met werkende bestaande inhoud; inloggen als admin → klant openen → land op
`/admin/klanten/[id]/instellingen` met de bestaande accommodatie-tabs; sidebar-navigatie tussen
Voortgang/Cijfers/Instellingen werkt in beide rollen, actieve sectie is gemarkeerd.
