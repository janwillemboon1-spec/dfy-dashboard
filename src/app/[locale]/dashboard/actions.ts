'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncListingReserveringen } from '@/lib/pricelabs/reserveringen-sync';

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
    const resultaat = await syncListingReserveringen({
      supabase,
      admin,
      listing: {
        id: listing.id,
        pricelabs_listing_id: listing.pricelabs_listing_id!,
        nulmeting: listing.nulmeting ?? [],
      },
    });
    resultaten.push({ listingNaam: listing.naam, ...resultaat });
  }

  revalidatePath('/dashboard');
  // succes: true betekent hier alleen "de actie is uitgevoerd zonder er zelf op vast te
  // lopen" — niet "elke listing is gelukt". Callers moeten resultaten[].succes per rij
  // bekijken; het is legitiem dat alle rijen daarin succes: false hebben.
  return { succes: true, resultaten };
}
