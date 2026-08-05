import { createClient } from '@/lib/supabase/server';

// Voor server actions die niet (alleen) op een RLS-policy als backstop kunnen
// vertrouwen — bv. omdat ze de service-role client gebruiken (die RLS omzeilt) of
// een externe API aanroepen. Zonder deze check zou een ingelogde niet-admin de
// action rechtstreeks kunnen aanroepen, buiten de /admin route-middleware om, en
// alsnog het effect ervan triggeren.
export async function assertIsAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Niet geautoriseerd.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    throw new Error('Niet geautoriseerd.');
  }
}
