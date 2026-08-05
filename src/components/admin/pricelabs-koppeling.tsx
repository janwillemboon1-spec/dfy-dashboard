'use client';

import { useMemo, useState, useTransition } from 'react';
import { koppelListing, ontkoppelListing, syncListingNow } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PricelabsCacheRij {
  pricelabs_listing_id: string;
  naam: string;
  pms: string | null;
}

export function PricelabsKoppeling({
  listingId,
  clientId,
  pricelabsListingId,
  cache,
}: {
  listingId: string;
  clientId: string;
  pricelabsListingId: string | null;
  cache: PricelabsCacheRij[];
}) {
  const [zoekterm, setZoekterm] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resultaten = useMemo(() => {
    if (!zoekterm.trim()) return [];
    const term = zoekterm.toLowerCase();
    return cache.filter((rij) => rij.naam.toLowerCase().includes(term)).slice(0, 10);
  }, [zoekterm, cache]);

  if (pricelabsListingId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Gekoppeld aan PriceLabs ({pricelabsListingId})</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setFoutmelding(null);
              try {
                await syncListingNow({ listingId, clientId });
              } catch (error) {
                setFoutmelding((error as Error).message);
              }
            })
          }
        >
          Sync nu
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setFoutmelding(null);
              try {
                await ontkoppelListing({ listingId, clientId });
              } catch (error) {
                setFoutmelding((error as Error).message);
              }
            })
          }
        >
          Loskoppelen
        </Button>
        {foutmelding && <p className="text-destructive">{foutmelding}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <Input
        placeholder="Zoek PriceLabs-listing op naam..."
        value={zoekterm}
        onChange={(e) => setZoekterm(e.target.value)}
      />
      {resultaten.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {resultaten.map((rij) => (
            <li key={rij.pricelabs_listing_id} className="flex items-center justify-between p-2">
              <span>{rij.naam}</span>
              <Button
                size="sm"
                disabled={isPending || !rij.pms}
                onClick={() =>
                  startTransition(async () => {
                    setFoutmelding(null);
                    try {
                      await koppelListing({
                        listingId,
                        clientId,
                        pricelabsListingId: rij.pricelabs_listing_id,
                        pms: rij.pms!,
                      });
                    } catch (error) {
                      setFoutmelding((error as Error).message);
                    }
                  })
                }
              >
                Koppelen
              </Button>
            </li>
          ))}
        </ul>
      )}
      {foutmelding && <p className="text-destructive">{foutmelding}</p>}
    </div>
  );
}
