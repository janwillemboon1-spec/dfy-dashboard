import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';

// Geen expliciet client_id-filter nodig: de "klant leest eigen voortgang_fasen"-RLS-policy
// (client_id = current_client_id()) scopet dit al af tot precies de fasen van de ingelogde
// klant. Dit klopt alleen voor een klant-sessie — dashboard/layout.tsx redirect een
// admin-sessie al weg vóórdat deze pagina rendert.
export default async function VoortgangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: fasen } = await supabase.from('voortgang_fasen').select('fase_nummer, percentage');

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <div className="mt-6">
        <VoortgangsBalk fasen={fasenData} />
      </div>
    </main>
  );
}
