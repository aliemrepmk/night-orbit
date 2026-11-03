import { Vector3 } from 'three';
import { ARMOR, type Armor } from '../combat/Damage';
import type { Target } from '../combat/Explosions';
import type { WeaponId } from '../gunship/weaponDefs';
import { BODY_COOLING, HEAT, coolingHeat, wreckHeat } from '../fx/Heat';

export type DummyState = 'alive' | 'flung' | 'down';

/** How the dummies circle: center, radius, speed (m/s) and starting phase. */
export interface Circuit {
  readonly cx: number;
  readonly cz: number;
  readonly r: number;
  readonly speed: number;
  readonly phase: number;
}

const GRAVITY = 9.8;
/** Seconds a killed soldier flies before lying flat (PLAN.md §7.7: ~0.6 s arc). */
const FLING_TIME = 0.6;

/**
 * TEMPORARY M3 target (M4 replaces it with real infantry/vehicles): walks/drives a circle,
 * takes blast damage, and dies in heat. Soldiers are flung away from the blast, then lie flat
 * and cool like bodies; trucks smoke below half health, then burn and cool as wrecks.
 * Pure logic: `PlaceholderWorld` draws it.
 */
export class DummyTarget implements Target {
  readonly position = new Vector3();
  readonly armor: Armor;
  readonly maxHp: number;
  hp: number;
  state: DummyState = 'alive';
  /** Seconds since death (drives cooling / burning). */
  sinceDeath = 0;
  /** Heading in radians (local +z faces the direction of travel). */
  heading = 0;
  /** Spin while flung (radians), for the death reaction. */
  tumble = 0;
  readonly velocity = new Vector3();
  private time = 0;

  constructor(
    readonly kind: 'infantry' | 'vehicle',
    private readonly circuit: Circuit,
    private readonly groundAt: (x: number, z: number) => number,
    /** Height of the body's center above the ground. */
    readonly lift: number,
    readonly seed = 0,
  ) {
    this.maxHp = kind === 'infantry' ? 100 : 300; // PLAN.md §9 rifleman / §7.10 cargo truck
    this.hp = this.maxHp;
    this.armor = kind === 'infantry' ? ARMOR.none : ARMOR.truck;
    this.place(0);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Below half health a vehicle smokes (PLAN.md §7.10 damage states). */
  get smoking(): boolean {
    return this.kind === 'vehicle' && this.alive && this.hp < this.maxHp / 2;
  }

  get burning(): boolean {
    return this.kind === 'vehicle' && !this.alive && this.sinceDeath < 40;
  }

  /** Current heat: warm while alive, then the body / wreck cooling curves. */
  get heat(): number {
    if (this.kind === 'infantry') {
      return this.alive ? HEAT.soldier : coolingHeat(BODY_COOLING, this.sinceDeath);
    }
    return this.alive ? HEAT.vehicleBody : wreckHeat(this.sinceDeath, this.seed);
  }

  takeDamage(amount: number, _weapon: WeaponId, from: Vector3): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp > 0) return;
    this.hp = 0;
    this.sinceDeath = 0;
    if (this.kind === 'infantry') {
      // Thrown away from the blast with a little lift, closer = harder.
      const away = new Vector3(this.position.x - from.x, 0, this.position.z - from.z);
      const d = Math.max(0.5, away.length());
      away.normalize();
      const speed = Math.min(14, 30 / d);
      this.velocity.set(away.x * speed, 3 + speed * 0.4, away.z * speed);
      this.state = 'flung';
    } else {
      this.state = 'down';
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.alive) {
      this.place(this.time);
      return;
    }
    this.sinceDeath += dt;
    if (this.state === 'flung') {
      this.velocity.y -= GRAVITY * dt;
      this.position.addScaledVector(this.velocity, dt);
      this.tumble += dt * 9;
      const ground = this.groundAt(this.position.x, this.position.z) + 0.3;
      if (this.position.y <= ground || this.sinceDeath >= FLING_TIME * 2) {
        this.position.y = ground;
        this.state = 'down';
      }
    }
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
