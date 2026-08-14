import { describe, it, expect, afterEach, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { registreerKlant, RegistratieError } from '@/lib/registratie/registreer-klant';

vi.mock('@/lib/email/send-admin-notificatie-nieuwe-klant', () => ({
  sendAdminNotificatieNieuweKlant: vi.fn().mockResolvedValue(undefined),
}));

import { sendAdminNotificatieNieuweKlant } from '@/lib/email/send-admin-notificatie-nieuwe-klant';

const admin = createAdminClient();

const geldigeInput = {
  naam: 'Test Klant',
  email: `registratie-${Date.now()}@voorbeeld.nl`,
  telefoon: '0612345678',
  wachtwoord: 'geheimwachtwoord123',
  wachtwoordBevestiging: 'geheimwachtwoord123',
  honeypot: '',
};

let aangemaakteClientId: string | undefined;

afterEach(async () => {
  if (aangemaakteClientId) {
    await admin.from('clients').delete().eq('id', aangemaakteClientId);
    aangemaakteClientId = undefined;
  }
});

describe('registreerKlant', () => {
  it('maakt client (zelf_geregistreerd), auth user en profiel aan, zonder listings', async () => {
    const input = { ...geldigeInput, email: `registratie-${Date.now()}@voorbeeld.nl` };
    const result = await registreerKlant(input);
    aangemaakteClientId = result.clientId;

    const { data: client } = await admin.from('clients').select('*').eq('id', result.clientId).single();
    expect(client?.email).toBe(input.email);
    expect(client?.zelf_geregistreerd).toBe(true);
    expect(client?.status).toBe('onboarding');

    const { data: listings } = await admin.from('listings').select('*').eq('client_id', result.clientId);
    expect(listings).toEqual([]);

    const { data: profile } = await admin.from('profiles').select('*').eq('client_id', result.clientId).single();
    expect(profile?.role).toBe('klant');

    await admin.auth.admin.deleteUser(profile!.id);
  });

  it('wijst een dubbel e-mailadres af zonder een tweede client aan te maken', async () => {
    const eersteInput = { ...geldigeInput, email: `registratie-dubbel-${Date.now()}@voorbeeld.nl` };
    const eersteResult = await registreerKlant(eersteInput);
    aangemaakteClientId = eersteResult.clientId;

    await expect(registreerKlant(eersteInput)).rejects.toThrow(RegistratieError);

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('client_id', eersteResult.clientId)
      .single();
    await admin.auth.admin.deleteUser(profile!.id);
  });

  it('rolt de client en de auth user niet terug wanneer alleen de notificatiemail mislukt', async () => {
    const email = `registratie-notificatie-${Date.now()}@voorbeeld.nl`;
    const input = { ...geldigeInput, email };

    vi.mocked(sendAdminNotificatieNieuweKlant).mockRejectedValueOnce(new Error('SMTP timeout (test)'));

    const result = await registreerKlant(input);
    aangemaakteClientId = result.clientId;

    const { data: client } = await admin.from('clients').select('id').eq('email', email).maybeSingle();
    expect(client).not.toBeNull();

    const { data: profile } = await admin.from('profiles').select('id').eq('client_id', result.clientId).single();
    expect(profile).not.toBeNull();
    await admin.auth.admin.deleteUser(profile!.id);
  });
});
