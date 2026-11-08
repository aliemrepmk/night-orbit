import type { Vector3 } from 'three';
import { range, type Rng } from '../core/rng';
import { STRIKE_ORDER, STRIKES, type StrikeDef } from './airSupportDefs';
import type { Ordnance, StrikeId } from './weaponDefs';

/** One impact waiting to land. */
interface PendingImpact {
  t: number;
  x: number;
  z: number;
  ordnance: Ordnance;
  /** When its falling whistle starts (Infinity = none), and whether it has started. */
  whistleAt: number;
  whistled: boolean;
}

/** An aircraft crossing the area: over (x, z) at time `t0`, flying along `heading`. */
export interface JetPass {
  readonly strike: StrikeDef;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly t0: number;
}

/** Seconds a jet is drawn before and after it passes over its target. */
const JET_LEAD = 5;
const JET_TAIL = 4;

/**
 * Air support (PLAN.md §7.19): pick a strike with `T`, aim with the sensor, call it on the ground
 * point. Each strike lands after its delay and can be called again once its cooldown is over
 * (no per-mission limit). Pure: impacts are handed to a callback (Game → `Explosions`).
 */
export class AirSupport {
  /** The strike being aimed (footprint preview), or null when the guns are in control. */
  mode: StrikeId | null = null;
  /** Gun-run direction of travel (forward = (sin a, cos a)), rotated with the wheel. */
  axis = 0;
  time = 0;
  readonly jets: JetPass[] = [];
  private readonly pending: PendingImpact[] = [];
  private readonly readyAt: Record<StrikeId, number> = { gunrun: 0, bomb: 0 };

  constructor(
    private readonly rng: Rng,
    private readonly defs: Readonly<Record<StrikeId, StrikeDef>> = STRIKES,
  ) {}

  /** `T`: off → GUN RUN → BOMB → off. */
  cycleMode(): StrikeId | null {
    const i = this.mode === null ? -1 : STRIKE_ORDER.indexOf(this.mode);
    this.mode = i + 1 < STRIKE_ORDER.length ? STRIKE_ORDER[i + 1] : null;
    return this.mode;
  }

  rotateAxis(radians: number): void {
    this.axis = Math.atan2(Math.sin(this.axis + radians), Math.cos(this.axis + radians));
  }

  cooldownLeft(id: StrikeId): number {
    return Math.max(0, this.readyAt[id] - this.time);
  }

  ready(id: StrikeId): boolean {
    return this.cooldownLeft(id) === 0;
  }

  /** Strikes on their way: callsign and seconds until the first impact. */
  inbound(): { strike: StrikeDef; eta: number }[] {
    const out: { strike: StrikeDef; eta: number }[] = [];
    for (const j of this.jets) {
      const eta = j.t0 - j.strike.passOffset - this.time;
      if (eta > 0) out.push({ strike: j.strike, eta });
    }
    return out;
  }

  /**
   * Calls the selected strike on ground point (x, z). Returns the strike, or null if nothing is
   * selected or it is still cooling down. Leaves aiming mode only when the strike is called.
   */
  call(x: number, z: number): StrikeDef | null {
    if (this.mode === null || !this.ready(this.mode)) return null;
    const def = this.defs[this.mode];
    const start = this.time + def.delay;
    const fx = Math.sin(this.axis);
    const fz = Math.cos(this.axis);
    // Gun-run hits walk along the strip in the jet's direction; a bomb is a single impact.
    for (let k = 0; k < def.impacts; k++) {
      const u = def.impacts > 1 ? k / (def.impacts - 1) : 0.5;
      const along = (u - 0.5) * def.stripLength;
      const side =
        def.stripWidth > 0 ? range(this.rng, -def.stripWidth / 2, def.stripWidth / 2) : 0;
      this.pending.push({
        t: start + u * def.walkTime,
        x: x + fx * along - fz * side,
        z: z + fz * along + fx * side,
        ordnance: def.ordnance,
        whistleAt:
          def.whistleSeconds > 0 ? start + u * def.walkTime - def.whistleSeconds : Infinity,
        whistled: false,
      });
    }
    this.pending.sort((a, b) => a.t - b.t);
    this.jets.push({ strike: def, x, z, heading: this.axis, t0: start + def.passOffset });
    this.readyAt[def.id] = this.time + def.cooldown;
    this.mode = null;
    return def;
  }

  /**
   * The selected strike is aborted before it gets there (too much AA, M8+ Phase E): it goes
   * back on its cooldown, nothing lands. Returns the strike, or null if none was selected/ready.
   */
  abort(): StrikeDef | null {
    if (this.mode === null || !this.ready(this.mode)) return null;
    const def = this.defs[this.mode];
    this.readyAt[def.id] = this.time + def.cooldown;
    this.mode = null;
    return def;
  }

  /**
   * Advances time and lands every impact that is due, in order. `whistle` is called once per
   * falling bomb when its whistle should start, with the seconds until it lands.
   */
  update(
    dt: number,
    land: (x: number, z: number, ordnance: Ordnance) => void,
    whistle?: (x: number, z: number, secondsToImpact: number) => void,
  ): void {
    this.time += dt;
    for (const p of this.pending) {
      if (p.whistled || this.time < p.whistleAt) continue;
      p.whistled = true;
      whistle?.(p.x, p.z, Math.max(0, p.t - this.time));
    }
    let n = 0;
    while (n < this.pending.length && this.pending[n].t <= this.time) {
      const p = this.pending[n++];
      land(p.x, p.z, p.ordnance);
    }
    if (n > 0) this.pending.splice(0, n);
    for (let i = this.jets.length - 1; i >= 0; i--) {
      if (this.time > this.jets[i].t0 + JET_TAIL) this.jets.splice(i, 1);
    }
  }

  /**
   * Jet `j`'s nose pitch now (radians, positive = nose down): it dives in at 15 m/s and pulls up
   * at 40 m/s after passing the target, as in `jetPosition` (M8+ Phase E, for the jet model).
   */
  jetPitch(j: JetPass): number {
    const dt = this.time - j.t0;
    return dt > 0 ? -Math.atan2(40, j.strike.jetSpeed) : Math.atan2(15, j.strike.jetSpeed);
  }

  /** Where jet `j` is now (null while it is still far away or long gone). */
  jetPosition(j: JetPass, groundY: number, out: Vector3): Vector3 | null {
    const dt = this.time - j.t0;
    if (dt < -JET_LEAD || dt > JET_TAIL) return null;
    const d = dt * j.strike.jetSpeed;
    // Diving in, pulling up afterwards.
    const climb = dt > 0 ? dt * 40 : -dt * 15;
    return out.set(
      j.x + Math.sin(j.heading) * d,
      groundY + j.strike.jetAltitude + climb,
      j.z + Math.cos(j.heading) * d,
    );
  }
}

/**
 * Outline of a strike's footprint on the ground (for the preview): the gun-run strip's four
 * corners, or the bomb's blast circle.
 */
export function footprint(
  def: StrikeDef,
  x: number,
  z: number,
  axis: number,
  segments = 32,
): { x: number; z: number }[] {
  const fx = Math.sin(axis);
  const fz = Math.cos(axis);
  if (def.stripLength > 0) {
    const l = def.stripLength / 2;
    const w = def.stripWidth / 2;
    return [
      [-l, -w],
      [l, -w],
      [l, w],
      [-l, w],
    ].map(([a, s]) => ({ x: x + fx * a - fz * s, z: z + fz * a + fx * s }));
  }
  const r = def.ordnance.blastRadius;
  const out: { x: number; z: number }[] = [];
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
  }
  return out;
}

/**
 * Ground distance from (px, pz) to a strike's footprint: to the gun-run strip (0 inside it),
 * or to the bomb's aim point. Under the strike's `dangerClose` → the preview warns.
 */
export function footprintDistance(
  def: StrikeDef,
  x: number,
  z: number,
  axis: number,
  px: number,
  pz: number,
): number {
  const dx = px - x;
  const dz = pz - z;
  if (def.stripLength <= 0) return Math.hypot(dx, dz);
  const fx = Math.sin(axis);
  const fz = Math.cos(axis);
  const along = Math.abs(dx * fx + dz * fz) - def.stripLength / 2;
  const side = Math.abs(-dx * fz + dz * fx) - def.stripWidth / 2;
  return Math.hypot(Math.max(0, along), Math.max(0, side));
}
