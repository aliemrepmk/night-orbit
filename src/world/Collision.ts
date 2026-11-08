import { Vector3 } from 'three';
import type { HeightSource } from '../gunship/Sensor';

/** A building's collision box: center, half extents, and rotation about +y (radians). */
export interface CollisionBox {
  readonly center: Vector3;
  readonly half: Vector3;
  readonly rotY: number;
  /** Something people walk on (a bridge deck): shells hit it, but it doesn't block walking or sight. */
  readonly walkable?: boolean;
}

export interface RayHit {
  readonly point: Vector3;
  readonly distance: number;
  readonly kind: 'ground' | 'building';
  /** Index into `Collision.boxes` when `kind === 'building'`. */
  readonly box: number;
}

/** Side of a cell in the box grid (m), and the margin boxes are filed with (covers `pushOut` radii). */
const CELL = 32;
const CELL_PAD = 2;
/** Cell coordinates are offset so negative ones pack into one positive key. */
const CELL_OFFSET = 1 << 12;

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
  /**
   * Boxes filed by ground cell (M7: the village grew to ~145 houses, and every soldier's sight
   * and wall checks used to loop over every box). A box sits in each cell its footprint circle
   * (+ `CELL_PAD`) touches; `stamp` keeps a box from being tested twice in one query.
   */
  private readonly cells = new Map<number, number[]>();
  private readonly stamp: number[] = [];
  private query = 0;

  /** `maxGroundHeight` bounds the terrain so the march can skip empty air. */
  constructor(
    private readonly ground: HeightSource,
    private readonly maxGroundHeight: number,
  ) {}

  addBox(box: CollisionBox): number {
    const i = this.boxes.push(box) - 1;
    this.stamp.push(0);
    const r = Math.hypot(box.half.x, box.half.z) + CELL_PAD;
    const x0 = Math.floor((box.center.x - r) / CELL);
    const x1 = Math.floor((box.center.x + r) / CELL);
    const z0 = Math.floor((box.center.z - r) / CELL);
    const z1 = Math.floor((box.center.z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = cellKey(cx, cz);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(i);
      }
    }
    return i;
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
    const q = ++this.query;
    // Walk the grid cells the segment crosses (2D DDA), testing each box once.
    let cx = Math.floor(from.x / CELL);
    let cz = Math.floor(from.z / CELL);
    const ex = Math.floor(to.x / CELL);
    const ez = Math.floor(to.z / CELL);
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tx = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL : cx * CELL) - from.x) / dx : Infinity;
    let tz = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL : cz * CELL) - from.z) / dz : Infinity;
    for (;;) {
      const list = this.cells.get(cellKey(cx, cz));
      if (list) {
        for (const i of list) {
          if (this.stamp[i] === q) continue;
          this.stamp[i] = q;
          const box = this.boxes[i];
          if (box.walkable) continue;
          const reach = Math.hypot(box.half.x, box.half.z);
          if (segmentPointDistance2D(from, to, box.center.x, box.center.z) > reach) continue;
          const t = rayBox(from, this.losDir, box);
          if (t !== null && t < len) return false;
        }
      }
      if (cx === ex && cz === ez) return true;
      if (tx < tz) {
        if (tx > 1) return true;
        cx += sx;
        tx += tdx;
      } else {
        if (tz > 1) return true;
        cz += sz;
        tz += tdz;
      }
    }
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
    // A small body only meets the boxes filed in its own cell (they carry a `CELL_PAD` margin).
    const list =
      radius <= CELL_PAD
        ? (this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NONE)
        : null;
    const n = list ? list.length : this.boxes.length;
    for (let k = 0; k < n; k++) {
      const box = this.boxes[list ? list[k] : k];
      if (box.walkable) continue;
      // Raised things (a gas-station canopy) don't block walking underneath.
      const bottom = box.center.y - box.half.y;
      if (bottom > this.ground.heightAt(box.center.x, box.center.z) + 2) continue;
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

const NONE: readonly number[] = [];

function cellKey(cx: number, cz: number): number {
  return (cx + CELL_OFFSET) * (2 * CELL_OFFSET) + (cz + CELL_OFFSET);
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
