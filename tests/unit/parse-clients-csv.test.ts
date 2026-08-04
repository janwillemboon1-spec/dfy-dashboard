import { describe, it, expect } from 'vitest';
import { berekenNulmetingMaanden, parseClientsCsv } from '@/lib/csv/parse-clients-csv';

describe('berekenNulmetingMaanden', () => {
  it('genereert 12 opeenvolgende kalendermaanden vanaf de startmaand', () => {
    const result = berekenNulmetingMaanden('2025-08');
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ jaar: 2025, maand: 8 });
    expect(result[4]).toEqual({ jaar: 2025, maand: 12 });
    expect(result[5]).toEqual({ jaar: 2026, maand: 1 });
    expect(result[11]).toEqual({ jaar: 2026, maand: 7 });
  });

  it('gooit een fout bij een ongeldig formaat', () => {
    expect(() => berekenNulmetingMaanden('augustus-2025')).toThrow();
  });
});

describe('parseClientsCsv', () => {
  const header =
    'klantnaam,klant_email,klant_telefoon,accommodatienaam,adres,startmaand,' +
    Array.from({ length: 12 }, (_, i) => `omzet_${i + 1},bezetting_${i + 1}`).join(',');

  it('parseert een geldige rij zonder fouten', () => {
    const waarden = Array.from({ length: 12 }, () => '1000,50').join(',');
    const csv = `${header}\nJan Jansen,jan@voorbeeld.nl,0612345678,Strandhuisje,Duinweg 1,2025-01,${waarden}`;

    const rijen = parseClientsCsv(csv);
    expect(rijen).toHaveLength(1);
    expect(rijen[0].errors).toEqual([]);
    expect(rijen[0].nulmeting).toHaveLength(12);
    expect(rijen[0].nulmeting[0]).toEqual({ jaar: 2025, maand: 1, omzet: 1000, bezetting: 50 });
  });

  it('verzamelt fouten voor ontbrekende verplichte velden zonder de rest te laten crashen', () => {
    const waarden = Array.from({ length: 12 }, () => '1000,50').join(',');
    const csv = `${header}\n,jan@voorbeeld.nl,,Strandhuisje,Duinweg 1,2025-01,${waarden}`;

    const rijen = parseClientsCsv(csv);
    expect(rijen[0].errors).toContain('klantnaam ontbreekt');
  });
});
