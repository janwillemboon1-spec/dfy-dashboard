import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { InloggegevensLijst } from '@/components/portal/inloggegevens-lijst';
import { InloggegevenToevoegenFormulier } from '@/components/portal/inloggegeven-toevoegen-formulier';

export default async function InloggegevensPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: items } = await supabase
    .from('inloggegevens')
    .select('id, naam, gebruikersnaam, notitie')
    .order('aangemaakt_op', { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-2xl">Inloggegevens</h1>
        <InloggegevenToevoegenFormulier />
      </div>
      <p className="text-muted-foreground">
        Deel hier inloggegevens (bijvoorbeeld voor Airbnb of je PMS-systeem) die wij nodig
        hebben om koppelingen voor je tot stand te brengen.
      </p>
      <InloggegevensLijst items={items ?? []} kanBewerken={true} />
    </main>
  );
}
