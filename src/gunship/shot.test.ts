import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { RayHit } from '../world/Collision';
import { ShotPlanner, type Raycaster } from './shot';
import { WEAPONS } from './weaponDefs';

/** Flat ground at y = 0, with an optional roof (a building) at y = `roof` inside |x| < 10. */
function world(roof?: number): Raycaster {
  return {
    raycast(o: Vector3, d: Vector3): RayHit | null {
      if (roof !== undefined && d.y < 0) {
        const t = (roof - o.y) / d.y;
        const p = o.clone().addScaledVector(d, t);
        if (Math.abs(p.x) < 10 && Math.abs(p.z) < 10)
          return { point: p, distance: t, kind: 'building', box: 3 };
      }
      if (d.y >= 0) return null;
      const t = -o.y / d.y;
      return { point: o.clone().addScaledVector(d, t), distance: t, kind: 'ground', box: -1 };
    },
  };
}

const eye = new Vector3(0, 700, 900);
const center = new Vector3(0, 0, 0);
const aim = new Vector3(0, 0, 0);

describe('ShotPlanner (one shell, shared by the game and the gunner bot, M10)', () => {
  it('lands within the weapon spread of the aim point and flies distance / speed seconds', () => {
    const p = new ShotPlanner(world());
    const rng = createRng(1);
    for (const id of ['25', '40', '105'] as const) {
      for (let i = 0; i < 50; i++) {
        const s = p.plan(id, eye, center, aim, rng)!;
        expect(s.kind).toBe('ground');
        // Spread is measured across the view; on the ground it stretches along the look line.
        expect(Math.hypot(s.to.x, s.to.z)).toBeLessThan(WEAPONS[id].spread * 2);
        expect(s.duration).toBeCloseTo(s.from.distanceTo(s.to) / WEAPONS[id].shellSpeed, 6);
      }
    }
  });

  it('hits the roof first when a building is in the line of sight', () => {
    const s = new ShotPlanner(world(6)).plan('105', eye, center, aim, createRng(2))!;
    expect(s.kind).toBe('building');
    expect(s.box).toBe(3);
    expect(s.to.y).toBeCloseTo(6, 6);
  });

  it('fires nothing when the line of sight hits nothing (looking at the sky)', () => {
    const up = new Vector3(0, 2000, 0);
    expect(new ShotPlanner(world()).plan('40', eye, center, up, createRng(3))).toBeNull();
  });
});
