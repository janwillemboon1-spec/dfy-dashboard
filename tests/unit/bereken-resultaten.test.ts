import { describe, it, expect } from 'vitest';
import {
  berekenMaandVergelijkingen,
  berekenWowCijfer,
  laatste12Maanden,
  type ListingData,
} from '@/lib/dashboard/bereken-resultaten';

describe('berekenMaandVergelijkingen', () => {
  it('matcht een actuele maand met de nulmeting-rij van hetzelfde maandnummer, ongeacht jaar', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [{ jaar: 2024, maand: 8, omzet: 1000 }],
        monthlyActuals: [{ jaar: 2026, maand: 8, omzet: 1500 }],
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings);
    expect(resultaat).toEqual([{ jaar: 2026, maand: 8, nulmetingOmzet: 1000, actueelOmzet: 1500 }]);
  });

  it('telt meerdere accommodaties bij elkaar op voor dezelfde kalendermaand', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [{ jaar: 2024, maand: 8, omzet: 1000 }],
        monthlyActuals: [{ jaar: 2026, maand: 8, omzet: 1500 }],
      },
      {
        nulmeting: [{ jaar: 2024, maand: 8, omzet: 800 }],
        monthlyActuals: [{ jaar: 2026, maand: 8, omzet: 900 }],
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings);
    expect(resultaat).toEqual([{ jaar: 2026, maand: 8, nulmetingOmzet: 1800, actueelOmzet: 2400 }]);
  });

  it('slaat een actuele maand zonder bijbehorende nulmeting-maand over', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [{ jaar: 2024, maand: 8, omzet: 1000 }],
        monthlyActuals: [{ jaar: 2026, maand: 3, omzet: 500 }],
      },
    ];
    expect(berekenMaandVergelijkingen(listings)).toEqual([]);
  });

  it('sorteert chronologisch oplopend', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [
          { jaar: 2024, maand: 1, omzet: 100 },
          { jaar: 2024, maand: 12, omzet: 200 },
        ],
        monthlyActuals: [
          { jaar: 2026, maand: 12, omzet: 250 },
          { jaar: 2025, maand: 1, omzet: 150 },
        ],
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings);
    expect(resultaat.map((r) => `${r.jaar}-${r.maand}`)).toEqual(['2025-1', '2026-12']);
  });
});

describe('laatste12Maanden', () => {
  it('geeft alles terug als er 12 of minder zijn', () => {
    const vergelijkingen = Array.from({ length: 5 }, (_, i) => ({
      jaar: 2026,
      maand: i + 1,
      nulmetingOmzet: 100,
      actueelOmzet: 100,
    }));
    expect(laatste12Maanden(vergelijkingen)).toHaveLength(5);
  });

  it('houdt bij meer dan 12 alleen de laatste 12 uit de (al chronologisch gesorteerde) invoer over', () => {
    const vergelijkingen = Array.from({ length: 15 }, (_, i) => ({
      jaar: 2026,
      maand: (i % 12) + 1,
      nulmetingOmzet: 100,
      actueelOmzet: 100 + i,
    }));
    const resultaat = laatste12Maanden(vergelijkingen);
    expect(resultaat).toHaveLength(12);
    expect(resultaat[0].actueelOmzet).toBe(103);
    expect(resultaat[11].actueelOmzet).toBe(114);
  });
});

describe('berekenWowCijfer', () => {
  it('geeft null terug als er nog geen enkele vergelijking is', () => {
    expect(berekenWowCijfer([])).toBeNull();
  });

  it('telt het verschil tussen actueel en nulmeting op over alle maanden', () => {
    const vergelijkingen = [
      { jaar: 2026, maand: 7, nulmetingOmzet: 1000, actueelOmzet: 1500 },
      { jaar: 2026, maand: 8, nulmetingOmzet: 2000, actueelOmzet: 1800 },
    ];
    expect(berekenWowCijfer(vergelijkingen)).toBe(300);
  });

  it('kan negatief zijn', () => {
    const vergelijkingen = [{ jaar: 2026, maand: 7, nulmetingOmzet: 2000, actueelOmzet: 1000 }];
    expect(berekenWowCijfer(vergelijkingen)).toBe(-1000);
  });
});
