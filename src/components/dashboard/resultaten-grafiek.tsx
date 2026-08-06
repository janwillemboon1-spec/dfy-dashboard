'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MAAND_NAMEN_KORT } from '@/lib/constants/maanden';
import type { MaandVergelijking } from '@/lib/dashboard/bereken-resultaten';

export function ResultatenGrafiek({ data }: { data: MaandVergelijking[] }) {
  if (data.length === 0) return null;

  const grafiekData = data.map((punt) => ({
    label: `${MAAND_NAMEN_KORT[punt.maand - 1]} '${String(punt.jaar).slice(2)}`,
    Nulmeting: punt.nulmetingOmzet,
    Actueel: punt.actueelOmzet,
  }));

  return (
    <div
      className="h-72 w-full"
      role="img"
      aria-label="Staafdiagram: omzet per maand, nulmeting vergeleken met actueel"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={grafiekData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(waarde: number) => `€${waarde.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`} />
          <Tooltip formatter={(waarde) => `€ ${Number(waarde).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`} />
          <Legend />
          <Bar dataKey="Nulmeting" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Actueel" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
