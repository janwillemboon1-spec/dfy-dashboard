import { createClient } from '@/lib/supabase/server';
import { CijfersInhoud, type CijfersListingData } from '@/components/dashboard/cijfers-inhoud';

export default async function CijfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, samenwerking_gestart, nulmeting(jaar, maand, omzet), monthly_actuals(jaar, maand, omzet)')
    .eq('client_id', id)
    .order('aangemaakt_op');
  if (listingsError) console.error('Kon listings niet laden voor cijferpagina:', listingsError);

  const listingsData: CijfersListingData[] = (listings ?? []).map((listing) => ({
    id: listing.id,
    naam: listing.naam,
    nulmeting: listing.nulmeting ?? [],
    monthlyActuals: listing.monthly_actuals ?? [],
    samenwerkingGestart: listing.samenwerking_gestart,
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <h1 className="font-serif text-2xl">Cijfers</h1>
      <CijfersInhoud clientId={id} listings={listingsData} />
    </main>
  );
}
