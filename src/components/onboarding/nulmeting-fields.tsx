'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAAND_NAMEN_VOL } from '@/lib/constants/maanden';
import type { OnboardingInput } from '@/lib/validation/onboarding-schema';

export function NulmetingFields({
  register,
  errors,
  accommodatieIndex,
}: {
  register: UseFormRegister<OnboardingInput>;
  errors: FieldErrors<OnboardingInput>;
  accommodatieIndex: number;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        Vul de omzet en bezetting in van de 12 maanden vóór de start van de service.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, maandIndex) => {
          const maandErrors =
            errors.accommodaties?.[accommodatieIndex]?.nulmeting?.[maandIndex];

          return (
            <div key={maandIndex} className="rounded border border-border p-3">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <Label className="text-xs">Jaar</Label>
                  <Input
                    type="number"
                    aria-invalid={maandErrors?.jaar ? true : undefined}
                    {...register(
                      `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.jaar` as const,
                      { valueAsNumber: true }
                    )}
                  />
                  {maandErrors?.jaar && (
                    <p className="text-sm text-destructive">{maandErrors.jaar.message}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Maand</Label>
                  <select
                    className="w-full rounded border border-input bg-background px-2 py-2 text-sm"
                    aria-invalid={maandErrors?.maand ? true : undefined}
                    {...register(
                      `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.maand` as const,
                      { valueAsNumber: true }
                    )}
                  >
                    {MAAND_NAMEN_VOL.map((naam, i) => (
                      <option key={naam} value={i + 1}>{naam}</option>
                    ))}
                  </select>
                  {maandErrors?.maand && (
                    <p className="text-sm text-destructive">{maandErrors.maand.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Omzet (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    aria-invalid={maandErrors?.omzet ? true : undefined}
                    {...register(
                      `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.omzet` as const,
                      { valueAsNumber: true }
                    )}
                  />
                  {maandErrors?.omzet && (
                    <p className="text-sm text-destructive">{maandErrors.omzet.message}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Bezetting (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    aria-invalid={maandErrors?.bezetting ? true : undefined}
                    {...register(
                      `accommodaties.${accommodatieIndex}.nulmeting.${maandIndex}.bezetting` as const,
                      { valueAsNumber: true }
                    )}
                  />
                  {maandErrors?.bezetting && (
                    <p className="text-sm text-destructive">{maandErrors.bezetting.message}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
