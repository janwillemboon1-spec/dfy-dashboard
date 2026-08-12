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

const { voegActiviteitToe, voegChecklistItemToe, vinkChecklistItemAf, voegTodoToe, vinkTodoAf } = await import(
  '@/app/[locale]/admin/klanten/[id]/actions'
);

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
let adminEmail: string;
let adminUserId: string;
let klantEmail: string;
let klantUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Activiteitenlog Klant', email: `activiteitenlog-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `activiteitenlog-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `activiteitenlog-klant-${suffix}@test.local`;
  const { data: klantUserRes } = await admin.auth.admin.createUser({
    email: klantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantUserId = klantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantUserId, role: 'klant', client_id: clientId, email: klantEmail, naam: 'Klant' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(klantUserId);
});

describe('voegActiviteitToe', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Test' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een lege omschrijving', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: '   ' })
    ).rejects.toThrow('Omschrijving is verplicht.');
  });

  it('maakt de activiteit aan met de ingelogde admin als toegevoegd_door', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Handmatige regel' });

    const { data: activiteit } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Handmatige regel')
      .single();
    expect(activiteit!.datum).toBe('2026-08-12');
    expect(activiteit!.toegevoegd_door).toBe(adminUserId);
  });

  it('slaat listingId op als die is meegegeven, en laat het veld leeg (algemeen) als die ontbreekt', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Activiteit-test woning' })
      .select()
      .single();

    await voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Regel voor specifieke woning', listingId: listing!.id });
    await voegActiviteitToe({ clientId, datum: '2026-08-12', omschrijving: 'Algemene regel' });

    const { data: activiteiten } = await admin
      .from('voortgang_activiteitenlog')
      .select('omschrijving, listing_id')
      .eq('client_id', clientId)
      .in('omschrijving', ['Regel voor specifieke woning', 'Algemene regel']);

    const specifiek = activiteiten!.find((a) => a.omschrijving === 'Regel voor specifieke woning');
    const algemeen = activiteiten!.find((a) => a.omschrijving === 'Algemene regel');
    expect(specifiek!.listing_id).toBe(listing!.id);
    expect(algemeen!.listing_id).toBeNull();
  });
});

describe('automatisch loggen via triggers', () => {
  it('logt een checklist-item dat wordt afgevinkt en weer uitgevinkt', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Trigger-test item' });
    const { data: item } = await admin
      .from('voortgang_checklist_items')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Trigger-test item')
      .single();

    await vinkChecklistItemAf({ clientId, itemId: item!.id, faseNummer: 1, afgevinkt: true });
    const { data: afgevinktLog } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Checklist-item afgevinkt: Trigger-test item')
      .single();
    expect(afgevinktLog!.toegevoegd_door).toBe(adminUserId);

    await vinkChecklistItemAf({ clientId, itemId: item!.id, faseNummer: 1, afgevinkt: false });
    const { data: uitgevinktLog } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Checklist-item uitgevinkt: Trigger-test item')
      .single();
    expect(uitgevinktLog!.toegevoegd_door).toBe(adminUserId);
  });

  it('logt een nieuwe to-do die door de admin wordt toegevoegd', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegTodoToe({ clientId, naam: 'Trigger-test taak', deadline: '2026-09-01' });

    const { data: log } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Nieuwe taak toegevoegd: Trigger-test taak')
      .single();
    expect(log!.toegevoegd_door).toBe(adminUserId);
  });

  it('logt een to-do die door de klant wordt afgevinkt, met de klant als toegevoegd_door', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await voegTodoToe({ clientId, naam: 'Klant-trigger-taak', deadline: '2026-09-02' });
    const { data: todo } = await admin
      .from('voortgang_todos')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Klant-trigger-taak')
      .single();

    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await vinkTodoAf({ clientId, todoId: todo!.id, afgevinkt: true });

    const { data: log } = await admin
      .from('voortgang_activiteitenlog')
      .select('*')
      .eq('client_id', clientId)
      .eq('omschrijving', 'To-do afgevinkt: Klant-trigger-taak')
      .single();
    expect(log!.toegevoegd_door).toBe(klantUserId);
  });

  it('logt een afgevinkt checklist-item met de listing_id van dat item', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Trigger-listing-test woning' })
      .select()
      .single();

    await voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Item met woning-label', listingId: listing!.id });
    const { data: item } = await admin
      .from('voortgang_checklist_items')
      .select('id')
      .eq('client_id', clientId)
      .eq('naam', 'Item met woning-label')
      .single();

    await vinkChecklistItemAf({ clientId, itemId: item!.id, faseNummer: 1, afgevinkt: true });

    const { data: log } = await admin
      .from('voortgang_activiteitenlog')
      .select('listing_id')
      .eq('client_id', clientId)
      .eq('omschrijving', 'Checklist-item afgevinkt: Item met woning-label')
      .single();
    expect(log!.listing_id).toBe(listing!.id);
  });
});
