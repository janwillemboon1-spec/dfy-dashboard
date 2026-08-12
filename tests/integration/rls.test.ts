import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey);

const klantBEmail = 'klant-b@test.local';
const klantBWachtwoord = 'test-wachtwoord-1234';
let clientAId: string;
let clientBId: string;
let klantBUserId: string;
let klantAListingId: string;
let klantBListingId: string;

beforeAll(async () => {
  const { data: clientA } = await admin
    .from('clients')
    .insert({ naam: 'Klant A', email: 'klant-a@test.local' })
    .select()
    .single();
  clientAId = clientA!.id;

  const { data: clientB } = await admin
    .from('clients')
    .insert({ naam: 'Klant B', email: klantBEmail })
    .select()
    .single();
  clientBId = clientB!.id;

  const { data: userB } = await admin.auth.admin.createUser({
    email: klantBEmail,
    email_confirm: true,
    password: klantBWachtwoord,
  });
  klantBUserId = userB!.user!.id;

  await admin.from('profiles').insert({
    id: klantBUserId,
    role: 'klant',
    client_id: clientBId,
    email: klantBEmail,
    naam: 'Klant B',
  });

  const { data: klantAListing } = await admin
    .from('listings')
    .insert({ client_id: clientAId, naam: 'Klant A Listing' })
    .select()
    .single();
  klantAListingId = klantAListing!.id;

  await admin
    .from('monthly_actuals')
    .insert({ listing_id: klantAListingId, jaar: 2025, maand: 1, omzet: 5000, bezetting: 80 });

  const { data: klantBListing } = await admin
    .from('listings')
    .insert({ client_id: clientBId, naam: 'Klant B Listing', pricelabs_listing_id: 'pl-rls-test-eigen' })
    .select()
    .single();
  klantBListingId = klantBListing!.id;

  await admin
    .from('monthly_actuals')
    .insert({ listing_id: klantBListingId, jaar: 2025, maand: 1, omzet: 1000, bezetting: 50 });

  // Eén cache-rij die hoort bij klant B's eigen koppeling, en één die nergens aan
  // gekoppeld is (simuleert een andere klant se listing in dezelfde gedeelde cache).
  await admin
    .from('pricelabs_listings_cache')
    .insert({ pricelabs_listing_id: 'pl-rls-test-eigen', naam: 'Eigen PL-listing', pms: 'hostaway' });
  await admin
    .from('pricelabs_listings_cache')
    .insert({ pricelabs_listing_id: 'pl-rls-test-ander', naam: 'Andermans PL-listing', pms: 'hostaway' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientAId);
  await admin.from('clients').delete().eq('id', clientBId);
  await admin.auth.admin.deleteUser(klantBUserId);
  await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', 'pl-rls-test-eigen');
  await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', 'pl-rls-test-ander');
});

describe('RLS: klant-isolatie', () => {
  it('klant B kan client A niet zien', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const { data } = await klantClient.from('clients').select('*').eq('id', clientAId);
    expect(data).toEqual([]);
  });

  it('klant B kan de gegevens van client A niet wijzigen', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    await klantClient.from('clients').update({ naam: 'Gehackt' }).eq('id', clientAId);

    const { data } = await admin.from('clients').select('naam').eq('id', clientAId).single();
    expect(data!.naam).toBe('Klant A');
  });

  it('klant B leest alleen de pricelabs_listings_cache-rij van de eigen koppeling, niet de rest van de cache', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const eigen = await klantClient
      .from('pricelabs_listings_cache')
      .select('*')
      .eq('pricelabs_listing_id', 'pl-rls-test-eigen');
    expect(eigen.error).toBeNull();
    expect(eigen.data).toHaveLength(1);
    expect(eigen.data![0]).toMatchObject({ pricelabs_listing_id: 'pl-rls-test-eigen', pms: 'hostaway' });

    const ander = await klantClient
      .from('pricelabs_listings_cache')
      .select('*')
      .eq('pricelabs_listing_id', 'pl-rls-test-ander');
    expect(ander.data).toEqual([]);
    expect(ander.error).toBeNull();
  });

  it('klant B kan monthly_actuals voor de eigen listing lezen, sinds de Fase 2b-koppeling', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const { data, error } = await klantClient
      .from('monthly_actuals')
      .select('*')
      .eq('listing_id', klantBListingId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ listing_id: klantBListingId, omzet: 1000 });
  });

  it('klant B kan monthly_actuals van klant A niet lezen', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const { data, error } = await klantClient
      .from('monthly_actuals')
      .select('*')
      .eq('listing_id', klantAListingId);
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it('klant B kan geen pricelabs_reserveringen_cache voor een andere klant lezen, wel de eigen', async () => {
    await admin.from('pricelabs_reserveringen_cache').insert({
      listing_id: klantBListingId,
      reservation_id: 'rls-test-1',
      check_in: '2025-01-10',
      check_out: '2025-01-12',
      rental_revenue: 500,
      no_of_days: 2,
      booking_status: 'booked',
    });

    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const eigen = await klantClient
      .from('pricelabs_reserveringen_cache')
      .select('*')
      .eq('listing_id', klantBListingId);
    expect(eigen.data).toHaveLength(1);

    const vanKlantA = await klantClient
      .from('pricelabs_reserveringen_cache')
      .select('*')
      .eq('listing_id', klantAListingId);
    expect(vanKlantA.data).toEqual([]);
  });

  it('klant B kan niet rechtstreeks schrijven naar pricelabs_reserveringen_cache', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const { error } = await klantClient.from('pricelabs_reserveringen_cache').insert({
      listing_id: klantBListingId,
      reservation_id: 'rls-test-2',
      check_in: '2025-01-10',
      check_out: '2025-01-12',
      rental_revenue: 500,
      no_of_days: 2,
      booking_status: 'booked',
    });
    // Geen policy staat insert voor de klant-rol toe (alleen "for select"), dus dit
    // faalt op RLS — een lege of ontbrekende policy voor het gevraagde command
    // resulteert in een Postgres-foutmelding, niet in stilzwijgend niets doen.
    expect(error).not.toBeNull();
  });
});
