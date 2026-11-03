import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { flightTime, muzzlePosition, offsetAcrossView, sampleDisc } from './ballistics';
import { WEAPONS, WEAPON_ORDER } from './weaponDefs';

describe('flight time', () => {
  it('is distance / shell speed', () => {
    expect(flightTime(1200, 600)).toBe(2);
    expect(flightTime(0, 900)).toBe(0);
  });

  it('matches the plan at the typical 1,140 m slant range (~1.3 / 1.5 / 1.9 s)', () => {
    const t = WEAPON_ORDER.map((id) => flightTime(1140, WEAPONS[id].shellSpeed));
    expect(t[0]).toBeCloseTo(1.27, 1);
    expect(t[1]).toBeCloseTo(1.52, 1);
    expect(t[2]).toBeCloseTo(1.9, 1);
  });
});

describe('spread', () => {
  it('always stays within the weapon spread radius', () => {
    const rng = createRng(5);
    for (const id of WEAPON_ORDER) {
      const r = WEAPONS[id].spread;
      for (let i = 0; i < 2000; i++) {
        const [x, y] = sampleDisc(rng, r);
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(r + 1e-9);
      }
    }
  });

  it('is uniform by area (about a quarter of shots inside half the radius)', () => {
    const rng = createRng(9);
    let inner = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const [x, y] = sampleDisc(rng, 1);
      if (Math.hypot(x, y) < 0.5) inner++;
    }
    expect(inner / n).toBeCloseTo(0.25, 1);
  });

  it('offsets the aim point across the line of sight by exactly the requested distance', () => {
    const origin = new Vector3(-900, 700, 0);
    const target = new Vector3(0, 0, 0);
    const p = offsetAcrossView(origin, target, 3, 4);
    expect(p.distanceTo(target)).toBeCloseTo(5);
    const view = new Vector3().subVectors(target, origin).normalize();
    expect(new Vector3().subVectors(p, target).dot(view)).toBeCloseTo(0); // perpendicular
  });
});

describe('muzzle position', () => {
  it('sits below the aircraft and toward the orbit center (left side in a CCW orbit)', () => {
    const m = muzzlePosition(new Vector3(900, 700, 0), new Vector3(0, 0, 0), 6, 12);
    expect(m.y).toBeCloseTo(694);
    expect(m.x).toBeCloseTo(888);
    expect(m.z).toBeCloseTo(0);
  });
});
