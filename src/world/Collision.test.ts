import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Collision, rayBox } from './Collision';
import { Terrain } from './Terrain';

const flat = { heightAt: () => 0 };
const down = (x = 0, z = 0) => new Vector3(x, -1, z).normalize();

describe('Collision.raycast', () => {
  it('hits flat ground exactly where the ray meets it', () => {
    const c = new Collision(flat, 0);
    const hit = c.raycast(new Vector3(0, 700, 0), down(1, 0))!;
    expect(hit.kind).toBe('ground');
    expect(hit.point.y).toBeCloseTo(0, 3);
    expect(hit.point.x).toBeCloseTo(700, 2); // 45° down
  });

  it('hits a roof before the ground behind it', () => {
    const c = new Collision(flat, 0);
    c.addBox({ center: new Vector3(0, 4, 0), half: new Vector3(5, 4, 5), rotY: 0 });
    const hit = c.raycast(new Vector3(0, 700, 0), down())!;
    expect(hit.kind).toBe('building');
    expect(hit.box).toBe(0);
    expect(hit.point.y).toBeCloseTo(8, 6); // top of the box
  });

  it('misses a building that is off the line and hits the ground instead', () => {
    const c = new Collision(flat, 0);
    c.addBox({ center: new Vector3(50, 4, 0), half: new Vector3(5, 4, 5), rotY: 0 });
    expect(c.raycast(new Vector3(0, 700, 0), down())!.kind).toBe('ground');
  });

  it('respects building rotation', () => {
    // A long thin box along x, rotated 90° so it lies along z.
    const box = { center: new Vector3(0, 4, 0), half: new Vector3(20, 4, 1), rotY: Math.PI / 2 };
    expect(rayBox(new Vector3(0, 100, 15), down(), box)).not.toBeNull();
    expect(rayBox(new Vector3(15, 100, 0), down(), box)).toBeNull();
  });

  it('returns null for rays that point up or never reach the ground', () => {
    const c = new Collision(flat, 0);
    expect(c.raycast(new Vector3(0, 700, 0), new Vector3(0, 1, 0))).toBeNull();
    expect(
      c.raycast(new Vector3(0, 700, 0), new Vector3(1, -0.01, 0).normalize(), 2000),
    ).toBeNull();
  });

  it('lands on the real hilly terrain surface (within a few cm)', () => {
    const terrain = new Terrain();
    const c = new Collision(terrain, 40);
    const origin = new Vector3(-900, 700, 0);
    const hit = c.raycast(origin, new Vector3(900, -700, 0).normalize())!;
    expect(hit.kind).toBe('ground');
    expect(hit.point.y).toBeCloseTo(terrain.heightAt(hit.point.x, hit.point.z), 1);
  });
});

describe('Collision.lineOfSight', () => {
  const eye = (x: number, z: number, y = 1.5) => new Vector3(x, y, z);

  it('is clear across open flat ground', () => {
    const c = new Collision(flat, 0);
    expect(c.lineOfSight(eye(0, 0), eye(200, 50))).toBe(true);
  });

  it('is blocked by a house between the two soldiers, not by one beside the line', () => {
    const c = new Collision(flat, 0);
    c.addBox({ center: new Vector3(50, 3, 0), half: new Vector3(5, 3, 4), rotY: 0.4 });
    expect(c.lineOfSight(eye(0, 0), eye(100, 0))).toBe(false);
    expect(c.lineOfSight(eye(0, 20), eye(100, 20))).toBe(true);
    // Over the roof: a high shooter sees past it.
    expect(c.lineOfSight(eye(0, 0, 30), eye(100, 0, 30))).toBe(true);
  });

  it('is blocked by a hill in between', () => {
    const hill = { heightAt: (x: number) => (Math.abs(x - 100) < 20 ? 10 : 0) };
    const c = new Collision(hill, 10);
    expect(c.lineOfSight(eye(0, 0), eye(200, 0))).toBe(false);
    expect(c.lineOfSight(eye(0, 0), eye(60, 0))).toBe(true);
  });
});

describe('Collision.pushOut', () => {
  it('moves a body inside a building out through the nearest wall', () => {
    const c = new Collision(flat, 0);
    c.addBox({ center: new Vector3(0, 3, 0), half: new Vector3(5, 3, 4), rotY: 0 });
    const out = { x: 0, z: 0 };
    expect(c.pushOut(4, 0.5, 0.5, out)).toBe(true);
    expect(out.x).toBeCloseTo(5.5); // nearest wall is +x
    expect(out.z).toBeCloseTo(0.5);
    expect(c.pushOut(10, 0, 0.5, out)).toBe(false);
    expect(out).toEqual({ x: 10, z: 0 });
  });

  it('works for rotated buildings (the result is outside the footprint)', () => {
    const c = new Collision(flat, 0);
    const box = { center: new Vector3(20, 3, -10), half: new Vector3(6, 3, 2), rotY: 1.1 };
    c.addBox(box);
    const out = { x: 0, z: 0 };
    for (let k = 0; k < 20; k++) {
      const x = 20 + Math.cos(k) * 3;
      const z = -10 + Math.sin(k * 1.7) * 3;
      c.pushOut(x, z, 0.4, out);
      // A vertical ray at the result misses the box.
      expect(rayBox(new Vector3(out.x, 50, out.z), down(), box)).toBeNull();
    }
  });
});

describe('Collision special boxes', () => {
  it('a walkable deck stops shells but not walking or sight', () => {
    const c = new Collision(flat, 0);
    c.addBox({
      center: new Vector3(0, 0.5, 0),
      half: new Vector3(3, 0.5, 8),
      rotY: 0,
      walkable: true,
    });
    const out = { x: 0, z: 0 };
    expect(c.pushOut(0, 0, 0.5, out)).toBe(false);
    expect(c.lineOfSight(new Vector3(0, 0.2, -20), new Vector3(0, 0.2, 20))).toBe(true);
    expect(c.raycast(new Vector3(0, 700, 0), down())!.kind).toBe('building');
  });

  it('a raised canopy does not push people out from under it', () => {
    const c = new Collision(flat, 0);
    c.addBox({ center: new Vector3(0, 4.7, 0), half: new Vector3(7, 0.3, 5), rotY: 0 });
    const out = { x: 0, z: 0 };
    expect(c.pushOut(1, 1, 0.5, out)).toBe(false);
  });
});

describe('Collision box grid (M7: the bigger village)', () => {
  // The answers from looping over every box, to compare the grid against.
  function bruteLos(c: Collision, a: Vector3, b: Vector3): boolean {
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    return !c.boxes.some((box) => {
      const t = rayBox(a, dir, box);
      return t !== null && t < len;
    });
  }

  function scatter() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const c = new Collision(flat, 0);
    for (let i = 0; i < 150; i++) {
      c.addBox({
        center: new Vector3(rnd() * 600 - 300, 4, rnd() * 600 - 300),
        half: new Vector3(2 + rnd() * 6, 4, 2 + rnd() * 6),
        rotY: rnd() * Math.PI,
      });
    }
    return { c, rnd };
  }

  it('line of sight agrees with testing every box, for segments in every direction', () => {
    const { c, rnd } = scatter();
    let blocked = 0;
    for (let k = 0; k < 2000; k++) {
      const a = new Vector3(rnd() * 700 - 350, 1 + rnd() * 3, rnd() * 700 - 350);
      const b = new Vector3(rnd() * 700 - 350, 1 + rnd() * 3, rnd() * 700 - 350);
      if (k % 4 === 0) b.x = a.x; // straight north-south
      if (k % 4 === 1) b.z = a.z; // straight east-west
      const want = bruteLos(c, a, b);
      expect(c.lineOfSight(a, b)).toBe(want);
      if (!want) blocked++;
    }
    expect(blocked).toBeGreaterThan(200); // the test really covers blocked lines too
  });

  it('pushOut finds the same walls as before (bodies near cell edges included)', () => {
    const { c, rnd } = scatter();
    for (let k = 0; k < 3000; k++) {
      const x = rnd() * 640 - 320;
      const z = rnd() * 640 - 320;
      const fast = { x: 0, z: 0 };
      const slow = { x: 0, z: 0 };
      const moved = c.pushOut(x, z, 0.6, fast);
      let m = false;
      slow.x = x;
      slow.z = z;
      for (const box of c.boxes) {
        const cs = Math.cos(box.rotY);
        const sn = Math.sin(box.rotY);
        const ox = slow.x - box.center.x;
        const oz = slow.z - box.center.z;
        let lx = cs * ox - sn * oz;
        let lz = sn * ox + cs * oz;
        const hx = box.half.x + 0.6;
        const hz = box.half.z + 0.6;
        if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
        if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = (lx < 0 ? -1 : 1) * hx;
        else lz = (lz < 0 ? -1 : 1) * hz;
        slow.x = box.center.x + cs * lx + sn * lz;
        slow.z = box.center.z - sn * lx + cs * lz;
        m = true;
      }
      expect(moved).toBe(m);
      expect(fast.x).toBeCloseTo(slow.x, 9);
      expect(fast.z).toBeCloseTo(slow.z, 9);
    }
  });
});
