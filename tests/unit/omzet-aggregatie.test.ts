import { describe, it, expect } from 'vitest';
import { aggregeer, dagenInPeriode, groepeerPerMaand, groepeerPerListing, type CacheReservering } from '@/lib/dashboard/omzet-aggregatie';

function reservering(overrides: Partial<CacheReservering> = {}): CacheReservering {
  return {
    listing_id: 'listing-1',
    check_in: '2025-07-10',
    check_out: '2025-07-12',
    rental_revenue: 200,
    total_cost: 260,
    no_of_days: 2,
    booking_status: 'booked',
    booking_channel: 'airbnb',
    ...overrides,
  };
}

describe('aggregeer', () => {
  it('telt omzet, nachten en kanalen op voor geboekte reserveringen', () => {
    const result = aggregeer(
      [
        reservering({ rental_revenue: 200, no_of_days: 2, booking_channel: 'airbnb' }),
        reservering({ rental_revenue: 150, no_of_days: 1, booking_channel: 'bcom' }),
      ],
      10
    );
    expect(result.omzet).toBe(350);
    expect(result.nachten).toBe(3);
    expect(result.adr).toBeCloseTo(350 / 3, 5);
    expect(result.bezetting).toBeCloseTo(30, 5); // 3 nachten / 10 dagen * 100
    expect(result.revpar).toBe(35); // 350 / 10
    expect(result.kanalen).toEqual({
      airbnb: { omzet: 200, boekingen: 1 },
      bcom: { omzet: 150, boekingen: 1 },
    });
  });

  it('negeert geannuleerde reserveringen volledig', () => {
    const result = aggregeer([reservering({ booking_status: 'cancelled', rental_revenue: 500 })], 10);
    expect(result.omzet).toBe(0);
    expect(result.nachten).toBe(0);
    expect(result.kanalen).toEqual({});
  });

  it('groepeert alle airbnb-varianten onder één kanaalsleutel', () => {
    const result = aggregeer(
      [reservering({ booking_channel: 'Airbnb' }), reservering({ booking_channel: 'airbnb_official' })],
      10
    );
    expect(Object.keys(result.kanalen)).toEqual(['airbnb']);
    expect(result.kanalen.airbnb.boekingen).toBe(2);
  });

  it('geeft 0 terug voor adr/bezetting/revpar bij geen boekingen', () => {
    const result = aggregeer([], 10);
    expect(result).toEqual({ omzet: 0, omzetIncl: 0, adr: 0, nachten: 0, bezetting: 0, revpar: 0, kanalen: {} });
  });
});

describe('dagenInPeriode', () => {
  it('telt het aantal dagen tussen twee datums inclusief', () => {
    expect(dagenInPeriode('2025-07-01', '2025-07-31')).toBe(30);
  });

  it('geeft minstens 1 terug voor een periode van één dag', () => {
    expect(dagenInPeriode('2025-07-01', '2025-07-01')).toBe(1);
  });
});

describe('groepeerPerMaand', () => {
  it('groepeert reserveringen op de kalendermaand van check_in', () => {
    const result = groepeerPerMaand([
      reservering({ check_in: '2025-07-10' }),
      reservering({ check_in: '2025-07-25' }),
      reservering({ check_in: '2025-08-01' }),
    ]);
    expect(result['2025-07']).toHaveLength(2);
    expect(result['2025-08']).toHaveLength(1);
  });
});

describe('groepeerPerListing', () => {
  it('groepeert rijen op listing_id', () => {
    const result = groepeerPerListing([
      reservering({ listing_id: 'a' }),
      reservering({ listing_id: 'a' }),
      reservering({ listing_id: 'b' }),
    ]);
    expect(result.a).toHaveLength(2);
    expect(result.b).toHaveLength(1);
  });
});
