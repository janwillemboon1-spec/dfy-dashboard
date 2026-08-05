import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchReservationData, type PricelabsReservering } from './client';

export interface MaandTotaal {
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

export function dagenInMaand(jaar: number, maand: number): number {
  return new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
}

export function volgendeMaand(jaar: number, maand: number): { jaar: number; maand: number } {
  return maand === 12 ? { jaar: jaar + 1, maand: 1 } : { jaar, maand: maand + 1 };
}

function maandSleutel(jaar: number, maand: number): string {
  return `${jaar}-${String(maand).padStart(2, '0')}`;
}

export function berekenMaandTotalen(
  reserveringen: PricelabsReservering[],
  vanaf: { jaar: number; maand: number },
  tot: { jaar: number; maand: number }
): MaandTotaal[] {
  const nachtenPerMaand = new Map<string, number>();
  const omzetPerMaand = new Map<string, number>();

  let cursor = vanaf;
  while (cursor.jaar < tot.jaar || (cursor.jaar === tot.jaar && cursor.maand <= tot.maand)) {
    const sleutel = maandSleutel(cursor.jaar, cursor.maand);
    nachtenPerMaand.set(sleutel, 0);
    omzetPerMaand.set(sleutel, 0);
    cursor = volgendeMaand(cursor.jaar, cursor.maand);
  }

  for (const reservering of reserveringen) {
    if (reservering.booking_status !== 'booked') continue;

    const checkIn = new Date(`${reservering.check_in}T00:00:00Z`);
    const checkOut = new Date(`${reservering.check_out}T00:00:00Z`);
    const totaalNachten = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
    if (totaalNachten <= 0) continue;

    const nachtenPerMaandVoorDezeBoeking = new Map<string, number>();
    for (let i = 0; i < totaalNachten; i++) {
      const nacht = new Date(checkIn.getTime() + i * 86_400_000);
      const sleutel = maandSleutel(nacht.getUTCFullYear(), nacht.getUTCMonth() + 1);
      if (!nachtenPerMaand.has(sleutel)) continue; // buiten het gevraagde venster
      nachtenPerMaandVoorDezeBoeking.set(sleutel, (nachtenPerMaandVoorDezeBoeking.get(sleutel) ?? 0) + 1);
      nachtenPerMaand.set(sleutel, nachtenPerMaand.get(sleutel)! + 1);
    }

    const rentalRevenue = Number(reservering.rental_revenue);
    for (const [sleutel, nachtenInMaand] of nachtenPerMaandVoorDezeBoeking) {
      const aandeel = (nachtenInMaand / totaalNachten) * rentalRevenue;
      omzetPerMaand.set(sleutel, omzetPerMaand.get(sleutel)! + aandeel);
    }
  }

  const resultaat: MaandTotaal[] = [];
  for (const sleutel of nachtenPerMaand.keys()) {
    const [jaarStr, maandStr] = sleutel.split('-');
    const jaar = Number(jaarStr);
    const maand = Number(maandStr);
    const nachten = nachtenPerMaand.get(sleutel)!;
    const omzet = omzetPerMaand.get(sleutel)!;
    resultaat.push({
      jaar,
      maand,
      omzet: Math.round(omzet * 100) / 100,
      bezetting: Math.round((nachten / dagenInMaand(jaar, maand)) * 10000) / 100,
    });
  }
  return resultaat;
}

export async function syncListing(
  supabase: SupabaseClient<Database>,
  input: {
    listingId: string;
    pricelabsListingId: string;
    pms: string;
    vanaf: { jaar: number; maand: number };
    tot: { jaar: number; maand: number };
  }
): Promise<void> {
  const startDate = `${input.vanaf.jaar}-${String(input.vanaf.maand).padStart(2, '0')}-01`;
  const laatsteDag = dagenInMaand(input.tot.jaar, input.tot.maand);
  const endDate = `${input.tot.jaar}-${String(input.tot.maand).padStart(2, '0')}-${String(laatsteDag).padStart(2, '0')}`;

  const reserveringen = await fetchReservationData({
    pms: input.pms,
    listingId: input.pricelabsListingId,
    startDate,
    endDate,
  });

  const maandTotalen = berekenMaandTotalen(reserveringen, input.vanaf, input.tot);
  const nu = new Date().toISOString();

  const { error } = await supabase.from('monthly_actuals').upsert(
    maandTotalen.map((rij) => ({
      listing_id: input.listingId,
      jaar: rij.jaar,
      maand: rij.maand,
      omzet: rij.omzet,
      bezetting: rij.bezetting,
      laatst_gesynchroniseerd: nu,
    })),
    { onConflict: 'listing_id,jaar,maand' }
  );

  if (error) {
    throw new Error(`Kon monthly_actuals niet bijwerken voor listing ${input.listingId}: ${error.message}`);
  }
}
