'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ActielogItem {
  id: string;
  datum: string;
  omschrijving: string;
}

export function ActielogTijdlijn({ items }: { items: ActielogItem[] }) {
  const [toonAlles, setToonAlles] = useState(false);

  if (items.length === 0) return null;

  const gesorteerd = [...items].sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const zichtbaar = toonAlles ? gesorteerd : gesorteerd.slice(0, 5);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Wat we voor je deden</h2>
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
