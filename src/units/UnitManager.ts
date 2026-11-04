import { Vector3 } from 'three';
import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { range, type Rng } from '../core/rng';
import type { Target } from '../combat/Explosions';
import { Infantry } from './Infantry';
import { SpatialGrid } from './SpatialGrid';
import { Squad, type RoutePoint } from './Squad';
import { TeamHealth } from './TeamHealth';
import { INFANTRY, type InfantryDef } from './unitDefs';

/** A short visual tracer flying between two soldiers (no damage of its own). */
export interface GroundTracer {
  readonly from: Vector3;
  readonly to: Vector3;
  age: number;
  duration: number;
  active: boolean;
  side: 'enemy' | 'friendly';
}

/**
 * Fraction of an enemy's DPS that hurts the team at distance `d` (PLAN.md §7.8): best up
 * close, worst at the edge of its range.
 */
export function enemyAccuracy(
  d: number,
  maxRange: number,
  cfg: { readonly accuracyNear: number; readonly accuracyFar: number } = CONFIG.enemyFire,
): number {
  const t = Math.min(1, Math.max(0, d / maxRange));
  return cfg.accuracyNear + (cfg.accuracyFar - cfg.accuracyNear) * t;
}

type Numeric<T> = { readonly [K in keyof T]: number };

/** The config slices the unit simulation reads (numbers widened so tests can override them). */
export interface UnitsConfig {
  readonly infantry: Numeric<typeof CONFIG.infantry>;
  readonly enemyFire: Numeric<typeof CONFIG.enemyFire>;
  readonly ridgeback: Numeric<typeof CONFIG.ridgeback>;
  readonly groundFire: Numeric<typeof CONFIG.groundFire>;
}

/** Spatial grid cell size (PLAN.md §7.11: 20 m). */
const CELL = 20;

/**
 * Owns every soldier on both sides (PLAN.md §7.8–7.9, §6 step 7): enemies advance on Ridgeback
 * and fire at it (draining team health), Ridgeback walks its route in formation and shoots back
 * while holding, and a spatial grid serves blast, separation and nearest-target queries.
 * Pure logic: rendering lives in `InfantryRenderer`.
 */
export class UnitManager {
  readonly enemies: Infantry[] = [];
  readonly friendlies: Infantry[] = [];
  readonly team: TeamHealth;
  readonly squad: Squad;
  readonly tracers: GroundTracer[] = [];
  /** Non-infantry targets (vehicles) that blasts can hit. */
  private readonly others: Target[] = [];
  private readonly grid = new SpatialGrid<Target>(CELL);
  /** Result buffers: blast queries and separation must not share one. */
  private readonly scratch: Target[] = [];
  private readonly neighbors: Target[] = [];
  private readonly slotPos = new Vector3();
  private readonly aimPos = new Vector3();
  private nextId = 0;
  private nextTracer = 0;
  private failed = false;
  time = 0;
  /** Called for every visible burst (Game hooks the muzzle-flash effect in). */
  onMuzzleFlash: (at: Vector3) => void = () => {};

  constructor(
    private readonly groundAt: (x: number, z: number) => number,
    private readonly bus: EventBus<GameEvents>,
    private readonly rng: Rng,
    route: readonly RoutePoint[],
    private readonly cfg: UnitsConfig = CONFIG,
  ) {
    this.team = new TeamHealth(cfg.ridgeback);
    this.squad = new Squad(route, cfg.ridgeback);
    for (let i = 0; i < 4; i++) {
      const f = new Infantry(this.nextId++, 'friendly', INFANTRY.ridgeback, groundAt, cfg.infantry);
      this.squad.slot(i, this.slotPos);
      f.spawn(INFANTRY.ridgeback, this.slotPos.x, this.slotPos.z, this.squad.heading);
      f.fireTimer = range(rng, 0, cfg.ridgeback.fireIntervalMax);
      this.friendlies.push(f);
    }
    for (let i = 0; i < cfg.groundFire.maxTracers; i++) {
      this.tracers.push({
        from: new Vector3(),
        to: new Vector3(),
        age: 0,
        duration: 0,
        active: false,
        side: 'enemy',
      });
    }
    this.rebuildGrid();
  }

  /** Adds a non-infantry target (vehicle) that blasts and the grid should know about. */
  addTarget(t: Target): void {
    this.others.push(t);
  }

  get aliveEnemies(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** Squad center (the leader's slot), e.g. for the orbit to follow. */
  get teamPosition(): Vector3 {
    return this.squad.anchor;
  }

  /**
   * Spawns an enemy at (x, z). Reuses the longest-dead body once the unit budget is full;
   * returns null if every slot holds a living soldier.
   */
  spawnEnemy(def: InfantryDef, x: number, z: number): Infantry | null {
    let u: Infantry | null = null;
    if (this.enemies.length + this.friendlies.length < this.cfg.infantry.maxUnits) {
      u = new Infantry(this.nextId++, 'enemy', def, this.groundAt, this.cfg.infantry);
      this.enemies.push(u);
    } else {
      for (const e of this.enemies) {
        if (!e.alive && e.state === 'dead' && (!u || e.sinceDeath > u.sinceDeath)) u = e;
      }
      if (!u) return null;
    }
    const f = this.friendlies[0];
    u.spawn(def, x, z, Math.atan2(f.position.x - x, f.position.z - z));
    const ef = this.cfg.enemyFire;
    u.standoff = range(this.rng, ef.standoffMin, ef.standoffMax);
    u.thinkTimer = range(this.rng, 0, this.cfg.infantry.thinkInterval); // staggered thinking
    u.fireTimer = range(this.rng, 0, ef.burstMax);
    return u;
  }

  /** Living targets within `radius` (ground distance) of `center`, for blasts. */
  targetsNear(center: Vector3, radius: number): Target[] {
    this.scratch.length = 0;
    return this.grid.queryRadius(center.x, center.z, radius, this.scratch);
  }

  update(dt: number): void {
    this.time += dt;
    this.squad.update(dt);
    this.rebuildGrid();
    for (let i = 0; i < this.friendlies.length; i++) this.updateFriendly(this.friendlies[i], i, dt);
    for (const e of this.enemies) if (e.alive) this.updateEnemy(e, dt);
    for (const f of this.friendlies) f.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.updateTracers(dt);

    this.team.update(dt);
    if (this.team.overrun && !this.failed) {
      this.failed = true;
      this.bus.emit('missionFailed', { reason: 'team_overrun' });
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const f of this.friendlies) if (f.alive) this.grid.insert(f);
    for (const e of this.enemies) if (e.alive) this.grid.insert(e);
    for (const o of this.others) if (o.alive) this.grid.insert(o);
  }

  /** Ridgeback member: keep its formation slot; while holding, shoot the nearest enemy. */
  private updateFriendly(f: Infantry, index: number, dt: number): void {
    if (!f.alive) {
      f.velocity.set(0, 0, 0);
      return;
    }
    const slot = this.squad.slot(index, this.slotPos);
    this.arrive(f, slot.x, slot.z, f.def.speed);

    const rb = this.cfg.ridgeback;
    f.fireTimer -= dt;
    if (this.squad.moving || f.fireTimer > 0) return;
    f.fireTimer = range(this.rng, rb.fireIntervalMin, rb.fireIntervalMax);
    const target = this.grid.nearest(
      f.position.x,
      f.position.z,
      rb.fireRange,
      (t) => t.side === 'enemy' && t.kind === 'infantry' && t.alive,
    ) as Infantry | null;
    if (!target) return;
    f.turnToward(Math.atan2(target.position.x - f.position.x, target.position.z - f.position.z), 1);
    this.burst(f, target, 'friendly');
    if (this.rng() < rb.hitChance) {
      target.takeDamage(target.def.hp, 'team', f.position);
      if (!target.alive) this.bus.emit('unitKilled', { kind: 'infantry', by: 'team' });
    }
  }

  /** Enemy (PLAN.md §7.8, simple M4 version): advance on the nearest friendly, stop and fire. */
  private updateEnemy(e: Infantry, dt: number): void {
    const inf = this.cfg.infantry;
    e.thinkTimer -= dt;
    if (e.thinkTimer <= 0 || !e.target) {
      e.thinkTimer += inf.thinkInterval;
      e.target = this.nearestFriendly(e);
    }
    const t = e.target;
    if (!t) {
      e.velocity.set(0, 0, 0);
      return;
    }
    const dx = t.position.x - e.position.x;
    const dz = t.position.z - e.position.z;
    const dist = Math.hypot(dx, dz);
    const inRange = dist <= e.def.range;
    // Start firing inside the standoff distance; keep firing until the target leaves range.
    if (dist <= e.def.range * e.standoff || (e.state === 'firing' && inRange)) {
      e.state = 'firing';
      e.velocity.set(0, 0, 0);
      e.turnToward(Math.atan2(dx, dz), dt);
      this.team.damage(e.def.dps * enemyAccuracy(dist, e.def.range, this.cfg.enemyFire) * dt);
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        const ef = this.cfg.enemyFire;
        e.fireTimer = range(this.rng, ef.burstMin, ef.burstMax);
        this.burst(e, t, 'enemy');
      }
    } else {
      e.state = 'moving';
      e.velocity.set((dx / dist) * e.def.speed, 0, (dz / dist) * e.def.speed);
    }
    this.separate(e);
  }

  private nearestFriendly(e: Infantry): Infantry | null {
    let best: Infantry | null = null;
    let bestD = Infinity;
    for (const f of this.friendlies) {
      if (!f.alive) continue;
      const d = (f.position.x - e.position.x) ** 2 + (f.position.z - e.position.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /** Seek a point and slow down when close (arrive steering), plus separation. */
  private arrive(u: Infantry, x: number, z: number, maxSpeed: number): void {
    const dx = x - u.position.x;
    const dz = z - u.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      u.velocity.set(0, 0, 0);
    } else {
      const speed = Math.min(maxSpeed, dist * 1.5);
      u.velocity.set((dx / dist) * speed, 0, (dz / dist) * speed);
    }
    this.separate(u);
  }

  /** Pushes a soldier away from soldiers closer than the separation distance (via the grid). */
  private separate(u: Infantry): void {
    const { separation, separationStrength } = this.cfg.infantry;
    this.neighbors.length = 0;
    this.grid.queryRadius(u.position.x, u.position.z, separation, this.neighbors);
    for (const o of this.neighbors) {
      if (o === u || o.kind !== 'infantry') continue;
      const dx = u.position.x - o.position.x;
      const dz = u.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      // Exactly on top of each other: push along a direction derived from the id.
      const nx = d > 1e-4 ? dx / d : Math.cos(u.id);
      const nz = d > 1e-4 ? dz / d : Math.sin(u.id);
      const push = separationStrength * (1 - d / separation);
      u.velocity.x += nx * push;
      u.velocity.z += nz * push;
    }
  }

  /** A visible burst: muzzle flash plus a few tracers that scatter around the target. */
  private burst(from: Infantry, to: Infantry, side: 'enemy' | 'friendly'): void {
    this.onMuzzleFlash(from.position);
    const g = this.cfg.groundFire;
    for (let k = 0; k < from.def.burst; k++) {
      const tr = this.tracers[this.nextTracer];
      this.nextTracer = (this.nextTracer + 1) % this.tracers.length;
      tr.from.copy(from.position);
      tr.from.y += 0.3;
      this.aimPos.set(
        to.position.x + range(this.rng, -3, 3),
        to.position.y + range(this.rng, -1, 1),
        to.position.z + range(this.rng, -3, 3),
      );
      tr.to.copy(this.aimPos);
      tr.duration = tr.from.distanceTo(tr.to) / g.tracerSpeed;
      tr.age = -k * 0.07; // rounds leave the barrel one after another
      tr.active = true;
      tr.side = side;
    }
  }

  private updateTracers(dt: number): void {
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.age += dt;
      if (tr.age >= tr.duration) tr.active = false;
    }
  }
}
