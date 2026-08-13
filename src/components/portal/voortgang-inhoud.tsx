'use client';

import { useMemo, useState } from 'react';
import { VoortgangsBalk, type FaseVoortgang } from './voortgangs-balk';
import { VoortgangsChecklist, type ChecklistItem } from './voortgangs-checklist';
import { AirbnbFunnelNulmeting, type AirbnbFunnelWaarden } from './airbnb-funnel-nulmeting';
import { VoortgangsTodos } from './voortgangs-todos';
import type { Todo } from './todo-rij';
import { VoortgangsActiviteitenlog, type ActiviteitenlogItem } from './voortgangs-activiteitenlog';
import type { VoortgangListing } from './voortgang-listing';
import { FaseVoortgangFormulier } from '@/components/admin/fase-voortgang-formulier';
import { ChecklistItemToevoegenFormulier } from '@/components/admin/checklist-item-toevoegen-formulier';
import { TodoToevoegenFormulier } from '@/components/admin/todo-toevoegen-formulier';
import { ActiviteitToevoegenFormulier } from '@/components/admin/activiteit-toevoegen-formulier';

export interface FunnelRij {
  listingId: string;
  waarden: AirbnbFunnelWaarden;
  nulmetingDatum: string | null;
}

const ALLE_FASEN = [1, 2, 3] as const;

export function VoortgangInhoud({
  clientId,
  listings,
  fasen,
  items,
  todos,
  activiteiten,
  funnels,
  isAdmin,
}: {
  clientId: string;
  listings: VoortgangListing[];
  fasen: FaseVoortgang[];
  items: ChecklistItem[];
  todos: Todo[];
  activiteiten: ActiviteitenlogItem[];
  funnels: FunnelRij[];
  isAdmin: boolean;
}) {
  const [geselecteerdeWoning, setGeselecteerdeWoning] = useState<string | null>(null);

  const gefilterdeItems = useMemo(
    () =>
      geselecteerdeWoning === null
        ? items
        : items.filter((i) => i.listingId === null || i.listingId === geselecteerdeWoning),
    [items, geselecteerdeWoning]
  );
  const gefilterdeTodos = useMemo(
    () =>
      geselecteerdeWoning === null
        ? todos
        : todos.filter((t) => t.listingId === null || t.listingId === geselecteerdeWoning),
    [todos, geselecteerdeWoning]
  );
  const gefilterdeActiviteiten = useMemo(
    () =>
      geselecteerdeWoning === null
        ? activiteiten
        : activiteiten.filter((a) => a.listingId === null || a.listingId === geselecteerdeWoning),
    [activiteiten, geselecteerdeWoning]
  );
  const gefilterdeFunnels =
    geselecteerdeWoning === null ? funnels : funnels.filter((f) => f.listingId === geselecteerdeWoning);

  // Bij "Alle woningen" tonen we het opgeslagen (evt. handmatig overschreven) percentage.
  // Bij een specifieke woning wordt het percentage live herberekend uit de gefilterde
  // items — de handmatige override in voortgang_fasen geldt dan niet meer, want die is
  // inherent één getal voor de hele klant en kan niet per woning worden opgesplitst.
  const effectieveFasen: FaseVoortgang[] = useMemo(() => {
    if (geselecteerdeWoning === null) return fasen;
    return ALLE_FASEN.map((faseNummer) => {
      const faseItems = gefilterdeItems.filter((i) => i.faseNummer === faseNummer);
      const totaal = faseItems.length;
      const afgevinkt = faseItems.filter((i) => i.afgevinkt).length;
      return { faseNummer, percentage: totaal > 0 ? Math.round((afgevinkt / totaal) * 100) : 0 };
    });
  }, [fasen, gefilterdeItems, geselecteerdeWoning]);

  return (
    <>
      <div className="mt-6">
        {listings.length > 1 && (
          <div className="mb-6">
            <label htmlFor="woning-filter" className="block text-xs text-muted-foreground">
              Woning
            </label>
            <select
              id="woning-filter"
              value={geselecteerdeWoning ?? ''}
              onChange={(e) => setGeselecteerdeWoning(e.target.value || null)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">Alle woningen</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.naam}
                </option>
              ))}
            </select>
          </div>
        )}
        <VoortgangsBalk fasen={effectieveFasen} />
      </div>
      {isAdmin && <FaseVoortgangFormulier clientId={clientId} />}

      <div className="mt-10">
        <h2 className="font-serif text-xl">Checklist</h2>
        <div className="mt-4">
          <VoortgangsChecklist items={gefilterdeItems} clientId={clientId} magBewerken={isAdmin} />
        </div>
        {isAdmin && <ChecklistItemToevoegenFormulier clientId={clientId} listings={listings} />}

        {gefilterdeFunnels.map((funnel) => (
          <AirbnbFunnelNulmeting
            key={funnel.listingId}
            clientId={clientId}
            listingId={funnel.listingId}
            listingNaam={listings.find((l) => l.id === funnel.listingId)?.naam ?? ''}
            waarden={funnel.waarden}
            nulmetingDatum={funnel.nulmetingDatum}
            magBewerken={isAdmin}
          />
        ))}
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-xl">To-do&apos;s</h2>
        <div className="mt-4">
          <VoortgangsTodos todos={gefilterdeTodos} clientId={clientId} isAdmin={isAdmin} listings={listings} />
        </div>
        {isAdmin && <TodoToevoegenFormulier clientId={clientId} listings={listings} />}
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-xl">Activiteitenlog</h2>
        <div className="mt-4">
          <VoortgangsActiviteitenlog items={gefilterdeActiviteiten} />
        </div>
        {isAdmin && <ActiviteitToevoegenFormulier clientId={clientId} listings={listings} />}
      </div>
    </>
  );
}
