import { describe, it, expect } from 'vitest';
import { faseStatusLabel } from '@/lib/dashboard/fase-status';

describe('faseStatusLabel', () => {
  it('toont "Afgerond" bij 100%', () => {
    expect(faseStatusLabel(100)).toBe('Afgerond');
  });

  it('toont "Nog niet gestart" bij 0%', () => {
    expect(faseStatusLabel(0)).toBe('Nog niet gestart');
  });

  it('toont het percentage voor waarden ertussen', () => {
    expect(faseStatusLabel(45)).toBe('45%');
  });
});
