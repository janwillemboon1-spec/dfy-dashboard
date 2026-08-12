import { createClient } from '@/lib/supabase/server';
import { berekenMaandVergelijkingen, berekenWowCijfer, vroegsteSamenwerkingGestart } from '@/lib/dashboard/bereken-resultaten';
import { WowCijfer } from '@/components/dashboard/wow-cijfer';
import { OmzetDashboard } from '@/components/dashboard/omzet-dashboard';
import { ResultatenGrafiek } from '@/components/dashboard/resultaten-grafiek';

export default async function CijfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet)')
    .eq('client_id', id);
  if (listingsError) console.error('Kon listings niet laden voor cijferpagina:', listingsError);

  const vergelijkingen = berekenMaandVergelijkingen(
    (listings ?? []).map((listing) => ({
      nulmeting: listing.nulmeting ?? [],
      monthlyActuals: listing.monthly_actuals ?? [],
      samenwerkingGestart: listing.samenwerking_gestart,
    }))
  );
  const wowCijfer = berekenWowCijfer(vergelijkingen);
  const startmaand = vroegsteSamenwerkingGestart((listings ?? []).map((listing) => listing.samenwerking_gestart));

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Cijfers</h1>

      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
      <OmzetDashboard clientId={id} />
      <ResultatenGrafiek data={vergelijkingen} />
    </main>
  );
}
