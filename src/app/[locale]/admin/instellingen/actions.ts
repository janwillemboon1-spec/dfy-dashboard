'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';

// Deze tabel is bewust een singleton (app-brede instellingen, geen client_id) — een vast
// bekend id i.p.v. een select-dan-update-of-insert maakt "opslaan" één atomaire upsert,
// zodat er structureel nooit een tweede rij kan ontstaan, ook niet bij een race tussen
// twee gelijktijdige opslag-pogingen.
const PORTAAL_INSTELLINGEN_ID = '00000000-0000-0000-0000-000000000001';

export async function wijzigPortaalInstellingen(input: {
  videoUrl: string | null;
  formulierUrl: string | null;
}): Promise<{ succes: boolean; fout?: string }> {
  await assertIsAdmin();

  const supabase = await createClient();

  const { error } = await supabase.from('portaal_instellingen').upsert(
    {
      id: PORTAAL_INSTELLINGEN_ID,
      video_url: input.videoUrl,
      formulier_url: input.formulierUrl,
      gewijzigd_op: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) return { succes: false, fout: error.message };

  revalidatePath('/admin/instellingen');
  revalidatePath('/dashboard/start-hier');
  return { succes: true };
}
