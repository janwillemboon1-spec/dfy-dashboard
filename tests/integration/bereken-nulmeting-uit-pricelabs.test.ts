import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return { ...actual, fetchReservationData: vi.fn().mockResolvedValue([]) };
});

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

const { berekenNulmetingUitPricelabs } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
let listingId: string;
let listingZonderKoppelingId: string;
let adminUserId: string;
let adminEmail: string;
let klantUserId: string;
let klantEmail: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Nulmeting-uit-Pricelabs Klant', email: `nulmeting-pricelabs-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  const { data: listing } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Gekoppelde Listing', pricelabs_listing_id: `pl-nulmeting-${suffix}` })
    .select()
    .single();
  listingId = listing!.id;

  await admin
    .from('pricelabs_listings_cache')
    .insert({ pricelabs_listing_id: `pl-nulmeting-${suffix}`, naam: 'PL Listing', pms: 'hostaway' });

  const { data: listingZonderKoppeling } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Niet-gekoppelde Listing' })
    .select()
    .single();
  listingZonderKoppelingId = listingZonderKoppeling!.id;

  // Bestaande nulmeting voor januari 2026 (jaar van het startjaar) — moet volledig
  // overschreven worden door de berekening.
  await admin
    .from('nulmeting')
    .insert({ listing_id: listingId, jaar: 2026, maand: 1, omzet: 999, bezetting: 99 });

  // Cache-data die de berekening moet gebruiken:
  // - januari 2026 (echt, want startmaand = maart): 1 reservering, omzet 500.
  // - mei 2025 (STLY-bron voor mei 2026, want mei > startmaand maart): 1 reservering, omzet 800.
  // - maart 2026 blijft bewust leeg, om de 'leeg: true'-markering te testen.
  await admin.from('pricelabs_reserveringen_cache').insert([
    {
      listing_id: listingId,
      reservation_id: `nulmeting-echt-${suffix}`,
      check_in: '2026-01-10',
      check_out: '2026-01-12',
      rental_revenue: 500,
      no_of_days: 2,
      booking_status: 'booked',
    },
    {
      listing_id: listingId,
      reservation_id: `nulmeting-stly-${suffix}`,
      check_in: '2025-05-10',
      check_out: '2025-05-12',
      rental_revenue: 800,
      no_of_days: 2,
      booking_status: 'booked',
    },
  ]);

  adminEmail = `nulmeting-pricelabs-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `nulmeting-pricelabs-klant-${suffix}@test.local`;
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
  await admin.from('pricelabs_listings_cache').delete().like('pricelabs_listing_id', 'pl-nulmeting-%');
});

describe('berekenNulmetingUitPricelabs', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      berekenNulmetingUitPricelabs({ listingId, clientId, samenwerkingGestart: '2026-03-15' })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een accommodatie die nog niet aan PriceLabs is gekoppeld', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      berekenNulmetingUitPricelabs({
        listingId: listingZonderKoppelingId,
        clientId,
        samenwerkingGestart: '2026-03-15',
      })
    ).rejects.toThrow('Koppel eerst deze accommodatie aan PriceLabs.');
  });

  it('berekent en overschrijft de nulmeting op basis van echt/STLY per maand', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const resultaat = await berekenNulmetingUitPricelabs({
      listingId,
      clientId,
      samenwerkingGestart: '2026-03-15',
    });

    expect(resultaat.jaar).toBe(2026);
    expect(resultaat.maanden).toHaveLength(12);

    const januari = resultaat.maanden.find((m) => m.maand === 1)!;
    expect(januari.bron).toBe('echt');
    expect(januari.omzet).toBe(500);
    expect(januari.leeg).toBe(false);

    const maart = resultaat.maanden.find((m) => m.maand === 3)!;
    expect(maart.bron).toBe('echt');
    expect(maart.leeg).toBe(true);
    expect(maart.omzet).toBe(0);

    const mei = resultaat.maanden.find((m) => m.maand === 5)!;
    expect(mei.bron).toBe('stly');
    expect(mei.omzet).toBe(800);
    expect(mei.leeg).toBe(false);

    // Overschrijven geverifieerd: januari was 999/99, moet nu 500 zijn met lege
    // correctie-velden (verse berekening, geen handmatige correctie).
    const { data: nulmetingRij } = await admin
      .from('nulmeting')
      .select('*')
      .eq('listing_id', listingId)
      .eq('jaar', 2026)
      .eq('maand', 1)
      .single();
    expect(nulmetingRij!.omzet).toBe(500);
    expect(nulmetingRij!.laatst_gecorrigeerd_op).toBeNull();
    expect(nulmetingRij!.correctie_reden).toBeNull();

    // samenwerking_gestart is opgeslagen op de listing.
    const { data: listingRij } = await admin
      .from('listings')
      .select('samenwerking_gestart')
      .eq('id', listingId)
      .single();
    expect(listingRij!.samenwerking_gestart).toBe('2026-03-15');

    // Actielog-regel is toegevoegd.
    const { data: logRijen } = await admin
      .from('action_log')
      .select('*')
      .eq('listing_id', listingId)
      .eq('type', 'nulmeting_berekend');
    expect(logRijen).toHaveLength(1);
  });
});
