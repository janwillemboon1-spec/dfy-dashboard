# Dashboard-thema: near-black dark mode + warm-papier light mode — Design

## Probleem

Het dashboard (zowel admin als klant) gebruikt nu de Boon Vakantieverhuur-huisstijl: lichtblauw
(#eef7fe) in light mode, donkerblauw (#042c53) als achtergrond in dark mode. De klant geeft aan
dat het dashboard van de huisstijl mag afwijken, en wil een "computer nerd"-esthetiek voor dark
mode: een echt zwarte achtergrond i.p.v. donkerblauw.

Via de visual-companion zijn twee richtingen gekozen (mockups met KPI-kaart, tabel, knop en
badge, in `docs/superpowers/specs/` niet opgeslagen maar beoordeeld in de browser-sessie):

- **Dark mode:** near-black achtergrond met het bestaande amber-accent (#ef9f27) behouden, gewoon
  leesbaar (niet-monospace) lettertype — geen felgroene matrix-stijl, geen puur zwart-wit.
- **Light mode:** "warm papier" — een zachte, warme off-white tint (niet het huidige lichtblauw,
  niet koud wit), met een gedimde amber-tint als accent voor voldoende contrast op een lichte
  achtergrond.

Beide modi zijn in een laatste mockup samen bevestigd (kaart + tabel + knop + badge, zie hierboven).

## Doel

Vervang alléén de semantische kleurtokens in `:root` en `.dark` in `src/app/globals.css` door de
onderstaande waarden. Omdat vrijwel alle UI-componenten (`Button`, `Input`, `Dialog`, tabellen,
kaarten) al via deze semantische Tailwind-tokens (`bg-background`, `text-foreground`, `bg-primary`,
`border-border`, enz.) gestyled zijn, is dit een pure tokenvervanging — geen wijziging aan
component-bestanden nodig.

**Buiten scope:** het lettertype (blijft `--font-sans`/Poppins, geen monospace-stijl gekozen), de
losstaande merk-kleurconstantes (`--color-navy`, `--color-amber`, `--color-skyblue`, `--color-red`
in het `@theme inline`-blok) — die worden nergens in de componenten gebruikt (geverifieerd via
grep op `bg-navy`/`text-navy`/etc.), dus blijven ongemoeid staan.

## Ontwerp

### Dark mode — near-black + amber

Vervangt `.dark { ... }` in `src/app/globals.css`:

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

### Light mode — warm papier + amber

Vervangt `:root { ... }` in `src/app/globals.css`:

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

(`--radius` blijft ongewijzigd, hier alleen ter plaatsing genoemd.)

### Waarom amber in beide modi hetzelfde blijft (bijna)

Dark mode gebruikt het bestaande, felle amber (#ef9f27) — leest goed op near-black. Light mode
gebruikt een verzadigder/donkerder amber (#b8720f) voor voldoende contrast op de lichte
achtergrond (#ef9f27 zelf zou op wit te weinig contrast geven voor tekst/knoppen). Dit is dezelfde
aanpak als de huidige huisstijl al hanteert (light mode gebruikt navy als primary, dark mode
amber) — hier blijft het één doorlopende accentfamilie (amber), alleen qua verzadiging aangepast
per achtergrond.

## Testen

Geen geautomatiseerde tests van toepassing (pure CSS-tokenwijziging, geen logica). Handmatige
verificatie: dev-server starten, dashboard openen en via de bestaande `theme-toggle`-component
(`src/components/theme-toggle.tsx`, `next-themes` via `src/components/theme-provider.tsx`)
wisselen tussen light en dark mode, en controleren dat kaarten, tabellen, knoppen en badges
leesbaar en met voldoende contrast ogen — met name de amber-tekst op de KPI-kaarten en de
"leeg"-badge (destructive-rood) in beide modi.
