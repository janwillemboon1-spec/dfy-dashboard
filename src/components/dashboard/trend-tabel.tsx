import { MAAND_NAMEN_VOL } from '@/lib/constants/maanden';

interface TrendRij {
  maand: string; // 'YYYY-MM'
  omzet: number;
  omzetStly: number;
  omzetNulmeting: number | null;
}

export function TrendTabel({ trend, vergelijkModus }: { trend: TrendRij[]; vergelijkModus: 'stly' | 'nulmeting' }) {
  if (trend.length === 0) return null;

  return (
    <table className="w-full text-sm bg-card border border-border rounded-xl overflow-hidden">
      <thead>
        <tr className="bg-muted text-xs text-muted-foreground uppercase">
          <th className="text-left px-4 py-2">Maand</th>
          <th className="text-right px-4 py-2">Omzet</th>
          <th className="text-right px-4 py-2">{vergelijkModus === 'stly' ? 'STLY' : 'Nulmeting'}</th>
          <th className="text-right px-4 py-2">Verschil</th>
        </tr>
      </thead>
      <tbody>
        {trend.map((t) => {
          const [jaarStr, maandStr] = t.maand.split('-');
          const label = `${MAAND_NAMEN_VOL[Number(maandStr) - 1]} ${jaarStr}`;
          const vergelijkWaarde = vergelijkModus === 'stly' ? t.omzetStly : t.omzetNulmeting;
          const verschil = vergelijkWaarde !== null && vergelijkWaarde > 0
            ? ((t.omzet - vergelijkWaarde) / vergelijkWaarde) * 100
            : null;
          return (
            <tr key={t.maand} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{label}</td>
              <td className="px-4 py-2 text-right font-medium">
                {t.omzet > 0 ? `€ ${t.omzet.toLocaleString('nl-NL')}` : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground">
                {vergelijkWaarde !== null && vergelijkWaarde > 0 ? `€ ${vergelijkWaarde.toLocaleString('nl-NL')}` : '—'}
              </td>
              <td className="px-4 py-2 text-right">
                {verschil !== null ? (
                  <span className={verschil >= 0 ? 'text-green-700' : 'text-red-700'}>
                    {verschil >= 0 ? '+' : ''}
                    {verschil.toFixed(1)}%
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
