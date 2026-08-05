import { describe, it, expect } from 'vitest';
import { maandenInPeriode, nulmetingAlsMetrics, type NulmetingRij } from '@/lib/dashboard/nulmeting-metrics';

describe('maandenInPeriode', () => {
  it('geeft alle maandnummers in een hele-maand-periode terug', () => {
    expect(maandenInPeriode('2025-08-01', '2025-08-31')).toEqual(new Set([8]));
  });

  it('geeft alle maandnummers van een heel jaar terug', () => {
    expect(maandenInPeriode('2025-01-01', '2025-12-31')).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    );
  });
});

describe('nulmetingAlsMetrics', () => {
  const nulmeting: NulmetingRij[] = [
    { jaar: 2024, maand: 7, omzet: 2000, bezetting: 50 }, // juli 2024: 31 dagen, 50% = 15,5 nachten
  ];

  it('berekent omzet en afgeleide nachten/adr/bezetting/revpar voor de gematchte maand', () => {
    const result = nulmetingAlsMetrics(nulmeting, '2026-07-01', '2026-07-31');
    expect(result.omzet).toBe(2000);
    expect(result.nachten).toBeCloseTo(15.5, 5);
    expect(result.adr).toBeCloseTo(2000 / 15.5, 5);
    expect(result.bezetting).toBeCloseTo(50, 5);
    expect(result.revpar).toBeCloseTo(2000 / 31, 5);
    expect(result.omzetIncl).toBe(2000);
    expect(result.kanalen).toEqual({});
  });

  it('geeft nul-metrics terug als er geen nulmeting-maand matcht', () => {
    const result = nulmetingAlsMetrics(nulmeting, '2026-03-01', '2026-03-31');
    expect(result.omzet).toBe(0);
    expect(result.nachten).toBe(0);
    expect(result.bezetting).toBe(0);
  });
});
