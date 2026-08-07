export interface NulmetingBron {
  jaar: number;
  maand: number;
}

// De 12 kalendermaanden die direct voorafgaan aan (startJaar, startMaand), chronologisch
// (oudste eerst). Voor start = september 2026 (9, 2026): augustus 2026 t/m januari 2026,
// gevolgd door december 2025 t/m september 2025 — 12 maanden, altijd al verstreken op het
// moment dat de samenwerking start, dus allemaal bruikbaar als échte PriceLabs-data. Geen
// STLY-schatting meer nodig: er zit per definitie geen toekomstige maand in dit venster.
export function bepaalNulmetingBronnen(startJaar: number, startMaand: number): NulmetingBron[] {
  const bronnen: NulmetingBron[] = [];
  let jaar = startJaar;
  let maand = startMaand;
  for (let i = 0; i < 12; i++) {
    maand -= 1;
    if (maand === 0) {
      maand = 12;
      jaar -= 1;
    }
    bronnen.unshift({ jaar, maand });
  }
  return bronnen;
}
