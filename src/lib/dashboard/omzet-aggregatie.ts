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

export function aggregeer(reserveringen: CacheReservering[], totaleDagen: number): OmzetMetrics {
  const geboekt = reserveringen.filter((r) => r.booking_status === 'booked');

  const omzet = geboekt.reduce((s, r) => s + r.rental_revenue, 0);
  const omzetIncl = geboekt.reduce((s, r) => s + (r.total_cost ?? 0), 0);
  const nachten = geboekt.reduce((s, r) => s + r.no_of_days, 0);
  const adr = nachten > 0 ? omzet / nachten : 0;
  const bezetting = totaleDagen > 0 ? (nachten / totaleDagen) * 100 : 0;
  const revpar = totaleDagen > 0 ? omzet / totaleDagen : 0;

  const kanalen: Record<string, { omzet: number; boekingen: number }> = {};
  for (const r of geboekt) {
    const ruw = (r.booking_channel || 'overig').toLowerCase();
    const kanaal = ruw.includes('airbnb') ? 'airbnb' : ruw;
    if (!kanalen[kanaal]) kanalen[kanaal] = { omzet: 0, boekingen: 0 };
    kanalen[kanaal].omzet += r.rental_revenue;
    kanalen[kanaal].boekingen += 1;
  }

  return { omzet, omzetIncl, adr, nachten, bezetting, revpar, kanalen };
}

export function dagenInPeriode(start: string, eind: string): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${eind}T00:00:00Z`);
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86_400_000));
}

export function groepeerPerMaand(reserveringen: CacheReservering[]): Record<string, CacheReservering[]> {
  const map: Record<string, CacheReservering[]> = {};
  for (const r of reserveringen) {
    const maand = r.check_in.slice(0, 7);
    (map[maand] ??= []).push(r);
  }
  return map;
}

export function groepeerPerListing<T extends { listing_id: string }>(rijen: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of rijen) {
    (map[r.listing_id] ??= []).push(r);
  }
  return map;
}
