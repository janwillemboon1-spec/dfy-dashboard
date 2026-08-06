'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';
import { syncListing, volgendeMaand } from '@/lib/pricelabs/sync';

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
