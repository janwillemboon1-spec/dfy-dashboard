import { describe, it, expect } from 'vitest';
import { registratieSchema } from '@/lib/validation/registratie-schema';

describe('registratieSchema', () => {
  it('accepteert een geldige registratie', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      telefoon: '0612345678',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'geheimwachtwoord123',
    });
    expect(result.success).toBe(true);
  });

  it('wijst niet-overeenkomende wachtwoorden af', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'anderwachtwoord456',
    });
    expect(result.success).toBe(false);
  });

  it('wijst een te kort wachtwoord af', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      wachtwoord: 'kort1',
      wachtwoordBevestiging: 'kort1',
    });
    expect(result.success).toBe(false);
  });

  it('wijst een ongeldig e-mailadres af', () => {
    const result = registratieSchema.safeParse({
      naam: 'Jan Jansen',
      email: 'niet-een-email',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'geheimwachtwoord123',
    });
    expect(result.success).toBe(false);
  });

  it('wijst een ontbrekende naam af', () => {
    const result = registratieSchema.safeParse({
      naam: '',
      email: 'jan@voorbeeld.nl',
      wachtwoord: 'geheimwachtwoord123',
      wachtwoordBevestiging: 'geheimwachtwoord123',
    });
    expect(result.success).toBe(false);
  });
});
