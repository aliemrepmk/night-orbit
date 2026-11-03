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
