# Inloggegevens delen — Design

**Status:** approved, klaar voor implementatieplan

## Context

De admin wil dat klanten veilig inloggegevens (bijvoorbeeld voor Airbnb, een PMS-systeem, of andere platformen) met haar/hem kunnen delen, zodat die later gebruikt kunnen worden om koppelingen (zoals PriceLabs) tot stand te brengen. Dit zijn letterlijke wachtwoorden — aanzienlijk gevoeliger dan alle data die dit portaal tot nu toe heeft opgeslagen. Er bestaat nog geen encryptie-infrastructuur in dit project; alleen rijbeveiliging via RLS. Voor dit type gegevens is RLS alleen niet genoeg: bij een eventuele lek van de database (backup, verkeerd geconfigureerde sleutel, enz.) zouden anders alle klant-wachtwoorden in leesbare tekst blootliggen. Daarom wordt het wachtwoordveld versleuteld opgeslagen, met een sleutel die uitsluitend als omgevingsvariabele bestaat, nooit in de database zelf.

## Architectuur

Eén nieuwe tabel, twee nieuwe pagina's (klant-kant een nieuw sidebar-item, admin-kant een nieuw tabblad op de bestaande klantdetailpagina), en één nieuwe versleutelingsmodule.

### Datamodel

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
```

**RLS:** de klant mag alleen eigen rijen lezen/aanmaken/wijzigen/verwijderen (`client_id = current_client_id()`); de admin mag alle rijen lezen (`is_admin()`), maar niet zelf aanmaken/wijzigen/verwijderen — dit blijft puur iets dat de klant met de admin deelt, geen door de admin beheerd gegeven.

**Alleen `wachtwoord` wordt versleuteld.** `naam`, `gebruikersnaam` en `notitie` blijven onversleuteld opgeslagen (wel nog steeds afgeschermd via RLS) — alleen het wachtwoord zelf is gevoelig genoeg om die extra laag te rechtvaardigen.

### Versleuteling

Nieuwe module `src/lib/inloggegevens/versleuteling.ts`, met `versleutel(platteTekst: string): string` en `ontsleutel(cijfertekst: string): string`, gebouwd op Node's ingebouwde `crypto`-module (geen nieuwe dependency), met AES-256-GCM (authenticated encryption — beschermt niet alleen tegen lezen, maar detecteert ook geknoei met de cijfertekst).

- **Sleutel:** nieuwe omgevingsvariabele `INLOGGEGEVENS_SLEUTEL`, een eenmalig gegenereerde, base64-gecodeerde 32-byte (256-bit) sleutel. Ontbreekt deze variabele, dan gooit `versleutel`/`ontsleutel` direct een duidelijke fout (fail-closed, zelfde patroon als `REGISTRATIE_WACHTWOORD` in `toegang-token.ts`) — nooit stilzwijgend onversleuteld opslaan.
- **Opslagformaat:** `${iv-base64}.${authTag-base64}.${cijfertekst-base64}` — leesbaar-gescheiden met punten, zelfde stijl als het bestaande token-formaat in `toegang-token.ts`.
- **Operationeel risico, expliciet:** als `INLOGGEGEVENS_SLEUTEL` ooit verloren gaat, zijn alle al opgeslagen wachtwoorden definitief niet meer te ontsleutelen. Er is geen sleutelrotatie-mechanisme in deze versie — dat is bewust buiten scope (zie hieronder).

### Delen server-actie

Eén gezamenlijke server-actie `onthulWachtwoord(inloggegevenId: string): Promise<{ succes: boolean; wachtwoord?: string; fout?: string }>`, bruikbaar door zowel admin (elk item) als klant (alleen eigen items): controleert eerst of de aanroeper admin is (`is_admin()`) òf eigenaar van dit specifieke item (`current_client_id()` matcht `client_id` van de rij), leest de rij op met een RLS-scoped client (die scoping regelt dit automatisch al), ontsleutelt het wachtwoord en geeft het terug. Wordt pas aangeroepen op het moment dat iemand daadwerkelijk op "Toon" klikt — nooit vooraf, dus het wachtwoord staat nooit standaard al ontsleuteld in de pagina.

## 1. Klant: "Inloggegevens"-pagina

**Route:** nieuwe pagina `/dashboard/inloggegevens`, nieuw sidebar-item, geplaatst direct na "Start hier":

```ts
items={[
  { label: 'Start hier', href: '/dashboard/start-hier' },
  { label: 'Inloggegevens', href: '/dashboard/inloggegevens' },
  { label: 'Voortgang', href: '/dashboard/voortgang' },
  { label: 'Cijfers', href: '/dashboard/cijfers' },
  { label: 'Instellingen', href: '/dashboard/instellingen' },
]}
```

**Inhoud:** een lijst van eigen ingediende items (naam, gebruikersnaam, wachtwoord verborgen als `••••••••` met een "Toon"-knop die `onthulWachtwoord` aanroept, notitie), plus:
- **Toevoegen:** een formulier (naam verplicht, gebruikersnaam/e-mail optioneel, wachtwoord verplicht, notitie optioneel).
- **Bewerken:** zelfde formulier, vooraf ingevuld met naam/gebruikersnaam/notitie; het wachtwoordveld begint **leeg** met een hint "Laat leeg om het huidige wachtwoord te behouden" — een leeg wachtwoordveld bij opslaan betekent: bestaande versleutelde waarde ongewijzigd laten. Dit voorkomt dat er ooit ontsleuteld moet worden puur om een bewerkformulier te vullen.
- **Verwijderen:** met een korte bevestiging.

## 2. Admin: nieuw tabblad op de klantdetailpagina

Een nieuw tabblad "Inloggegevens" naast de bestaande listing-tabbladen (Koppeling/Nulmeting/Resultaten/Actielog) op `/admin/klanten/[id]/instellingen`. Toont dezelfde lijst als de klant ziet (naam, gebruikersnaam, wachtwoord verborgen met "Toon"-knop, notitie) — **read-only**: geen knoppen om toe te voegen, te bewerken of te verwijderen.

## 3. Notificatie

Bij het toevoegen van een nieuw item stuurt de server-actie een e-mail naar `ADMIN_NOTIFICATIE_EMAIL` (zelfde Resend-patroon als de bestaande admin-notificatie bij zelfregistratie): klantnaam + naam van het item (bijvoorbeeld "Jan Jansen heeft een nieuw inloggegeven toegevoegd: Airbnb") + een link naar de klantdetailpagina. **Nooit** de gebruikersnaam of het wachtwoord zelf in de e-mail — e-mail is geen beveiligd kanaal.

## Buiten scope

- **Geen sleutelrotatie.** Eén vaste `INLOGGEGEVENS_SLEUTEL`; een toekomstige sleutelwissel zou alle bestaande rijen onleesbaar maken tenzij ze handmatig opnieuw versleuteld worden — niet gebouwd in deze versie.
- **Geen audit-log van wie wanneer een wachtwoord heeft onthuld.** De toegang zelf is al beperkt tot de klant-eigenaar en de (enige) admin; een apart logboek van elke "Toon"-klik is nu niet gevraagd.
- **Geen herbevestiging van het eigen admin-wachtwoord vóór onthullen** (zoals bij het wijzigen van het eigen wachtwoord) — bewust afgewogen en niet gewenst: te veel wrijving voor een tool met één admin.
- **Admin kan geen items namens een klant toevoegen/wijzigen/verwijderen.** Dit blijft puur iets dat de klant zelf beheert en met de admin deelt.

## Testing

Vitest-unit-tests voor `versleutel`/`ontsleutel` (versleutelen-en-ontsleutelen geeft de oorspronkelijke waarde terug, geknoei met de cijfertekst laat `ontsleutel` falen, ontbrekende `INLOGGEGEVENS_SLEUTEL` geeft een duidelijke fout). Vitest-integratietests voor de server-acties (klant kan eigen items aanmaken/wijzigen/verwijderen, klant kan geen items van een andere klant zien of onthullen, admin kan alle items lezen en onthullen maar niet aanmaken/wijzigen/verwijderen, leeg wachtwoordveld bij bewerken behoudt het bestaande wachtwoord). Geen componenttests (projectconventie) — UI-verificatie via een handmatige checklist voor de gebruiker.

Database-migratie wordt als kant-en-klare SQL aan de gebruiker gegeven om zelf op productie uit te voeren — geen productie-DB-credentials beschikbaar in deze omgeving. De gebruiker moet ook zelf `INLOGGEGEVENS_SLEUTEL` genereren (een kant-en-klaar commando wordt gegeven) en instellen in Railway.
