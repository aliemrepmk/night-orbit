import type { CollisionBox } from '../world/Collision';

export interface CoverPoint {
  readonly id: number;
  readonly x: number;
  readonly z: number;
}

const FREE = -1;

/**
 * Cover positions with a reservation system (PLAN.md §7.11): each point holds at most one
 * soldier, so a group spreads over the corners and walls around it instead of piling up.
 */
export class CoverSet {
  readonly points: CoverPoint[] = [];
  private owners: number[] = [];

  add(x: number, z: number): CoverPoint {
    const p = { id: this.points.length, x, z };
    this.points.push(p);
    this.owners.push(FREE);
    return p;
  }

  isFree(p: CoverPoint): boolean {
    return this.owners[p.id] === FREE;
  }

  /** The unit holding `p`, or -1. */
  ownerOf(p: CoverPoint): number {
    return this.owners[p.id];
  }

  /** Claims `p` for `unitId`; false if someone else already holds it. */
  reserve(p: CoverPoint, unitId: number): boolean {
    const owner = this.owners[p.id];
    if (owner !== FREE && owner !== unitId) return false;
    this.owners[p.id] = unitId;
    return true;
  }

  /** Frees `p` if `unitId` holds it (dead, fleeing or moving on). */
  release(p: CoverPoint, unitId: number): void {
    if (this.owners[p.id] === unitId) this.owners[p.id] = FREE;
  }

  /** Nearest free point within `radius` of (x, z) that `accept` approves, or null. */
  nearestFree(
    x: number,
    z: number,
    radius: number,
    accept: (p: CoverPoint) => boolean = () => true,
  ): CoverPoint | null {
    let best: CoverPoint | null = null;
    let bestD = radius * radius;
    for (const p of this.points) {
      if (this.owners[p.id] !== FREE) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d > bestD || !accept(p)) continue;
      bestD = d;
      best = p;
    }
    return best;
  }
}

/**
 * Cover at the corners of every building (until M6 hand-places cover per zone): a soldier
 * crouched just outside a corner is shielded on two sides and can still see around it.
 */
export function coverFromBoxes(
  boxes: readonly CollisionBox[],
  margin: number,
  set = new CoverSet(),
) {
  for (const b of boxes) {
    const c = Math.cos(b.rotY);
    const s = Math.sin(b.rotY);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = sx * (b.half.x + margin);
        const lz = sz * (b.half.z + margin);
        // Local → world for a rotation about +y by rotY (three.js convention).
        set.add(b.center.x + c * lx + s * lz, b.center.z - s * lx + c * lz);
      }
    }
  }
  return set;
}
