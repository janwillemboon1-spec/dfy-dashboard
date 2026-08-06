'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchReservationData } from '@/lib/pricelabs/client';
import { volgendeMaand } from '@/lib/pricelabs/sync';

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

      // Start vanaf de maand NA de laatste nulmeting-maand — consistent met hoe
      // koppelListing/syncListingNow (Fase 2a) de backfill-periode bepalen, niet
      // vanaf de laatste nulmeting-maand zelf (die is al gedekt door de nulmeting).
      const nulmetingMaandenMs = (listing.nulmeting ?? []).map((r) => Date.UTC(r.jaar, r.maand - 1, 1));
      let vanaf: Date;
      if (nulmetingMaandenMs.length > 0) {
        const laatsteNulmeting = new Date(Math.max(...nulmetingMaandenMs));
        const volgende = volgendeMaand(laatsteNulmeting.getUTCFullYear(), laatsteNulmeting.getUTCMonth() + 1);
        vanaf = new Date(Date.UTC(volgende.jaar, volgende.maand - 1, 1));
      } else {
        vanaf = new Date();
      }
      // De STLY-vergelijking (Fase 2c) heeft reserveringsniveau-data nodig van tot een
      // jaar terug — als de laatste nulmeting-maand recent is (bv. net onboarded), start
      // "de maand na de nulmeting" te dichtbij om STLY te kunnen vullen. Daarom hier altijd
      // minstens 2 jaar terug ophalen, ook als dat vóór het einde van de nulmeting ligt: dat
      // overlapt onschadelijk met de nulmeting (huidig/STLY en nulmeting worden nooit bij
      // elkaar opgeteld, zie omzet-aggregatie.ts en nulmeting-metrics.ts). Voorheen stond
      // hier de omgekeerde vergelijking (`vanaf < tweeJaarTerug`), die alleen een bovengrens
      // op de terugkijkperiode zette i.p.v. de ondergrens die STLY nodig heeft — daardoor
      // kwam er bij een recente nulmeting vrijwel geen STLY-data binnen.
      const tweeJaarTerug = new Date();
      tweeJaarTerug.setUTCFullYear(tweeJaarTerug.getUTCFullYear() - 2);
      if (vanaf > tweeJaarTerug) vanaf = tweeJaarTerug;

      const reserveringen = await fetchReservationData({
        pms: cacheRow.pms,
        listingId: listing.pricelabs_listing_id!,
        startDate: vanaf.toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
      });

      // Alle drie de guards hieronder matchen de check-constraints op
      // pricelabs_reserveringen_cache (Taak 1) — één kapotte reservering mag anders de
      // hele upsert-chunk (tot 500 rijen) laten falen op een constraint-violation, wat
      // ook alle geldige reserveringen in diezelfde chunk zou blokkeren.
      const rijen = reserveringen
        .map((r) => {
          const rentalRevenue = Number(r.rental_revenue);
          if (Number.isNaN(rentalRevenue) || rentalRevenue < 0) {
            console.warn(`[syncEigenListings] ongeldige rental_revenue overgeslagen voor reservering ${r.reservation_id}`);
            return null;
          }
          if (!(r.check_out > r.check_in)) {
            console.warn(`[syncEigenListings] check_out niet na check_in, reservering ${r.reservation_id} overgeslagen`);
            return null;
          }
          const totalCost = r.total_cost ? Number(r.total_cost) : null;
          if (totalCost !== null && (Number.isNaN(totalCost) || totalCost < 0)) {
            console.warn(`[syncEigenListings] ongeldige total_cost overgeslagen voor reservering ${r.reservation_id}`);
            return null;
          }
          return {
            listing_id: listing.id,
            reservation_id: r.reservation_id,
            check_in: r.check_in,
            check_out: r.check_out,
            rental_revenue: rentalRevenue,
            total_cost: totalCost,
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
  // succes: true betekent hier alleen "de actie is uitgevoerd zonder er zelf op vast te
  // lopen" — niet "elke listing is gelukt". Callers moeten resultaten[].succes per rij
  // bekijken; het is legitiem dat alle rijen daarin succes: false hebben.
  return { succes: true, resultaten };
}
