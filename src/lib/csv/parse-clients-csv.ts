import Papa from 'papaparse';

export interface ClientCsvRow {
  klantnaam: string;
  klant_email: string;
  klant_telefoon: string;
  accommodatienaam: string;
  adres: string;
  startmaand: string;
  [key: string]: string;
}

export interface ParsedListingRow {
  rowIndex: number;
  klantnaam: string;
  klantEmail: string;
  klantTelefoon: string;
  accommodatienaam: string;
  adres: string;
  nulmeting: { jaar: number; maand: number; omzet: number; bezetting: number }[];
  errors: string[];
}

export function berekenNulmetingMaanden(startmaand: string): { jaar: number; maand: number }[] {
  const match = /^(\d{4})-(\d{2})$/.exec(startmaand);
  if (!match) {
    throw new Error(`Ongeldige startmaand: "${startmaand}", verwacht formaat JJJJ-MM`);
  }
  const startJaar = Number(match[1]);
  const startMaand = Number(match[2]);
  if (startMaand < 1 || startMaand > 12) {
    throw new Error(`Ongeldige maand in startmaand: "${startmaand}"`);
  }

  const maanden: { jaar: number; maand: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const totaal = startMaand - 1 + i;
    const jaar = startJaar + Math.floor(totaal / 12);
    const maand = (totaal % 12) + 1;
    maanden.push({ jaar, maand });
  }
  return maanden;
}

export function parseClientsCsv(csvText: string): ParsedListingRow[] {
  const { data } = Papa.parse<ClientCsvRow>(csvText, { header: true, skipEmptyLines: true });

  return data.map((row, index) => {
    const errors: string[] = [];
    let nulmeting: ParsedListingRow['nulmeting'] = [];

    if (!row.klantnaam) errors.push('klantnaam ontbreekt');
    if (!row.klant_email) errors.push('klant_email ontbreekt');
    if (!row.accommodatienaam) errors.push('accommodatienaam ontbreekt');

    try {
      const maanden = berekenNulmetingMaanden(row.startmaand);
      nulmeting = maanden.map(({ jaar, maand }, i) => {
        const omzet = Number(row[`omzet_${i + 1}`]);
        const bezetting = Number(row[`bezetting_${i + 1}`]);
        if (Number.isNaN(omzet)) errors.push(`omzet_${i + 1} is geen geldig getal`);
        if (Number.isNaN(bezetting)) errors.push(`bezetting_${i + 1} is geen geldig getal`);
        return { jaar, maand, omzet, bezetting };
      });
    } catch (error) {
      errors.push((error as Error).message);
    }

    return {
      rowIndex: index + 2,
      klantnaam: row.klantnaam,
      klantEmail: row.klant_email,
      klantTelefoon: row.klant_telefoon,
      accommodatienaam: row.accommodatienaam,
      adres: row.adres,
      nulmeting,
      errors,
    };
  });
}
