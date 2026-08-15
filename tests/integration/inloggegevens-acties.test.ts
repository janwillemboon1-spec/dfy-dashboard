import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/email/send-admin-notificatie-nieuw-inloggegeven', () => ({
  sendAdminNotificatieNieuwInloggegeven: vi.fn().mockResolvedValue(undefined),
}));

let activeCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(activeCookieStore.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      activeCookieStore.set(name, value);
    },
  }),
}));

process.env.INLOGGEGEVENS_SLEUTEL = Buffer.alloc(32, 9).toString('base64');

const { voegInloggegevenToe, wijzigInloggegeven, verwijderInloggegeven, onthulWachtwoord } = await import(
  '@/lib/inloggegevens/acties'
);

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

let adminEmail: string;
let adminUserId: string;
let klantAClientId: string;
let klantAEmail: string;
let klantAUserId: string;
let klantBClientId: string;
let klantBEmail: string;
let klantBUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  adminEmail = `inloggegevens-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  const { data: klantA } = await admin
    .from('clients')
    .insert({ naam: 'Klant A', email: `inloggegevens-klant-a-${suffix}@test.local` })
    .select()
    .single();
  klantAClientId = klantA!.id;
  klantAEmail = `inloggegevens-klant-a-${suffix}@test.local`;
  const { data: klantAUserRes } = await admin.auth.admin.createUser({
    email: klantAEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantAUserId = klantAUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantAUserId, role: 'klant', client_id: klantAClientId, email: klantAEmail, naam: 'Klant A' });

  const { data: klantB } = await admin
    .from('clients')
    .insert({ naam: 'Klant B', email: `inloggegevens-klant-b-${suffix}@test.local` })
    .select()
    .single();
  klantBClientId = klantB!.id;
  klantBEmail = `inloggegevens-klant-b-${suffix}@test.local`;
  const { data: klantBUserRes } = await admin.auth.admin.createUser({
    email: klantBEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantBUserId = klantBUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantBUserId, role: 'klant', client_id: klantBClientId, email: klantBEmail, naam: 'Klant B' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', klantAClientId);
  await admin.from('clients').delete().eq('id', klantBClientId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(klantAUserId);
  await admin.auth.admin.deleteUser(klantBUserId);
});

describe('inloggegevens-acties', () => {
  it('klant A maakt een item aan, ziet het, en kan het wachtwoord onthullen', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);

    await voegInloggegevenToe({
      naam: 'Airbnb',
      gebruikersnaam: 'jan@voorbeeld.nl',
      wachtwoord: 'geheim-airbnb-wachtwoord',
      notitie: null,
    });

    const { data: items } = await admin.from('inloggegevens').select('*').eq('client_id', klantAClientId);
    expect(items).toHaveLength(1);
    expect(items![0].wachtwoord_versleuteld).not.toBe('geheim-airbnb-wachtwoord');

    const resultaat = await onthulWachtwoord({ id: items![0].id });
    expect(resultaat.succes).toBe(true);
    expect(resultaat.wachtwoord).toBe('geheim-airbnb-wachtwoord');
  });

  it('klant B kan het item van klant A niet zien of onthullen', async () => {
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    activeCookieStore = await loginAlsCookieStore(klantBEmail, wachtwoord);

    const resultaat = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Item niet gevonden.');

    await expect(
      wijzigInloggegeven({ id: itemVanA!.id, naam: 'Gekaapt', gebruikersnaam: null, wachtwoord: '', notitie: null })
    ).rejects.toThrow('Kon dit item niet vinden');
  });

  it('admin kan het item van klant A lezen en onthullen', async () => {
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const resultaat = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaat.succes).toBe(true);
    expect(resultaat.wachtwoord).toBe('geheim-airbnb-wachtwoord');
  });

  it('admin kan geen inloggegeven aanmaken namens een klant', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await expect(
      voegInloggegevenToe({ naam: 'Test', gebruikersnaam: null, wachtwoord: 'x', notitie: null })
    ).rejects.toThrow('Geen account gevonden.');
  });

  it('klant A kan een item bewerken; leeg wachtwoordveld behoudt het bestaande wachtwoord', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    await wijzigInloggegeven({
      id: itemVanA!.id,
      naam: 'Airbnb (bijgewerkt)',
      gebruikersnaam: 'jan@voorbeeld.nl',
      wachtwoord: '',
      notitie: 'geen wijziging aan wachtwoord',
    });

    const resultaat = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaat.wachtwoord).toBe('geheim-airbnb-wachtwoord');

    await wijzigInloggegeven({
      id: itemVanA!.id,
      naam: 'Airbnb (bijgewerkt)',
      gebruikersnaam: 'jan@voorbeeld.nl',
      wachtwoord: 'nieuw-wachtwoord',
      notitie: null,
    });

    const resultaatNa = await onthulWachtwoord({ id: itemVanA!.id });
    expect(resultaatNa.wachtwoord).toBe('nieuw-wachtwoord');
  });

  it('klant A kan het item verwijderen', async () => {
    activeCookieStore = await loginAlsCookieStore(klantAEmail, wachtwoord);
    const { data: itemVanA } = await admin.from('inloggegevens').select('id').eq('client_id', klantAClientId).single();

    await verwijderInloggegeven({ id: itemVanA!.id });

    const { data: itemsNa } = await admin.from('inloggegevens').select('*').eq('client_id', klantAClientId);
    expect(itemsNa).toEqual([]);
  });
});
