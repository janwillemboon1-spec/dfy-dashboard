import { describe, it, expect } from 'vitest';
import { onboardingSchema } from '@/lib/validation/onboarding-schema';

const geldigeMaand = { jaar: 2025, maand: 1, omzet: 1000, bezetting: 50 };

describe('onboardingSchema', () => {
  it('accepteert een geldige input met 1 accommodatie en 12 nulmeting-maanden', () => {
    const result = onboardingSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      telefoon: '0612345678',
      accommodaties: [
        {
          naam: 'Strandhuisje',
          adres: 'Duinweg 1',
          nulmeting: Array.from({ length: 12 }, (_, i) => ({ ...geldigeMaand, maand: i + 1 })),
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('wijst een accommodatie met minder dan 12 nulmeting-maanden af', () => {
    const result = onboardingSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      accommodaties: [{ naam: 'Strandhuisje', nulmeting: [geldigeMaand] }],
    });
    expect(result.success).toBe(false);
  });

  it('wijst een ongeldig e-mailadres af', () => {
    const result = onboardingSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'niet-een-email',
      accommodaties: [
        {
          naam: 'Strandhuisje',
          nulmeting: Array.from({ length: 12 }, (_, i) => ({ ...geldigeMaand, maand: i + 1 })),
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
