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

export async function wijzigEigenClientGegevens(input: {
  naam: string;
  telefoon: string | null;
}): Promise<{ succes: boolean; fout?: string }> {
  if (!input.naam.trim()) return { succes: false, fout: 'Naam is verplicht.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { succes: false, fout: 'Niet ingelogd.' };

  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user.id).maybeSingle();
  if (!profile?.client_id) return { succes: false, fout: 'Geen account gevonden.' };

  const { error } = await supabase
    .from('clients')
    .update({ naam: input.naam.trim(), telefoon: input.telefoon })
    .eq('id', profile.client_id);
  if (error) return { succes: false, fout: error.message };

  revalidatePath('/dashboard/instellingen');
  return { succes: true };
}

export async function wijzigEigenWachtwoord(input: {
  huidigWachtwoord: string;
  nieuwWachtwoord: string;
}): Promise<{ succes: boolean; fout?: string }> {
  if (input.nieuwWachtwoord.length < 6) {
    return { succes: false, fout: 'Nieuw wachtwoord moet minimaal 6 tekens zijn.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { succes: false, fout: 'Niet ingelogd.' };

  // Supabase's updateUser-API vereist zelf geen herbevestiging van het huidige
  // wachtwoord (alleen een actieve sessie) — deze aparte signInWithPassword-stap is er
  // bewust bij, zodat iemand met tijdelijke toegang tot een ontgrendelde/ingelogde
  // sessie (bv. een gedeelde computer) het wachtwoord niet kan overnemen zonder het
  // huidige wachtwoord te kennen.
  // Niet-null: klant-accounts worden altijd met een e-mailadres aangemaakt (zie
  // src/lib/onboarding/create-client-with-listings.ts) — er is geen telefoon- of
  // OAuth-only login-pad in deze app.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: input.huidigWachtwoord,
  });
  if (reauthError) return { succes: false, fout: 'Huidig wachtwoord is onjuist.' };

  const { error: updateError } = await supabase.auth.updateUser({ password: input.nieuwWachtwoord });
  if (updateError) return { succes: false, fout: updateError.message };

  return { succes: true };
}
