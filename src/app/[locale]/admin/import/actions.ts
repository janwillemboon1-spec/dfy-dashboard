'use server';

import { createClientWithListings, OnboardingError } from '@/lib/onboarding/create-client-with-listings';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ParsedListingRow } from '@/lib/csv/parse-clients-csv';
import type { ParsedActielogRow } from '@/lib/csv/parse-actielog-csv';

export interface ImportResultaat {
  rowIndex: number;
  succes: boolean;
  fout?: string;
}

export async function importeerKlanten(rijen: ParsedListingRow[]): Promise<ImportResultaat[]> {
  const perKlant = new Map<string, ParsedListingRow[]>();
  for (const rij of rijen) {
    const lijst = perKlant.get(rij.klantEmail) ?? [];
    lijst.push(rij);
    perKlant.set(rij.klantEmail, lijst);
  }

  const resultaten: ImportResultaat[] = [];

  for (const [, klantRijen] of perKlant) {
    const eerste = klantRijen[0];
    try {
      await createClientWithListings({
        naam: eerste.klantnaam,
        email: eerste.klantEmail,
        telefoon: eerste.klantTelefoon,
        accommodaties: klantRijen.map((rij) => ({
          naam: rij.accommodatienaam,
          adres: rij.adres,
          nulmeting: rij.nulmeting,
        })),
        honeypot: '',
      });
      klantRijen.forEach((rij) => resultaten.push({ rowIndex: rij.rowIndex, succes: true }));
    } catch (error) {
      klantRijen.forEach((rij) =>
        resultaten.push({
          rowIndex: rij.rowIndex,
          succes: false,
          fout: error instanceof OnboardingError ? error.message : 'Onbekende fout',
        })
      );
    }
  }

  return resultaten;
}

export async function importeerActielog(rijen: ParsedActielogRow[]): Promise<ImportResultaat[]> {
  const supabase = createAdminClient();
  const resultaten: ImportResultaat[] = [];

  for (const rij of rijen) {
    const { data: listing } = await supabase
      .from('listings')
      .select('id')
      .eq('naam', rij.accommodatienaam)
      .maybeSingle();

    if (!listing) {
      resultaten.push({
        rowIndex: rij.rowIndex,
        succes: false,
        fout: `Geen accommodatie gevonden met naam "${rij.accommodatienaam}"`,
      });
      continue;
    }

    const { error } = await supabase.from('action_log').insert({
      listing_id: listing.id,
      datum: rij.datum,
      omschrijving: rij.omschrijving,
      type: rij.type,
    });

    resultaten.push({ rowIndex: rij.rowIndex, succes: !error, fout: error?.message });
  }

  return resultaten;
}
