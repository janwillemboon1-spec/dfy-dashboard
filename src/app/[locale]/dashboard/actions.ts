'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchReservationData } from '@/lib/pricelabs/client';

export interface SyncResultaat {
  listingNaam: string;
  succes: boolean;
  fout?: string;
  aantal?: number;
}

export async function syncEigenListings(): Promise<{ succes: boolean; fout?: string; resultaten?: SyncResultaat[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { succes: false, fout: 'Niet ingelogd.' };

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, pricelabs_listing_id, nulmeting(jaar, maand)')
    .not('pricelabs_listing_id', 'is', null);

  if (listingsError) return { succes: false, fout: listingsError.message };
  if (!listings || listings.length === 0) {
    return { succes: false, fout: 'Geen aan PriceLabs gekoppelde accommodaties gevonden.' };
  }

  const admin = createAdminClient();
  const resultaten: SyncResultaat[] = [];

  for (const listing of listings) {
    try {
      const { data: cacheRow } = await supabase
        .from('pricelabs_listings_cache')
        .select('pms')
        .eq('pricelabs_listing_id', listing.pricelabs_listing_id!)
        .maybeSingle();

      if (!cacheRow?.pms) {
        resultaten.push({ listingNaam: listing.naam, succes: false, fout: 'PMS-type onbekend voor deze koppeling.' });
        continue;
      }

      const nulmetingMaandenMs = (listing.nulmeting ?? []).map((r) => Date.UTC(r.jaar, r.maand - 1, 1));
      const nulmetingEind = nulmetingMaandenMs.length > 0 ? new Date(Math.max(...nulmetingMaandenMs)) : null;
      const tweeJaarTerug = new Date();
      tweeJaarTerug.setUTCFullYear(tweeJaarTerug.getUTCFullYear() - 2);
      const vanaf = nulmetingEind && nulmetingEind > tweeJaarTerug ? nulmetingEind : tweeJaarTerug;

      const reserveringen = await fetchReservationData({
        pms: cacheRow.pms,
        listingId: listing.pricelabs_listing_id!,
        startDate: vanaf.toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
      });

      const rijen = reserveringen
        .map((r) => {
          const rentalRevenue = Number(r.rental_revenue);
          if (Number.isNaN(rentalRevenue)) {
            console.warn(`[syncEigenListings] niet-numerieke rental_revenue overgeslagen voor reservering ${r.reservation_id}`);
            return null;
          }
          return {
            listing_id: listing.id,
            reservation_id: r.reservation_id,
            check_in: r.check_in,
            check_out: r.check_out,
            rental_revenue: rentalRevenue,
            total_cost: r.total_cost ? Number(r.total_cost) : null,
            no_of_days: r.no_of_days,
            booking_status: r.booking_status,
            booking_channel: r.booking_channel ?? null,
            laatst_gesynchroniseerd: new Date().toISOString(),
          };
        })
        .filter((rij): rij is NonNullable<typeof rij> => rij !== null);

      for (let i = 0; i < rijen.length; i += 500) {
        const { error } = await admin
          .from('pricelabs_reserveringen_cache')
          .upsert(rijen.slice(i, i + 500), { onConflict: 'listing_id,reservation_id' });
        if (error) throw new Error(error.message);
      }

      resultaten.push({ listingNaam: listing.naam, succes: true, aantal: rijen.length });
    } catch (fout) {
      resultaten.push({ listingNaam: listing.naam, succes: false, fout: (fout as Error).message });
    }
  }

  revalidatePath('/dashboard');
  return { succes: true, resultaten };
}
