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
  private readonly losDir = new Vector3();

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

  /**
   * True if nothing blocks the straight line from `from` to `to`: no building box and no hill
   * (terrain sampled every `terrainStep` meters). Used for enemy and friendly line of sight.
   */
  lineOfSight(from: Vector3, to: Vector3, terrainStep = 10): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const steps = Math.floor(len / terrainStep);
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      if (from.y + dy * t < this.ground.heightAt(from.x + dx * t, from.z + dz * t)) return false;
    }
    this.losDir.set(dx / len, dy / len, dz / len);
    for (const box of this.boxes) {
      const reach = Math.hypot(box.half.x, box.half.z);
      if (segmentPointDistance2D(from, to, box.center.x, box.center.z) > reach) continue;
      const t = rayBox(from, this.losDir, box);
      if (t !== null && t < len) return false;
    }
    return true;
  }

  /**
   * Keeps a body of `radius` out of every building footprint: if (x, z) is inside one (grown by
   * `radius`), moves it out through the nearest wall. Writes the result to `out`; returns true
   * if it had to move.
   */
  pushOut(x: number, z: number, radius: number, out: { x: number; z: number }): boolean {
    out.x = x;
    out.z = z;
    let moved = false;
    for (const box of this.boxes) {
      const reach = Math.hypot(box.half.x, box.half.z) + radius;
      const ox = out.x - box.center.x;
      const oz = out.z - box.center.z;
      if (ox * ox + oz * oz > reach * reach) continue;
      const c = Math.cos(box.rotY);
      const s = Math.sin(box.rotY);
      let lx = c * ox - s * oz;
      let lz = s * ox + c * oz;
      const hx = box.half.x + radius;
      const hz = box.half.z + radius;
      if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
      if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = (lx < 0 ? -1 : 1) * hx;
      else lz = (lz < 0 ? -1 : 1) * hz;
      out.x = box.center.x + c * lx + s * lz;
      out.z = box.center.z - s * lx + c * lz;
      moved = true;
    }
    return moved;
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

/** Ground (x/z) distance from point (px, pz) to the segment a–b. */
export function segmentPointDistance2D(a: Vector3, b: Vector3, px: number, pz: number): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / len2)) : 0;
  return Math.hypot(a.x + vx * t - px, a.z + vz * t - pz);
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
