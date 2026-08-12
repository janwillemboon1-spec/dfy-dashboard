# Klantdashboard: "Impactmeter" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De wow-cijfer-sectie op het klantdashboard hernoemen naar "Impactmeter" met een kortere omschrijving en een vermelding van de vroegste samenwerking-startmaand van de klant.

**Architecture:** Nieuwe pure functie `vroegsteSamenwerkingGestart` in `bereken-resultaten.ts` bepaalt de vroegste `samenwerking_gestart` over alle accommodaties van de klant; `page.tsx` geeft dat resultaat als nieuwe prop door aan `WowCijfer`, die de tekst en lay-out aanpast.

**Tech Stack:** TypeScript, React Server Components, Vitest.

**Referentie-spec:** `docs/superpowers/specs/2026-08-07-impactmeter-design.md`

---

### Task 1: `vroegsteSamenwerkingGestart`

**Files:**
- Modify: `src/lib/dashboard/bereken-resultaten.ts`
- Test: `tests/unit/bereken-resultaten.test.ts`

- [ ] **Step 1: Voeg de failing tests toe**

Voeg toe aan `tests/unit/bereken-resultaten.test.ts` (na de bestaande `import`-regel bovenaan
wijzigen, en een nieuwe `describe`-block toevoegen vóór `describe('berekenWowCijfer', ...)`):

Vervang de import-regel:

```ts
import { berekenMaandVergelijkingen, berekenWowCijfer, type ListingData } from '@/lib/dashboard/bereken-resultaten';
```

door:

```ts
import {
  berekenMaandVergelijkingen,
  berekenWowCijfer,
  vroegsteSamenwerkingGestart,
  type ListingData,
} from '@/lib/dashboard/bereken-resultaten';
```

Voeg deze nieuwe `describe`-block toe vóór `describe('berekenWowCijfer', ...)`:

```ts
describe('vroegsteSamenwerkingGestart', () => {
  it('geeft de vroegste datum terug uit meerdere', () => {
    const resultaat = vroegsteSamenwerkingGestart(['2026-06-01', '2026-01-15', '2026-03-10']);
    expect(resultaat).toEqual({ jaar: 2026, maand: 1 });
  });

  it('negeert null-waarden tussen echte datums', () => {
    const resultaat = vroegsteSamenwerkingGestart([null, '2026-05-01', null, '2025-11-20']);
    expect(resultaat).toEqual({ jaar: 2025, maand: 11 });
  });

  it('geeft null terug als alle waarden null zijn', () => {
    expect(vroegsteSamenwerkingGestart([null, null])).toBeNull();
  });

  it('geeft null terug voor een lege lijst', () => {
    expect(vroegsteSamenwerkingGestart([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run de tests om te bevestigen dat ze falen**

Run: `npm test -- tests/unit/bereken-resultaten.test.ts`
Expected: FAIL — `vroegsteSamenwerkingGestart` bestaat nog niet (importfout/`undefined is not a function`).

- [ ] **Step 3: Implementeer de functie**

Voeg toe aan het einde van `src/lib/dashboard/bereken-resultaten.ts`:

```ts

// Voor de "sinds ..."-vermelding op het klantdashboard: de vroegste samenwerking_gestart
// over alle accommodaties van de klant, ongeacht welke accommodatie dat is. Accommodaties
// zonder samenwerking_gestart (nog geen nulmeting via de PriceLabs-flow) tellen niet mee.
export function vroegsteSamenwerkingGestart(data: (string | null)[]): { jaar: number; maand: number } | null {
  const datums = data.filter((d): d is string => d !== null);
  if (datums.length === 0) return null;
  // ISO-datumstrings ('JJJJ-MM-DD') sorteren lexicografisch al chronologisch correct.
  const vroegste = datums.reduce((a, b) => (a < b ? a : b));
  const [jaarStr, maandStr] = vroegste.split('-');
  return { jaar: Number(jaarStr), maand: Number(maandStr) };
}
```

- [ ] **Step 4: Run de tests om te bevestigen dat ze slagen**

Run: `npm test -- tests/unit/bereken-resultaten.test.ts`
Expected: PASS (14 tests: 10 bestaande + 4 nieuwe)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/bereken-resultaten.ts tests/unit/bereken-resultaten.test.ts
git commit -m "feat: vroegsteSamenwerkingGestart voor de Impactmeter-startmaand"
```

---

### Task 2: `WowCijfer` — Impactmeter-tekst en startmaand

**Files:**
- Modify: `src/components/dashboard/wow-cijfer.tsx`

- [ ] **Step 1: Herschrijf het component**

Vervang de volledige inhoud van `src/components/dashboard/wow-cijfer.tsx` door:

```tsx
import { MAAND_NAMEN_VOL } from '@/lib/constants/maanden';

export function WowCijfer({
  bedrag,
  startmaand,
}: {
  bedrag: number | null;
  startmaand: { jaar: number; maand: number } | null;
}) {
  if (bedrag === null) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">
          We zijn je resultaten aan het verzamelen — kom hier binnenkort terug.
        </p>
      </div>
    );
  }

  const teken = bedrag >= 0 ? '+' : '−';
  const absoluteWaarde = Math.abs(bedrag);
  // Hele euro's: dit is een oriënterend hero-cijfer, geen boekhoudkundig bedrag —
  // centen (of een losse decimaal door optelling van numeric(10,2)-waarden) zouden
  // hier vooral als een vreemde glitch overkomen op het meest prominente getal van
  // de pagina.
  const bedragTekst = absoluteWaarde.toLocaleString('nl-NL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="py-12 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Impactmeter</p>
      <p className="mt-1 text-sm text-muted-foreground">Extra inkomsten sinds start samenwerking</p>
      <h2 className="mt-2 font-serif text-5xl font-medium">
        <span className="sr-only">{bedrag >= 0 ? 'Toename van ' : 'Afname van '}</span>
        {teken} € {bedragTekst}
      </h2>
      {startmaand && (
        <p className="mt-2 text-sm text-muted-foreground">
          sinds {MAAND_NAMEN_VOL[startmaand.maand - 1]} {startmaand.jaar}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/wow-cijfer.tsx
git commit -m "feat: WowCijfer toont Impactmeter-titel en samenwerking-startmaand"
```

(Dit component compileert pas weer correct nadat Taak 3 `page.tsx` heeft aangepast — commit
toch nu al voor kleine, behapbare stappen; de build-check in Taak 4 vangt eventuele resterende
inconsistenties op.)

---

### Task 3: `page.tsx` — startmaand doorgeven

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx`

- [ ] **Step 1: Pas de import aan**

Vervang:

```ts
import { berekenMaandVergelijkingen, berekenWowCijfer } from '@/lib/dashboard/bereken-resultaten';
```

door:

```ts
import { berekenMaandVergelijkingen, berekenWowCijfer, vroegsteSamenwerkingGestart } from '@/lib/dashboard/bereken-resultaten';
```

- [ ] **Step 2: Bereken de startmaand en geef 'm door**

Vervang:

```ts
  const wowCijfer = berekenWowCijfer(vergelijkingen);
  const actielogItems = (listings ?? []).flatMap((listing) => listing.action_log ?? []);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Welkom, {profile?.naam ?? 'daar'}!</h1>

      <WowCijfer bedrag={wowCijfer} />
```

door:

```ts
  const wowCijfer = berekenWowCijfer(vergelijkingen);
  const startmaand = vroegsteSamenwerkingGestart((listings ?? []).map((listing) => listing.samenwerking_gestart));
  const actielogItems = (listings ?? []).flatMap((listing) => listing.action_log ?? []);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Welkom, {profile?.naam ?? 'daar'}!</h1>

      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/page.tsx"
git commit -m "feat: klantdashboard geeft samenwerking-startmaand door aan Impactmeter"
```

---

### Task 4: Verificatie

**Files:** geen wijzigingen — verificatiestap.

- [ ] **Step 1: Run de volledige testsuite**

Run: `npm test`
Expected: alle tests slagen.

- [ ] **Step 2: Lint en build**

Run: `npm run lint && npm run build`
Expected: geen lint-errors in de gewijzigde bestanden (negeer bestaande fouten in
`supabase/.temp/`, zie eerdere toelichting in deze sessie); build/typecheck slaagt.

- [ ] **Step 3: Handmatig testen tegen de dev-server**

Run: `npm run dev`, log in als klant, open het dashboard.
Expected: bovenaan staat "IMPACTMETER" / "Extra inkomsten sinds start samenwerking" / het
bedrag / "sinds {maand} {jaar}" (als er een samenwerking_gestart bekend is voor minstens één
accommodatie van deze klant). Sluit de dev-server af (Ctrl+C) na verificatie.
