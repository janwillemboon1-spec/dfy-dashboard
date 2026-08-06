export interface NulmetingBron {
  maand: number; // doelmaand (1-12) binnen het startjaar van de nulmeting
  bron: 'echt' | 'stly';
  bronJaar: number;
  bronMaand: number;
}

// Voor maanden t/m de startmaand van de samenwerking is de echte omzet van dat kalenderjaar
// zelf al bekend (de accommodatie is dan al gekoppeld en gesynchroniseerd) en dus bruikbaar
// als nulmeting. Voor maanden ná de startmaand bestaat er nog geen "wat had er zonder ons
// gebeurd"-cijfer — daarvoor wordt STLY (dezelfde maand, één jaar eerder) als schatting
// gebruikt. Het omslagpunt ligt bewust vast op de startmaand zelf, niet op "vandaag": ook als
// deze functie maanden of jaren na de startdatum wordt aangeroepen, zou "vandaag" als
// omslagpunt data ná de samenwerkingsstart als nulmeting meetellen — en die data is dan al
// door de DFY-begeleiding beïnvloed, dus ongeschikt als baseline.
export function bepaalNulmetingBronnen(startJaar: number, startMaand: number): NulmetingBron[] {
  const bronnen: NulmetingBron[] = [];
  for (let maand = 1; maand <= 12; maand++) {
    if (maand <= startMaand) {
      bronnen.push({ maand, bron: 'echt', bronJaar: startJaar, bronMaand: maand });
    } else {
      bronnen.push({ maand, bron: 'stly', bronJaar: startJaar - 1, bronMaand: maand });
    }
  }
  return bronnen;
}
