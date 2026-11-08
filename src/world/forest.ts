import { range, type Rng } from '../core/rng';
import type { ForestDef, MapData, Vec2 } from './mapTypes';
import { buildingRect, distanceToPolyline, inRect } from './validateMap';

/** True if (x, z) is inside the polygon (even-odd rule). */
export function inPolygon(poly: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** True if (x, z) is under the trees of `f` (inside its polygon, outside its clearings). */
export function underForest(f: ForestDef, x: number, z: number): boolean {
  if (!inPolygon(f.polygon, x, z)) return false;
  return !f.clearings.some((c) => Math.hypot(x - c.center[0], z - c.center[1]) < c.radius);
}

/** True if (x, z) is under any forest of the map. */
export function inForest(map: MapData, x: number, z: number): boolean {
  return map.forests.some((f) => underForest(f, x, z));
}

/**
 * Tree positions for a forest (M8+ Phase D): a jittered grid `spacing` meters apart inside the
 * polygon, leaving the clearings, roads (with a verge), the stream and buildings open.
 * Deterministic for a given rng.
 */
export function forestTrees(map: MapData, f: ForestDef, rng: Rng): Vec2[] {
  const xs = f.polygon.map((p) => p[0]);
  const zs = f.polygon.map((p) => p[1]);
  const blocked = map.buildings.map((b) => buildingRect(b, 4));
  const out: Vec2[] = [];
  const s = f.spacing;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += s) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += s) {
      const tx = x + range(rng, -0.4, 0.4) * s;
      const tz = z + range(rng, -0.4, 0.4) * s;
      if (!underForest(f, tx, tz)) continue;
      if (map.roads.some((r) => distanceToPolyline(r.points, tx, tz) < r.width / 2 + 3)) continue;
      if (distanceToPolyline(map.stream.points, tx, tz) < map.stream.width / 2 + 2) continue;
      if (blocked.some((r) => inRect(r, tx, tz))) continue;
      out.push([tx, tz]);
    }
  }
  return out;
}
