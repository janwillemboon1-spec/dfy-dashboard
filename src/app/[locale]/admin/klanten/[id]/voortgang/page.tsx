import { createClient } from '@/lib/supabase/server';
import { VoortgangsBalk, type FaseVoortgang } from '@/components/portal/voortgangs-balk';
import { VoortgangsChecklist, type ChecklistItem } from '@/components/portal/voortgangs-checklist';
import { AirbnbFunnelNulmeting } from '@/components/portal/airbnb-funnel-nulmeting';
import { FaseVoortgangFormulier } from '@/components/admin/fase-voortgang-formulier';
import { ChecklistItemToevoegenFormulier } from '@/components/admin/checklist-item-toevoegen-formulier';
import { VoortgangsTodos } from '@/components/portal/voortgangs-todos';
import type { Todo } from '@/components/portal/todo-rij';
import { TodoToevoegenFormulier } from '@/components/admin/todo-toevoegen-formulier';

export default async function VoortgangPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: fasen }, { data: items }, { data: funnel }, { data: todos }] = await Promise.all([
    supabase.from('voortgang_fasen').select('fase_nummer, percentage').eq('client_id', id),
    supabase.from('voortgang_checklist_items').select('id, fase_nummer, naam, afgevinkt').eq('client_id', id),
    supabase
      .from('airbnb_funnel_nulmeting')
      .select(
        'gemiddeld_conversiepercentage, percentage_zoekvertoningen_eerste_pagina, conversie_zoekopdracht_naar_advertentie, conversie_advertentie_naar_boeking, nulmeting_datum'
      )
      .eq('client_id', id)
      .maybeSingle(),
    supabase.from('voortgang_todos').select('id, naam, deadline, afgevinkt').eq('client_id', id),
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
      <FaseVoortgangFormulier clientId={id} />
      <div className="mt-10">
        <h2 className="font-serif text-xl">Checklist</h2>
        <div className="mt-4">
          <VoortgangsChecklist items={itemsData} clientId={id} magBewerken />
        </div>
        <ChecklistItemToevoegenFormulier clientId={id} />
        <AirbnbFunnelNulmeting
          clientId={id}
          waarden={{
            gemiddeldConversiepercentage: funnel?.gemiddeld_conversiepercentage ?? null,
            percentageZoekvertoningenEerstePagina: funnel?.percentage_zoekvertoningen_eerste_pagina ?? null,
            conversieZoekopdrachtNaarAdvertentie: funnel?.conversie_zoekopdracht_naar_advertentie ?? null,
            conversieAdvertentieNaarBoeking: funnel?.conversie_advertentie_naar_boeking ?? null,
          }}
          nulmetingDatum={funnel?.nulmeting_datum ?? null}
          magBewerken
        />
      </div>
      <div className="mt-10">
        <h2 className="font-serif text-xl">To-do&apos;s</h2>
        <div className="mt-4">
          <VoortgangsTodos todos={(todos ?? []) as Todo[]} clientId={id} isAdmin />
        </div>
        <TodoToevoegenFormulier clientId={id} />
      </div>
    </main>
  );
}
