import { z } from 'zod';

export const nulmetingMaandSchema = z.object({
  jaar: z.number().int().min(2000).max(2100),
  maand: z.number().int().min(1).max(12),
  omzet: z.number().min(0),
  bezetting: z.number().min(0).max(100),
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
