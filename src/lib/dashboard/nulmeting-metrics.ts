import { dagenInMaand } from '@/lib/pricelabs/sync';
import type { OmzetMetrics } from './omzet-aggregatie';

export interface NulmetingRij {
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

export function maandenInPeriode(start: string, eind: string): Set<number> {
  const maanden = new Set<number>();
  const cursor = new Date(`${start}T00:00:00Z`);
  const eindDatum = new Date(`${eind}T00:00:00Z`);
  while (cursor <= eindDatum) {
    maanden.add(cursor.getUTCMonth() + 1);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return maanden;
}

export function nulmetingAlsMetrics(nulmeting: NulmetingRij[], start: string, eind: string): OmzetMetrics {
  const maanden = maandenInPeriode(start, eind);
  const relevant = nulmeting.filter((r) => maanden.has(r.maand));

  // Onderscheid "geen nulmeting-data voor deze periode" (datakwaliteitsprobleem, bv. een
  // listing zonder onboarding-baseline) van "nulmeting was daadwerkelijk 0" — zelfde
  // reden als de console.warn in berekenMaandVergelijkingen (bereken-resultaten.ts):
  // stilzwijgend 0 teruggeven zou in de KPI-kaarten niet te onderscheiden zijn van een
  // echte 0-omzet-baseline.
  if (relevant.length === 0) {
    console.warn(
      `[nulmetingAlsMetrics] geen nulmeting-maanden gevonden voor periode ${start} t/m ${eind}`
    );
  }

  const omzet = relevant.reduce((s, r) => s + r.omzet, 0);
  const nachten = relevant.reduce((s, r) => s + (r.bezetting / 100) * dagenInMaand(r.jaar, r.maand), 0);
  const totaleDagen = relevant.reduce((s, r) => s + dagenInMaand(r.jaar, r.maand), 0);
  const adr = nachten > 0 ? omzet / nachten : 0;
  const bezetting = totaleDagen > 0 ? (nachten / totaleDagen) * 100 : 0;
  const revpar = totaleDagen > 0 ? omzet / totaleDagen : 0;

  // omzetIncl hergebruikt omzet: nulmeting heeft geen apart schoonmaakkosten-cijfer
  // (in tegenstelling tot echte reserveringen, die total_cost apart bijhouden) — dit
  // zijn dus bewust twee identiek ogende kaarten in de KPI-weergave bij nulmeting-modus,
  // geen bug.
  return { omzet, omzetIncl: omzet, adr, nachten, bezetting, revpar, kanalen: {} };
}
