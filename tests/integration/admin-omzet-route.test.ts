import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

const { GET } = await import('@/app/api/admin/klanten/[id]/omzet/route');

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

// GET() gebruikt van het request-object alleen request.url — een echte NextRequest
// instantiëren zou hier alleen onnodige complexiteit toevoegen; een minimaal object met
// enkel .url volstaat en is type-veilig via een cast.
function verzoek(clientId: string, query: string) {
  const request = { url: `http://localhost/api/admin/klanten/${clientId}/omzet${query}` } as NextRequest;
  return GET(request, { params: Promise.resolve({ id: clientId }) });
}

let clientAId: string;
let klantAEmail: string;
let klantAUserId: string;

let clientBId: string;

let clientCId: string;

let adminEmail: string;
let adminUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: clientA } = await admin
    .from('clients')
    .insert({ naam: 'Omzetroute Klant A', email: `omzetroute-a-${suffix}@test.local` })
    .select()
    .single();
  clientAId = clientA!.id;
  const { data: listingA } = await admin
    .from('listings')
    .insert({ client_id: clientAId, naam: 'Listing A' })
    .select()
    .single();
  await admin.from('pricelabs_reserveringen_cache').insert({
    listing_id: listingA!.id,
    reservation_id: `res-a-${suffix}`,
    check_in: '2026-01-01',
    check_out: '2026-01-04',
    rental_revenue: 300,
    no_of_days: 3,
    booking_status: 'booked',
  });

  const { data: clientB } = await admin
    .from('clients')
    .insert({ naam: 'Omzetroute Klant B', email: `omzetroute-b-${suffix}@test.local` })
    .select()
    .single();
  clientBId = clientB!.id;
  const { data: listingB } = await admin
    .from('listings')
    .insert({ client_id: clientBId, naam: 'Listing B' })
    .select()
    .single();
  await admin.from('pricelabs_reserveringen_cache').insert({
    listing_id: listingB!.id,
    reservation_id: `res-b-${suffix}`,
    check_in: '2026-01-01',
    check_out: '2026-01-04',
    rental_revenue: 900,
    no_of_days: 3,
    booking_status: 'booked',
  });

  const { data: clientC } = await admin
    .from('clients')
    .insert({ naam: 'Omzetroute Klant C (geen listings)', email: `omzetroute-c-${suffix}@test.local` })
    .select()
    .single();
  clientCId = clientC!.id;

  klantAEmail = `omzetroute-klant-a-${suffix}@test.local`;
  const { data: klantAUserRes } = await admin.auth.admin.createUser({
    email: klantAEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantAUserId = klantAUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantAUserId, role: 'klant', client_id: clientAId, email: klantAEmail, naam: 'Klant A' });

  adminEmail = `omzetroute-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientAId);
  await admin.from('clients').delete().eq('id', clientBId);
  await admin.from('clients').delete().eq('id', clientCId);
  await admin.auth.admin.deleteUser(klantAUserId);
  await admin.auth.admin.deleteUser(adminUserId);
});

describe('GET /api/admin/klanten/[id]/omzet', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=2026-01-01&eind=2026-01-31&periodeType=eigen');
    expect(response.status).toBe(403);
  });

  it('weigert ontbrekende periode-params', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('start en eind zijn verplicht.');
  });

  it('weigert een ongeldig datumformaat', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=1-1-2026&eind=2026-01-31&periodeType=eigen');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('start en eind moeten het formaat JJJJ-MM-DD hebben.');
  });

  it('weigert start na eind', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=2026-02-01&eind=2026-01-01&periodeType=eigen');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('start mag niet na eind liggen.');
  });

  it('retourneert alleen omzetdata van de opgegeven client_id, geen lekkage van andere klanten', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientAId, '?start=2026-01-01&eind=2026-01-31&periodeType=eigen');
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.portfolio.omzet).toBe(300);
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0].listing_naam).toBe('Listing A');
  });

  it('geeft lege, geldige cijfers voor een klant zonder listings (geen .in() met een lege lijst)', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    const response = await verzoek(clientCId, '?start=2026-01-01&eind=2026-01-31&periodeType=eigen');
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.portfolio.omzet).toBe(0);
    expect(body.listings).toHaveLength(0);
  });
});
