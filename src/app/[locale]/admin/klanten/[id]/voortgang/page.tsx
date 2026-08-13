import { createClient } from '@/lib/supabase/server';
import { VoortgangInhoud, type FunnelRij } from '@/components/portal/voortgang-inhoud';
import type { FaseVoortgang } from '@/components/portal/voortgangs-balk';
import type { ChecklistItem } from '@/components/portal/voortgangs-checklist';
import type { Todo } from '@/components/portal/todo-rij';
import type { ActiviteitenlogItem } from '@/components/portal/voortgangs-activiteitenlog';

export default async function VoortgangPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: fasen }, { data: items }, { data: listings }, { data: todos }, { data: activiteiten }] =
    await Promise.all([
      supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
      supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt, listing_id').eq('client_id', id),
      supabase.from('listings').select('id, naam').eq('client_id', id).order('aangemaakt_op'),
      supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt, listing_id').eq('client_id', id),
      supabase.from('voortgang_activiteitenlog').select('id, datum, omschrijving, listing_id').eq('client_id', id),
    ]);

  const listingsData = (listings ?? []).map((l) => ({ id: l.id, naam: l.naam }));
  const listingIds = listingsData.map((l) => l.id);

  // Twee-staps ophalen (i.p.v. in dezelfde Promise.all): deze query heeft de listing-id's
  // van de query hierboven nodig, en filtert — anders dan de klant-versie van deze pagina
  // — expliciet, omdat de admin-RLS-policy op airbnb_funnel_nulmeting alles ongefilterd
  // doorlaat. Bij 0 woningen wordt de query overgeslagen i.p.v. te vertrouwen op hoe een
  // lege .in()-lijst zich toevallig gedraagt.
  const { data: funnelRows } =
    listingIds.length > 0
      ? await supabase
          .from('airbnb_funnel_nulmeting')
          .select(
            'listing_id, gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
          )
          .in('listing_id', listingIds)
      : { data: [] };

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));
  const itemsData: ChecklistItem[] = (items ?? []).map((i) => ({
    id: i.id,
    faseNummer: i.fase_nummer as 1 | 2 | 3,
    naam: i.naam,
    afgevinkt: i.afgevinkt,
    listingId: i.listing_id,
  }));
  const todosData: Todo[] = (todos ?? []).map((t) => ({
    id: t.id,
    naam: t.naam,
    deadline: t.deadline,
    afgevinkt: t.afgevinkt,
    listingId: t.listing_id,
  }));
  const activiteitenData: ActiviteitenlogItem[] = (activiteiten ?? []).map((a) => ({
    id: a.id,
    datum: a.datum,
    omschrijving: a.omschrijving,
    listingId: a.listing_id,
  }));
  const funnelPerListing = new Map((funnelRows ?? []).map((f) => [f.listing_id, f]));
  const funnels: FunnelRij[] = listingsData.map((l) => {
    const f = funnelPerListing.get(l.id);
    return {
      listingId: l.id,
      waarden: {
        gemiddeldConversiepercentage: f?.gemiddeld_conversiepercentage ?? null,
        percentageZoekvertoningenEerstePagina: f?.percentage_zoekvertoningen_eerste_pagina ?? null,
        conversieZoekopdrachtNaarAdvertentie: f?.conversie_zoekopdracht_naar_advertentie ?? null,
        conversieAdvertentieNaarBoeking: f?.conversie_advertentie_naar_boeking ?? null,
      },
      nulmetingDatum: f?.nulmeting_datum ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <VoortgangInhoud
        clientId={id}
        listings={listingsData}
        fasen={fasenData}
        items={itemsData}
        todos={todosData}
        activiteiten={activiteitenData}
        funnels={funnels}
        isAdmin
      />
    </main>
  );
}
