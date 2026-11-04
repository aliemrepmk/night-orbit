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
 * steer toward their slots in `UnitManager`. Walks the route back and forth (test scene;
 * M7 drives it with `moveTeam` instead).
 */
export class Squad {
  readonly anchor = new Vector3();
  /** Facing in radians: forward is (sin h, cos h). */
  heading = 0;
  holdLeft = 0;
  /** Index of the waypoint being walked to. */
  private next = 1;
  private dir = 1;

  constructor(
    readonly route: readonly RoutePoint[],
    private readonly cfg: SquadConfig = CONFIG.ridgeback,
  ) {
    if (route.length < 2) throw new Error('A squad route needs at least two points');
    this.anchor.set(route[0].x, 0, route[0].z);
    this.heading = Math.atan2(route[1].x - route[0].x, route[1].z - route[0].z);
  }

  /** True while walking between waypoints (false while holding at one). */
  get moving(): boolean {
    return this.holdLeft <= 0;
  }

  /** The waypoint the squad is heading to (or holding before). */
  get nextPoint(): RoutePoint {
    return this.route[this.next];
  }

  update(dt: number): void {
    if (this.holdLeft > 0) {
      this.holdLeft = Math.max(0, this.holdLeft - dt);
      return;
    }
    const target = this.route[this.next];
    const dx = target.x - this.anchor.x;
    const dz = target.z - this.anchor.z;
    const dist = Math.hypot(dx, dz);
    const stepLen = this.cfg.speed * dt;
    if (dist > 1e-6) this.heading = Math.atan2(dx, dz);
    if (dist <= stepLen) {
      this.anchor.x = target.x;
      this.anchor.z = target.z;
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
