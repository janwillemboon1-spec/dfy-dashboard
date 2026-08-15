import { InloggegevenRij, type Inloggegeven } from './inloggegeven-rij';

export function InloggegevensLijst({ items, kanBewerken }: { items: Inloggegeven[]; kanBewerken: boolean }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen inloggegevens gedeeld.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <InloggegevenRij key={item.id} item={item} kanBewerken={kanBewerken} />
      ))}
    </div>
  );
}
