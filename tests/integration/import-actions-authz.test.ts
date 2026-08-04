import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// De import server actions moeten sinds deze fix zelf een expliciete
// admin-check doen (ze gebruiken de service-role client, die RLS omzeilt, dus
// zonder deze check zou een niet-admin de actions rechtstreeks kunnen
// aanroepen — bv. buiten de /admin route-middleware om — en willekeurige
// clients/action_log-rijen kunnen aanmaken). Dit bestand roept de 'use
// server' functies rechtstreeks aan (niet via de UI/pagina) om precies dat
// scenario te simuleren.
//
// `createClient()` uit '@/lib/supabase/server' leest de sessie via
// `next/headers`'s `cookies()`, wat buiten een echt Next.js-request niet
// werkt. We mocken die module met een simpele in-memory cookiejar, en vullen
// die jar met een ECHTE sessie: we loggen daadwerkelijk in bij de lokale
// Supabase Auth via `@supabase/ssr`'s createBrowserClient (dezelfde library
// die de browser gebruikt), zodat de cookie-naam/encodering exact klopt en
// er verder niets in de auth-/rolcheck gemockt wordt.
vi.mock('@/lib/email/send-welkomstmail', () => ({
  sendWelkomstmail: vi.fn().mockResolvedValue(undefined),
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

const { importeerKlanten, importeerActielog } = await import(
  '@/app/[locale]/admin/import/actions'
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

let klantClientId: string;
let klantUserId: string;
let klantEmail: string;

let adminUserId: string;
let adminEmail: string;

let doelClientId: string;
let doelListingId: string;
let doelListingNaam: string;

beforeAll(async () => {
  const suffix = Date.now();

  klantEmail = `import-authz-klant-${suffix}@test.local`;
  const { data: klantClientRow } = await admin
    .from('clients')
    .insert({ naam: 'Import Authz Klant', email: klantEmail })
    .select()
    .single();
  klantClientId = klantClientRow!.id;

  const { data: klantUserRes } = await admin.auth.admin.createUser({
    email: klantEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  klantUserId = klantUserRes!.user!.id;
  await admin
    .from('profiles')
    .insert({ id: klantUserId, role: 'klant', client_id: klantClientId, email: klantEmail, naam: 'Import Authz Klant' });

  adminEmail = `import-authz-admin-${suffix}@test.local`;
  const { data: adminUserRes } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: wachtwoord,
  });
  adminUserId = adminUserRes!.user!.id;
  await admin.from('profiles').insert({ id: adminUserId, role: 'admin', email: adminEmail, naam: 'Import Authz Admin' });

  const { data: doelClient } = await admin
    .from('clients')
    .insert({ naam: 'Actielog Doel Klant', email: `actielog-doel-${suffix}@test.local` })
    .select()
    .single();
  doelClientId = doelClient!.id;

  doelListingNaam = `Actielog Doel Listing ${suffix}`;
  const { data: doelListing } = await admin
    .from('listings')
    .insert({ client_id: doelClientId, naam: doelListingNaam })
    .select()
    .single();
  doelListingId = doelListing!.id;
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', klantClientId);
  await admin.from('clients').delete().eq('id', doelClientId);
  await admin.auth.admin.deleteUser(klantUserId);
  await admin.auth.admin.deleteUser(adminUserId);
});

describe('import server actions: expliciete admin-check (bypass van de UI)', () => {
  it('importeerKlanten weigert een ingelogde niet-admin (klant-rol) en schrijft niets weg', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);

    const rijEmail = `geblokkeerd-klant-${Date.now()}@voorbeeld.nl`;
    await expect(
      importeerKlanten([
        {
          rowIndex: 1,
          klantnaam: 'Geblokkeerde Klant',
          klantEmail: rijEmail,
          klantTelefoon: '0600000000',
          accommodatienaam: 'Geblokkeerd Huisje',
          adres: 'Nergensweg 1',
          nulmeting: [],
          errors: [],
        },
      ])
    ).rejects.toThrow('Niet geautoriseerd.');

    const { data: created } = await admin.from('clients').select('id').eq('email', rijEmail).maybeSingle();
    expect(created).toBeNull();
  });

  it('importeerActielog weigert een ingelogde niet-admin (klant-rol) en schrijft niets weg — de geflagde privilege-escalatie', async () => {
    activeCookieStore = await loginAlsCookieStore(klantEmail, wachtwoord);

    const { count: aantalVoor } = await admin
      .from('action_log')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', doelListingId);

    await expect(
      importeerActielog([
        {
          rowIndex: 1,
          accommodatienaam: doelListingNaam,
          datum: '2025-01-01',
          omschrijving: 'Poging tot privilege-escalatie door klant-rol gebruiker',
          type: 'foto',
          errors: [],
        },
      ])
    ).rejects.toThrow('Niet geautoriseerd.');

    const { count: aantalNa } = await admin
      .from('action_log')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', doelListingId);
    expect(aantalNa).toBe(aantalVoor);
  });

  it('regressie: een echte admin kan nog steeds klanten importeren', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const rijEmail = `admin-import-${Date.now()}@voorbeeld.nl`;
    const resultaten = await importeerKlanten([
      {
        rowIndex: 1,
        klantnaam: 'Regressie Klant',
        klantEmail: rijEmail,
        klantTelefoon: '0611111111',
        accommodatienaam: 'Regressie Huisje',
        adres: 'Testweg 1',
        nulmeting: Array.from({ length: 12 }, (_, i) => ({ jaar: 2025, maand: i + 1, omzet: 1000, bezetting: 50 })),
        errors: [],
      },
    ]);

    expect(resultaten).toEqual([{ rowIndex: 1, succes: true, bron: 'klant' }]);

    const { data: createdClient } = await admin.from('clients').select('id').eq('email', rijEmail).single();
    expect(createdClient).not.toBeNull();

    const { data: profile } = await admin.from('profiles').select('id').eq('client_id', createdClient!.id).single();
    await admin.auth.admin.deleteUser(profile!.id);
    await admin.from('clients').delete().eq('id', createdClient!.id);
  });

  it('regressie: een echte admin kan nog steeds actielog-rijen importeren tegen een net aangemaakte listing', async () => {
    activeCookieStore = await loginAlsCookieStore(adminEmail, wachtwoord);

    const omschrijving = `Regressie actielog-rij ${Date.now()}`;
    const resultaten = await importeerActielog([
      {
        rowIndex: 1,
        accommodatienaam: doelListingNaam,
        datum: '2025-02-01',
        omschrijving,
        type: 'foto',
        errors: [],
      },
    ]);

    expect(resultaten).toHaveLength(1);
    expect(resultaten[0]).toMatchObject({ rowIndex: 1, succes: true, bron: 'actielog' });

    const { data: rows } = await admin
      .from('action_log')
      .select('id')
      .eq('listing_id', doelListingId)
      .eq('omschrijving', omschrijving);
    expect(rows).toHaveLength(1);

    await admin.from('action_log').delete().eq('listing_id', doelListingId).eq('omschrijving', omschrijving);
  });
});
