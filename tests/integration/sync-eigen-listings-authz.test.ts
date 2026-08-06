import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// Simuleert twee klanten: klant A heeft een niet-gekoppelde listing (dus syncEigenListings
// moet netjes "geen gekoppelde accommodaties" teruggeven, geen crash of data van klant B).
// Klant B (toegevoegd na code review) heeft wél een gekoppelde listing, en wordt gebruikt om
// de eigenlijke geprivilegieerde schrijfpad — RLS-scoped ownership-bewijs -> service-role
// upsert — daadwerkelijk te testen, inclusief cross-tenant isolatie.
vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return { ...actual, fetchReservationData: vi.fn().mockResolvedValue([]) };
});

// revalidatePath vereist een echte Next.js request-scope die er niet is wanneer de
// server action rechtstreeks vanuit een test wordt aangeroepen — zelfde reden als de
// next/cache-mock in tests/integration/pricelabs-actions-authz.test.ts (Fase 2a).
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

const { syncEigenListings } = await import('@/app/[locale]/dashboard/actions');
const { fetchReservationData } = await import('@/lib/pricelabs/client');

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

let clientBId: string;
let klantBUserId: string;
let klantBEmail: string;
let klantBListingId: string;

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

  // Klant B: wél gekoppeld, met een nulmeting-maand (nodig om het backfill-vanaf te
  // bepalen) en een matchende pricelabs_listings_cache-rij (nodig voor de pms-lookup).
  klantBEmail = `sync-authz-klant-b-${suffix}@test.local`;
  const { data: clientB } = await admin
    .from('clients')
    .insert({ naam: 'Sync Authz Klant B', email: klantBEmail })
    .select()
    .single();
  clientBId = clientB!.id;

  const { data: klantBListing } = await admin
    .from('listings')
    .insert({ client_id: clientBId, naam: 'Gekoppelde Listing B', pricelabs_listing_id: `pl-sync-authz-${suffix}` })
    .select()
    .single();
  klantBListingId = klantBListing!.id;

  await admin.from('nulmeting').insert({ listing_id: klantBListingId, jaar: 2025, maand: 1, omzet: 1000, bezetting: 50 });
  await admin
    .from('pricelabs_listings_cache')
    .insert({ pricelabs_listing_id: `pl-sync-authz-${suffix}`, naam: 'PL Listing B', pms: 'hostaway' });

  const { data: userB } = await admin.auth.admin.createUser({
    email: klantBEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantBUserId = userB!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantBUserId, role: 'klant', client_id: clientBId, email: klantBEmail, naam: 'Klant B' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientAId);
  await admin.auth.admin.deleteUser(klantAUserId);
  await admin.from('clients').delete().eq('id', clientBId);
  await admin.auth.admin.deleteUser(klantBUserId);
  await admin.from('pricelabs_listings_cache').delete().like('pricelabs_listing_id', 'pl-sync-authz-%');
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

  it('synct alleen de eigen gekoppelde listing, en laat andermans data volledig ongemoeid', async () => {
    vi.mocked(fetchReservationData).mockResolvedValueOnce([
      {
        reservation_id: 'sync-authz-reservering-1',
        check_in: '2025-06-10',
        check_out: '2025-06-12',
        rental_revenue: '400',
        total_cost: '450',
        no_of_days: 2,
        booking_status: 'booked',
        booking_channel: 'airbnb',
      },
    ]);

    activeCookieStore = await loginAlsCookieStore(klantBEmail, wachtwoord);

    const resultaat = await syncEigenListings();

    expect(resultaat.succes).toBe(true);
    expect(resultaat.resultaten).toHaveLength(1);
    expect(resultaat.resultaten![0]).toMatchObject({ listingNaam: 'Gekoppelde Listing B', succes: true, aantal: 1 });

    // Het eigenlijke geprivilegieerde schrijfpad: de cache-rij bestaat écht, gekoppeld
    // aan klant B's listing_id.
    const { data: cacheRijen } = await admin
      .from('pricelabs_reserveringen_cache')
      .select('*')
      .eq('reservation_id', 'sync-authz-reservering-1');
    expect(cacheRijen).toHaveLength(1);
    expect(cacheRijen![0]).toMatchObject({ listing_id: klantBListingId, rental_revenue: 400 });

    // Cross-tenant isolatie: klant A's (niet-gekoppelde) listing kreeg geen enkele
    // cache-rij — de sync heeft uitsluitend klant B's eigen listing aangeraakt.
    const { data: klantAListings } = await admin.from('listings').select('id').eq('client_id', clientAId);
    const { data: klantACacheRijen } = await admin
      .from('pricelabs_reserveringen_cache')
      .select('*')
      .eq('listing_id', klantAListings![0].id);
    expect(klantACacheRijen).toEqual([]);

    await admin.from('pricelabs_reserveringen_cache').delete().eq('reservation_id', 'sync-authz-reservering-1');
  });

  it('haalt reserveringen minstens 2 jaar terug op, ook als de laatste nulmeting-maand recent is', async () => {
    // Regressietest voor een bug die in productie merkbaar was: de STLY-vergelijking
    // (Fase 2c) heeft reserveringsdata tot een jaar terug nodig, maar de backfill startte
    // altijd pas de maand ná de laatste nulmeting-maand. Bij een recente nulmeting (bv.
    // net onboarded) begon de sync dan pas een paar weken terug i.p.v. minstens 2 jaar,
    // waardoor STLY leeg bleef. Deze test zet een nulmeting-maand van vorige maand neer en
    // verifieert dat de daadwerkelijk opgevraagde startDate toch minstens ~2 jaar teruggaat.
    const suffix = `${Date.now()}-recent`;
    const nu = new Date();
    const vorigeMaand = nu.getUTCMonth() === 0
      ? { jaar: nu.getUTCFullYear() - 1, maand: 12 }
      : { jaar: nu.getUTCFullYear(), maand: nu.getUTCMonth() };

    const { data: clientC } = await admin
      .from('clients')
      .insert({ naam: 'Sync Authz Klant C', email: `sync-authz-klant-c-${suffix}@test.local` })
      .select()
      .single();
    const clientCId = clientC!.id;

    const { data: klantCListing } = await admin
      .from('listings')
      .insert({ client_id: clientCId, naam: 'Gekoppelde Listing C', pricelabs_listing_id: `pl-sync-authz-${suffix}` })
      .select()
      .single();
    const klantCListingId = klantCListing!.id;

    await admin.from('nulmeting').insert({
      listing_id: klantCListingId,
      jaar: vorigeMaand.jaar,
      maand: vorigeMaand.maand,
      omzet: 1000,
      bezetting: 50,
    });
    await admin
      .from('pricelabs_listings_cache')
      .insert({ pricelabs_listing_id: `pl-sync-authz-${suffix}`, naam: 'PL Listing C', pms: 'hostaway' });

    const klantCEmail = `sync-authz-klant-c-${suffix}@test.local`;
    const { data: userC } = await admin.auth.admin.createUser({
      email: klantCEmail,
      email_confirm: true,
      password: wachtwoord,
    });
    const klantCUserId = userC!.user!.id;
    await admin
      .from('profiles')
      .insert({ id: klantCUserId, role: 'klant', client_id: clientCId, email: klantCEmail, naam: 'Klant C' });

    try {
      vi.mocked(fetchReservationData).mockClear();
      vi.mocked(fetchReservationData).mockResolvedValueOnce([]);
      activeCookieStore = await loginAlsCookieStore(klantCEmail, wachtwoord);

      await syncEigenListings();

      expect(fetchReservationData).toHaveBeenCalledTimes(1);
      const aanroep = vi.mocked(fetchReservationData).mock.calls[0][0];
      const opgevraagdeStartDate = new Date(`${aanroep.startDate}T00:00:00Z`);
      const ietsMeerDan23MaandenTerug = new Date();
      ietsMeerDan23MaandenTerug.setUTCMonth(ietsMeerDan23MaandenTerug.getUTCMonth() - 23);
      expect(opgevraagdeStartDate.getTime()).toBeLessThanOrEqual(ietsMeerDan23MaandenTerug.getTime());
    } finally {
      await admin.from('clients').delete().eq('id', clientCId);
      await admin.auth.admin.deleteUser(klantCUserId);
      await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', `pl-sync-authz-${suffix}`);
    }
  });
});
