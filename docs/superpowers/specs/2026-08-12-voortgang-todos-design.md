# Klantportaal — Voortgang: to-do's voor de klant (deelproject 4/7) — Design

## Context

Vervolg op deelproject 3 (checklist per fase). De Voortgang-pagina krijgt een to-do-sectie:
taken die de admin voor de klant aanmaakt (naam + deadline), met een automatische
e-mailnotificatie naar de klant. Anders dan de checklist (alleen de admin vinkt af) kan de
klant een to-do zelf afvinken — en de admin kan, net als bij de checklist, ook zelf afvinken,
bewerken en verwijderen.

## Ontwerp

### 1. Datamodel

Nieuwe migratie, nieuwe tabel `voortgang_todos`:

```sql
create table voortgang_todos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  naam text not null,
  deadline date not null,
  afgevinkt boolean not null default false,
  toegevoegd_door uuid references profiles(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index voortgang_todos_client_id_idx on voortgang_todos(client_id);

grant select, insert, update, delete on voortgang_todos to anon, authenticated, service_role;

alter table voortgang_todos enable row level security;

create policy "admin volledige toegang voortgang_todos" on voortgang_todos
  for all using (is_admin()) with check (is_admin());
create policy "klant leest eigen voortgang_todos" on voortgang_todos
  for select using (client_id = current_client_id());
create policy "klant vinkt eigen voortgang_todos af" on voortgang_todos
  for update using (client_id = current_client_id()) with check (client_id = current_client_id());
```

Dit is de eerste tabel in het voortgang-systeem waar de klant zelf mag schrijven (`afgevinkt`).
RLS staat op rij-niveau (de klant mag de héle rij updaten, niet kolom-afgedwongen tot alleen
`afgevinkt`) — net als de rest van deze app vertrouwt de bescherming tegen het wijzigen van
`naam`/`deadline` door de klant op de server-actie (die alleen `afgevinkt` in de update-payload
zet), niet op een database-trigger. Consistent met hoe de rest van de codebase dit al aanpakt.

### 2. Server-acties

Vier nieuwe functies in `src/app/[locale]/admin/klanten/[id]/actions.ts`:

- **`voegTodoToe({clientId, naam, deadline})`** — admin-only. Valideert naam/deadline niet
  leeg, insert de rij, haalt daarna de klant-naam/e-mail op en verstuurt de notificatiemail.
  Als de e-mail faalt: de to-do blijft gewoon bestaan (al opgeslagen vóór de mail-poging), de
  actie gooit alsnog een foutmelding zodat de admin het merkt ("To-do toegevoegd, maar
  notificatie kon niet worden verstuurd: ..."). Dit is bewust anders dan de bestaande
  welkomstmail-flow (die bij een mislukte mail de hele klant-aanmaak terugdraait) — daar is de
  e-mail de enige manier voor de klant om ooit in te loggen, hier is de to-do zelf al
  waardevol ook zonder geslaagde notificatie.
- **`vinkTodoAf({clientId, todoId, afgevinkt})`** — **geen** `assertIsAdmin()`. Werkt voor
  beide rollen: de RLS-policies zorgen dat een klant-sessie alleen bij eigen to-do's kan,
  een admin-sessie bij alle. Update uitsluitend het veld `afgevinkt`.
- **`wijzigTodo({clientId, todoId, naam, deadline})`** — admin-only, past naam/deadline aan.
- **`verwijderTodo({clientId, todoId})`** — admin-only.

Alle vier revalideren `/admin/klanten/${clientId}/voortgang`. Geen aparte revalidatie van
`/dashboard/voortgang` nodig — Server Actions verversen de pagina van de aanroeper al
automatisch, en die klantpagina gebruikt sowieso geen statische cache.

### 3. Notificatiemail

Nieuwe bestanden, zelfde patroon als de bestaande welkomstmail:

- `src/lib/email/templates/todo-notificatie.ts` — `todoNotificatieHtml({ naam, taakNaam,
  deadlineLabel, link })`, zelfde visuele stijl (Poppins/Playfair, navy/amber) als
  `welkomstmail.ts`.
- `src/lib/email/send-todo-notificatie.ts` — `sendTodoNotificatie({ klantNaam, klantEmail,
  taakNaam, deadline })`, verstuurt via Resend (`RESEND_API_KEY`/`RESEND_FROM_EMAIL`), link
  naar `${NEXT_PUBLIC_BASE_URL}/dashboard/voortgang`. Onderwerp: "Nieuwe taak: {taakNaam}".
  Inhoud: taaknaam + deadline (Nederlands datumformaat, bv. "12 augustus 2026") + knop naar
  Voortgang.

### 4. Snelkeuzelijst

Nieuwe constante `STANDAARD_TODO_NAMEN` in `src/lib/constants/todos.ts`:

```ts
export const STANDAARD_TODO_NAMEN = [
  "Nieuwe foto's laten maken",
  'Voorzieningenlijst controleren',
  'Minimumprijs berekenen',
] as const;
```

Gebruikt als `<datalist>`-suggesties bij het naam-veld van het toevoeg-formulier — de admin kan
een suggestie kiezen of zelf iets anders typen.

### 5. UI

Nieuwe sectie "To-do's" op de Voortgang-pagina, onder de checklist-sectie. Nieuwe gedeelde
component `src/components/portal/todo-rij.tsx`: checkbox is **altijd** klikbaar (roept
`vinkTodoAf` aan, ongeacht rol — RLS bepaalt of het mag), toont naam + deadline. Bij
`isAdmin=true` komen er twee extra knoppen bij: "Bewerken" (klapt naam+datum-invoervelden open,
zelfde interactiepatroon als `CorrectieRij` in `NulmetingTabel`) en "Verwijderen" (roept
`verwijderTodo` aan, met een `window.confirm`-bevestiging — zelfde patroon als
`KlantVerwijderenDialoog`/andere destructieve acties in deze admin-UI).

Nieuwe component `src/components/portal/voortgangs-todos.tsx` (server-component, lijst van
`TodoRij`, gesorteerd op deadline oplopend).

Admin krijgt daaronder een toevoeg-formulier (nieuwe component
`src/components/admin/todo-toevoegen-formulier.tsx`): naam-veld met `<datalist>`-suggesties uit
`STANDAARD_TODO_NAMEN` + datumveld (`type="date"`) + "+"-knop, roept `voegTodoToe` aan.

## Testen

- Integratietest voor `voegTodoToe`: weigert niet-admin, weigert lege naam/deadline, en (met
  een gemockte `sendTodoNotificatie` — net als `fetchReservationData` in eerdere
  integratietests wordt gemockt) bevestigt dat de e-mailfunctie met de juiste argumenten wordt
  aangeroepen.
- Integratietest voor `vinkTodoAf`: bevestigt dat zowel een admin- als een klant-sessie een
  eigen/klant-behorende to-do mag afvinken, en dat een klant-sessie een to-do van een **andere**
  klant niet kan afvinken (RLS-grens).
- Integratietest voor `wijzigTodo`/`verwijderTodo`: weigeren niet-admin; passen resp.
  naam/deadline aan en verwijderen de rij.
- Handmatige verificatie: als admin een to-do toevoegen en controleren dat de klant een e-mail
  ontvangt (of, lokaal, dat Resend-aanroep in de logs verschijnt); als klant een to-do afvinken
  en zien dat de status meteen klopt; als admin een to-do bewerken en verwijderen.
