import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { forestTrees, inForest, inPolygon, underForest } from './forest';
import { MAP } from './MapData';
import { distanceToPolyline } from './validateMap';

const pine = MAP.forests.find((f) => f.id === 'black_pine')!;

describe('forest (M8+ Phase D: Black Pine Forest)', () => {
  it('inPolygon follows the even-odd rule', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    expect(inPolygon(square, 5, 5)).toBe(true);
    expect(inPolygon(square, 15, 5)).toBe(false);
    expect(inPolygon(square, -1, -1)).toBe(false);
  });

  it('the sawmill clearing is open; the woods around it are forest', () => {
    const [cx, cz] = pine.clearings[0].center;
    expect(underForest(pine, cx, cz)).toBe(false);
    expect(inForest(MAP, cx, cz - 150)).toBe(true);
    expect(inForest(MAP, MAP.zones.village.center[0], MAP.zones.village.center[1])).toBe(false);
  });

  it('fills the forest with a dense, deterministic stand of trees', () => {
    const a = forestTrees(MAP, pine, createRng(9));
    const b = forestTrees(MAP, pine, createRng(9));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1200);
    expect(a.length).toBeLessThan(4000); // PLAN §11 budget
  });

  it('keeps trees out of the clearing, off the roads and out of buildings', () => {
    const trees = forestTrees(MAP, pine, createRng(1));
    const clearing = pine.clearings[0];
    for (const [x, z] of trees) {
      expect(Math.hypot(x - clearing.center[0], z - clearing.center[1])).toBeGreaterThanOrEqual(
        clearing.radius,
      );
      for (const r of MAP.roads) {
        expect(distanceToPolyline(r.points, x, z)).toBeGreaterThanOrEqual(r.width / 2 + 3);
      }
    }
    const lodge = MAP.buildings.find((b) => b.id === 'lodge')!;
    expect(trees.every(([x, z]) => Math.hypot(x - lodge.pos[0], z - lodge.pos[1]) > 4)).toBe(true);
  });

  it('the route to LZ SAWMILL runs up the forest track, ending in the clearing', () => {
    const route = MAP.friendlyRoutes.route_lz_sawmill;
    const end = route[route.length - 1];
    expect(underForest(pine, end[0], end[1])).toBe(false);
    expect(
      Math.hypot(end[0] - pine.clearings[0].center[0], end[1] - pine.clearings[0].center[1]),
    ).toBeLessThan(pine.clearings[0].radius);
    // Part of it is under the trees (the forest walk).
    expect(route.some(([x, z]) => inForest(MAP, x, z))).toBe(true);
  });
});
