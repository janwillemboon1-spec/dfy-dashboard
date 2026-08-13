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

export function berekenMaandVergelijkingen(listings: ListingData[], nu: Date = new Date()): MaandVergelijking[] {
  const huidigeMaand = { jaar: nu.getUTCFullYear(), maand: nu.getUTCMonth() + 1 };
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

      // monthly_actuals kan door het glijdende cron-synchronisatievenster (zie
      // scripts/sync-pricelabs-cron.ts, dat welbewust t/m vólgende maand synchroniseert
      // om laat gewijzigde/geannuleerde boekingen in de zojuist afgesloten maand te
      // kunnen bijwerken) ook al een rij voor een nog niet aangebroken maand bevatten,
      // met omzet van reserveringen die al ver vooruit geboekt zijn. Zo'n maand is nog
      // niet "gerealiseerd" en telt niet mee: toekomstige boekingen liggen doorgaans
      // (nog) lager dan de nulmeting van diezelfde maand — er is simpelweg nog minder
      // tijd geweest om te boeken — wat het totaal ten onrechte negatief zou trekken en
      // niet weerspiegelt hoeveel extra omzet er tot nu toe daadwerkelijk is gerealiseerd.
      if (
        actueleRij.jaar > huidigeMaand.jaar ||
        (actueleRij.jaar === huidigeMaand.jaar && actueleRij.maand > huidigeMaand.maand)
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

// Voor de "sinds ..."-vermelding op het klantdashboard: de vroegste samenwerking_gestart
// over alle accommodaties van de klant, ongeacht welke accommodatie dat is. Accommodaties
// zonder samenwerking_gestart (nog geen nulmeting via de PriceLabs-flow) tellen niet mee.
export function vroegsteSamenwerkingGestart(data: (string | null)[]): { jaar: number; maand: number } | null {
  const datums = data.filter((d): d is string => d !== null);
  if (datums.length === 0) return null;
  // ISO-datumstrings ('JJJJ-MM-DD') sorteren lexicografisch al chronologisch correct.
  const vroegste = datums.reduce((a, b) => (a < b ? a : b));
  const [jaarStr, maandStr] = vroegste.split('-');
  return { jaar: Number(jaarStr), maand: Number(maandStr) };
}

export function berekenWowCijfer(vergelijkingen: MaandVergelijking[]): number | null {
  if (vergelijkingen.length === 0) return null;
  return vergelijkingen.reduce((totaal, rij) => totaal + (rij.actueelOmzet - rij.nulmetingOmzet), 0);
}
