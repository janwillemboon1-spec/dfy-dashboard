import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NulmetingTabel } from '@/components/admin/nulmeting-tabel';
import { ResultatenTabel } from '@/components/admin/resultaten-tabel';
import { ActielogFormulier } from '@/components/admin/actielog-formulier';
import { PricelabsKoppeling } from '@/components/admin/pricelabs-koppeling';

export default async function KlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: klant } = await supabase.from('clients').select('*').eq('id', id).single();
  if (!klant) notFound();

  const { data: listings } = await supabase
    .from('listings')
    .select('*, nulmeting(*), action_log(*), monthly_actuals(*)')
    .eq('client_id', id)
    .order('aangemaakt_op');

  const { data: pricelabsCache } = await supabase
    .from('pricelabs_listings_cache')
    .select('pricelabs_listing_id, naam, pms')
    .order('naam');

  return (
    <main className="mx-auto max-w-5xl py-10 px-4 space-y-10">
      <div>
        <h1 className="font-serif text-2xl">{klant.naam}</h1>
        <p className="text-muted-foreground">{klant.email} · status: {klant.status}</p>
      </div>

      {listings?.map((listing) => (
        <section key={listing.id} className="space-y-4 border-t border-border pt-6">
          <h2 className="text-lg font-medium">{listing.naam}</h2>
          <PricelabsKoppeling
            listingId={listing.id}
            clientId={id}
            pricelabsListingId={listing.pricelabs_listing_id}
            cache={pricelabsCache ?? []}
          />

          <NulmetingTabel listingId={listing.id} clientId={id} rijen={listing.nulmeting ?? []} />
          <ResultatenTabel
            nulmeting={listing.nulmeting ?? []}
            actueel={listing.monthly_actuals ?? []}
            pricelabsListingId={listing.pricelabs_listing_id}
          />
          <ActielogFormulier listingId={listing.id} clientId={id} />

          <ul className="space-y-1 text-sm">
            {(listing.action_log ?? [])
              .slice()
              .sort((a, b) => (a.datum < b.datum ? 1 : -1))
              .map((item) => (
                <li key={item.id} className="text-muted-foreground">
                  {new Date(item.datum).toLocaleDateString('nl-NL')} — {item.omschrijving}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
