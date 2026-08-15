import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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

const { wijzigPortaalInstellingen } = await import('@/app/[locale]/admin/instellingen/actions');

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
let klantClientId: string;
let klantEmail: string;
let klantUserId: string;

beforeAll(async () => {
  const suffix = Date.now();

  adminEmail = `portaal-instellingen-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Portaal Instellingen Klant', email: `portaal-instellingen-klant-${suffix}@test.local` })
    .select()
    .single();
  klantClientId = client!.id;

  klantEmail = `portaal-instellingen-klant-${suffix}@test.local`;
  const { data: klantUserRes } = await admin.auth.admin.createUser({
    email: klantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantUserId = klantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantUserId, role: 'klant', client_id: klantClientId, email: klantEmail, naam: 'Klant' });
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', klantClientId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(klantUserId);
});

afterEach(async () => {
  // portaal_instellingen heeft geen client_id om op te filteren — deze test-suite is de
  // enige plek die deze tabel vult, dus na elke test alle rijen wissen om vanaf een
  // schone lei te beginnen (neq op een garandeerd-niet-bestaand id is hier simpelweg een
  // "verwijder alles"-filter, want Supabase staat geen .delete() zonder filter toe).
  await admin.from('portaal_instellingen').delete().neq('id', '00000000-0000-0000-0000-000000000000');
});

describe('wijzigPortaalInstellingen', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      wijzigPortaalInstellingen({
        videoUrl: 'https://player.vimeo.com/video/1',
        formulierUrl: 'https://tally.so/embed/x',
      })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('maakt een nieuwe rij aan als er nog geen instellingen bestaan', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const resultaat = await wijzigPortaalInstellingen({
      videoUrl: 'https://player.vimeo.com/video/1',
      formulierUrl: 'https://tally.so/embed/x',
    });
    expect(resultaat.succes).toBe(true);

    const { data: rijen } = await admin.from('portaal_instellingen').select('*');
    expect(rijen).toHaveLength(1);
    expect(rijen![0].video_url).toBe('https://player.vimeo.com/video/1');
    expect(rijen![0].formulier_url).toBe('https://tally.so/embed/x');
  });

  it('werkt de bestaande rij bij i.p.v. een tweede rij aan te maken', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await wijzigPortaalInstellingen({
      videoUrl: 'https://player.vimeo.com/video/1',
      formulierUrl: 'https://tally.so/embed/x',
    });
    await wijzigPortaalInstellingen({
      videoUrl: 'https://player.vimeo.com/video/2',
      formulierUrl: 'https://tally.so/embed/y',
    });

    const { data: rijen } = await admin.from('portaal_instellingen').select('*');
    expect(rijen).toHaveLength(1);
    expect(rijen![0].video_url).toBe('https://player.vimeo.com/video/2');
    expect(rijen![0].formulier_url).toBe('https://tally.so/embed/y');
  });
});
