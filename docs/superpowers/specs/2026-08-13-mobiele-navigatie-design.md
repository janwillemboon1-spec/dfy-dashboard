# Mobiele navigatie (deelproject 1/3 van de mobiele-compatibiliteit-audit) — Design

## Context

Een code-audit van de hele app (admin- en klantportaal) op mobiel/tablet-gebruiksvriendelijkheid
bracht meerdere problemen aan het licht, gerangschikt naar ernst. Dit deelproject pakt het
grootste en breedste probleem aan: `PortaalSidebar` (`src/components/portal/portaal-sidebar.tsx`)
heeft een vaste breedte (`w-56`, 224px) en wordt permanent naast de content gerenderd via `flex`,
zonder enig inklap- of hamburger-mechanisme. Op een telefoon (~375px breed) blijft hierdoor nog
maar ~150px over voor content. Dit component wordt gebruikt op:

- de hele klantportaal-navigatie (`src/app/[locale]/dashboard/layout.tsx`) — Voortgang/Cijfers/
  Instellingen;
- de admin-klantdetailpagina (`src/app/[locale]/admin/klanten/[id]/layout.tsx`) — dezelfde 3
  items plus een "Terug naar klantoverzicht"-link.

Twee vervolg-deelprojecten volgen apart, buiten scope hier: (2) formulieren/tabellen die
overlopen op smalle schermen, (3) systeembreed te kleine tap-targets (de meeste knoppen in de
app gebruiken `size="sm"`, 28px hoog). De admin-header (`src/app/[locale]/admin/layout.tsx`,
gedeeld door alle admin-pagina's inclusief de klantenoverzichtslijst zonder sidebar) blijft hier
ongemoeid — dat scherm heeft geen sidebar en dus geen hamburger nodig.

## Ontwerp

### 1. `PortaalSidebar` wordt zelf verantwoordelijk voor zijn mobiele gedrag

In plaats van de twee aanroeppunten elk apart een hamburger-knop te laten bouwen, wordt
`PortaalSidebar` zelf responsive: hij rendert ófwel de bestaande altijd-zichtbare `w-56`-nav
(vanaf `md:`, 768px — exact hetzelfde uiterlijk als nu), ófwel (onder `md:`) een smalle bovenbalk
met een hamburger-knop + de `titel`, die bij een tik de navigatie-inhoud als uitschuifpaneel
opent. De props van `PortaalSidebar` (`titel`, `subtitel`, `items`, `terug`) blijven ongewijzigd.

Beide aanroeppunten (`dashboard/layout.tsx`, `admin/klanten/[id]/layout.tsx`) hoeven zelf niet te
weten of de sidebar in mobiele of desktop-modus staat — alleen hun omringende
`<div className="flex">` wordt `<div className="flex flex-col md:flex-row">`, zodat de mobiele
bovenbalk boven de content komt te staan i.p.v. ernaast.

### 2. Uitschuifpaneel: hergebruik van de bestaande Base UI Dialog-primitive

`src/components/ui/dialog.tsx` wrapt al `@base-ui/react/dialog` voor het bestaande, gecentreerde
modal-patroon. Dat primitive wordt binnen `PortaalSidebar` hergebruikt, maar met andere
positionering/animatie-classes: links-verankerd (`fixed inset-y-0 left-0`), volledige
schermhoogte, i.p.v. gecentreerd. Dit levert focus-trapping, sluiten via Escape, en sluiten via
een klik op de achtergrond-overlay gratis op, zonder nieuwe dependency. Omdat vooralsnog alleen
`PortaalSidebar` dit nodig heeft, blijft de styling losstaand daarin (geen nieuwe generieke
`ui/sheet.tsx`-primitive) — die extractie is triviaal als een tweede gebruikssituatie zich
aandient.

### 3. Breekpunt: 768px (Tailwind `md:`)

Vanaf 768px blijft de sidebar altijd zichtbaar zoals nu, geen hamburger. Een tablet in
portretstand (768px breed, bv. een iPad) valt precies op de grens en krijgt dus de vaste sidebar;
telefoons en smallere tablets in portretstand krijgen de hamburger-variant.

### 4. Gedrag

- Tikken op de hamburger-knop opent het paneel (van links naar binnen schuivend, met
  halfdoorzichtige overlay erachter).
- Het paneel toont dezelfde inhoud als de desktop-sidebar: `terug`-link (indien aanwezig),
  `titel`/`subtitel`, de item-lijst.
- Tikken op een nav-item navigeert **en** sluit het paneel meteen (geen dubbele tik nodig om de
  nieuwe pagina te zien).
- Sluiten kan ook via: tikken op de achtergrond-overlay, de Escape-toets, of een expliciete
  sluit-knop (kruisje) bovenin het paneel — dezelfde conventie als de bestaande `DialogContent`.

### 5. Tap-target-uitzondering voor hamburger en sluit-knop

De systeembrede te-kleine-knoppen-kwestie is expliciet uitgesteld naar deelproject 3. Voor de
hamburger-knop en de sluit-knop van dit paneel wordt daar nu al een uitzondering op gemaakt: deze
twee knoppen zijn de belangrijkste tap-targets van de hele mobiele navigatie (zonder werkende
hamburger kun je op je telefoon nergens anders heen), en krijgen daarom een ruimere, expliciete
afmeting in plaats van de standaard kleine icoon-knop-variant die elders in de app gebruikt
wordt. Dit is een bewuste, lokale uitzondering — geen vooruitgrijpen op de bredere
tap-target-beslissing van deelproject 3.

## Testen

Dit project heeft geen componenttest-infrastructuur (bevestigd bij eerdere deelprojecten in
dezelfde codebase) — verificatie gebeurt via `npm run build` (compileert/type-checkt schoon) en
handmatige verificatie: de sidebar op zowel de klant- als de admin-klantdetailpagina testen op
een smal (< 768px) en een breed (≥ 768px) scherm, met aandacht voor: hamburger verschijnt/
verdwijnt op de juiste breedte, paneel opent/sluit correct via alle vier de sluit-manieren
hierboven, navigeren via een paneel-item werkt en sluit het paneel, en de bestaande
desktop-weergave (≥ 768px) blijft pixel-voor-pixel hetzelfde als nu.
