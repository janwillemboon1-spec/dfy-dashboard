import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

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

const { voegChecklistItemToe, vinkChecklistItemAf } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
    .insert({ naam: 'Checklist Klant', email: `checklist-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `checklist-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `checklist-klant-${suffix}@test.local`;
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

describe('voegChecklistItemToe', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      voegChecklistItemToe({ clientId, faseNummer: 1, naam: 'Test' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een lege naam', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      voegChecklistItemToe({ clientId, faseNummer: 1, naam: '   ' })
    ).rejects.toThrow('Naam is verplicht.');
  });
});

describe('checklist en fase-percentage herberekening', () => {
  it('herberekent het fase-percentage correct bij toevoegen en afvinken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const suffix = `${Date.now()}-percentage`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Percentage Klant', email: `checklist-percentage-${suffix}@test.local` })
      .select()
      .single();
    const percentageClientId = client!.id;

    try {
      // De standaard-checklist-trigger heeft net 4 items voor fase 1 aangemaakt — eerst
      // opruimen zodat deze test met een schone, voorspelbare lei begint.
      await admin.from('voortgang_checklist_items').delete().eq('client_id', percentageClientId);

      await voegChecklistItemToe({ clientId: percentageClientId, faseNummer: 1, naam: 'Item A' });
      await voegChecklistItemToe({ clientId: percentageClientId, faseNummer: 1, naam: 'Item B' });

      const { data: itemsNaToevoegen } = await admin
        .from('voortgang_checklist_items')
        .select('id, naam')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1);
      const itemA = itemsNaToevoegen!.find((i) => i.naam === 'Item A')!;

      await vinkChecklistItemAf({
        clientId: percentageClientId,
        itemId: itemA.id,
        faseNummer: 1,
        afgevinkt: true,
      });

      const { data: faseNa1Afvink } = await admin
        .from('voortgang_fasen')
        .select('percentage')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1)
        .single();
      expect(faseNa1Afvink!.percentage).toBe(50);

      await voegChecklistItemToe({ clientId: percentageClientId, faseNummer: 1, naam: 'Item C' });

      const { data: faseNa3eItem } = await admin
        .from('voortgang_fasen')
        .select('percentage')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1)
        .single();
      expect(faseNa3eItem!.percentage).toBe(33);

      const { data: itemsNa3e } = await admin
        .from('voortgang_checklist_items')
        .select('id, naam')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1);
      const itemC = itemsNa3e!.find((i) => i.naam === 'Item C')!;

      await vinkChecklistItemAf({
        clientId: percentageClientId,
        itemId: itemC.id,
        faseNummer: 1,
        afgevinkt: true,
      });

      const { data: faseNaC } = await admin
        .from('voortgang_fasen')
        .select('percentage')
        .eq('client_id', percentageClientId)
        .eq('fase_nummer', 1)
        .single();
      // Item A en C zijn afgevinkt, Item B nog niet: 2 van de 3 = 67%.
      expect(faseNaC!.percentage).toBe(67);
    } finally {
      await admin.from('clients').delete().eq('id', percentageClientId);
    }
  });

  it('herberekent het fase-percentage ook voor een item dat via de standaard-checklist-trigger is aangemaakt (niet via voegChecklistItemToe)', async () => {
    // Regressietest voor een bug waarbij fase-percentages op 0% ("nog niet gestart")
    // bleven staan na het afvinken van checklist-items: de bestaande tests hierboven
    // vinken alleen items af die zelf via voegChecklistItemToe zijn aangemaakt, maar in
    // de praktijk komen bijna alle items van de automatische standaard-checklist-trigger
    // (clients_seed_standaard_checklist) op nieuwe klanten — dat pad was ongetest.
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: fase1Items } = await admin
      .from('voortgang_checklist_items')
      .select('id')
      .eq('client_id', clientId)
      .eq('fase_nummer', 1);
    expect(fase1Items!.length).toBeGreaterThan(0);
    const totaalFase1 = fase1Items!.length;
    const triggerItemId = fase1Items![0].id;

    await vinkChecklistItemAf({
      clientId,
      itemId: triggerItemId,
      faseNummer: 1,
      afgevinkt: true,
    });

    const { data: fase } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 1)
      .single();
    expect(fase!.percentage).toBe(Math.round((1 / totaalFase1) * 100));
  });
});
