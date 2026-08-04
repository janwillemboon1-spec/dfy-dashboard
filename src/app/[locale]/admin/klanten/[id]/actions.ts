'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
