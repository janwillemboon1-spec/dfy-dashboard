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

const { wijzigEigenClientGegevens } = await import('@/app/[locale]/dashboard/actions');

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

  klantEmail = `contactgegevens-klant-${suffix}@test.local`;
  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Oude Naam', email: klantEmail, telefoon: '0600000000' })
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

describe('wijzigEigenClientGegevens', () => {
  it('weigert een lege naam', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenClientGegevens({ naam: '   ', telefoon: '0611111111' });
    expect(resultaat.succes).toBe(false);
    expect(resultaat.fout).toBe('Naam is verplicht.');
  });

  it('wijzigt de naam en het telefoonnummer van de eigen client, zonder email/status aan te raken', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenClientGegevens({ naam: 'Nieuwe Naam', telefoon: '0622222222' });
    expect(resultaat.succes).toBe(true);

    const { data: clientNa } = await admin
      .from('clients')
      .select('naam, telefoon, email, status')
      .eq('id', clientId)
      .single();
    expect(clientNa!.naam).toBe('Nieuwe Naam');
    expect(clientNa!.telefoon).toBe('0622222222');
    // Beschermt tegen een toekomstige regressie (bv. een onbedachtzame ...input-spread in
    // de update-payload) die email/status zou meesturen — RLS staat de hele rij toe, dus
    // deze twee velden worden uitsluitend door de server-actie zelf buiten schot gehouden.
    expect(clientNa!.email).toBe(klantEmail);
    expect(clientNa!.status).toBe('onboarding');
  });

  it('staat een leeg telefoonnummer toe (optioneel veld)', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    const resultaat = await wijzigEigenClientGegevens({ naam: 'Weer Een Naam', telefoon: null });
    expect(resultaat.succes).toBe(true);

    const { data: clientNa } = await admin.from('clients').select('telefoon').eq('id', clientId).single();
    expect(clientNa!.telefoon).toBeNull();
  });
});
