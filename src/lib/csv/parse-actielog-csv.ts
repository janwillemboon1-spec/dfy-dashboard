import Papa from 'papaparse';

export interface ActielogCsvRow {
  accommodatienaam: string;
  datum: string;
  omschrijving: string;
  type?: string;
}

// Anders dan in parse-clients-csv is er hier geen numerieke coercion die een
// ongeldige waarde stilzwijgend als geldig zou kunnen laten lijken (bv. NaN).
// Alle velden hieronder bevatten de ruwe brontekst; controleer altijd eerst
// `errors` voordat je een rij als geldig behandelt, maar er is geen extra
// "misleidende waarde" risico zoals bij omzet/bezetting in de andere parser.
export interface ParsedActielogRow {
  rowIndex: number;
  accommodatienaam: string;
  datum: string;
  omschrijving: string;
  type: string;
  errors: string[];
}

export function parseActielogCsv(csvText: string): ParsedActielogRow[] {
  const { data } = Papa.parse<ActielogCsvRow>(csvText, { header: true, skipEmptyLines: true });

  return data.map((row, index) => {
    const errors: string[] = [];

    if (!row.accommodatienaam?.trim()) errors.push('accommodatienaam ontbreekt');
    if (!row.datum?.trim() || Number.isNaN(Date.parse(row.datum))) errors.push('datum is ongeldig');
    if (!row.omschrijving?.trim()) errors.push('omschrijving ontbreekt');

    return {
      rowIndex: index + 2,
      accommodatienaam: row.accommodatienaam,
      datum: row.datum,
      omschrijving: row.omschrijving,
      type: row.type?.trim() || 'overig',
      errors,
    };
  });
}
