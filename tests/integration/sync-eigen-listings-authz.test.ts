import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// Simuleert twee klanten: klant A heeft een niet-gekoppelde listing (dus syncEigenListings
// moet netjes "geen gekoppelde accommodaties" teruggeven, geen crash of data van klant B).
vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return { ...actual, fetchReservationData: vi.fn().mockResolvedValue([]) };
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

const { syncEigenListings } = await import('@/app/[locale]/dashboard/actions');

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

let clientAId: string;
let klantAUserId: string;
let klantAEmail: string;

beforeAll(async () => {
  const suffix = Date.now();
  klantAEmail = `sync-authz-klant-a-${suffix}@test.local`;

  const { data: clientA } = await admin
    .from('clients')
    .insert({ naam: 'Sync Authz Klant A', email: klantAEmail })
    .select()
    .single();
  clientAId = clientA!.id;

  // Niet-gekoppelde listing — pricelabs_listing_id blijft null.
  await admin.from('listings').insert({ client_id: clientAId, naam: 'Ongekoppelde Listing' });

  const { data: userA } = await admin.auth.admin.createUser({
    email: klantAEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantAUserId = userA!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantAUserId, role: 'klant', client_id: clientAId, email: klantAEmail, naam: 'Klant A' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientAId);
  await admin.auth.admin.deleteUser(klantAUserId);
});

describe('syncEigenListings', () => {
  it('geeft een duidelijke fout als de klant geen gekoppelde accommodaties heeft', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);

    const resultaat = await syncEigenListings();

    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Geen aan PriceLabs gekoppelde accommodaties gevonden.');
  });

  it('weigert een niet-ingelogde aanroep', async () => {
    activeCookieStore = new Map();

    const resultaat = await syncEigenListings();

    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Niet ingelogd.');
  });
});
