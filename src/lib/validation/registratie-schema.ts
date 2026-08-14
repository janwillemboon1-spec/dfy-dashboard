import { z } from 'zod';

export const registratieSchema = z
  .object({
    naam: z.string().min(1, 'Naam is verplicht'),
    email: z.string().email('Ongeldig e-mailadres'),
    telefoon: z.string().optional(),
    wachtwoord: z.string().min(6, 'Wachtwoord moet minimaal 6 tekens zijn'),
    wachtwoordBevestiging: z.string().min(1, 'Bevestiging is verplicht'),
    honeypot: z.string().max(0).optional(),
  })
  .refine((data) => data.wachtwoord === data.wachtwoordBevestiging, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['wachtwoordBevestiging'],
  });

export type RegistratieInput = z.infer<typeof registratieSchema>;
