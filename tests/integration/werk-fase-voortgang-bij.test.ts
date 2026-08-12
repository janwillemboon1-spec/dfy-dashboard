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

const { werkFaseVoortgangBij } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
let adminEmail: string;
let adminUserId: string;
let klantEmail: string;
let klantUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Fase-voortgang Klant', email: `fase-voortgang-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `fase-voortgang-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `fase-voortgang-klant-${suffix}@test.local`;
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
});

describe('werkFaseVoortgangBij', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: 50 })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('weigert een percentage buiten 0-100', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);
    await expect(
      werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: 150 })
    ).rejects.toThrow('Percentage moet een geheel getal tussen 0 en 100 zijn.');
    await expect(
      werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: -5 })
    ).rejects.toThrow('Percentage moet een geheel getal tussen 0 en 100 zijn.');
  });

  it('maakt een nieuwe rij aan voor een fase die nog geen percentage had', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 40 });

    const { data: rij } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 2)
      .single();
    expect(rij!.percentage).toBe(40);
  });

  it('werkt een bestaande rij bij i.p.v. een dubbele aan te maken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 40 });
    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 75 });

    const { data: rijen } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 2);
    expect(rijen).toHaveLength(1);
    expect(rijen![0].percentage).toBe(75);
  });

  it('houdt fases volledig onafhankelijk van elkaar', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkFaseVoortgangBij({ clientId, faseNummer: 1, percentage: 40 });
    await werkFaseVoortgangBij({ clientId, faseNummer: 2, percentage: 100 });

    const { data: fase1 } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 1)
      .single();
    expect(fase1!.percentage).toBe(40);

    const { data: fase2 } = await admin
      .from('voortgang_fasen')
      .select('percentage')
      .eq('client_id', clientId)
      .eq('fase_nummer', 2)
      .single();
    expect(fase2!.percentage).toBe(100);
  });
});
