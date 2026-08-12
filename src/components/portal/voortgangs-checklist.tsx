import { FASE_NAMEN } from '@/lib/constants/fasen';
import { ChecklistItemRij } from './checklist-item-rij';

export interface ChecklistItem {
  id: string;
  faseNummer: 1 | 2 | 3;
  naam: string;
  afgevinkt: boolean;
}

const ALLE_FASEN = [1, 2, 3] as const;

export function VoortgangsChecklist({
  items,
  clientId,
  magBewerken,
}: {
  items: ChecklistItem[];
  clientId: string;
  magBewerken: boolean;
}) {
  return (
    <div className="space-y-6">
      {ALLE_FASEN.map((faseNummer) => {
        const faseItems = items.filter((i) => i.faseNummer === faseNummer);
        return (
          <div key={faseNummer}>
            <h3 className="text-sm font-medium">
              {faseNummer}. {FASE_NAMEN[faseNummer - 1]}
            </h3>
            <ul className="mt-2 space-y-1">
              {faseItems.map((item) => (
                <li key={item.id}>
                  <ChecklistItemRij
                    clientId={clientId}
                    itemId={item.id}
                    faseNummer={item.faseNummer}
                    naam={item.naam}
                    afgevinkt={item.afgevinkt}
                    magBewerken={magBewerken}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
