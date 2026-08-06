import { describe, it, expect } from 'vitest';
import { bepaalNulmetingBronnen } from '@/lib/dashboard/nulmeting-uit-pricelabs';

describe('bepaalNulmetingBronnen', () => {
  it('gebruikt echte data t/m de startmaand, en STLY (vorig jaar, zelfde maand) erna', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 8);

    expect(bronnen).toHaveLength(12);
    expect(bronnen.slice(0, 8)).toEqual([
      { maand: 1, bron: 'echt', bronJaar: 2026, bronMaand: 1 },
      { maand: 2, bron: 'echt', bronJaar: 2026, bronMaand: 2 },
      { maand: 3, bron: 'echt', bronJaar: 2026, bronMaand: 3 },
      { maand: 4, bron: 'echt', bronJaar: 2026, bronMaand: 4 },
      { maand: 5, bron: 'echt', bronJaar: 2026, bronMaand: 5 },
      { maand: 6, bron: 'echt', bronJaar: 2026, bronMaand: 6 },
      { maand: 7, bron: 'echt', bronJaar: 2026, bronMaand: 7 },
      { maand: 8, bron: 'echt', bronJaar: 2026, bronMaand: 8 },
    ]);
    expect(bronnen.slice(8)).toEqual([
      { maand: 9, bron: 'stly', bronJaar: 2025, bronMaand: 9 },
      { maand: 10, bron: 'stly', bronJaar: 2025, bronMaand: 10 },
      { maand: 11, bron: 'stly', bronJaar: 2025, bronMaand: 11 },
      { maand: 12, bron: 'stly', bronJaar: 2025, bronMaand: 12 },
    ]);
  });

  it('gebruikt volledig echte data als de startmaand december is', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 12);
    expect(bronnen.every((b) => b.bron === 'echt')).toBe(true);
    expect(bronnen.every((b) => b.bronJaar === 2026)).toBe(true);
  });

  it('gebruikt alleen januari als echt, en STLY voor de rest, als de startmaand januari is', () => {
    const bronnen = bepaalNulmetingBronnen(2026, 1);
    expect(bronnen[0]).toEqual({ maand: 1, bron: 'echt', bronJaar: 2026, bronMaand: 1 });
    expect(bronnen.slice(1).every((b) => b.bron === 'stly' && b.bronJaar === 2025)).toBe(true);
  });
});
