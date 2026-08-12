# Klantportaal — Voortgang: to-do's voor de klant (deelproject 4/7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De Voortgang-pagina krijgt een to-do-sectie: de admin voegt taken toe (naam + deadline) met een automatische e-mailnotificatie naar de klant; klant én admin kunnen afvinken, en de admin kan bovendien bewerken en verwijderen.

**Architecture:** Nieuwe tabel `voortgang_todos` met een klant-schrijfbare RLS-policy voor `afgevinkt` (de eerste in dit systeem). Vier server-acties (toevoegen/afvinken/wijzigen/verwijderen), een nieuwe notificatiemail via Resend (zelfde patroon als de bestaande welkomstmail), en gedeelde UI-componenten die per rol andere knoppen tonen.

**Tech Stack:** Supabase (Postgres/RLS), Next.js Server Components + Server Actions, Resend, Vitest.

**Referentie-spec:** `docs/superpowers/specs/2026-08-12-voortgang-todos-design.md`

---

### Task 1: Migratie — `voortgang_todos`-tabel

**Files:**
- Create: `supabase/migrations/20260812140000_voortgang_todos.sql`

- [ ] **Step 1: Maak het migratiebestand aan**

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
-- Eerste klant-schrijfbare policy in dit systeem: de klant mag de héle rij updaten
-- (RLS kent geen kolom-restrictie), de bescherming dat een klant alleen `afgevinkt`
-- verandert komt van de server-actie (vinkTodoAf), die nooit naam/deadline meestuurt.
create policy "klant vinkt eigen voortgang_todos af" on voortgang_todos
  for update using (client_id = current_client_id()) with check (client_id = current_client_id());
```

- [ ] **Step 2: Pas de migratie toe**

Run: `npx supabase migration up`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260812140000_voortgang_todos.sql
git commit -m "feat: voortgang_todos-tabel (klant mag zelf afvinken)"
```

---

### Task 2: Database-types regenereren

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Regenereer**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Let op**: exact deze vorm (`2>/dev/null` vóór de `>`-redirect), anders breken CLI-statusmeldingen het gegenereerde bestand.

Expected: `grep -c "voortgang_todos" src/types/database.ts` geeft een getal > 0.

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenereer database-types na voortgang_todos-migratie"
```

---

### Task 3: Notificatiemail

**Files:**
- Create: `src/lib/email/templates/todo-notificatie.ts`
- Create: `src/lib/email/send-todo-notificatie.ts`

- [ ] **Step 1: Maak de template aan**

```ts
export function todoNotificatieHtml({
  naam,
  taakNaam,
  deadlineLabel,
  link,
}: {
  naam: string;
  taakNaam: string;
  deadlineLabel: string;
  link: string;
}) {
  return `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #042C53;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">Nieuwe taak, ${naam}</h1>
    <p>Er staat een nieuwe taak voor je klaar in je dashboard:</p>
    <p style="font-weight: 600; font-size: 18px;">${taakNaam}</p>
    <p>Deadline: ${deadlineLabel}</p>
    <p>
      <a href="${link}" style="display:inline-block; background:#EF9F27; color:#042C53; font-weight:600; padding:12px 24px; border-radius:8px; text-decoration:none;">
        Bekijk in je dashboard
      </a>
    </p>
  </div>
  `;
}
```

- [ ] **Step 2: Maak de verstuurfunctie aan**

```ts
import 'server-only';
import { Resend } from 'resend';
import { todoNotificatieHtml } from './templates/todo-notificatie';

export async function sendTodoNotificatie({
  klantNaam,
  klantEmail,
  taakNaam,
  deadline,
}: {
  klantNaam: string;
  klantEmail: string;
  taakNaam: string;
  deadline: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const deadlineLabel = new Date(`${deadline}T00:00:00Z`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: klantEmail,
    subject: `Nieuwe taak: ${taakNaam}`,
    html: todoNotificatieHtml({
      naam: klantNaam,
      taakNaam,
      deadlineLabel,
      link: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/voortgang`,
    }),
  });

  if (error) {
    throw new Error(`Kon to-do-notificatie niet versturen: ${error.message}`);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/todo-notificatie.ts src/lib/email/send-todo-notificatie.ts
git commit -m "feat: e-mailnotificatie voor nieuwe to-do's"
```

---

### Task 4: `STANDAARD_TODO_NAMEN`-constante

**Files:**
- Create: `src/lib/constants/todos.ts`

- [ ] **Step 1: Maak het bestand aan**

```ts
export const STANDAARD_TODO_NAMEN = [
  "Nieuwe foto's laten maken",
  'Voorzieningenlijst controleren',
  'Minimumprijs berekenen',
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/constants/todos.ts
git commit -m "feat: STANDAARD_TODO_NAMEN-constante voor de snelkeuzelijst"
```

---

### Task 5: Server-acties (`voegTodoToe`, `vinkTodoAf`, `wijzigTodo`, `verwijderTodo`)

**Files:**
- Modify: `src/app/[locale]/admin/klanten/[id]/actions.ts`
- Test: `tests/integration/todo-acties.test.ts`

- [ ] **Step 1: Schrijf de integratietest**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('@/lib/email/send-todo-notificatie', () => ({
  sendTodoNotificatie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

const { voegTodoToe, vinkTodoAf, wijzigTodo, verwijderTodo } = await import('@/app/[locale]/admin/klanten/[id]/actions');
const { sendTodoNotificatie } = await import('@/lib/email/send-todo-notificatie');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createRawClient(url, serviceKey);

const wachtwoord = 'test-wachtwoord-1234';

async function loginAlsCookieStore(email: string, password: string) {
  const store = new Map<string, string>();
  const browserClient = createBrowserClient(url, anonKey, {
    cookies: {
      getAll: () => Array.from(store.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet: { name: string; value: string }[]) => {
        cookiesToSet.forEach(({ name, value }) => store.set(name, value));
      },
    },
  });
  const { error } = await browserClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return store;
}

let clientId: string;
let clientEmail: string;
let adminEmail: string;
let adminUserId: string;
let klantEmail: string;
let klantUserId: string;

let anderClientId: string;
let anderKlantEmail: string;
let anderKlantUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  clientEmail = `todo-${suffix}@test.local`;
  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Todo Klant', email: clientEmail })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `todo-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `todo-klant-${suffix}@test.local`;
  const { data: klantUserRes } = await admin.auth.admin.createUser({
    email: klantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantUserId = klantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantUserId, role: 'klant', client_id: clientId, email: klantEmail, naam: 'Klant' });

  // Tweede, ongerelateerde klant om de RLS-grens te testen (een klant mag geen to-do van
  // een andere klant afvinken).
  anderKlantEmail = `todo-ander-klant-${suffix}@test.local`;
  const { data: anderClient } = await admin
    .from('clients')
    .insert({ naam: 'Andere Klant', email: `todo-ander-${suffix}@test.local` })
    .select()
    .single();
  anderClientId = anderClient!.id;
  const { data: anderKlantUserRes } = await admin.auth.admin.createUser({
    email: anderKlantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  anderKlantUserId = anderKlantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: anderKlantUserId, role: 'klant', client_id: anderClientId, email: anderKlantEmail, naam: 'Andere Klant' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientId);
  await admin.from('clients').delete().eq('id', anderClientId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(klantUserId);
  await admin.auth.admin.deleteUser(anderKlantUserId);
});

describe('voegTodoToe', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      voegTodoToe({ clientId, naam: 'Test taak', deadline: '2026-09-01' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een lege naam', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      voegTodoToe({ clientId, naam: '   ', deadline: '2026-09-01' })
    ).rejects.toThrow('Naam is verplicht.');
  });

  it('weigert een lege deadline', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      voegTodoToe({ clientId, naam: 'Test taak', deadline: '' })
    ).rejects.toThrow('Deadline is verplicht.');
  });

  it('maakt de to-do aan en verstuurt de notificatie met de juiste gegevens', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    vi.mocked(sendTodoNotificatie).mockClear();

    await voegTodoToe({ clientId, naam: "Nieuwe foto's laten maken", deadline: '2026-09-01' });

    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('*')
      .eq('client_id', clientId)
      .eq('naam', "Nieuwe foto's laten maken")
      .single();
    expect(todo!.deadline).toBe('2026-09-01');
    expect(todo!.afgevinkt).toBe(false);

    expect(sendTodoNotificatie).toHaveBeenCalledWith({
      klantNaam: 'Todo Klant',
      klantEmail: clientEmail,
      taakNaam: "Nieuwe foto's laten maken",
      deadline: '2026-09-01',
    });
  });

  it('geeft een foutmelding als de notificatie faalt, maar de to-do blijft bestaan', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    vi.mocked(sendTodoNotificatie).mockRejectedValueOnce(new Error('Resend is niet bereikbaar'));

    await expect(
      voegTodoToe({ clientId, naam: 'Faalt-mail taak', deadline: '2026-09-02' })
    ).rejects.toThrow('To-do toegevoegd, maar notificatie kon niet worden verstuurd: Resend is niet bereikbaar');

    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('*')
      .eq('client_id', clientId)
      .eq('naam', 'Faalt-mail taak')
      .maybeSingle();
    expect(todo).not.toBeNull();
  });
});

describe('vinkTodoAf', () => {
  it('laat een klant een eigen to-do afvinken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Klant-afvink taak', deadline: '2026-09-03' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Klant-afvink taak')
      .single();

    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await vinkTodoAf({ clientId, todoId: todo!.id, afgevinkt: true });

    const { data: todoNa } = await admin.from('voortgang_todos').select('afgevinkt').eq('id', todo!.id).single();
    expect(todoNa!.afgevinkt).toBe(true);
  });

  it('laat een admin een to-do van elke klant afvinken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Admin-afvink taak', deadline: '2026-09-04' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Admin-afvink taak')
      .single();

    await vinkTodoAf({ clientId, todoId: todo!.id, afgevinkt: true });

    const { data: todoNa } = await admin.from('voortgang_todos').select('afgevinkt').eq('id', todo!.id).single();
    expect(todoNa!.afgevinkt).toBe(true);
  });

  it('weigert een klant die een to-do van een andere klant probeert af te vinken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Niet-jouw taak', deadline: '2026-09-05' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Niet-jouw taak')
      .single();

    activeCookieStore = await loginAlsCookieStore(anderKlantEmail, wachtwoord);
    await vinkTodoAf({ clientId, todoId: todo!.id, afgevinkt: true });

    // RLS blokkeert de update stilzwijgend (0 rijen geraakt, geen error) — de to-do van de
    // andere klant blijft dus onaangevinkt.
    const { data: todoNa } = await admin.from('voortgang_todos').select('afgevinkt').eq('id', todo!.id).single();
    expect(todoNa!.afgevinkt).toBe(false);
  });
});

describe('wijzigTodo en verwijderTodo', () => {
  it('weigert een niet-admin bij wijzigen en verwijderen', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Weigert-taak', deadline: '2026-09-06' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Weigert-taak')
      .single();

    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      wijzigTodo({ clientId, todoId: todo!.id, naam: 'X', deadline: '2026-09-07' })
    ).rejects.toThrow('Niet geautoriseerd.');
    await expect(verwijderTodo({ clientId, todoId: todo!.id })).rejects.toThrow('Niet geautoriseerd.');
  });

  it('wijzigt naam en deadline', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Oude naam', deadline: '2026-09-08' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Oude naam')
      .single();

    await wijzigTodo({ clientId, todoId: todo!.id, naam: 'Nieuwe naam', deadline: '2026-09-09' });

    const { data: todoNa } = await admin.from('voortgang_todos').select('naam, deadline').eq('id', todo!.id).single();
    expect(todoNa!.naam).toBe('Nieuwe naam');
    expect(todoNa!.deadline).toBe('2026-09-09');
  });

  it('verwijdert de to-do', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Te verwijderen taak', deadline: '2026-09-10' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Te verwijderen taak')
      .single();

    await verwijderTodo({ clientId, todoId: todo!.id });

    const { data: todoNa } = await admin.from('voortgang_todos').select('*').eq('id', todo!.id).maybeSingle();
    expect(todoNa).toBeNull();
  });
});
```

- [ ] **Step 2: Run de test om te bevestigen dat hij faalt**

Run: `npm test -- tests/integration/todo-acties.test.ts`
Expected: FAIL — geen van de vier functies bestaat nog.

- [ ] **Step 3: Voeg de import toe**

In `src/app/[locale]/admin/klanten/[id]/actions.ts`, vervang de importregel:

```ts
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';
```

door:

```ts
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';
import { sendTodoNotificatie } from '@/lib/email/send-todo-notificatie';
```

- [ ] **Step 4: Voeg de vier server-acties toe**

Voeg helemaal onderaan het bestand toe:

```ts

export async function voegTodoToe(input: {
  clientId: string;
  naam: string;
  deadline: string;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.deadline) throw new Error('Deadline is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('voortgang_todos').insert({
    client_id: input.clientId,
    naam: input.naam.trim(),
    deadline: input.deadline,
    toegevoegd_door: user?.id,
  });
  if (error) throw new Error(error.message);

  const { data: klant, error: klantError } = await supabase
    .from('clients')
    .select('naam, email')
    .eq('id', input.clientId)
    .single();

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);

  if (klantError) {
    throw new Error(`To-do toegevoegd, maar notificatie kon niet worden verstuurd: ${klantError.message}`);
  }

  try {
    await sendTodoNotificatie({
      klantNaam: klant.naam,
      klantEmail: klant.email,
      taakNaam: input.naam.trim(),
      deadline: input.deadline,
    });
  } catch (emailError) {
    throw new Error(`To-do toegevoegd, maar notificatie kon niet worden verstuurd: ${(emailError as Error).message}`);
  }
}

export async function vinkTodoAf(input: {
  clientId: string;
  todoId: string;
  afgevinkt: boolean;
}) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('voortgang_todos')
    .update({ afgevinkt: input.afgevinkt })
    .eq('id', input.todoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}

export async function wijzigTodo(input: {
  clientId: string;
  todoId: string;
  naam: string;
  deadline: string;
}) {
  await assertIsAdmin();
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.deadline) throw new Error('Deadline is verplicht.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('voortgang_todos')
    .update({ naam: input.naam.trim(), deadline: input.deadline })
    .eq('id', input.todoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}

export async function verwijderTodo(input: { clientId: string; todoId: string }) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from('voortgang_todos').delete().eq('id', input.todoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}/voortgang`);
}
```

- [ ] **Step 5: Run de test om te bevestigen dat hij slaagt**

Run: `npm test -- tests/integration/todo-acties.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/admin/klanten/[id]/actions.ts" tests/integration/todo-acties.test.ts
git commit -m "feat: server-acties voor to-do's (toevoegen/afvinken/wijzigen/verwijderen)"
```

---

### Task 6: `TodoRij`-component

**Files:**
- Create: `src/components/portal/todo-rij.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { vinkTodoAf, wijzigTodo, verwijderTodo } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface Todo {
  id: string;
  naam: string;
  deadline: string;
  afgevinkt: boolean;
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
}: {
  clientId: string;
  todo: Todo;
  isAdmin: boolean;
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
    return <TodoBewerkRij clientId={clientId} todo={todo} onKlaar={() => setBewerken(false)} />;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={todo.afgevinkt} disabled={isPending} onChange={toggleAfvinken} />
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
  onKlaar,
}: {
  clientId: string;
  todo: Todo;
  onKlaar: () => void;
}) {
  const [naam, setNaam] = useState(todo.naam);
  const [deadline, setDeadline] = useState(todo.deadline);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await wijzigTodo({ clientId, todoId: todo.id, naam, deadline });
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

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/todo-rij.tsx
git commit -m "feat: TodoRij-component (afvinken voor iedereen, bewerken/verwijderen voor admin)"
```

---

### Task 7: `VoortgangsTodos`-component

**Files:**
- Create: `src/components/portal/voortgangs-todos.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
import { TodoRij, type Todo } from './todo-rij';

export function VoortgangsTodos({
  todos,
  clientId,
  isAdmin,
}: {
  todos: Todo[];
  clientId: string;
  isAdmin: boolean;
}) {
  const gesorteerd = [...todos].sort((a, b) => (a.deadline < b.deadline ? -1 : 1));

  if (gesorteerd.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen to-do&apos;s.</p>;
  }

  return (
    <ul className="space-y-2">
      {gesorteerd.map((todo) => (
        <li key={todo.id}>
          <TodoRij clientId={clientId} todo={todo} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/voortgangs-todos.tsx
git commit -m "feat: VoortgangsTodos-component (gesorteerd op deadline)"
```

---

### Task 8: `TodoToevoegenFormulier` (admin)

**Files:**
- Create: `src/components/admin/todo-toevoegen-formulier.tsx`

- [ ] **Step 1: Maak het bestand aan**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { voegTodoToe } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STANDAARD_TODO_NAMEN } from '@/lib/constants/todos';

export function TodoToevoegenFormulier({ clientId }: { clientId: string }) {
  const [naam, setNaam] = useState('');
  const [deadline, setDeadline] = useState('');
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
        await voegTodoToe({ clientId, naam, deadline });
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
        <Button size="sm" disabled={isPending} onClick={toevoegen}>
          {isPending ? 'Bezig...' : '+'}
        </Button>
      </div>
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/todo-toevoegen-formulier.tsx
git commit -m "feat: TodoToevoegenFormulier met snelkeuzelijst"
```

---

### Task 9: Wiring in de Voortgang-pagina's

**Files:**
- Modify: `src/app/[locale]/dashboard/voortgang/page.tsx`
- Modify: `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx`

- [ ] **Step 1: Werk de klant-pagina bij**

Vervang in `src/app/[locale]/dashboard/voortgang/page.tsx` de importregel:

```tsx
import { AirbnbFunnelNulmeting } from '@/components/portal/airbnb-funnel-nulmeting';
```

door:

```tsx
import { AirbnbFunnelNulmeting } from '@/components/portal/airbnb-funnel-nulmeting';
import { VoortgangsTodos } from '@/components/portal/voortgangs-todos';
import type { Todo } from '@/components/portal/todo-rij';
```

Vervang:

```tsx
  const [{ data: fasen }, { data: items }, { data: funnel }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt'),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .maybeSingle(),
  ]);
```

door:

```tsx
  const [{ data: fasen }, { data: items }, { data: funnel }, { data: todos }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt'),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .maybeSingle(),
    supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt'),
  ]);
```

Vervang:

```tsx
        <AirbnbFunnelNulmeting
          clientId={clientId}
          waarden={{
            gemiddeldConversiepercentage: funnel?.gemiddeld_conversiepercentage ?? null,
            percentageZoekvertoningenEerstePagina: funnel?.percentage_zoekvertoningen_eerste_pagina ?? null,
            conversieZoekopdrachtNaarAdvertentie: funnel?.conversie_zoekopdracht_naar_advertentie ?? null,
            conversieAdvertentieNaarBoeking: funnel?.conversie_advertentie_naar_boeking ?? null,
          }}
          nulmetingDatum={funnel?.nulmeting_datum ?? null}
          magBewerken={false}
        />
      </div>
    </main>
  );
}
```

door:

```tsx
        <AirbnbFunnelNulmeting
          clientId={clientId}
          waarden={{
            gemiddeldConversiepercentage: funnel?.gemiddeld_conversiepercentage ?? null,
            percentageZoekvertoningenEerstePagina: funnel?.percentage_zoekvertoningen_eerste_pagina ?? null,
            conversieZoekopdrachtNaarAdvertentie: funnel?.conversie_zoekopdracht_naar_advertentie ?? null,
            conversieAdvertentieNaarBoeking: funnel?.conversie_advertentie_naar_boeking ?? null,
          }}
          nulmetingDatum={funnel?.nulmeting_datum ?? null}
          magBewerken={false}
        />
      </div>
      <div className="mt-10">
        <h2 className="font-serif text-xl">To-do&apos;s</h2>
        <div className="mt-4">
          <VoortgangsTodos todos={(todos ?? []) as Todo[]} clientId={clientId} isAdmin={false} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Werk de admin-pagina bij**

Vervang in `src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx` de importregel:

```tsx
import { ChecklistItemToevoegenFormulier } from '@/components/admin/checklist-item-toevoegen-formulier';
```

door:

```tsx
import { ChecklistItemToevoegenFormulier } from '@/components/admin/checklist-item-toevoegen-formulier';
import { VoortgangsTodos } from '@/components/portal/voortgangs-todos';
import type { Todo } from '@/components/portal/todo-rij';
import { TodoToevoegenFormulier } from '@/components/admin/todo-toevoegen-formulier';
```

Vervang:

```tsx
  const [{ data: fasen }, { data: items }, { data: funnel }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt').eq('client_id', id),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .eq('client_id', id)
      .maybeSingle(),
  ]);
```

door:

```tsx
  const [{ data: fasen }, { data: items }, { data: funnel }, { data: todos }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt').eq('client_id', id),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .eq('client_id', id)
      .maybeSingle(),
    supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt').eq('client_id', id),
  ]);
```

Vervang:

```tsx
          nulmetingDatum={funnel?.nulmeting_datum ?? null}
          magBewerken
        />
      </div>
    </main>
  );
}
```

door:

```tsx
          nulmetingDatum={funnel?.nulmeting_datum ?? null}
          magBewerken
        />
      </div>
      <div className="mt-10">
        <h2 className="font-serif text-xl">To-do&apos;s</h2>
        <div className="mt-4">
          <VoortgangsTodos todos={(todos ?? []) as Todo[]} clientId={id} isAdmin />
        </div>
        <TodoToevoegenFormulier clientId={id} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/voortgang/page.tsx" "src/app/[locale]/admin/klanten/[id]/voortgang/page.tsx"
git commit -m "feat: Voortgang-pagina's tonen de to-do-sectie"
```

---

### Task 10: Verificatie

**Files:** geen wijzigingen — verificatiestap.

- [ ] **Step 1: Run de volledige testsuite**

Run: `npm test`
Expected: alle tests slagen.

- [ ] **Step 2: Lint en build**

Run: `npm run lint && npm run build`
Expected: geen lint-errors in de gewijzigde/nieuwe bestanden (negeer bestaande fouten in
`supabase/.temp/`); build/typecheck slaagt.

- [ ] **Step 3: Handmatig testen tegen de dev-server**

Run: `npm run dev`.

Als admin: open een klant → Voortgang. Voeg een to-do toe via de snelkeuzelijst + datum, en
controleer in de terminal-logs dat de Resend-aanroep gebeurt (lokaal zonder geldige
`RESEND_API_KEY` faalt dit verwacht — controleer dan dat de foutmelding "To-do toegevoegd,
maar notificatie kon niet worden verstuurd" verschijnt en de to-do wél in de lijst staat). Vink
de to-do af, bewerk 'm, en verwijder 'm.

Als klant: open Voortgang → To-do's, controleer dat je een to-do kunt afvinken maar geen
bewerken/verwijderen-knoppen ziet.

Sluit de dev-server af (Ctrl+C) na verificatie.
