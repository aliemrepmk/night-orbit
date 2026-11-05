import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Path, turnAngle } from './Paths';

// 100 m north, then 50 m east (a right-angle corner at (0, -100)).
const L = new Path([
  { x: 0, z: 0 },
  { x: 0, z: -100 },
  { x: 50, z: -100 },
]);

describe('Path', () => {
  it('measures its length and rejects single points', () => {
    expect(L.length).toBeCloseTo(150);
    expect(() => new Path([{ x: 0, z: 0 }])).toThrow();
  });

  it('interpolates points by distance and clamps to the ends', () => {
    const p = new Vector3();
    expect(L.pointAt(50, p)).toMatchObject({ x: 0, z: -50 });
    expect(L.pointAt(125, p)).toMatchObject({ x: 25, z: -100 });
    expect(L.pointAt(-10, p)).toMatchObject({ x: 0, z: 0 });
    expect(L.pointAt(999, p)).toMatchObject({ x: 50, z: -100 });
  });

  it('gives the heading of the current segment', () => {
    expect(Math.abs(L.headingAt(10))).toBeCloseTo(Math.PI); // north = −z
    expect(L.headingAt(120)).toBeCloseTo(Math.PI / 2); // east = +x
  });

  it('following it at constant speed reaches the end in length / speed seconds', () => {
    const speed = 10;
    let s = 0;
    let t = 0;
    const p = new Vector3();
    while (s < L.length && t < 100) {
      s += speed * (1 / 60);
      t += 1 / 60;
    }
    L.pointAt(s, p);
    expect(t).toBeCloseTo(L.length / speed, 1);
    expect(p.x).toBeCloseTo(50);
    expect(p.z).toBeCloseTo(-100);
  });

  it('slows down near corners in proportion to how sharp they are', () => {
    expect(L.cornerFactor(20, 15)).toBe(1); // straight, far from the corner
    const atCorner = L.cornerFactor(100, 15);
    expect(atCorner).toBeLessThan(0.5);
    expect(L.cornerFactor(93, 15)).toBeGreaterThan(atCorner); // easing back in
    const gentle = new Path([
      { x: 0, z: 0 },
      { x: 0, z: -100 },
      { x: 10, z: -200 },
    ]);
    expect(gentle.cornerFactor(100, 15)).toBeGreaterThan(atCorner);
  });

  it('measures signed turn angles', () => {
    expect(turnAngle({ x: 0, z: 0 }, { x: 0, z: -1 }, { x: 1, z: -1 })).toBeCloseTo(-Math.PI / 2);
    expect(turnAngle({ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 })).toBeCloseTo(0);
  });
});
