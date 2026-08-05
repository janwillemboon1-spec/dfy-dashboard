import type { OmzetMetrics } from '@/lib/dashboard/omzet-aggregatie';

function fmt(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
// Nachten via nulmeting zijn afgeleid uit bezetting% × dagen-in-maand en dus vaak
// fractioneel (nulmeting-metrics.ts) — afronden naar een geheel getal zou dan niet meer
// overeenkomen met het (op de ongeronde waarde berekende) vergelijkingspercentage
// ernaast. Bij een geheel getal (altijd het geval voor STLY, want dat komt uit echte,
// hele boekingsnachten) blijft de weergave gewoon een geheel getal.
function fmtNachten(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function vergelijkPct(huidig: number, vorig: number): number | null {
  return vorig > 0 ? ((huidig - vorig) / vorig) * 100 : null;
}
// Bezetting is zelf al een percentage — een relatieve procentuele verandering (bv.
// "+14,3%" bij 80% t.o.v. 70%) leest daar minder natuurlijk dan het procentpunt-verschil
// ("+10pp") dat een verhuurder/DFY-doelgroep zou verwachten.
function puntenVerschil(huidig: number, vorig: number): number {
  return huidig - vorig;
}

type VergelijkType = 'relatief' | 'punten';

function VergelijkBadge({ waarde, type, label }: { waarde: number | null; type: VergelijkType; label: string }) {
  if (waarde === null) return <span className="text-xs text-muted-foreground">geen data</span>;
  const tekst = type === 'punten'
    ? `${waarde >= 0 ? '+' : ''}${waarde.toFixed(1)}pp`
    : fmtPct(waarde);
  return (
    <span
      className={`text-xs font-medium px-1.5 py-0.5 rounded ${waarde >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
    >
      {tekst} {label}
    </span>
  );
}

export function KpiKaarten({
  huidig,
  vergelijking,
  vergelijkLabel,
}: {
  huidig: OmzetMetrics;
  vergelijking: OmzetMetrics | null;
  vergelijkLabel: string;
}) {
  const kaarten: { label: string; waarde: string; badgeWaarde: number | null; type: VergelijkType }[] = [
    { label: 'Huuromzet', waarde: fmt(huidig.omzet), badgeWaarde: vergelijking ? vergelijkPct(huidig.omzet, vergelijking.omzet) : null, type: 'relatief' },
    { label: 'Totaal incl. schoonmaak', waarde: fmt(huidig.omzetIncl), badgeWaarde: null, type: 'relatief' },
    { label: 'ADR', waarde: fmt(huidig.adr), badgeWaarde: vergelijking ? vergelijkPct(huidig.adr, vergelijking.adr) : null, type: 'relatief' },
    { label: 'Bezetting', waarde: `${huidig.bezetting.toFixed(1)}%`, badgeWaarde: vergelijking ? puntenVerschil(huidig.bezetting, vergelijking.bezetting) : null, type: 'punten' },
    { label: 'RevPAR', waarde: fmt(huidig.revpar), badgeWaarde: vergelijking ? vergelijkPct(huidig.revpar, vergelijking.revpar) : null, type: 'relatief' },
    { label: 'Geboekte nachten', waarde: fmtNachten(huidig.nachten), badgeWaarde: vergelijking ? vergelijkPct(huidig.nachten, vergelijking.nachten) : null, type: 'relatief' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kaarten.map((k) => (
        <div key={k.label} className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
          <p className="text-lg font-bold">{k.waarde}</p>
          {vergelijking && <VergelijkBadge waarde={k.badgeWaarde} type={k.type} label={vergelijkLabel} />}
        </div>
      ))}
    </div>
  );
}
