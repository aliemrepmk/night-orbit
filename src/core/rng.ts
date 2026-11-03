/** A random number generator returning floats in [0, 1). */
export type Rng = () => number;

/**
 * Seeded PRNG (mulberry32). The same seed always gives the same sequence,
 * so terrain, map scatter and AI behavior are repeatable between runs and in tests.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
