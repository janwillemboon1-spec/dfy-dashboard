import { describe, it, expect, vi, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return {
    ...actual,
    fetchAllListings: vi.fn().mockResolvedValue([
      { id: 'ververs-test-1', pms: 'hostaway', name: 'Testwoning Een' },
    ]),
  };
});

const { verversPricelabsCache } = await import('@/lib/pricelabs/ververs-cache');
const { fetchAllListings } = await import('@/lib/pricelabs/client');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(url, serviceKey);

afterAll(async () => {
  await admin.from('pricelabs_listings_cache').delete().eq('pricelabs_listing_id', 'ververs-test-1');
});

describe('verversPricelabsCache', () => {
  it('upsert de listings van PriceLabs in de cache-tabel', async () => {
    await verversPricelabsCache(admin);

    const { data } = await admin
      .from('pricelabs_listings_cache')
      .select('*')
      .eq('pricelabs_listing_id', 'ververs-test-1')
      .single();

    expect(data).toMatchObject({ naam: 'Testwoning Een', pms: 'hostaway' });
  });

  it('werkt een bestaande cache-rij bij i.p.v. te dupliceren', async () => {
    vi.mocked(fetchAllListings).mockResolvedValueOnce([
      { id: 'ververs-test-1', pms: 'hostaway', name: 'Testwoning Een (bijgewerkt)' },
    ]);

    await verversPricelabsCache(admin);

    const { data, error } = await admin
      .from('pricelabs_listings_cache')
      .select('*')
      .eq('pricelabs_listing_id', 'ververs-test-1')
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({ naam: 'Testwoning Een (bijgewerkt)', pms: 'hostaway' });
  });
});
