import { z } from 'zod';

export const nulmetingMaandSchema = z.object({
  jaar: z
    .number({ error: 'Jaar is verplicht' })
    .int('Jaar moet een geheel getal zijn')
    .min(2000, 'Jaar moet 2000 of later zijn')
    .max(2100, 'Jaar moet 2100 of eerder zijn'),
  maand: z
    .number({ error: 'Maand is verplicht' })
    .int('Maand moet een geheel getal zijn')
    .min(1, 'Maand moet tussen 1 en 12 liggen')
    .max(12, 'Maand moet tussen 1 en 12 liggen'),
  omzet: z
    .number({ error: 'Omzet is verplicht' })
    .min(0, 'Omzet mag niet negatief zijn'),
  bezetting: z
    .number({ error: 'Bezetting is verplicht' })
    .min(0, 'Bezetting mag niet negatief zijn')
    .max(100, 'Bezetting mag niet hoger zijn dan 100%'),
});

export const accommodatieSchema = z.object({
  naam: z.string().min(1, 'Naam is verplicht'),
  adres: z.string().optional(),
  nulmeting: z.array(nulmetingMaandSchema).length(12, 'Precies 12 maanden nulmeting verplicht'),
});

export const onboardingSchema = z.object({
  naam: z.string().min(1, 'Naam is verplicht'),
  email: z.string().email('Ongeldig e-mailadres'),
  telefoon: z.string().optional(),
  accommodaties: z.array(accommodatieSchema).min(1, 'Minimaal 1 accommodatie verplicht'),
  honeypot: z.string().max(0).optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
