# Cijfers verversen per klant — Design

**Status:** approved, klaar voor implementatieplan

## Context

Bij een klant bleken de impactmeter en de omzet van de huidige maand niet up-to-date (veroorzaakt door een tijdelijke Supabase-storingsperiode waarin de nachtelijke PriceLabs-cron faalde). De admin wil zelf, per klant, de cijfers van alle gekoppelde accommodaties in één keer kunnen verversen, zonder te moeten wachten op de volgende cron-run en zonder elke accommodatie los te hoeven aanklikken.

Dit bouwt volledig op bestaande, al geteste onderdelen: de per-accommodatie "Sync nu"-knop (`syncListingNow` → `syncListing()`, schrijft naar `monthly_actuals`, waar Cijfers/Impactmeter al uit lezen) en het meerdere-listings-in-één-actie-patroon dat de klant-kant "Data synchroniseren"-knop (`syncEigenListings`) al gebruikt. Er is geen nieuwe PriceLabs-integratielogica nodig — puur een nieuwe, klant-brede combinatie van wat er al is.

## Ontwerp

**Server-actie** `ververCijfersVoorKlant(clientId: string)` in `src/app/[locale]/admin/klanten/[id]/actions.ts`:
- Admin-only (`assertIsAdmin()`).
- Haalt alle listings van deze klant op waarvoor `pricelabs_listing_id` is ingesteld (niet-gekoppelde accommodaties worden overgeslagen, zoals de cron dat ook doet).
- Loopt per listing dezelfde synchronisatie (`syncListing(...)` uit `src/lib/pricelabs/sync.ts`) die `syncListingNow` ook al gebruikt, tot en met de huidige maand.
- Eén listing die mislukt stopt de rest niet — per-listing try/catch, resultaten verzameld in een lijst (zelfde vorm als `SyncResultaat` dat `syncEigenListings` al gebruikt: naam + succes/fout per listing).
- `revalidatePath` op de instellingenpagina van deze klant na afloop.
- Geeft een samenvatting terug: aantal geslaagd/mislukt, plus foutmeldingen per mislukte accommodatie.

**UI:** nieuwe knop "Cijfers verversen" naast de bestaande "Ververs PriceLabs-lijst"-knop, bij de "Accommodaties"-kop op de klantdetailpagina. Tijdens het verversen: "Bezig..."-status. Na afloop: korte samenvatting ("3 van 3 accommodaties bijgewerkt" of bij fouten de specifieke foutmelding(en) per accommodatie). Als de klant geen gekoppelde accommodaties heeft: nette melding ("Geen gekoppelde accommodaties om te verversen") in plaats van een lege/verwarrende actie.

**Effect:** zodra de actie klaar is, tonen de Cijfers-pagina en de impactmeter van deze klant meteen de bijgewerkte cijfers bij het volgende bezoek — geen aparte cache-verversing nodig, want die pagina's lezen rechtstreeks uit `monthly_actuals`, de tabel die deze actie bijwerkt.

## Buiten scope

- Geen knop die alle klanten tegelijk ververst (bewust afgewezen eerder in dit gesprek).
- Geen wijziging aan de bestaande per-accommodatie "Sync nu"-knop of de "Ververs PriceLabs-lijst"-knop — deze blijven ongewijzigd naast de nieuwe knop bestaan.
- Geen achtergrond-taak/queue-systeem: de actie loopt synchroon (net als `syncEigenListings` al doet) — bij veel accommodaties kan dit een paar seconden duren, de knop toont dan gewoon "Bezig...".

## Testing

Vitest-integratietest voor `ververCijfersVoorKlant` (analoog aan bestaande admin-actie-authz-tests: weigert een niet-admin; slaat listings zonder PriceLabs-koppeling over; verzamelt resultaten per listing). Geen componenttest (projectconventie) — UI-verificatie via een handmatige checklist voor de gebruiker.
