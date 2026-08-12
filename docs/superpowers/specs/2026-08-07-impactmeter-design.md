# Klantdashboard: "Impactmeter" i.p.v. "Extra omzet"-tekst — Design

## Probleem

De hero-sectie bovenaan het klantdashboard toont nu:

> Extra omzet t.o.v. dezelfde periode vóór Boon Vakantieverhuur

De klant wil dit hernoemen naar een "Impactmeter" met een kortere, duidelijkere omschrijving,
en daarbij expliciet de startmaand van de samenwerking tonen — dezelfde datum die bij de
nulmeting (admin, `SamenwerkingNulmetingForm`) wordt ingevuld.

## Ontwerp

### Tekst en lay-out (`src/components/dashboard/wow-cijfer.tsx`)

```
IMPACTMETER
Extra inkomsten sinds start samenwerking

+ € 12.450
sinds maart 2026
```

- "Impactmeter": kleine, uppercase label-titel (vervangt de huidige omschrijvingsregel als titel).
- "Extra inkomsten sinds start samenwerking": vaste omschrijving, geen datum erin.
- Het bedrag: ongewijzigd (bestaande teken/opmaak-logica blijft intact).
- "sinds {maandnaam} {jaar}": nieuwe regel ónder het bedrag, alleen getoond als er een
  startmaand bekend is.

### Welke startmaand: vroegste van alle accommodaties

Een klant kan meerdere accommodaties hebben, elk met een eigen `samenwerking_gestart`
(zie de eerdere wow-cijfer-fix: de omzetberekening zelf gebruikt al per-accommodatie cutoffs).
Voor de weergave hier wordt de **vroegste** `samenwerking_gestart` van alle accommodaties van de
klant gebruikt — het moment waarop de samenwerking met Boon Vakantieverhuur als geheel begon.
Accommodaties zonder `samenwerking_gestart` (bv. nog CSV-onboarding-only) tellen niet mee bij het
bepalen van de vroegste datum. Als geen enkele accommodatie een `samenwerking_gestart` heeft,
wordt de "sinds ..."-regel helemaal weggelaten.

Nieuwe pure functie in `src/lib/dashboard/bereken-resultaten.ts`:

```ts
export function vroegsteSamenwerkingGestart(data: (string | null)[]): { jaar: number; maand: number } | null {
  const datums = data.filter((d): d is string => d !== null);
  if (datums.length === 0) return null;
  // ISO-datumstrings ('JJJJ-MM-DD') sorteren lexicografisch al chronologisch correct.
  const vroegste = datums.reduce((a, b) => (a < b ? a : b));
  const [jaarStr, maandStr] = vroegste.split('-');
  return { jaar: Number(jaarStr), maand: Number(maandStr) };
}
```

### Bedrading (`src/app/[locale]/dashboard/page.tsx`)

`page.tsx` haalt `samenwerking_gestart` al op per listing (voor de bestaande wow-cijfer-cutoff).
Deze zelfde waarden gaan ook naar `vroegsteSamenwerkingGestart(...)`, en het resultaat wordt als
nieuwe prop `startmaand` aan `<WowCijfer />` doorgegeven.

## Testen

- `tests/unit/bereken-resultaten.test.ts`: nieuwe tests voor `vroegsteSamenwerkingGestart` —
  meerdere datums (pakt de vroegste), een mix van datums en `null` (negeert de `null`s), en
  alleen `null`-waarden (geeft `null` terug).
- Geen component-tests voor `WowCijfer` nodig — geen bestaand precedent in deze codebase voor
  het los unit-testen van presentationele componenten; handmatige verificatie via de dev-server
  volstaat (consistent met hoe eerdere UI-wijzigingen in deze sessie zijn geverifieerd).
