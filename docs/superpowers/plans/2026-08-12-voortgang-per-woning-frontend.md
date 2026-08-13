# Voortgang per woning — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a woning-filter dropdown to the Voortgang page (admin and klant), let the admin label checklist-items/to-do's/handmatige activiteiten with a woning ("Algemeen" or one specific listing), live-recompute the fase-percentage when filtered, and show the Airbnb-funnel-nulmeting per listing instead of once per client.

**Architecture:** A new client component, `VoortgangInhoud`, owns the "selected woning" filter state and renders everything currently on the Voortgang page (balk, checklist, funnel blocks, to-do's, activiteitenlog, and — for admin — all four add/edit forms) filtered by that selection. Both Voortgang pages (admin and klant) become thin data-fetching wrappers that pass their raw query results into this one component with an `isAdmin` flag, mirroring the existing `magBewerken`/`isAdmin` prop pattern already used by `VoortgangsChecklist`/`VoortgangsTodos`. This plan builds directly on the already-implemented backend plan (`docs/superpowers/plans/2026-08-12-voortgang-per-woning-backend.md`), which added the `listing_id` columns and updated the server actions — this plan is the first to actually use them from the UI.

**Tech Stack:** Next.js App Router Server Components (data fetching) + Client Components (interactive filtering), no new dependencies.

**Reference:** Spec at `docs/superpowers/specs/2026-08-12-voortgang-per-woning-design.md`, "UI" section (section 3). There is no automated test coverage for React components in this project (no component-testing infrastructure) — every task in this plan is verified via `npm run build` and, in the final task, manual verification.

---

### Task 1: Shared `VoortgangListing` type + `listingId` on the three item interfaces

**Files:**
- Create: `src/components/portal/voortgang-listing.ts`
- Modify: `src/components/portal/voortgangs-checklist.tsx`
- Modify: `src/components/portal/todo-rij.tsx`
- Modify: `src/components/portal/voortgangs-activiteitenlog.tsx`

- [ ] **Step 1: Create the shared listing type**

Create `src/components/portal/voortgang-listing.ts`:

```typescript
export interface VoortgangListing {
  id: string;
  naam: string;
}
```

This is a tiny, standalone file (not re-exported from a bigger component) so that both the new orchestrating component (Task 3) and the leaf components/forms (Task 2) can import it without an awkward import direction (a leaf component importing from the component that renders it).

- [ ] **Step 2: Add `listingId` to `ChecklistItem`**

In `src/components/portal/voortgangs-checklist.tsx`, change:

```typescript
export interface ChecklistItem {
  id: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
  afgevinkt: boolean;
}
```

to:

```typescript
export interface ChecklistItem {
  id: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
  afgevinkt: boolean;
  listingId: string | null;
}
```

No other change needed in this file — `VoortgangsChecklist` and `ChecklistItemRij` don't need to read or display `listingId` themselves; it's only used for filtering, which happens one level up (Task 3).

- [ ] **Step 3: Add `listingId` to `Todo`**

In `src/components/portal/todo-rij.tsx`, change:

```typescript
export interface Todo {
  id: string;
  naam: string;
  deadline: string;
  afgevinkt: boolean;
}
```

to:

```typescript
export interface Todo {
  id: string;
  naam: string;
  deadline: string;
  afgevinkt: boolean;
  listingId: string | null;
}
```

(The rest of this file's `listingId`-related changes — the woning-picker on the edit form — are in Task 2, since that also requires new props and JSX, not just the interface.)

- [ ] **Step 4: Add `listingId` to `ActiviteitenlogItem`**

In `src/components/portal/voortgangs-activiteitenlog.tsx`, change:

```typescript
export interface ActiviteitenlogItem {
  id: string;
  datum: string;
  omschrijving: string;
}
```

to:

```typescript
export interface ActiviteitenlogItem {
  id: string;
  datum: string;
  omschrijving: string;
  listingId: string | null;
}
```

No other change needed in this file — `VoortgangsActiviteitenlog` doesn't display `listingId`, only filters on it (Task 3).

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: still fails — same 2 known errors as before (`airbnb-funnel-nulmeting.tsx` missing `listingId` in its `werkAirbnbFunnelNulmetingBij` call, `voortgang/page.tsx` querying `airbnb_funnel_nulmeting` by the removed `client_id`) plus now also errors in `voortgang/page.tsx` and `dashboard/voortgang/page.tsx` where they build `itemsData`/`todosData`/`activiteitenData` without a `listingId` field (since the interfaces just gained a required field). This is expected — those pages are rewritten in Task 4. Confirm the errors are all in these known files (the two pages plus the two already-known-broken files) and nowhere else.

- [ ] **Step 6: Commit**

```bash
git add src/components/portal/voortgang-listing.ts src/components/portal/voortgangs-checklist.tsx src/components/portal/todo-rij.tsx src/components/portal/voortgangs-activiteitenlog.tsx
git commit -m "feat: listingId op ChecklistItem/Todo/ActiviteitenlogItem + gedeeld VoortgangListing-type"
```

---

### Task 2: `AirbnbFunnelNulmeting` becomes listing-scoped

**Files:**
- Modify: `src/components/portal/airbnb-funnel-nulmeting.tsx`

- [ ] **Step 1: Replace the full contents of the file**

Replace the full contents of `src/components/portal/airbnb-funnel-nulmeting.tsx` with:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { werkAirbnbFunnelNulmetingBij } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AirbnbFunnelWaarden {
  gemiddeldConversiepercentage: number | null;
  percentageZoekvertoningenEerstePagina: number | null;
  conversieZoekopdrachtNaarAdvertentie: number | null;
  conversieAdvertentieNaarBoeking: number | null;
}

const VELDEN: { sleutel: keyof AirbnbFunnelWaarden; label: string }[] = [
  { sleutel: 'gemiddeldConversiepercentage', label: 'Gemiddelde totale conversiepercentage' },
  { sleutel: 'percentageZoekvertoningenEerstePagina', label: 'Percentage zoekvertoningen op de eerste pagina' },
  { sleutel: 'conversieZoekopdrachtNaarAdvertentie', label: 'Gemiddelde conversie van zoekopdracht naar advertentie' },
  { sleutel: 'conversieAdvertentieNaarBoeking', label: 'Gemiddelde conversie van advertentie naar boeking' },
];

function formatteerDatum(datum: string): string {
  return new Date(`${datum}T00:00:00Z`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function AirbnbFunnelNulmeting({
  clientId,
  listingId,
  listingNaam,
  waarden,
  nulmetingDatum,
  magBewerken,
}: {
  clientId: string;
  listingId: string;
  listingNaam: string;
  waarden: AirbnbFunnelWaarden;
  nulmetingDatum: string | null;
  magBewerken: boolean;
}) {
  const [invoer, setInvoer] = useState(waarden);
  const [datum, setDatum] = useState(nulmetingDatum ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const titel = listingNaam ? `Nulmeting Airbnb funnel — ${listingNaam}` : 'Nulmeting Airbnb funnel';

  if (!magBewerken) {
    return (
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-medium">{titel}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {VELDEN.map((veld) => (
            <div key={veld.sleutel} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{veld.label}</p>
              <p className="text-lg font-bold">
                {waarden[veld.sleutel] !== null ? `${waarden[veld.sleutel]}%` : '—'}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {nulmetingDatum ? `Gemeten op ${formatteerDatum(nulmetingDatum)}` : 'Meetdatum nog niet ingevuld'}
        </p>
      </div>
    );
  }

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await werkAirbnbFunnelNulmetingBij({ clientId, listingId, ...invoer, nulmetingDatum: datum || null });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-sm font-medium">{titel}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {VELDEN.map((veld) => (
          <div key={veld.sleutel} className="bg-card border border-border rounded-xl p-4">
            <label htmlFor={`funnel-${veld.sleutel}-${listingId}`} className="block text-xs text-muted-foreground mb-1">
              {veld.label}
            </label>
            <div className="flex items-center gap-1">
              <Input
                id={`funnel-${veld.sleutel}-${listingId}`}
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={invoer[veld.sleutel] ?? ''}
                onChange={(e) =>
                  setInvoer((huidig) => ({
                    ...huidig,
                    [veld.sleutel]: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="text-lg font-bold"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
      <div>
        <label htmlFor={`funnel-datum-${listingId}`} className="block text-xs text-muted-foreground mb-1">
          Datum van de meting
        </label>
        <Input
          id={`funnel-datum-${listingId}`}
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          className="w-auto"
        />
      </div>
      <Button size="sm" disabled={isPending} onClick={opslaan}>
        {isPending ? 'Bezig...' : 'Opslaan'}
      </Button>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

What changed from the original: `clientId`-only props became `clientId` (kept, still needed by `werkAirbnbFunnelNulmetingBij` for its `revalidatePath` call) + `listingId` (new, required — identifies which funnel row this block edits) + `listingNaam` (new, used only for the heading, so an admin viewing "Alle woningen" can tell multiple rendered blocks apart). The `id`/`htmlFor` suffixes changed from `-${clientId}` to `-${listingId}` because multiple `AirbnbFunnelNulmeting` blocks can now render on the same page simultaneously (one per listing when "Alle woningen" is selected) — with the old `-${clientId}` suffix, every block would share the same DOM ids, which is invalid HTML and breaks label/input association.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: the specific error this task targeted (`airbnb-funnel-nulmeting.tsx:71`, missing `listingId`) is gone. The remaining errors are the ones already expected from Task 1 (the two pages not yet updated) — confirm no new, different error appeared.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/airbnb-funnel-nulmeting.tsx
git commit -m "feat: AirbnbFunnelNulmeting wordt per woning i.p.v. per klant"
```

---

### Task 3: Woning-picker on the four admin add/edit forms

**Files:**
- Modify: `src/components/admin/checklist-item-toevoegen-formulier.tsx`
- Modify: `src/components/admin/todo-toevoegen-formulier.tsx`
- Modify: `src/components/portal/todo-rij.tsx`
- Modify: `src/components/portal/voortgangs-todos.tsx`
- Modify: `src/components/admin/activiteit-toevoegen-formulier.tsx`

Every woning-picker in this task follows the same rule: hidden entirely when the client has 1 or fewer listings (matches the main filter dropdown's visibility rule in Task 4 — with only one listing, "Algemeen vs. that one listing" isn't a meaningful distinction worth showing), and defaults to `""` (rendered as "Algemeen") for add-forms, or to the item's current `listingId` for the edit form.

- [ ] **Step 1: Replace the full contents of `checklist-item-toevoegen-formulier.tsx`**

Replace the full contents of `src/components/admin/checklist-item-toevoegen-formulier.tsx` with:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegChecklistItemToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FASE_NAMEN } from '@/lib/constants/fasen';
import type { VoortgangListing } from '@/components/portal/voortgang-listing';

export function ChecklistItemToevoegenFormulier({
  clientId,
  listings,
}: {
  clientId: string;
  listings: VoortgangListing[];
}) {
  const [faseNummer, setFaseNummer] = useState<1 | 2 | 3>(1);
  const [naam, setNaam] = useState('');
  const [listingId, setListingId] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!naam.trim()) {
      setFoutmelding('Naam is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegChecklistItemToe({ clientId, faseNummer, naam, listingId: listingId || null });
        setNaam('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor={`checklist-fase-${clientId}`} className="block text-xs text-muted-foreground">
            Fase
          </label>
          <select
            id={`checklist-fase-${clientId}`}
            value={faseNummer}
            onChange={(e) => setFaseNummer(Number(e.target.value) as 1 | 2 | 3)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {FASE_NAMEN.map((naamOptie, i) => (
              <option key={naamOptie} value={i + 1}>
                {i + 1}. {naamOptie}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor={`checklist-naam-${clientId}`} className="block text-xs text-muted-foreground">
            Naam
          </label>
          <Input id={`checklist-naam-${clientId}`} value={naam} onChange={(e) => setNaam(e.target.value)} />
        </div>
        {listings.length > 1 && (
          <div>
            <label htmlFor={`checklist-woning-${clientId}`} className="block text-xs text-muted-foreground">
              Woning
            </label>
            <select
              id={`checklist-woning-${clientId}`}
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">Algemeen</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.naam}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button size="sm" disabled={isPending} onClick={toevoegen}>
          {isPending ? 'Bezig...' : '+'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Replace the full contents of `todo-toevoegen-formulier.tsx`**

Replace the full contents of `src/components/admin/todo-toevoegen-formulier.tsx` with:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegTodoToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STANDAARD_TODO_NAMEN } from '@/lib/constants/todos';
import type { VoortgangListing } from '@/components/portal/voortgang-listing';

export function TodoToevoegenFormulier({
  clientId,
  listings,
}: {
  clientId: string;
  listings: VoortgangListing[];
}) {
  const [naam, setNaam] = useState('');
  const [deadline, setDeadline] = useState('');
  const [listingId, setListingId] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!naam.trim()) {
      setFoutmelding('Naam is verplicht.');
      return;
    }
    if (!deadline) {
      setFoutmelding('Deadline is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegTodoToe({ clientId, naam, deadline, listingId: listingId || null });
        setNaam('');
        setDeadline('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`todo-naam-${clientId}`} className="block text-xs text-muted-foreground">
            Taak
          </label>
          <Input
            id={`todo-naam-${clientId}`}
            list={`todo-suggesties-${clientId}`}
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
          />
          <datalist id={`todo-suggesties-${clientId}`}>
            {STANDAARD_TODO_NAMEN.map((suggestie) => (
              <option key={suggestie} value={suggestie} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor={`todo-deadline-${clientId}`} className="block text-xs text-muted-foreground">
            Deadline
          </label>
          <Input
            id={`todo-deadline-${clientId}`}
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        {listings.length > 1 && (
          <div>
            <label htmlFor={`todo-woning-${clientId}`} className="block text-xs text-muted-foreground">
              Woning
            </label>
            <select
              id={`todo-woning-${clientId}`}
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">Algemeen</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.naam}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button size="sm" disabled={isPending} onClick={toevoegen}>
          {isPending ? 'Bezig...' : '+'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Replace the full contents of `todo-rij.tsx`**

Replace the full contents of `src/components/portal/todo-rij.tsx` with:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { vinkTodoAf, wijzigTodo, verwijderTodo } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { VoortgangListing } from './voortgang-listing';

export interface Todo {
  id: string;
  naam: string;
  deadline: string;
  afgevinkt: boolean;
  listingId: string | null;
}

function formatteerDeadline(deadline: string): string {
  return new Date(`${deadline}T00:00:00Z`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function TodoRij({
  clientId,
  todo,
  isAdmin,
  listings,
}: {
  clientId: string;
  todo: Todo;
  isAdmin: boolean;
  listings: VoortgangListing[];
}) {
  const [bewerken, setBewerken] = useState(false);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleAfvinken() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await vinkTodoAf({ clientId, todoId: todo.id, afgevinkt: !todo.afgevinkt });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  function verwijder() {
    const bevestigd = window.confirm(`Weet je zeker dat je "${todo.naam}" wilt verwijderen?`);
    if (!bevestigd) return;
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await verwijderTodo({ clientId, todoId: todo.id });
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  if (bewerken) {
    return <TodoBewerkRij clientId={clientId} todo={todo} listings={listings} onKlaar={() => setBewerken(false)} />;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={todo.afgevinkt}
        disabled={isPending}
        onChange={toggleAfvinken}
        className="accent-green-600"
      />
      <span className={todo.afgevinkt ? 'line-through text-muted-foreground' : ''}>{todo.naam}</span>
      <span className="text-xs text-muted-foreground">— {formatteerDeadline(todo.deadline)}</span>
      {isAdmin && (
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setBewerken(true)}>
            Bewerken
          </Button>
          <Button size="sm" variant="ghost" onClick={verwijder} disabled={isPending}>
            Verwijderen
          </Button>
        </div>
      )}
      {foutmelding && <p className="text-xs text-destructive">{foutmelding}</p>}
    </div>
  );
}

function TodoBewerkRij({
  clientId,
  todo,
  listings,
  onKlaar,
}: {
  clientId: string;
  todo: Todo;
  listings: VoortgangListing[];
  onKlaar: () => void;
}) {
  const [naam, setNaam] = useState(todo.naam);
  const [deadline, setDeadline] = useState(todo.deadline);
  const [listingId, setListingId] = useState(todo.listingId ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await wijzigTodo({ clientId, todoId: todo.id, naam, deadline, listingId: listingId || null });
        onKlaar();
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Input value={naam} onChange={(e) => setNaam(e.target.value)} className="flex-1" />
      <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-auto" />
      {listings.length > 1 && (
        <select
          value={listingId}
          onChange={(e) => setListingId(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">Algemeen</option>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.naam}
            </option>
          ))}
        </select>
      )}
      <Button size="sm" disabled={isPending} onClick={opslaan}>
        Opslaan
      </Button>
      <Button size="sm" variant="ghost" onClick={onKlaar}>
        Annuleren
      </Button>
      {foutmelding && <p className="text-xs text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

Note that `TodoBewerkRij`'s `listingId` state is seeded from `todo.listingId ?? ''` (the todo's CURRENT label) and always sent back on save (never omitted) — this is deliberate: `wijzigTodo` treats an omitted `listingId` the same as an explicit `null` (clears the label), so editing a todo's name/deadline must always resend its current woning to avoid silently wiping it back to "Algemeen".

- [ ] **Step 4: Replace the full contents of `voortgangs-todos.tsx`**

Replace the full contents of `src/components/portal/voortgangs-todos.tsx` with:

```tsx
import { TodoRij, type Todo } from './todo-rij';
import type { VoortgangListing } from './voortgang-listing';

export function VoortgangsTodos({
  todos,
  clientId,
  isAdmin,
  listings,
}: {
  todos: Todo[];
  clientId: string;
  isAdmin: boolean;
  listings: VoortgangListing[];
}) {
  const gesorteerd = [...todos].sort((a, b) => (a.deadline < b.deadline ? -1 : 1));

  if (gesorteerd.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen to-do&apos;s.</p>;
  }

  return (
    <ul className="space-y-2">
      {gesorteerd.map((todo) => (
        <li key={todo.id}>
          <TodoRij clientId={clientId} todo={todo} isAdmin={isAdmin} listings={listings} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Replace the full contents of `activiteit-toevoegen-formulier.tsx`**

Replace the full contents of `src/components/admin/activiteit-toevoegen-formulier.tsx` with:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegActiviteitToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { VoortgangListing } from '@/components/portal/voortgang-listing';

export function ActiviteitToevoegenFormulier({
  clientId,
  listings,
}: {
  clientId: string;
  listings: VoortgangListing[];
}) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [omschrijving, setOmschrijving] = useState('');
  const [listingId, setListingId] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toevoegen() {
    setFoutmelding(null);
    if (!omschrijving.trim()) {
      setFoutmelding('Omschrijving is verplicht.');
      return;
    }
    startTransition(async () => {
      try {
        await voegActiviteitToe({ clientId, datum, omschrijving, listingId: listingId || null });
        setOmschrijving('');
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3 text-sm">
      <div>
        <label htmlFor={`activiteit-datum-${clientId}`} className="block text-xs text-muted-foreground">
          Datum
        </label>
        <Input
          id={`activiteit-datum-${clientId}`}
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
        />
      </div>
      <div className="min-w-[200px] flex-1">
        <label htmlFor={`activiteit-omschrijving-${clientId}`} className="block text-xs text-muted-foreground">
          Omschrijving
        </label>
        <Input
          id={`activiteit-omschrijving-${clientId}`}
          value={omschrijving}
          onChange={(e) => setOmschrijving(e.target.value)}
        />
      </div>
      {listings.length > 1 && (
        <div>
          <label htmlFor={`activiteit-woning-${clientId}`} className="block text-xs text-muted-foreground">
            Woning
          </label>
          <select
            id={`activiteit-woning-${clientId}`}
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Algemeen</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.naam}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button size="sm" disabled={isPending} onClick={toevoegen}>
        {isPending ? 'Bezig...' : '+'}
      </Button>
      {foutmelding && <p className="w-full text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: still fails, but only in the two pages (not yet updated — Task 4) — confirm no errors remain in any of the five files touched by this task.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/checklist-item-toevoegen-formulier.tsx src/components/admin/todo-toevoegen-formulier.tsx src/components/portal/todo-rij.tsx src/components/portal/voortgangs-todos.tsx src/components/admin/activiteit-toevoegen-formulier.tsx
git commit -m "feat: woning-kiezer op de vier voortgang-toevoeg/bewerk-formulieren"
```

---

### Task 4: `VoortgangInhoud` — the woning-filter orchestrator

**Files:**
- Create: `src/components/portal/voortgang-inhoud.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/portal/voortgang-inhoud.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { VoortgangsBalk, type FaseVoortgang } from './voortgangs-balk';
import { VoortgangsChecklist, type ChecklistItem } from './voortgangs-checklist';
import { AirbnbFunnelNulmeting, type AirbnbFunnelWaarden } from './airbnb-funnel-nulmeting';
import { VoortgangsTodos } from './voortgangs-todos';
import type { Todo } from './todo-rij';
import { VoortgangsActiviteitenlog, type ActiviteitenlogItem } from './voortgangs-activiteitenlog';
import type { VoortgangListing } from './voortgang-listing';
import { FaseVoortgangFormulier } from '@/components/admin/fase-voortgang-formulier';
import { ChecklistItemToevoegenFormulier } from '@/components/admin/checklist-item-toevoegen-formulier';
import { TodoToevoegenFormulier } from '@/components/admin/todo-toevoegen-formulier';
import { ActiviteitToevoegenFormulier } from '@/components/admin/activiteit-toevoegen-formulier';

export interface FunnelRij {
  listingId: string;
  waarden: AirbnbFunnelWaarden;
  nulmetingDatum: string | null;
}

const ALLE_FASEN = [1, 2, 3] as const;

export function VoortgangInhoud({
  clientId,
  listings,
  fasen,
  items,
  todos,
  activiteiten,
  funnels,
  isAdmin,
}: {
  clientId: string;
  listings: VoortgangListing[];
  fasen: FaseVoortgang[];
  items: ChecklistItem[];
  todos: Todo[];
  activiteiten: ActiviteitenlogItem[];
  funnels: FunnelRij[];
  isAdmin: boolean;
}) {
  const [geselecteerdeWoning, setGeselecteerdeWoning] = useState<string | null>(null);

  const gefilterdeItems = useMemo(
    () =>
      geselecteerdeWoning === null
        ? items
        : items.filter((i) => i.listingId === null || i.listingId === geselecteerdeWoning),
    [items, geselecteerdeWoning]
  );
  const gefilterdeTodos = useMemo(
    () =>
      geselecteerdeWoning === null
        ? todos
        : todos.filter((t) => t.listingId === null || t.listingId === geselecteerdeWoning),
    [todos, geselecteerdeWoning]
  );
  const gefilterdeActiviteiten = useMemo(
    () =>
      geselecteerdeWoning === null
        ? activiteiten
        : activiteiten.filter((a) => a.listingId === null || a.listingId === geselecteerdeWoning),
    [activiteiten, geselecteerdeWoning]
  );
  const gefilterdeFunnels =
    geselecteerdeWoning === null ? funnels : funnels.filter((f) => f.listingId === geselecteerdeWoning);

  // Bij "Alle woningen" tonen we het opgeslagen (evt. handmatig overschreven) percentage.
  // Bij een specifieke woning wordt het percentage live herberekend uit de gefilterde
  // items — de handmatige override in voortgang_fasen geldt dan niet meer, want die is
  // inherent één getal voor de hele klant en kan niet per woning worden opgesplitst.
  const effectieveFasen: FaseVoortgang[] = useMemo(() => {
    if (geselecteerdeWoning === null) return fasen;
    return ALLE_FASEN.map((faseNummer) => {
      const faseItems = gefilterdeItems.filter((i) => i.faseNummer === faseNummer);
      const totaal = faseItems.length;
      const afgevinkt = faseItems.filter((i) => i.afgevinkt).length;
      return { faseNummer, percentage: totaal > 0 ? Math.round((afgevinkt / totaal) * 100) : 0 };
    });
  }, [fasen, gefilterdeItems, geselecteerdeWoning]);

  return (
    <>
      <div className="mt-6">
        {listings.length > 1 && (
          <div className="mb-6">
            <label htmlFor="woning-filter" className="block text-xs text-muted-foreground">
              Woning
            </label>
            <select
              id="woning-filter"
              value={geselecteerdeWoning ?? ''}
              onChange={(e) => setGeselecteerdeWoning(e.target.value || null)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">Alle woningen</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.naam}
                </option>
              ))}
            </select>
          </div>
        )}
        <VoortgangsBalk fasen={effectieveFasen} />
      </div>
      {isAdmin && <FaseVoortgangFormulier clientId={clientId} />}

      <div className="mt-10">
        <h2 className="font-serif text-xl">Checklist</h2>
        <div className="mt-4">
          <VoortgangsChecklist items={gefilterdeItems} clientId={clientId} magBewerken={isAdmin} />
        </div>
        {isAdmin && <ChecklistItemToevoegenFormulier clientId={clientId} listings={listings} />}

        {gefilterdeFunnels.map((funnel) => (
          <AirbnbFunnelNulmeting
            key={funnel.listingId}
            clientId={clientId}
            listingId={funnel.listingId}
            listingNaam={listings.find((l) => l.id === funnel.listingId)?.naam ?? ''}
            waarden={funnel.waarden}
            nulmetingDatum={funnel.nulmetingDatum}
            magBewerken={isAdmin}
          />
        ))}
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-xl">To-do&apos;s</h2>
        <div className="mt-4">
          <VoortgangsTodos todos={gefilterdeTodos} clientId={clientId} isAdmin={isAdmin} listings={listings} />
        </div>
        {isAdmin && <TodoToevoegenFormulier clientId={clientId} listings={listings} />}
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-xl">Activiteitenlog</h2>
        <div className="mt-4">
          <VoortgangsActiviteitenlog items={gefilterdeActiviteiten} />
        </div>
        {isAdmin && <ActiviteitToevoegenFormulier clientId={clientId} listings={listings} />}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: still fails, but only in the two pages (Task 5) — confirm no error in `voortgang-inhoud.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/voortgang-inhoud.tsx
git commit -m "feat: VoortgangInhoud-component met woning-filter en live fase-percentage-herberekening"
```

---

### Task 5: Wire both Voortgang pages to `VoortgangInhoud`

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx`
- Modify: `src/app/[locale]/dashboard/voortgang/page.tsx`

- [ ] **Step 1: Replace the full contents of the admin page**

Replace the full contents of `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server';
import { VoortgangInhoud, type FunnelRij } from '@/components/portal/voortgang-inhoud';
import type { FaseVoortgang } from '@/components/portal/voortgangs-balk';
import type { ChecklistItem } from '@/components/portal/voortgangs-checklist';
import type { Todo } from '@/components/portal/todo-rij';
import type { ActiviteitenlogItem } from '@/components/portal/voortgangs-activiteitenlog';

export default async function VoortgangPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: fasen }, { data: items }, { data: listings }, { data: todos }, { data: activiteiten }] =
    await Promise.all([
      supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
      supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt, listing_id').eq('client_id', id),
      supabase.from('listings').select('id, naam').eq('client_id', id).order('aangemaakt_op'),
      supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt, listing_id').eq('client_id', id),
      supabase.from('voortgang_activiteitenlog').select('id, datum, omschrijving, listing_id').eq('client_id', id),
    ]);

  const listingsData = (listings ?? []).map((l) => ({ id: l.id, naam: l.naam }));
  const listingIds = listingsData.map((l) => l.id);

  // Twee-staps ophalen (i.p.v. in dezelfde Promise.all): deze query heeft de listing-id's
  // van de query hierboven nodig, en filtert — anders dan de klant-versie van deze pagina
  // — expliciet, omdat de admin-RLS-policy op airbnb_funnel_nulmeting alles ongefilterd
  // doorlaat. Bij 0 woningen wordt de query overgeslagen i.p.v. te vertrouwen op hoe een
  // lege .in()-lijst zich toevallig gedraagt.
  const { data: funnelRows } =
    listingIds.length > 0
      ? await supabase
          .from('airbnb_funnel_nulmeting')
          .select(
            'listing_id, gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
          )
          .in('listing_id', listingIds)
      : { data: [] };

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));
  const itemsData: ChecklistItem[] = (items ?? []).map((i) => ({
    id: i.id,
    faseNummer: i.fase_nummer as 1 | 2 | 3,
    naam: i.naam,
    afgevinkt: i.afgevinkt,
    listingId: i.listing_id,
  }));
  const todosData: Todo[] = (todos ?? []).map((t) => ({
    id: t.id,
    naam: t.naam,
    deadline: t.deadline,
    afgevinkt: t.afgevinkt,
    listingId: t.listing_id,
  }));
  const activiteitenData: ActiviteitenlogItem[] = (activiteiten ?? []).map((a) => ({
    id: a.id,
    datum: a.datum,
    omschrijving: a.omschrijving,
    listingId: a.listing_id,
  }));
  const funnelPerListing = new Map((funnelRows ?? []).map((f) => [f.listing_id, f]));
  const funnels: FunnelRij[] = listingsData.map((l) => {
    const f = funnelPerListing.get(l.id);
    return {
      listingId: l.id,
      waarden: {
        gemiddeldConversiepercentage: f?.gemiddeld_conversiepercentage ?? null,
        percentageZoekvertoningenEerstePagina: f?.percentage_zoekvertoningen_eerste_pagina ?? null,
        conversieZoekopdrachtNaarAdvertentie: f?.conversie_zoekopdracht_naar_advertentie ?? null,
        conversieAdvertentieNaarBoeking: f?.conversie_advertentie_naar_boeking ?? null,
      },
      nulmetingDatum: f?.nulmeting_datum ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <VoortgangInhoud
        clientId={id}
        listings={listingsData}
        fasen={fasenData}
        items={itemsData}
        todos={todosData}
        activiteiten={activiteitenData}
        funnels={funnels}
        isAdmin
      />
    </main>
  );
}
```

- [ ] **Step 2: Replace the full contents of the klant page**

Replace the full contents of `src/app/[locale]/dashboard/voortgang/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoortgangInhoud, type FunnelRij } from '@/components/portal/voortgang-inhoud';
import type { FaseVoortgang } from '@/components/portal/voortgangs-balk';
import type { ChecklistItem } from '@/components/portal/voortgangs-checklist';
import type { Todo } from '@/components/portal/todo-rij';
import type { ActiviteitenlogItem } from '@/components/portal/voortgangs-activiteitenlog';

// Geen expliciet client_id-filter nodig op de queries hieronder: de "klant leest eigen ..."
// RLS-policies scopen dit al af tot precies de data van de ingelogde klant. Dit klopt alleen
// voor een klant-sessie — dashboard/layout.tsx redirect een admin-sessie al weg vóórdat deze
// pagina rendert. Anders dan de admin-versie van deze pagina hoeft de airbnb_funnel_nulmeting
// -query hier geen aparte, latere stap te zijn (geen listing-id's nodig om 'm te filteren) —
// RLS scopet 'm al automatisch af tot de eigen woningen, dus die hoort gewoon in dezelfde
// Promise.all als de rest.
export default async function VoortgangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user.id).maybeSingle();
  const clientId = profile?.client_id ?? '';

  const [{ data: fasen }, { data: items }, { data: listings }, { data: todos }, { data: activiteiten }, { data: funnelRows }] =
    await Promise.all([
      supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
      supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt, listing_id'),
      supabase.from('listings').select('id, naam').order('aangemaakt_op'),
      supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt, listing_id'),
      supabase.from('voortgang_activiteitenlog').select('id, datum, omschrijving, listing_id'),
      supabase
        .from('airbnb_funnel_nulmeting')
        .select(
          'listing_id, gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
        ),
    ]);

  const listingsData = (listings ?? []).map((l) => ({ id: l.id, naam: l.naam }));

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));
  const itemsData: ChecklistItem[] = (items ?? []).map((i) => ({
    id: i.id,
    faseNummer: i.fase_nummer as 1 | 2 | 3,
    naam: i.naam,
    afgevinkt: i.afgevinkt,
    listingId: i.listing_id,
  }));
  const todosData: Todo[] = (todos ?? []).map((t) => ({
    id: t.id,
    naam: t.naam,
    deadline: t.deadline,
    afgevinkt: t.afgevinkt,
    listingId: t.listing_id,
  }));
  const activiteitenData: ActiviteitenlogItem[] = (activiteiten ?? []).map((a) => ({
    id: a.id,
    datum: a.datum,
    omschrijving: a.omschrijving,
    listingId: a.listing_id,
  }));
  const funnelPerListing = new Map((funnelRows ?? []).map((f) => [f.listing_id, f]));
  const funnels: FunnelRij[] = listingsData.map((l) => {
    const f = funnelPerListing.get(l.id);
    return {
      listingId: l.id,
      waarden: {
        gemiddeldConversiepercentage: f?.gemiddeld_conversiepercentage ?? null,
        percentageZoekvertoningenEerstePagina: f?.percentage_zoekvertoningen_eerste_pagina ?? null,
        conversieZoekopdrachtNaarAdvertentie: f?.conversie_zoekopdracht_naar_advertentie ?? null,
        conversieAdvertentieNaarBoeking: f?.conversie_advertentie_naar_boeking ?? null,
      },
      nulmetingDatum: f?.nulmeting_datum ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <VoortgangInhoud
        clientId={clientId}
        listings={listingsData}
        fasen={fasenData}
        items={itemsData}
        todos={todosData}
        activiteiten={activiteitenData}
        funnels={funnels}
        isAdmin={false}
      />
    </main>
  );
}
```

- [ ] **Step 3: Verify the build is now fully clean**

Run: `npm run build`
Expected: builds successfully, zero errors. This is the point where Plan A's two deliberately-deferred errors, and every intermediate error introduced across Tasks 1-4 of this plan, are all resolved.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx" "src/app/[locale]/dashboard/voortgang/page.tsx"
git commit -m "feat: Voortgangpagina's (admin + klant) gebruiken VoortgangInhoud met woning-filter"
```

---

### Task 6: Full verification and deploy (both plans together)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass. This plan adds no new automated tests (no component-testing infrastructure), so the count should match wherever the backend plan left it.

If a handful of unrelated tests fail non-deterministically on a full parallel run, re-run the specific failing file(s) in isolation (`npx vitest run tests/integration/<file>.test.ts`) before concluding anything is actually broken — this local Supabase/Docker setup has shown transient connection-contention flakiness under heavy load earlier in this session that isn't a real regression.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors beyond the two pre-existing, unrelated ones (`src/app/auth/confirm/page.tsx`, the gitignored `supabase/.temp/` directory).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully (already confirmed in Task 5, re-confirm here as the final gate).

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`). You'll need at least one test client with 2+ listings to see the filter dropdown (with only 1 listing, the dropdown and woning-pickers correctly stay hidden — verify that too, on a single-listing client, to confirm nothing regressed for the common case).

For a multi-listing client, as admin (`/admin/klanten/[id]/voortgang`):
- Confirm the "Woning" dropdown appears with "Alle woningen" + each listing by name.
- Add a checklist-item and a to-do both as "Algemeen" and tagged to a specific woning; confirm the woning-picker on both add-forms works and only appears because this client has 2+ listings.
- Switch the filter to one woning — confirm the checklist/to-do's/activiteitenlog show only algemene + that woning's items, and the fase-percentages in the balk change to reflect just that subset.
- Switch back to "Alle woningen" — confirm the original, stored fase-percentages return (including any manual override set via the `FaseVoortgangFormulier`, if you set one).
- Confirm each listing gets its own Airbnb-funnel-nulmeting block (visible together under "Alle woningen", one at a time when filtered), and that filling one in via "Opslaan" doesn't affect the other listing's block.
- Edit an existing to-do's woning label via "Bewerken" — confirm it defaults to the todo's current label (not blank) and saving without changing it doesn't clear it.

Then confirm the klant-facing `/dashboard/voortgang` for the same client shows the same filtering/read-only behavior (no add-forms, no fase-override form), for both an admin viewing multiple listings and the klant's own login.

- [ ] **Step 5: Push to `main`**

```bash
git push origin main
```

This pushes every commit from both this plan and the backend plan (`docs/superpowers/plans/2026-08-12-voortgang-per-woning-backend.md`) together — the push was deliberately held until now specifically so Railway's build never sees the intermediate broken state.

- [ ] **Step 6: Give the user the migration SQL for production**

Since there is no production Supabase CLI/credentials access in this environment, paste the full contents of `supabase/migrations/20260812180000_voortgang_per_woning.sql` (from the backend plan) for the user to run manually via the Supabase Dashboard SQL Editor. Remind them this is now safe to run immediately once the Railway deploy from Step 5 finishes — unlike when the backend plan finished on its own, the currently-deploying frontend code now correctly matches the new schema, so there's no window where running the migration would break a still-old frontend.
