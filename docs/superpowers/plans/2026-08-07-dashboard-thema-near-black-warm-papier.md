# Dashboard-thema: near-black + warm-papier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de huisstijl-kleurtokens in het dashboard door near-black + amber (dark mode) en warm-papier + amber (light mode).

**Architecture:** Pure vervanging van de semantische kleurtokens in `:root` en `.dark` in `src/app/globals.css`. Alle UI-componenten gebruiken al deze semantische tokens (`bg-background`, `bg-primary`, enz.), dus dit raakt geen component-bestanden.

**Tech Stack:** Tailwind CSS v4 (`@theme`), CSS custom properties.

**Referentie-spec:** `docs/superpowers/specs/2026-08-07-dashboard-thema-near-black-warm-papier-design.md`

---

### Task 1: Kleurtokens vervangen

**Files:**
- Modify: `src/app/globals.css:63-136`

- [ ] **Step 1: Vervang `:root` (light mode)**

Vervang:

```css
:root {
  --background: #eef7fe;
  --foreground: #042c53;
  --card: #ffffff;
  --card-foreground: #042c53;
  --popover: #ffffff;
  --popover-foreground: #042c53;
  --primary: #042c53;
  --primary-foreground: #ffffff;
  --secondary: #dcebfa;
  --secondary-foreground: #042c53;
  --muted: #e4f0fb;
  --muted-foreground: #45607a;
  --accent: #ef9f27;
  --accent-foreground: #042c53;
  --destructive: #e24b4a;
  --destructive-foreground: #ffffff;
  --border: #d7e6f5;
  --input: #d7e6f5;
  --ring: #85b7eb;
  --chart-1: #042c53;
  --chart-2: #ef9f27;
  --chart-3: #85b7eb;
  --chart-4: #e24b4a;
  --chart-5: #7c93ac;
  --radius: 0.625rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #042c53;
  --sidebar-primary: #042c53;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #ef9f27;
  --sidebar-accent-foreground: #042c53;
  --sidebar-border: #d7e6f5;
  --sidebar-ring: #85b7eb;
}
```

door:

```css
:root {
  --background: #faf8f5;
  --foreground: #2b2820;
  --card: #ffffff;
  --card-foreground: #2b2820;
  --popover: #ffffff;
  --popover-foreground: #2b2820;
  --primary: #b8720f;
  --primary-foreground: #ffffff;
  --secondary: #f0ebe1;
  --secondary-foreground: #2b2820;
  --muted: #f0ebe1;
  --muted-foreground: #7a7266;
  --accent: #b8720f;
  --accent-foreground: #ffffff;
  --destructive: #e24b4a;
  --destructive-foreground: #ffffff;
  --border: #e8e2d8;
  --input: #e8e2d8;
  --ring: #b8720f;
  --chart-1: #b8720f;
  --chart-2: #3a6ea5;
  --chart-3: #4a7a5a;
  --chart-4: #e24b4a;
  --chart-5: #9a9184;
  --radius: 0.625rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #2b2820;
  --sidebar-primary: #b8720f;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f0ebe1;
  --sidebar-accent-foreground: #2b2820;
  --sidebar-border: #e8e2d8;
  --sidebar-ring: #b8720f;
}
```

- [ ] **Step 2: Vervang `.dark` (dark mode)**

Vervang:

```css
.dark {
  --background: #042c53;
  --foreground: #eaf2fb;
  --card: #0a3a66;
  --card-foreground: #eaf2fb;
  --popover: #0a3a66;
  --popover-foreground: #eaf2fb;
  --primary: #ef9f27;
  --primary-foreground: #042c53;
  --secondary: #0a3a66;
  --secondary-foreground: #eaf2fb;
  --muted: #063458;
  --muted-foreground: #a9c9ea;
  --accent: #85b7eb;
  --accent-foreground: #042c53;
  --destructive: #e24b4a;
  --destructive-foreground: #ffffff;
  --border: oklch(0.75 0.06 235 / 15%);
  --input: oklch(0.75 0.06 235 / 20%);
  --ring: #ef9f27;
  --chart-1: #1e5a8c;
  --chart-2: #ef9f27;
  --chart-3: #85b7eb;
  --chart-4: #e24b4a;
  --chart-5: #c7d6e8;
  --sidebar: #0a3a66;
  --sidebar-foreground: #eaf2fb;
  --sidebar-primary: #ef9f27;
  --sidebar-primary-foreground: #042c53;
  --sidebar-accent: #85b7eb;
  --sidebar-accent-foreground: #042c53;
  --sidebar-border: oklch(0.75 0.06 235 / 15%);
  --sidebar-ring: #ef9f27;
}
```

door:

```css
.dark {
  --background: #0a0a0a;
  --foreground: #e8e8e8;
  --card: #171717;
  --card-foreground: #e8e8e8;
  --popover: #171717;
  --popover-foreground: #e8e8e8;
  --primary: #ef9f27;
  --primary-foreground: #0a0a0a;
  --secondary: #171717;
  --secondary-foreground: #e8e8e8;
  --muted: #141414;
  --muted-foreground: #8a8a8a;
  --accent: #ef9f27;
  --accent-foreground: #0a0a0a;
  --destructive: #e24b4a;
  --destructive-foreground: #ffffff;
  --border: #2a2a2a;
  --input: #2a2a2a;
  --ring: #ef9f27;
  --chart-1: #ef9f27;
  --chart-2: #58a6ff;
  --chart-3: #3fb950;
  --chart-4: #e24b4a;
  --chart-5: #8a8a8a;
  --sidebar: #171717;
  --sidebar-foreground: #e8e8e8;
  --sidebar-primary: #ef9f27;
  --sidebar-primary-foreground: #0a0a0a;
  --sidebar-accent: #2a2a2a;
  --sidebar-accent-foreground: #e8e8e8;
  --sidebar-border: #2a2a2a;
  --sidebar-ring: #ef9f27;
}
```

- [ ] **Step 3: Handmatig verifiëren**

Run: `npm run dev`
Open het dashboard, gebruik de `theme-toggle`-component om tussen light en dark te wisselen.
Expected: light mode toont een warme off-white achtergrond met donkerbruine tekst en amber
knoppen/accenten; dark mode toont een near-black achtergrond met lichtgrijze tekst en amber
knoppen/accenten. Kaarten, tabellen, randen en de "leeg"/destructive-badges zijn in beide
modi goed leesbaar.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: dashboardthema naar near-black (dark) en warm papier (light), amber als accent"
```
