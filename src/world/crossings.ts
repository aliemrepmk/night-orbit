import type { BridgeDef, StreamDef, Vec2 } from './mapTypes';

/** How far beyond the deck's ends a walker aims before/after crossing (m). */
const APPROACH = 6;
/** Within this distance of a bridge end, it counts as reached (go for the other end). */
const REACHED = 4;

interface Span {
  /** The two ends of the crossing, beyond the deck. */
  readonly a: Vec2;
  readonly b: Vec2;
  readonly mid: Vec2;
}

/** Does segment p1→p2 cross segment q1→q2? */
function segmentsCross(
  p1x: number,
  p1z: number,
  p2x: number,
  p2z: number,
  q1x: number,
  q1z: number,
  q2x: number,
  q2z: number,
): boolean {
  const d = (p2x - p1x) * (q2z - q1z) - (p2z - p1z) * (q2x - q1x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((q1x - p1x) * (q2z - q1z) - (q1z - p1z) * (q2x - q1x)) / d;
  const u = ((q1x - p1x) * (p2z - p1z) - (q1z - p1z) * (p2x - p1x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Keeps people on foot from wading the stream (PLAN.md §7.11, no navmesh): if the straight line
 * to where they are going crosses the stream, they head for the nearest bridge first, walk to its
 * near end, then to its far end; from there the straight line is clear.
 */
export class StreamCrossings {
  private readonly spans: Span[];

  constructor(
    private readonly stream: StreamDef,
    bridges: readonly BridgeDef[],
  ) {
    this.spans = bridges.map((b) => {
      const fx = Math.sin(b.heading);
      const fz = Math.cos(b.heading);
      const r = b.length / 2 + APPROACH;
      return {
        a: [b.at[0] - fx * r, b.at[1] - fz * r],
        b: [b.at[0] + fx * r, b.at[1] + fz * r],
        mid: b.at,
      };
    });
  }

  /** True if the straight walk from (fx, fz) to (tx, tz) would cross the stream. */
  crosses(fx: number, fz: number, tx: number, tz: number): boolean {
    const p = this.stream.points;
    for (let i = 1; i < p.length; i++) {
      if (segmentsCross(fx, fz, tx, tz, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1])) return true;
    }
    return false;
  }

  /**
   * Where to walk instead of straight to (tx, tz): the near end of the best bridge, then its far
   * end. Writes it to `out` and returns true; false when the straight walk is fine.
   */
  detour(fx: number, fz: number, tx: number, tz: number, out: { x: number; z: number }): boolean {
    if (this.spans.length === 0 || !this.crosses(fx, fz, tx, tz)) return false;
    // The bridge that makes the shortest trip.
    let best = this.spans[0];
    let bestLen = Infinity;
    for (const s of this.spans) {
      const len =
        Math.hypot(s.mid[0] - fx, s.mid[1] - fz) + Math.hypot(tx - s.mid[0], tz - s.mid[1]);
      if (len < bestLen) {
        bestLen = len;
        best = s;
      }
    }
    const da = Math.hypot(best.a[0] - fx, best.a[1] - fz);
    const db = Math.hypot(best.b[0] - fx, best.b[1] - fz);
    // Head for the nearer end; once there (or on the deck), for the other one.
    let [x, z] = da <= db ? best.a : best.b;
    const near = Math.min(da, db);
    if (near < REACHED || this.onDeckSide(fx, fz, best, da <= db))
      [x, z] = da <= db ? best.b : best.a;
    out.x = x;
    out.z = z;
    return true;
  }

  /** Already past the near end, walking along the deck toward the middle. */
  private onDeckSide(fx: number, fz: number, s: Span, nearA: boolean): boolean {
    const [nx, nz] = nearA ? s.a : s.b;
    const [ox, oz] = nearA ? s.b : s.a;
    const len = Math.hypot(ox - nx, oz - nz);
    const t = ((fx - nx) * (ox - nx) + (fz - nz) * (oz - nz)) / (len * len);
    const side = Math.abs((fx - nx) * (oz - nz) - (fz - nz) * (ox - nx)) / len;
    return t > 0 && t < 1 && side < 6;
  }
}
