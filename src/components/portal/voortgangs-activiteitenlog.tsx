'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ActiviteitenlogItem {
  id: string;
  datum: string;
  omschrijving: string;
  listingId: string | null;
}

export function VoortgangsActiviteitenlog({ items }: { items: ActiviteitenlogItem[] }) {
  const [toonAlles, setToonAlles] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen activiteiten geregistreerd.</p>;
  }

  const gesorteerd = [...items].sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const zichtbaar = toonAlles ? gesorteerd : gesorteerd.slice(0, 5);

  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-sm">
        {zichtbaar.map((item) => (
          <li key={item.id} className="text-muted-foreground">
            {new Date(item.datum).toLocaleDateString('nl-NL')} — {item.omschrijving}
          </li>
        ))}
      </ul>
      {!toonAlles && gesorteerd.length > 5 && (
        <Button variant="ghost" size="sm" onClick={() => setToonAlles(true)}>
          Toon meer
        </Button>
      )}
    </div>
  );
}
