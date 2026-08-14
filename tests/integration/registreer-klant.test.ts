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

  it('rolt de client terug wanneer het aanmaken van de auth user faalt', async () => {
    const email = `registratie-rollback-${Date.now()}@voorbeeld.nl`;
    const input = { ...geldigeInput, email };

    // Maak alvast een "kale" auth user aan met hetzelfde e-mailadres (zonder client/profiel),
    // zodat de auth.admin.createUser()-call binnen registreerKlant faalt op een dubbel
    // e-mailadres. Dit forceert het catch-blok en dus de delete_client_cascade-rollback,
    // zonder de Supabase-client te mocken (conform de conventie van dit testbestand).
    const { data: vooraf, error: voorafError } = await admin.auth.admin.createUser({
      email,
      password: geldigeInput.wachtwoord,
      email_confirm: true,
    });
    expect(voorafError).toBeNull();

    try {
      await expect(registreerKlant(input)).rejects.toThrow(RegistratieError);

      const { data: client } = await admin.from('clients').select('id').eq('email', email).maybeSingle();
      expect(client).toBeNull();
    } finally {
      await admin.auth.admin.deleteUser(vooraf!.user!.id);
    }
  });
});
