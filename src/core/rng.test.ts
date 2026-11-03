import { describe, expect, it } from 'vitest';
import { createRng, range } from './rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, () => a() === b()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it('stays within [0, 1) and is roughly uniform', () => {
    const rng = createRng(7);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });

  it('range() maps into [min, max)', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const v = range(rng, -5, 10);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(10);
    }
  });
});
