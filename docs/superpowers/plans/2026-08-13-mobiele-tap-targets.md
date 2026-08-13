# Mobiele tap-targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the minimum tap-target height across the whole app to 36px (matching the size already used for the mobile-nav hamburger/close buttons), and make the klant-portal to-do checkbox's whole label tappable, not just the ~15px native box — deelproject 3/3 of the mobile-compatibility audit.

**Architecture:** A single CSS-only change to the shared `Button` component's size scale (`src/components/ui/button.tsx`) — every existing `size="sm"` call site across the app automatically inherits the new height with zero per-call-site changes, since only the CSS behind that size key changes, not the key itself. Two now-redundant icon size keys (`icon-lg` and, after code review, `icon-sm` too — both now visually indistinguishable from the new `icon` default) get their 3 call sites repointed in the same task to keep the build green. A separate, unrelated fix wraps one under-labeled checkbox in a `<label>`.

**Tech Stack:** Tailwind CSS utility classes only (via `class-variance-authority`'s `cva`). No new dependencies, no test infrastructure changes.

**Reference:** Spec at `docs/superpowers/specs/2026-08-13-mobiele-tap-targets-design.md`. No DB/backend changes — pure frontend. Final sub-project of the mobile-compatibility audit; deelproject 1/3 (`docs/superpowers/plans/2026-08-13-mobiele-navigatie.md`) and 2/3 (`docs/superpowers/plans/2026-08-13-mobiele-formulieren-tabellen.md`) are already shipped.

---

### Task 1: Raise the `Button` size scale to a 36px floor

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/portal/portaal-sidebar.tsx`
- Modify: `src/components/ui/dialog.tsx`

These three files must change together: removing the `icon-lg`/`icon-sm` size keys from `button.tsx` without updating their call sites in `portaal-sidebar.tsx`/`dialog.tsx` would leave those `size="icon-lg"`/`size="icon-sm"` usages referencing sizes that no longer exist, which TypeScript would reject — breaking the build.

- [ ] **Step 1: Update `button.tsx`'s size scale**

In `src/components/ui/button.tsx`, change:

```typescript
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
```

to:

```typescript
      size: {
        default:
          "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-9 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-9",
      },
```

Note what this does and doesn't do:
- `default`'s height goes from `h-8` (32px) to `h-9` (36px); `icon`'s size goes from `size-8` to `size-9`. Every `<Button>` call site in the app that doesn't pass an explicit `size` prop already uses `default` (the component's own `defaultVariants`), so those automatically become 36px too.
- `sm` keeps its exact same other classes (padding, gap, text size, border radius) — only its height changes from `h-7` to `h-9`. Every existing `size="sm"` call site in the app (33, found via `grep -rn 'size="sm"' src/`) inherits the new height automatically — **none of those call sites need to change**.
- `xs`, `lg`, and `icon-xs` are removed entirely: `grep -rn 'size="xs"\|size="lg"\|size="icon-xs"' src/` finds zero matches anywhere in the codebase, so removing them is safe (dead code), and keeping a smaller-than-the-new-floor option around would undermine the point of this change for any future use.
- `icon-lg` is removed because it's now numerically identical to the new `icon` (`size-9` either way). `icon-sm` is removed for the same reason: once both are `size-9`, the only remaining difference (an 8px vs. 10px border-radius on an otherwise identical 36×36 square) isn't a meaningful distinction — see Step 2 for both size keys' call sites.

- [ ] **Step 2: Repoint the 3 now-removed icon-size usages to `icon`**

In `src/components/portal/portaal-sidebar.tsx`, change:

```tsx
          <DialogPrimitive.Trigger render={<Button variant="ghost" size="icon-lg" />}>
```

to:

```tsx
          <DialogPrimitive.Trigger render={<Button variant="ghost" size="icon" />}>
```

and change:

```tsx
                <DialogPrimitive.Close render={<Button variant="ghost" size="icon-lg" />}>
```

to:

```tsx
                <DialogPrimitive.Close render={<Button variant="ghost" size="icon" />}>
```

In `src/components/ui/dialog.tsx`, change:

```tsx
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
```

to:

```tsx
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon"
              />
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors. If `icon-lg` or `icon-sm` were left referenced anywhere, this step would fail with a TypeScript error on the `size` prop — a clean build here confirms Step 2 caught every usage.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/button.tsx src/components/portal/portaal-sidebar.tsx src/components/ui/dialog.tsx
git commit -m "fix: knoppen krijgen een minimale hoogte van 36px voor betere tapbaarheid"
```

---

### Task 2: Make the klant to-do checkbox's whole label tappable

**Files:**
- Modify: `src/components/portal/todo-rij.tsx`

`src/components/portal/checklist-item-rij.tsx` already wraps its checkbox in a `<label>` together with the item's name — the whole row is already tappable there, not just the ~15px native checkbox. `todo-rij.tsx`'s `TodoRij` (the non-editing display row — `TodoBewerkRij`, the edit row, has no checkbox) has the same kind of checkbox but without that `<label>` wrapping, so only the tiny native box itself responds to a tap.

- [ ] **Step 1: Wrap the checkbox and name in a `<label>`**

In `src/components/portal/todo-rij.tsx`, inside `TodoRij`, change:

```tsx
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
```

to:

```tsx
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={todo.afgevinkt}
          disabled={isPending}
          onChange={toggleAfvinken}
          className="accent-green-600"
        />
        <span className={todo.afgevinkt ? 'line-through text-muted-foreground' : ''}>{todo.naam}</span>
      </label>
      <span className="text-xs text-muted-foreground">— {formatteerDeadline(todo.deadline)}</span>
```

The deadline text, admin action buttons, and error message stay outside the `<label>`, exactly as before — only the checkbox and the task name become one combined tap target, matching what `checklist-item-rij.tsx` already does. `toggleAfvinken` and every other piece of logic in this file is untouched.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully, zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/todo-rij.tsx
git commit -m "fix: hele naam van een to-do is nu aantikbaar om af te vinken, niet alleen het vinkje"
```

---

### Task 3: Full verification and push

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --fileParallelism=false`
Expected: all tests pass. This plan adds no new automated tests (no component-testing infrastructure — same as deelproject 1/3 and 2/3) — the count should be unchanged from before this plan.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors. The two pre-existing, unrelated issues (`src/app/auth/confirm/page.tsx`, the gitignored `supabase/.temp/` directory) are expected and fine.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully (already confirmed in Tasks 1-2, re-confirm here as the final gate).

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and check, at both a narrow (phone-width) and normal desktop viewport:

- **Buttons generally:** across admin (klantenlijst, klant-detail tabs, nulmeting-correctierij, actielog) and klant (Voortgang checklist/to-do's, Cijfers, Instellingen) pages, buttons are visibly taller/easier to tap than before this plan — including inside dense tables.
- **Mobile nav (deelproject 1):** the hamburger and close buttons on `/dashboard/*` and `/admin/klanten/[id]/*` look and behave exactly as they did before this plan — they were already 36px (`icon-lg`), now they're just using the renamed `icon` size instead, so there should be zero visible difference.
- **To-do checkbox:** on a klant (or admin viewing a klant) Voortgang page, tapping/clicking anywhere on a to-do's name text toggles it, not just the small checkbox itself.
- **Checklist checkbox (regression check):** confirm this still works exactly as before — it already had the `<label>` wrapping, untouched by this plan.

- [ ] **Step 5: Push**

```bash
git push origin main
```

No manual production-database migration is needed for this plan (no schema changes). This is also the final sub-project of the mobile-compatibility audit — after this push, all 3 deelprojecten (navigatie, formulieren/tabellen, tap-targets) are complete.
