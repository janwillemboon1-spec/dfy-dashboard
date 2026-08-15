import { describe, it, expect, beforeEach } from 'vitest';
import { versleutel, ontsleutel } from '@/lib/inloggegevens/versleuteling';

// Een deterministieve, geldige 32-byte testsleutel (base64) — niet de echte productiesleutel.
const TEST_SLEUTEL = Buffer.alloc(32, 7).toString('base64');

describe('versleuteling', () => {
  beforeEach(() => {
    process.env.INLOGGEGEVENS_SLEUTEL = TEST_SLEUTEL;
  });

  it('versleutelt en ontsleutelt een waarde correct', () => {
    const origineel = 'super-geheim-wachtwoord-123';
    const versleuteld = versleutel(origineel);
    expect(versleuteld).not.toBe(origineel);
    expect(ontsleutel(versleuteld)).toBe(origineel);
  });

  it('geeft elke keer een andere cijfertekst voor dezelfde waarde (willekeurige IV)', () => {
    const a = versleutel('zelfde-wachtwoord');
    const b = versleutel('zelfde-wachtwoord');
    expect(a).not.toBe(b);
    expect(ontsleutel(a)).toBe('zelfde-wachtwoord');
    expect(ontsleutel(b)).toBe('zelfde-wachtwoord');
  });

  it('laat ontsleutel falen bij geknoei met de cijfertekst', () => {
    const versleuteld = versleutel('wachtwoord');
    const delen = versleuteld.split('.');
    const geknoeideCijfertekst = `${delen[0]}.${delen[1]}.${delen[2].slice(0, -4)}AAAA`;
    expect(() => ontsleutel(geknoeideCijfertekst)).toThrow();
  });

  it('gooit een duidelijke fout als INLOGGEGEVENS_SLEUTEL ontbreekt bij versleutelen', () => {
    delete process.env.INLOGGEGEVENS_SLEUTEL;
    expect(() => versleutel('wachtwoord')).toThrow('INLOGGEGEVENS_SLEUTEL ontbreekt');
  });

  it('gooit een duidelijke fout als INLOGGEGEVENS_SLEUTEL ontbreekt bij ontsleutelen', () => {
    const versleuteld = versleutel('wachtwoord');
    delete process.env.INLOGGEGEVENS_SLEUTEL;
    expect(() => ontsleutel(versleuteld)).toThrow('INLOGGEGEVENS_SLEUTEL ontbreekt');
  });
});
