'use client';

import { useMemo, useState } from 'react';
import { berekenMaandVergelijkingen, berekenWowCijfer, vroegsteSamenwerkingGestart, type ListingData } from '@/lib/dashboard/bereken-resultaten';
import { WowCijfer } from './wow-cijfer';
import { OmzetDashboard } from './omzet-dashboard';
import { ResultatenGrafiek } from './resultaten-grafiek';
import type { CijfersListing } from './cijfers-listing';

export interface CijfersListingData extends CijfersListing, ListingData {}

export function CijfersInhoud({ clientId, listings }: { clientId?: string; listings: CijfersListingData[] }) {
  const [geselecteerdeWoning, setGeselecteerdeWoning] = useState<string | null>(null);

  const gefilterdeListings = useMemo(
    () => (geselecteerdeWoning === null ? listings : listings.filter((l) => l.id === geselecteerdeWoning)),
    [listings, geselecteerdeWoning]
  );

  const vergelijkingen = useMemo(() => berekenMaandVergelijkingen(gefilterdeListings), [gefilterdeListings]);
  const wowCijfer = useMemo(() => berekenWowCijfer(vergelijkingen), [vergelijkingen]);
  const startmaand = useMemo(
    () => vroegsteSamenwerkingGestart(gefilterdeListings.map((l) => l.samenwerkingGestart)),
    [gefilterdeListings]
  );

  return (
    <>
      {listings.length > 1 && (
        <div>
          <label htmlFor="cijfers-woning-filter" className="block text-xs text-muted-foreground">
            Woning
          </label>
          <select
            id="cijfers-woning-filter"
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

      <WowCijfer bedrag={wowCijfer} startmaand={startmaand} />
      <OmzetDashboard clientId={clientId} geselecteerdeWoning={geselecteerdeWoning} />
      <ResultatenGrafiek data={vergelijkingen} />
    </>
  );
}
