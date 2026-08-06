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

const { wijzigKlant, verwijderKlant } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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

async function kanInloggen(email: string, password: string): Promise<boolean> {
  const browserClient = createBrowserClient(url, anonKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  const { error } = await browserClient.auth.signInWithPassword({ email, password });
  return !error;
}

let adminEmail: string;
let adminUserId: string;

beforeAll(async () => {
  const suffix = Date.now();
  adminEmail = `klant-crud-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(adminUserId);
});

describe('wijzigKlant', () => {
  let clientId: string;
  let klantUserId: string;
  let klantEmail: string;

  beforeAll(async () => {
    const suffix = `${Date.now()}-wijzig`;
    klantEmail = `klant-crud-klant-${suffix}@test.local`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Oude Naam', email: klantEmail, telefoon: '0600000000', status: 'onboarding' })
      .select()
      .single();
    clientId = client!.id;

    const { data: klantUserRes } = await admin.auth.admin.createUser({
      email: klantEmail,
      email_confirm: true,
      password: wachtwoord,
    });
    klantUserId = klantUserRes!.user!.id;
    await admin
      .from('profiles')
      .insert({ id: klantUserId, role: 'klant', client_id: clientId, email: klantEmail, naam: 'Oude Naam' });
  });

  afterAll(async () => {
    await admin.from('clients').delete().eq('id', clientId);
    await admin.auth.admin.deleteUser(klantUserId);
  });

  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      wijzigKlant({ clientId, naam: 'X', email: klantEmail, telefoon: null, status: 'actief' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('wijzigt naam, telefoon en status zonder het e-mailadres aan te raken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await wijzigKlant({
      clientId,
      naam: 'Nieuwe Naam',
      email: klantEmail,
      telefoon: '0611111111',
      status: 'actief',
    });

    const { data: klant } = await admin.from('clients').select('*').eq('id', clientId).single();
    expect(klant!.naam).toBe('Nieuwe Naam');
    expect(klant!.telefoon).toBe('0611111111');
    expect(klant!.status).toBe('actief');
    expect(klant!.email).toBe(klantEmail);
  });

  it('wijzigt het e-mailadres en werkt zowel het profiel als het inlogaccount bij', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const nieuweEmail = `${klantEmail.split('@')[0]}-nieuw@test.local`;

    await wijzigKlant({
      clientId,
      naam: 'Nieuwe Naam',
      email: nieuweEmail,
      telefoon: '0611111111',
      status: 'actief',
    });

    const { data: klant } = await admin.from('clients').select('email').eq('id', clientId).single();
    expect(klant!.email).toBe(nieuweEmail);

    const { data: profiel } = await admin.from('profiles').select('email').eq('id', klantUserId).single();
    expect(profiel!.email).toBe(nieuweEmail);

    expect(await kanInloggen(nieuweEmail, wachtwoord)).toBe(true);
    expect(await kanInloggen(klantEmail, wachtwoord)).toBe(false);

    klantEmail = nieuweEmail;
  });

  it('geeft een duidelijke fout bij een e-mailadres dat al in gebruik is', async () => {
    const suffix = `${Date.now()}-ander`;
    const anderEmail = `klant-crud-ander-${suffix}@test.local`;
    const { data: anderClient } = await admin
      .from('clients')
      .insert({ naam: 'Andere Klant', email: anderEmail })
      .select()
      .single();

    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await expect(
      wijzigKlant({ clientId, naam: 'X', email: anderEmail, telefoon: null, status: 'actief' })
    ).rejects.toThrow('Dit e-mailadres is al in gebruik bij een andere klant.');

    await admin.from('clients').delete().eq('id', anderClient!.id);
  });
});

describe('verwijderKlant', () => {
  it('weigert een niet-admin', async () => {
    const suffix = `${Date.now()}-weigert`;
    const email = `klant-crud-verwijder-weigert-${suffix}@test.local`;
    const { data: client } = await admin.from('clients').insert({ naam: 'X', email }).select().single();

    const { data: klantUserRes } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: wachtwoord,
    });
    const klantUserId = klantUserRes!.user!.id;
    await admin.from('profiles').insert({ id: klantUserId, role: 'klant', client_id: client!.id, email, naam: 'X' });

    activeCookieStore = await loginAlsCookieStore(email, wachtwoord);
    await expect(verwijderKlant({ clientId: client!.id })).rejects.toThrow('Niet geautoriseerd.');

    await admin.from('clients').delete().eq('id', client!.id);
    await admin.auth.admin.deleteUser(klantUserId);
  });

  it('verwijdert de klant, alle gerelateerde data, en het inlogaccount', async () => {
    const suffix = `${Date.now()}-verwijder`;
    const email = `klant-crud-verwijder-${suffix}@test.local`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Te Verwijderen', email })
      .select()
      .single();
    const clientId = client!.id;

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Listing' })
      .select()
      .single();
    const listingId = listing!.id;

    await admin.from('nulmeting').insert({ listing_id: listingId, jaar: 2026, maand: 1, omzet: 100, bezetting: 10 });
    await admin
      .from('action_log')
      .insert({ listing_id: listingId, datum: '2026-01-01', omschrijving: 'Test', type: 'overig' });

    const { data: klantUserRes } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: wachtwoord,
    });
    const klantUserId = klantUserRes!.user!.id;
    await admin.from('profiles').insert({ id: klantUserId, role: 'klant', client_id: clientId, email, naam: 'X' });

    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await verwijderKlant({ clientId });

    const { data: klantNa } = await admin.from('clients').select('*').eq('id', clientId).maybeSingle();
    expect(klantNa).toBeNull();

    const { data: listingsNa } = await admin.from('listings').select('*').eq('client_id', clientId);
    expect(listingsNa).toEqual([]);

    const { data: nulmetingNa } = await admin.from('nulmeting').select('*').eq('listing_id', listingId);
    expect(nulmetingNa).toEqual([]);

    const { data: actionLogNa } = await admin.from('action_log').select('*').eq('listing_id', listingId);
    expect(actionLogNa).toEqual([]);

    expect(await kanInloggen(email, wachtwoord)).toBe(false);
  });
});
