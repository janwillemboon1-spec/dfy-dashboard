import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return {
    ...actual,
    fetchReservationData: vi.fn().mockResolvedValue([
      { check_in: '2025-01-10', check_out: '2025-01-12', rental_revenue: '200', booking_status: 'booked' },
    ]),
  };
});

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

const { ververCijfersVoorKlant } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
let gekoppeldeListingId: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Cijfers Verversen Klant', email: `cijfers-verversen-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  const { data: gekoppeld } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Gekoppelde Listing', pricelabs_listing_id: `pl-cijfers-test-${suffix}` })
    .select()
    .single();
  gekoppeldeListingId = gekoppeld!.id;
  await admin
    .from('pricelabs_listings_cache')
    .upsert(
      { pricelabs_listing_id: `pl-cijfers-test-${suffix}`, naam: 'Test', pms: 'hostaway' },
      { onConflict: 'pricelabs_listing_id' }
    );

  await admin.from('listings').insert({ client_id: clientId, naam: 'Niet-gekoppelde Listing' });

  adminEmail = `cijfers-verversen-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `cijfers-verversen-klant-${suffix}@test.local`;
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

describe('ververCijfersVoorKlant', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(ververCijfersVoorKlant(clientId)).rejects.toThrow('Niet geautoriseerd.');
  });

  it('ververst alleen gekoppelde listings en slaat niet-gekoppelde over', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const resultaten = await ververCijfersVoorKlant(clientId);

    expect(resultaten).toHaveLength(1);
    expect(resultaten[0].listingNaam).toBe('Gekoppelde Listing');
    expect(resultaten[0].succes).toBe(true);

    const { data: actuals } = await admin
      .from('monthly_actuals')
      .select('*')
      .eq('listing_id', gekoppeldeListingId);
    expect(actuals!.length).toBeGreaterThan(0);
  });

  it('geeft een lege lijst terug als er geen gekoppelde accommodaties zijn', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const suffix = Date.now();
    const { data: kaleKlant } = await admin
      .from('clients')
      .insert({ naam: 'Kale Klant', email: `kaal-${suffix}@test.local` })
      .select()
      .single();

    const resultaten = await ververCijfersVoorKlant(kaleKlant!.id);
    expect(resultaten).toEqual([]);

    await admin.from('clients').delete().eq('id', kaleKlant!.id);
  });
});
