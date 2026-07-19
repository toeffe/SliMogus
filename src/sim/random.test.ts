import { describe, expect, it } from 'vitest';
import { Random } from './random';

describe('Random', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = new Random('phase1-seed');
    const b = new Random('phase1-seed');

    const sequenceA = Array.from({ length: 20 }, () => a.next());
    const sequenceB = Array.from({ length: 20 }, () => b.next());

    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = new Random('seed-one');
    const b = new Random('seed-two');

    const sequenceA = Array.from({ length: 20 }, () => a.next());
    const sequenceB = Array.from({ length: 20 }, () => b.next());

    expect(sequenceA).not.toEqual(sequenceB);
  });

  it('nextFloat stays within [min, max)', () => {
    const random = new Random('range-seed');
    for (let i = 0; i < 200; i += 1) {
      const value = random.nextFloat(-5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }
  });

  it('nextInt stays within [min, max] inclusive', () => {
    const random = new Random('int-seed');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = random.nextInt(0, 3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(3);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });
});
