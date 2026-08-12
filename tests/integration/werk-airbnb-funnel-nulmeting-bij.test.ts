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

const { werkAirbnbFunnelNulmetingBij } = await import('@/app/[locale]/admin/klanten/[id]/actions');

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
    .insert({ naam: 'Funnel Klant', email: `funnel-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  adminEmail = `funnel-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Admin' });

  klantEmail = `funnel-klant-${suffix}@test.local`;
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

describe('werkAirbnbFunnelNulmetingBij', () => {
  it('weigert een niet-admin', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);
    await expect(
      werkAirbnbFunnelNulmetingBij({
        clientId,
        gemiddeldConversiepercentage: 5,
        percentageZoekvertoningenEerstePagina: 10,
        conversieZoekopdrachtNaarAdvertentie: 15,
        conversieAdvertentieNaarBoeking: 20,
      })
    ).rejects.toThrow('Niet geautoriseerd.');
  });

  it('maakt een nieuwe rij aan en werkt die daarna bij i.p.v. te dupliceren', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      gemiddeldConversiepercentage: 5.5,
      percentageZoekvertoningenEerstePagina: 10.25,
      conversieZoekopdrachtNaarAdvertentie: 15,
      conversieAdvertentieNaarBoeking: 20,
    });

    const { data: rij1 } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('client_id', clientId)
      .single();
    expect(rij1!.gemiddeld_conversiepercentage).toBe(5.5);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      gemiddeldConversiepercentage: 6,
      percentageZoekvertoningenEerstePagina: 10.25,
      conversieZoekopdrachtNaarAdvertentie: 15,
      conversieAdvertentieNaarBoeking: 20,
    });

    const { data: rijen } = await admin
      .from('airbnb_funnel_nulmeting')
      .select('*')
      .eq('client_id', clientId);
    expect(rijen).toHaveLength(1);
    expect(rijen![0].gemiddeld_conversiepercentage).toBe(6);
  });

  it('laat het bijbehorende checklist-item "Nulmeting Airbnb funnel" ongemoeid', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const { data: itemVoor } = await admin
      .from('voortgang_checklist_items')
      .select('afgevinkt')
      .eq('client_id', clientId)
      .eq('naam', 'Nulmeting Airbnb funnel')
      .single();
    expect(itemVoor!.afgevinkt).toBe(false);

    await werkAirbnbFunnelNulmetingBij({
      clientId,
      gemiddeldConversiepercentage: 8,
      percentageZoekvertoningenEerstePagina: 12,
      conversieZoekopdrachtNaarAdvertentie: 18,
      conversieAdvertentieNaarBoeking: 22,
    });

    const { data: itemNa } = await admin
      .from('voortgang_checklist_items')
      .select('afgevinkt')
      .eq('client_id', clientId)
      .eq('naam', 'Nulmeting Airbnb funnel')
      .single();
    expect(itemNa!.afgevinkt).toBe(false);
  });
});
