export function WowCijfer({ bedrag }: { bedrag: number | null }) {
  if (bedrag === null) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">
          We zijn je resultaten aan het verzamelen — kom hier binnenkort terug.
        </p>
      </div>
    );
  }

  const teken = bedrag >= 0 ? '+' : '−';
  const absoluteWaarde = Math.abs(bedrag);
  // Hele euro's: dit is een oriënterend hero-cijfer, geen boekhoudkundig bedrag —
  // centen (of een losse decimaal door optelling van numeric(10,2)-waarden) zouden
  // hier vooral als een vreemde glitch overkomen op het meest prominente getal van
  // de pagina.
  const bedragTekst = absoluteWaarde.toLocaleString('nl-NL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground">
        Extra omzet t.o.v. dezelfde periode vóór Boon Vakantieverhuur
      </p>
      <h2 className="mt-2 font-serif text-5xl font-medium">
        <span className="sr-only">{bedrag >= 0 ? 'Toename van ' : 'Afname van '}</span>
        {teken} € {bedragTekst}
      </h2>
    </div>
  );
}
