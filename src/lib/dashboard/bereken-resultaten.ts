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
  // 'JJJJ-MM-DD', wordt alleen gezet door de PriceLabs-nulmetingberekening
  // (berekenNulmetingUitPricelabs). null voor accommodaties die nog geen nulmeting via
  // die flow hebben (bv. nog CSV-onboarding-only) — voor die accommodaties wordt geen
  // cutoff toegepast, zie de toelichting bij de filter hieronder.
  samenwerkingGestart: string | null;
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

    // Elke accommodatie heeft haar eigen samenwerking_gestart — niet de klant als geheel.
    // Bij meerdere accommodaties met verschillende startmaanden telt een accommodatie die
    // al langer meedraait dus over meer maanden mee dan een net gestarte: dat is bewust,
    // "extra omzet t.o.v. vóór Boon Vakantieverhuur" is een per-accommodatie-vraag die pas
    // daarna wordt opgeteld. "Vanaf" is inclusief: de startmaand zelf telt al mee.
    let cutoff: { jaar: number; maand: number } | null = null;
    if (listing.samenwerkingGestart) {
      const [jaarStr, maandStr] = listing.samenwerkingGestart.split('-');
      cutoff = { jaar: Number(jaarStr), maand: Number(maandStr) };
    }

    for (const actueleRij of listing.monthlyActuals) {
      if (
        cutoff &&
        (actueleRij.jaar < cutoff.jaar || (actueleRij.jaar === cutoff.jaar && actueleRij.maand < cutoff.maand))
      ) {
        continue;
      }

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

export function berekenWowCijfer(vergelijkingen: MaandVergelijking[]): number | null {
  if (vergelijkingen.length === 0) return null;
  return vergelijkingen.reduce((totaal, rij) => totaal + (rij.actueelOmzet - rij.nulmetingOmzet), 0);
}
