import { describe, it, expect } from 'vitest';
import { berekenOmzetVoorPeriode, type OmzetVoorPeriodeListing } from '@/lib/dashboard/omzet-voor-periode';
import type { CacheReservering } from '@/lib/dashboard/omzet-aggregatie';

function reservering(overrides: Partial<CacheReservering> = {}): CacheReservering {
  return {
    listing_id: 'listing-a',
    check_in: '2025-07-05',
    check_out: '2025-07-06',
    rental_revenue: 100,
    total_cost: null,
    no_of_days: 1,
    booking_status: 'booked',
    booking_channel: 'airbnb',
    ...overrides,
  };
}

function listing(overrides: Partial<OmzetVoorPeriodeListing> = {}): OmzetVoorPeriodeListing {
  return {
    id: 'listing-a',
    naam: 'Listing A',
    nulmeting: [],
    ...overrides,
  };
}

describe('berekenOmzetVoorPeriode — trend per woning', () => {
  it('berekent voor elke woning een eigen trend die alleen haar eigen omzet weerspiegelt', () => {
    const listings = [listing({ id: 'listing-a', naam: 'A' }), listing({ id: 'listing-b', naam: 'B' })];
    const huidigeRijen: CacheReservering[] = [
      reservering({ listing_id: 'listing-a', check_in: '2025-07-05', check_out: '2025-07-06', rental_revenue: 300 }),
      reservering({ listing_id: 'listing-a', check_in: '2025-08-05', check_out: '2025-08-06', rental_revenue: 100 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-07-10', check_out: '2025-07-11', rental_revenue: 50 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-08-10', check_out: '2025-08-11', rental_revenue: 400 }),
    ];

    const result = berekenOmzetVoorPeriode({
      listings,
      huidigeRijen,
      stlyRijen: [],
      start: '2025-07-01',
      eind: '2025-08-31',
      periodeType: 'eigen',
    });

    const trendA = result.listings.find((l) => l.listing_id === 'listing-a')!.trend;
    const trendB = result.listings.find((l) => l.listing_id === 'listing-b')!.trend;

    expect(trendA.map((t) => ({ maand: t.maand, omzet: t.omzet }))).toEqual([
      { maand: '2025-07', omzet: 300 },
      { maand: '2025-08', omzet: 100 },
    ]);
    expect(trendB.map((t) => ({ maand: t.maand, omzet: t.omzet }))).toEqual([
      { maand: '2025-07', omzet: 50 },
      { maand: '2025-08', omzet: 400 },
    ]);
  });

  it('de som van de per-woning trend over alle woningen komt overeen met de portfolio-trend', () => {
    const listings = [listing({ id: 'listing-a', naam: 'A' }), listing({ id: 'listing-b', naam: 'B' })];
    const huidigeRijen: CacheReservering[] = [
      reservering({ listing_id: 'listing-a', check_in: '2025-07-05', check_out: '2025-07-06', rental_revenue: 300 }),
      reservering({ listing_id: 'listing-a', check_in: '2025-08-05', check_out: '2025-08-06', rental_revenue: 100 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-07-10', check_out: '2025-07-11', rental_revenue: 50 }),
      reservering({ listing_id: 'listing-b', check_in: '2025-08-10', check_out: '2025-08-11', rental_revenue: 400 }),
    ];

    const result = berekenOmzetVoorPeriode({
      listings,
      huidigeRijen,
      stlyRijen: [],
      start: '2025-07-01',
      eind: '2025-08-31',
      periodeType: 'eigen',
    });

    const trendA = result.listings.find((l) => l.listing_id === 'listing-a')!.trend;
    const trendB = result.listings.find((l) => l.listing_id === 'listing-b')!.trend;
    const somPerMaand = result.trend.map((portfolioPunt) => {
      const a = trendA.find((t) => t.maand === portfolioPunt.maand)!.omzet;
      const b = trendB.find((t) => t.maand === portfolioPunt.maand)!.omzet;
      return { maand: portfolioPunt.maand, omzet: a + b };
    });

    expect(somPerMaand).toEqual(result.trend.map((t) => ({ maand: t.maand, omzet: t.omzet })));
  });
});
