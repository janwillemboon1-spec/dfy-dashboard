import { describe, it, expect, afterEach } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClientWithListings, OnboardingError } from '@/lib/onboarding/create-client-with-listings';

const admin = createAdminClient();

const geldigeInput = {
  naam: 'Test Klant',
  email: `test-${Date.now()}@voorbeeld.nl`,
  telefoon: '0612345678',
  accommodaties: [
    {
      naam: 'Testhuisje',
      adres: 'Teststraat 1',
      nulmeting: Array.from({ length: 12 }, (_, i) => ({
        jaar: 2025,
        maand: i + 1,
        omzet: 1000 + i * 10,
        bezetting: 50,
      })),
    },
  ],
  honeypot: '',
};

let aangemaakteClientId: string | undefined;

afterEach(async () => {
  if (aangemaakteClientId) {
    await admin.from('clients').delete().eq('id', aangemaakteClientId);
    aangemaakteClientId = undefined;
  }
});

describe('createClientWithListings', () => {
  it('maakt client, listing, nulmeting, auth user en profiel aan', async () => {
    const result = await createClientWithListings(geldigeInput);
    aangemaakteClientId = result.clientId;

    const { data: client } = await admin.from('clients').select('*').eq('id', result.clientId).single();
    expect(client?.email).toBe(geldigeInput.email);

    const { data: listings } = await admin.from('listings').select('*').eq('client_id', result.clientId);
    expect(listings).toHaveLength(1);

    const { data: nulmeting } = await admin.from('nulmeting').select('*').eq('listing_id', listings![0].id);
    expect(nulmeting).toHaveLength(12);

    const { data: profile } = await admin.from('profiles').select('*').eq('client_id', result.clientId).single();
    expect(profile?.role).toBe('klant');

    await admin.auth.admin.deleteUser(profile!.id);
  });

  it('wijst een dubbel e-mailadres af zonder een tweede client aan te maken', async () => {
    const eersteInput = { ...geldigeInput, email: `dubbel-${Date.now()}@voorbeeld.nl` };
    const eersteResult = await createClientWithListings(eersteInput);
    aangemaakteClientId = eersteResult.clientId;

    await expect(createClientWithListings(eersteInput)).rejects.toThrow(OnboardingError);

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('client_id', eersteResult.clientId)
      .single();
    await admin.auth.admin.deleteUser(profile!.id);
  });
});
