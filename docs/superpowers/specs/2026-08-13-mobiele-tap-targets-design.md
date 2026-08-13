# Mobiele tap-targets (deelproject 3/3 van de mobiele-compatibiliteit-audit) — Design

## Context

Laatste deelproject van de mobiele-compatibiliteit-audit (1/3 navigatie en 2/3
formulieren/tabellen zijn klaar en live). Bijna elke knop in de app gebruikt
`size="sm"` (28px hoog, `src/components/ui/button.tsx`) of kleiner, ver onder de
gangbare ~36-44px-tapgrootte-richtlijn (Apple HIG/WCAG AAA). Anders dan de vorige twee
deelprojecten is dit een bewuste, systeembrede ontwerpkeuze (dichtheid vs. tapbaarheid),
apart voorgelegd i.p.v. stilzwijgend meegenomen.

Via een visuele vergelijking (dezelfde admin-tabelrij en klant-to-do-rij bij 28px/36px/44px)
is gekozen voor **36px** als nieuwe ondergrens — dezelfde hoogte die al gebruikt wordt voor
de hamburger-/sluitknop uit deelproject 1 (`size="icon-lg"`). Deze ondergrens geldt overal,
ook in de dichtere admin-tabellen — geen aparte, kleinere maatvoering voor admin-only
schermen.

## Ontwerp

### 1. `Button`-component: CSS-only, geen wijzigingen aan bestaande aanroepen

`src/components/ui/button.tsx`'s `buttonVariants` krijgt deze `size`-schaal:

```typescript
size: {
  default:
    "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  sm: "h-9 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  icon: "size-9",
  "icon-sm": "size-9 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
},
```

Verwijderd: `xs`, `lg`, `icon-xs`, `icon-lg`.

**Waarom deze vorm en niet `sm`/`icon-sm` gewoon verwijderen:** `sm` (33 aanroepen) en
`icon-sm` (1 aanroep) blijven bestaan als geldige `size`-waarden, alleen hun CSS wordt
`h-9`/`size-9` i.p.v. `h-7`/`size-7`. Elke bestaande `size="sm"`/`size="icon-sm"`-aanroep in
de codebase erft de nieuwe hoogte dus automatisch — geen van die 34 aanroepplekken hoeft te
worden aangepast. `sm` behoudt zijn iets compactere padding/tekstgrootte/gap t.o.v.
`default` (blijft bruikbaar als visueel "minder nadrukkelijk"-signaal, bv. een
"Annuleren"-knop naast een primaire "Opslaan"), alleen de hoogte is niet meer korter dan de
nieuwe ondergrens.

`xs`/`icon-xs` (0 aanroepen in de hele codebase) en `lg` (0 aanroepen, en zou na deze
wijziging toch letterlijk identiek zijn aan `default`) worden verwijderd: dode code, en het
laten bestaan van een kleinere-dan-de-ondergrens optie zou de hele bedoeling van dit
deelproject ondermijnen voor toekomstig gebruik. `icon-lg` (2 aanroepen, beide in
`src/components/portal/portaal-sidebar.tsx`, toegevoegd in deelproject 1) wordt na deze
wijziging letterlijk identiek aan de nieuwe `icon`-maat — die 2 aanroepen krijgen
`size="icon"` in plaats van `size="icon-lg"`.

### 2. Checkbox in `todo-rij.tsx` krijgt een `<label>`-wrapper

`src/components/portal/checklist-item-rij.tsx` wrapt zijn `<input type="checkbox">` al
correct in een `<label className="flex items-center gap-2 text-sm">` samen met de naam-tekst
— de hele rij is dus al klikbaar, niet alleen het kleine vinkje zelf. Geen wijziging nodig.

`src/components/portal/todo-rij.tsx`'s `TodoRij` (niet `TodoBewerkRij`, die heeft geen
checkbox) heeft dezelfde soort checkbox, maar zonder `<label>`-koppeling — alleen het
vinkje zelf (~15px, de browser-standaardgrootte) is klikbaar, de naam-tekst ernaast niet.
Dit krijgt dezelfde `<label>`-wrapper als het al-correcte zusje, zodat de hele naam-tekst
ook meedoet als tapgebied. Dit raakt alleen de opmaak van het niet-bewerk-pad van `TodoRij`;
`toggleAfvinken`/de overige logica blijft ongewijzigd.

### 3. Expliciet buiten scope

De info-tooltip in `WowCijfer` (Impactmeter) gebruikt een native `title`-attribuut, dat op
touch-apparaten helemaal niet reageert op een tik — dat is een ander soort probleem
("werkt niet op touch") dan "te klein om te raken", en zou een echte tik-om-te-tonen-interactie
vereisen i.p.v. een maatvoeringswijziging. Niet meegenomen in dit deelproject.

## Testen

Geen componenttest-infrastructuur in dit project (zelfde als bij deelproject 1 en 2) —
verificatie via `npm run build` (compileert/type-checkt schoon, met name dat de 2
hernoemde `icon-lg`-aanroepen naar `icon` geen TypeScript-fouten geven) en handmatige
verificatie: op een smal scherm ogen alle knoppen (admin én klant, inclusief dichte tabellen
als de nulmeting-correctierij en de klantenlijst) duidelijk groter/beter te raken dan
voorheen; de checkbox-rij in de klant-Voortgang-to-do-lijst is over de volledige naam-breedte
aan te tikken, niet alleen het vinkje zelf; de admin-klantdetailpagina (met de
hamburger-/sluitknop uit deelproject 1) blijft er ongewijzigd uitzien, aangezien die knoppen
al op 36px stonden.
