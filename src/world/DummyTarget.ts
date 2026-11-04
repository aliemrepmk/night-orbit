import { Vector3 } from 'three';
import { ARMOR, type Armor, type DamageSource } from '../combat/Damage';
import type { Target } from '../combat/Explosions';
import { HEAT, wreckHeat } from '../fx/Heat';

export type DummyState = 'alive' | 'down';

/** How the dummies circle: center, radius, speed (m/s) and starting phase. */
export interface Circuit {
  readonly cx: number;
  readonly cz: number;
  readonly r: number;
  readonly speed: number;
  readonly phase: number;
}

/**
 * TEMPORARY truck target (M5 replaces it with real vehicles; M4 replaced its soldier mode with
 * `units/Infantry`): drives a circle, takes blast damage, smokes below half health, then burns
 * and cools as a wreck. Pure logic: `PlaceholderWorld` draws it.
 */
export class DummyTarget implements Target {
  readonly kind = 'vehicle' as const;
  readonly side = 'enemy' as const;
  readonly position = new Vector3();
  readonly armor: Armor = ARMOR.truck;
  /** PLAN.md §7.10 cargo truck. */
  readonly maxHp = 300;
  hp = this.maxHp;
  state: DummyState = 'alive';
  /** Seconds since death (drives burning / cooling). */
  sinceDeath = 0;
  /** Heading in radians (local +z faces the direction of travel). */
  heading = 0;
  private time = 0;

  constructor(
    private readonly circuit: Circuit,
    private readonly groundAt: (x: number, z: number) => number,
    /** Height of the body's center above the ground. */
    readonly lift: number,
    readonly seed = 0,
  ) {
    this.place(0);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Below half health a vehicle smokes (PLAN.md §7.10 damage states). */
  get smoking(): boolean {
    return this.alive && this.hp < this.maxHp / 2;
  }

  get burning(): boolean {
    return !this.alive && this.sinceDeath < 40;
  }

  /** Current heat: warm while alive, then the burning / wreck cooling curve. */
  get heat(): number {
    return this.alive ? HEAT.vehicleBody : wreckHeat(this.sinceDeath, this.seed);
  }

  takeDamage(amount: number, _source: DamageSource, _from: Vector3): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp > 0) return;
    this.hp = 0;
    this.sinceDeath = 0;
    this.state = 'down';
  }

  update(dt: number): void {
    this.time += dt;
    if (this.alive) this.place(this.time);
    else this.sinceDeath += dt;
  }

  private place(time: number): void {
    const c = this.circuit;
    const a = c.phase + (time * c.speed) / c.r;
    const x = c.cx + Math.cos(a) * c.r;
    const z = c.cz + Math.sin(a) * c.r;
    this.position.set(x, this.groundAt(x, z) + this.lift, z);
    this.heading = -a;
  }
}
