import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

vi.mock('@/lib/pricelabs/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricelabs/client')>('@/lib/pricelabs/client');
  return {
    ...actual,
    fetchReservationData: vi.fn().mockResolvedValue([
      { check_in: '2025-01-10', check_out: '2025-01-12', rental_revenue: '200', booking_status: 'booked' },
    ]),
  };
});

const { syncListing } = await import('@/lib/pricelabs/sync');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(url, serviceKey);

let clientId: string;
let listingId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const { data: client } = await admin
    .from('clients')
    .insert({ naam: 'Sync Test Klant', email: `sync-test-${suffix}@test.local` })
    .select()
    .single();
  clientId = client!.id;

  const { data: listing } = await admin
    .from('listings')
    .insert({ client_id: clientId, naam: 'Sync Test Listing' })
    .select()
    .single();
  listingId = listing!.id;
});

afterAll(async () => {
  await admin.from('clients').delete().eq('id', clientId);
});

describe('syncListing', () => {
  it('slaat de berekende maandtotalen op in monthly_actuals', async () => {
    await syncListing(admin, {
      listingId,
      pricelabsListingId: 'pl-123',
      pms: 'hostaway',
      vanaf: { jaar: 2025, maand: 1 },
      tot: { jaar: 2025, maand: 1 },
    });

    const { data: rijen } = await admin.from('monthly_actuals').select('*').eq('listing_id', listingId);

    expect(rijen).toHaveLength(1);
    expect(rijen![0]).toMatchObject({ jaar: 2025, maand: 1, omzet: 200 });
  });

  it('is idempotent: opnieuw draaien voor dezelfde periode overschrijft in plaats van te verdubbelen', async () => {
    await syncListing(admin, {
      listingId,
      pricelabsListingId: 'pl-123',
      pms: 'hostaway',
      vanaf: { jaar: 2025, maand: 1 },
      tot: { jaar: 2025, maand: 1 },
    });

    const { data: rijen } = await admin.from('monthly_actuals').select('*').eq('listing_id', listingId);
    expect(rijen).toHaveLength(1);
  });
});
