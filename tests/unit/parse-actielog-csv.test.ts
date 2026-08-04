import { describe, it, expect } from 'vitest';
import { parseActielogCsv } from '@/lib/csv/parse-actielog-csv';

describe('parseActielogCsv', () => {
  it('parseert een geldige rij zonder fouten', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\nStrandhuisje,2025-03-15,Nieuwe fotos geplaatst,foto';
    const rijen = parseActielogCsv(csv);
    expect(rijen).toHaveLength(1);
    expect(rijen[0].errors).toEqual([]);
    expect(rijen[0].type).toBe('foto');
  });

  it('valt terug op type "overig" als type leeg is', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\nStrandhuisje,2025-03-15,Nieuwe fotos geplaatst,';
    const rijen = parseActielogCsv(csv);
    expect(rijen[0].type).toBe('overig');
  });

  it('markeert een ongeldige datum als fout', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\nStrandhuisje,niet-een-datum,Nieuwe fotos geplaatst,foto';
    const rijen = parseActielogCsv(csv);
    expect(rijen[0].errors).toContain('datum is ongeldig');
  });

  it('valt terug op type "overig" als type alleen witruimte bevat', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\nStrandhuisje,2025-03-15,Nieuwe fotos geplaatst, ';
    const rijen = parseActielogCsv(csv);
    expect(rijen[0].type).toBe('overig');
  });

  it('markeert een accommodatienaam die alleen witruimte bevat als ontbrekend', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\n ,2025-03-15,Nieuwe fotos geplaatst,foto';
    const rijen = parseActielogCsv(csv);
    expect(rijen[0].errors).toContain('accommodatienaam ontbreekt');
  });

  it('markeert een omschrijving die alleen witruimte bevat als ontbrekend', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\nStrandhuisje,2025-03-15, ,foto';
    const rijen = parseActielogCsv(csv);
    expect(rijen[0].errors).toContain('omschrijving ontbreekt');
  });

  it('markeert een datum die alleen witruimte bevat als ongeldig', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\nStrandhuisje,   ,Nieuwe fotos geplaatst,foto';
    const rijen = parseActielogCsv(csv);
    expect(rijen[0].errors).toContain('datum is ongeldig');
  });

  it('nummert rowIndex correct bij meerdere rijen', () => {
    const csv =
      'accommodatienaam,datum,omschrijving,type\n' +
      'Strandhuisje,2025-03-15,Eerste actie,foto\n' +
      'Bosvilla,2025-04-01,Tweede actie,prijsregel';
    const rijen = parseActielogCsv(csv);
    expect(rijen).toHaveLength(2);
    expect(rijen[0].rowIndex).toBe(2);
    expect(rijen[1].rowIndex).toBe(3);
  });

  it('verzamelt meerdere gelijktijdige fouten in dezelfde rij', () => {
    const csv = 'accommodatienaam,datum,omschrijving,type\n,niet-een-datum,Nieuwe fotos geplaatst,foto';
    const rijen = parseActielogCsv(csv);
    expect(rijen[0].errors).toContain('accommodatienaam ontbreekt');
    expect(rijen[0].errors).toContain('datum is ongeldig');
    expect(rijen[0].errors).toHaveLength(2);
  });
});
