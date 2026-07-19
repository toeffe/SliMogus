import seedrandom from 'seedrandom';

/**
 * Deterministic PRNG wrapper. Two `Random` instances constructed with the
 * same seed produce an identical sequence of outputs, which is the
 * foundation the whole simulation's determinism guarantee is built on.
 */
export class Random {
  private readonly prng: seedrandom.PRNG;

  constructor(seed: string) {
    this.prng = seedrandom(seed);
  }

  /** Uniform double in [0, 1). */
  next(): number {
    return this.prng();
  }

  /** Uniform double in [min, max). */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat(min, max + 1));
  }
}
