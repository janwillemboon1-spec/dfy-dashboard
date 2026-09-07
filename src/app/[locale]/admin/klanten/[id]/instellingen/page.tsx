import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NulmetingTabel } from '@/components/admin/nulmeting-tabel';
import { ResultatenTabel } from '@/components/admin/resultaten-tabel';
import { ActielogFormulier } from '@/components/admin/actielog-formulier';
import { PricelabsKoppeling } from '@/components/admin/pricelabs-koppeling';
import { PricelabsCacheVerversen } from '@/components/admin/pricelabs-cache-verversen';
import { CijfersVerversenKnop } from '@/components/admin/cijfers-verversen-knop';
import { SamenwerkingNulmetingForm } from '@/components/admin/samenwerking-nulmeting-form';
import { KlantBewerkenFormulier } from '@/components/admin/klant-bewerken-formulier';
import { KlantVerwijderenDialoog } from '@/components/admin/klant-verwijderen-dialoog';
import { ListingBewerkenFormulier } from '@/components/admin/listing-bewerken-formulier';
import { ListingVerwijderenDialoog } from '@/components/admin/listing-verwijderen-dialoog';
import { ListingToevoegenFormulier } from '@/components/admin/listing-toevoegen-formulier';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InloggegevensLijst } from '@/components/portal/inloggegevens-lijst';

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

  const { data: inloggegevens } = await supabase
    .from('inloggegevens')
    .select('id, naam, gebruikersnaam, notitie')
    .eq('client_id', id)
    .order('aangemaakt_op', { ascending: false });

  return (
    <main className="mx-auto max-w-5xl py-10 px-4 space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl">{klant.naam}</h1>
          <p className="text-muted-foreground">{klant.email} · status: {klant.status}</p>
        </div>
        <div className="flex gap-2">
          <KlantBewerkenFormulier
            clientId={id}
            naam={klant.naam}
            email={klant.email}
            telefoon={klant.telefoon}
            status={klant.status}
          />
          <KlantVerwijderenDialoog clientId={id} naam={klant.naam} />
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Inloggegevens</h2>
        <InloggegevensLijst items={inloggegevens ?? []} kanBewerken={false} />
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Accommodaties</h2>
        <div className="flex gap-2">
          <ListingToevoegenFormulier clientId={id} />
          <CijfersVerversenKnop clientId={id} />
          <PricelabsCacheVerversen clientId={id} />
        </div>
      </div>

      {listings?.map((listing) => {
        const heeftBestaandeNulmeting = (listing.nulmeting ?? []).length > 0;
        return (
          <section key={listing.id} className="space-y-4 border-t border-border pt-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">{listing.naam}</h2>
              <div className="flex gap-2">
                <ListingBewerkenFormulier
                  listingId={listing.id}
                  clientId={id}
                  naam={listing.naam}
                  adres={listing.adres}
                  airbnbUrl={listing.airbnb_url}
                />
                <ListingVerwijderenDialoog listingId={listing.id} clientId={id} naam={listing.naam} />
              </div>
            </div>

            <Tabs defaultValue="nulmeting">
              <TabsList>
                <TabsTrigger value="koppeling">Koppeling</TabsTrigger>
                <TabsTrigger value="nulmeting">Nulmeting</TabsTrigger>
                <TabsTrigger value="resultaten">Resultaten</TabsTrigger>
                <TabsTrigger value="actielog">Actielog</TabsTrigger>
              </TabsList>

              <TabsContent value="koppeling">
                <PricelabsKoppeling
                  listingId={listing.id}
                  clientId={id}
                  pricelabsListingId={listing.pricelabs_listing_id}
                  cache={pricelabsCache ?? []}
                />
              </TabsContent>

              <TabsContent value="nulmeting" className="space-y-4">
                <SamenwerkingNulmetingForm
                  listingId={listing.id}
                  clientId={id}
                  pricelabsListingId={listing.pricelabs_listing_id}
                  samenwerkingGestart={listing.samenwerking_gestart}
                  heeftBestaandeNulmeting={heeftBestaandeNulmeting}
                />
                <NulmetingTabel listingId={listing.id} clientId={id} rijen={listing.nulmeting ?? []} />
              </TabsContent>

              <TabsContent value="resultaten">
                <ResultatenTabel
                  actueel={listing.monthly_actuals ?? []}
                  pricelabsListingId={listing.pricelabs_listing_id}
                />
              </TabsContent>

              <TabsContent value="actielog" className="space-y-4">
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
              </TabsContent>
            </Tabs>
          </section>
        );
      })}
    </main>
  );
}
