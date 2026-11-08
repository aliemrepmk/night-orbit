import { Vector3 } from 'three';
import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { range, type Rng } from '../core/rng';
import { ARMOR, type DamageSource } from './Damage';
import type { Target } from './Explosions';

export type AirDefenseConfig = typeof CONFIG.airDefense;

/** Where the gunship is: its position and the center of its orbit. */
export interface PlaneState {
  readonly position: Vector3;
  readonly center: Vector3;
}

/** Something that shoots at aircraft: an AA gun emplacement, or an AA truck (a vehicle). */
export interface AAShooter {
  readonly id: string;
  readonly position: Vector3;
  /** Firing now (activated and not destroyed). */
  readonly firing: boolean;
}

/**
 * A twin-barrel AA gun behind sandbags (M8+ Phase E). Dormant until the mission activates it;
 * a target for every blast (dormant or not), so it can be destroyed before it opens up.
 */
export class AAGun implements Target, AAShooter, ShooterState {
  readonly kind = 'vehicle' as const;
  readonly side = 'enemy' as const;
  readonly aa = true;
  readonly armor = ARMOR.aaGun;
  readonly position: Vector3;
  hp: number;
  active = false;
  /** Seconds since it last fired (barrel heat, recoil) and its continuous-firing time. */
  sinceShot = Infinity;
  /** Seconds since it was destroyed (it burns for a while). */
  deadFor = 0;
  tracking = 0;
  timer = 0;
  engaged = false;

  constructor(
    readonly id: string,
    x: number,
    y: number,
    z: number,
    hp: number,
  ) {
    this.position = new Vector3(x, y, z);
    this.hp = hp;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get firing(): boolean {
    return this.active && this.alive;
  }

  takeDamage(amount: number, _source: DamageSource, _from: Vector3): void {
    this.hp = Math.max(0, this.hp - amount);
  }
}

/** A heat-seeking missile climbing at the gunship. */
export interface Missile {
  readonly position: Vector3;
  readonly from: Vector3;
  age: number;
  decoyed: boolean;
  done: boolean;
}

/** A shooter's firing state: continuous tracking time, time to the next burst, engaged now. */
interface ShooterState {
  tracking: number;
  timer: number;
  engaged: boolean;
}

/** Hands visible fire to the game: AA tracers from a muzzle toward a point near the gunship. */
export type TracerSink = (from: Vector3, to: Vector3, count: number) => void;

/**
 * Enemy air defense (M8+ Phase E), pure: AA guns and trucks firing at the gunship (hits wear
 * down a hull that never repairs), MANPADS missiles (`launch`), flares that decoy them, and the
 * strike rule (AA near a target hits or turns back the jets). Events go on the bus; at 0 hull the
 * mission fails (`gunship_lost`).
 */
export class AirDefense {
  readonly guns: AAGun[] = [];
  readonly missiles: Missile[] = [];
  hull: number;
  flares: number;
  /** Extra shooters (AA trucks), asked for every tick. */
  trucks: () => Iterable<AAShooter> = () => [];
  private engineOut = false;
  private lost = false;
  private readonly truckState = new Map<string, ShooterState>();
  private readonly aim = new Vector3();
  private readonly dir = new Vector3();

  constructor(
    sites: readonly {
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }[],
    private readonly bus: EventBus<GameEvents>,
    private readonly rng: Rng,
    private readonly cfg: AirDefenseConfig = CONFIG.airDefense,
  ) {
    for (const s of sites) this.guns.push(new AAGun(s.id, s.x, s.y, s.z, cfg.gunHp));
    this.hull = cfg.hull;
    this.flares = cfg.flares;
  }

  /** The mission brings a gun into action. */
  activate(id: string): void {
    const g = this.guns.find((x) => x.id === id);
    if (g) g.active = true;
  }

  gun(id: string): AAGun | undefined {
    return this.guns.find((g) => g.id === id);
  }

  get engineLost(): boolean {
    return this.engineOut;
  }

  /** Every shooter firing right now (guns and trucks). */
  *shooters(): Generator<AAShooter> {
    for (const g of this.guns) if (g.firing) yield g;
    for (const t of this.trucks()) if (t.firing) yield t;
  }

  /**
   * One fixed step: AA within reach of the orbit fires bursts (tracers + a chance to hit that
   * grows the longer it tracks you and the closer it is), missiles fly and hit or get decoyed,
   * destroyed guns are reported.
   */
  update(dt: number, plane: PlaneState | null, tracers: TracerSink): void {
    for (const g of this.guns) {
      g.sinceShot += dt;
      if (!g.alive) g.deadFor += dt;
      if (!g.alive && g.active) {
        g.active = false;
        this.bus.emit('aaDestroyed', { id: g.id });
      }
    }
    if (plane) {
      for (const g of this.guns) {
        if (!g.firing) continue;
        if (this.engage(g.id, g.position, g, plane, dt, tracers)) g.sinceShot = 0;
      }
      for (const t of this.trucks()) {
        if (!t.firing) continue;
        let s = this.truckState.get(t.id);
        if (!s) this.truckState.set(t.id, (s = { tracking: 0, timer: 0, engaged: false }));
        this.engage(t.id, t.position, s, plane, dt, tracers);
      }
    }
    this.updateMissiles(dt, plane);
  }

  /** One shooter's turn: returns true if it fired a burst this step. */
  private engage(
    id: string,
    pos: Vector3,
    s: ShooterState,
    plane: PlaneState,
    dt: number,
    tracers: TracerSink,
  ): boolean {
    const c = this.cfg;
    const inReach = Math.hypot(pos.x - plane.center.x, pos.z - plane.center.z) <= c.engageRadius;
    if (!inReach) {
      s.tracking = 0;
      s.engaged = false;
      return false;
    }
    if (!s.engaged) {
      s.engaged = true;
      this.bus.emit('aaFiring', { id, x: pos.x, z: pos.z });
    }
    s.tracking += dt;
    s.timer -= dt;
    if (s.timer > 0) return false;
    s.timer = range(this.rng, c.burstMin, c.burstMax);

    const slant = pos.distanceTo(plane.position);
    const chance = hitChance(slant, s.tracking, c);
    const hit = this.rng() < chance;
    // Tracers: a stream climbing at the aircraft, wide when missing, tight when on target.
    const miss = hit ? 8 : range(this.rng, 30, 90);
    const a = range(this.rng, 0, Math.PI * 2);
    this.aim.set(
      plane.position.x + Math.cos(a) * miss,
      plane.position.y + range(this.rng, -20, 20),
      plane.position.z + Math.sin(a) * miss,
    );
    tracers(pos, this.aim, c.burstTracers);
    if (hit) this.damageHull(c.hitDamage, 'aa');
    return true;
  }

  /** A MANPADS team fires at the gunship from `from`. */
  launch(from: Vector3): void {
    this.missiles.push({
      position: from.clone(),
      from: from.clone(),
      age: 0,
      decoyed: false,
      done: false,
    });
    this.bus.emit('missileLaunch', { x: from.x, z: from.z });
  }

  /** Missiles inbound now (not done, not decoyed). */
  get inbound(): Missile[] {
    return this.missiles.filter((m) => !m.done && !m.decoyed);
  }

  /** Seconds until missile `m` reaches the plane at the current closing speed. */
  timeToImpact(m: Missile, plane: PlaneState): number {
    return m.position.distanceTo(plane.position) / this.cfg.missileSpeed;
  }

  /**
   * X: drop flares. Every inbound missile at least `flareLead` seconds out is decoyed; one that
   * is closer still hits. With nothing inbound the flares are wasted.
   */
  dropFlares(plane: PlaneState | null): 'decoyed' | 'late' | 'wasted' | 'empty' {
    let result: 'decoyed' | 'late' | 'wasted' | 'empty';
    if (this.flares <= 0) result = 'empty';
    else {
      this.flares--;
      const live = this.inbound;
      if (live.length === 0 || !plane) result = 'wasted';
      else {
        let decoyed = 0;
        for (const m of live) {
          if (this.timeToImpact(m, plane) >= this.cfg.flareLead) {
            m.decoyed = true;
            decoyed++;
          }
        }
        result = decoyed > 0 ? 'decoyed' : 'late';
        if (decoyed > 0) this.bus.emit('missileDefeated', {});
      }
    }
    this.bus.emit('flares', { result, left: this.flares });
    return result;
  }

  /** How many shooters cover a strike on (x, z): 0 = clear, ≥ abortAt = too hot. */
  strikeThreat(x: number, z: number): number {
    let n = 0;
    for (const s of this.shooters()) {
      if (Math.hypot(s.position.x - x, s.position.z - z) <= this.cfg.strikeCover) n++;
    }
    return n;
  }

  private updateMissiles(dt: number, plane: PlaneState | null): void {
    const c = this.cfg;
    for (const m of this.missiles) {
      if (m.done) continue;
      m.age += dt;
      if (m.decoyed) {
        // Chases the flares: drifts off and burns out.
        m.position.y += c.missileSpeed * 0.4 * dt;
        if (m.age > 6) m.done = true;
        continue;
      }
      if (!plane) {
        if (m.age > 10) m.done = true;
        continue;
      }
      this.dir.subVectors(plane.position, m.position);
      const d = this.dir.length();
      const step = c.missileSpeed * dt;
      if (d <= step + 5) {
        m.done = true;
        this.damageHull(c.missileDamage, 'missile');
        continue;
      }
      m.position.addScaledVector(this.dir, step / d);
    }
    // Forget old missiles.
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      if (this.missiles[i].done) this.missiles.splice(i, 1);
    }
  }

  private damageHull(amount: number, by: 'aa' | 'missile'): void {
    if (this.lost) return;
    this.hull = Math.max(0, this.hull - amount);
    this.bus.emit('hullHit', { damage: amount, hull: this.hull, by });
    if (!this.engineOut && this.hull < this.cfg.engineOutAt) {
      this.engineOut = true;
      this.bus.emit('engineLost', {});
    }
    if (this.hull <= 0) {
      this.lost = true;
      this.bus.emit('missionFailed', { reason: 'gunship_lost' });
    }
  }
}

/** Chance one AA burst hits: closer and longer-tracked is deadlier (pure, for tests). */
export function hitChance(
  slant: number,
  tracking: number,
  c: AirDefenseConfig = CONFIG.airDefense,
): number {
  const t = Math.min(1, Math.max(0, (slant - c.nearSlant) / (c.farSlant - c.nearSlant)));
  const base = c.hitNear + (c.hitFar - c.hitNear) * t;
  return base * Math.min(1, tracking / c.trackSeconds);
}
