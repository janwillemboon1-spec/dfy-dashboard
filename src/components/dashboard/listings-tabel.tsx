'use client';

import { useState } from 'react';
import type { OmzetMetrics } from '@/lib/dashboard/omzet-aggregatie';

interface ListingRij extends OmzetMetrics {
  listing_id: string;
  listing_naam: string;
}

type SortKey = 'naam' | 'omzet' | 'adr' | 'bezetting' | 'nachten';

export function ListingsTabel({ listings }: { listings: ListingRij[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('omzet');
  const [sortAsc, setSortAsc] = useState(false);

  if (listings.length === 0) return null;

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else {
      setSortKey(k);
      setSortAsc(k === 'naam');
    }
  }

  const maxOmzet = Math.max(...listings.map((l) => l.omzet), 1);
  const gesorteerd = [...listings].sort((a, b) => {
    let v = 0;
    if (sortKey === 'naam') v = a.listing_naam.localeCompare(b.listing_naam);
    else if (sortKey === 'omzet') v = a.omzet - b.omzet;
    else if (sortKey === 'adr') v = a.adr - b.adr;
    else if (sortKey === 'bezetting') v = a.bezetting - b.bezetting;
    else if (sortKey === 'nachten') v = a.nachten - b.nachten;
    return sortAsc ? v : -v;
  });

  const kolommen: { k: SortKey; label: string }[] = [
    { k: 'naam', label: 'Accommodatie' },
    { k: 'omzet', label: 'Omzet' },
    { k: 'adr', label: 'ADR' },
    { k: 'bezetting', label: 'Bezetting' },
    { k: 'nachten', label: 'Nachten' },
  ];

  return (
    <table className="w-full text-sm bg-card border border-border rounded-xl overflow-hidden">
      <thead>
        <tr className="bg-muted text-xs text-muted-foreground uppercase select-none">
          {kolommen.map((kol) => (
            <th
              key={kol.k}
              onClick={() => toggleSort(kol.k)}
              className={`px-4 py-2 cursor-pointer ${kol.k === 'naam' ? 'text-left' : 'text-right'}`}
            >
              {kol.label}
              {sortKey === kol.k ? (sortAsc ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {gesorteerd.map((l) => (
          <tr key={l.listing_id} className="border-t border-border">
            <td className="px-4 py-2">
              <div className="font-medium">{l.listing_naam}</div>
              <div className="w-full bg-muted rounded-full h-1 mt-1">
                <div className="bg-primary h-1 rounded-full" style={{ width: `${(l.omzet / maxOmzet) * 100}%` }} />
              </div>
            </td>
            <td className="px-4 py-2 text-right font-medium">€ {l.omzet.toLocaleString('nl-NL')}</td>
            <td className="px-4 py-2 text-right">{l.adr > 0 ? `€ ${l.adr.toLocaleString('nl-NL')}` : '—'}</td>
            <td className="px-4 py-2 text-right">{l.bezetting > 0 ? `${l.bezetting.toFixed(1)}%` : '—'}</td>
            <td className="px-4 py-2 text-right">{l.nachten > 0 ? Math.round(l.nachten) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
