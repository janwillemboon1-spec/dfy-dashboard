# Mobiele navigatie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `PortaalSidebar` (used on both the klant portal and the admin klant-detail pages) mobile-friendly: a hamburger-triggered slide-in drawer below 768px, the exact current always-visible sidebar at 768px and up.

**Architecture:** `PortaalSidebar` becomes self-contained and responsive — it renders both the existing desktop `<nav>` (hidden below `md:`) and a new mobile top bar + drawer (hidden at `md:` and up) from the same component, reusing the Base UI Dialog primitive already used by `src/components/ui/dialog.tsx` (styled as a left-anchored panel instead of a centered modal). The two call sites (`dashboard/layout.tsx`, `admin/klanten/[id]/layout.tsx`) need only a one-line wrapper-class change each.

**Tech Stack:** Next.js App Router, Tailwind CSS (`tw-animate-css` for the slide animation), `@base-ui/react/dialog` (already a dependency), `lucide-react` icons.

**Reference:** Spec at `docs/superpowers/specs/2026-08-13-mobiele-navigatie-design.md`. No DB/backend changes — pure frontend.

---

### Task 1: Make `PortaalSidebar` responsive (desktop nav + mobile drawer)

**Files:**
- Modify: `src/components/portal/portaal-sidebar.tsx`

The component's exported props (`titel`, `subtitel`, `items`, `terug`) stay exactly the same, so both existing call sites remain valid without any change in this task — the build stays green throughout.

- [ ] **Step 1: Replace the full contents of the file**

Replace the full contents of `src/components/portal/portaal-sidebar.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { MenuIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PortaalMenuItem {
  label: string;
  href: string;
}

// Gedeeld tussen de desktop-nav en het mobiele uitschuifpaneel hieronder, zodat de
// item-lijst (incl. "actief"-markering) maar op één plek onderhouden hoeft te worden.
// onItemClick is alleen nodig in het mobiele paneel, om het paneel te sluiten zodra een
// item aangetikt wordt — op desktop is er niets om te sluiten.
function NavItems({
  items,
  pathname,
  onItemClick,
}: {
  items: PortaalMenuItem[];
  pathname: string | null;
  onItemClick?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        // startsWith i.p.v. alleen ===: een geneste route binnen een sectie (bv. later
        // /dashboard/voortgang/iets) moet die sectie ook als actief markeren.
        const actief = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onItemClick}
              className={cn(
                'block rounded-md px-3 py-2 text-sm',
                actief
                  ? 'bg-secondary text-secondary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function PortaalSidebar({
  titel,
  subtitel,
  items,
  terug,
}: {
  titel: string;
  subtitel?: string;
  items: PortaalMenuItem[];
  terug?: { label: string; href: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop (>=768px): bestaande, altijd-zichtbare sidebar, ongewijzigd qua uiterlijk. */}
      <nav className="hidden md:block w-56 shrink-0 border-r border-border p-4 space-y-6">
        <div>
          {terug && (
            <Link
              href={terug.href}
              className="mb-2 inline-block text-xs text-muted-foreground hover:underline"
            >
              ← {terug.label}
            </Link>
          )}
          <p className="font-serif text-lg">{titel}</p>
          {subtitel && <p className="text-xs text-muted-foreground">{subtitel}</p>}
        </div>
        <NavItems items={items} pathname={pathname} />
      </nav>

      {/* Mobiel (<768px): smalle bovenbalk met hamburger die de nav als uitschuifpaneel
          opent. De Dialog-Root is gecontroleerd (open/onOpenChange) i.p.v. oncontrolled,
          zodat een klik op een nav-item het paneel ook programmatisch kan sluiten
          (Link's eigen navigatie sluit de Dialog niet vanzelf). */}
      <div className="md:hidden flex items-center gap-2 border-b border-border px-4 py-3">
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger render={<Button variant="ghost" size="icon-lg" />}>
            <MenuIcon />
            <span className="sr-only">Menu openen</span>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
            <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-border bg-background p-4 outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {terug && (
                    <Link
                      href={terug.href}
                      onClick={() => setOpen(false)}
                      className="mb-2 inline-block text-xs text-muted-foreground hover:underline"
                    >
                      ← {terug.label}
                    </Link>
                  )}
                  <DialogPrimitive.Title render={<p className="font-serif text-lg" />}>
                    {titel}
                  </DialogPrimitive.Title>
                  {subtitel && <p className="text-xs text-muted-foreground">{subtitel}</p>}
                </div>
                <DialogPrimitive.Close render={<Button variant="ghost" size="icon-lg" />}>
                  <XIcon />
                  <span className="sr-only">Menu sluiten</span>
                </DialogPrimitive.Close>
              </div>
              <NavItems items={items} pathname={pathname} onItemClick={() => setOpen(false)} />
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <p className="font-serif text-lg">{titel}</p>
      </div>
    </>
  );
}
```

Note on the top-level `<>` fragment: this matters for Task 2. Both call sites wrap `PortaalSidebar` in a `<div className="flex">` alongside a content `<div>`. Because a Fragment doesn't add a wrapping DOM node, the desktop `<nav>` and the mobile top-bar `<div>` both become **direct children** of that wrapping flex div — exactly like `PortaalSidebar` used to be a single direct child. `hidden md:block` / `md:hidden` then correctly show only one of the two at a time.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors. Both existing call sites (`dashboard/layout.tsx`, `admin/klanten/[id]/layout.tsx`) still pass the same props (`titel`, `subtitel`, `items`, `terug`), so nothing else needs to change for the build to stay green.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/portaal-sidebar.tsx
git commit -m "feat: PortaalSidebar krijgt een responsive hamburger-menu onder 768px"
```

---

### Task 2: Stack the mobile top bar above the content on both call sites

**Files:**
- Modify: `src/app/[locale]/dashboard/layout.tsx`
- Modify: `src/app/[locale]/admin/klanten/[id]/layout.tsx`

Both files wrap `<PortaalSidebar />` and the content `<div>` in a `<div className="flex">` — a plain horizontal row. On desktop that's still correct (nav beside content). On mobile, the visible piece of `PortaalSidebar` is now the top bar (not the nav), and a plain horizontal `flex` would put that top bar *beside* the content instead of *above* it. Both files need the identical one-line fix: stack vertically below `md:`, row-layout at `md:` and up.

- [ ] **Step 1: Update the klant portal layout**

In `src/app/[locale]/dashboard/layout.tsx`, change:

```tsx
      <div className="flex">
        <PortaalSidebar
```

to:

```tsx
      <div className="flex flex-col md:flex-row">
        <PortaalSidebar
```

- [ ] **Step 2: Update the admin klant-detail layout**

In `src/app/[locale]/admin/klanten/[id]/layout.tsx`, change:

```tsx
    <div className="flex">
      <PortaalSidebar
```

to:

```tsx
    <div className="flex flex-col md:flex-row">
      <PortaalSidebar
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/layout.tsx" "src/app/[locale]/admin/klanten/[id]/layout.tsx"
git commit -m "feat: mobiele bovenbalk stapelt boven de content i.p.v. ernaast"
```

---

### Task 3: Full verification and push

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --fileParallelism=false`
Expected: all tests pass. This plan adds no new automated tests (no component-testing infrastructure in this project, confirmed by earlier sub-projects in this same codebase) — the count should be unchanged from before this plan.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors. The two pre-existing, unrelated issues (`src/app/auth/confirm/page.tsx`, the gitignored `supabase/.temp/` directory) are expected and fine.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully (already confirmed in Tasks 1-2, re-confirm here as the final gate).

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and check both the klant portal (`/dashboard/voortgang` or any klant-portal page, logged in as a klant) and an admin klant-detail page (`/admin/klanten/[id]/voortgang`, logged in as admin), at two viewport widths:

- **Narrow (< 768px, e.g. resize the browser window or use dev-tools device emulation to ~375px):**
  - The full sidebar is gone; instead there's a slim top bar with a hamburger icon and the title.
  - Tapping the hamburger opens a left-anchored panel sliding in over the content, with a dimmed backdrop behind it.
  - The panel shows the same "Terug"-link (on the admin klant-detail page only), title/subtitle, and nav items as the desktop sidebar normally does.
  - Tapping a nav item navigates to that page **and** closes the panel.
  - The panel also closes via: tapping the backdrop, pressing Escape, and tapping the explicit close (X) button.
- **Wide (≥ 768px, e.g. resize back to a normal desktop width):**
  - The mobile top bar and hamburger are gone; the exact original always-visible sidebar is back, unchanged from before this plan (same width, same "Terug" link, same active-item highlighting).

- [ ] **Step 5: Push**

```bash
git push origin main
```

No manual production-database migration is needed for this plan (no schema changes).
