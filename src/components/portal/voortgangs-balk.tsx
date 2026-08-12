import { FASE_NAMEN } from '@/lib/constants/fasen';
import { faseStatusLabel } from '@/lib/dashboard/fase-status';

export interface FaseVoortgang {
  faseNummer: 1 | 2 | 3;
  percentage: number;
}

const ALLE_FASEN = [1, 2, 3] as const;

export function VoortgangsBalk({ fasen }: { fasen: FaseVoortgang[] }) {
  const percentagePerFase = new Map(fasen.map((f) => [f.faseNummer, f.percentage]));
  const fase3Percentage = percentagePerFase.get(3) ?? 0;

  return (
    <div>
      <div className="flex gap-3">
        {ALLE_FASEN.map((faseNummer) => {
          const percentage = percentagePerFase.get(faseNummer) ?? 0;
          return (
            <div key={faseNummer} className="flex-1">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {faseNummer}. {FASE_NAMEN[faseNummer - 1]}
              </p>
              <p className="text-xs font-medium">{faseStatusLabel(percentage)}</p>
            </div>
          );
        })}
      </div>
      {fase3Percentage >= 100 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Fase 3 is volledig doorlopen — toekomstige optimalisaties zijn te volgen in het
          activiteitenlog.
        </p>
      )}
    </div>
  );
}
