import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { berekenMaandVergelijkingen, berekenWowCijfer, laatste12Maanden } from '@/lib/dashboard/bereken-resultaten';
import { WowCijfer } from '@/components/dashboard/wow-cijfer';
import { ResultatenGrafiek } from '@/components/dashboard/resultaten-grafiek';
import { ActielogTijdlijn } from '@/components/dashboard/actielog-tijdlijn';

// Geen expliciet client_id-filter nodig op de listings-query hieronder: de
// "klant leest eigen listings"-RLS-policy (client_id = current_client_id()) scopet dit
// al af tot precies de listings van de ingelogde klant. Dit klopt echter alleen voor
// een klant-sessie — de "admin volledige toegang <tabel>"-policies laten role=admin
// juist alles zien, ongefilterd. Zonder de admin-redirect hieronder zou een admin (die
// na het inloggen standaard hier belandt, zie auth/callback's next=/dashboard-default)
// een opgeteld mengelmoes van alle klanten door elkaar te zien krijgen.
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('naam, role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) console.error('Kon profiel niet laden voor dashboard:', profileError);
  if (profile?.role === 'admin') redirect('/admin/klanten');

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet), action_log(id, datum, omschrijving)');
  if (listingsError) console.error('Kon listings niet laden voor dashboard:', listingsError);

  const vergelijkingen = laatste12Maanden(
    berekenMaandVergelijkingen(
      (listings ?? []).map((listing) => ({
        nulmeting: listing.nulmeting ?? [],
        monthlyActuals: listing.monthly_actuals ?? [],
      }))
    )
  );
  const wowCijfer = berekenWowCijfer(vergelijkingen);
  const actielogItems = (listings ?? []).flatMap((listing) => listing.action_log ?? []);

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Welkom, {profile?.naam ?? 'daar'}!</h1>

      <WowCijfer bedrag={wowCijfer} />
      <ResultatenGrafiek data={vergelijkingen} />
      <ActielogTijdlijn items={actielogItems} />
    </main>
  );
}
