import { Vector3 } from 'three';
import type { HeightSource } from '../gunship/Sensor';

/** A building's collision box: center, half extents, and rotation about +y (radians). */
export interface CollisionBox {
  readonly center: Vector3;
  readonly half: Vector3;
  readonly rotY: number;
}

export interface RayHit {
  readonly point: Vector3;
  readonly distance: number;
  readonly kind: 'ground' | 'building';
  /** Index into `Collision.boxes` when `kind === 'building'`. */
  readonly box: number;
}

/** March step along the ray when searching for the terrain surface (meters). */
const GROUND_STEP = 4;
const BISECT_ITERATIONS = 24;

/**
 * Raycasts against the terrain and building boxes (PLAN.md §5 `Collision.ts`). Used to find
 * where a shell lands: whatever the sensor's center ray touches first, so roofs are hit before
 * the ground behind them.
 */
export class Collision {
  readonly boxes: CollisionBox[] = [];

  /** `maxGroundHeight` bounds the terrain so the march can skip empty air. */
  constructor(
    private readonly ground: HeightSource,
    private readonly maxGroundHeight: number,
  ) {}

  addBox(box: CollisionBox): number {
    this.boxes.push(box);
    return this.boxes.length - 1;
  }

  /** First hit along the ray from `origin` in direction `dir` (normalized), or null. */
  raycast(origin: Vector3, dir: Vector3, maxDistance = 8000): RayHit | null {
    let best: RayHit | null = null;
    const g = this.raycastGround(origin, dir, maxDistance);
    if (g !== null) best = { point: at(origin, dir, g), distance: g, kind: 'ground', box: -1 };

    for (let i = 0; i < this.boxes.length; i++) {
      const t = rayBox(origin, dir, this.boxes[i]);
      if (t !== null && t <= maxDistance && (best === null || t < best.distance)) {
        best = { point: at(origin, dir, t), distance: t, kind: 'building', box: i };
      }
    }
    return best;
  }

  /** Distance along the ray to the terrain surface, or null if it never reaches the ground. */
  private raycastGround(origin: Vector3, dir: Vector3, maxDistance: number): number | null {
    const below = (t: number) =>
      origin.y + dir.y * t <= this.ground.heightAt(origin.x + dir.x * t, origin.z + dir.z * t);

    // Start where the ray first drops below the highest possible terrain.
    let t0 = 0;
    if (origin.y > this.maxGroundHeight) {
      if (dir.y >= 0) return null;
      t0 = (origin.y - this.maxGroundHeight) / -dir.y;
    }
    if (t0 > maxDistance) return null;
    if (below(t0)) return t0;

    for (let t1 = t0 + GROUND_STEP; t0 < maxDistance; t0 = t1, t1 += GROUND_STEP) {
      if (below(t1)) {
        // Bisect between the last point above ground and the first below it.
        let lo = t0;
        let hi = t1;
        for (let k = 0; k < BISECT_ITERATIONS; k++) {
          const mid = (lo + hi) / 2;
          if (below(mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
    }
    return null;
  }
}

function at(origin: Vector3, dir: Vector3, t: number): Vector3 {
  return new Vector3().copy(dir).multiplyScalar(t).add(origin);
}

/** Ray vs. y-rotated box (slab test in the box's local frame). Returns entry distance or null. */
export function rayBox(origin: Vector3, dir: Vector3, box: CollisionBox): number | null {
  const c = Math.cos(-box.rotY);
  const s = Math.sin(-box.rotY);
  // Rotate the ray into box space (rotation about y by -rotY).
  const ox = origin.x - box.center.x;
  const oy = origin.y - box.center.y;
  const oz = origin.z - box.center.z;
  const o = [c * ox + s * oz, oy, -s * ox + c * oz];
  const d = [c * dir.x + s * dir.z, dir.y, -s * dir.x + c * dir.z];
  const h = [box.half.x, box.half.y, box.half.z];

  let tMin = -Infinity;
  let tMax = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < -h[a] || o[a] > h[a]) return null;
      continue;
    }
    let t1 = (-h[a] - o[a]) / d[a];
    let t2 = (h[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null;
  return Math.max(0, tMin);
}
