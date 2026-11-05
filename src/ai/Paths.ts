import type { Vector3 } from 'three';

export interface PathPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * A ground polyline (PLAN.md §7.11): roads for vehicles, approach routes for infantry.
 * Positions along it are addressed by distance `s` from the start (meters), clamped to the ends.
 */
export class Path {
  readonly points: readonly PathPoint[];
  /** Distance from the start to each point. */
  private readonly cum: Float64Array;

  constructor(points: readonly PathPoint[]) {
    if (points.length < 2) throw new Error('A path needs at least two points');
    this.points = points;
    this.cum = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.cum[i] = this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z);
    }
  }

  get length(): number {
    return this.cum[this.cum.length - 1];
  }

  get start(): PathPoint {
    return this.points[0];
  }

  get end(): PathPoint {
    return this.points[this.points.length - 1];
  }

  /** Index of the segment containing distance `s` (segment i runs from point i to i + 1). */
  segmentAt(s: number): number {
    const n = this.points.length;
    if (s <= 0) return 0;
    if (s >= this.length) return n - 2;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Ground point at distance `s` (y is left untouched). */
  pointAt(s: number, out: Vector3): Vector3 {
    const i = this.segmentAt(s);
    const a = this.points[i];
    const b = this.points[i + 1];
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen > 0 ? Math.min(1, Math.max(0, (s - this.cum[i]) / segLen)) : 0;
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
  }

  /** Direction of travel at `s` as a heading (forward = (sin h, cos h)). */
  headingAt(s: number): number {
    const i = this.segmentAt(s);
    const a = this.points[i];
    const b = this.points[i + 1];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  /**
   * Speed factor (0–1) for driving at `s` (PLAN.md §7.10): 1 on straights, lower within
   * `slowRadius` of a corner, depending on how sharp it is (a 90° turn halves the speed, a
   * hairpin drops it to `minFactor`).
   */
  cornerFactor(s: number, slowRadius: number, minFactor = 0.25): number {
    let factor = 1;
    for (let i = 1; i < this.points.length - 1; i++) {
      const d = Math.abs(s - this.cum[i]);
      if (d >= slowRadius) continue;
      const turn = Math.abs(turnAngle(this.points[i - 1], this.points[i], this.points[i + 1]));
      const atCorner = Math.max(minFactor, 1 - (turn / Math.PI) * (1 - minFactor) * 1.5);
      const blend = d / slowRadius; // 0 at the corner → 1 at the edge of the slow zone
      factor = Math.min(factor, atCorner + (1 - atCorner) * blend);
    }
    return factor;
  }
}

/** Signed turn at `b` going a → b → c (radians, −π..π). */
export function turnAngle(a: PathPoint, b: PathPoint, c: PathPoint): number {
  const h1 = Math.atan2(b.x - a.x, b.z - a.z);
  const h2 = Math.atan2(c.x - b.x, c.z - b.z);
  const d = h2 - h1;
  return Math.atan2(Math.sin(d), Math.cos(d));
}
