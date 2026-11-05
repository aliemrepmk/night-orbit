import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { rayBox } from '../world/Collision';
import { CoverSet, coverFromBoxes } from './CoverPoints';

describe('CoverSet', () => {
  it('lets only one soldier hold a point at a time', () => {
    const set = new CoverSet();
    const p = set.add(10, 0);
    expect(set.reserve(p, 1)).toBe(true);
    expect(set.reserve(p, 2)).toBe(false);
    expect(set.reserve(p, 1)).toBe(true); // re-claiming your own point is fine
    expect(set.ownerOf(p)).toBe(1);
  });

  it('frees a point only for the soldier that holds it', () => {
    const set = new CoverSet();
    const p = set.add(10, 0);
    set.reserve(p, 1);
    set.release(p, 2);
    expect(set.isFree(p)).toBe(false);
    set.release(p, 1);
    expect(set.isFree(p)).toBe(true);
    expect(set.reserve(p, 2)).toBe(true);
  });

  it('finds the nearest free point within the radius that passes the filter', () => {
    const set = new CoverSet();
    const near = set.add(5, 0);
    const mid = set.add(10, 0);
    const far = set.add(50, 0);
    expect(set.nearestFree(0, 0, 20)).toBe(near);
    set.reserve(near, 7);
    expect(set.nearestFree(0, 0, 20)).toBe(mid); // the nearest one is taken
    expect(set.nearestFree(0, 0, 20, (p) => p !== mid)).toBeNull(); // far is out of range
    expect(set.nearestFree(0, 0, 60, (p) => p !== mid)).toBe(far);
  });

  it('gives every soldier of a group its own point', () => {
    const set = new CoverSet();
    for (let k = 0; k < 4; k++) set.add(k * 3, 0);
    const taken = new Set<number>();
    for (let unit = 0; unit < 6; unit++) {
      const p = set.nearestFree(0, 0, 30);
      if (p && set.reserve(p, unit)) taken.add(p.id);
    }
    expect(taken.size).toBe(4);
    expect(set.nearestFree(0, 0, 30)).toBeNull();
  });
});

describe('coverFromBoxes', () => {
  it('puts one point just outside each corner of a rotated building', () => {
    const box = { center: new Vector3(100, 2, 50), half: new Vector3(5, 2, 3), rotY: 0.6 };
    const set = coverFromBoxes([box], 1.5);
    expect(set.points).toHaveLength(4);
    for (const p of set.points) {
      const d = Math.hypot(p.x - box.center.x, p.z - box.center.z);
      expect(d).toBeCloseTo(Math.hypot(6.5, 4.5));
      // Outside the walls: a vertical ray at the point misses the box.
      expect(rayBox(new Vector3(p.x, 50, p.z), new Vector3(0, -1, 0), box)).toBeNull();
    }
  });
});
