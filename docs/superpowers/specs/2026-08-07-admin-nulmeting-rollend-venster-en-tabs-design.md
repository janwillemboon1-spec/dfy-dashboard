# Admin nulmeting: rollend 12-maandsvenster + tabstructuur — Design

## Probleem

De nulmeting-berekening in het admin-gedeelte (`berekenNulmetingUitPricelabs`, getriggerd via
`SamenwerkingNulmetingForm`) gebruikt nu een verkeerd model: het neemt het kalenderjaar van de
ingevulde "samenwerking gestart"-datum, en vult maanden t/m de startmaand met échte PriceLabs-data
en maanden ná de startmaand met STLY (zelfde maand, één jaar eerder) als schatting. Voor een
samenwerking die start in het lopende jaar betekent dit dat toekomstige-kalendermaanden een
schatting krijgen i.p.v. dat ze simpelweg buiten het nulmeting-venster vallen — de klant meldt dat
precies deze "toekomstige" maanden niet kloppen.

Het juiste model (zoals door de klant expliciet omschreven): de nulmeting bestaat uit de 12
kalendermaanden die **direct voorafgaan** aan de ingevulde start-maand/jaar. Voor start = september
2026 is dat augustus 2026 t/m september 2025 — allemaal reeds verstreken maanden, dus altijd
"echte", gesynchroniseerde PriceLabs-data. Er is geen STLY-schatting meer nodig, want er zit per
definitie geen toekomstige maand meer in het venster.

Daarnaast: de admin-klantpagina toont nu alles in één lange, vlakke sectie per accommodatie. De
klant wil een tabstructuur, met de nulmeting-tab die bij openen alleen de huidige (opgeslagen)
cijfers toont — het berekenen-formulier verdwijnt naar de achtergrond.

## Doel

1. `bepaalNulmetingBronnen` levert een rollend venster van 12 kalendermaanden vóór de opgegeven
   start, elk met zijn eigen échte kalenderjaar — geen bron-onderscheid (echt/STLY) meer.
2. Nulmeting-rijen worden opgeslagen onder hun eigen, echte kalenderjaar (niet meer onder één
   kunstmatig "ankerjaar"), zodat chronologische sortering (op jaar, dan maand) correct blijft
   werken over een venster dat twee kalenderjaren overspant.
3. Een nulmeting-berekening vervangt altijd de **volledige** bestaande baseline van een
   accommodatie (alle bestaande rijen worden verwijderd vóór de nieuwe 12 worden geschreven) —
   robuuster dan de huidige "verwijder buiten startjaar"-regel, die al een aparte bugfix nodig had
   voor jaargrensoverschrijdende oude baselines.
4. De admin-klantpagina krijgt per accommodatie 4 tabs: Koppeling, Nulmeting, Resultaten,
   Actielog. De Nulmeting-tab toont standaard alleen de tabel met huidige cijfers; het
   berekenen-formulier zit achter een "Nulmeting (her)berekenen"-knop.

**Buiten scope:** de klant-dashboard-kant van nulmeting (`nulmeting-metrics.ts`,
`bereken-resultaten.ts`) blijft ongewijzigd — die matcht nu al uitsluitend op maandnummer, niet op
jaar, en blijft daarmee correct werken ongeacht welk kalenderjaar een nulmeting-rij draagt.

## Ontwerp

### 1. `bepaalNulmetingBronnen`: rollend venster

`src/lib/dashboard/nulmeting-uit-pricelabs.ts` wordt herschreven:

```ts
export interface NulmetingBron {
  jaar: number;
  maand: number;
}

// De 12 kalendermaanden die direct voorafgaan aan (startJaar, startMaand), chronologisch
// (oudste eerst). Voor start = september 2026 (9, 2026): augustus 2026 t/m januari 2026,
// gevolgd door december 2025 t/m september 2025 — 12 maanden, altijd al verstreken op het
// moment dat de samenwerking start, dus allemaal bruikbaar als échte PriceLabs-data. Geen
// STLY-schatting meer nodig: er zit per definitie geen toekomstige maand in dit venster.
export function bepaalNulmetingBronnen(startJaar: number, startMaand: number): NulmetingBron[] {
  const bronnen: NulmetingBron[] = [];
  let jaar = startJaar;
  let maand = startMaand;
  for (let i = 0; i < 12; i++) {
    maand -= 1;
    if (maand === 0) {
      maand = 12;
      jaar -= 1;
    }
    bronnen.unshift({ jaar, maand });
  }
  return bronnen;
}
```

Voorbeeld: `bepaalNulmetingBronnen(2026, 9)` →
`[{2025,9},{2025,10},{2025,11},{2025,12},{2026,1},{2026,2},{2026,3},{2026,4},{2026,5},{2026,6},{2026,7},{2026,8}]`.

Voor elke `startMaand` blijft `jaar` van elk brondmaand binnen `{startJaar - 1, startJaar}` — de
bestaande query-grens in `berekenNulmetingUitPricelabs` (`check_in <= {startJaar}-12-31` /
`check_out > {startJaar-1}-01-01}`) hoeft dus niet te wijzigen.

### 2. `berekenNulmetingUitPricelabs`: eigen jaar per rij, volledige vervanging

`src/app/[locale]/admin/klanten/[id]/actions.ts`:

- `NulmetingMaandResultaat` verliest `bron`, krijgt `jaar` erbij:
  ```ts
  export interface NulmetingMaandResultaat {
    jaar: number;
    maand: number;
    omzet: number;
    bezetting: number;
    leeg: boolean;
  }
  ```
- De `bronnen.map(...)`-berekening gebruikt `bron.jaar`/`bron.maand` (i.p.v. `bron.bronJaar`/
  `bron.bronMaand`) voor zowel de maandgrenzen als het resultaat; het `bron: bron.bron`-veld
  vervalt uit de return.
- `nulmetingRijen` slaat elke rij op onder zijn eigen `m.jaar` (niet langer een vast `startJaar`
  voor alle 12 rijen).
- De opschoning vóór het wegschrijven wordt onvoorwaardelijk: verwijder alle bestaande
  nulmeting-rijen van deze `listing_id`, ongeacht jaar — een nulmeting is altijd een complete
  12-maands-vervanging:
  ```ts
  const { error: deleteError } = await admin
    .from('nulmeting')
    .delete()
    .eq('listing_id', input.listingId);
  ```
- Retourwaarde wordt `{ startJaar, startMaand, maanden }` (i.p.v. `{ jaar, maanden }`), zodat de
  UI een duidelijke bevestiging kan tonen zonder zelf een enkel "het jaar" van de berekening te
  hoeven verzinnen.

### 3. UI: `SamenwerkingNulmetingForm` — maand-kiezer, standaard ingeklapt

- Invoerveld wordt `<Input type="month">` i.p.v. `type="date"` (de dag speelde toch al geen rol
  in de berekening); bij versturen wordt er `-01` achter geplakt voor de server-actie, die intact
  een volledige ISO-datum blijft verwachten/valideren/opslaan in `samenwerking_gestart`.
- Prop `nulmetingJaren: number[]` wordt `heeftBestaandeNulmeting: boolean` (in `page.tsx`:
  `(listing.nulmeting ?? []).length > 0`) — de overschrijf-bevestiging (`window.confirm`)
  verschijnt voortaan bij *elke* bestaande nulmeting, niet meer alleen bij een jaar-match, passend
  bij de "altijd volledige vervanging"-regel.
- Component toont standaard alleen een knop "Nulmeting (her)berekenen". Een klik toont de
  maand-kiezer + "Berekenen"/"Annuleren"-knoppen. Na een geslaagde berekening klapt het formulier
  weer dicht en toont een korte bevestigingsregel (bv. "Nulmeting berekend: september 2025 t/m
  augustus 2026."); de huidige per-maand-lijst-met-echt/STLY-labels vervalt — de nulmeting-tabel
  eronder (met verse, server-gerevalideerde data) is zelf al die bevestiging.

### 4. UI: `NulmetingTabel` — sortering blijft ongewijzigd, is nu wél correct

`NulmetingTabel` en `ResultatenTabel` zelf hoeven niet te wijzigen — hun bestaande sortering
(`a.jaar - b.jaar || a.maand - b.maand`) gaat er al van uit dat `jaar`/`maand` samen een echte
chronologische volgorde vormen. Dat klopte eerder niet voor STLY-gevallen (alles onder één
ankerjaar) en zal na deze wijziging wél kloppen (elke rij heeft zijn eigen echte jaar), dus dit is
een bijproduct van deel 2, geen aparte wijziging.

### 5. Tabstructuur

Nieuwe herbruikbare component `src/components/ui/tabs.tsx`, gebouwd op `@base-ui/react/tabs`
(Root/List/Tab/Panel), naar hetzelfde patroon als het bestaande `src/components/ui/dialog.tsx`
(shadcn-stijl wrapper rond een base-ui-primitief): `Tabs`, `TabsList`, `TabsTrigger`,
`TabsContent`.

In `src/app/[locale]/admin/klanten/[id]/page.tsx` krijgt elke accommodatie-`<section>` een
`<Tabs>` met 4 tabs:

| Tab | Inhoud |
|---|---|
| Koppeling | `PricelabsKoppeling` |
| Nulmeting | `SamenwerkingNulmetingForm` + `NulmetingTabel` |
| Resultaten | `ResultatenTabel` |
| Actielog | `ActielogFormulier` + de actielog-lijst |

De accommodatienaam en de bewerken/verwijderen-knoppen blijven boven de tabs staan (zichtbaar
ongeacht actieve tab), zoals nu.

## Testen

- `tests/unit/nulmeting-uit-pricelabs.test.ts`: herschrijven voor de nieuwe
  `bepaalNulmetingBronnen`-signatuur — cases voor een start in het midden van het jaar
  (jaargrens-overschrijding, zoals het bestaande september-voorbeeld), een start in januari
  (volledig vorig jaar), en een start in december (11 maanden dit jaar + 1 maand vorig jaar).
- `tests/integration/bereken-nulmeting-uit-pricelabs.test.ts`: bestaande tests aanpassen aan de
  nieuwe retourvorm (`startJaar`/`startMaand` i.p.v. `jaar`, geen `bron`-veld meer) en aan
  opslag-per-eigen-jaar. De bestaande "ruimt een oude, over twee kalenderjaren gespreide
  nulmeting-baseline volledig op"-test blijft relevant (nu als test van de onvoorwaardelijke
  delete-vóór-insert) en moet blijven slagen, mogelijk met een aangepaste naam/toelichting.
  De nieuwe "prorateert een reservering die twee bronmaanden overschrijdt"-test (uit de vorige
  proratie-fix) moet ook onder het nieuwe rollende-vensterschema blijven kloppen — controleren of
  de gebruikte `samenwerkingGestart`/bronmaanden nog steeds het bedoelde scenario dekken.
- Handmatige verificatie: in de dev-server een nulmeting berekenen met start = een maand in het
  (nabije) verleden en verifiëren dat alle 12 tonen als niet-leeg (mits data aanwezig) en
  chronologisch correct gesorteerd staan in de tabel.
