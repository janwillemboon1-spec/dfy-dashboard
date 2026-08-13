import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoortgangInhoud, type FunnelRij } from '@/components/portal/voortgang-inhoud';
import type { FaseVoortgang } from '@/components/portal/voortgangs-balk';
import type { ChecklistItem } from '@/components/portal/voortgangs-checklist';
import type { Todo } from '@/components/portal/todo-rij';
import type { ActiviteitenlogItem } from '@/components/portal/voortgangs-activiteitenlog';

// Geen expliciet client_id-filter nodig op de queries hieronder: de "klant leest eigen ..."
// RLS-policies scopen dit al af tot precies de data van de ingelogde klant. Dit klopt alleen
// voor een klant-sessie — dashboard/layout.tsx redirect een admin-sessie al weg vóórdat deze
// pagina rendert. Anders dan de admin-versie van deze pagina hoeft de airbnb_funnel_nulmeting
// -query hier geen aparte, latere stap te zijn (geen listing-id's nodig om 'm te filteren) —
// RLS scopet 'm al automatisch af tot de eigen woningen, dus die hoort gewoon in dezelfde
// Promise.all als de rest.
export default async function VoortgangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user.id).maybeSingle();
  const clientId = profile?.client_id ?? '';

  const [{ data: fasen }, { data: items }, { data: listings }, { data: todos }, { data: activiteiten }, { data: funnelRows }] =
    await Promise.all([
      supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
      supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt, listing_id'),
      supabase.from('listings').select('id, naam').order('aangemaakt_op'),
      supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt, listing_id'),
      supabase.from('voortgang_activiteitenlog').select('id, datum, omschrijving, listing_id'),
      supabase
        .from('airbnb_funnel_nulmeting')
        .select(
          'listing_id, gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
        ),
    ]);

  const listingsData = (listings ?? []).map((l) => ({ id: l.id, naam: l.naam }));

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
        clientId={clientId}
        listings={listingsData}
        fasen={fasenData}
        items={itemsData}
        todos={todosData}
        activiteiten={activiteitenData}
        funnels={funnels}
        isAdmin={false}
      />
    </main>
  );
}
