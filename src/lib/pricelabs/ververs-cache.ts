// Geen `import 'server-only'` hier — zelfde reden als client.ts: dit bestand wordt ook
// vanuit het losse cron-script (Taak 11) geïmporteerd, buiten Next.js' build om.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchAllListings } from './client';

export async function verversPricelabsCache(supabase: SupabaseClient<Database>): Promise<void> {
  const listings = await fetchAllListings();

  const { error } = await supabase.from('pricelabs_listings_cache').upsert(
    listings.map((listing) => ({
      pricelabs_listing_id: listing.id,
      naam: listing.name,
      pms: listing.pms,
      laatst_gesynchroniseerd: new Date().toISOString(),
    })),
    { onConflict: 'pricelabs_listing_id' }
  );

  if (error) {
    throw new Error(`Kon pricelabs_listings_cache niet verversen: ${error.message}`);
  }
}
