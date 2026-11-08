import { Vector3 } from 'three';
import { CONFIG } from '../config';

export interface RoutePoint {
  readonly x: number;
  readonly z: number;
}

export interface SquadConfig {
  readonly speed: number;
  readonly holdTime: number;
  readonly spacing: number;
}

/**
 * Diamond formation, as (right, back) multiples of the spacing: leader in front, two flankers,
 * one at the rear. Slot 0 is the leader's own spot.
 */
const FORMATION: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 1],
  [1, 1],
  [0, 2],
];

/**
 * Where Ridgeback is going (PLAN.md §7.9): a squad anchor walks a route at a steady pace,
 * holds at every waypoint, and gives each member a formation slot around it. Pure: members
 * steer toward their slots in `UnitManager`. The mission (M7) drives it with `walk` (one route,
 * once, then hold at its end) and `halt`; a squad built with `loop` walks its route back and forth.
 */
export class Squad {
  /** Walking-speed factor (a wounded operator slows the team, M8+ Phase F). */
  speedScale = 1;
  readonly anchor = new Vector3();
  /** Facing in radians: forward is (sin h, cos h). */
  heading = 0;
  holdLeft = 0;
  /** Index of the waypoint being walked to. */
  private next = 1;
  private dir = 1;
  /** Holding in place (after `halt`, or at the end of a one-way route) until the next `walk`. */
  private stopped = false;
  private route: readonly RoutePoint[];

  constructor(
    route: readonly RoutePoint[],
    private readonly cfg: SquadConfig = CONFIG.ridgeback,
    /** Walk the route back and forth forever (tests); otherwise walk it once and stop. */
    private loop = true,
  ) {
    if (route.length < 2) throw new Error('A squad route needs at least two points');
    this.route = route;
    this.anchor.set(route[0].x, 0, route[0].z);
    this.heading = Math.atan2(route[1].x - route[0].x, route[1].z - route[0].z);
  }

  /** True while walking between waypoints (false while holding at one, or stopped). */
  get moving(): boolean {
    return !this.stopped && this.holdLeft <= 0;
  }

  /** Stopped at the end of a one-way route (or by `halt`). */
  get arrived(): boolean {
    return this.stopped;
  }

  /**
   * Walks `route` once, from wherever the squad is now (it heads for the route's first point
   * that is ahead of it), and stops at its last point. Ends any back-and-forth looping.
   */
  walk(route: readonly RoutePoint[]): void {
    if (route.length === 0) return;
    this.loop = false;
    this.stopped = false;
    this.holdLeft = 0;
    this.route = route;
    // Skip points the squad is already standing on (a route usually starts where the last ended).
    let i = 0;
    while (
      i < route.length - 1 &&
      Math.hypot(route[i].x - this.anchor.x, route[i].z - this.anchor.z) < 1
    )
      i++;
    this.next = i;
    this.dir = 1;
  }

  /** Stops where it stands and holds (the team fights back while holding). */
  halt(): void {
    this.stopped = true;
    this.holdLeft = 0;
  }

  /** Puts the squad at (x, z), stopped (phase skips, `?phase=`). */
  placeAt(x: number, z: number): void {
    this.anchor.set(x, 0, z);
    this.halt();
  }

  /** The waypoint the squad is heading to (or holding before). */
  get nextPoint(): RoutePoint {
    return this.route[this.next];
  }

  update(dt: number): void {
    if (this.stopped) return;
    if (this.holdLeft > 0) {
      this.holdLeft = Math.max(0, this.holdLeft - dt);
      return;
    }
    const target = this.route[this.next];
    const dx = target.x - this.anchor.x;
    const dz = target.z - this.anchor.z;
    const dist = Math.hypot(dx, dz);
    const stepLen = this.cfg.speed * this.speedScale * dt;
    if (dist > 1e-6) this.heading = Math.atan2(dx, dz);
    if (dist <= stepLen) {
      this.anchor.x = target.x;
      this.anchor.z = target.z;
      if (!this.loop) {
        // One-way: walk straight through waypoints; stop at the last one.
        if (this.next >= this.route.length - 1) this.stopped = true;
        else this.next++;
        return;
      }
      this.holdLeft = this.cfg.holdTime;
      this.advance();
      return;
    }
    this.anchor.x += (dx / dist) * stepLen;
    this.anchor.z += (dz / dist) * stepLen;
  }

  /** World position of formation slot `i` (wraps for more members than slots). */
  slot(i: number, out: Vector3): Vector3 {
    const [right, back] = FORMATION[i % FORMATION.length];
    const s = this.cfg.spacing;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // Right of forward (sin h, cos h) when looking down with −z north, +x east.
    const rx = -fz;
    const rz = fx;
    return out.set(
      this.anchor.x + (rx * right - fx * back) * s,
      0,
      this.anchor.z + (rz * right - fz * back) * s,
    );
  }

  /** Ping-pong along the route. */
  private advance(): void {
    if (this.next + this.dir >= this.route.length || this.next + this.dir < 0) this.dir *= -1;
    this.next += this.dir;
  }
}

/** True while an IR strobe is lit: `hz` blinks per second, lit for `duty` of each blink. */
export function strobeOn(time: number, hz: number, duty: number, phase = 0): boolean {
  const t = time * hz + phase;
  return t - Math.floor(t) < duty;
}
