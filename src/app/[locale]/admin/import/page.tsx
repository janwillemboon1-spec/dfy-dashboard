'use client';

import { useState } from 'react';
import { parseClientsCsv, type ParsedListingRow } from '@/lib/csv/parse-clients-csv';
import { parseActielogCsv, type ParsedActielogRow } from '@/lib/csv/parse-actielog-csv';
import { importeerKlanten, importeerActielog, type ImportResultaat } from './actions';
import { Button } from '@/components/ui/button';

export default function ImportPage() {
  const [klantRijen, setKlantRijen] = useState<ParsedListingRow[]>([]);
  const [actielogRijen, setActielogRijen] = useState<ParsedActielogRow[]>([]);
  const [resultaten, setResultaten] = useState<ImportResultaat[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function onKlantBestand(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKlantRijen(parseClientsCsv(await file.text()));
  }

  async function onActielogBestand(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActielogRijen(parseActielogCsv(await file.text()));
  }

  const geldigeKlantRijen = klantRijen.filter((r) => r.errors.length === 0);
  const ongeldigeKlantRijen = klantRijen.filter((r) => r.errors.length > 0);

  async function bevestigImport() {
    setBezig(true);
    setFout(null);
    try {
      const klantResultaten = await importeerKlanten(geldigeKlantRijen);
      const actielogResultaten = actielogRijen.length
        ? await importeerActielog(actielogRijen.filter((r) => r.errors.length === 0))
        : [];
      setResultaten([...klantResultaten, ...actielogResultaten]);
    } catch (error) {
      setFout(error instanceof Error ? error.message : 'Onbekende fout bij importeren.');
    } finally {
      setBezig(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl py-10 px-4 space-y-8">
      <h1 className="font-serif text-2xl">Klanten importeren</h1>

      <section className="space-y-2">
        <a href="/voorbeeld-klanten.csv" download className="text-sm underline">
          Download voorbeeld-CSV (klanten)
        </a>
        <input type="file" accept=".csv" onChange={onKlantBestand} />
      </section>

      {klantRijen.length > 0 && (
        <section>
          <h2 className="font-medium mb-2">
            {geldigeKlantRijen.length} geldige rijen, {ongeldigeKlantRijen.length} met fouten
          </h2>
          {ongeldigeKlantRijen.length > 0 && (
            <ul className="text-sm text-destructive space-y-1 mb-4">
              {ongeldigeKlantRijen.map((rij) => (
                <li key={rij.rowIndex}>Rij {rij.rowIndex}: {rij.errors.join(', ')}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2">
        <a href="/voorbeeld-actielog.csv" download className="text-sm underline">
          Download voorbeeld-CSV (actielog, optioneel)
        </a>
        <input type="file" accept=".csv" onChange={onActielogBestand} />
      </section>

      <Button disabled={geldigeKlantRijen.length === 0 || bezig} onClick={bevestigImport}>
        {bezig ? 'Bezig...' : `Importeer ${geldigeKlantRijen.length} accommodatie(s)`}
      </Button>

      {fout && <p className="text-sm text-destructive">{fout}</p>}

      {resultaten && (
        <section>
          <h2 className="font-medium mb-2">Resultaat</h2>
          <ul className="text-sm space-y-1">
            {resultaten.map((r, i) => (
              <li key={i} className={r.succes ? 'text-green-600' : 'text-destructive'}>
                {r.bron === 'klant' ? 'Klanten-CSV' : 'Actielog-CSV'}, rij {r.rowIndex}: {r.succes ? 'gelukt' : r.fout}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
