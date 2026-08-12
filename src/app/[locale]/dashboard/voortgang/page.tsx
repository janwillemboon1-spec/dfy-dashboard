import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';
import { VoortgangsChecklist, type ChecklistItem } from '@/components/portal/voortgangs-checklist';
import { AirbnbFunnelNulmeting } from '@/components/portal/airbnb-funnel-nulmeting';

// Geen expliciet client_id-filter nodig op de queries hieronder: de "klant leest eigen ..."
// RLS-policies scopen dit al af tot precies de data van de ingelogde klant. Dit klopt alleen
// voor een klant-sessie — dashboard/layout.tsx redirect een admin-sessie al weg vóórdat deze
// pagina rendert.
export default async function VoortgangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user.id).maybeSingle();
  const clientId = profile?.client_id ?? '';

  const [{ data: fasen }, { data: items }, { data: funnel }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage'),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt'),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking'
      )
      .maybeSingle(),
  ]);

  const fasenData: FaseVoortgang[] = (fasen ?? []).map((f) => ({
    faseNummer: f.fase_nummer as 1 | 2 | 3,
    percentage: f.percentage,
  }));
  const itemsData: ChecklistItem[] = (items ?? []).map((i) => ({
    id: i.id,
    faseNummer: i.fase_nummer as 1 | 2 | 3,
    naam: i.naam,
    afgevinkt: i.afgevinkt,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Voortgang</h1>
      <div className="mt-6">
        <VoortgangsBalk fasen={fasenData} />
      </div>
      <div className="mt-10">
        <h2 className="font-serif text-xl">Checklist</h2>
        <div className="mt-4">
          <VoortgangsChecklist items={itemsData} clientId={clientId} magBewerken={false} />
        </div>
        <AirbnbFunnelNulmeting
          clientId={clientId}
          waarden={{
            gemiddeldConversiepercentage: funnel?.gemiddeld_conversiepercentage ?? null,
            percentageZoekvertoningenEerstePagina: funnel?.percentage_zoekvertoningen_eerste_pagina ?? null,
            conversieZoekopdrachtNaarAdvertentie: funnel?.conversie_zoekopdracht_naar_advertentie ?? null,
            conversieAdvertentieNaarBoeking: funnel?.conversie_advertentie_naar_boeking ?? null,
          }}
          magBewerken={false}
        />
      </div>
    </main>
  );
}
