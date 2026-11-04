import { Vector3 } from 'three';
import { CONFIG } from '../config';
import { ARMOR, type DamageSource } from '../combat/Damage';
import type { Side, Target } from '../combat/Explosions';
import { BODY_COOLING, HEAT, coolingHeat } from '../fx/Heat';
import type { InfantryDef } from './unitDefs';

/**
 * - `moving` / `idle`: alive, walking or standing (the manager steers via `velocity`)
 * - `firing`: alive, standing and shooting at `target`
 * - `flung`: just killed, flying away from the blast (~0.6 s arc), then `dead`
 * - `dead`: lying flat, cooling
 */
export type InfantryState = 'idle' | 'moving' | 'firing' | 'flung' | 'dead';

const GRAVITY = 9.8;

export type InfantryConfig = { readonly [K in keyof typeof CONFIG.infantry]: number };

/**
 * One soldier of either side (PLAN.md §7.8): position, health, heat and the death reaction.
 * Pure logic: `UnitManager` decides where it goes, `InfantryRenderer` draws it.
 * Instances are recycled (`spawn`) so long fights don't allocate.
 */
export class Infantry implements Target {
  readonly kind = 'infantry' as const;
  readonly armor = ARMOR.none;
  readonly position = new Vector3();
  /** Ground velocity while alive (set by steering); fling velocity while flung. */
  readonly velocity = new Vector3();
  hp = 0;
  state: InfantryState = 'dead';
  /** Facing in radians: the body's local +z points along (sin h, cos h). */
  heading = 0;
  /** Seconds since death (drives cooling); Infinity for slots never used. */
  sinceDeath = Infinity;
  /** Spin while flung (radians). */
  tumble = 0;
  /** Walk cycle phase (radians), advanced by distance walked. */
  walkPhase = 0;
  /** Seconds until the next AI decision / visible burst / friendly shot. */
  thinkTimer = 0;
  fireTimer = 0;
  /** Fraction of its range at which this soldier stops to fire (varies per soldier). */
  standoff = 0.8;
  /** Who it is shooting at while `firing`. */
  target: Infantry | null = null;
  /** True for one tick after a player weapon kills it (lets the manager tell kills apart). */
  killedBy: DamageSource | null = null;

  constructor(
    readonly id: number,
    readonly side: Side,
    public def: InfantryDef,
    private readonly groundAt: (x: number, z: number) => number,
    private readonly cfg: InfantryConfig = CONFIG.infantry,
  ) {}

  /** (Re)starts this soldier alive at (x, z). */
  spawn(def: InfantryDef, x: number, z: number, heading = 0): void {
    this.def = def;
    this.hp = def.hp;
    this.state = 'idle';
    this.heading = heading;
    this.sinceDeath = Infinity;
    this.tumble = 0;
    this.walkPhase = 0;
    this.target = null;
    this.killedBy = null;
    this.velocity.set(0, 0, 0);
    this.position.set(x, this.groundAt(x, z) + this.cfg.lift, z);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Warm while alive; bodies cool 0.95 → 0.35 over 60 s (PLAN.md §7.5). */
  get heat(): number {
    return this.alive ? HEAT.soldier : coolingHeat(BODY_COOLING, this.sinceDeath);
  }

  takeDamage(amount: number, source: DamageSource, from: Vector3): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp > 0) return;
    this.hp = 0;
    this.sinceDeath = 0;
    this.killedBy = source;
    this.target = null;
    // Thrown away from the blast with a little lift; closer = harder (PLAN.md §7.7).
    let ax = this.position.x - from.x;
    let az = this.position.z - from.z;
    const d = Math.max(0.5, Math.hypot(ax, az));
    ax /= d;
    az /= d;
    const speed = Math.min(this.cfg.flingMaxSpeed, 30 / d);
    this.velocity.set(ax * speed, 3 + speed * 0.4, az * speed);
    this.state = 'flung';
  }

  /** Integrates motion: walking on the ground while alive, the fling arc, then lying still. */
  update(dt: number): void {
    const c = this.cfg;
    if (this.alive) {
      const vx = this.velocity.x;
      const vz = this.velocity.z;
      const speed = Math.hypot(vx, vz);
      this.position.x += vx * dt;
      this.position.z += vz * dt;
      this.position.y = this.groundAt(this.position.x, this.position.z) + c.lift;
      if (speed > 0.2) {
        this.turnToward(Math.atan2(vx, vz), dt);
        this.walkPhase += speed * dt * c.stridesPerMeter * Math.PI * 2;
      }
      if (this.state !== 'firing') this.state = speed > 0.2 ? 'moving' : 'idle';
      return;
    }

    this.sinceDeath += dt;
    if (this.state === 'flung') {
      this.velocity.y -= GRAVITY * dt;
      this.position.addScaledVector(this.velocity, dt);
      this.tumble += dt * 9;
      const ground = this.groundAt(this.position.x, this.position.z) + c.downLift;
      if (this.position.y <= ground || this.sinceDeath >= c.flingTime * 2) {
        this.position.y = ground;
        this.velocity.set(0, 0, 0);
        this.state = 'dead';
      }
    }
  }

  /** Turns the body toward `heading` at the configured turn rate (shortest way around). */
  turnToward(heading: number, dt: number): void {
    let diff = heading - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const max = this.cfg.turnRate * dt;
    this.heading += Math.max(-max, Math.min(max, diff));
  }
}
