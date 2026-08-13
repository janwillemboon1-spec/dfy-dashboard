'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const KANAAL_KLEUREN: Record<string, string> = {
  airbnb: '#FF5A5F',
  bcom: '#003580',
  vrbo: '#1A8FE3',
};
function kanaalKleur(kanaal: string): string {
  return KANAAL_KLEUREN[kanaal] ?? 'var(--chart-3)';
}
function kanaalLabel(kanaal: string): string {
  if (kanaal === 'airbnb') return 'Airbnb';
  if (kanaal === 'bcom') return 'Booking.com';
  if (kanaal === 'vrbo') return 'Vrbo';
  return kanaal.charAt(0).toUpperCase() + kanaal.slice(1);
}

export function KanaalUitsplitsing({ kanalen }: { kanalen: Record<string, { omzet: number; boekingen: number }> }) {
  const rijen = Object.entries(kanalen).sort((a, b) => b[1].omzet - a[1].omzet);
  if (rijen.length === 0) return null;

  const totaal = rijen.reduce((s, [, k]) => s + k.omzet, 0);
  const pieData = rijen.map(([kanaal, k]) => ({
    naam: kanaalLabel(kanaal),
    kleur: kanaalKleur(kanaal),
    waarde: k.omzet,
  }));

  return (
    <div className="flex gap-4 items-stretch flex-col lg:flex-row">
      <div className="flex-1 bg-card border border-border rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-xs text-muted-foreground uppercase">
              <th className="text-left px-3 py-1.5">Kanaal</th>
              <th className="text-right px-3 py-1.5">Boekingen</th>
              <th className="text-right px-3 py-1.5">Omzet</th>
              <th className="text-right px-3 py-1.5">%</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map(([kanaal, k]) => (
              <tr key={kanaal} className="border-t border-border">
                <td className="px-3 py-1.5 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: kanaalKleur(kanaal) }} />
                    {kanaalLabel(kanaal)}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">{k.boekingen}</td>
                <td className="px-3 py-1.5 text-right font-medium">€ {k.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {totaal > 0 ? `${((k.omzet / totaal) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-1 bg-card border border-border rounded-xl min-w-0 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} dataKey="waarde" nameKey="naam" innerRadius={40} outerRadius={70}>
              {pieData.map((d) => (
                <Cell key={d.naam} fill={d.kleur} />
              ))}
            </Pie>
            <Tooltip formatter={(waarde) => `€ ${Number(waarde).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
