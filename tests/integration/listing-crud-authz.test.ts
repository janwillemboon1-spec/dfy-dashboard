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

const { wijzigListing, verwijderListing } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
    .insert({ naam: 'Listing CRUD Klant', email: `listing-crud-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `listing-crud-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `listing-crud-klant-${suffix}@test.local`;
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

describe('wijzigListing', () => {
  it('weigert een niet-admin', async () => {
    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Weigert Listing' })
      .select()
      .single();

    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      wijzigListing({ listingId: listing!.id, clientId, naam: 'X', adres: null, airbnbUrl: null })
    ).rejects.toThrow('Niet geautoriseerd.');

    await admin.from('listings').delete().eq('id', listing!.id);
  });

  it('wijzigt naam, adres en Airbnb-URL', async () => {
    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Oude Naam' })
      .select()
      .single();

    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await wijzigListing({
      listingId: listing!.id,
      clientId,
      naam: 'Nieuwe Naam',
      adres: 'Teststraat 1',
      airbnbUrl: 'https://airbnb.com/rooms/123',
    });

    const { data: bijgewerkt } = await admin.from('listings').select('*').eq('id', listing!.id).single();
    expect(bijgewerkt!.naam).toBe('Nieuwe Naam');
    expect(bijgewerkt!.adres).toBe('Teststraat 1');
    expect(bijgewerkt!.airbnb_url).toBe('https://airbnb.com/rooms/123');

    await admin.from('listings').delete().eq('id', listing!.id);
  });
});

describe('verwijderListing', () => {
  it('weigert een niet-admin', async () => {
    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Weigert Verwijderen' })
      .select()
      .single();

    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(verwijderListing({ listingId: listing!.id, clientId })).rejects.toThrow('Niet geautoriseerd.');

    await admin.from('listings').delete().eq('id', listing!.id);
  });

  it('verwijdert de listing en alle gerelateerde data', async () => {
    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: clientId, naam: 'Te Verwijderen Listing' })
      .select()
      .single();
    const listingId = listing!.id;

    await admin.from('nulmeting').insert({ listing_id: listingId, jaar: 2026, maand: 1, omzet: 100, bezetting: 10 });
    await admin
      .from('action_log')
      .insert({ listing_id: listingId, datum: '2026-01-01', omschrijving: 'Test', type: 'overig' });

    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await verwijderListing({ listingId, clientId });

    const { data: listingNa } = await admin.from('listings').select('*').eq('id', listingId).maybeSingle();
    expect(listingNa).toBeNull();

    const { data: nulmetingNa } = await admin.from('nulmeting').select('*').eq('listing_id', listingId);
    expect(nulmetingNa).toEqual([]);

    const { data: actionLogNa } = await admin.from('action_log').select('*').eq('listing_id', listingId);
    expect(actionLogNa).toEqual([]);
  });
});
