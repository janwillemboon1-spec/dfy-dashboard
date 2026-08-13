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
    <div className="overflow-x-auto bg-card border border-border rounded-xl">
      <table className="w-full text-sm">
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
            // vergelijkWaarde is alleen null als er écht geen vergelijkingsdata is
            // (nulmeting-modus zonder gekoppelde periode) — dat is iets anders dan een
            // vergelijkingsomzet van precies € 0, wat een geldige waarde is (bv. STLY
            // vóórdat de listing bestond). Bij "0 naar iets positiefs" is een relatief
            // percentage niet zinvol (deling door nul), dus dat geval krijgt het label
            // "nieuw" i.p.v. stil verdwijnen achter hetzelfde streepje als "geen data".
            const geenVergelijkingsdata = vergelijkWaarde === null;
            const verschil = !geenVergelijkingsdata && vergelijkWaarde > 0
              ? ((t.omzet - vergelijkWaarde) / vergelijkWaarde) * 100
              : null;
            const isNieuw = !geenVergelijkingsdata && vergelijkWaarde === 0 && t.omzet > 0;
            return (
              <tr key={t.maand} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{label}</td>
                <td className="px-4 py-2 text-right font-medium">€ {t.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {geenVergelijkingsdata ? '—' : `€ ${vergelijkWaarde.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`}
                </td>
                <td className="px-4 py-2 text-right">
                  {isNieuw ? (
                    <span className="text-green-700">nieuw</span>
                  ) : verschil !== null ? (
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
    </div>
  );
}
