import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import { verversPricelabsCache } from '../src/lib/pricelabs/ververs-cache';
import { syncListing, volgendeMaand } from '../src/lib/pricelabs/sync';

// Los script, geen onderdeel van de Next.js-appbundel — gedraaid door een aparte
// Railway-service met een native Cron Schedule. Bouwt daarom zijn eigen
// service-role Supabase-client i.p.v. lib/supabase/admin.ts te hergebruiken: dat
// bestand start met `import 'server-only'`, wat buiten Next.js' build (dus ook
// hier, via een los `tsx`-proces) een harde runtime-fout geeft.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    '[sync-pricelabs-cron] NEXT_PUBLIC_SUPABASE_URL en/of SUPABASE_SERVICE_ROLE_KEY ontbreken — controleer de env vars van deze Railway-service.'
  );
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  try {
    await verversPricelabsCache(supabase);
  } catch (fout) {
    // Een mislukte cache-refresh mag de sync van bestaande koppelingen niet
    // blokkeren: elke listing hieronder leest zijn pms via een aparte, losstaande
    // SELECT op de al eerder gepersisteerde cache-rij, niet op het resultaat van
    // deze refresh-poging. Alleen een kapotte upsert ná een geslaagde fetch mag
    // hard falen (zie ververs-cache.ts) — een fetch-fout hier niet.
    console.error('[sync-pricelabs-cron] cache verversen mislukt, ga door met bestaande cache:', fout);
  }

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

  const geslaagd: string[] = [];
  const mislukt: string[] = [];

  for (const listing of listings ?? []) {
    try {
      const { data: cacheRow, error: cacheError } = await supabase
        .from('pricelabs_listings_cache')
        .select('pms')
        .eq('pricelabs_listing_id', listing.pricelabs_listing_id!)
        .single();

      if (cacheError) {
        console.error(`[sync-pricelabs-cron] kon cache-rij niet ophalen voor listing ${listing.id}:`, cacheError.message);
        mislukt.push(listing.id);
        continue;
      }
      if (!cacheRow?.pms) {
        console.error(`[sync-pricelabs-cron] geen pms bekend voor listing ${listing.id}, overgeslagen`);
        mislukt.push(listing.id);
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
      geslaagd.push(listing.id);
    } catch (fout) {
      console.error(`[sync-pricelabs-cron] listing ${listing.id} mislukt:`, fout);
      mislukt.push(listing.id);
    }
  }

  console.log(
    `[sync-pricelabs-cron] klaar — ${geslaagd.length} geslaagd, ${mislukt.length} mislukt` +
      (mislukt.length > 0 ? ` (${mislukt.join(', ')})` : '')
  );
}

main().then(
  () => process.exit(0),
  (fout) => {
    console.error('[sync-pricelabs-cron] fatale fout:', fout);
    process.exit(1);
  }
);
