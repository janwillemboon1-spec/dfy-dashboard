import { MAAND_NAMEN_KORT } from '@/lib/constants/maanden';

interface NulmetingRij {
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

interface ActueleRij {
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

export function ResultatenTabel({
  nulmeting,
  actueel,
  pricelabsListingId,
}: {
  nulmeting: NulmetingRij[];
  actueel: ActueleRij[];
  pricelabsListingId: string | null;
}) {
  const actueelPerMaand = new Map(actueel.map((rij) => [`${rij.jaar}-${rij.maand}`, rij]));
  const gesorteerd = [...nulmeting].sort((a, b) => a.jaar - b.jaar || a.maand - b.maand);

  // Zonder koppeling is er sowieso niets gesynchroniseerd — een tabel vol streepjes
  // zou dan niet te onderscheiden zijn van "wel gekoppeld, nog niet gesynchroniseerd".
  // PricelabsKoppeling (hierboven op de pagina) toont de koppelstatus al.
  if (!pricelabsListingId) return null;
  if (gesorteerd.length === 0) return null;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th>Maand</th>
          <th>Nulmeting omzet</th>
          <th>Nulmeting bezetting</th>
          <th>Actueel omzet</th>
          <th>Actueel bezetting</th>
        </tr>
      </thead>
      <tbody>
        {gesorteerd.map((rij) => {
          const actueleRij = actueelPerMaand.get(`${rij.jaar}-${rij.maand}`);
          return (
            <tr key={`${rij.jaar}-${rij.maand}`}>
              <td>
                {MAAND_NAMEN_KORT[rij.maand - 1]} {rij.jaar}
              </td>
              <td>€ {rij.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
              <td>{rij.bezetting}%</td>
              <td>{actueleRij ? `€ ${actueleRij.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}` : '—'}</td>
              <td>{actueleRij ? `${actueleRij.bezetting}%` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
