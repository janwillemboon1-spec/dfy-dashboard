import { aggregeer, dagenInPeriode, groepeerPerListing, type CacheReservering, type OmzetMetrics } from './omzet-aggregatie';
import { nulmetingAlsMetrics, type NulmetingRij } from './nulmeting-metrics';

export function shiftJaar(datum: string, jaren: number): string {
  return datum.replace(/^(\d{4})/, (jaarStr) => String(Number(jaarStr) + jaren));
}

// PostgREST's max_rows staat op 1000 (supabase/config.toml) — geen paginering op de
// reserveringen-queries die deze rijen aanleveren, dus een resultaat van precies 1000 rijen
// is een signaal dat de data mogelijk afgekapt is i.p.v. compleet. Geen harde fout (de
// dashboardcijfers zijn dan nog steeds bruikbaar, alleen mogelijk een onderschatting), wel
// zichtbaar loggen zodat dit opvalt vóórdat een klant het zelf meldt.
const MAX_RIJEN_PER_QUERY = 1000;
export function waarschuwBijMogelijkeAfkapping(label: string, rijen: unknown[] | null): void {
  if ((rijen?.length ?? 0) >= MAX_RIJEN_PER_QUERY) {
    console.warn(`[omzet-voor-periode] ${label}: ${rijen!.length} rijen opgehaald — mogelijk afgekapt door PostgREST's max_rows.`);
  }
}

export interface OmzetVoorPeriodeListing {
  id: string;
  naam: string;
  nulmeting: NulmetingRij[];
}

export interface TrendPunt {
  maand: string;
  omzet: number;
  omzetStly: number;
  omzetNulmeting: number | null;
}

export interface OmzetData {
  periode: { start: string; eind: string; stlyStart: string; stlyEind: string };
  periodeType: 'vast' | 'eigen';
  portfolio: OmzetMetrics;
  portfolioStly: OmzetMetrics;
  portfolioNulmeting: OmzetMetrics | null;
  listings: Array<
    OmzetMetrics & { listing_id: string; listing_naam: string; stly: OmzetMetrics; nulmeting: OmzetMetrics | null; trend: TrendPunt[] }
  >;
  trend: TrendPunt[];
}

export function berekenOmzetVoorPeriode({
  listings,
  huidigeRijen,
  stlyRijen,
  start,
  eind,
  periodeType,
}: {
  listings: OmzetVoorPeriodeListing[];
  huidigeRijen: CacheReservering[];
  stlyRijen: CacheReservering[];
  start: string;
  eind: string;
  periodeType: 'vast' | 'eigen';
}): OmzetData {
  const stlyStart = shiftJaar(start, -1);
  const stlyEind = shiftJaar(eind, -1);

  const aantalListings = listings.length;
  const dagen = dagenInPeriode(start, eind);
  const stlyDagen = dagenInPeriode(stlyStart, stlyEind);

  const alleNulmeting: NulmetingRij[] = listings.flatMap((l) => l.nulmeting ?? []);

  // aggregeer() gebruikt een exclusieve periodeEind (net als check_out) om de overlap per
  // reservering te bepalen — eind/stlyEind zelf zijn de laatste inclusieve kalenderdag
  // (dagenInPeriode telt daarom ook inclusief), dus hier +1 dag zodat een reservering die
  // op eind zelf incheckt niet ten onrechte buiten de periode valt.
  function exclusieveGrens(datum: string): string {
    const d = new Date(`${datum}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const eindExclusief = exclusieveGrens(eind);
  const stlyEindExclusief = exclusieveGrens(stlyEind);

  const portfolio = aggregeer(huidigeRijen, start, eindExclusief, dagen * aantalListings);
  const portfolioStly = aggregeer(stlyRijen, stlyStart, stlyEindExclusief, stlyDagen * aantalListings);
  const portfolioNulmeting = periodeType === 'vast' ? nulmetingAlsMetrics(alleNulmeting, start, eind) : null;

  const perListingHuidig = groepeerPerListing(huidigeRijen);
  const perListingStly = groepeerPerListing(stlyRijen);

  const trendMaanden: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const eindMaand = eind.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= eindMaand) {
    trendMaanden.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  function maandGrenzen(maand: string): { start: string; eind: string } {
    const [jaarStr, maandNummerStr] = maand.split('-');
    const jaar = Number(jaarStr);
    const maandNummer = Number(maandNummerStr);
    const volgende = maandNummer === 12 ? { jaar: jaar + 1, maand: 1 } : { jaar, maand: maandNummer + 1 };
    return {
      start: `${maand}-01`,
      eind: `${volgende.jaar}-${String(volgende.maand).padStart(2, '0')}-01`,
    };
  }

  // Hergebruikt door zowel de portfolio-trend als de per-woning trend hieronder — telkens
  // met een andere (al overlap-gefetchte) subset van dezelfde rijen, zodat een reservering
  // die een maandgrens overschrijdt vanzelf naar rato meetelt in beide maanden, exact zoals
  // de (voorheen alleen portfolio-brede) trend dat al deed vóór deze functie werd
  // uitgesplitst in een herbruikbare helper.
  function berekenTrend(rijen: CacheReservering[], stlyRijenVoorTrend: CacheReservering[], nulmetingRijen: NulmetingRij[]): TrendPunt[] {
    return trendMaanden.map((maand) => {
      const stlyMaand = shiftJaar(`${maand}-01`, -1).slice(0, 7);
      const [, maandNummerStr] = maand.split('-');
      const maandNummer = Number(maandNummerStr);
      const omzetNulmeting = periodeType === 'vast'
        ? nulmetingRijen.filter((r) => r.maand === maandNummer).reduce((s, r) => s + r.omzet, 0)
        : null;
      const { start: maandStart, eind: maandEind } = maandGrenzen(maand);
      const { start: stlyMaandStart, eind: stlyMaandEind } = maandGrenzen(stlyMaand);
      return {
        maand,
        omzet: aggregeer(rijen, maandStart, maandEind, 30).omzet,
        omzetStly: aggregeer(stlyRijenVoorTrend, stlyMaandStart, stlyMaandEind, 30).omzet,
        omzetNulmeting,
      };
    });
  }

  const listingsUitkomst = listings.map((l) => {
    const eigenHuidigeRijen = perListingHuidig[l.id] ?? [];
    const eigenStlyRijen = perListingStly[l.id] ?? [];
    const metrics = aggregeer(eigenHuidigeRijen, start, eindExclusief, dagen);
    const stlyMetrics = aggregeer(eigenStlyRijen, stlyStart, stlyEindExclusief, stlyDagen);
    const nulmetingMetrics = periodeType === 'vast' ? nulmetingAlsMetrics(l.nulmeting ?? [], start, eind) : null;
    return {
      listing_id: l.id,
      listing_naam: l.naam,
      ...metrics,
      stly: stlyMetrics,
      nulmeting: nulmetingMetrics,
      trend: berekenTrend(eigenHuidigeRijen, eigenStlyRijen, l.nulmeting ?? []),
    };
  }).sort((a, b) => b.omzet - a.omzet);

  const trend = berekenTrend(huidigeRijen, stlyRijen, alleNulmeting);

  return {
    periode: { start, eind, stlyStart, stlyEind },
    periodeType,
    portfolio,
    portfolioStly,
    portfolioNulmeting,
    listings: listingsUitkomst,
    trend,
  };
}
