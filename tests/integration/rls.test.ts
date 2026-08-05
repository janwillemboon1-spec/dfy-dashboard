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

  const { data: klantBListing } = await admin
    .from('listings')
    .insert({ client_id: clientBId, naam: 'Klant B Listing' })
    .select()
    .single();
  klantBListingId = klantBListing!.id;

  await admin
    .from('monthly_actuals')
    .insert({ listing_id: klantBListingId, jaar: 2025, maand: 1, omzet: 1000, bezetting: 50 });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientAId);
  await admin.from('clients').delete().eq('id', clientBId);
  await admin.auth.admin.deleteUser(klantBUserId);
});

describe('RLS: klant-isolatie', () => {
  it('klant B kan client A niet zien', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const { data } = await klantClient.from('clients').select('*').eq('id', clientAId);
    expect(data).toEqual([]);
  });

  it('klant B kan de pricelabs_listings_cache niet lezen', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const { data, error } = await klantClient.from('pricelabs_listings_cache').select('*');
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it('klant B kan monthly_actuals niet lezen, ook niet voor de eigen listing', async () => {
    const klantClient = createClient(url, anonKey);
    await klantClient.auth.signInWithPassword({ email: klantBEmail, password: klantBWachtwoord });

    const { data, error } = await klantClient
      .from('monthly_actuals')
      .select('*')
      .eq('listing_id', klantBListingId);
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });
});
