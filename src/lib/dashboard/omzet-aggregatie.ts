export interface CacheReservering {
  listing_id: string;
  check_in: string;
  check_out: string;
  rental_revenue: number;
  total_cost: number | null;
  no_of_days: number;
  booking_status: string;
  booking_channel: string | null;
}

export interface OmzetMetrics {
  omzet: number;
  omzetIncl: number;
  adr: number;
  nachten: number;
  bezetting: number;
  revpar: number;
  kanalen: Record<string, { omzet: number; boekingen: number }>;
}

// Intervaloverlap in hele nachten tussen een reservering en [periodeStart, periodeEind).
// periodeEind is exclusief, net als check_out — een reservering met check_out gelijk aan
// periodeStart draagt dus 0 nachten bij, consistent met hoe periodes elders aaneensluiten
// (bv. de trendgrafiek: juli eindigt om 2025-08-01, augustus begint daar).
function overlapNachten(reservering: { check_in: string; check_out: string }, periodeStart: string, periodeEind: string): number {
  const checkIn = new Date(`${reservering.check_in}T00:00:00Z`).getTime();
  const checkOut = new Date(`${reservering.check_out}T00:00:00Z`).getTime();
  const start = new Date(`${periodeStart}T00:00:00Z`).getTime();
  const eind = new Date(`${periodeEind}T00:00:00Z`).getTime();
  const overlapStart = Math.max(checkIn, start);
  const overlapEind = Math.min(checkOut, eind);
  return Math.max(0, Math.round((overlapEind - overlapStart) / 86_400_000));
}

// periodeStart/periodeEind bepalen welk deel van elke reservering meetelt: een reservering
// die de grens overschrijdt (check_in vóór periodeStart, of check_out ná periodeEind) draagt
// alleen zijn overlappende nachten en het daarmee evenredige deel van de omzet bij. Dit
// geldt ook voor de kanalen-uitsplitsing, zodat de som van de kanalen altijd optelt tot het
// totaal hierboven. periodeEind is exclusief.
export function aggregeer(reserveringen: CacheReservering[], periodeStart: string, periodeEind: string, totaleDagen: number): OmzetMetrics {
  const geboekt = reserveringen.filter((r) => r.booking_status === 'booked');

  let omzet = 0;
  let omzetIncl = 0;
  let nachten = 0;
  const kanalen: Record<string, { omzet: number; boekingen: number }> = {};

  for (const r of geboekt) {
    const overlap = overlapNachten(r, periodeStart, periodeEind);
    if (overlap === 0) continue;

    const aandeel = r.no_of_days > 0 ? overlap / r.no_of_days : 0;
    const omzetAandeel = r.rental_revenue * aandeel;
    const omzetInclAandeel = (r.total_cost ?? 0) * aandeel;

    omzet += omzetAandeel;
    omzetIncl += omzetInclAandeel;
    nachten += overlap;

    const ruw = (r.booking_channel || 'overig').toLowerCase();
    const kanaal = ruw.includes('airbnb') ? 'airbnb' : ruw;
    if (!kanalen[kanaal]) kanalen[kanaal] = { omzet: 0, boekingen: 0 };
    kanalen[kanaal].omzet += omzetAandeel;
    kanalen[kanaal].boekingen += 1;
  }

  const adr = nachten > 0 ? omzet / nachten : 0;
  const bezetting = totaleDagen > 0 ? (nachten / totaleDagen) * 100 : 0;
  const revpar = totaleDagen > 0 ? omzet / totaleDagen : 0;

  return { omzet, omzetIncl, adr, nachten, bezetting, revpar, kanalen };
}

export function dagenInPeriode(start: string, eind: string): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${eind}T00:00:00Z`);
  // Inclusief beide grenzen (1 juli t/m 31 juli = 31 dagen, niet 30): dit moet dezelfde
  // kalenderdagen-basis zijn als dagenInMaand() in nulmeting-metrics.ts, anders wordt een
  // bezetting op basis van deze functie stelselmatig tegen een andere noemer vergeleken
  // dan de nulmeting-bezetting waarmee hij wordt afgezet.
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

export function groepeerPerListing<T extends { listing_id: string }>(rijen: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of rijen) {
    (map[r.listing_id] ??= []).push(r);
  }
  return map;
}
