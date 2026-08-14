# Zelfregistratie klantportaal — Design

**Status:** approved, klaar voor implementatieplan
**Deelproject:** 1/2 van "zelfregistratie + start hier"-feature (deelproject 2/2, de "start hier"-pagina, wordt apart uitgewerkt)

## Context

Vandaag ontstaat elke klant via één en dezelfde zware flow: `/aanmelden` (publiek) en `admin/klanten/nieuw` (admin) roepen allebei hetzelfde formulier (`OnboardingForm`) en dezelfde server-logica (`createClientWithListings`) aan. Die flow vereist minimaal 1 accommodatie met 12 maanden nulmeting, en zet geen wachtwoord — de klant logt voor het eerst in via een magic link uit de welkomstmail.

De klant wil een tweede, veel lichtere manier waarop nieuwe klanten zichzelf kunnen registreren: alleen naam, telefoon, e-mail en een zelfgekozen wachtwoord, achter een gedeeld wachtwoord op de pagina zelf (dat de admin na betaling per e-mail doorstuurt). Geen accommodatiegegevens bij registratie — die vult de admin later aan.

Dit raakt een bestaande aanname in de rest van de app: een `clients`-rij heeft altijd ≥1 `listings`-rij. Onderzoek (zie eerdere berichten in dit gesprek) bevestigt dat de berekeningslaag dit al overal defensief afhandelt (geen crashes, geen `NaN`), behalve het KPI/trend-gedeelte van `OmzetDashboard`, dat nu een raster vol €0 zou tonen in plaats van een nette lege status. Verder bleek er **geen enkele bestaande manier** om een accommodatie aan een al bestaande klant toe te voegen — dat is dus een noodzakelijke, generieke nieuwe admin-functie, los van zelfregistratie zelf.

De bestaande zware `/aanmelden`-flow en `createClientWithListings` blijven **volledig ongewijzigd** — dit is een nieuwe, parallelle flow.

## Architectuur

Twee nieuwe, onafhankelijke stukken functionaliteit:

1. **`voegAccommodatieToe`** — admin-only server-actie die een listing (+ 12 nulmeting-rijen op 0) toevoegt aan een bestaande klant, ongeacht hoe die klant is ontstaan of hoeveel accommodaties er al zijn. Bouwvolgorde: eerst dit, want zonder deze functie kan een zelfregistratie-klant later nooit door de admin worden afgerond.
2. **De zelfregistratie-flow zelf**: een wachtwoord-gate, een licht formulier, een nieuwe server-actie `registreerKlant`, een admin-notificatie-e-mail, een "nieuw"-badge in het klantenoverzicht, en enkele lege-status-aanpassingen in het klantportaal.

### Datamodel

Eén nieuwe kolom:

```sql
alter table clients add column zelf_geregistreerd boolean not null default false;
```

Dit is het enige nieuwe databaseveld. Het maakt onderscheid tussen "klant is zelf via de aanmeldpagina begonnen" en elke andere manier waarop een klant ontstaat (admin "Nieuwe klant", CSV-import) — beide starten nu op `status = 'onboarding'`, maar alleen zelfregistratie zet `zelf_geregistreerd = true`.

Nieuwe Postgres RPC (analoog aan de bestaande `create_client_with_listings`, maar voor een *bestaande* klant):

```sql
create or replace function add_listing_to_client(
  target_client_id uuid,
  listing_naam text,
  listing_adres text
) returns uuid
language plpgsql
security definer
as $$
declare
  new_listing_id uuid;
  jaar_nu int := extract(year from now());
  m int;
begin
  insert into listings (client_id, naam, adres)
  values (target_client_id, listing_naam, listing_adres)
  returning id into new_listing_id;

  for m in 1..12 loop
    insert into nulmeting (listing_id, jaar, maand, omzet, bezetting)
    values (new_listing_id, jaar_nu, m, 0, 0);
  end loop;

  return new_listing_id;
end;
$$;
```

(Exacte kolomnamen/types worden in het implementatieplan geverifieerd tegen `supabase/migrations/20260804100948_schema_init.sql` en de latere nulmeting-migraties.)

## 1. Admin: accommodatie toevoegen aan bestaande klant

**Waar:** nieuwe knop "+ Accommodatie toevoegen" op `admin/klanten/[id]/instellingen` (waar de listing-tabbladen al staan).

**Formulier:** naam (verplicht), adres (optioneel) — géén nulmeting-velden.

**Server-actie** (`admin/klanten/[id]/actions.ts`, nieuwe functie `voegAccommodatieToe`): admin-only (zelfde `is_admin()`-bescherming als de rest van dat bestand), roept de RPC `add_listing_to_client` aan, revalideert de pagina.

Na aanmaken gebruikt de admin de **al bestaande** tools om de listing verder in te vullen:
- de bestaande nulmeting-correctierij om de 0-waarden te vervangen door echte cijfers;
- de bestaande PriceLabs-koppeling-UI (`koppelListing`) om de listing te koppelen.

Geen van beide bestaande tools hoeft aangepast te worden — ze werken al op elke listing, ongeacht hoe die is aangemaakt. Dit lost meteen ook het algemenere gat op: voortaan kan een admin op elk moment een accommodatie toevoegen aan **elke** klant, niet alleen zelfregistratie-klanten.

## 2. Wachtwoord-gate + zelfregistratie-formulier

**Route:** nieuwe publieke pagina `src/app/[locale]/registreren/page.tsx`, los van `/aanmelden`. Middleware hoeft niet aangepast — die gate alleen `/admin`- en `/dashboard`-routes.

**Wachtwoord-gate:** de pagina (server component) checkt een httpOnly cookie (`registratie_toegang`). Ontbreekt die of is die ongeldig, dan toont de pagina alleen een wachtwoordveld (`WachtwoordGate`-component). Bij versturen: `POST /api/registreren/toegang` vergelijkt server-side tegen de env-variabele `REGISTRATIE_WACHTWOORD`; bij een match wordt een cookie gezet (getekend/random token, niet het wachtwoord zelf, geldig 24 uur zodat een klant niet halverwege het invullen van het formulier opnieuw het wachtwoord hoeft in te typen) en herlaadt de pagina het formulier. Foutieve pogingen lopen tegen dezelfde IP-gebaseerde rate-limiter aan die `/aanmelden` al gebruikt (`magPogingDoen`), zodat het gedeelde wachtwoord niet te brute-forcen is.

**Het formulier** (`RegistratieForm`, nieuw component, analoog qua stijl aan `OnboardingForm` maar veel korter): naam, telefoon, e-mail, wachtwoord, wachtwoord bevestigen. Validatie via een nieuw `registratieSchema` (zod), inclusief een honeypot-veld zoals bij onboarding. Zelfde dubbele-e-mailcheck en foutmelding als nu ("Er bestaat al een klant met dit e-mailadres").

**Bij versturen** (`POST /api/registreren`, nieuwe route handler):
1. Rate-limit + honeypot-check (zelfde patroon als `/api/onboarding`).
2. `registreerKlant(input)` (nieuw, `src/lib/registratie/registreer-klant.ts`):
   - dubbele-e-mailcheck op `clients.email`;
   - insert in `clients`: `{ naam, telefoon, email, status: 'onboarding', zelf_geregistreerd: true }`;
   - `supabase.auth.admin.createUser({ email, password, email_confirm: true })` — mét wachtwoord, in tegenstelling tot het huidige `email_confirm`-zonder-wachtwoord-patroon van de zware flow;
   - insert in `profiles`: `{ id: authUser.id, role: 'klant', client_id, email, naam }`;
   - verstuurt de admin-notificatiemail (zie hieronder);
   - bij een fout in een van de laatste drie stappen: dezelfde rollback als de bestaande flow (RPC `delete_client_cascade` + `auth.admin.deleteUser` indien al aangemaakt).
   - De standaard-voortgangschecklist wordt automatisch gezaaid door de al bestaande `clients_seed_standaard_checklist`-trigger — geen extra werk nodig.
3. Bij succes: `{ ok: true }` terug naar de client.

**Direct inloggen:** de browser heeft het door de klant ingetypte wachtwoord nog in het formulier-state staan. Na een succesvolle `{ ok: true }`-response roept `RegistratieForm` client-side `supabase.auth.signInWithPassword({ email, password })` aan (zelfde client-side patroon als het bestaande wachtwoord-inloggen op `/login`) en stuurt door naar `/dashboard`.

**Wat de klant meteen ziet:** Voortgang toont de lege standaardchecklist (werkt al zonder listings). Instellingen (klant-kant) toont gewoon de accountgegevens — die pagina heeft toch al geen afhankelijkheid van listings. Cijfers krijgt een aanpassing (zie hieronder).

## 3. Cijfers-pagina bij nul accommodaties

`WowCijfer` en `ResultatenGrafiek` handelen 0 listings al netjes af (bestaande `null`/lege-state-paden). `OmzetDashboard` niet: de KPI-kaarten en de maand-trendtabel zouden nu een raster vol €0-rijen tonen. Kleine aanpassing: wanneer `listings.length === 0`, toont `OmzetDashboard` in plaats van de KPI-kaarten/trendtabel een korte melding, bijvoorbeeld "We zijn je accommodatie(s) nog aan het koppelen — kom hier binnenkort terug."

## 4. Admin-notificatie

Nieuwe functie `sendAdminNotificatieNieuweKlant()` in `src/lib/email/` (zelfde Resend-patroon als `send-welkomstmail.ts`/`send-todo-notificatie.ts`), verstuurd naar het adres in de env-variabele `ADMIN_NOTIFICATIE_EMAIL` (ingesteld op `info@bnbassistant.com`). Inhoud: naam, telefoon, e-mail van de nieuwe klant, en een link naar `/admin/klanten/{clientId}/instellingen`.

## 5. "Nieuw"-badge in klantenoverzicht

In `admin/klanten/page.tsx`: een klein label ("Nieuw") naast de klantnaam, getoond wanneer `zelf_geregistreerd = true` **en** `status !== 'actief'`. De badge verdwijnt dus vanzelf zodra de admin de status handmatig op "actief" zet — geen aparte "gezien"-tracking nodig.

## Foutafhandeling & edge cases

- **Verkeerd gate-wachtwoord:** generieke foutmelding, telt mee voor de IP-rate-limiter.
- **Dubbel e-mailadres bij registratie:** zelfde foutmelding als de bestaande flow.
- **Registratie mislukt na het aanmaken van de auth-gebruiker** (bv. profiel-insert of e-mail faalt): volledige rollback, klant kan het opnieuw proberen met hetzelfde e-mailadres.
- **`voegAccommodatieToe` op een niet-zelfregistratie-klant:** werkt gewoon — de functie is generiek, niet gekoppeld aan `zelf_geregistreerd`.
- **`WowCijfer`'s bestaande "we zijn je resultaten aan het verzamelen"-tekst** bij 0 listings: blijft ongewijzigd. Die tekst is niet perfect toegespitst op "nog geen accommodatie gekoppeld", maar functioneel correct en niet verwarrend — buiten scope om apart te herschrijven.

## Testing

Vitest-unit-tests voor de nieuwe pure/server-only logica: `registreerKlant` (dubbele-e-mailcheck, rollback-pad), de badge-conditie (`zelf_geregistreerd && status !== 'actief'`), en de `OmzetDashboard`-leeg-status-conditie. Zoals de rest van dit project: geen component-testinfrastructuur — UI-verificatie via een handmatige checklist voor de gebruiker (wachtwoord-gate, formulier, auto-login, badge, admin-notificatiemail, accommodatie-toevoegen-flow) na `npm run build`/`npm run lint`.

Database-migratie (nieuwe kolom + nieuwe RPC) wordt als kant-en-klare SQL aan de gebruiker gegeven om zelf uit te voeren — geen productie-DB-credentials beschikbaar in deze omgeving.
