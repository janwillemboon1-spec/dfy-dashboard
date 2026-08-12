import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';
import { FaseVoortgangFormulier } from '@/components/admin/fase-voortgang-formulier';

export default async function VoortgangPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: fasen } = await supabase
    .from('voortgang_fasen')
    .select('fase_nummer, percentage')
    .eq('client_id', id);

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
      <FaseVoortgangFormulier clientId={id} />
    </main>
  );
}
