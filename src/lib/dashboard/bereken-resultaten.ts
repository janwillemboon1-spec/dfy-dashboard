export interface NulmetingRij {
  jaar: number;
  maand: number;
  omzet: number;
}

export interface ActueleRij {
  jaar: number;
  maand: number;
  omzet: number;
}

export interface ListingData {
  nulmeting: NulmetingRij[];
  monthlyActuals: ActueleRij[];
}

export interface MaandVergelijking {
  jaar: number;
  maand: number;
  nulmetingOmzet: number;
  actueelOmzet: number;
}

export function berekenMaandVergelijkingen(listings: ListingData[]): MaandVergelijking[] {
  const perMaand = new Map<string, MaandVergelijking>();

  for (const listing of listings) {
    const nulmetingPerMaandnummer = new Map<number, number>();
    for (const rij of listing.nulmeting) {
      nulmetingPerMaandnummer.set(rij.maand, rij.omzet);
    }

    for (const actueleRij of listing.monthlyActuals) {
      const nulmetingOmzet = nulmetingPerMaandnummer.get(actueleRij.maand);
      if (nulmetingOmzet === undefined) {
        // Kan voorkomen als de nulmeting niet alle 12 maandnummers dekt (bv. een
        // dubbel ingevuld maandnummer bij handmatige onboarding, dat een ander
        // maandnummer onbedekt laat) — dit is dan een datakwaliteitsprobleem, niet
        // verwacht gedrag, dus zichtbaar loggen i.p.v. stilzwijgend negeren. Analoog
        // aan hoe berekenMaandTotalen (src/lib/pricelabs/sync.ts) ongeldige
        // reserveringsdata behandelt.
        console.warn(
          `[berekenMaandVergelijkingen] geen nulmeting gevonden voor maand ${actueleRij.maand} (jaar ${actueleRij.jaar}), overgeslagen`
        );
        continue;
      }

      const sleutel = `${actueleRij.jaar}-${actueleRij.maand}`;
      const bestaand = perMaand.get(sleutel) ?? {
        jaar: actueleRij.jaar,
        maand: actueleRij.maand,
        nulmetingOmzet: 0,
        actueelOmzet: 0,
      };
      bestaand.nulmetingOmzet += nulmetingOmzet;
      bestaand.actueelOmzet += actueleRij.omzet;
      perMaand.set(sleutel, bestaand);
    }
  }

  return Array.from(perMaand.values()).sort((a, b) => a.jaar - b.jaar || a.maand - b.maand);
}

// Verwacht chronologisch gesorteerde invoer (zoals berekenMaandVergelijkingen die oplevert) —
// sorteert zelf niet opnieuw, slice(-12) op ongesorteerde data geeft geen zinnig resultaat.
export function laatste12Maanden(vergelijkingen: MaandVergelijking[]): MaandVergelijking[] {
  return vergelijkingen.slice(-12);
}

export function berekenWowCijfer(vergelijkingen: MaandVergelijking[]): number | null {
  if (vergelijkingen.length === 0) return null;
  return vergelijkingen.reduce((totaal, rij) => totaal + (rij.actueelOmzet - rij.nulmetingOmzet), 0);
}
