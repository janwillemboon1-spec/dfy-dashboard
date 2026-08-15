'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';

export async function wijzigPortaalInstellingen(input: {
  videoUrl: string | null;
  formulierUrl: string | null;
}): Promise<{ succes: boolean; fout?: string }> {
  await assertIsAdmin();

  const supabase = await createClient();

  const { data: bestaande, error: leesError } = await supabase
    .from('portaal_instellingen')
    .select('id')
    .maybeSingle();

  if (leesError) return { succes: false, fout: leesError.message };

  if (bestaande) {
    const { error } = await supabase
      .from('portaal_instellingen')
      .update({
        video_url: input.videoUrl,
        formulier_url: input.formulierUrl,
        gewijzigd_op: new Date().toISOString(),
      })
      .eq('id', bestaande.id);
    if (error) return { succes: false, fout: error.message };
  } else {
    const { error } = await supabase.from('portaal_instellingen').insert({
      video_url: input.videoUrl,
      formulier_url: input.formulierUrl,
    });
    if (error) return { succes: false, fout: error.message };
  }

  revalidatePath('/admin/instellingen');
  revalidatePath('/dashboard/start-hier');
  return { succes: true };
}
