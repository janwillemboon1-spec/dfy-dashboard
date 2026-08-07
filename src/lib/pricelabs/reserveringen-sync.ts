import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchReservationData } from './client';
import { volgendeMaand } from './sync';

export interface SyncListingReserveringenResultaat {
  succes: boolean;
  fout?: string;
  aantal?: number;
}

// Uitgetrokken uit syncEigenListings (src/app/[locale]/dashboard/actions.ts, Fase 2c) zodat
// zowel de klant-getriggerde sync (alle eigen listings) als de admin-getriggerde
// nulmeting-berekening (één specifieke listing, Fase 2d) dezelfde fetch->valideer->upsert-logica
// hergebruiken in plaats van 'm te dupliceren.
export async function syncListingReserveringen(params: {
  supabase: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  listing: {
    id: string;
    pricelabs_listing_id: string;
    nulmeting: { jaar: number; maand: number }[];
  };
}): Promise<SyncListingReserveringenResultaat> {
  const { supabase, admin, listing } = params;

  try {
    const { data: cacheRow } = await supabase
      .from('pricelabs_listings_cache')
      .select('pms')
      .eq('pricelabs_listing_id', listing.pricelabs_listing_id)
      .maybeSingle();

    if (!cacheRow?.pms) {
      return { succes: false, fout: 'PMS-type onbekend voor deze koppeling.' };
    }

    // Start vanaf de maand NA de laatste nulmeting-maand — consistent met hoe
    // koppelListing/syncListingNow (Fase 2a) de backfill-periode bepalen, niet
    // vanaf de laatste nulmeting-maand zelf (die is al gedekt door de nulmeting).
    const nulmetingMaandenMs = listing.nulmeting.map((r) => Date.UTC(r.jaar, r.maand - 1, 1));
    let vanaf: Date;
    if (nulmetingMaandenMs.length > 0) {
      const laatsteNulmeting = new Date(Math.max(...nulmetingMaandenMs));
      const volgende = volgendeMaand(laatsteNulmeting.getUTCFullYear(), laatsteNulmeting.getUTCMonth() + 1);
      vanaf = new Date(Date.UTC(volgende.jaar, volgende.maand - 1, 1));
    } else {
      vanaf = new Date();
    }
    // De STLY-vergelijking (Fase 2c) heeft reserveringsniveau-data nodig van tot een jaar
    // terug — als de laatste nulmeting-maand recent is (bv. net onboarded), start "de maand
    // na de nulmeting" te dichtbij om STLY te kunnen vullen. Daarom hier altijd minstens 2
    // jaar terug ophalen, ook als dat vóór het einde van de nulmeting ligt: dat overlapt
    // onschadelijk met de nulmeting (huidig/STLY en nulmeting worden nooit bij elkaar
    // opgeteld, zie omzet-aggregatie.ts en nulmeting-metrics.ts).
    const tweeJaarTerug = new Date();
    tweeJaarTerug.setUTCFullYear(tweeJaarTerug.getUTCFullYear() - 2);
    if (vanaf > tweeJaarTerug) vanaf = tweeJaarTerug;

    // Tot-datum bewust NIET "vandaag": het omzetdashboard toont ook lopende periodes zoals
    // "Dit jaar" die doorlopen tot na vandaag, en al bevestigde toekomstige boekingen horen
    // daar gewoon in mee te tellen. Dit verschilt bewust van Fase 2a's koppelListing/
    // syncListingNow (admin/klanten/[id]/actions.ts), die tot="huidige maand" gebruiken:
    // dat vult monthly_actuals, wat expliciet over "reeds gerealiseerde" omzet gaat, dus
    // toekomstige boekingen horen daar terecht niet in mee.
    const tweeJaarVooruit = new Date();
    tweeJaarVooruit.setUTCFullYear(tweeJaarVooruit.getUTCFullYear() + 2);

    const reserveringen = await fetchReservationData({
      pms: cacheRow.pms,
      listingId: listing.pricelabs_listing_id,
      startDate: vanaf.toISOString().slice(0, 10),
      endDate: tweeJaarVooruit.toISOString().slice(0, 10),
    });

    // Alle drie de guards hieronder matchen de check-constraints op
    // pricelabs_reserveringen_cache (Fase 2c Taak 1) — één kapotte reservering mag anders
    // de hele upsert-chunk (tot 500 rijen) laten falen op een constraint-violation, wat ook
    // alle geldige reserveringen in diezelfde chunk zou blokkeren.
    const rijen = reserveringen
      .map((r) => {
        const rentalRevenue = Number(r.rental_revenue);
        if (Number.isNaN(rentalRevenue) || rentalRevenue < 0) {
          console.warn(`[syncListingReserveringen] ongeldige rental_revenue overgeslagen voor reservering ${r.reservation_id}`);
          return null;
        }
        if (!(r.check_out > r.check_in)) {
          console.warn(`[syncListingReserveringen] check_out niet na check_in, reservering ${r.reservation_id} overgeslagen`);
          return null;
        }
        const totalCost = r.total_cost ? Number(r.total_cost) : null;
        if (totalCost !== null && (Number.isNaN(totalCost) || totalCost < 0)) {
          console.warn(`[syncListingReserveringen] ongeldige total_cost overgeslagen voor reservering ${r.reservation_id}`);
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

    // Vóór het wegschrijven van de verse data: alles wat al in de cache staat voor déze
    // listing binnen het opgevraagde datumbereik eerst verwijderen. Dit maakt de sync
    // "reconciling" i.p.v. alleen-toevoegend — zonder dit zouden reserveringen van een
    // eerdere (bv. per ongeluk andere) PriceLabs-koppeling voor altijd in de cache
    // blijven staan naast de nieuwe, en dubbel meetellen bij het optellen in
    // omzet-aggregatie.ts. Veilig: reserveringen hierboven is al een verse, volledige
    // fetch van exact hetzelfde bereik [vanaf, tweeJaarVooruit], dus er gaat geen
    // legitieme data verloren — alleen data die niet meer (of nooit) bij déze koppeling
    // hoorde. Vóór de upsert-loop, na een geslaagde fetch: als fetchReservationData
    // hierboven al gefaald had, was deze functie al in de catch-tak beland en wordt hier
    // dus nooit bestaande (mogelijk correcte) data verwijderd zonder vervanging.
    const { error: deleteError } = await admin
      .from('pricelabs_reserveringen_cache')
      .delete()
      .eq('listing_id', listing.id)
      .gte('check_in', vanaf.toISOString().slice(0, 10));
    if (deleteError) throw new Error(deleteError.message);

    for (let i = 0; i < rijen.length; i += 500) {
      const { error } = await admin
        .from('pricelabs_reserveringen_cache')
        .upsert(rijen.slice(i, i + 500), { onConflict: 'listing_id,reservation_id' });
      if (error) throw new Error(error.message);
    }

    return { succes: true, aantal: rijen.length };
  } catch (fout) {
    return { succes: false, fout: (fout as Error).message };
  }
}
