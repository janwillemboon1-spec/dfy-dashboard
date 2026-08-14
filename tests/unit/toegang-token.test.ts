import { describe, it, expect, beforeEach } from 'vitest';
import { maakToegangsToken, tokenIsGeldig } from '@/lib/registratie/toegang-token';

describe('toegang-token', () => {
  beforeEach(() => {
    process.env.REGISTRATIE_WACHTWOORD = 'test-wachtwoord';
  });

  it('accepteert een geldig, niet-verlopen token', () => {
    const token = maakToegangsToken(Date.now() + 60_000);
    expect(tokenIsGeldig(token)).toBe(true);
  });

  it('wijst een verlopen token af', () => {
    const token = maakToegangsToken(Date.now() - 1000);
    expect(tokenIsGeldig(token)).toBe(false);
  });

  it('wijst een geknoeid token af', () => {
    const token = maakToegangsToken(Date.now() + 60_000);
    const laatsteChar = token.slice(-1);
    const geknoeid = token.slice(0, -1) + (laatsteChar === '0' ? '1' : '0');
    expect(tokenIsGeldig(geknoeid)).toBe(false);
  });

  it('wijst een ontbrekend token af', () => {
    expect(tokenIsGeldig(undefined)).toBe(false);
  });
});
