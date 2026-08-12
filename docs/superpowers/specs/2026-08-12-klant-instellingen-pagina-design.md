# Klantportaal — Instellingen-pagina voor de klant (deelproject 7/7) — Design

## Context

Laatste van de 7 deelprojecten uit de klantportaal-uitbreiding. `/dashboard/instellingen` is
nog een placeholder ("Deze sectie is binnenkort beschikbaar."). In tegenstelling tot Cijfers en
Voortgang bestaat er geen directe klant-tegenhanger om te spiegelen — de admin-Instellingen-tab
bevat de verplaatste accommodatie-tabbladen (nulmeting, koppeling, resultaten, actielog), wat
beheerderscontent is, niet iets wat een klant zelf zou moeten kunnen bewerken.

De app gebruikt passwordless auth (magic link per e-mail via Supabase OTP) — er bestaat geen
wachtwoord-functionaliteit, dus "wachtwoord wijzigen" is sowieso geen optie.

## Ontwerp

### 1. Scope: contactgegevens beheren

Eén sectie "Contactgegevens" op de klant-Instellingenpagina: de klant kan zijn **accountnaam**
en **telefoonnummer** bekijken en wijzigen. E-mailadres wordt getoond maar is **alleen-lezen**
(dat is het inlogadres — wijzigen zou de magic-link-flow raken en blijft admin-only, via de
bestaande `wijzigKlant`-actie in `src/app/[locale]/admin/klanten/[id]/actions.ts`).

Bewuste keuze tussen twee mogelijke "naam"-velden in het datamodel:
- `profiles.naam` — de eigen weergavenaam van de ingelogde gebruiker (gebruikt in de
  "Welkom, {naam}!"-begroeting op de Cijferspagina).
- `clients.naam` — de accountnaam (gebruikt in e-mails vanuit de admin, bv. de
  to-do-notificatie, en in de admin-klantenlijst).

Deze pagina wijzigt **`clients.naam`** (niet `profiles.naam`): dit is de accountgegevens zoals
de admin ze ook ziet, en logisch als er ooit meerdere gebruikers per account zouden komen — dan
is dit de gedeelde bedrijfsnaam, niet een persoonlijke weergavenaam.

### 2. Datamodel/RLS

`clients` heeft momenteel alleen een select-policy voor de klant ("klant leest eigen client").
Nieuwe migratie voegt een update-policy toe:

```sql
create policy "klant wijzigt eigen client" on clients
  for update using (id = current_client_id()) with check (id = current_client_id());
```

Zelfde patroon als bij `voortgang_todos` (het eerste klant-schrijfbare tabel deze sessie): RLS
staat een update van de hele rij toe, de bescherming dat de klant alleen `naam`/`telefoon`
verandert (nooit `email`/`status`) komt van de server-actie, die nooit meer dan die twee velden
meestuurt in de update.

### 3. Server-actie

Nieuwe `wijzigEigenClientGegevens({naam, telefoon})` in
`src/app/[locale]/dashboard/actions.ts` (waar `syncEigenListings` ook al staat). Geen
adminrechten nodig — werkt via de nieuwe RLS-policy, scoped op de ingelogde klant zelf via
`current_client_id()`. Valideert dat `naam` niet leeg is; `telefoon` is optioneel (net als in
het datamodel, waar de kolom nullable is).

### 4. UI

Nieuwe component `src/components/dashboard/contactgegevens-formulier.tsx` (client component,
zelfde `useState`/`useTransition`/foutmelding-patroon als de andere formulieren deze sessie,
bv. `activiteit-toevoegen-formulier.tsx`): naam-veld, telefoon-veld, een alleen-lezen
e-mailveld, en een opslaan-knop.

De pagina zelf (`src/app/[locale]/dashboard/instellingen/page.tsx`) haalt
`clients.naam, telefoon, email` op (RLS-gescoped, geen expliciet filter nodig — zelfde patroon
als de andere klantpagina's, bv. `dashboard/voortgang/page.tsx`) en rendert de heading
"Instellingen" gevolgd door een "Contactgegevens"-sectie met het formulier.

## Testen

- Integratietest voor `wijzigEigenClientGegevens`: weigert een lege naam, een klant kan zijn
  eigen naam/telefoon succesvol wijzigen, en (RLS-grenstest, zelfde opzet als bij de to-do's)
  een klant kan niet de gegevens van een andere klant wijzigen.
- Handmatige verificatie: de pagina laadt, toont de huidige gegevens correct, het formulier
  slaat wijzigingen op en de nieuwe waarden zijn na een refresh zichtbaar. Het e-mailveld is
  niet bewerkbaar.
