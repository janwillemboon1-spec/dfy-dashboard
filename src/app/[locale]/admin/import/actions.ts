'use server';

import { createClientWithListings, OnboardingError } from '@/lib/onboarding/create-client-with-listings';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ParsedListingRow } from '@/lib/csv/parse-clients-csv';
import type { ParsedActielogRow } from '@/lib/csv/parse-actielog-csv';

export interface ImportResultaat {
  rowIndex: number;
  succes: boolean;
  fout?: string;
  bron: 'klant' | 'actielog';
}

// Beide importfuncties hieronder gebruiken createAdminClient() (service-role,
// omzeilt RLS volledig) omdat ze klantnamen/listings across alle klanten
// moeten kunnen opzoeken en aanmaken. Anders dan bv. klanten/[id]/actions.ts
// (die de RLS-scoped createClient() gebruikt en dus al een backstop van
// Postgres RLS heeft) hebben deze functies dus GEEN databaselaag die een
// niet-admin tegenhoudt als de server action rechtstreeks aangeroepen wordt
// (bv. buiten de /admin route-middleware om). Vandaar deze expliciete check.
async function assertIsAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Niet geautoriseerd.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    throw new Error('Niet geautoriseerd.');
  }
}

export async function importeerKlanten(rijen: ParsedListingRow[]): Promise<ImportResultaat[]> {
  await assertIsAdmin();

  const perKlant = new Map<string, ParsedListingRow[]>();
  for (const rij of rijen) {
    const lijst = perKlant.get(rij.klantEmail) ?? [];
    lijst.push(rij);
    perKlant.set(rij.klantEmail, lijst);
  }

  const resultaten: ImportResultaat[] = [];

  for (const [, klantRijen] of perKlant) {
    const eerste = klantRijen[0];

    // Rijen voor dezelfde klant-e-mail moeten dezelfde klantnaam/telefoon
    // hebben — anders weten we niet welke waarde klopt (bv. een typfout in
    // één van de rijen) en importeren we liever niets dan de verkeerde naam.
    const afwijkendeRij = klantRijen.find(
      (rij) =>
        rij.klantnaam.trim() !== eerste.klantnaam.trim() ||
        rij.klantTelefoon.trim() !== eerste.klantTelefoon.trim()
    );

    if (afwijkendeRij) {
      const fout = `Klantnaam komt niet overeen tussen rijen voor ${eerste.klantEmail} — corrigeer de CSV en probeer opnieuw.`;
      klantRijen.forEach((rij) =>
        resultaten.push({ rowIndex: rij.rowIndex, succes: false, fout, bron: 'klant' })
      );
      continue;
    }

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
      klantRijen.forEach((rij) =>
        resultaten.push({ rowIndex: rij.rowIndex, succes: true, bron: 'klant' })
      );
    } catch (error) {
      klantRijen.forEach((rij) =>
        resultaten.push({
          rowIndex: rij.rowIndex,
          succes: false,
          fout: error instanceof OnboardingError ? error.message : 'Onbekende fout',
          bron: 'klant',
        })
      );
    }
  }

  return resultaten;
}

export async function importeerActielog(rijen: ParsedActielogRow[]): Promise<ImportResultaat[]> {
  await assertIsAdmin();

  const supabase = createAdminClient();
  const resultaten: ImportResultaat[] = [];

  for (const rij of rijen) {
    // Geen uniqueness-constraint op listings.naam, dus er kunnen meerdere
    // accommodaties (van verschillende klanten) exact dezelfde naam hebben.
    // .maybeSingle() zou daar een verwarrende fout op geven — we vragen
    // daarom alle matches op en behandelen 0/1/2+ resultaten expliciet.
    const { data: listings } = await supabase
      .from('listings')
      .select('id')
      .eq('naam', rij.accommodatienaam);

    if (!listings || listings.length === 0) {
      resultaten.push({
        rowIndex: rij.rowIndex,
        succes: false,
        fout: `Geen accommodatie gevonden met naam "${rij.accommodatienaam}"`,
        bron: 'actielog',
      });
      continue;
    }

    if (listings.length > 1) {
      resultaten.push({
        rowIndex: rij.rowIndex,
        succes: false,
        fout: `Meerdere accommodaties gevonden met naam "${rij.accommodatienaam}" — koppel deze actielog-rij handmatig via de klantdetailpagina.`,
        bron: 'actielog',
      });
      continue;
    }

    const listing = listings[0];

    const { error } = await supabase.from('action_log').insert({
      listing_id: listing.id,
      datum: rij.datum,
      omschrijving: rij.omschrijving,
      type: rij.type,
    });

    resultaten.push({ rowIndex: rij.rowIndex, succes: !error, fout: error?.message, bron: 'actielog' });
  }

  return resultaten;
}
