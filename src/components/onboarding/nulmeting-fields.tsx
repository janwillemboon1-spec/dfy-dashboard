'use client';

import type { UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAAND_NAMEN_VOL } from '@/lib/constants/maanden';
import type { OnboardingInput } from '@/lib/validation/onboarding-schema';

export function NulmetingFields({
  register,
  accommodatieIndex,
}: {
  register: UseFormRegister<OnboardingInput>;
  accommodatieIndex: number;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        Vul de omzet en bezetting in van de 12 maanden vóór de start van de service.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, maandIndex) => (
          <div key={maandIndex} className="rounded border border-border p-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <Label className="text-xs">Jaar</Label>
                <Input
                  type="number"
                  {...register(
                    `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.jaar` as const,
                    { valueAsNumber: true }
                  )}
                />
              </div>
              <div>
                <Label className="text-xs">Maand</Label>
                <select
                  className="w-full rounded border border-input bg-background px-2 py-2 text-sm"
                  {...register(
                    `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.maand` as const,
                    { valueAsNumber: true }
                  )}
                >
                  {MAAND_NAMEN_VOL.map((naam, i) => (
                    <option key={naam} value={i + 1}>{naam}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Omzet (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register(
                    `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.omzet` as const,
                    { valueAsNumber: true }
                  )}
                />
              </div>
              <div>
                <Label className="text-xs">Bezetting (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  {...register(
                    `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.bezetting` as const,
                    { valueAsNumber: true }
                  )}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
