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
      bezetting: (() => {
        // Defensieve clamp: nulmeting.bezetting heeft een DB check-constraint (0-100).
        // aggregeer() zou dat in theorie kunnen overschrijden bij overlappende
        // reserveringen; dat mag de hele berekening niet laten klappen op een
        // constraint-violation. Wél zichtbaar loggen — een clamp die stilzwijgend
        // gebeurt, verbergt een reëel datakwaliteitsprobleem (overlappende of
        // dubbel-getelde reserveringen) i.p.v. het te signaleren.
        const afgerond = Math.round(metrics.bezetting * 100) / 100;
        if (afgerond > 100) {
          console.warn(
            `[berekenNulmetingUitPricelabs] bezetting ${afgerond}% voor ${bron.bronJaar}-${String(bron.bronMaand).padStart(2, '0')} (listing ${input.listingId}) overschrijdt 100% — geclampt. Mogelijk overlappende reserveringen.`
          );
        }
        return Math.min(100, afgerond);
      })(),
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

  // Een nulmeting-baseline die via de onboarding-CSV is aangemaakt (berekenNulmetingMaanden
  // in parse-clients-csv.ts) start vaak niet in januari en spant dan bewust twee
  // kalenderjaren (bv. juli t/m juni). De klant-dashboardconsumenten van deze tabel
  // (nulmetingAlsMetrics hier, berekenMaandVergelijkingen in bereken-resultaten.ts) matchen
  // uitsluitend op maandnummer, niet op jaar — als hier alleen op (listing_id, startJaar,
  // maand) geüpsert wordt, blijven de rijen van het andere kalenderjaar van de oude baseline
  // staan. Voor de overlappende maandnummers zou dat dan twee rijen opleveren die bij het
  // uitlezen stilzwijgend bij elkaar opgeteld worden (dubbele omzet/bezetting). Daarom eerst
  // elke bestaande nulmeting-rij van déze listing buiten het nieuwe startjaar verwijderen,
  // zodat er na deze berekening weer precies één rij per maandnummer over is.
  const { error: deleteError } = await admin
    .from('nulmeting')
    .delete()
    .eq('listing_id', input.listingId)
    .neq('jaar', startJaar);
  if (deleteError) throw new Error(deleteError.message);

  const { error: upsertError } = await admin
    .from('nulmeting')
    .upsert(nulmetingRijen, { onConflict: 'listing_id,jaar,maand' });
  if (upsertError) throw new Error(upsertError.message);

  // Pas ná een geslaagde nulmeting-upsert wegschrijven, niet ervóór: anders zou een
  // mislukte sync of berekening (bv. syncListingReserveringen die faalt) alsnog een
  // samenwerking_gestart-datum achterlaten zonder dat de nulmeting daadwerkelijk is
  // (her)berekend — een klant-detailpagina die dan een datum toont die suggereert dat
  // de nulmeting al klopt, terwijl dat niet zo is.
  const { error: updateError } = await supabase
    .from('listings')
    .update({ samenwerking_gestart: input.samenwerkingGestart })
    .eq('id', input.listingId);
  if (updateError) throw new Error(updateError.message);

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

export async function wijzigKlant(input: {
  clientId: string;
  naam: string;
  email: string;
  telefoon: string | null;
  status: 'onboarding' | 'actief' | 'gepauzeerd' | 'opgezegd';
}) {
  await assertIsAdmin();

  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.email.trim()) throw new Error('E-mailadres is verplicht.');
  // Zonder deze check komt een getypte fout (geen @, geen domein) pas aan het licht bij
  // de externe auth.admin.updateUserById-aanroep verderop — ná clients.email al is
  // bijgewerkt — wat precies de inconsistentie hieronder veroorzaakt die we willen
  // voorkomen. Hier vroeg en goedkoop afvangen, vóór er iets geschreven wordt.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new Error('Ongeldig e-mailadres.');
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Snelle, goedkope voorcontrole op een dubbel e-mailadres, vóórdat er iets
  // geschreven wordt of de externe auth-aanroep plaatsvindt. De unieke index op
  // clients (hieronder nog als vangnet voor een race condition) zou dit anders pas
  // laten mislukken ná de clients-update — en die update gebeurt in de nieuwe volgorde
  // hieronder juist pas ná de auth-aanroep, dus zonder deze voorcontrole zou een
  // gewoon dubbel e-mailadres onnodig eerst een externe API-aanroep kosten.
  // Bewust .eq() i.p.v. .ilike(): ilike's patroonargument behandelt "_" en "%" als
  // wildcards, en die komen in echte e-mailadressen voor (bv. "john_doe@..."). Met
  // ilike zou zo'n adres per ongeluk kunnen "matchen" met een heel ander bestaand adres
  // en de bewerking dan ten onrechte blokkeren. .eq() is hoofdlettergevoelig (de
  // unieke index is dat niet), maar dat kost in het ergste geval alleen een overbodige
  // val-through naar de 23505-vangnet hieronder — geen correctheidsverlies.
  const { data: bestaandeClient, error: dubbelError } = await supabase
    .from('clients')
    .select('id')
    .eq('email', input.email.trim())
    .neq('id', input.clientId)
    .maybeSingle();
  if (dubbelError) throw new Error(dubbelError.message);
  if (bestaandeClient) {
    throw new Error('Dit e-mailadres is al in gebruik bij een andere klant.');
  }

  const { data: profiel, error: profielError } = await supabase
    .from('profiles')
    .select('id')
    .eq('client_id', input.clientId)
    .maybeSingle();
  if (profielError) throw new Error(profielError.message);

  // Eerst de externe Auth-aanroep (de meest risicovolle stap — netwerk, kan falen), pas
  // dáárna de lokale clients/profiles-rijen bijwerken. Andersom zou een mislukte
  // auth-aanroep clients.email (en profiles.email) al op het nieuwe adres laten staan
  // terwijl het daadwerkelijke inlogadres (auth.users.email) nog het oude is — dan toont
  // de app overal het nieuwe adres, terwijl de klant alleen nog met het oude kan
  // inloggen, zonder dat dat ergens zichtbaar is. In deze volgorde is er bij een
  // mislukte auth-aanroep nog helemaal niets weggeschreven.
  if (profiel) {
    const { error: authError } = await admin.auth.admin.updateUserById(profiel.id, {
      email: input.email,
      email_confirm: true,
    });
    if (authError) throw new Error(authError.message);
  }

  const { error: updateError } = await supabase
    .from('clients')
    .update({
      naam: input.naam,
      email: input.email,
      telefoon: input.telefoon,
      status: input.status,
    })
    .eq('id', input.clientId);

  if (updateError) {
    if (updateError.code === '23505') {
      throw new Error('Dit e-mailadres is al in gebruik bij een andere klant.');
    }
    throw new Error(updateError.message);
  }

  if (profiel) {
    const { error: profielUpdateError } = await supabase
      .from('profiles')
      .update({ email: input.email })
      .eq('id', profiel.id);
    if (profielUpdateError) throw new Error(profielUpdateError.message);
  }

  revalidatePath(`/admin/klanten/${input.clientId}`);
}

export async function verwijderKlant(input: { clientId: string }) {
  await assertIsAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: profiel, error: profielError } = await supabase
    .from('profiles')
    .select('id')
    .eq('client_id', input.clientId)
    .maybeSingle();
  if (profielError) throw new Error(profielError.message);

  // Eerst het inlogaccount verwijderen, dan pas de cascade-RPC — niet andersom. Als de
  // RPC eerst zou draaien en de auth-verwijdering daarna mislukt, blijft er een
  // inlogaccount over zonder profiel/klant erachter: niet meer zichtbaar of
  // opnieuw-te-verwijderen via het admin-scherm (de klant bestaat daar niet meer), maar
  // wel nog steeds bruikbaar om mee in te loggen. In deze volgorde geldt het omgekeerde:
  // `profiles.id references auth.users(id) on delete cascade` ruimt het profiel al op
  // zodra het inlogaccount weg is, dus als de RPC daarna alsnog mislukt, blijft de klant
  // (met lege/opgeruimde profielkoppeling) gewoon zichtbaar in /admin/klanten, en kan de
  // admin de verwijdering vanuit de UI simpelweg opnieuw proberen.
  if (profiel) {
    const { error: authError } = await admin.auth.admin.deleteUser(profiel.id);
    if (authError) throw new Error(authError.message);
  }

  const { error: rpcError } = await admin.rpc('delete_client_cascade', {
    target_client_id: input.clientId,
  });
  if (rpcError) throw new Error(rpcError.message);

  revalidatePath('/admin/klanten');
}

export async function wijzigListing(input: {
  listingId: string;
  clientId: string;
  naam: string;
  adres: string | null;
  airbnbUrl: string | null;
}) {
  await assertIsAdmin();

  if (!input.naam.trim()) throw new Error('Naam is verplicht.');

  const supabase = await createClient();

  const { error } = await supabase
    .from('listings')
    .update({ naam: input.naam, adres: input.adres, airbnb_url: input.airbnbUrl })
    .eq('id', input.listingId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}`);
}

export async function verwijderListing(input: { listingId: string; clientId: string }) {
  await assertIsAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from('listings').delete().eq('id', input.listingId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/klanten/${input.clientId}`);
}
