import { createClient } from '@/lib/supabase/server';
import { InloggegevensLijst } from '@/components/portal/inloggegevens-lijst';

export default async function AdminInloggegevensPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inloggegevens } = await supabase
    .from('inloggegevens')
    .select('id, naam, gebruikersnaam, notitie')
    .eq('client_id', id)
    .order('aangemaakt_op', { ascending: false });

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Inloggegevens</h1>
      <InloggegevensLijst items={inloggegevens ?? []} kanBewerken={false} />
    </main>
  );
}
