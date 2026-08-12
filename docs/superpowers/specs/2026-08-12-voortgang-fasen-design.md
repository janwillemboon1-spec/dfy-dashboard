# Klantportaal — Voortgang: fasen & voortgangsbalk (deelproject 2/7) — Design

## Context

Vervolg op deelproject 1 (portaalschil). De Voortgang-pagina (klant en admin, nu een
placeholder) krijgt zijn eerste echte inhoud: een voortgangsbalk die 3 vaste fasen toont —
**Fase 1: Onboarding**, **Fase 2: Marktanalyse & concurrentieanalyse**,
**Fase 3: Optimalisaties APH** — elk met een eigen percentage.

**Belangrijke koerswijziging tijdens het ontwerp**: het oorspronkelijke idee (één "huidige
fase" die bij 100% automatisch doorschakelt naar de volgende) is losgelaten. Fases kunnen
gelijktijdig lopen — bijvoorbeeld marktanalyse-werk dat al begint terwijl onboarding nog niet
volledig is afgerond. Elke fase heeft daarom een **volledig onafhankelijk** percentage; er is
geen gekoppelde "actieve fase" en geen automatisch doorschakelen.

Percentages worden in dit deelproject **handmatig door de admin ingesteld**. Deelproject 3
(checklist per fase) vervangt deze handmatige bron later door een automatische berekening op
basis van afgevinkte checklist-items — de opslag (percentage per fase) en de UI (segmentenbalk)
blijven daarbij intact, alleen de manier waarop het percentage tot stand komt verandert.

## Ontwerp

### 1. Datamodel

Nieuwe migratie, nieuwe tabel `voortgang_fasen`:

```sql
create table voortgang_fasen (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  fase_nummer int not null check (fase_nummer between 1 and 3),
  percentage int not null default 0 check (percentage between 0 and 100),
  bijgewerkt_op timestamptz not null default now(),
  unique (client_id, fase_nummer)
);

create index voortgang_fasen_client_id_idx on voortgang_fasen(client_id);

grant select, insert, update, delete on voortgang_fasen to anon, authenticated, service_role;

alter table voortgang_fasen enable row level security;

create policy "admin volledige toegang voortgang_fasen" on voortgang_fasen
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_fasen" on voortgang_fasen
  for select using (client_id = current_client_id());
```

Er hoeft geen rij te bestaan voor een fase totdat de admin er voor het eerst een percentage
voor instelt — een ontbrekende rij betekent 0%. `client_id references clients(id) on delete
cascade` zorgt dat rijen automatisch verdwijnen als de klant wordt verwijderd (zelfde patroon
als `nulmeting.listing_id` — geen wijziging aan `delete_client_cascade` nodig).

### 2. Server-actie

Nieuwe functie `werkFaseVoortgangBij` in `src/app/[locale]/admin/klanten/[id]/actions.ts`:

```ts
export async function werkFaseVoortgangBij(input: {
  clientId: string;
  faseNummer: 1 | 2 | 3;
  percentage: number;
}) {
  await assertIsAdmin();
  if (input.percentage < 0 || input.percentage > 100 || !Number.isInteger(input.percentage)) {
    throw new Error('Percentage moet een geheel getal tussen 0 en 100 zijn.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('voortgang_fasen')
    .upsert(
      { client_id: input.clientId, fase_nummer: input.faseNummer, percentage: input.percentage },
      { onConflict: 'client_id,fase_nummer' }
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

Geen automatisch-doorschakel-logica — gewoon een directe upsert van het percentage voor de
gekozen fase. Elke fase is en blijft onafhankelijk instelbaar, ook omlaag (bv. een typefout
corrigeren).

### 3. Gedeelde `VoortgangsBalk`-component

Nieuwe component `src/components/portal/voortgangs-balk.tsx` (server-component, geen
interactiviteit nodig — puur weergave), gebaseerd op de gekozen mockup-optie: drie gelijk
gestylede segmenten naast elkaar, elk gevuld naar het eigen percentage, met daaronder per
segment de faseNaam en status (`✓ Afgerond` bij 100%, anders `{percentage}%`, of
`Nog niet gestart` bij 0%). Geen enkel segment krijgt extra visuele nadruk als "de actieve
fase" — alle drie gelijk behandeld.

```tsx
const FASE_NAMEN = ['Onboarding', 'Marktanalyse & concurrentieanalyse', 'Optimalisaties APH'] as const;

export interface FaseVoortgang {
  faseNummer: 1 | 2 | 3;
  percentage: number;
}

export function VoortgangsBalk({ fasen }: { fasen: FaseVoortgang[] }) {
  const percentagePerFase = new Map(fasen.map((f) => [f.faseNummer, f.percentage]));
  /* rendert 3 segmenten (bg-muted met een bg-primary-vulling naar percentage), met
     FASE_NAMEN[i] + statustekst eronder. Zie mockup-optie A uit de visual-companion-sessie
     voor de exacte lay-out (drie even brede segmenten, kleine tikjes/gap ertussen). */
}
```

Speciale eindtekst: als fase 3 specifiek 100% heeft (ongeacht de andere twee fases), toont de
component eronder: *"Fase 3 is volledig doorlopen — toekomstige optimalisaties zijn te volgen
in het activiteitenlog."* (het activiteitenlog zelf komt pas in deelproject 5; deze tekst
alvast opnemen is geen probleem, hij verwijst niet naar een link die nu al moet werken).

### 4. Admin-bewerkformulier

Nieuwe client-component `src/components/admin/fase-voortgang-formulier.tsx`: select
(Fase 1/2/3) + number-input (0-100) + "Bijwerken"-knop, roept `werkFaseVoortgangBij` aan.
Alleen zichtbaar op de admin-Voortgangpagina, niet bij de klant.

### 5. Wiring in de bestaande placeholder-pagina's

- `src/app/[locale]/dashboard/voortgang/page.tsx` (klant): haalt de eigen
  `voortgang_fasen`-rijen op (RLS scoped) en rendert `<VoortgangsBalk>`, alleen-lezen.
- `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx` (admin): haalt de
  `voortgang_fasen`-rijen van de gekozen klant op, rendert `<VoortgangsBalk>` +
  `<FaseVoortgangFormulier>` eronder.

## Testen

- `tests/unit/` — geen nieuwe pure-logica-functies (de server-actie is dun: validatie +
  upsert, geen berekening om apart te unit-testen); wel een lichte unit-test voor eventuele
  hulpfunctie die percentage → statuslabel (`Afgerond`/`Nog niet gestart`/`X%`) omzet, als die
  als losse functie wordt geëxtraheerd tijdens implementatie.
- Integratietest voor `werkFaseVoortgangBij`: weigert niet-admin, weigert percentage buiten
  0-100, upsert't correct (nieuwe rij + bijwerken bestaande rij), en bevestigt dat twee fases
  onafhankelijk van elkaar een percentage kunnen hebben (fase 1 op 40% zetten beïnvloedt fase
  2's rij niet).
- Handmatige verificatie: admin zet fase 2 op 100% terwijl fase 1 op 40% staat — beide blijven
  correct los van elkaar zichtbaar, geen automatische verschuiving. Fase 3 op 100% zetten toont
  de speciale eindtekst.
