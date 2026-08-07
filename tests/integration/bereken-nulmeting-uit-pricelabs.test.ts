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

  // Bestaande nulmeting voor januari 2026 — moet volledig overschreven worden door de
  // berekening (januari 2026 valt binnen het rollende venster voor start = maart 2026).
  await admin
    .from('nulmeting')
    .insert({ listing_id: listingId, jaar: 2026, maand: 1, omzet: 999, bezetting: 99 });

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

  it('berekent en overschrijft de nulmeting op basis van het rollende 12-maandsvenster', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    // start = maart 2026 → venster = maart 2025 t/m februari 2026 (bepaalNulmetingBronnen).
    // Cache-data die de berekening moet gebruiken, aangeleverd via de (gemockte)
    // PriceLabs-fetch i.p.v. rechtstreeks in de cache voor-geïnsert: berekenNulmetingUitPricelabs
    // synct eerst (syncListingReserveringen), en die sync ruimt sinds de reconcile-fix
    // alles binnen het opgevraagde venster op vóórdat de verse fetch wordt weggeschreven —
    // rechtstreeks voor-geïnsette rijen zouden dus alweer verdwenen zijn vóórdat de
    // nulmeting-berekening ze zou kunnen gebruiken.
    // - januari 2026 (binnen het venster): 1 reservering, omzet 500.
    // - mei 2025 (binnen het venster): 1 reservering, omzet 800.
    // - maart 2025 (oudste maand van het venster) blijft bewust leeg, om de
    //   'leeg: true'-markering te testen.
    vi.mocked(fetchReservationData).mockResolvedValueOnce([
      {
        reservation_id: `nulmeting-jan2026-${listingId}`,
        check_in: '2026-01-10',
        check_out: '2026-01-12',
        rental_revenue: '500',
        total_cost: null,
        no_of_days: 2,
        booking_status: 'booked',
        booking_channel: null,
      },
      {
        reservation_id: `nulmeting-mei2025-${listingId}`,
        check_in: '2025-05-10',
        check_out: '2025-05-12',
        rental_revenue: '800',
        total_cost: null,
        no_of_days: 2,
        booking_status: 'booked',
        booking_channel: null,
      },
    ]);

    const resultaat = await berekenNulmetingUitPricelabs({
      listingId,
      clientId,
      samenwerkingGestart: '2026-03-15',
    });

    expect(resultaat.startJaar).toBe(2026);
    expect(resultaat.startMaand).toBe(3);
    expect(resultaat.maanden).toHaveLength(12);

    const januari2026 = resultaat.maanden.find((m) => m.jaar === 2026 && m.maand === 1)!;
    expect(januari2026.omzet).toBe(500);
    expect(januari2026.leeg).toBe(false);

    const maart2025 = resultaat.maanden.find((m) => m.jaar === 2025 && m.maand === 3)!;
    expect(maart2025.leeg).toBe(true);
    expect(maart2025.omzet).toBe(0);

    const mei2025 = resultaat.maanden.find((m) => m.jaar === 2025 && m.maand === 5)!;
    expect(mei2025.omzet).toBe(800);
    expect(mei2025.leeg).toBe(false);

    // Overschrijven geverifieerd: januari 2026 was 999/99, moet nu 500 zijn met lege
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

  it('ruimt een oude nulmeting-baseline die buiten het nieuwe venster valt volledig op', async () => {
    // Regressietest: een nulmeting-berekening vervangt altijd de VOLLEDIGE bestaande
    // baseline, ongeacht welk(e) kalenderjaar/jaren de oude baseline gebruikte. Dit dekt
    // zowel het geval "oude baseline spant twee kalenderjaren" (de oorspronkelijke bug bij
    // de finale whole-branch review) als "oude baseline heeft geen enkele overlap met het
    // nieuwe venster" (bv. een baseline van een heel ander jaar) — in beide gevallen mag er
    // na de berekening niets van de oude baseline overblijven.
    const suffix = `${Date.now()}-oude-baseline`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Oude-baseline Nulmeting Klant', email: `nulmeting-oude-baseline-${suffix}@test.local` })
      .select()
      .single();
    const oudeBaselineClientId = client!.id;

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: oudeBaselineClientId, naam: 'Oude-baseline Listing', pricelabs_listing_id: `pl-${suffix}` })
      .select()
      .single();
    const oudeBaselineListingId = listing!.id;

    await admin
      .from('pricelabs_listings_cache')
      .insert({ pricelabs_listing_id: `pl-${suffix}`, naam: 'PL Listing', pms: 'hostaway' });

    // Oude baseline: kalenderjaar 2023, volledig — overlapt niet met het nieuwe venster
    // (maart 2025 t/m februari 2026) voor start = maart 2026.
    const oudeBaseline = Array.from({ length: 12 }, (_, i) => ({
      listing_id: oudeBaselineListingId,
      jaar: 2023,
      maand: i + 1,
      omzet: 100,
      bezetting: 10,
    }));
    await admin.from('nulmeting').insert(oudeBaseline);

    const { data: adminUserRes } = await admin.auth.admin.createUser({
      email: `nulmeting-oude-baseline-admin-${suffix}@test.local`,
      email_confirm: true,
      password: wachtwoord,
    });
    const oudeBaselineAdminUserId = adminUserRes!.user!.id;
    await admin.from('profiles').insert({
      id: oudeBaselineAdminUserId,
      role: 'admin',
      email: `nulmeting-oude-baseline-admin-${suffix}@test.local`,
      naam: 'Admin',
    });

    try {
      activeCookieStore = await loginAlsCookieStore(`nulmeting-oude-baseline-admin-${suffix}@test.local`, wachtwoord);

      await berekenNulmetingUitPricelabs({
        listingId: oudeBaselineListingId,
        clientId: oudeBaselineClientId,
        samenwerkingGestart: '2026-03-15',
      });

      const { data: alleRijen } = await admin
        .from('nulmeting')
        .select('jaar, maand')
        .eq('listing_id', oudeBaselineListingId);

      // Precies 12 rijen over, allemaal binnen het nieuwe venster (maart 2025 t/m
      // februari 2026) — geen enkele rij meer van de oude 2023-baseline.
      expect(alleRijen).toHaveLength(12);
      expect(alleRijen!.some((r) => r.jaar === 2023)).toBe(false);
      const sleutels = alleRijen!.map((r) => `${r.jaar}-${r.maand}`).sort();
      expect(sleutels).toEqual([
        '2025-10', '2025-11', '2025-12', '2025-3', '2025-4', '2025-5',
        '2025-6', '2025-7', '2025-8', '2025-9', '2026-1', '2026-2',
      ].sort());
    } finally {
      await admin.from('clients').delete().eq('id', oudeBaselineClientId);
      await admin.auth.admin.deleteUser(oudeBaselineAdminUserId);
      await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', `pl-${suffix}`);
    }
  });

  it('prorateert een reservering die twee bronmaanden overschrijdt', async () => {
    // Regressietest voor de maandgrens-proratie-fix: een boeking die start in december
    // 2025 en doorloopt tot in januari 2026 (beide binnen het venster voor start = maart
    // 2026) moet zijn nachten/omzet naar rato over beide maanden verdelen i.p.v. volledig
    // aan december (de incheckmaand) toegekend te worden.
    const suffix = `${Date.now()}-maandgrens`;

    const { data: client } = await admin
      .from('clients')
      .insert({ naam: 'Maandgrens Nulmeting Klant', email: `nulmeting-maandgrens-${suffix}@test.local` })
      .select()
      .single();
    const maandgrensClientId = client!.id;

    const { data: listing } = await admin
      .from('listings')
      .insert({ client_id: maandgrensClientId, naam: 'Maandgrens Listing', pricelabs_listing_id: `pl-${suffix}` })
      .select()
      .single();
    const maandgrensListingId = listing!.id;

    await admin
      .from('pricelabs_listings_cache')
      .insert({ pricelabs_listing_id: `pl-${suffix}`, naam: 'PL Listing', pms: 'hostaway' });

    const { data: adminUserRes } = await admin.auth.admin.createUser({
      email: `nulmeting-maandgrens-admin-${suffix}@test.local`,
      email_confirm: true,
      password: wachtwoord,
    });
    const maandgrensAdminUserId = adminUserRes!.user!.id;
    await admin.from('profiles').insert({
      id: maandgrensAdminUserId,
      role: 'admin',
      email: `nulmeting-maandgrens-admin-${suffix}@test.local`,
      naam: 'Admin',
    });

    try {
      activeCookieStore = await loginAlsCookieStore(`nulmeting-maandgrens-admin-${suffix}@test.local`, wachtwoord);

      // 2025-12-25 t/m 2026-01-05: 11 nachten totaal, waarvan 7 in december 2025
      // (25 t/m 31) en 4 in januari 2026 (1 t/m 4), à €100/nacht (rental_revenue 1100).
      vi.mocked(fetchReservationData).mockResolvedValueOnce([
        {
          reservation_id: `nulmeting-maandgrens-${maandgrensListingId}`,
          check_in: '2025-12-25',
          check_out: '2026-01-05',
          rental_revenue: '1100',
          total_cost: null,
          no_of_days: 11,
          booking_status: 'booked',
          booking_channel: null,
        },
      ]);

      const resultaat = await berekenNulmetingUitPricelabs({
        listingId: maandgrensListingId,
        clientId: maandgrensClientId,
        samenwerkingGestart: '2026-03-15',
      });

      const december2025 = resultaat.maanden.find((m) => m.jaar === 2025 && m.maand === 12)!;
      expect(december2025.omzet).toBeCloseTo(700, 5); // 7/11 * 1100
      expect(december2025.leeg).toBe(false);

      const januari2026 = resultaat.maanden.find((m) => m.jaar === 2026 && m.maand === 1)!;
      expect(januari2026.omzet).toBeCloseTo(400, 5); // 4/11 * 1100
      expect(januari2026.leeg).toBe(false);
    } finally {
      await admin.from('clients').delete().eq('id', maandgrensClientId);
      await admin.auth.admin.deleteUser(maandgrensAdminUserId);
      await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', `pl-${suffix}`);
    }
  });
});
