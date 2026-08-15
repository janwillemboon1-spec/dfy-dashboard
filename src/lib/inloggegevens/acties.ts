'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { versleutel, ontsleutel } from './versleuteling';
import { sendAdminNotificatieNieuwInloggegeven } from '@/lib/email/send-admin-notificatie-nieuw-inloggegeven';
import type { Database } from '@/types/database';

type InloggegevenUpdate = Database['public']['Tables']['inloggegevens']['Update'];

export async function voegInloggegevenToe(input: {
  naam: string;
  gebruikersnaam: string | null;
  wachtwoord: string;
  notitie: string | null;
}): Promise<void> {
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');
  if (!input.wachtwoord.trim()) throw new Error('Wachtwoord is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd.');

  const { data: profile } = await supabase.from('profiles').select('client_id, naam').eq('id', user.id).maybeSingle();
  // Admin-profielen hebben geen client_id — dit weigert een admin-sessie dus automatisch,
  // zonder aparte rolcheck: alleen een klant-sessie kan hier voorbij komen.
  if (!profile?.client_id) throw new Error('Geen account gevonden.');

  const { error } = await supabase.from('inloggegevens').insert({
    client_id: profile.client_id,
    naam: input.naam.trim(),
    gebruikersnaam: input.gebruikersnaam,
    wachtwoord_versleuteld: versleutel(input.wachtwoord),
    notitie: input.notitie,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/inloggegevens');
  revalidatePath(`/admin/klanten/${profile.client_id}/instellingen`);

  // Bewust geen rollback op een mislukte notificatiemail: het inloggegeven is al
  // opgeslagen, en e-mail is puur een seintje — geen onderdeel van het daadwerkelijke
  // delen van de gegevens (dat gebeurt via de database, niet via de mail).
  try {
    await sendAdminNotificatieNieuwInloggegeven({
      klantNaam: profile.naam,
      itemNaam: input.naam.trim(),
      clientId: profile.client_id,
    });
  } catch (emailError) {
    console.error('[voegInloggegevenToe] admin-notificatiemail is mislukt:', emailError);
  }
}

export async function wijzigInloggegeven(input: {
  id: string;
  naam: string;
  gebruikersnaam: string | null;
  wachtwoord: string;
  notitie: string | null;
}): Promise<void> {
  if (!input.naam.trim()) throw new Error('Naam is verplicht.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd.');

  const updates: InloggegevenUpdate = {
    naam: input.naam.trim(),
    gebruikersnaam: input.gebruikersnaam,
    notitie: input.notitie,
    gewijzigd_op: new Date().toISOString(),
  };
  // Leeg wachtwoordveld betekent: bestaande versleutelde waarde ongewijzigd laten — zo
  // hoeft er nooit ontsleuteld te worden puur om een bewerkformulier te vullen.
  if (input.wachtwoord.trim()) {
    updates.wachtwoord_versleuteld = versleutel(input.wachtwoord);
  }

  const { data: bijgewerkt, error } = await supabase
    .from('inloggegevens')
    .update(updates)
    .eq('id', input.id)
    .select('id, client_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Geen rij terug betekent hier: RLS heeft dit item onzichtbaar gemaakt (niet van deze
  // klant), niet per se dat het echt niet bestaat — dezelfde nette foutmelding dekt beide
  // gevallen zonder details te lekken over wat er wél bestaat.
  if (!bijgewerkt) throw new Error('Kon dit item niet vinden — mogelijk is het al verwijderd.');

  revalidatePath('/dashboard/inloggegevens');
  revalidatePath(`/admin/klanten/${bijgewerkt.client_id}/instellingen`);
}

export async function verwijderInloggegeven(input: { id: string }): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd.');

  const { data: verwijderd, error } = await supabase
    .from('inloggegevens')
    .delete()
    .eq('id', input.id)
    .select('client_id')
    .maybeSingle();
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/inloggegevens');
  if (verwijderd) {
    revalidatePath(`/admin/klanten/${verwijderd.client_id}/instellingen`);
  }
}

export async function onthulWachtwoord(input: {
  id: string;
}): Promise<{ succes: boolean; wachtwoord?: string; fout?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { succes: false, fout: 'Niet ingelogd.' };

  const { data: item, error } = await supabase
    .from('inloggegevens')
    .select('wachtwoord_versleuteld')
    .eq('id', input.id)
    .maybeSingle();
  if (error) return { succes: false, fout: error.message };
  if (!item) return { succes: false, fout: 'Item niet gevonden.' };

  try {
    return { succes: true, wachtwoord: ontsleutel(item.wachtwoord_versleuteld) };
  } catch {
    return { succes: false, fout: 'Kon wachtwoord niet ontsleutelen.' };
  }
}
