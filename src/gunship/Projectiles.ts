import { Vector3 } from 'three';
import type { WeaponId } from './weaponDefs';

/** One shell in flight. Pooled: never allocated after startup. */
export interface Shell {
  active: boolean;
  weapon: WeaponId;
  readonly from: Vector3;
  readonly to: Vector3;
  /** Seconds since firing, and the total flight time. */
  t: number;
  duration: number;
  /** What the shell will hit (from the raycast at fire time). */
  hitKind: 'ground' | 'building';
  hitBox: number;
}

/** Floating-point slack so a 1.0 s flight lands on tick 60, not 61. */
const EPS = 1e-9;

/**
 * Shells in flight (PLAN.md §7.6). Each tick advances every shell; a shell whose flight time
 * has elapsed is handed to `onImpact` on exactly that tick and returned to the pool.
 */
export class Projectiles {
  private readonly pool: Shell[];
  /** Ring index for recycling the oldest shell when the pool is full. */
  private next = 0;

  constructor(capacity = 128) {
    this.pool = Array.from({ length: capacity }, () => ({
      active: false,
      weapon: '25' as WeaponId,
      from: new Vector3(),
      to: new Vector3(),
      t: 0,
      duration: 0,
      hitKind: 'ground' as const,
      hitBox: -1,
    }));
  }

  fire(
    weapon: WeaponId,
    from: Vector3,
    to: Vector3,
    duration: number,
    hitKind: 'ground' | 'building' = 'ground',
    hitBox = -1,
  ): Shell {
    // Prefer a free slot; if every slot is busy, recycle the oldest (never happens in play).
    let s = this.pool.find((p) => !p.active);
    if (!s) {
      s = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
    }
    s.active = true;
    s.weapon = weapon;
    s.from.copy(from);
    s.to.copy(to);
    s.t = 0;
    s.duration = duration;
    s.hitKind = hitKind;
    s.hitBox = hitBox;
    return s;
  }

  update(dt: number, onImpact: (s: Shell) => void): void {
    for (const s of this.pool) {
      if (!s.active) continue;
      s.t += dt;
      if (s.t >= s.duration - EPS) {
        s.active = false;
        onImpact(s);
      }
    }
  }

  /** Current position of a shell along its path (straight line; good enough for tracers). */
  positionOf(s: Shell, out = new Vector3()): Vector3 {
    const k = s.duration > 0 ? Math.min(1, s.t / s.duration) : 1;
    return out.lerpVectors(s.from, s.to, k);
  }

  forEachActive(fn: (s: Shell) => void): void {
    for (const s of this.pool) if (s.active) fn(s);
  }

  get activeCount(): number {
    let n = 0;
    for (const s of this.pool) if (s.active) n++;
    return n;
  }
}
