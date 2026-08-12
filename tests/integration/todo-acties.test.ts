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
