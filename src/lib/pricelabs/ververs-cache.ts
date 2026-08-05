// Geen `import 'server-only'` hier — zelfde reden als client.ts: dit bestand wordt ook
// vanuit het losse cron-script (Taak 11) geïmporteerd, buiten Next.js' build om.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchAllListings } from './client';

export async function verversPricelabsCache(supabase: SupabaseClient<Database>): Promise<void> {
  const listings = await fetchAllListings();
  const nu = new Date().toISOString();

  // Bewust geen per-listing validatie/filtering zoals berekenMaandTotalen die wel heeft
  // voor reserveringen: /v1/listings is de eigen, beheerde lijst van listings van het
  // master-account (een klein, eerste-partij bestand), niet variabele per-boeking data
  // van gasten. Eén kapotte listing die de hele batch laat falen is hier het gewenste
  // gedrag — liever een zichtbare fout dan een stilzwijgend halfgevulde cache.
  const { error } = await supabase.from('pricelabs_listings_cache').upsert(
    listings.map((listing) => ({
      pricelabs_listing_id: listing.id,
      naam: listing.name,
      pms: listing.pms,
      laatst_gesynchroniseerd: nu,
    })),
    { onConflict: 'pricelabs_listing_id' }
  );

  if (error) {
    throw new Error(`Kon pricelabs_listings_cache niet verversen: ${error.message}`);
  }
}
