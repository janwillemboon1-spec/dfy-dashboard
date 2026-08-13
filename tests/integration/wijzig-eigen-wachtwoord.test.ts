import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

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

const { wijzigEigenWachtwoord } = await import('@/app/[locale]/dashboard/actions');

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
let klantEmail: string;
let klantUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  klantEmail = `wachtwoord-klant-${suffix}@test.local`;
  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Wachtwoord Klant', email: klantEmail })
    .select()
    .single();
  clientId = client!.id;

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
  await admin.auth.admin.deleteUser(klantUserId);
});

describe('wijzigEigenWachtwoord', () => {
  it('weigert een te kort nieuw wachtwoord', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenWachtwoord({ huidigWachtwoord: wachtwoord, nieuwWachtwoord: 'kort' });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Nieuw wachtwoord moet minimaal 6 tekens zijn.');
  });

  it('weigert een niet-ingelogde aanroep', async () => {
    activeCookieStore = new Map();
    const resultaat = await wijzigEigenWachtwoord({
      huidigWachtwoord: wachtwoord,
      nieuwWachtwoord: 'nieuw-wachtwoord-1234',
    });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Niet ingelogd.');
  });

  it('weigert een onjuist huidig wachtwoord', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenWachtwoord({
      huidigWachtwoord: 'helemaal-het-verkeerde-wachtwoord',
      nieuwWachtwoord: 'nieuw-wachtwoord-1234',
    });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Huidig wachtwoord is onjuist.');
  });

  it('wijzigt het wachtwoord bij een juist huidig wachtwoord + geldig nieuw wachtwoord, en staat vanaf dan alleen nog het nieuwe wachtwoord toe', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const nieuwWachtwoord = 'gloednieuw-wachtwoord-5678';

    const resultaat = await wijzigEigenWachtwoord({ huidigWachtwoord: wachtwoord, nieuwWachtwoord });
    expect(resultaat.succes).toBe(true);

    await expect(loginAlsCookieStore(klantEmail, nieuwWachtwoord)).resolves.toBeDefined();
    await expect(loginAlsCookieStore(klantEmail, wachtwoord)).rejects.toThrow();
  });
});
