import { Vector3 } from 'three';
import type { Path } from '../ai/Paths';
import type { Armor, DamageSource } from '../combat/Damage';
import type { Target } from '../combat/Explosions';
import { CONFIG } from '../config';
import { FIRE, HEAT, wreckHeat } from '../fx/Heat';
import type { Infantry } from './Infantry';
import type { VehicleDef } from './vehicleDefs';

/**
 * - `driving`: following its road path
 * - `unloading`: stopped, soldiers climbing out one by one (trucks)
 * - `stopped`: at its spot (or stuck behind a wreck), gun firing if it has one
 * - `parked`: an empty truck left at the roadside
 * - `destroyed`: a burning, then cooling wreck that still blocks the road
 * - `unused`: a pooled slot nobody has spawned yet
 */
export type VehicleState = 'driving' | 'unloading' | 'stopped' | 'parked' | 'destroyed' | 'unused';

export type VehicleConfig = { readonly [K in keyof typeof CONFIG.vehicles]: number };

/**
 * One enemy vehicle (PLAN.md §7.10): drives a road at constant speed with slowdown at corners
 * and smooth turning, takes damage through its armor, smokes below half health and burns as a
 * wreck. Pure logic: `VehicleManager` decides when it stops, unloads and fires;
 * `VehicleRenderer` draws it. Instances are recycled (`spawn`).
 */
export class Vehicle implements Target {
  readonly kind = 'vehicle' as const;
  /** Civilian vehicles (the bus) are protected; everything else is the enemy's. */
  get side(): 'enemy' | 'civilian' {
    return this.def.civilian ? 'civilian' : 'enemy';
  }
  readonly position = new Vector3();
  def: VehicleDef;
  state: VehicleState = 'unused';
  hp = 0;
  /** Facing (forward = (sin h, cos h)), current speed (m/s) and distance along its path. */
  heading = 0;
  speed = 0;
  s = 0;
  path: Path | null = null;
  /** Set by the mission script to find its vehicles again (`vehiclesDestroyed(tag)`); '' = none. */
  tag = '';
  /** Reached the end of its path. */
  arrived = false;
  /** Seconds it has been held up by something ahead. */
  blockedFor = 0;
  /**
   * Sideways offset from the road's centerline (m, toward (cos h, −sin h)) and where it steers
   * it: vehicles swerve around a wreck or a stopped vehicle (M7 play test: wrecks used to plug
   * the road, so the vehicles behind never reached Ridgeback). `passing` is what it is going
   * around.
   */
  lateral = 0;
  lateralTarget = 0;
  passing: Vehicle | null = null;
  /** Soldiers still inside, and seconds until the next one climbs out. */
  cargo = 0;
  unloadTimer = 0;
  /** Mounted gun: who it shoots at, and timers for the next aim check and visible burst. */
  target: Infantry | null = null;
  thinkTimer = 0;
  fireTimer = 0;
  /** Seconds since destruction (fire, then cooling); Infinity while alive. */
  sinceDeath = Infinity;
  killedBy: DamageSource | null = null;
  /** The manager has handled the destruction (bail-outs, kill credit). */
  deathHandled = false;

  constructor(
    def: VehicleDef,
    private readonly groundAt: (x: number, z: number) => number,
    /** De-syncs fire flicker between wrecks. */
    readonly seed: number,
    private readonly cfg: VehicleConfig = CONFIG.vehicles,
  ) {
    this.def = def;
  }

  /** (Re)starts this vehicle at distance `s` along `path`, carrying `cargo` soldiers. */
  spawn(def: VehicleDef, path: Path, s = 0, cargo = 0): void {
    this.def = def;
    this.tag = '';
    this.path = path;
    this.s = Math.min(s, path.length);
    this.hp = def.hp;
    this.state = 'driving';
    this.speed = 0;
    this.arrived = false;
    this.blockedFor = 0;
    this.lateral = 0;
    this.lateralTarget = 0;
    this.passing = null;
    this.cargo = cargo;
    this.unloadTimer = 0;
    this.target = null;
    this.thinkTimer = 0;
    this.fireTimer = 0;
    this.sinceDeath = Infinity;
    this.killedBy = null;
    this.deathHandled = false;
    this.heading = path.headingAt(this.s);
    this.place();
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get inUse(): boolean {
    return this.state !== 'unused';
  }

  get armor(): Armor {
    return this.def.armor;
  }

  /** Below half health a vehicle smokes (PLAN.md §7.10 damage states). */
  get smoking(): boolean {
    return this.alive && this.hp < this.def.hp / 2;
  }

  get burning(): boolean {
    return !this.alive && this.sinceDeath < FIRE.duration;
  }

  /** Body heat: warm while alive, then the burning / wreck cooling curve. */
  get heat(): number {
    return this.alive ? HEAT.vehicleBody : wreckHeat(this.sinceDeath, this.seed);
  }

  /** Forward direction along the road at its current spot (for "is something ahead?"). */
  get roadHeading(): number {
    return this.path ? this.path.headingAt(this.s) : this.heading;
  }

  takeDamage(amount: number, source: DamageSource, _from: Vector3): void {
    if (!this.alive || !this.inUse) return;
    this.hp -= amount;
    if (this.hp > 0) return;
    this.hp = 0;
    this.speed = 0;
    this.sinceDeath = 0;
    this.killedBy = source;
    this.state = 'destroyed';
  }

  /**
   * Drives along the path: toward cruising speed (slower near corners, at most `maxSpeed`),
   * braking to a stop when `blocked`; it slides toward `lateralTarget` while it goes, and the
   * body turns smoothly toward where it is heading (the road, plus the swerve).
   */
  drive(dt: number, blocked: boolean, maxSpeed = Infinity): void {
    const path = this.path;
    if (!path || this.state !== 'driving') return;
    const c = this.cfg;
    const cruise = this.def.speed * path.cornerFactor(this.s, c.cornerSlowRadius);
    const want = blocked ? 0 : Math.min(maxSpeed, cruise);
    if (this.speed < want) this.speed = Math.min(want, this.speed + c.accel * dt);
    else this.speed = Math.max(want, this.speed - c.brake * dt);
    this.s += this.speed * dt;
    if (this.s >= path.length) {
      this.s = path.length;
      this.speed = 0;
      this.arrived = true;
    }
    const dl = this.lateralTarget - this.lateral;
    const slide = Math.max(-c.swerveRate * dt, Math.min(c.swerveRate * dt, dl));
    this.lateral += slide;
    // Nose into the swerve: the side speed against the forward speed (never below a crawl).
    const yaw = dt > 0 ? Math.atan2(slide / dt, Math.max(this.speed, 3)) : 0;
    let diff = path.headingAt(this.s) + (Math.abs(dl) > 0.05 ? yaw : 0) - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const max = c.turnRate * dt;
    this.heading += Math.max(-max, Math.min(max, diff));
    this.place();
  }

  /** Time passes for wrecks (burning → cooling). */
  update(dt: number): void {
    if (this.state === 'destroyed') this.sinceDeath += dt;
  }

  private place(): void {
    if (!this.path) return;
    this.path.pointAt(this.s, this.position);
    if (this.lateral !== 0) {
      const h = this.path.headingAt(this.s);
      this.position.x += Math.cos(h) * this.lateral;
      this.position.z -= Math.sin(h) * this.lateral;
    }
    this.position.y = this.groundAt(this.position.x, this.position.z) + this.def.lift;
  }
}
