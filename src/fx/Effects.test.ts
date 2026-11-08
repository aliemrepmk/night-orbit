import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createRng } from '../core/rng';
import { ORDNANCE } from '../gunship/airSupportDefs';
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

describe('bomb dust (M8+ play test: "make the fog bigger for the bomb")', () => {
  it('throws far more smoke than the 105 mm, including a low cloud that rolls outward', () => {
    const big = new Effects(flat, createRng(5));
    const gun = new Effects(flat, createRng(5));
    big.explosion(new Vector3(), ORDNANCE.bomb, true);
    gun.explosion(new Vector3(), WEAPONS['105'], true);
    const alive = (fx: Effects) => {
      let n = 0;
      for (let i = 0; i < fx.smoke.capacity; i++) if (fx.smoke.isAlive(i)) n++;
      return n;
    };
    expect(alive(big)).toBeGreaterThan(alive(gun) * 4);
    step(big, 3);
    // After 3 s some smoke has rolled out well past the 40 m blast while staying low.
    let far = 0;
    for (let i = 0; i < big.smoke.capacity; i++) {
      if (!big.smoke.isAlive(i)) continue;
      const x = big.smoke.pos[i * 3];
      const y = big.smoke.pos[i * 3 + 1];
      const z = big.smoke.pos[i * 3 + 2];
      if (Math.hypot(x, z) > 20 && y < 8) far++;
    }
    expect(far).toBeGreaterThan(15);
  });
});

describe('bomb crater (M8+ play test: "make the crater it left bigger")', () => {
  it('is several times the 105 mm crater', () => {
    expect(ORDNANCE.bomb.fx.craterRadius).toBeGreaterThanOrEqual(
      WEAPONS['105'].fx.craterRadius * 3,
    );
  });

  it('sits on the ground across its whole size on a slope and in a dip (never sinks in)', () => {
    for (const ground of [
      (x: number) => x * 0.15, // a 15 % slope
      (x: number, z: number) => 0.004 * (x * x + z * z), // a bowl
    ]) {
      const fx = new Effects(ground, createRng(6));
      fx.explosion(new Vector3(0, ground(0, 0), 0), ORDNANCE.bomb, true);
      const m = new Matrix4();
      fx.craterMatrix(0, m);
      // Every rim point of the disc is at or above the ground under it.
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const p = new Vector3(Math.cos(a), 0, Math.sin(a)).applyMatrix4(m);
        expect(p.y, `k=${k}`).toBeGreaterThanOrEqual(ground(p.x, p.z) - 0.05);
      }
    }
  });
});
