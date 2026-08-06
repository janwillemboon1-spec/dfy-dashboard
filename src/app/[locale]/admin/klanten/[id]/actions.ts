'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';
import { syncListing, volgendeMaand, dagenInMaand } from '@/lib/pricelabs/sync';
import { syncListingReserveringen } from '@/lib/pricelabs/reserveringen-sync';
import { createAdminClient } from '@/lib/supabase/admin';
import { aggregeer, groepeerPerMaand } from '@/lib/dashboard/omzet-aggregatie';
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';

export async function corrigeerNulmeting(input: {
  nulmetingId: string;
  omzet: number;
  bezetting: number;
  reden: string;
  listingId: string;
  clientId: string;
}) {
  if (!input.reden.trim()) {
    throw new Error('Een reden is verplicht bij het corrigeren van de nulmeting.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: updated, error: updateError } = await supabase
    .from('nulmeting')
    .update({
      omzet: input.omzet,
      bezetting: input.bezetting,
      laatst_gecorrigeerd_op: new Date().toISOString(),
      correctie_reden: input.reden,
    })
    .eq('id', input.nulmetingId)
    .select()
    .single();

  if (updateError) {
    if (updateError.code === 'PGRST116') {
      throw new Error('Kon nulmeting niet vinden om te corrigeren.');
    }
    throw new Error(updateError.message);
  }
  if (!updated) {
    throw new Error('Kon nulmeting niet vinden om te corrigeren.');
  }

  const { error: logError } = await supabase.from('action_log').insert({
    listing_id: input.listingId,
    datum: new Date().toISOString().slice(0, 10),
    omschrijving: `Nulmeting gecorrigeerd: ${input.reden}`,
    type: 'nulmeting_correctie',
    toegevoegd_door: user?.id,
  });

  if (logError) throw new Error(logError.message);

  revalidatePath(`/admin/klanten/${input.clientId}`);
}

export async function voegActielogToe(input: {
  listingId: string;
  clientId: string;
  datum: string;
  omschrijving: string;
  type: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('action_log').insert({
    listing_id: input.listingId,
    datum: input.datum,
    omschrijving: input.omschrijving,
    type: input.type,
    toegevoegd_door: user?.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/klanten/${input.clientId}`);
}

export async function koppelListing(input: {
  listingId: string;
  clientId: string;
  pricelabsListingId: string;
  pms: string;
}) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { data: laatsteNulmeting, error: nulmetingError } = await supabase
    .from('nulmeting')
    .select('jaar, maand')
    .eq('listing_id', input.listingId)
    .order('jaar', { ascending: false })
    .order('maand', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (nulmetingError) throw new Error(nulmetingError.message);

  const { error: updateError } = await supabase
    .from('listings')
    .update({ pricelabs_listing_id: input.pricelabsListingId })
    .eq('id', input.listingId);

  if (updateError) {
    if (updateError.code === '23505') {
      throw new Error('Deze PriceLabs-listing is al aan een andere accommodatie gekoppeld.');
    }
    throw new Error(updateError.message);
  }

  // Zonder nulmeting: val terug op de huidige maand (net als syncListingNow hieronder al
  // doet) — er is dan geen bekend "waar eindigt de baseline"-punt om vanaf te backfillen,
  // dus monthly_actuals begint gewoon vanaf nu bij te houden.
  const nu = new Date();
  const huidigeMaand = { jaar: nu.getUTCFullYear(), maand: nu.getUTCMonth() + 1 };
  const vanaf = laatsteNulmeting ? volgendeMaand(laatsteNulmeting.jaar, laatsteNulmeting.maand) : huidigeMaand;

  await syncListing(supabase, {
    listingId: input.listingId,
    pricelabsListingId: input.pricelabsListingId,
    pms: input.pms,
    vanaf,
    tot: huidigeMaand,
  });

  revalidatePath(`/admin/klanten/${input.clientId}`);
}

export async function ontkoppelListing(input: { listingId: string; clientId: string }) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from('listings')
    .update({ pricelabs_listing_id: null })
    .eq('id', input.listingId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/klanten/${input.clientId}`);
}

export async function syncListingNow(input: { listingId: string; clientId: string }) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('pricelabs_listing_id')
    .eq('id', input.listingId)
    .single();

  if (listingError) throw new Error(listingError.message);
  if (!listing.pricelabs_listing_id) {
    throw new Error('Deze accommodatie is nog niet gekoppeld aan PriceLabs.');
  }

  const { data: cacheRow, error: cacheError } = await supabase
    .from('pricelabs_listings_cache')
    .select('pms')
    .eq('pricelabs_listing_id', listing.pricelabs_listing_id)
    .single();

  if (cacheError || !cacheRow?.pms) {
    throw new Error('Kon PMS-type niet bepalen voor deze PriceLabs-listing.');
  }

  const { data: laatsteNulmeting } = await supabase
    .from('nulmeting')
    .select('jaar, maand')
    .eq('listing_id', input.listingId)
    .order('jaar', { ascending: false })
    .order('maand', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nu = new Date();
  const huidigeMaand = { jaar: nu.getUTCFullYear(), maand: nu.getUTCMonth() + 1 };
  const vanaf = laatsteNulmeting ? volgendeMaand(laatsteNulmeting.jaar, laatsteNulmeting.maand) : huidigeMaand;

  await syncListing(supabase, {
    listingId: input.listingId,
    pricelabsListingId: listing.pricelabs_listing_id,
    pms: cacheRow.pms,
    vanaf,
    tot: huidigeMaand,
  });

  revalidatePath(`/admin/klanten/${input.clientId}`);
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

export interface NulmetingMaandResultaat {
  maand: number;
  bron: 'echt' | 'stly';
  omzet: number;
  bezetting: number;
  leeg: boolean;
}

export async function berekenNulmetingUitPricelabs(input: {
  listingId: string;
  clientId: string;
  samenwerkingGestart: string; // 'JJJJ-MM-DD'
}): Promise<{ jaar: number; maanden: NulmetingMaandResultaat[] }> {
  await assertIsAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!ISO_DATUM.test(input.samenwerkingGestart)) {
    throw new Error('Ongeldige datum voor samenwerking gestart.');
  }

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, naam, pricelabs_listing_id, nulmeting(jaar, maand)')
    .eq('id', input.listingId)
    .single();

  if (listingError) throw new Error(listingError.message);
  if (!listing.pricelabs_listing_id) {
    throw new Error('Koppel eerst deze accommodatie aan PriceLabs.');
  }

  const { error: updateError } = await supabase
    .from('listings')
    .update({ samenwerking_gestart: input.samenwerkingGestart })
    .eq('id', input.listingId);
  if (updateError) throw new Error(updateError.message);

  const syncResultaat = await syncListingReserveringen({
    supabase,
    admin,
    listing: {
      id: listing.id,
      pricelabs_listing_id: listing.pricelabs_listing_id,
      nulmeting: listing.nulmeting ?? [],
    },
  });
  if (!syncResultaat.succes) {
    throw new Error(`Synchroniseren met PriceLabs is mislukt: ${syncResultaat.fout}. Nulmeting is niet berekend.`);
  }

  const [startJaarStr, startMaandStr] = input.samenwerkingGestart.split('-');
  const startJaar = Number(startJaarStr);
  const startMaand = Number(startMaandStr);

  const bronnen = bepaalNulmetingBronnen(startJaar, startMaand);

  const { data: cacheRijen, error: cacheError } = await supabase
    .from('pricelabs_reserveringen_cache')
    .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
    .eq('listing_id', input.listingId)
    .gte('check_in', `${startJaar - 1}-01-01`)
    .lte('check_in', `${startJaar}-12-31`);
  if (cacheError) throw new Error(cacheError.message);

  const perMaand = groepeerPerMaand(cacheRijen ?? []);

  const maanden: NulmetingMaandResultaat[] = bronnen.map((bron) => {
    const sleutel = `${bron.bronJaar}-${String(bron.bronMaand).padStart(2, '0')}`;
    const rijen = perMaand[sleutel] ?? [];
    const metrics = aggregeer(rijen, dagenInMaand(bron.bronJaar, bron.bronMaand));
    return {
      maand: bron.maand,
      bron: bron.bron,
      omzet: Math.round(metrics.omzet * 100) / 100,
      // Defensieve clamp: nulmeting.bezetting heeft een DB check-constraint (0-100).
      // aggregeer() zou dat in theorie kunnen overschrijden bij overlappende
      // reserveringen; dat mag de hele berekening niet laten klappen op een
      // constraint-violation.
      bezetting: Math.min(100, Math.round(metrics.bezetting * 100) / 100),
      leeg: rijen.length === 0,
    };
  });

  const nulmetingRijen = maanden.map((m) => ({
    listing_id: input.listingId,
    jaar: startJaar,
    maand: m.maand,
    omzet: m.omzet,
    bezetting: m.bezetting,
    vastgesteld_op: new Date().toISOString(),
    laatst_gecorrigeerd_op: null,
    correctie_reden: null,
  }));

  const { error: upsertError } = await admin
    .from('nulmeting')
    .upsert(nulmetingRijen, { onConflict: 'listing_id,jaar,maand' });
  if (upsertError) throw new Error(upsertError.message);

  const { data: { user } } = await supabase.auth.getUser();
  const datumLabel = new Date(`${input.samenwerkingGestart}T00:00:00Z`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const { error: logError } = await supabase.from('action_log').insert({
    listing_id: input.listingId,
    datum: new Date().toISOString().slice(0, 10),
    omschrijving: `Nulmeting automatisch berekend uit PriceLabs (samenwerking gestart: ${datumLabel})`,
    type: 'nulmeting_berekend',
    toegevoegd_door: user?.id,
  });
  if (logError) throw new Error(logError.message);

  revalidatePath(`/admin/klanten/${input.clientId}`);

  return { jaar: startJaar, maanden };
}
