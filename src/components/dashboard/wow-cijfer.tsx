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

  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground">
        Extra omzet t.o.v. dezelfde periode vóór Boon Vakantieverhuur
      </p>
      <p className="mt-2 font-serif text-5xl font-medium">
        {teken} € {absoluteWaarde.toLocaleString('nl-NL')}
      </p>
    </div>
  );
}
