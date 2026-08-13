import { describe, it, expect } from 'vitest';
import {
  berekenMaandVergelijkingen,
  berekenWowCijfer,
  vroegsteSamenwerkingGestart,
  type ListingData,
} from '@/lib/dashboard/bereken-resultaten';

const NU = new Date('2026-08-13T00:00:00Z');

describe('berekenMaandVergelijkingen', () => {
  it('matcht een actuele maand met de nulmeting-rij van hetzelfde maandnummer, ongeacht jaar', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [{ jaar: 2024, maand: 8, omzet: 1000 }],
        monthlyActuals: [{ jaar: 2026, maand: 8, omzet: 1500 }],
        samenwerkingGestart: null,
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings, NU);
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
    const resultaat = berekenMaandVergelijkingen(listings, NU);
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
    expect(berekenMaandVergelijkingen(listings, NU)).toEqual([]);
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
    // Eigen, latere nu: deze test gaat over sorteervolgorde, niet over de
    // toekomstige-maand-uitsluiting hieronder — december 2026 moet hier dus gewoon meetellen.
    const resultaat = berekenMaandVergelijkingen(listings, new Date('2027-01-01T00:00:00Z'));
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
    const resultaat = berekenMaandVergelijkingen(listings, NU);
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
    const resultaat = berekenMaandVergelijkingen(listings, NU);
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
    const resultaat = berekenMaandVergelijkingen(listings, NU);
    expect(resultaat).toEqual([
      { jaar: 2026, maand: 1, nulmetingOmzet: 100, actueelOmzet: 500 },
      { jaar: 2026, maand: 6, nulmetingOmzet: 300, actueelOmzet: 800 },
    ]);
  });

  it('sluit een maand ná de huidige maand uit, ook als daar via het glijdende syncvenster al (deel-)omzet voor bekend is', () => {
    const listings: ListingData[] = [
      {
        nulmeting: [
          { jaar: 2024, maand: 8, omzet: 1000 },
          { jaar: 2024, maand: 9, omzet: 1000 },
        ],
        monthlyActuals: [
          { jaar: 2026, maand: 8, omzet: 1500 },
          // September 2026 ligt ná "nu" (13 augustus 2026) — al aanwezig door het
          // vooruitkijkende cron-syncvenster, maar nog niet gerealiseerd.
          { jaar: 2026, maand: 9, omzet: 300 },
        ],
        samenwerkingGestart: null,
      },
    ];
    const resultaat = berekenMaandVergelijkingen(listings, NU);
    expect(resultaat).toEqual([{ jaar: 2026, maand: 8, nulmetingOmzet: 1000, actueelOmzet: 1500 }]);
  });
});

describe('vroegsteSamenwerkingGestart', () => {
  it('geeft de vroegste datum terug uit meerdere', () => {
    const resultaat = vroegsteSamenwerkingGestart(['2026-06-01', '2026-01-15', '2026-03-10']);
    expect(resultaat).toEqual({ jaar: 2026, maand: 1 });
  });

  it('negeert null-waarden tussen echte datums', () => {
    const resultaat = vroegsteSamenwerkingGestart([null, '2026-05-01', null, '2025-11-20']);
    expect(resultaat).toEqual({ jaar: 2025, maand: 11 });
  });

  it('geeft null terug als alle waarden null zijn', () => {
    expect(vroegsteSamenwerkingGestart([null, null])).toBeNull();
  });

  it('geeft null terug voor een lege lijst', () => {
    expect(vroegsteSamenwerkingGestart([])).toBeNull();
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
