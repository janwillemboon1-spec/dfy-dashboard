# "Start hier"-pagina — Design

**Status:** approved, klaar voor implementatieplan
**Deelproject:** 2/2 van de zelfregistratie-feature (deelproject 1/2, de zelfregistratie-flow, is al gebouwd en live)

## Context

Nieuwe klanten kunnen zich sinds deelproject 1 zelf registreren voor het klantportaal, zonder dat er op dat moment al accommodatiegegevens verzameld worden. De admin wil een plek waar zo'n klant meteen na registratie (of op elk gewenst moment) een introductievideo bekijkt en alvast een extern formulier invult met o.a. zijn Airbnb-accountgegevens — informatie die de admin later nodig heeft om de PriceLabs-koppeling te maken.

Dit wordt een pagina binnen het bestaande klantportaal, geen publieke pagina. Zowel de video (Vimeo of Loom) als het formulier (bijvoorbeeld Typeform of Tally) zijn externe, ingesloten (embedded) content — dit project bouwt geen eigen video-hosting of eigen formulierlogica. Er bestaat nog geen app-breed (niet per-klant) instellingen-mechanisme in dit project; dit wordt de eerste, minimale versie daarvan.

## Architectuur

Twee nieuwe pagina's plus één nieuwe, kleine databasetabel:

1. **`portaal_instellingen`** — één rij, met `video_url` en `formulier_url` (beide nullable text). App-breed, niet gekoppeld aan een specifieke klant.
2. **Admin-pagina `/admin/instellingen`** — formulier om die twee links in te stellen.
3. **Klant-pagina `/dashboard/start-hier`** — toont de video en het formulier als iframes, gevuld met de door de admin ingestelde links.

### Datamodel

```sql
create table portaal_instellingen (
  id uuid primary key default gen_random_uuid(),
  video_url text,
  formulier_url text,
  gewijzigd_op timestamptz not null default now()
);
```

Er wordt precies één rij verwacht (geen `client_id`, geen meervoud). De server-actie die deze rij bijwerkt doet dat als een upsert op een vaste bekende manier (bijvoorbeeld: eerst kijken of er al een rij bestaat, dan updaten; anders een nieuwe rij aanmaken), zodat het ook meteen werkt vóórdat er ooit een rij is aangemaakt.

## 1. Admin: instellingen-pagina

**Route:** nieuwe pagina `src/app/[locale]/admin/instellingen/page.tsx`, admin-only (zit al binnen de `/admin`-route-groep, dus al beschermd door de bestaande middleware- en layout-check).

**Bereikbaarheid:** een nieuwe link "Instellingen" naast de bestaande "+ Nieuwe klant"/"CSV importeren"-knoppen op `/admin/klanten`.

**Formulier:** twee tekstvelden — "Video-link" en "Formulier-link" — met een korte helptekst per veld die uitlegt dat het om de *embed*-link gaat (bijvoorbeeld: "Plak hier de embed-link van Vimeo of Loom, niet de gewone deel-link" / "Plak hier de embed-link van je formuliertool (Typeform, Tally, enz.)"). Geen dialoog nodig — een gewoon formulier direct op de pagina, met een "Opslaan"-knop en een bevestigings-/foutmelding na het opslaan.

**Server-actie** `wijzigPortaalInstellingen(input: { videoUrl: string | null; formulierUrl: string | null })`: admin-only (`assertIsAdmin()`), upsert op de enkele rij in `portaal_instellingen`, revalideert `/admin/instellingen` en `/dashboard/start-hier`.

## 2. Klant: "Start hier"-pagina

**Route:** nieuwe pagina `src/app/[locale]/dashboard/start-hier/page.tsx`, binnen de bestaande klantportaal-route-groep (al beschermd — vereist inloggen).

Haalt de enkele rij uit `portaal_instellingen` op (server-side) en toont:
- Een kop "Start hier" met een korte inleidende tekst.
- De video in een `<iframe>`, volledige breedte, vaste 16:9-verhouding (`aspect-video`).
- Het formulier in een `<iframe>` daaronder, volledige breedte, vaste hoogte van 800px — de meeste embedbare formuliertools scrollen intern wanneer de inhoud niet past.

**Lege staat:** wanneer `video_url` en/of `formulier_url` nog niet zijn ingesteld (bijvoorbeeld direct na het uitrollen van deze feature, vóórdat de admin ze heeft ingevuld), toont de pagina per ontbrekend onderdeel een nette melding ("Deze video/dit formulier wordt binnenkort toegevoegd.") in plaats van een lege of kapotte iframe.

## 3. Navigatie

`src/app/[locale]/dashboard/layout.tsx`'s hardcoded `items`-array voor `PortaalSidebar` krijgt een nieuw, eerste item:

```ts
items={[
  { label: 'Start hier', href: '/dashboard/start-hier' },
  { label: 'Voortgang', href: '/dashboard/voortgang' },
  { label: 'Cijfers', href: '/dashboard/cijfers' },
  { label: 'Instellingen', href: '/dashboard/instellingen' },
]}
```

Zichtbaar voor elke klant, altijd — geen voorwaardelijke logica om 'm te verbergen voor klanten die de video/het formulier al hebben gezien/ingevuld (dat valt buiten scope, zie hieronder). Een terugkerende klant kan de pagina simpelweg negeren.

## Buiten scope

- **Geen tracking of een klant het externe formulier heeft ingevuld.** Omdat het formulier een extern ingesloten formulier is (Typeform/Tally/enz.), komen ingevulde antwoorden niet in dit portaal terecht — de admin volgt dat op via het eigen notificatiesysteem van die externe tool. Er komt dus geen "heeft deze klant het formulier al ingevuld"-indicator in het admin-portaal.
- **Geen automatische URL-transformatie.** De admin plakt zelf de al-correcte embed-URL; er wordt geen logica gebouwd die een gewone deel-link (bijvoorbeeld `https://vimeo.com/12345`) automatisch omzet naar een embed-URL (bijvoorbeeld `https://player.vimeo.com/video/12345`). Dat risico wordt afgedekt met duidelijke helptekst in het admin-formulier.
- **Geen mogelijkheid om de pagina per klant te verbergen** of als afgerond te markeren.

## Testing

Vitest-integratietest voor `wijzigPortaalInstellingen` (analoog aan bestaande admin-actie-tests: weigert een niet-admin, slaat de waarden correct op, upsert werkt zowel bij een nog niet bestaande als een al bestaande rij). Geen componenttests (project-conventie) — UI-verificatie (video/formulier tonen correct, lege staat, admin-formulier) via een handmatige checklist voor de gebruiker, zoals bij eerdere UI-taken dit project.

Database-migratie wordt als kant-en-klare SQL aan de gebruiker gegeven om zelf op productie uit te voeren — geen productie-DB-credentials beschikbaar in deze omgeving.
