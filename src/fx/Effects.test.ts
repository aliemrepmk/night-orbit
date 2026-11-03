import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createRng } from '../core/rng';
import { WEAPONS } from '../gunship/weaponDefs';
import { Effects } from './Effects';
import { CRATER_COOLING } from './Heat';

const DT = 1 / 60;
const flat = () => 0;
const step = (fx: Effects, s: number) => {
  for (let t = 0; t < s - 1e-9; t += DT) fx.update(DT);
};

describe('Effects', () => {
  it('scales the explosion with the weapon: 105 mm throws far more debris and smoke', () => {
    const small = new Effects(flat, createRng(1));
    const big = new Effects(flat, createRng(1));
    small.explosion(new Vector3(), WEAPONS['25'], true);
    big.explosion(new Vector3(), WEAPONS['105'], true);
    expect(big.particleCount).toBeGreaterThan(small.particleCount * 5);
  });

  it('leaves a crater only on ground hits, and craters cool 0.8 → 0.2 over 30 s', () => {
    const fx = new Effects(flat, createRng(2));
    fx.explosion(new Vector3(0, 8, 0), WEAPONS['40'], false); // roof hit
    expect(fx.activeCraters).toBe(0);
    fx.explosion(new Vector3(), WEAPONS['40'], true);
    expect(fx.activeCraters).toBe(1);
    fx.update(DT);
    expect(fx.craterHeat(0)).toBeCloseTo(CRATER_COOLING.from, 1);
    step(fx, 31);
    expect(fx.craterHeat(0)).toBeCloseTo(CRATER_COOLING.to);
  });

  it('caps craters at the budget, recycling the oldest', () => {
    const fx = new Effects(flat, createRng(3));
    for (let i = 0; i < CONFIG.fx.maxCraters + 10; i++) {
      fx.explosion(new Vector3(i * 3, 0, 0), WEAPONS['25'], true);
    }
    expect(fx.activeCraters).toBe(CONFIG.fx.maxCraters);
  });

  it('clears particles once they have lived out (smoke lasts up to 15 s)', () => {
    const fx = new Effects(flat, createRng(4));
    fx.explosion(new Vector3(), WEAPONS['105'], true);
    step(fx, 16);
    expect(fx.particleCount).toBe(0);
  });

  it('stays within the particle budget under sustained 25 mm fire', () => {
    const fx = new Effects(flat, createRng(5));
    for (let i = 0; i < 400; i++) {
      fx.explosion(new Vector3(i, 0, 0), WEAPONS['25'], true);
      fx.update(0.1);
    }
    expect(fx.particleCount).toBeLessThanOrEqual(CONFIG.fx.hotParticles + CONFIG.fx.smokeParticles);
  });
});
