import Papa from 'papaparse';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

// Date.parse is te soepel en locale-ambigu (bv. "05/03/2025" of een kaal
// jaartal zoals "2025" worden stilzwijgend geaccepteerd, en "2025-02-30"
// rolt stilzwijgend door naar maart). Voor een handmatig bewerkt Excel-
// export is dat een reëel risico op een verkeerde datum zonder foutmelding.
// Daarom eisen we strikt ISO-formaat YYYY-MM-DD en wijzen we
// kalendarisch ongeldige datums (zoals 30 februari) expliciet af.
function isGeldigeIsoDatum(raw: string): boolean {
  const getrimd = raw.trim();
  if (!ISO_DATUM.test(getrimd)) return false;
  const [jaar, maand, dag] = getrimd.split('-').map(Number);
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  return (
    datum.getUTCFullYear() === jaar &&
    datum.getUTCMonth() === maand - 1 &&
    datum.getUTCDate() === dag
  );
}

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
    if (!row.datum?.trim() || !isGeldigeIsoDatum(row.datum)) errors.push('datum is ongeldig');
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
