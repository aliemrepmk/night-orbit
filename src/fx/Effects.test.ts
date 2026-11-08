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

  it('does not draw tracers right next to the sensor (regression: huge white blobs)', () => {
    const fx = new Effects(flat, createRng(6));
    const eye = new Vector3(0, 700, 0);
    const dir = new Vector3(1, -1, 0).normalize();
    const near = eye.clone().addScaledVector(dir, 20);
    const far = eye.clone().addScaledVector(dir, 800);
    fx.sync(1000, 5, eye, (emit) => emit(near, dir));
    expect(fx.tracerSprites).toBe(0);
    fx.sync(1000, 5, eye, (emit) => emit(far, dir));
    expect(fx.tracerSprites).toBe(6);
  });

  it('draws a muzzle flash as one short-lived hot sprite', () => {
    const fx = new Effects(flat, createRng(7));
    fx.muzzleFlash(new Vector3(10, 1, 10));
    expect(fx.particleCount).toBe(1);
    step(fx, 0.2);
    expect(fx.particleCount).toBe(0);
  });

  it('draws ground-fire tracers with their own (short) streak, all six segments', () => {
    const fx = new Effects(flat, createRng(8));
    const eye = new Vector3(0, 700, 900);
    fx.sync(1000, 28, eye, (emit) => emit(new Vector3(), new Vector3(1, 0, 0), 5, 0.5));
    expect(fx.tracerSprites).toBe(6);
  });
});

describe('Effects.clear (M8 restart)', () => {
  it('removes every particle, crater and shockwave, and recycles from slot 0 again', () => {
    const fx = new Effects(flat, createRng(9));
    for (let i = 0; i < 5; i++) fx.explosion(new Vector3(i * 30, 0, 0), WEAPONS['105'], true);
    expect(fx.particleCount).toBeGreaterThan(0);
    expect(fx.activeCraters).toBe(5);
    fx.clear();
    expect(fx.particleCount).toBe(0);
    expect(fx.activeCraters).toBe(0);
    fx.explosion(new Vector3(), WEAPONS['40'], true);
    expect(fx.activeCraters).toBe(1);
    fx.update(DT);
    expect(fx.craterHeat(0)).toBeCloseTo(CRATER_COOLING.from, 1);
  });
});
