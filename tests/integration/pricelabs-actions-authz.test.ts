import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// Zelfde opzet als tests/integration/import-actions-authz.test.ts: roept de 'use
// server'-functies rechtstreeks aan (niet via de UI) om te simuleren dat een
// niet-admin de action buiten de /admin-middleware om aanroept.
vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return { ...actual, fetchReservationData: vi.fn().mockResolvedValue([]) };
});

// revalidatePath vereist een echte Next.js request-scope (workAsyncStorage) — die
// bestaat hier niet, want deze test roept de 'use server'-functie rechtstreeks aan
// buiten een request om (zie ook de next/headers-mock hieronder, om dezelfde reden).
// Zonder deze mock gooit de échte revalidatePath een "static generation store
// missing"-invariant; dat is een omgevingsbeperking van de teststand, niet iets wat
// de admin-koppel-actie zelf test.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

const { koppelListing, ontkoppelListing, syncListingNow } = await import(
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

let klantUserId: string;
let klantEmail: string;
let adminUserId: string;
let adminEmail: string;
let doelClientId: string;
let doelListingId: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: doelClient } = await admin
    .from('clients')
    .insert({ naam: 'Pricelabs Authz Klant', email: `pricelabs-authz-${suffix}@test.local` })
    .select()
    .single();
  doelClientId = doelClient!.id;

  const { data: doelListing } = await admin
    .from('listings')
    .insert({ client_id: doelClientId, naam: 'Pricelabs Authz Listing' })
    .select()
    .single();
  doelListingId = doelListing!.id;

  await admin
    .from('nulmeting')
    .insert({ listing_id: doelListingId, jaar: 2025, maand: 1, omzet: 1000, bezetting: 50 });

  klantEmail = `pricelabs-authz-klant-${suffix}@test.local`;
  const { data: klantUserRes } = await admin.auth.admin.createUser({
    email: klantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantUserId = klantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantUserId, role: 'klant', client_id: doelClientId, email: klantEmail, naam: 'Klant' });

  adminEmail = `pricelabs-authz-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', doelClientId);
  await admin.auth.admin.deleteUser(klantUserId);
  await admin.auth.admin.deleteUser(adminUserId);
});

describe('pricelabs-koppeling server actions: expliciete admin-check', () => {
  it('koppelListing weigert een niet-admin en schrijft niets weg', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);

    await expect(
      koppelListing({ listingId: doelListingId, clientId: doelClientId, pricelabsListingId: 'pl-x', pms: 'hostaway' })
    ).rejects.toThrow('Niet geautoriseerd.');

    const { data: listing } = await admin.from('listings').select('pricelabs_listing_id').eq('id', doelListingId).single();
    expect(listing!.pricelabs_listing_id).toBeNull();
  });

  it('regressie: een echte admin kan een listing koppelen', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await koppelListing({ listingId: doelListingId, clientId: doelClientId, pricelabsListingId: 'pl-x', pms: 'hostaway' });

    const { data: listing } = await admin.from('listings').select('pricelabs_listing_id').eq('id', doelListingId).single();
    expect(listing!.pricelabs_listing_id).toBe('pl-x');
  });

  it('koppelListing werkt ook als er nog geen nulmeting bestaat voor deze accommodatie', async () => {
    const { data: listingZonderNulmeting } = await admin
      .from('listings')
      .insert({ client_id: doelClientId, naam: 'Listing zonder nulmeting' })
      .select()
      .single();

    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await koppelListing({
      listingId: listingZonderNulmeting!.id,
      clientId: doelClientId,
      pricelabsListingId: 'pl-zonder-nulmeting',
      pms: 'hostaway',
    });

    const { data: listing } = await admin
      .from('listings')
      .select('pricelabs_listing_id')
      .eq('id', listingZonderNulmeting!.id)
      .single();
    expect(listing!.pricelabs_listing_id).toBe('pl-zonder-nulmeting');
  });

  it('syncListingNow weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(syncListingNow({ listingId: doelListingId, clientId: doelClientId })).rejects.toThrow('Niet geautoriseerd.');
  });

  it('ontkoppelListing weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(ontkoppelListing({ listingId: doelListingId, clientId: doelClientId })).rejects.toThrow('Niet geautoriseerd.');

    const { data: listing } = await admin.from('listings').select('pricelabs_listing_id').eq('id', doelListingId).single();
    expect(listing!.pricelabs_listing_id).toBe('pl-x');
  });
});
