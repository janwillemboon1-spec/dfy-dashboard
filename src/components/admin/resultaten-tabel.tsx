import { MAAND_NAMEN_KORT } from '@/lib/constants/maanden';

interface ActueleRij {
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

// Vast venster van 12 maanden rond vandaag: de afgelopen 6 (inclusief de huidige maand)
// plus de komende 6 — dus offset -5 t/m +6 t.o.v. de huidige maand.
function twaalfMaandenVenster(): { jaar: number; maand: number }[] {
  const nu = new Date();
  const basisJaar = nu.getUTCFullYear();
  const basisMaandIndex = nu.getUTCMonth(); // 0-11

  const maanden: { jaar: number; maand: number }[] = [];
  for (let offset = -5; offset <= 6; offset++) {
    const totaalMaandenIndex = basisMaandIndex + offset;
    const jaar = basisJaar + Math.floor(totaalMaandenIndex / 12);
    const maand = ((totaalMaandenIndex % 12) + 12) % 12 + 1;
    maanden.push({ jaar, maand });
  }
  return maanden;
}

export function ResultatenTabel({
  actueel,
  pricelabsListingId,
}: {
  actueel: ActueleRij[];
  pricelabsListingId: string | null;
}) {
  // Zonder koppeling is er sowieso niets gesynchroniseerd — een tabel vol streepjes
  // zou dan niet te onderscheiden zijn van "wel gekoppeld, nog niet gesynchroniseerd".
  // PricelabsKoppeling (hierboven op de pagina) toont de koppelstatus al.
  if (!pricelabsListingId) return null;

  const actueelPerMaand = new Map(actueel.map((rij) => [`${rij.jaar}-${rij.maand}`, rij]));
  const venster = twaalfMaandenVenster();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th>Maand</th>
            <th>Omzet</th>
            <th>Bezetting</th>
          </tr>
        </thead>
        <tbody>
          {venster.map(({ jaar, maand }) => {
            const rij = actueelPerMaand.get(`${jaar}-${maand}`);
            return (
              <tr key={`${jaar}-${maand}`}>
                <td>
                  {MAAND_NAMEN_KORT[maand - 1]} {jaar}
                </td>
                <td>{rij ? `€ ${rij.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}` : '—'}</td>
                <td>{rij ? `${rij.bezetting}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
