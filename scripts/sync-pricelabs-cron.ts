import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import { verversPricelabsCache } from '../src/lib/pricelabs/ververs-cache';
import { syncListing, volgendeMaand } from '../src/lib/pricelabs/sync';

// Los script, geen onderdeel van de Next.js-appbundel — gedraaid door een aparte
// Railway-service met een native Cron Schedule. Bouwt daarom zijn eigen
// service-role Supabase-client i.p.v. lib/supabase/admin.ts te hergebruiken: dat
// bestand start met `import 'server-only'`, wat buiten Next.js' build (dus ook
// hier, via een los `tsx`-proces) een harde runtime-fout geeft.
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function huidigeMaand(): { jaar: number; maand: number } {
  const nu = new Date();
  return { jaar: nu.getUTCFullYear(), maand: nu.getUTCMonth() + 1 };
}

function maandenTerug(vanaf: { jaar: number; maand: number }, aantal: number): { jaar: number; maand: number } {
  let resultaat = vanaf;
  for (let i = 0; i < aantal; i++) {
    resultaat =
      resultaat.maand === 1
        ? { jaar: resultaat.jaar - 1, maand: 12 }
        : { jaar: resultaat.jaar, maand: resultaat.maand - 1 };
  }
  return resultaat;
}

async function main() {
  console.log('[sync-pricelabs-cron] cache verversen...');
  await verversPricelabsCache(supabase);

  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, pricelabs_listing_id')
    .not('pricelabs_listing_id', 'is', null);

  if (error) throw new Error(`Kon gekoppelde listings niet ophalen: ${error.message}`);

  // Glijdend venster: laatste 2 maanden t/m volgende maand, i.p.v. alleen
  // "vandaag" — boekingen kunnen achteraf nog geannuleerd of laat geboekt worden,
  // en dat moet in de al eerder gesynchroniseerde maand terechtkomen.
  const nu = huidigeMaand();
  const vanaf = maandenTerug(nu, 2);
  const tot = volgendeMaand(nu.jaar, nu.maand);

  console.log(
    `[sync-pricelabs-cron] ${listings?.length ?? 0} gekoppelde listings, venster ${vanaf.jaar}-${vanaf.maand} t/m ${tot.jaar}-${tot.maand}`
  );

  for (const listing of listings ?? []) {
    try {
      const { data: cacheRow } = await supabase
        .from('pricelabs_listings_cache')
        .select('pms')
        .eq('pricelabs_listing_id', listing.pricelabs_listing_id!)
        .single();

      if (!cacheRow?.pms) {
        console.error(`[sync-pricelabs-cron] geen pms bekend voor listing ${listing.id}, overgeslagen`);
        continue;
      }

      await syncListing(supabase, {
        listingId: listing.id,
        pricelabsListingId: listing.pricelabs_listing_id!,
        pms: cacheRow.pms,
        vanaf,
        tot,
      });
      console.log(`[sync-pricelabs-cron] listing ${listing.id} gesynchroniseerd`);
    } catch (fout) {
      console.error(`[sync-pricelabs-cron] listing ${listing.id} mislukt:`, fout);
    }
  }

  console.log('[sync-pricelabs-cron] klaar');
}

main().then(
  () => process.exit(0),
  (fout) => {
    console.error('[sync-pricelabs-cron] fatale fout:', fout);
    process.exit(1);
  }
);
