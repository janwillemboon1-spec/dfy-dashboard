import { describe, it, expect } from 'vitest';
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';

describe('bepaalNulmetingBronnen', () => {
  it('geeft de 12 kalendermaanden vóór een startmaand in het midden van het jaar, chronologisch', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 9);
    expect(bronnen).toEqual([
      { jaar: 2025, maand: 9 },
      { jaar: 2025, maand: 10 },
      { jaar: 2025, maand: 11 },
      { jaar: 2025, maand: 12 },
      { jaar: 2026, maand: 1 },
      { jaar: 2026, maand: 2 },
      { jaar: 2026, maand: 3 },
      { jaar: 2026, maand: 4 },
      { jaar: 2026, maand: 5 },
      { jaar: 2026, maand: 6 },
      { jaar: 2026, maand: 7 },
      { jaar: 2026, maand: 8 },
    ]);
  });

  it('geeft het volledige vorige kalenderjaar terug als de startmaand januari is', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 1);
    expect(bronnen).toEqual([
      { jaar: 2025, maand: 1 },
      { jaar: 2025, maand: 2 },
      { jaar: 2025, maand: 3 },
      { jaar: 2025, maand: 4 },
      { jaar: 2025, maand: 5 },
      { jaar: 2025, maand: 6 },
      { jaar: 2025, maand: 7 },
      { jaar: 2025, maand: 8 },
      { jaar: 2025, maand: 9 },
      { jaar: 2025, maand: 10 },
      { jaar: 2025, maand: 11 },
      { jaar: 2025, maand: 12 },
    ]);
  });

  it('geeft 11 maanden van dit jaar en december van vorig jaar als de startmaand december is', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 12);
    expect(bronnen).toEqual([
      { jaar: 2025, maand: 12 },
      { jaar: 2026, maand: 1 },
      { jaar: 2026, maand: 2 },
      { jaar: 2026, maand: 3 },
      { jaar: 2026, maand: 4 },
      { jaar: 2026, maand: 5 },
      { jaar: 2026, maand: 6 },
      { jaar: 2026, maand: 7 },
      { jaar: 2026, maand: 8 },
      { jaar: 2026, maand: 9 },
      { jaar: 2026, maand: 10 },
      { jaar: 2026, maand: 11 },
    ]);
  });

  it('geeft altijd 12 unieke (jaar, maand)-combinaties terug', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 6);
    expect(bronnen).toHaveLength(12);
    const sleutels = new Set(bronnen.map((b) => `${b.jaar}-${b.maand}`));
    expect(sleutels.size).toBe(12);
  });
});
