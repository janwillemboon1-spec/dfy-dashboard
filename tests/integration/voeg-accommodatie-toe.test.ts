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

const { voegAccommodatieToe } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
    .insert({ naam: 'Voeg Accommodatie Klant', email: `voeg-accommodatie-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `voeg-accommodatie-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `voeg-accommodatie-klant-${suffix}@test.local`;
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

describe('voegAccommodatieToe', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      voegAccommodatieToe({ clientId, naam: 'Weigert Accommodatie', adres: null })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('voegt een listing toe met 12 nulmeting-rijen op 0', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const result = await voegAccommodatieToe({ clientId, naam: 'Nieuwe Accommodatie', adres: 'Teststraat 5' });

    const { data: listing } = await admin.from('listings').select('*').eq('id', result.listingId).single();
    expect(listing!.naam).toBe('Nieuwe Accommodatie');
    expect(listing!.adres).toBe('Teststraat 5');
    expect(listing!.client_id).toBe(clientId);

    const { data: nulmeting } = await admin.from('nulmeting').select('*').eq('listing_id', result.listingId);
    expect(nulmeting).toHaveLength(12);
    expect(nulmeting!.every((rij) => rij.omzet === 0 && rij.bezetting === 0)).toBe(true);
  });

  it('werkt ook voor een klant met al bestaande accommodaties', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await voegAccommodatieToe({ clientId, naam: 'Eerste', adres: null });
    await voegAccommodatieToe({ clientId, naam: 'Tweede', adres: null });

    const { data: listings } = await admin.from('listings').select('id').eq('client_id', clientId);
    expect(listings!.length).toBeGreaterThanOrEqual(2);
  });
});
