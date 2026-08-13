# Mobiele formulieren & tabellen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix overflow on narrow screens for 6 tables (clipped instead of scrollable), 6 form rows (controls run off-screen instead of wrapping), and 2 tab-strips (would look broken if wrapped, so they scroll instead) — deelproject 2/3 of the mobile-compatibility audit.

**Architecture:** Three independent, mechanical CSS-only fixes applied across a fixed list of files: wrap raw `<table>`s in `overflow-x-auto` containers (matching the existing `ui/table.tsx` pattern), add `flex-wrap` to un-wrapped form-control rows (matching the existing `activiteit-toevoegen-formulier.tsx` pattern), and add `overflow-x-auto` + `whitespace-nowrap` to two tab-strip rows. No component logic, props, or behavior changes anywhere — every change is additive CSS classes only.

**Tech Stack:** Tailwind CSS utility classes only. No new dependencies, no test infrastructure changes.

**Reference:** Spec at `docs/superpowers/specs/2026-08-13-mobiele-formulieren-tabellen-design.md`. No DB/backend changes — pure frontend. Follows deelproject 1/3 (`docs/superpowers/plans/2026-08-13-mobiele-navigatie.md`, already shipped).

---

### Task 1: Wrap 6 tables in `overflow-x-auto`

**Files:**
- Modify: `src/components/dashboard/kanaal-uitsplitsing.tsx`
- Modify: `src/components/dashboard/trend-tabel.tsx`
- Modify: `src/components/dashboard/listings-tabel.tsx`
- Modify: `src/app/[locale]/admin/klanten/page.tsx`
- Modify: `src/components/admin/nulmeting-tabel.tsx`
- Modify: `src/components/admin/resultaten-tabel.tsx`

Five of the six need a brand-new wrapper `<div>` around multi-line table markup — a partial find/replace snippet can't correctly re-indent everything inside, so those five are given as full-file replacements below. Only `kanaal-uitsplitsing.tsx` (Step 1) is a single-line edit, since it already has a wrapper div and just needs one class swapped.

- [ ] **Step 1: `kanaal-uitsplitsing.tsx` — swap `overflow-hidden` for `overflow-x-auto`**

This table already has a wrapper div, just with the wrong overflow behavior for horizontal scrolling. In `src/components/dashboard/kanaal-uitsplitsing.tsx`, change:

```tsx
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden min-w-0">
```

to:

```tsx
      <div className="flex-1 bg-card border border-border rounded-xl overflow-x-auto min-w-0">
```

- [ ] **Step 2: Replace the full contents of `trend-tabel.tsx`**

This table has no wrapper div — the overflow class sits directly on the `<table>`, which doesn't create a scroll container. Replace the full contents of `src/components/dashboard/trend-tabel.tsx` with:

```tsx
import { MAAND_NAMEN_VOL } from '@/lib/constants/maanden';

interface TrendRij {
  maand: string; // 'YYYY-MM'
  omzet: number;
  omzetStly: number;
  omzetNulmeting: number | null;
}

export function TrendTabel({ trend, vergelijkModus }: { trend: TrendRij[]; vergelijkModus: 'stly' | 'nulmeting' }) {
  if (trend.length === 0) return null;

  return (
    <div className="overflow-x-auto bg-card border border-border rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted text-xs text-muted-foreground uppercase">
            <th className="text-left px-4 py-2">Maand</th>
            <th className="text-right px-4 py-2">Omzet</th>
            <th className="text-right px-4 py-2">{vergelijkModus === 'stly' ? 'STLY' : 'Nulmeting'}</th>
            <th className="text-right px-4 py-2">Verschil</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((t) => {
            const [jaarStr, maandStr] = t.maand.split('-');
            const label = `${MAAND_NAMEN_VOL[Number(maandStr) - 1]} ${jaarStr}`;
            const vergelijkWaarde = vergelijkModus === 'stly' ? t.omzetStly : t.omzetNulmeting;
            // vergelijkWaarde is alleen null als er écht geen vergelijkingsdata is
            // (nulmeting-modus zonder gekoppelde periode) — dat is iets anders dan een
            // vergelijkingsomzet van precies € 0, wat een geldige waarde is (bv. STLY
            // vóórdat de listing bestond). Bij "0 naar iets positiefs" is een relatief
            // percentage niet zinvol (deling door nul), dus dat geval krijgt het label
            // "nieuw" i.p.v. stil verdwijnen achter hetzelfde streepje als "geen data".
            const geenVergelijkingsdata = vergelijkWaarde === null;
            const verschil = !geenVergelijkingsdata && vergelijkWaarde > 0
              ? ((t.omzet - vergelijkWaarde) / vergelijkWaarde) * 100
              : null;
            const isNieuw = !geenVergelijkingsdata && vergelijkWaarde === 0 && t.omzet > 0;
            return (
              <tr key={t.maand} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{label}</td>
                <td className="px-4 py-2 text-right font-medium">€ {t.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {geenVergelijkingsdata ? '—' : `€ ${vergelijkWaarde.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`}
                </td>
                <td className="px-4 py-2 text-right">
                  {isNieuw ? (
                    <span className="text-green-700">nieuw</span>
                  ) : verschil !== null ? (
                    <span className={verschil >= 0 ? 'text-green-700' : 'text-red-700'}>
                      {verschil >= 0 ? '+' : ''}
                      {verschil.toFixed(1)}%
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

The only functional change from the original: a new wrapper `<div>` takes over the `bg-card border border-border rounded-xl` styling (plus `overflow-x-auto` for the scroll container), and the `<table>` itself keeps only `w-full text-sm`. This isn't just a cosmetic move — `overflow-hidden` was clipping the `<thead>`'s `bg-muted` header background to the table's rounded top corners; dropping it without moving the clip elsewhere would leave the header's square corners visibly overhanging the rounded box on every screen width, not just narrow ones. Putting `overflow-x-auto` on the same element that owns `rounded-xl` (mirroring `kanaal-uitsplitsing.tsx`'s already-correct wrapper) preserves that clipping while adding scroll. Everything else is unchanged.

- [ ] **Step 3: Replace the full contents of `listings-tabel.tsx`**

Same situation as `trend-tabel.tsx`. Replace the full contents of `src/components/dashboard/listings-tabel.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import type { OmzetMetrics } from '@/lib/dashboard/omzet-aggregatie';

interface ListingRij extends OmzetMetrics {
  listing_id: string;
  listing_naam: string;
}

type SortKey = 'naam' | 'omzet' | 'adr' | 'bezetting' | 'nachten';

export function ListingsTabel({ listings }: { listings: ListingRij[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('omzet');
  const [sortAsc, setSortAsc] = useState(false);

  if (listings.length === 0) return null;

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else {
      setSortKey(k);
      setSortAsc(k === 'naam');
    }
  }

  const maxOmzet = Math.max(...listings.map((l) => l.omzet), 1);
  const gesorteerd = [...listings].sort((a, b) => {
    let v = 0;
    if (sortKey === 'naam') v = a.listing_naam.localeCompare(b.listing_naam);
    else if (sortKey === 'omzet') v = a.omzet - b.omzet;
    else if (sortKey === 'adr') v = a.adr - b.adr;
    else if (sortKey === 'bezetting') v = a.bezetting - b.bezetting;
    else if (sortKey === 'nachten') v = a.nachten - b.nachten;
    return sortAsc ? v : -v;
  });

  const kolommen: { k: SortKey; label: string }[] = [
    { k: 'naam', label: 'Accommodatie' },
    { k: 'omzet', label: 'Omzet' },
    { k: 'adr', label: 'ADR' },
    { k: 'bezetting', label: 'Bezetting' },
    { k: 'nachten', label: 'Nachten' },
  ];

  return (
    <div className="overflow-x-auto bg-card border border-border rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted text-xs text-muted-foreground uppercase select-none">
            {kolommen.map((kol) => (
              <th
                key={kol.k}
                tabIndex={0}
                aria-sort={sortKey === kol.k ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                onClick={() => toggleSort(kol.k)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSort(kol.k);
                  }
                }}
                className={`px-4 py-2 cursor-pointer ${kol.k === 'naam' ? 'text-left' : 'text-right'}`}
              >
                {kol.label}
                {sortKey === kol.k ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gesorteerd.map((l) => (
            <tr key={l.listing_id} className="border-t border-border">
              <td className="px-4 py-2">
                <div className="font-medium">{l.listing_naam}</div>
                <div className="w-full bg-muted rounded-full h-1 mt-1">
                  <div className="bg-primary h-1 rounded-full" style={{ width: `${(l.omzet / maxOmzet) * 100}%` }} />
                </div>
              </td>
              <td className="px-4 py-2 text-right font-medium">€ {l.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
              {/* Geen "> 0"-gate op adr/bezetting/nachten: aggregeer() geeft hier altijd een
                  echt getal terug, nooit null/undefined. Een listing met 0% bezetting is
                  precies de listing die een klant wil zien opvallen, niet weggemoffeld
                  achter een "geen data"-streepje. */}
              <td className="px-4 py-2 text-right">€ {l.adr.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
              <td className="px-4 py-2 text-right">{l.bezetting.toFixed(1)}%</td>
              <td className="px-4 py-2 text-right">{Math.round(l.nachten)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Same only-functional-change note as Step 2: `bg-card border border-border rounded-xl` move to the wrapper `<div>` alongside `overflow-x-auto`, so the header's clipped rounded corners are preserved.

- [ ] **Step 4: Replace the full contents of `admin/klanten/page.tsx`**

This table has no overflow handling at all. Replace the full contents of `src/app/[locale]/admin/klanten/page.tsx` with:

```tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function KlantenPage() {
  const supabase = await createClient();
  const { data: klanten, error } = await supabase
    .from('clients')
    .select('id, naam, email, status, aangemaakt_op, listings(count)')
    .order('aangemaakt_op', { ascending: false });

  if (error) console.error('Kon klanten niet laden:', error);

  return (
    <main className="mx-auto max-w-5xl py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Klanten</h1>
        <div className="flex gap-2">
          <Link href="/admin/klanten/nieuw" className="rounded bg-primary px-4 py-2 text-primary-foreground text-sm">
            + Nieuwe klant
          </Link>
          <Link href="/admin/import" className="rounded border border-border px-4 py-2 text-sm">
            CSV importeren
          </Link>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive">Kon klanten niet laden. Probeer de pagina te vernieuwen.</p>
      ) : klanten && klanten.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen klanten. Voeg je eerste klant toe.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Overzicht van alle klanten</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2">Naam</th>
                <th scope="col">E-mail</th>
                <th scope="col">Status</th>
                <th scope="col">Accommodaties</th>
                <th scope="col">Aangemaakt</th>
              </tr>
            </thead>
            <tbody>
              {klanten?.map((klant) => (
                <tr key={klant.id} className="border-b border-border/50">
                  <td className="py-2">
                    <Link href={`/admin/klanten/${klant.id}/instellingen`} className="hover:underline">{klant.naam}</Link>
                  </td>
                  <td>{klant.email}</td>
                  <td>{klant.status}</td>
                  <td>{klant.listings?.[0]?.count ?? 0}</td>
                  <td>{new Date(klant.aangemaakt_op).toLocaleDateString('nl-NL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Replace the full contents of `nulmeting-tabel.tsx`**

Replace the full contents of `src/components/admin/nulmeting-tabel.tsx` with:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { corrigeerNulmeting } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAAND_NAMEN_KORT } from '@/lib/constants/maanden';

interface NulmetingRij {
  id: string;
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

export function NulmetingTabel({
  listingId,
  clientId,
  rijen,
}: {
  listingId: string;
  clientId: string;
  rijen: NulmetingRij[];
}) {
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const gesorteerd = [...rijen].sort((a, b) => a.jaar - b.jaar || a.maand - b.maand);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th>Maand</th><th>Omzet</th><th>Bezetting</th><th />
          </tr>
        </thead>
        <tbody>
          {gesorteerd.map((rij) =>
            bewerkId === rij.id ? (
              <CorrectieRij
                key={rij.id}
                rij={rij}
                listingId={listingId}
                clientId={clientId}
                onKlaar={() => setBewerkId(null)}
              />
            ) : (
              <tr key={rij.id}>
                <td>{MAAND_NAMEN_KORT[rij.maand - 1]} {rij.jaar}</td>
                <td>€ {rij.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
                <td>{rij.bezetting}%</td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => setBewerkId(rij.id)}>Corrigeren</Button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function CorrectieRij({
  rij,
  listingId,
  clientId,
  onKlaar,
}: {
  rij: NulmetingRij;
  listingId: string;
  clientId: string;
  onKlaar: () => void;
}) {
  const [omzet, setOmzet] = useState(rij.omzet);
  const [bezetting, setBezetting] = useState(rij.bezetting);
  const [reden, setReden] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await corrigeerNulmeting({ nulmetingId: rij.id, omzet, bezetting, reden, listingId, clientId });
        onKlaar();
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <tr>
      <td>{MAAND_NAMEN_KORT[rij.maand - 1]} {rij.jaar}</td>
      <td><Input type="number" value={omzet} onChange={(e) => setOmzet(Number(e.target.value))} /></td>
      <td><Input type="number" value={bezetting} onChange={(e) => setBezetting(Number(e.target.value))} /></td>
      <td className="space-y-1">
        <Input placeholder="Reden voor correctie" value={reden} onChange={(e) => setReden(e.target.value)} />
        {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        <div className="flex gap-1">
          <Button size="sm" disabled={!reden.trim() || isPending} onClick={opslaan}>Opslaan</Button>
          <Button size="sm" variant="ghost" onClick={onKlaar}>Annuleren</Button>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 6: Replace the full contents of `resultaten-tabel.tsx`**

Replace the full contents of `src/components/admin/resultaten-tabel.tsx` with:

```tsx
import { MAAND_NAMEN_KORT } from '@/lib/constants/maanden';

interface ActueleRij {
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

// Vast venster van 12 maanden rond vandaag: de afgelopen 6 (inclusief de huidige maand)
// plus de komende 6 — dus offset -5 t/m +6 t.o.v. de huidige maand.
function twaalfMaandenVenster(): { jaar: number; maand: number }[] {
  const nu = new Date();
  const basisJaar = nu.getUTCFullYear();
  const basisMaandIndex = nu.getUTCMonth(); // 0-11

  const maanden: { jaar: number; maand: number }[] = [];
  for (let offset = -5; offset <= 6; offset++) {
    const totaalMaandenIndex = basisMaandIndex + offset;
    const jaar = basisJaar + Math.floor(totaalMaandenIndex / 12);
    const maand = ((totaalMaandenIndex % 12) + 12) % 12 + 1;
    maanden.push({ jaar, maand });
  }
  return maanden;
}

export function ResultatenTabel({
  actueel,
  pricelabsListingId,
}: {
  actueel: ActueleRij[];
  pricelabsListingId: string | null;
}) {
  // Zonder koppeling is er sowieso niets gesynchroniseerd — een tabel vol streepjes
  // zou dan niet te onderscheiden zijn van "wel gekoppeld, nog niet gesynchroniseerd".
  // PricelabsKoppeling (hierboven op de pagina) toont de koppelstatus al.
  if (!pricelabsListingId) return null;

  const actueelPerMaand = new Map(actueel.map((rij) => [`${rij.jaar}-${rij.maand}`, rij]));
  const venster = twaalfMaandenVenster();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th>Maand</th>
            <th>Omzet</th>
            <th>Bezetting</th>
          </tr>
        </thead>
        <tbody>
          {venster.map(({ jaar, maand }) => {
            const rij = actueelPerMaand.get(`${jaar}-${maand}`);
            return (
              <tr key={`${jaar}-${maand}`}>
                <td>
                  {MAAND_NAMEN_KORT[maand - 1]} {jaar}
                </td>
                <td>{rij ? `€ ${rij.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}` : '—'}</td>
                <td>{rij ? `${rij.bezetting}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/kanaal-uitsplitsing.tsx src/components/dashboard/trend-tabel.tsx src/components/dashboard/listings-tabel.tsx "src/app/[locale]/admin/klanten/page.tsx" src/components/admin/nulmeting-tabel.tsx src/components/admin/resultaten-tabel.tsx
git commit -m "fix: tabellen scrollen horizontaal op smalle schermen i.p.v. te clippen"
```

---

### Task 2: Add `flex-wrap` to 6 un-wrapped form rows

**Files:**
- Modify: `src/components/portal/todo-rij.tsx`
- Modify: `src/components/admin/checklist-item-toevoegen-formulier.tsx`
- Modify: `src/components/admin/todo-toevoegen-formulier.tsx`
- Modify: `src/components/admin/fase-voortgang-formulier.tsx`
- Modify: `src/components/admin/samenwerking-nulmeting-form.tsx`
- Modify: `src/components/admin/pricelabs-koppeling.tsx`

Each of these has a `flex items-end gap-2` or `flex items-center gap-2` row packing 2-5 controls with no `flex-wrap` — on a narrow screen the controls run off-screen instead of dropping to a new line. `src/components/admin/activiteit-toevoegen-formulier.tsx` (not touched by this task — it's already correct) already uses `flex flex-wrap items-end gap-2` for the exact same kind of row; these six are brought in line with that existing, working pattern.

- [ ] **Step 1: `todo-rij.tsx` — the inline edit row**

In `src/components/portal/todo-rij.tsx`, inside the `TodoBewerkRij` function, change:

```tsx
    <div className="flex items-center gap-2 text-sm">
      <Input value={naam} onChange={(e) => setNaam(e.target.value)} className="flex-1" />
```

to:

```tsx
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Input value={naam} onChange={(e) => setNaam(e.target.value)} className="flex-1" />
```

(Do NOT change the other, similarly-named `<div className="flex items-center gap-2 text-sm">` in the same file inside `TodoRij` itself — that's the non-editing display row, out of scope for this plan; only the `TodoBewerkRij` edit row's wrapper needs this change.)

- [ ] **Step 2: `checklist-item-toevoegen-formulier.tsx`**

In `src/components/admin/checklist-item-toevoegen-formulier.tsx`, change:

```tsx
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor={`checklist-fase-${clientId}`} className="block text-xs text-muted-foreground">
```

to:

```tsx
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`checklist-fase-${clientId}`} className="block text-xs text-muted-foreground">
```

- [ ] **Step 3: `todo-toevoegen-formulier.tsx`**

In `src/components/admin/todo-toevoegen-formulier.tsx`, change:

```tsx
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`todo-naam-${clientId}`} className="block text-xs text-muted-foreground">
```

to:

```tsx
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`todo-naam-${clientId}`} className="block text-xs text-muted-foreground">
```

- [ ] **Step 4: `fase-voortgang-formulier.tsx`**

In `src/components/admin/fase-voortgang-formulier.tsx`, change:

```tsx
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor={`fase-select-${clientId}`} className="block text-xs text-muted-foreground">
```

to:

```tsx
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`fase-select-${clientId}`} className="block text-xs text-muted-foreground">
```

- [ ] **Step 5: `samenwerking-nulmeting-form.tsx`**

In `src/components/admin/samenwerking-nulmeting-form.tsx`, change:

```tsx
      <div className="flex items-center gap-2">
        <Input
          id={`samenwerking-gestart-${listingId}`}
```

to:

```tsx
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`samenwerking-gestart-${listingId}`}
```

- [ ] **Step 6: `pricelabs-koppeling.tsx`**

In `src/components/admin/pricelabs-koppeling.tsx`, change:

```tsx
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Gekoppeld aan PriceLabs ({pricelabsListingId})</span>
```

to:

```tsx
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Gekoppeld aan PriceLabs ({pricelabsListingId})</span>
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/portal/todo-rij.tsx src/components/admin/checklist-item-toevoegen-formulier.tsx src/components/admin/todo-toevoegen-formulier.tsx src/components/admin/fase-voortgang-formulier.tsx src/components/admin/samenwerking-nulmeting-form.tsx src/components/admin/pricelabs-koppeling.tsx
git commit -m "fix: formulierrijen breken netjes af op smalle schermen i.p.v. van het scherm te lopen"
```

---

### Task 3: Tab-strips scroll horizontally instead of wrapping

**Files:**
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/dashboard/omzet-dashboard.tsx`

Unlike Task 2's form rows, these two are horizontal tab strips with a `border-b` underline style — wrapping them onto two lines would look broken (the underline would split per row). Instead they get horizontal scroll: `overflow-x-auto` plus `whitespace-nowrap` so button/tab labels never wrap mid-text before the scroll kicks in.

- [ ] **Step 1: `ui/tabs.tsx` — `TabsList`**

This is a shared primitive (`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`), currently used by the 4-tab Koppeling/Nulmeting/Resultaten/Actielog strip on the admin klant-instellingen page (`src/app/[locale]/admin/klanten/[id]/instellingen/page.tsx`) — fixing it here fixes every current and future use. Its `TabsTrigger` children already have `whitespace-nowrap` (see the `TabsTrigger` className below `TabsList` in the same file), so only `TabsList` itself needs the scroll treatment.

In `src/components/ui/tabs.tsx`, change:

```tsx
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
```

to:

```tsx
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
```

- [ ] **Step 2: `omzet-dashboard.tsx` — the periode-tabstrip**

Unlike `TabsList`, these are plain `<button>` elements without `whitespace-nowrap` already applied — that needs to be added alongside the scroll container class.

In `src/components/dashboard/omzet-dashboard.tsx`, change:

```tsx
        <div className="flex gap-1 border-b border-border">
          {PERIODES.map((p) => (
            <button
              key={p.id}
              onClick={() => kiesPeriode(p.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${periodeId === p.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
            >
```

to:

```tsx
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {PERIODES.map((p) => (
            <button
              key={p.id}
              onClick={() => kiesPeriode(p.id)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${periodeId === p.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
            >
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/tabs.tsx src/components/dashboard/omzet-dashboard.tsx
git commit -m "fix: tab-strips scrollen horizontaal op smalle schermen i.p.v. te wrappen"
```

---

### Task 4: Full verification and push

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --fileParallelism=false`
Expected: all tests pass. This plan adds no new automated tests (no component-testing infrastructure — same as deelproject 1/3) — the count should be unchanged from before this plan.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors. The two pre-existing, unrelated issues (`src/app/auth/confirm/page.tsx`, the gitignored `supabase/.temp/` directory) are expected and fine.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully (already confirmed in Tasks 1-3, re-confirm here as the final gate).

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and check, at a narrow viewport (< 400px, e.g. browser dev-tools device emulation or an actual phone):

- **Tables:** on each of the 6 pages/components touched in Task 1, the table scrolls horizontally within its own box when its content is wider than the screen, instead of clipping/cutting off columns. (Klant Cijfers page for `KanaalUitsplitsing`/`TrendTabel`/`ListingsTabel`; `/admin/klanten` for the klant list; the Nulmeting tab on `/admin/klanten/[id]/instellingen` for `NulmetingTabel`; the Resultaten tab for `ResultatenTabel`.)
- **Forms:** on each of the 6 places touched in Task 2, the controls wrap onto a second (or third) line instead of running off-screen or overlapping. (The inline to-do edit row on a klant/admin Voortgang page; the checklist-item and to-do "toevoegen" forms on an admin Voortgang page with a client that has >1 listing, so the extra "Woning" dropdown is present too; the Fase-voortgang form and Nulmeting-(her)berekenen form on an admin klant-instellingen page; the PriceLabs-koppeling status row once a listing is linked.)
- **Tab strips:** the Koppeling/Nulmeting/Resultaten/Actielog tabs on `/admin/klanten/[id]/instellingen`, and the Deze maand/Vorige maand/Dit jaar/Eigen periode tabs in `OmzetDashboard`, both scroll horizontally within their own row instead of wrapping or overflowing the page.
- **Wide screens (≥ 768px or so):** everything above looks exactly as it did before this plan — none of these classes have any effect once content already fits.

- [ ] **Step 5: Push**

```bash
git push origin main
```

No manual production-database migration is needed for this plan (no schema changes).
