import { describe, it, expect } from 'vitest';
import { berekenMaandVergelijkingen, berekenWowCijfer, type ListingData } from '@/lib/dashboard/bereken-resultaten';

describe('berekenMaandVergelijkingen', () => {
  it('matcht een actuele maand met de nulmeting-rij van hetzelfde maandnummer, ongeacht jaar', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [{ jaar: 2024, maand: 8, omzet: 1000 }],
        monthlyActuals: [{ jaar: 2026, maand: 8, omzet: 1500 }],
        samenwerkingGestart: null,
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
        samenwerkingGestart: null,
      },
      {
        nulmeting: [{ jaar: 2024, maand: 8, omzet: 800 }],
        monthlyActuals: [{ jaar: 2026, maand: 8, omzet: 900 }],
        samenwerkingGestart: null,
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
        samenwerkingGestart: null,
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
        samenwerkingGestart: null,
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings);
    expect(resultaat.map((r) => `${r.jaar}-${r.maand}`)).toEqual(['2025-1', '2026-12']);
  });

  it('sluit actuele maanden vóór de eigen samenwerking_gestart van de accommodatie uit', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [
          { jaar: 2024, maand: 2, omzet: 100 },
          { jaar: 2024, maand: 3, omzet: 100 },
        ],
        monthlyActuals: [
          { jaar: 2026, maand: 2, omzet: 500 },
          { jaar: 2026, maand: 3, omzet: 600 },
        ],
        samenwerkingGestart: '2026-03-15',
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings);
    // Februari 2026 valt vóór de startmaand (maart) en telt niet mee; maart zelf (de
    // startmaand zelf) telt wél mee — "vanaf" is inclusief.
    expect(resultaat).toEqual([{ jaar: 2026, maand: 3, nulmetingOmzet: 100, actueelOmzet: 600 }]);
  });

  it('gebruikt geen cutoff wanneer samenwerking_gestart null is (bv. CSV-onboarding zonder PriceLabs-koppeling)', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [{ jaar: 2024, maand: 1, omzet: 100 }],
        monthlyActuals: [{ jaar: 2020, maand: 1, omzet: 500 }],
        samenwerkingGestart: null,
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings);
    expect(resultaat).toEqual([{ jaar: 2020, maand: 1, nulmetingOmzet: 100, actueelOmzet: 500 }]);
  });

  it('past de cutoff per accommodatie apart toe bij meerdere accommodaties met verschillende startmaanden', () => {
    const listings: ListingData[] = [
      {
        // Accommodatie A: startte januari 2026, telt dus vanaf januari mee.
        nulmeting: [{ jaar: 2024, maand: 1, omzet: 100 }],
        monthlyActuals: [{ jaar: 2026, maand: 1, omzet: 500 }],
        samenwerkingGestart: '2026-01-01',
      },
      {
        // Accommodatie B: startte juni 2026 — januari 2026 telt voor B dus niet mee,
        // ook al heeft B toevallig ook een januari-rij in monthlyActuals staan.
        nulmeting: [
          { jaar: 2024, maand: 1, omzet: 300 },
          { jaar: 2024, maand: 6, omzet: 300 },
        ],
        monthlyActuals: [
          { jaar: 2026, maand: 1, omzet: 700 },
          { jaar: 2026, maand: 6, omzet: 800 },
        ],
        samenwerkingGestart: '2026-06-01',
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings);
    expect(resultaat).toEqual([
      { jaar: 2026, maand: 1, nulmetingOmzet: 100, actueelOmzet: 500 },
      { jaar: 2026, maand: 6, nulmetingOmzet: 300, actueelOmzet: 800 },
    ]);
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
