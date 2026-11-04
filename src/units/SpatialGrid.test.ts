import { describe, expect, it } from 'vitest';
import { createRng, range } from '../core/rng';
import { SpatialGrid } from './SpatialGrid';

interface P {
  id: number;
  position: { x: number; z: number };
}

function scatter(n: number, seed: number, extent = 400): P[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, id) => ({
    id,
    position: { x: range(rng, -extent, extent), z: range(rng, -extent, extent) },
  }));
}

const within = (p: P, x: number, z: number, r: number) =>
  (p.position.x - x) ** 2 + (p.position.z - z) ** 2 <= r * r;

describe('SpatialGrid', () => {
  it('radius queries match brute force (negative coords, cell edges, many radii)', () => {
    const items = scatter(500, 7);
    const grid = new SpatialGrid<P>(20);
    grid.rebuild(items);
    const rng = createRng(99);
    for (let q = 0; q < 200; q++) {
      const x = range(rng, -450, 450);
      const z = range(rng, -450, 450);
      const r = range(rng, 0.5, 90);
      const got = grid.queryRadius(x, z, r).map((p) => p.id);
      const want = items.filter((p) => within(p, x, z, r)).map((p) => p.id);
      expect(got.sort((a, b) => a - b)).toEqual(want.sort((a, b) => a - b));
    }
  });

  it('includes items exactly on a cell boundary and at the query radius', () => {
    const items: P[] = [
      { id: 0, position: { x: 0, z: 0 } },
      { id: 1, position: { x: 20, z: 0 } },
      { id: 2, position: { x: -20, z: -20 } },
    ];
    const grid = new SpatialGrid<P>(20);
    grid.rebuild(items);
    expect(grid.queryRadius(0, 0, 20).map((p) => p.id)).toEqual(expect.arrayContaining([0, 1]));
    expect(grid.queryRadius(-20, -20, 0.01).map((p) => p.id)).toEqual([2]);
  });

  it('forgets everything on rebuild (units that moved are only found at their new spot)', () => {
    const p: P = { id: 0, position: { x: 5, z: 5 } };
    const grid = new SpatialGrid<P>(20);
    grid.rebuild([p]);
    p.position.x = 300;
    grid.rebuild([p]);
    expect(grid.queryRadius(5, 5, 10)).toEqual([]);
    expect(grid.queryRadius(300, 5, 1)).toEqual([p]);
  });

  it('nearest() matches brute force, with a filter and a max radius', () => {
    const items = scatter(300, 3);
    const grid = new SpatialGrid<P>(20);
    grid.rebuild(items);
    const rng = createRng(5);
    for (let q = 0; q < 100; q++) {
      const x = range(rng, -400, 400);
      const z = range(rng, -400, 400);
      const maxR = range(rng, 10, 300);
      const even = (p: P) => p.id % 2 === 0;
      let want: P | null = null;
      let best = maxR * maxR;
      for (const p of items) {
        const d2 = (p.position.x - x) ** 2 + (p.position.z - z) ** 2;
        if (even(p) && d2 <= best) {
          best = d2;
          want = p;
        }
      }
      expect(grid.nearest(x, z, maxR, even)?.id ?? null).toBe(want?.id ?? null);
    }
  });
});
