'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { syncEigenListings } from '@/app/[locale]/dashboard/actions';
import { Button } from '@/components/ui/button';
import { KpiKaarten } from './kpi-kaarten';
import { KanaalUitsplitsing } from './kanaal-uitsplitsing';
import { ListingsTabel } from './listings-tabel';
import { TrendTabel } from './trend-tabel';
import type { OmzetMetrics } from '@/lib/dashboard/omzet-aggregatie';

const PERIODES = [
  { id: 'deze_maand', label: 'Deze maand' },
  { id: 'vorige_maand', label: 'Vorige maand' },
  { id: 'dit_jaar', label: 'Dit jaar' },
  { id: 'eigen', label: 'Eigen periode' },
] as const;
type PeriodeId = (typeof PERIODES)[number]['id'];

function berekenPeriode(id: PeriodeId, eigenStart: string, eigenEind: string): { start: string; eind: string } {
  const nu = new Date();
  const jaar = nu.getFullYear();
  const maand = nu.getMonth();

  if (id === 'deze_maand') {
    const laatsteDag = new Date(jaar, maand + 1, 0).getDate();
    return { start: `${jaar}-${String(maand + 1).padStart(2, '0')}-01`, eind: `${jaar}-${String(maand + 1).padStart(2, '0')}-${laatsteDag}` };
  }
  if (id === 'vorige_maand') {
    const vorigeMaand = maand === 0 ? 11 : maand - 1;
    const vorigJaar = maand === 0 ? jaar - 1 : jaar;
    const laatsteDag = new Date(vorigJaar, vorigeMaand + 1, 0).getDate();
    return { start: `${vorigJaar}-${String(vorigeMaand + 1).padStart(2, '0')}-01`, eind: `${vorigJaar}-${String(vorigeMaand + 1).padStart(2, '0')}-${laatsteDag}` };
  }
  if (id === 'dit_jaar') {
    return { start: `${jaar}-01-01`, eind: `${jaar}-12-31` };
  }
  return { start: eigenStart, eind: eigenEind };
}

interface OmzetData {
  portfolio: OmzetMetrics;
  portfolioStly: OmzetMetrics;
  portfolioNulmeting: OmzetMetrics | null;
  listings: Array<OmzetMetrics & { listing_id: string; listing_naam: string; stly: OmzetMetrics; nulmeting: OmzetMetrics | null }>;
  trend: Array<{ maand: string; omzet: number; omzetStly: number; omzetNulmeting: number | null }>;
}

export function OmzetDashboard({ clientId }: { clientId?: string }) {
  const [periodeId, setPeriodeId] = useState<PeriodeId>('dit_jaar');
  const [eigenStart, setEigenStart] = useState('');
  const [eigenEind, setEigenEind] = useState('');
  const [vergelijkModus, setVergelijkModus] = useState<'stly' | 'nulmeting'>('stly');
  const [data, setData] = useState<OmzetData | null>(null);
  const [laden, setLaden] = useState(true);
  const [dataFoutmelding, setDataFoutmelding] = useState<string | null>(null);
  const [syncFoutmelding, setSyncFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Voorkomt dat een trage response een snellere overschrijft wanneer de klant snel
  // van periode wisselt of tijdens het laden op "synchroniseren" klikt: alleen de
  // laatst gestarte aanvraag mag nog state zetten.
  const laatsteAanvraagId = useRef(0);

  const laadData = useCallback(() => {
    if (periodeId === 'eigen') {
      if (!eigenStart || !eigenEind) {
        // Bumpt de teller ook hier: anders kan een nog lopende aanvraag van een eerder
        // ingevulde, geldige periode alsnog data zetten onder een inmiddels leeg
        // datumveld.
        laatsteAanvraagId.current += 1;
        return;
      }
      if (eigenStart > eigenEind) {
        laatsteAanvraagId.current += 1;
        setDataFoutmelding('De startdatum mag niet na de einddatum liggen.');
        return;
      }
    }
    const aanvraagId = ++laatsteAanvraagId.current;
    setLaden(true);
    setDataFoutmelding(null);
    const { start, eind } = berekenPeriode(periodeId, eigenStart, eigenEind);
    const periodeType = periodeId === 'eigen' ? 'eigen' : 'vast';
    const endpoint = clientId ? `/api/admin/klanten/${clientId}/omzet` : '/api/dashboard/omzet';
    fetch(`${endpoint}?start=${start}&eind=${eind}&periodeType=${periodeType}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Ophalen van omzetdata is mislukt.');
        return body as OmzetData;
      })
      .then((body) => {
        if (aanvraagId !== laatsteAanvraagId.current) return;
        setData(body);
      })
      .catch((fout: Error) => {
        if (aanvraagId !== laatsteAanvraagId.current) return;
        setDataFoutmelding(fout.message);
      })
      .finally(() => {
        if (aanvraagId !== laatsteAanvraagId.current) return;
        setLaden(false);
      });
  }, [periodeId, eigenStart, eigenEind, clientId]);

  useEffect(() => {
    // laadData zelf roept setLaden/setData aan (fetch naar een externe API-route) —
    // dat is precies het "synchroniseren met een extern systeem"-geval waarvoor effects
    // bedoeld zijn, geen state-afgeleide berekening die in render zou kunnen. De regel
    // hieronder klopt inhoudelijk; alleen de eslint-heuristiek herkent dat verschil niet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadData();
  }, [laadData]);

  function synchroniseer() {
    setSyncFoutmelding(null);
    startTransition(async () => {
      const resultaat = await syncEigenListings();
      if (!resultaat.succes) {
        setSyncFoutmelding(resultaat.fout ?? 'Onbekende fout bij synchroniseren.');
        return;
      }
      // succes: true betekent alleen dat de actie zelf niet is vastgelopen — niet dat
      // elke listing gelukt is (zie het commentaar bij syncEigenListings). Als alle
      // rijen individueel faalden, is dat voor de klant net zo goed een mislukte sync.
      const rijen = resultaat.resultaten ?? [];
      if (rijen.length > 0 && rijen.every((rij) => !rij.succes)) {
        setSyncFoutmelding(rijen[0].fout ?? 'Synchroniseren is voor geen enkele accommodatie gelukt.');
        return;
      }
      laadData();
    });
  }

  function kiesPeriode(id: PeriodeId) {
    setPeriodeId(id);
    // De nulmeting-vergelijking bestaat alleen voor vaste periodes (periodeType=vast) —
    // bij "Eigen periode" geeft de API altijd portfolioNulmeting: null terug. Zonder
    // deze reset blijft de Nulmeting-knop optisch actief terwijl hij niets vergelijkt.
    if (id === 'eigen') setVergelijkModus('stly');
  }

  const nulmetingBeschikbaar = periodeId !== 'eigen';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 border-b border-border">
          {PERIODES.map((p) => (
            <button
              key={p.id}
              onClick={() => kiesPeriode(p.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${periodeId === p.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVergelijkModus('stly')}
            disabled={!nulmetingBeschikbaar && vergelijkModus === 'stly'}
            className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${vergelijkModus === 'stly' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            STLY
          </button>
          <button
            onClick={() => setVergelijkModus('nulmeting')}
            disabled={!nulmetingBeschikbaar}
            className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${vergelijkModus === 'nulmeting' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            Nulmeting
          </button>
          {!clientId && (
            <Button size="sm" onClick={synchroniseer} disabled={isPending}>
              {isPending ? 'Bezig...' : 'Data synchroniseren'}
            </Button>
          )}
        </div>
      </div>

      {syncFoutmelding && <p className="text-sm text-destructive">{syncFoutmelding}</p>}

      {periodeId === 'eigen' && (
        <div className="flex items-center gap-3">
          <input type="date" value={eigenStart} onChange={(e) => setEigenStart(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-2" />
          <span className="text-muted-foreground">tot</span>
          <input type="date" value={eigenEind} onChange={(e) => setEigenEind(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-2" />
        </div>
      )}

      {dataFoutmelding && <p className="text-sm text-destructive">{dataFoutmelding}</p>}

      {laden ? (
        <p className="text-sm text-muted-foreground animate-pulse">Omzetdata ophalen...</p>
      ) : !data ? null : (
        <div className="space-y-8">
          <KpiKaarten
            huidig={data.portfolio}
            vergelijking={vergelijkModus === 'stly' ? data.portfolioStly : data.portfolioNulmeting}
            vergelijkLabel={vergelijkModus === 'stly' ? 'STLY' : 'nulmeting'}
          />
          <KanaalUitsplitsing kanalen={data.portfolio.kanalen} />
          <ListingsTabel listings={data.listings} />
          <TrendTabel trend={data.trend} vergelijkModus={vergelijkModus} />
        </div>
      )}
    </div>
  );
}
