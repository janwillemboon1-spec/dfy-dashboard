import { describe, it, expect } from 'vitest';
import { berekenMaandTotalen, dagenInMaand, volgendeMaand } from '@/lib/pricelabs/sync';
import type { PricelabsReservering } from '@/lib/pricelabs/client';

function reservering(overrides: Partial<PricelabsReservering> = {}): PricelabsReservering {
  return {
    reservation_id: 'test-reservering-1',
    check_in: '2025-01-10',
    check_out: '2025-01-12',
    rental_revenue: '200',
    total_cost: '300',
    no_of_days: 2,
    booking_status: 'booked',
    booking_channel: 'airbnb',
    ...overrides,
  };
}

describe('dagenInMaand', () => {
  it('geeft het juiste aantal dagen, inclusief een schrikkelmaand', () => {
    expect(dagenInMaand(2024, 2)).toBe(29);
    expect(dagenInMaand(2025, 2)).toBe(28);
    expect(dagenInMaand(2025, 1)).toBe(31);
  });
});

describe('volgendeMaand', () => {
  it('gaat over naar het volgende jaar bij december', () => {
    expect(volgendeMaand(2025, 12)).toEqual({ jaar: 2026, maand: 1 });
    expect(volgendeMaand(2025, 5)).toEqual({ jaar: 2025, maand: 6 });
  });
});

describe('berekenMaandTotalen', () => {
  it('telt een boeking volledig binnen één maand correct mee', () => {
    const resultaat = berekenMaandTotalen(
      [reservering({ check_in: '2025-01-10', check_out: '2025-01-12', rental_revenue: '200' })],
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 1 }
    );
    expect(resultaat).toEqual([{ jaar: 2025, maand: 1, omzet: 200, bezetting: 6.45 }]);
  });

  it('verdeelt een boeking die één maandgrens overschrijdt proportioneel op nachten', () => {
    // check-in 30 jan, check-out 2 feb -> 3 nachten totaal: 2 in januari, 1 in februari
    const resultaat = berekenMaandTotalen(
      [reservering({ check_in: '2025-01-30', check_out: '2025-02-02', rental_revenue: '300' })],
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 2 }
    );

    expect(resultaat.find((r) => r.maand === 1)).toEqual({ jaar: 2025, maand: 1, omzet: 200, bezetting: 6.45 });
    expect(resultaat.find((r) => r.maand === 2)).toEqual({ jaar: 2025, maand: 2, omzet: 100, bezetting: 3.57 });
  });

  it('verdeelt een boeking die twee maandgrenzen overschrijdt over alle drie de maanden', () => {
    // check-in 30 jan, check-out 3 mrt: nachten = jan(30,31)=2, feb(1..28)=28, mrt(1,2)=2, totaal 32
    const resultaat = berekenMaandTotalen(
      [reservering({ check_in: '2025-01-30', check_out: '2025-03-03', rental_revenue: '3200' })],
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 3 }
    );

    expect(resultaat.find((r) => r.maand === 1)?.omzet).toBe(200);
    expect(resultaat.find((r) => r.maand === 2)?.omzet).toBe(2800);
    expect(resultaat.find((r) => r.maand === 3)?.omzet).toBe(200);
  });

  it('negeert geannuleerde boekingen volledig', () => {
    const resultaat = berekenMaandTotalen(
      [reservering({ booking_status: 'cancelled', rental_revenue: '500' })],
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 1 }
    );
    expect(resultaat).toEqual([{ jaar: 2025, maand: 1, omzet: 0, bezetting: 0 }]);
  });

  it('schrijft expliciet 0 weg voor maanden zonder boekingen (i.p.v. de maand over te slaan)', () => {
    const resultaat = berekenMaandTotalen([], { jaar: 2025, maand: 1 }, { jaar: 2025, maand: 3 });
    expect(resultaat).toHaveLength(3);
    expect(resultaat.every((r) => r.omzet === 0 && r.bezetting === 0)).toBe(true);
  });

  it('negeert een reservering met check_out op of vóór check_in (0 of negatieve nachten)', () => {
    const resultaat = berekenMaandTotalen(
      [reservering({ check_in: '2025-01-10', check_out: '2025-01-10', rental_revenue: '200' })],
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 1 }
    );
    expect(resultaat).toEqual([{ jaar: 2025, maand: 1, omzet: 0, bezetting: 0 }]);
  });

  it('negeert een reservering met een niet-numerieke rental_revenue', () => {
    const resultaat = berekenMaandTotalen(
      [reservering({ check_in: '2025-01-10', check_out: '2025-01-12', rental_revenue: 'onbekend' })],
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 1 }
    );
    expect(resultaat).toEqual([{ jaar: 2025, maand: 1, omzet: 0, bezetting: 0 }]);
  });
});
