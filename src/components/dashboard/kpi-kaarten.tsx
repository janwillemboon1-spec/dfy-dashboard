import type { OmzetMetrics } from '@/lib/dashboard/omzet-aggregatie';

function fmt(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function vergelijkPct(huidig: number, vorig: number): number | null {
  return vorig > 0 ? ((huidig - vorig) / vorig) * 100 : null;
}

function VergelijkBadge({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">geen data</span>;
  return (
    <span
      className={`text-xs font-medium px-1.5 py-0.5 rounded ${pct >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
    >
      {fmtPct(pct)} {label}
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
  const kaarten: { label: string; waarde: string; pct: number | null }[] = [
    { label: 'Huuromzet', waarde: fmt(huidig.omzet), pct: vergelijking ? vergelijkPct(huidig.omzet, vergelijking.omzet) : null },
    { label: 'Totaal incl. schoonmaak', waarde: fmt(huidig.omzetIncl), pct: null },
    { label: 'ADR', waarde: fmt(huidig.adr), pct: vergelijking ? vergelijkPct(huidig.adr, vergelijking.adr) : null },
    { label: 'Bezetting', waarde: `${huidig.bezetting.toFixed(1)}%`, pct: vergelijking ? vergelijkPct(huidig.bezetting, vergelijking.bezetting) : null },
    { label: 'RevPAR', waarde: fmt(huidig.revpar), pct: vergelijking ? vergelijkPct(huidig.revpar, vergelijking.revpar) : null },
    { label: 'Geboekte nachten', waarde: String(Math.round(huidig.nachten)), pct: vergelijking ? vergelijkPct(huidig.nachten, vergelijking.nachten) : null },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kaarten.map((k) => (
        <div key={k.label} className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
          <p className="text-lg font-bold">{k.waarde}</p>
          {vergelijking && <VergelijkBadge pct={k.pct} label={vergelijkLabel} />}
        </div>
      ))}
    </div>
  );
}
