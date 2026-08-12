import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { berekenMaandVergelijkingen, berekenWowCijfer, vroegsteSamenwerkingGestart } from '@/lib/dashboard/bereken-resultaten';
import { WowCijfer } from '@/components/dashboard/wow-cijfer';
import { OmzetDashboard } from '@/components/dashboard/omzet-dashboard';
import { ResultatenGrafiek } from '@/components/dashboard/resultaten-grafiek';

// Geen expliciet client_id-filter nodig op de listings-query hieronder: de
// "klant leest eigen listings"-RLS-policy (client_id = current_client_id()) scopet dit
// al af tot precies de listings van de ingelogde klant. Dit klopt alleen voor een
// klant-sessie — dashboard/layout.tsx redirect een admin-sessie al weg vóórdat deze
// pagina rendert, dus de admin-volledige-toegang-policies komen hier nooit in het spel.
export default async function CijfersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('naam')
    .eq('id', user.id)
    .maybeSingle();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet)');
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
      <h1 className="font-serif text-2xl">Welkom, {profile?.naam ?? 'daar'}!</h1>

      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
      <OmzetDashboard />
      <ResultatenGrafiek data={vergelijkingen} />
    </main>
  );
}
